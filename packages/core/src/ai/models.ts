import type { LanguageModel } from "ai";
import { z } from "zod";
import { aiConfig } from "../config";
import { AppError } from "../errors";
import { log, logger } from "../log";
import { readSetting, SETTING_KEYS, writeSetting } from "../settings";
import { KeyPool } from "./key-pool";
import { keyStrategy, providerKeys } from "./keys";
import { createPooledModel, type PoolTarget } from "./pooled-model";
import { type ModelPurpose, providerAdapter } from "./providers";

export type ResolvedModel = { model: LanguageModel; id: string };

/** Sağlayıcı başına tek havuz: aynı anahtarın durumu sohbet ve kısa işler arasında paylaşılır. */
const pools = new Map<string, { signature: string; pool: KeyPool }>();
const resolved = new Map<
  ModelPurpose,
  { signature: string; pools: KeyPool[]; value: ResolvedModel }
>();

/**
 * Sağlayıcının havuzu. Anahtar listesi ya da strateji değişince (panelden) yeni havuz kurulur; aynı anahtarların
 * durumu (dinlenen anahtarlar, sayaçlar) eskisinden taşınır.
 */
async function poolFor(provider: string) {
  const keys = await providerKeys(provider);
  const { value: strategy } = await keyStrategy();
  const signature = `${strategy}|${keys.map((entry) => `${entry.ref}=${entry.label}:${entry.key}`).join(",")}`;
  const existing = pools.get(provider);
  if (existing?.signature === signature) return existing.pool;
  const pool = new KeyPool(provider, keys, { strategy });
  if (existing) pool.inherit(existing.pool);
  pools.set(provider, { signature, pool });
  return pool;
}

/** Yönetim panelinden seçilen modeller. Boş alan ortam değişkenine (o da yoksa sağlayıcı varsayılanına) düşer. */
export const modelRefPattern = /^([a-z0-9-]+:)?[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
export const modelSettingsSchema = z.object({
  model: z.string().regex(modelRefPattern).nullable(),
  fallbackModels: z.array(z.string().regex(modelRefPattern)).max(5),
  lightModel: z.string().regex(modelRefPattern).nullable(),
});
export type ModelSettings = z.infer<typeof modelSettingsSchema>;

let selected: ModelSettings | null = null;

/** Seçimi okur (ayarlar süreç başına 15 sn önbellekli); zincir imzası değişince havuz modeli yeniden kurulur. */
async function refreshSelection() {
  const parsed = modelSettingsSchema.safeParse(await readSetting(SETTING_KEYS.aiModels));
  selected = parsed.success ? parsed.data : null;
}

export async function modelSettings() {
  await refreshSelection();
  const config = aiConfig();
  const adapter = providerAdapter(config.provider);
  return {
    selected,
    env: {
      model: config.model ?? null,
      fallbackModels: config.fallbackModels,
      lightModel: config.lightModel ?? null,
    },
    defaults: { chat: adapter?.defaults.chat ?? null, light: adapter?.defaults.light ?? null },
  };
}

export async function setModelSettings(value: ModelSettings | null) {
  await writeSetting(SETTING_KEYS.aiModels, value);
  return modelSettings();
}

/** `google:gemini-3.5-flash` ya da `gemini-3.5-flash` (varsayılan sağlayıcı). */
function parseRef(ref: string, fallbackProvider: string) {
  const index = ref.indexOf(":");
  return index > 0
    ? { provider: ref.slice(0, index).toLowerCase(), model: ref.slice(index + 1) }
    : { provider: fallbackProvider, model: ref };
}

/**
 * Amaca göre model zinciri:
 * - `chat`: `AI_MODEL` → `AI_FALLBACK_MODELS`.
 * - `light`: `AI_LIGHT_MODEL` → sohbet zinciri (hafif model doluysa kısa işler yine de yapılsın).
 */
function chainRefs(purpose: ModelPurpose) {
  const config = aiConfig();
  const adapter = providerAdapter(config.provider);
  if (!adapter) return [];
  const model = selected?.model ?? config.model ?? adapter.defaults.chat;
  const fallbacks = selected ? selected.fallbackModels : config.fallbackModels;
  const light = selected?.lightModel ?? config.lightModel ?? adapter.defaults.light;
  const chat = [model, ...fallbacks];
  const refs = purpose === "chat" ? chat : [light, ...chat];
  const seen = new Set<string>();
  return refs
    .map((ref) => parseRef(ref, config.provider))
    .filter((ref) => {
      const key = `${ref.provider}:${ref.model}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function buildChain(purpose: ModelPurpose): Promise<PoolTarget[]> {
  const targets: PoolTarget[] = [];
  for (const ref of chainRefs(purpose)) {
    const adapter = providerAdapter(ref.provider);
    if (!adapter) {
      logger.warn(
        "ai",
        "unknown_provider",
        `bilinmeyen sağlayıcı: ${ref.provider} (${ref.model} atlandı)`,
      );
      continue;
    }
    const pool = await poolFor(ref.provider);
    if (pool.size === 0) {
      logger.warn("ai", "no_keys", `${ref.provider} için anahtar yok (${ref.model} atlandı)`);
      continue;
    }
    targets.push({
      adapter,
      pool,
      modelId: ref.model,
      providerOptions: adapter.providerOptions?.(purpose, ref.model),
    });
  }
  return targets;
}

/**
 * Amaca uygun model. Sağlayıcı ortam değişkeniyle; anahtarlar, strateji ve model zinciri yönetim panelinden
 * (yoksa ortam değişkenlerinden) gelir; çağıranlar hiçbir şey bilmez. Testler kendi mock modelini doğrudan verir.
 */
export async function resolveModel(purpose: ModelPurpose = "chat"): Promise<ResolvedModel> {
  await refreshSelection();
  const config = aiConfig();
  if (config.provider === "mock") {
    const { createDevModel } = await import("./dev-model");
    return { model: await createDevModel(purpose), id: "mock" };
  }

  // Havuzlar her çağrıda tazelenir (önbellekli); zincir yalnızca model listesi ya da havuz nesnesi değişince
  // yeniden kurulur.
  const chain = await buildChain(purpose);
  if (chain.length === 0) throw new AppError("unavailable", "AI yapılandırılmamış");
  const signature = chain.map((target) => `${target.adapter.id}:${target.modelId}`).join(">");
  const cached = resolved.get(purpose);
  if (
    cached &&
    cached.signature === signature &&
    cached.pools.length === chain.length &&
    cached.pools.every((pool, index) => pool === chain[index]?.pool)
  ) {
    return cached.value;
  }
  const value = {
    model: createPooledModel(chain, {
      onFailure: ({ provider, model, key, verdict, waitMs }) => {
        const wait =
          waitMs >= 60_000
            ? `${Math.round(waitMs / 60_000)} dk`
            : `${Math.round(waitMs / 1000)} sn`;
        const message =
          `${provider} ${key} ${model}: ${verdict.kind}${verdict.daily ? " (günlük kota)" : ""}` +
          `${waitMs > 0 ? `, ${wait} dinlenecek` : ""}`;
        // Sınır dolması beklenen bir durum (uyarı); kimlik ve sağlayıcı hataları incelenmeli.
        log({
          level: verdict.kind === "rate_limit" ? "warn" : "error",
          source: "ai",
          event: `key_${verdict.kind}`,
          message,
          context: {
            provider,
            model,
            key,
            waitMs,
            daily: verdict.daily ?? false,
            detail: verdict.message?.slice(0, 300),
          },
        });
      },
    }),
    id: chain.map((target) => target.modelId).join(" → "),
  };
  resolved.set(purpose, { signature, pools: chain.map((target) => target.pool), value });
  return value;
}

/**
 * Yönetim ekranı: model zincirleri, strateji ve her anahtarın canlı durumu (maskeli). Havuz süreç başına
 * tutulduğu için bu, app sürecinin görüşüdür.
 */
export async function aiStatus() {
  await refreshSelection();
  const config = aiConfig();
  const strategy = await keyStrategy();
  const providers = new Set([config.provider, ...chainRefs("chat").map((ref) => ref.provider)]);
  const pools =
    config.provider === "mock"
      ? []
      : await Promise.all(
          [...providers]
            .filter((provider) => providerAdapter(provider))
            .map(async (provider) => ({ provider, keys: (await poolFor(provider)).snapshot() })),
        );
  return {
    enabled: config.provider === "mock" || pools.some((pool) => pool.keys.length > 0),
    provider: config.provider,
    strategy,
    chains: {
      chat: chainRefs("chat").map((ref) => `${ref.provider}:${ref.model}`),
      light: chainRefs("light").map((ref) => `${ref.provider}:${ref.model}`),
    },
    pools,
  };
}
