import { bigint, boolean, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id, tstz } from "./_helpers";
import { user } from "./auth";

export type LogLevel = "info" | "warn" | "error";

/**
 * Sistem logları (app ve worker). Yalnızca incelemeye değer olaylar yazılır (hata, uyarı, başlangıç gibi);
 * her istek değil. stdout'a da gider; bu tablo yönetim panelinden arama içindir. 30 günden eskiler silinir.
 */
export const systemLogs = pgTable(
  "system_logs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    level: text().$type<LogLevel>().notNull(),
    /** Kaynak süreç/alan: `api`, `worker`, `ai`, `auth`, `outbox`… */
    source: text().notNull(),
    /** Kısa, gruplanabilir olay kodu (ör. `request_failed`, `job_failed`, `key_rate_limited`). */
    event: text().notNull(),
    message: text().notNull(),
    context: jsonb().$type<Record<string, unknown>>(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.createdAt),
    index().on(t.level, t.createdAt),
    index().on(t.source, t.createdAt),
  ],
);

/**
 * Admin işlemleri ve hassas okumalar (ör. bir kullanıcının AI sohbetini açmak). Hedefin adı kayıt anında
 * kopyalanır: silinen kullanıcının kaydı da okunabilir kalır.
 */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: id(),
    adminId: text().references(() => user.id, { onDelete: "set null" }),
    /** İşlemi yapan (silinse de görünsün). Sunucu komut satırından yapılanlarda `cli`. */
    adminName: text().notNull(),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    targetLabel: text(),
    details: jsonb().$type<Record<string, unknown>>(),
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.createdAt), index().on(t.targetType, t.targetId, t.createdAt)],
);

/** Kullanıcıya özel sınırlar (admin verir). Satır yoksa varsayılanlar geçerli. */
export const userLimits = pgTable("user_limits", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Günlük AI token sınırı; `null` = varsayılan, `0` = sınırsız. */
  aiDailyTokens: integer(),
  /** AI bu hesap için kapalı (kötüye kullanım). */
  aiBlocked: boolean().notNull().default(false),
  note: text(),
  updatedBy: text(),
  updatedAt: tstz(),
});

export type LegacyImportStatus = "queued" | "running" | "done" | "failed";

/**
 * Yönetim panelinden başlatılan eski sistem aktarımları. Kayıtlar (`records`) worker iş bitene kadar burada
 * bekler, iş başarıyla bitince silinir; rapor kalır.
 */
export const legacyImports = pgTable(
  "legacy_imports",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    fileName: text().notNull(),
    status: text().$type<LegacyImportStatus>().notNull().default("queued"),
    total: integer().notNull(),
    processed: integer().notNull().default(0),
    records: jsonb().$type<unknown[]>(),
    report: jsonb().$type<Record<string, unknown>>(),
    error: text(),
    createdAt: createdAt(),
    startedAt: tstz(),
    finishedAt: tstz(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
