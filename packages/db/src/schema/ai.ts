import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_helpers";
import { user } from "./auth";

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text(),
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

/** Kota ve maliyet takibi. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: uuid().references(() => chatThreads.id, { onDelete: "set null" }),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    totalTokens: integer().notNull().default(0),
    steps: integer().notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
