/**
 * Entegrasyon ayarları. Her entegrasyon opsiyoneldir: değişkenleri eksikse ilgili fonksiyon `null` döner ve
 * özellik kapalı sayılır (UI `/api/v1/meta` üzerinden neyin açık olduğunu öğrenir).
 */

function read(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readNumber(name: string, fallback: number) {
  const value = Number(read(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function appUrl() {
  return read("APP_URL") ?? "http://localhost:3300";
}

export function databaseConfig() {
  const url = read("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL tanımlı değil");
  return { url, poolMax: readNumber("DATABASE_POOL_MAX", 10), timeZone: appTimeZone() };
}

/**
 * "Bugün", günlük akış grupları, ısı haritası ve Wrapped yılları bu saat dilimine göre hesaplanır.
 * Kullanıcı başına saat dilimi tutulmuyor; kullanıcılar tek bölgede olduğu sürece yeterli.
 */
export function appTimeZone() {
  const zone = read("APP_TIMEZONE") ?? "Europe/Istanbul";
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
  } catch {
    throw new Error(`APP_TIMEZONE geçersiz: ${zone}`);
  }
  return zone;
}

/** Uygulama saat dilimine göre bugünün tarihi (`YYYY-MM-DD`). */
export function localToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function igdbConfig() {
  const clientId = read("IGDB_CLIENT_ID");
  const clientSecret = read("IGDB_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function steamConfig() {
  const apiKey = read("STEAM_API_KEY");
  return apiKey ? { apiKey } : null;
}

/**
 * Xbox: Azure'da "yalnızca kişisel Microsoft hesapları" için kayıtlı bir uygulama. Yönlendirme adresi
 * `{APP_URL}/api/v1/platforms/xbox/callback`.
 */
export function xboxConfig() {
  const clientId = read("XBOX_CLIENT_ID");
  const clientSecret = read("XBOX_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** PSN için uygulama anahtarı gerekmez; kullanıcının kendi oturum kodu (NPSSO) kullanılır. */
export function psnEnabled() {
  return read("PSN_DISABLED") !== "true";
}

/** Platform token'larını şifreleyen anahtarın kaynağı (worker'da da tanımlı olmalı). */
export function credentialsSecret() {
  const secret = read("CREDENTIALS_SECRET") ?? read("BETTER_AUTH_SECRET");
  if (!secret) throw new Error("CREDENTIALS_SECRET veya BETTER_AUTH_SECRET tanımlı değil");
  return secret;
}

export function storageConfig() {
  const endpoint = read("S3_ENDPOINT");
  const bucket = read("S3_BUCKET");
  const accessKeyId = read("S3_ACCESS_KEY_ID");
  const secretAccessKey = read("S3_SECRET_ACCESS_KEY");
  const publicUrl = read("S3_PUBLIC_URL");
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicUrl) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region: read("S3_REGION") ?? "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    publicUrl: publicUrl.replace(/\/+$/, ""),
    maxUploadBytes: readNumber("UPLOAD_MAX_BYTES", 15 * 1024 * 1024),
  };
}

export function pushConfig() {
  const publicKey = read("VAPID_PUBLIC_KEY");
  const privateKey = read("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: read("VAPID_SUBJECT") ?? `mailto:admin@${new URL(appUrl()).hostname}`,
  };
}

export function aiConfig() {
  // `mock`: yerel geliştirmede anahtarsız sahte model (bkz. ai/dev-model).
  const provider = read("AI_PROVIDER") === "mock" ? "mock" : "google";
  const apiKey = read("GOOGLE_GENERATIVE_AI_API_KEY");
  if (provider === "google" && !apiKey) return null;
  return {
    provider,
    apiKey: apiKey ?? "",
    model: read("AI_MODEL") ?? "gemini-3.5-flash",
    dailyTokenLimit: readNumber("AI_DAILY_TOKEN_LIMIT", 200_000),
    maxSteps: readNumber("AI_MAX_STEPS", 8),
  };
}

export function turnstileConfig() {
  const secretKey = read("TURNSTILE_SECRET_KEY");
  const siteKey = read("TURNSTILE_SITE_KEY");
  return secretKey && siteKey ? { secretKey, siteKey } : null;
}

export function features() {
  return {
    igdb: igdbConfig() !== null,
    steam: steamConfig() !== null,
    psn: psnEnabled(),
    xbox: xboxConfig() !== null,
    uploads: storageConfig() !== null,
    push: pushConfig() !== null,
    ai: aiConfig() !== null,
    turnstileSiteKey: turnstileConfig()?.siteKey ?? null,
  };
}
