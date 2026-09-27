import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Hem kaynaktan (src/) hem paketlenmiş dosyadan (dist/) bir üst klasördeki drizzle/ bulunur.
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

// Aynı anda iki container migration çalıştırmasın diye tek bağlantı üzerinde advisory lock alınır.
const MIGRATION_LOCK_ID = 727_001;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL tanımlı değil");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migrate(drizzle(client), { migrationsFolder });
    console.log("[migrate] tamamlandı");
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error("[migrate] başarısız", error);
  process.exit(1);
});
