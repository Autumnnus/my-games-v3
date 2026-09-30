import type { LanguageModel } from "ai";
import { z } from "zod";
import { aiConfig, aiProviderKeys } from "../config";
import { AppError } from "../errors";
import { log, logger } from "../log";
import { readSetting, SETTING_KEYS, writeSetting } from "../settings";
import { KeyPool } from "./key-pool";
import { createPooledModel, type PoolTarget } from "./pooled-model";
import { type ModelPurpose, providerAdapter } from "./providers";

export type ResolvedModel = { model: LanguageModel; id: string };

/** Sağlayıcı başına tek havuz: aynı anahtarın durumu sohbet ve kısa işler arasında paylaşılır. */
const pools = new Map<string, { signature: string; pool: KeyPool }>();
const resolved = new Map<ModelPurpose, { signature: string; value: ResolvedModel }>();

function poolFor(provider: string) {
  const keys = aiProviderKeys(provider);
  const strategy = aiConfig()?.keyStrategy ?? "round_robin";
  const signature = `${strategy}|${keys.join(",")}`;
  const existing = pools.get(provider);
  // Anahtarlar değişmediyse durum (dinlenen anahtarlar, sayaçlar) korunur.
  if (existing?.signature === signature) return existing.pool;
  const pool = new KeyPool(provider, keys, { strategy });
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
  const adapter = config ? providerAdapter(config.provider) : null;
  return {
    selected,
    env: {
      model: config?.model ?? null,
      fallbackModels: config?.fallbackModels ?? [],
      lightModel: config?.lightModel ?? null,
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
  if (!config) return [];
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

function buildChain(purpose: ModelPurpose): PoolTarget[] {
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
    const pool = poolFor(ref.provider);
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
 * Amaca uygun model. Sağlayıcı değiştirmek, anahtar eklemek ya da yedek model tanımlamak yalnızca ortam
 * değişkenleriyle olur; çağıranlar hiçbir şey bilmez. Testler kendi mock modelini doğrudan verir.
 */
export async function resolveModel(purpose: ModelPurpose = "chat"): Promise<ResolvedModel> {
  await refreshSelection();
  const config = aiConfig();
  if (!config) throw new AppError("unavailable", "AI yapılandırılmamış");
  if (config.provider === "mock") {
    const { createDevModel } = await import("./dev-model");
    return { model: await createDevModel(purpose), id: "mock" };
  }

  const refs = chainRefs(purpose);
  const signature = `${refs.map((ref) => `${ref.provider}:${ref.model}`).join(">")}|${refs
    .map((ref) => aiProviderKeys(ref.provider).length)
    .join(",")}`;
  const cached = resolved.get(purpose);
  if (cached && cached.signature === signature) return cached.value;

  const chain = buildChain(purpose);
  if (chain.length === 0) throw new AppError("unavailable", "AI modeli yapılandırılamadı");
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
  resolved.set(purpose, { signature, value });
  return value;
}

/** Yönetim ekranı: model zincirleri ve her anahtarın durumu (anahtarlar maskeli). */
export async function aiStatus() {
  await refreshSelection();
  const config = aiConfig();
  if (!config) return { enabled: false as const };
  const providers = new Set([config.provider, ...chainRefs("chat").map((ref) => ref.provider)]);
  return {
    enabled: true as const,
    provider: config.provider,
    strategy: config.keyStrategy,
    chains: {
      chat: chainRefs("chat").map((ref) => `${ref.provider}:${ref.model}`),
      light: chainRefs("light").map((ref) => `${ref.provider}:${ref.model}`),
    },
    pools:
      config.provider === "mock"
        ? []
        : [...providers].map((provider) => ({ provider, keys: poolFor(provider).snapshot() })),
  };
}
