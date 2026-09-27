import { sql } from "drizzle-orm";
import { bigint, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./_helpers";

/**
 * Transactional outbox. Değişikliği yapan transaction olayı buraya da yazar; worker okuyup işler.
 * Böylece "veri yazıldı ama bildirim/akış kaydı kayboldu" durumu olmaz.
 */
export const outbox = pgTable(
  "outbox",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    /** Başarısız olayların yeniden denenme zamanı. */
    availableAt: tstz().notNull().defaultNow(),
    processedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_pending_idx").on(t.availableAt).where(sql`${t.processedAt} is null`)],
);

/** Küçük anahtar-değer ayarları (ör. IGDB erişim token'ı). */
export const appConfig = pgTable("app_config", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
});
