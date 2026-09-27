import { databaseConfig } from "@my-games/core/config";
import { OUTBOX_CHANNEL } from "@my-games/core/events";
import { type OutboxHandlers, processOutbox } from "@my-games/core/outbox";
import pg from "pg";

const POLL_INTERVAL_MS = 10_000;

/**
 * Outbox'ı tüketir. Yeni olayda NOTIFY ile anında uyanır; ayrıca yeniden denemeler ve kaçan bildirimler
 * için periyodik olarak yoklar. Aynı anda tek tur çalışır.
 */
export function startOutboxLoop(handlers: OutboxHandlers) {
  let running = false;
  let again = false;
  let stopped = false;
  let listener: pg.Client | null = null;

  async function tick() {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const processed = await processOutbox(handlers, 100);
        if (processed === 100) again = true;
      } while (again && !stopped);
    } catch (error) {
      console.error("[outbox] tur başarısız", error);
    } finally {
      running = false;
    }
  }

  async function listen() {
    if (stopped) return;
    try {
      listener = new pg.Client({ connectionString: databaseConfig().url });
      listener.on("notification", () => void tick());
      listener.on("error", (error) => {
        console.error("[outbox] LISTEN bağlantısı koptu", error.message);
        listener = null;
        setTimeout(() => void listen(), 5_000);
      });
      await listener.connect();
      await listener.query(`listen ${OUTBOX_CHANNEL}`);
    } catch (error) {
      console.error("[outbox] LISTEN başlatılamadı", error);
      setTimeout(() => void listen(), 5_000);
    }
  }

  const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
  void listen();
  void tick();

  return async () => {
    stopped = true;
    clearInterval(interval);
    await listener?.end().catch(() => {});
    while (running) await new Promise((resolve) => setTimeout(resolve, 50));
  };
}
