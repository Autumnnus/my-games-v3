import { afterAll, beforeEach } from "vitest";
import { testDatabaseUrl } from "./env";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.DATABASE_POOL_MAX = "4";
process.env.APP_URL = "http://localhost:3300";
// CI'da .env yok; token şifreleme (config.ts `credentialsSecret`) bir secret ister.
process.env.BETTER_AUTH_SECRET ??= "test-secret-that-is-at-least-32-characters-long";

// Testlerde gerçek dış servislere gidilmez; testler gerekirse kendi sahte değerlerini verir. Kök .env'deki
// gerçek anahtarlar (AI havuzu, OAuth, Turnstile) da silinir: yoksa yedek yollarını deneyen testler gerçek
// sağlayıcıya istek atardı.
for (const name of Object.keys(process.env)) {
  if (/^(AI_|GOOGLE_GENERATIVE_AI_)/.test(name)) delete process.env[name];
}
for (const name of [
  "IGDB_CLIENT_ID",
  "IGDB_CLIENT_SECRET",
  "STEAM_API_KEY",
  "S3_ENDPOINT",
  "VAPID_PUBLIC_KEY",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_SITE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "RESEND_API_KEY",
]) {
  delete process.env[name];
}
// Sistem logları testlerde arka planda yazılmaz (tablo her testte boşaltılıyor); log testleri açıkça açar.
process.env.SYSTEM_LOG_DB = "off";

const { pool, closeDb } = await import("../src/db");
const { clearSettingsCache } = await import("../src/settings");
const { clearKeyCache } = await import("../src/ai/keys");

beforeEach(async () => {
  clearSettingsCache();
  clearKeyCache();
  const { rows } = await pool().query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'",
  );
  if (rows.length > 0) {
    await pool().query(
      `truncate ${rows.map((row) => `"${row.tablename}"`).join(", ")} restart identity cascade`,
    );
  }
});

afterAll(async () => {
  await closeDb();
});
