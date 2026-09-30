import { writeWorkerHeartbeat } from "@my-games/core/admin/system";
import { databaseConfig } from "@my-games/core/config";
import { closeDb } from "@my-games/core/db";
import { errorInfo, errorMessageOf, flushLogs, logger } from "@my-games/core/log";
import { PgBoss } from "pg-boss";
import { createHandlers } from "./handlers";
import { registerJobs } from "./jobs";
import { startOutboxLoop } from "./outbox-loop";

// Postgres `max_connections` düşük tutulduğu için worker'ın havuzları küçük.
const boss = new PgBoss({ connectionString: databaseConfig().url, max: 3 });
boss.on("error", (error) =>
  logger.error("worker", "boss_error", `pg-boss hatası: ${errorMessageOf(error)}`, {
    context: { error: errorInfo(error) },
  }),
);

const startedAt = new Date();
await boss.start();
await registerJobs(boss);
const stopOutbox = startOutboxLoop(createHandlers(boss));
logger.info("worker", "started", `worker hazır (${process.version}, pid ${process.pid})`);

// Yönetim paneli worker'ın ayakta olduğunu ve bellek kullanımını buradan görür.
const beat = () =>
  writeWorkerHeartbeat(startedAt).catch((error) =>
    console.warn("[worker] yaşam belirtisi yazılamadı", errorMessageOf(error)),
  );
void beat();
const heartbeat = setInterval(beat, 60_000);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] ${signal} alındı, işler bitiriliyor…`);
  clearInterval(heartbeat);
  await stopOutbox();
  await boss.stop({ graceful: true, timeout: 30_000 });
  await flushLogs();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
