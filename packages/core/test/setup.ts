import { afterAll, beforeEach } from "vitest";
import { testDatabaseUrl } from "./env";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.DATABASE_POOL_MAX = "4";
process.env.APP_URL = "http://localhost:3300";

// Testlerde gerçek dış servislere gidilmez; testler gerekirse kendi sahte değerlerini verir.
for (const name of [
  "IGDB_CLIENT_ID",
  "IGDB_CLIENT_SECRET",
  "STEAM_API_KEY",
  "S3_ENDPOINT",
  "VAPID_PUBLIC_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
]) {
  delete process.env[name];
}

const { pool, closeDb } = await import("../src/db");

beforeEach(async () => {
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
