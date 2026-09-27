import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, tstz, updatedAt } from "./_helpers";
import { user } from "./auth";
import { games } from "./catalog";
import { activityVerbEnum, notificationTypeEnum, socialTargetEnum } from "./enums";
import { libraryEntries } from "./library";

/** Global akış. Aynı gün aynı oyundaki süre güncellemeleri `groupKey` ile tek kayıtta toplanır. */
export const activities = pgTable(
  "activities",
  {
    id: id(),
    actorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verb: activityVerbEnum().notNull(),
    gameId: uuid().references(() => games.id, { onDelete: "cascade" }),
    entryId: uuid().references(() => libraryEntries.id, { onDelete: "cascade" }),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    groupKey: text(),
    day: date({ mode: "string" }).notNull().default(sql`current_date`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index().on(t.updatedAt),
    index().on(t.actorId, t.updatedAt),
    index().on(t.gameId, t.updatedAt),
    uniqueIndex().on(t.groupKey).where(sql`${t.groupKey} is not null`),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    targetType: socialTargetEnum().notNull(),
    targetId: uuid().notNull(),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Tek seviye yanıt: yanıtın yanıtı da kök yoruma bağlanır. */
    parentId: uuid(),
    body: text().notNull(),
    editedAt: tstz(),
    deletedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.targetType, t.targetId, t.createdAt), index().on(t.parentId)],
);

export const reactions = pgTable(
  "reactions",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: socialTargetEnum().notNull(),
    targetId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index().on(t.targetType, t.targetId),
  ],
);

/**
 * Bildirimler. Okunmamış bildirimler `groupKey` ile birleşir ("X ve 3 kişi daha beğendi"):
 * aynı anahtarla yeni olay gelince `count` artar, `actorIds` güncellenir.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    recipientId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: notificationTypeEnum().notNull(),
    groupKey: text().notNull(),
    actorIds: text().array().notNull().default(sql`'{}'::text[]`),
    count: integer().notNull().default(1),
    targetType: socialTargetEnum(),
    targetId: uuid(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    readAt: tstz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index().on(t.recipientId, t.updatedAt),
    uniqueIndex().on(t.recipientId, t.groupKey).where(sql`${t.readAt} is null`),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: notificationTypeEnum().notNull(),
    inApp: text().$type<"on" | "off">().notNull().default("on"),
    push: text().$type<"on" | "off">().notNull().default("on"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.endpoint), index().on(t.userId)],
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    reporterId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: text().$type<"comment" | "entry" | "screenshot" | "user">().notNull(),
    targetId: text().notNull(),
    reason: text().notNull(),
    status: text().$type<"open" | "resolved" | "dismissed">().notNull().default("open"),
    resolvedById: text().references(() => user.id, { onDelete: "set null" }),
    resolvedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.status, t.createdAt)],
);
