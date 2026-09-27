import { databaseConfig } from "@my-games/core/config";
import { closeDb } from "@my-games/core/db";
import { PgBoss } from "pg-boss";
import { createHandlers } from "./handlers";
import { registerJobs } from "./jobs";
import { startOutboxLoop } from "./outbox-loop";

// Postgres `max_connections` düşük tutulduğu için worker'ın havuzları küçük.
const boss = new PgBoss({ connectionString: databaseConfig().url, max: 3 });
boss.on("error", (error) => console.error("[worker] pg-boss hatası", error));

await boss.start();
await registerJobs(boss);
const stopOutbox = startOutboxLoop(createHandlers(boss));
console.info("[worker] hazır");

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] ${signal} alındı, işler bitiriliyor…`);
  await stopOutbox();
  await boss.stop({ graceful: true, timeout: 30_000 });
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
