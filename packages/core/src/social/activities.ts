import { schema } from "@my-games/db";
import { type ActivityVerb, gameCoverUrl, playtimeMilestones } from "@my-games/shared";
import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import { localToday } from "../config";
import { db, type Tx } from "../db";
import type { EventPayload } from "../events";

const { activities, games, user, reactions, comments, libraryEntries } = schema;

/** Akışa düşmeyen kaynaklar: toplu içe aktarma ve geri alma işlemleri akışı doldurmasın. */
const SILENT_SOURCES = new Set(["migration", "revert"]);
const MAX_GROUPED_ITEMS = 12;

function today() {
  return localToday();
}

/**
 * `groupKey` aynı olan aktiviteyi günceller ya da yenisini açar. Birleştirme kuralını `merge` belirler;
 * güncellenen aktivite akışın başına çıkar (`updated_at`).
 */
async function upsertActivity(
  tx: Tx,
  input: {
    actorId: string;
    verb: ActivityVerb;
    groupKey: string;
    gameId?: string | null;
    entryId?: string | null;
    data: Record<string, unknown>;
    merge?: (previous: Record<string, unknown>) => Record<string, unknown>;
  },
) {
  const [existing] = await tx
    .select()
    .from(activities)
    .where(eq(activities.groupKey, input.groupKey))
    .for("update");
  if (existing) {
    await tx
      .update(activities)
      .set({
        data: input.merge ? input.merge(existing.data) : input.data,
        gameId: input.gameId ?? existing.gameId,
        entryId: input.entryId ?? existing.entryId,
        updatedAt: new Date(),
      })
      .where(eq(activities.id, existing.id));
    return;
  }
  await tx.insert(activities).values({
    actorId: input.actorId,
    verb: input.verb,
    groupKey: input.groupKey,
    gameId: input.gameId ?? null,
    entryId: input.entryId ?? null,
    data: input.data,
    day: today(),
  });
}

export async function onEntryCreated(payload: EventPayload<"entry.created">, tx: Tx) {
  if (SILENT_SOURCES.has(payload.source)) return;
  const item = { entryId: payload.entryId, gameId: payload.gameId, status: payload.status };
  await upsertActivity(tx, {
    actorId: payload.userId,
    verb: "entry_added",
    groupKey: `entry_added:${payload.userId}:${today()}`,
    gameId: payload.gameId,
    entryId: payload.entryId,
    data: { items: [item], count: 1 },
    merge: (previous) => {
      const items = [item, ...((previous.items as (typeof item)[]) ?? [])].slice(
        0,
        MAX_GROUPED_ITEMS,
      );
      return { items, count: Number(previous.count ?? 0) + 1 };
    },
  });
}

export async function onEntryUpdated(payload: EventPayload<"entry.updated">, tx: Tx) {
  if (SILENT_SOURCES.has(payload.source)) return;
  const change = (field: string) => payload.changes.find((item) => item.field === field);
  const day = today();
  const base = { actorId: payload.userId, gameId: payload.gameId, entryId: payload.entryId };

  const status = change("status");
  if (status) {
    await upsertActivity(tx, {
      ...base,
      verb: "status_changed",
      groupKey: `status:${payload.entryId}:${day}`,
      data: { from: status.from, to: status.to },
      merge: (previous) => ({ from: previous.from, to: status.to }),
    });
  }

  const rating = change("rating");
  if (rating && rating.to !== null) {
    await upsertActivity(tx, {
      ...base,
      verb: "rated",
      groupKey: `rated:${payload.entryId}:${day}`,
      data: { rating: rating.to },
    });
  }

  const review = change("review");
  if (review && typeof review.to === "string" && review.to.trim()) {
    await upsertActivity(tx, {
      ...base,
      verb: "reviewed",
      groupKey: `reviewed:${payload.entryId}`,
      data: { excerpt: review.to.slice(0, 280) },
    });
  }

  const unlocked = change("achievementsUnlocked");
  const [entry] = unlocked
    ? await tx
        .select({
          unlocked: libraryEntries.achievementsUnlocked,
          total: libraryEntries.achievementsTotal,
        })
        .from(libraryEntries)
        .where(eq(libraryEntries.id, payload.entryId))
    : [];
  if (entry?.total && entry.unlocked === entry.total && unlocked?.from !== entry.total) {
    await upsertActivity(tx, {
      ...base,
      verb: "achievements_completed",
      groupKey: `achievements:${payload.entryId}`,
      data: { total: entry.total },
    });
  }
}

export async function onPlaytimeRecorded(payload: EventPayload<"playtime.recorded">, tx: Tx) {
  const base = { actorId: payload.userId, gameId: payload.gameId, entryId: payload.entryId };
  await upsertActivity(tx, {
    ...base,
    verb: "played",
    groupKey: `played:${payload.userId}:${payload.gameId}:${today()}`,
    data: { minutes: payload.minutes },
    merge: (previous) => ({ minutes: Number(previous.minutes ?? 0) + payload.minutes }),
  });

  const before = payload.totalMin - payload.minutes;
  const crossed = playtimeMilestones.filter(
    (milestone) => before < milestone && payload.totalMin >= milestone,
  );
  const milestone = crossed.at(-1);
  if (milestone) {
    await upsertActivity(tx, {
      ...base,
      verb: "playtime_milestone",
      groupKey: `milestone:${payload.entryId}:${milestone}`,
      data: { minutes: milestone },
    });
  }
}

export async function onScreenshotsAdded(payload: EventPayload<"screenshots.added">, tx: Tx) {
  await upsertActivity(tx, {
    actorId: payload.userId,
    verb: "screenshots_added",
    groupKey: `screenshots:${payload.entryId}:${today()}`,
    gameId: payload.gameId,
    entryId: payload.entryId,
    data: { screenshotIds: payload.screenshotIds.slice(0, 8), count: payload.screenshotIds.length },
    merge: (previous) => ({
      screenshotIds: [
        ...payload.screenshotIds,
        ...((previous.screenshotIds as string[]) ?? []),
      ].slice(0, 8),
      count: Number(previous.count ?? 0) + payload.screenshotIds.length,
    }),
  });
}

// --- Okuma ---

export type FeedCursor = { updatedAt: string; id: string };

export function encodeCursor(cursor: FeedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(value: string | undefined): FeedCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as FeedCursor;
    // SQL'de cast edildiği için biçim burada doğrulanır (bozuk imleç 500 değil, ilk sayfa olur).
    const validTime =
      typeof parsed.updatedAt === "string" &&
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/.test(
        parsed.updatedAt,
      );
    const validId =
      typeof parsed.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id);
    return validTime && validId ? parsed : null;
  } catch {
    return null;
  }
}

/** Global akış (takip yok). `actorId` ile profil, `gameId` ile oyun sayfası akışı. */
export async function listFeed(options: {
  viewerId?: string | null;
  actorId?: string;
  gameId?: string;
  cursor?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const conditions: SQL[] = [];
  if (options.actorId) conditions.push(eq(activities.actorId, options.actorId));
  if (options.gameId) conditions.push(eq(activities.gameId, options.gameId));
  // Banlanan kullanıcıların aktiviteleri gösterilmez.
  conditions.push(sql`coalesce(${user.banned}, false) = false`);
  const cursor = decodeCursor(options.cursor);
  if (cursor) {
    // Zaman Postgres'in metin hâliyle taşınır: JS Date milisaniyeye yuvarlar, aynı transaction'da
    // (aynı mikro saniyede) oluşan aktiviteler sayfa sınırında kaybolurdu.
    conditions.push(
      sql`(${activities.updatedAt}, ${activities.id}) < (${cursor.updatedAt}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const viewer = options.viewerId ?? null;
  const rows = await db
    .select({
      id: activities.id,
      verb: activities.verb,
      data: activities.data,
      createdAt: activities.createdAt,
      updatedAt: activities.updatedAt,
      cursorAt: sql<string>`${activities.updatedAt}::text`,
      entryId: activities.entryId,
      actor: { id: user.id, name: user.name, username: user.displayUsername, image: user.image },
      game: {
        id: games.id,
        name: games.name,
        slug: games.slug,
        coverImageId: games.coverImageId,
        coverUrl: games.coverUrl,
      },
      reactionCount: sql<number>`(select count(*)::int from ${reactions} r where r.target_type = 'activity' and r.target_id = ${activities.id})`,
      commentCount: sql<number>`(select count(*)::int from ${comments} c where c.target_type = 'activity' and c.target_id = ${activities.id} and c.deleted_at is null)`,
      viewerReacted: viewer
        ? sql<boolean>`exists (select 1 from ${reactions} r where r.target_type = 'activity' and r.target_id = ${activities.id} and r.user_id = ${viewer})`
        : sql<boolean>`false`,
    })
    .from(activities)
    .innerJoin(user, eq(user.id, activities.actorId))
    .leftJoin(games, eq(games.id, activities.gameId))
    .where(and(...conditions))
    .orderBy(desc(activities.updatedAt), desc(activities.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(({ cursorAt: _cursorAt, ...row }) => ({
      ...row,
      game: row.game?.id ? { ...row.game, coverUrl: gameCoverUrl(row.game, "cover_small") } : null,
    })),
    nextCursor:
      rows.length > limit && last ? encodeCursor({ updatedAt: last.cursorAt, id: last.id }) : null,
  };
}

export async function activityOwner(activityId: string) {
  const [row] = await db
    .select({ actorId: activities.actorId })
    .from(activities)
    .where(eq(activities.id, activityId));
  return row?.actorId ?? null;
}
