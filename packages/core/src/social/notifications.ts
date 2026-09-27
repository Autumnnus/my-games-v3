import { schema } from "@my-games/db";
import type { NotificationType, SocialTarget } from "@my-games/shared";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, type Tx } from "../db";
import { emit } from "../events";

const { notifications, notificationPreferences, user } = schema;

export const NOTIFICATION_CHANNEL = "notifications";

async function preferenceFor(tx: Tx, userId: string, type: NotificationType) {
  const [row] = await tx
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.type, type)));
  return { inApp: (row?.inApp ?? "on") === "on", push: (row?.push ?? "on") === "on" };
}

/**
 * Bildirim oluşturur ya da okunmamış aynı gruptaki bildirimi günceller ("X ve 3 kişi daha beğendi").
 * Kullanıcı kendi eylemi için bildirim almaz. Commit sonrası NOTIFY ile açık SSE bağlantılarına iletilir;
 * push tercihi açıksa Web Push için olay yazılır.
 */
export async function notify(
  tx: Tx,
  input: {
    recipientId: string;
    type: NotificationType;
    groupKey: string;
    actorId?: string | null;
    targetType?: SocialTarget | null;
    targetId?: string | null;
    data?: Record<string, unknown>;
    increment?: number;
  },
) {
  if (input.actorId && input.actorId === input.recipientId) return null;
  const preference = await preferenceFor(tx, input.recipientId, input.type);
  if (!preference.inApp && !preference.push) return null;

  const actorIds = input.actorId ? [input.actorId] : [];
  const increment = input.increment ?? 1;
  const [existing] = await tx
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, input.recipientId),
        eq(notifications.groupKey, input.groupKey),
        isNull(notifications.readAt),
      ),
    )
    .for("update");

  let notificationId: string;
  if (existing) {
    const merged = [...actorIds, ...existing.actorIds.filter((id) => !actorIds.includes(id))].slice(
      0,
      5,
    );
    const alreadyCounted = input.actorId ? existing.actorIds.includes(input.actorId) : false;
    await tx
      .update(notifications)
      .set({
        actorIds: merged,
        count: alreadyCounted ? existing.count : existing.count + increment,
        data: { ...existing.data, ...(input.data ?? {}) },
        updatedAt: new Date(),
      })
      .where(eq(notifications.id, existing.id));
    notificationId = existing.id;
  } else {
    const [row] = await tx
      .insert(notifications)
      .values({
        recipientId: input.recipientId,
        type: input.type,
        groupKey: input.groupKey,
        actorIds,
        count: increment,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        data: input.data ?? {},
      })
      .returning({ id: notifications.id });
    if (!row) return null;
    notificationId = row.id;
  }

  await tx.execute(sql`select pg_notify(${NOTIFICATION_CHANNEL}, ${input.recipientId})`);
  if (preference.push) await emit(tx, "notification.push", { notificationId });
  return notificationId;
}

export async function listNotifications(
  userId: string,
  options: { before?: string; limit?: number } = {},
) {
  const limit = Math.min(options.limit ?? 30, 100);
  const conditions = [eq(notifications.recipientId, userId)];
  if (options.before) conditions.push(lt(notifications.updatedAt, new Date(options.before)));
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.updatedAt))
    .limit(limit);

  const actorIds = [...new Set(rows.flatMap((row) => row.actorIds))];
  const actors = actorIds.length
    ? await db
        .select({ id: user.id, name: user.name, username: user.displayUsername, image: user.image })
        .from(user)
        .where(inArray(user.id, actorIds))
    : [];
  const byId = new Map(actors.map((actor) => [actor.id, actor]));
  return rows.map((row) => ({
    ...row,
    actors: row.actorIds.map((id) => byId.get(id)).filter((actor) => !!actor),
  }));
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export async function markRead(userId: string, ids?: string[]) {
  const conditions = [eq(notifications.recipientId, userId), isNull(notifications.readAt)];
  if (ids?.length) conditions.push(inArray(notifications.id, ids));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}

export async function getPreferences(userId: string) {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  const byType = new Map(rows.map((row) => [row.type, row]));
  const types: NotificationType[] = [
    "reaction",
    "comment",
    "reply",
    "mention",
    "proposals",
    "system",
  ];
  return types.map((type) => ({
    type,
    inApp: (byType.get(type)?.inApp ?? "on") === "on",
    push: (byType.get(type)?.push ?? "on") === "on",
  }));
}

export async function setPreference(
  userId: string,
  type: NotificationType,
  value: { inApp: boolean; push: boolean },
) {
  const row = {
    inApp: value.inApp ? ("on" as const) : ("off" as const),
    push: value.push ? ("on" as const) : ("off" as const),
  };
  await db
    .insert(notificationPreferences)
    .values({ userId, type, ...row })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.type],
      set: row,
    });
}

export async function getNotification(id: string) {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
  return row ?? null;
}
