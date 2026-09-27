import { existsSync } from "node:fs";

const envFile = new URL("../../../.env", import.meta.url);

/** Kök .env'i yükler ve DATABASE_URL'i `<db>_test` veritabanına çevirir. */
export function testDatabaseUrl() {
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL veya TEST_DATABASE_URL tanımlı değil");
  const url = new URL(base);
  if (!process.env.TEST_DATABASE_URL) url.pathname = `${url.pathname.replace(/_test$/, "")}_test`;
  return url.toString();
}
