import { schema } from "@my-games/db";
import { and, asc, eq, isNull, lt, lte, sql } from "drizzle-orm";
import { db, type Tx } from "./db";
import type { EventPayload, EventType } from "./events";
import { logger } from "./log";

export type OutboxHandlers = {
  [T in EventType]?: (payload: EventPayload<T>, tx: Tx) => Promise<void>;
};

const MAX_ATTEMPTS = 8;

/**
 * Bekleyen olayları sırayla işler. Her olay kendi transaction'ında kilitlenir (`skip locked`), böylece
 * birden fazla worker aynı olayı almaz. Tüketici hata verirse olay artan beklemeyle tekrar denenir;
 * `MAX_ATTEMPTS`'ten sonra hatasıyla birlikte işlenmiş sayılır (kayıt kalır, incelenebilir).
 */
export async function processOutbox(handlers: OutboxHandlers, limit = 50) {
  let processed = 0;
  for (let index = 0; index < limit; index++) {
    const done = await db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(schema.outbox)
        .where(and(isNull(schema.outbox.processedAt), lte(schema.outbox.availableAt, new Date())))
        .orderBy(asc(schema.outbox.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!event) return false;

      const handler = handlers[event.type as EventType] as
        | ((payload: unknown, tx: Tx) => Promise<void>)
        | undefined;
      try {
        await tx.transaction(async (inner) => {
          if (handler) await handler(event.payload, inner);
        });
        await tx
          .update(schema.outbox)
          .set({ processedAt: new Date(), attempts: event.attempts + 1, lastError: null })
          .where(eq(schema.outbox.id, event.id));
      } catch (error) {
        const attempts = event.attempts + 1;
        const message = error instanceof Error ? error.message : String(error);
        // Son deneme de başarısızsa olay bırakılır (panelden yeniden denenebilir).
        logger[attempts >= MAX_ATTEMPTS ? "error" : "warn"](
          "outbox",
          attempts >= MAX_ATTEMPTS ? "event_dead" : "event_failed",
          `${event.type}#${event.id} başarısız (${attempts}. deneme): ${message}`,
          { context: { eventId: event.id, type: event.type, attempts } },
        );
        await tx
          .update(schema.outbox)
          .set({
            attempts,
            lastError: message.slice(0, 2000),
            availableAt: new Date(Date.now() + 2 ** attempts * 1000),
            processedAt: attempts >= MAX_ATTEMPTS ? new Date() : null,
          })
          .where(eq(schema.outbox.id, event.id));
      }
      return true;
    });
    if (!done) break;
    processed++;
  }
  return processed;
}

/** İşlenmiş eski olayları siler (tablo şişmesin). */
export async function pruneOutbox(olderThanDays = 7) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(schema.outbox)
    .where(and(lt(schema.outbox.processedAt, cutoff), sql`${schema.outbox.lastError} is null`));
  return result.rowCount ?? 0;
}
