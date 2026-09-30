import type { EstimatePattern, EstimatePlan, EstimatePlanner } from "@my-games/shared";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, tstz, updatedAt } from "./_helpers";
import { user } from "./auth";
import { libraryEntries } from "./library";

/**
 * Takipten önceki oynama geçmişinin tahmini. Platformlar oturum geçmişi vermediği için ilk gözlemdeki süre
 * (ve elle/eski sistemden gelen süre) hiçbir güne yazılmaz; bu tablolar o süreyi kanıtlara göre günlere
 * dağıtır. Buradaki her satır tahmindir: gerçek oturumlar `play_sessions`'ta kalır, ikisi karışmaz ve
 * arayüz tahmini günleri ayrıca işaretler. Kayıt başına tek plan; kayıt silinince plan ve günleri de gider.
 */
export const playEstimatePlans = pgTable(
  "play_estimate_plans",
  {
    entryId: uuid()
      .primaryKey()
      .references(() => libraryEntries.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Dağıtılan süre: kaydın toplam süresi − gerçek oturumlar. */
    budgetMin: integer().notNull(),
    /** Tahminin yazılabileceği günler (dahil); üst sınır takibin başladığı günden öncedir. */
    windowFrom: date({ mode: "string" }).notNull(),
    windowTo: date({ mode: "string" }).notNull(),
    pattern: text().$type<EstimatePattern>().notNull(),
    plan: jsonb().$type<EstimatePlan>().notNull(),
    confidence: real().notNull(),
    planner: text().$type<EstimatePlanner>().notNull(),
    /** AI'ya sorulması gereken ama sorulamamış plan (AI kapalı, kota); sonraki derlemede yeniden denenir. */
    needsAi: boolean().notNull().default(false),
    model: text(),
    /** Kanıt paketinin özeti; değişmediyse plan yeniden üretilmez (AI'ya da tekrar gidilmez). */
    evidenceHash: text().notNull(),
    evidence: jsonb().$type<Record<string, unknown>>().notNull(),
    generatorVersion: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

/** Planın günlere dağılmış hali (yalnızca süre düşen günler). */
export const playEstimateDays = pgTable(
  "play_estimate_days",
  {
    entryId: uuid()
      .notNull()
      .references(() => libraryEntries.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    minutes: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.day] }), index().on(t.userId, t.day)],
);

/** Kullanıcı başına son derleme; `hash` aynıysa günler yeniden yazılmaz. */
export const playEstimateBuilds = pgTable("play_estimate_builds", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  builtAt: tstz().notNull(),
  generatorVersion: integer().notNull(),
  hash: text().notNull(),
  stats: jsonb().$type<Record<string, number>>().notNull(),
});
