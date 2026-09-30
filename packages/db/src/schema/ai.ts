import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_helpers";
import { user } from "./auth";
import { games } from "./catalog";
import { libraryEntries } from "./library";

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text(),
    /** Sohbetin açıldığı sayfanın oyunu (listede kapak olarak görünür). */
    contextGameId: uuid().references(() => games.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId, t.updatedAt)],
);

/** AI SDK `UIMessage` olduğu gibi saklanır (id'yi SDK üretir). */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text().primaryKey(),
    threadId: uuid()
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text().$type<"system" | "user" | "assistant">().notNull(),
    parts: jsonb().$type<unknown[]>().notNull(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.threadId, t.createdAt)],
);

export type AiPurpose = "chat" | "title" | "pick" | "review" | "recap" | "estimates" | "endings";
export type AiRunStatus = "ok" | "error" | "aborted";

/** Bir model çağrısının adımı (izleme ekranı). İçerik tutulmaz; içerik sohbet mesajlarındadır. */
export type AiTraceStep = {
  model: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  ms: number;
  /** İlk çıktı parçasına kadar geçen süre (akışlı adımlarda). */
  firstOutputMs?: number;
  tools: Array<{ name: string; status: "ok" | "error" | "denied" | "approval"; ms?: number }>;
  /** Anahtar havuzu: cevabı veren anahtar (maskeli) ve önceki başarısız denemeler. */
  key?: string;
  failovers?: Array<{ model: string; key: string; kind: string; waitMs: number }>;
};

export type AiTraceDetail = {
  mode?: string;
  steps: AiTraceStep[];
};

/**
 * Her model çağrısı (sohbet turu, başlık, öneri, taslak, özet): kota, maliyet ve izleme. Kullanıcı silinse de
 * satır kalır (`user_id` boşalır); aylık maliyet geçmişi bozulmaz. İçerik tutulmaz.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    threadId: uuid().references(() => chatThreads.id, { onDelete: "set null" }),
    /** Sohbette cevabın mesaj kimliği (izleme ekranında çağrı ↔ mesaj eşlemesi). */
    messageId: text(),
    purpose: text().$type<AiPurpose>().notNull().default("chat"),
    status: text().$type<AiRunStatus>().notNull().default("ok"),
    error: text(),
    provider: text(),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    cachedInputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    reasoningTokens: integer().notNull().default(0),
    totalTokens: integer().notNull().default(0),
    steps: integer().notNull().default(1),
    durationMs: integer(),
    detail: jsonb().$type<AiTraceDetail>(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    index().on(t.createdAt),
    index().on(t.threadId, t.createdAt),
  ],
);

/**
 * "Kaldığın yer" özetleri. Özet, dayandığı veri (son oynama, oturum ve başarım sayısı) değişmedikçe yeniden
 * üretilmez; aynı kayda her girişte model çağrılmaz.
 */
export const aiRecaps = pgTable("ai_recaps", {
  entryId: uuid()
    .primaryKey()
    .references(() => libraryEntries.id, { onDelete: "cascade" }),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  basis: text().notNull(),
  content: jsonb().$type<Record<string, unknown>>().notNull(),
  model: text(),
  createdAt: createdAt(),
});
