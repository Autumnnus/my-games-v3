import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { type DbOrTx, db } from "./db";

const { appConfig } = schema;

/**
 * Deploy gerektirmeden yönetim panelinden değişen ayarlar (`app_config`). Her süreç (app, worker) kısa süre
 * önbellekler; bir süreçte yapılan değişiklik diğerine en geç `TTL_MS` içinde yansır.
 */
const TTL_MS = 15_000;
const cache = new Map<string, { value: unknown; at: number }>();

export const SETTING_KEYS = {
  /** `false` ise yeni hesap açılamaz (e-posta, Google, Discord, Steam). */
  signupsOpen: "auth.signups_open",
  /** Varsayılan günlük AI token sınırı (`AI_DAILY_TOKEN_LIMIT`'i ezer). */
  aiDailyTokens: "ai.daily_token_limit",
  /** Model seçimi (sohbet, yedekler, kısa işler); `AI_MODEL` vb. ortam değişkenlerini ezer. */
  aiModels: "ai.models",
  /** Anahtar dağıtımı: `round_robin` ya da `failover` (`AI_KEY_STRATEGY`'yi ezer). */
  aiKeyStrategy: "ai.key_strategy",
  /** Model fiyat tablosu (USD / 1M token). */
  aiPrices: "ai.prices",
  /** Worker'ın son yaşam belirtisi (bellek, çalışma süresi). */
  workerHeartbeat: "worker.heartbeat",
} as const;

export async function readSetting<T>(key: string, tx: DbOrTx = db): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T | null;
  const [row] = await tx
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, key));
  const value = (row?.value ?? null) as T | null;
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** `null` ayarı siler (varsayılana döner). */
export async function writeSetting(key: string, value: unknown, tx: DbOrTx = db) {
  if (value === null) {
    await tx.delete(appConfig).where(eq(appConfig.key, key));
  } else {
    await tx
      .insert(appConfig)
      .values({ key, value })
      .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } });
  }
  cache.delete(key);
}

/** Testler veritabanını her seferinde boşalttığı için önbellek de sıfırlanır. */
export function clearSettingsCache() {
  cache.clear();
}

export async function signupsOpen() {
  return (await readSetting<boolean>(SETTING_KEYS.signupsOpen)) !== false;
}
