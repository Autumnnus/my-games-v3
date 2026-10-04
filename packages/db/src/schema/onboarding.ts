import { sql } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./_helpers";
import { user } from "./auth";

/**
 * Yeni üye rehberi (hoş geldin, başlangıç listesi, ipuçları). Satır yalnızca kayıt anında açılır: satırı
 * olmayan (eski/taşınmış) hesaplar rehberi hiç görmez. Adımların tamamlanması veriden hesaplanır; burada
 * yalnızca kullanıcının verdiği kararlar (kapattı, gördü) tutulur.
 */
export const userOnboarding = pgTable("user_onboarding", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Hoş geldin diyaloğu gösterildi (seçim yapıldı ya da kapatıldı). */
  welcomedAt: tstz(),
  /** Başlangıç listesi elle gizlendi. */
  dismissedAt: tstz(),
  /** Bütün adımlar bitti (bir kez kutlanır, sonra liste görünmez). */
  completedAt: tstz(),
  /** Gösterilmiş ipuçlarının kimlikleri; her ipucu bir kez gösterilir. */
  seenTips: text().array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
