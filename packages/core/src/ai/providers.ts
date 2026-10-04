import { createGoogle } from "@ai-sdk/google";
import { APICallError, type LanguageModelV4, type SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { FailureVerdict } from "./key-pool";

export type ModelPurpose = "chat" | "light";

/**
 * Bir AI SDK sağlayıcısını havuza bağlayan adaptör. Yeni sağlayıcı eklemek: paketini kur, burada bir
 * adaptör yaz, `AI_PROVIDER` / `<ÖNEK>_API_KEYS` ile aç. Havuz, yedek model zinciri ve agent değişmez.
 */
export type ProviderAdapter = {
  id: string;
  /** `AI_MODEL` / `AI_LIGHT_MODEL` boşsa kullanılan modeller. */
  defaults: Record<ModelPurpose, string>;
  createModel(apiKey: string, modelId: string): LanguageModelV4;
  /**
   * Sağlayıcıya özgü hata yorumu (ör. Gemini'nin günlük kota ayrıntısı). Bilmediği durumda `undefined`
   * döner; o zaman genel HTTP kuralları uygulanır (bkz. `classifyError`).
   */
  classifyError?(error: unknown): FailureVerdict | undefined;
  /** Amaca göre sağlayıcı ayarları (ör. düşünme seviyesi). */
  providerOptions?(purpose: ModelPurpose, modelId: string): SharedV4ProviderOptions | undefined;
  /**
   * Anahtarı token harcamadan dener (yönetim panelinde ekleme ve "Test et"). Yoksa anahtar denenmeden kabul
   * edilir.
   */
  verifyKey?(apiKey: string): Promise<KeyCheck>;
};

/** `ok`: anahtar çalışıyor; `limited`: geçerli ama şu an kotası dolu; `invalid`: reddedildi. */
export type KeyCheck =
  | { status: "ok" | "limited"; message?: string }
  | { status: "invalid" | "error"; message: string };

/** `41s`, `1.5s`, `500ms` → ms. */
function parseDuration(value: unknown) {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return Math.round(match[2] === "ms" ? amount : amount * 1000);
}

/** HTTP `Retry-After`: saniye ya da tarih. */
export function parseRetryAfter(value: string | undefined) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

type GoogleErrorDetail = {
  "@type"?: string;
  reason?: string;
  retryDelay?: string;
  violations?: Array<{ quotaId?: string; quotaMetric?: string }>;
};

function googleErrorBody(body: string | undefined) {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: number; status?: string; message?: string; details?: GoogleErrorDetail[] };
    };
    return Array.isArray(parsed) ? (parsed[0] as typeof parsed)?.error : parsed.error;
  } catch {
    return undefined;
  }
}

const google: ProviderAdapter = {
  id: "google",
  defaults: { chat: "gemini-3.5-flash", light: "gemini-3.5-flash-lite" },
  createModel: (apiKey, modelId) => createGoogle({ apiKey })(modelId),
  classifyError(error) {
    if (!APICallError.isInstance(error)) return undefined;
    const body = googleErrorBody(error.responseBody);
    const details = body?.details ?? [];
    const message = body?.message ?? error.message;
    const reasons = details.map((detail) => detail.reason).filter(Boolean);

    if (reasons.includes("API_KEY_INVALID") || /api key (not valid|expired)/i.test(message)) {
      return { kind: "auth", message };
    }
    if (error.statusCode === 429 || body?.status === "RESOURCE_EXHAUSTED") {
      const retry = details.find((detail) => detail["@type"]?.endsWith("RetryInfo"));
      const quotas = details
        .filter((detail) => detail["@type"]?.endsWith("QuotaFailure"))
        .flatMap((detail) => detail.violations ?? [])
        .map((violation) => violation.quotaId ?? violation.quotaMetric ?? "");
      return {
        kind: "rate_limit",
        daily: quotas.some((id) => /per ?day/i.test(id)),
        retryAfterMs:
          parseDuration(retry?.retryDelay) ??
          parseRetryAfter(error.responseHeaders?.["retry-after"]),
        message,
      };
    }
    if (error.statusCode === 403 || body?.status === "PERMISSION_DENIED") {
      return { kind: "auth", message };
    }
    return undefined;
  },
  async verifyKey(apiKey) {
    // Model listesi: kota ve token harcamaz, geçersiz anahtarı Gemini çağrısıyla aynı hatayla reddeder.
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(10_000) },
    ).catch((error: unknown) => error as Error);
    if (response instanceof Error) return { status: "error", message: response.message };
    if (response.ok) return { status: "ok" };
    const body = googleErrorBody(await response.text());
    const message = body?.message ?? `HTTP ${response.status}`;
    if (response.status === 429) return { status: "limited", message };
    const reasons = (body?.details ?? []).map((detail) => detail.reason);
    if (
      reasons.includes("API_KEY_INVALID") ||
      response.status === 401 ||
      response.status === 403 ||
      /api key/i.test(message)
    ) {
      return { status: "invalid", message };
    }
    return { status: "error", message };
  },
  providerOptions(_purpose, modelId) {
    // Gemini 3 ailesi düşünme seviyesini destekler. Asistan hızlı cevap vermeli; araç kullanımında
    // "low" yeterince isabetli.
    if (!modelId.startsWith("gemini-3")) return undefined;
    return { google: { thinkingConfig: { thinkingLevel: "low" } } };
  },
};

const adapters = new Map<string, ProviderAdapter>([[google.id, google]]);

export function providerAdapter(id: string) {
  return adapters.get(id) ?? null;
}

/** Anahtar eklenebilecek sağlayıcılar (yönetim paneli). */
export function providerIds() {
  return [...adapters.keys()];
}

/** Testler ve ileride eklenecek sağlayıcılar için. */
export function registerProvider(adapter: ProviderAdapter) {
  adapters.set(adapter.id, adapter);
}

/**
 * Hatanın havuz için anlamı. Önce sağlayıcının kendi yorumu, sonra genel HTTP kuralları: 429 sınır,
 * 401/403 kimlik, 408/409/5xx ve ağ hataları geçici, diğer 4xx isteğin kendi sorunu.
 */
export function classifyError(adapter: ProviderAdapter, error: unknown): FailureVerdict {
  const specific = adapter.classifyError?.(error);
  if (specific) return specific;
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    const retryAfterMs = parseRetryAfter(error.responseHeaders?.["retry-after"]);
    const message = error.message;
    if (status === 429) return { kind: "rate_limit", retryAfterMs, message };
    if (status === 401 || status === 403) return { kind: "auth", message };
    if (status === undefined || status === 408 || status === 409 || status >= 500) {
      return { kind: "server", retryAfterMs, message };
    }
    return { kind: "fatal", message };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "server", message };
}
