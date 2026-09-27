import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { testDatabaseUrl } from "./env";

/** Test veritabanını (yoksa) oluşturur ve migration'ları uygular. */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const database = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [database]);
  if (exists.rowCount === 0) await admin.query(`create database "${database}"`);
  await admin.end();

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL("../../db/drizzle", import.meta.url)),
  });
  await client.end();
}
