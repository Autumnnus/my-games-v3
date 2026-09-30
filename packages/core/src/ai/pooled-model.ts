import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4ProviderMetadata,
  SharedV4ProviderOptions,
} from "@ai-sdk/provider";
import type { FailureVerdict, KeyPool } from "./key-pool";
import { classifyError, type ProviderAdapter } from "./providers";

/** Zincirdeki bütün modellerin bütün anahtarları o an dolu/bozuk. */
export class AiUnavailableError extends Error {
  readonly retryAt: Date | null;
  readonly reason: FailureVerdict["kind"] | null;

  constructor(options: {
    retryAt: Date | null;
    reason: FailureVerdict["kind"] | null;
    cause?: unknown;
  }) {
    super("AI sağlayıcısının bütün anahtarları şu an kullanılamıyor", { cause: options.cause });
    this.name = "AiUnavailableError";
    this.retryAt = options.retryAt;
    this.reason = options.reason;
  }
}

export type PoolTarget = {
  adapter: ProviderAdapter;
  pool: KeyPool;
  modelId: string;
  /** Bu modele özel sağlayıcı ayarları (ör. düşünme seviyesi); çağrının kendi ayarları önceliklidir. */
  providerOptions?: SharedV4ProviderOptions;
};

function withOptions(call: LanguageModelV4CallOptions, target: PoolTarget) {
  if (!target.providerOptions) return call;
  const merged: SharedV4ProviderOptions = { ...target.providerOptions };
  for (const [provider, values] of Object.entries(call.providerOptions ?? {})) {
    merged[provider] = { ...merged[provider], ...values };
  }
  return { ...call, providerOptions: merged };
}

export type PoolEvent = {
  provider: string;
  model: string;
  key: string;
  verdict: FailureVerdict;
  /** Anahtarın bu modelde dinleneceği süre (ms). */
  waitMs: number;
};

/** Tek bir sağlam anahtarlı havuzda geçici hatalar için kısa bir bekleyip yeniden deneme sınırı. */
const SHORT_WAIT_MS = 3000;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function isAbort(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (error instanceof Error && error.name === "AbortError");
}

/**
 * Akışın ilk anlamlı parçası bir hataysa onu fırlatır (ör. sağlayıcı 200 dönüp akışın başında kota hatası
 * yollarsa); böylece havuz bir sonraki anahtara geçebilir. Akış başladıktan sonraki hatalar olduğu gibi
 * akar: kısmen gönderilmiş bir cevabı başka anahtarla tekrarlamak kullanıcıya iki cevap gösterir.
 */
async function guardStreamStart(
  result: LanguageModelV4StreamResult,
): Promise<LanguageModelV4StreamResult> {
  const reader = result.stream.getReader();
  const buffered: LanguageModelV4StreamPart[] = [];
  let finished = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      finished = true;
      break;
    }
    if (value.type === "error") {
      await reader.cancel().catch(() => {});
      throw value.error;
    }
    buffered.push(value);
    if (value.type !== "stream-start" && value.type !== "response-metadata") break;
  }
  const stream = new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      for (const part of buffered) controller.enqueue(part);
      if (finished) controller.close();
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { ...result, stream };
}

/** İzleme için: cevabı veren anahtar (maskeli) ve bu çağrıda önce başarısız olanlar. */
export type PoolTrace = {
  key: string;
  failovers: Array<{ model: string; key: string; kind: string; waitMs: number }>;
};

/**
 * İz bilgisi sağlayıcı meta verisine (`providerMetadata.pool`) eklenir; AI SDK bunu adım sonucunda
 * (`step.providerMetadata`) verir. Adımın bitiş parçası istemciye gönderilmez, anahtar etiketi sızmaz.
 */
function withPoolMetadata<T extends { providerMetadata?: SharedV4ProviderMetadata }>(
  value: T,
  trace: PoolTrace,
): T {
  return {
    ...value,
    providerMetadata: { ...value.providerMetadata, pool: { ...trace } } as SharedV4ProviderMetadata,
  };
}

function tagStream(result: LanguageModelV4StreamResult, trace: PoolTrace) {
  const tagged = result.stream.pipeThrough(
    new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
      transform(part, controller) {
        controller.enqueue(part.type === "finish" ? withPoolMetadata(part, trace) : part);
      },
    }),
  );
  return { ...result, stream: tagged };
}

/**
 * Anahtar havuzu ve yedek model zinciri üzerinde çalışan model. AI SDK açısından sıradan bir
 * `LanguageModelV4`'tür; agent, `streamText`, yapılandırılmış çıktı hiçbir fark görmez.
 *
 * Her çağrıda: zincirdeki ilk modelin sağlam anahtarlarını dener; 429/kimlik hatası alan anahtar dinlenir
 * ve sıradakine geçilir. Modelin bütün anahtarları doluysa sıradaki modele (yedek) geçilir. Hiçbiri
 * olmazsa `AiUnavailableError` (en erken ne zaman yeniden denenebileceğiyle) fırlatılır.
 */
export function createPooledModel(
  chain: PoolTarget[],
  options: { onFailure?: (event: PoolEvent) => void } = {},
): LanguageModelV4 {
  const [primary] = chain;
  if (!primary) throw new Error("Model zinciri boş");
  const instances = new Map<string, LanguageModelV4>();

  function instance(target: PoolTarget, index: number, key: string) {
    const cacheKey = `${target.adapter.id}|${index}|${target.modelId}`;
    let model = instances.get(cacheKey);
    if (!model) {
      model = target.adapter.createModel(key, target.modelId);
      instances.set(cacheKey, model);
    }
    return model;
  }

  async function run<T>(
    call: LanguageModelV4CallOptions,
    invoke: (model: LanguageModelV4, call: LanguageModelV4CallOptions) => PromiseLike<T>,
  ): Promise<{ result: T; trace: PoolTrace }> {
    let lastError: unknown;
    let lastVerdict: FailureVerdict | null = null;
    const failovers: PoolTrace["failovers"] = [];

    for (const target of chain) {
      // Sınır/kimlik hatası veren anahtar bu istekte bir daha denenmez; geçici hatada kısa bir bekleme
      // sonrası aynı anahtar yeniden denenebilir.
      const exhausted = new Set<number>();
      const attempts = target.pool.size + 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        let slot = target.pool.acquire(target.modelId, exhausted);
        if (!slot && lastVerdict?.kind === "server") {
          const next = target.pool.nextAvailableAt(target.modelId);
          const wait = next === null ? Number.POSITIVE_INFINITY : next - Date.now();
          if (wait <= SHORT_WAIT_MS) {
            await sleep(Math.max(wait, 0), call.abortSignal);
            slot = target.pool.acquire(target.modelId, exhausted);
          }
        }
        if (!slot) break;

        try {
          const result = await invoke(
            instance(target, slot.index, slot.key),
            withOptions(call, target),
          );
          target.pool.succeed(slot.index, target.modelId);
          return { result, trace: { key: slot.label, failovers } };
        } catch (error) {
          if (isAbort(error, call.abortSignal)) throw error;
          const verdict = classifyError(target.adapter, error);
          const waitMs = target.pool.fail(slot.index, target.modelId, verdict);
          options.onFailure?.({
            provider: target.adapter.id,
            model: target.modelId,
            key: slot.label,
            verdict,
            waitMs,
          });
          failovers.push({ model: target.modelId, key: slot.label, kind: verdict.kind, waitMs });
          lastError = error;
          lastVerdict = verdict;
          if (verdict.kind === "fatal") throw error;
          if (verdict.kind !== "server") exhausted.add(slot.index);
        }
      }
    }

    const retryAt = chain
      .map((target) => target.pool.nextAvailableAt(target.modelId))
      .filter((value): value is number => value !== null)
      .reduce<number | null>((min, value) => (min === null || value < min ? value : min), null);
    throw new AiUnavailableError({
      retryAt: retryAt === null ? null : new Date(retryAt),
      reason: lastVerdict?.kind ?? null,
      cause: lastError,
    });
  }

  return {
    specificationVersion: "v4",
    provider: primary.adapter.id,
    modelId: primary.modelId,
    // Desteklenen URL'ler anahtara bağlı değil; ilk modelin bildirdiği kullanılır.
    get supportedUrls() {
      const key = primary.pool.peek();
      return key ? instance(primary, key.index, key.key).supportedUrls : {};
    },
    doGenerate: async (call) => {
      const { result, trace } = await run(call, (model, options) => model.doGenerate(options));
      return withPoolMetadata(result, trace);
    },
    doStream: async (call) => {
      const { result, trace } = await run(call, async (model, options) =>
        guardStreamStart(await model.doStream(options)),
      );
      return tagStream(result, trace);
    },
  };
}
