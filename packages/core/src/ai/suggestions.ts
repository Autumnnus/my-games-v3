import { schema } from "@my-games/db";
import { ratingFromStored } from "@my-games/shared";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { entryPlaytime } from "../playtime";
import { pendingCount } from "../proposals";
import { briefOf, type GameBrief } from "./actions";
import type { PageContext } from "./context";

const { libraryEntries: e, games: g, user } = schema;

const DAY = 24 * 60 * 60 * 1000;
/** Bu kadar gündür açılmayan "oynanıyor" oyunu için "kaldığın yer" önerilir. */
export const RECAP_AFTER_DAYS = 14;

export type Suggestion =
  | { kind: "achievements"; entryId: string; game: GameBrief; remaining: number; total: number }
  | {
      kind: "compare";
      game: GameBrief;
      user: { username: string; name: string; image: string | null };
      rating: number | null;
      hours: number;
    }
  | { kind: "interview"; entryId: string; game: GameBrief }
  | { kind: "recap"; entryId: string; game: GameBrief; daysAway: number }
  | { kind: "inbox"; count: number }
  | { kind: "pick"; backlog: number };

const hours = (minutes: number | null | undefined) => Math.round(((minutes ?? 0) / 60) * 10) / 10;

async function pageGame(userId: string, page: PageContext | undefined) {
  if (page?.type === "game") {
    const [row] = await db.select().from(g).where(eq(g.slug, page.slug));
    return row ? { game: row, ownerId: null as string | null } : null;
  }
  if (page?.type === "entry") {
    const [row] = await db
      .select({ game: g, ownerId: e.userId })
      .from(e)
      .innerJoin(g, eq(g.id, e.gameId))
      .where(eq(e.id, page.id));
    return row ? { game: row.game, ownerId: row.ownerId === userId ? null : row.ownerId } : null;
  }
  return null;
}

/**
 * Asistan panelinin karşılama kartları. Model çağrılmaz: hepsi kullanıcının verisinden kurallarla çıkar,
 * model yalnızca kullanıcı bir karta tıklayınca çalışır.
 */
export async function assistantSuggestions(userId: string, page?: PageContext) {
  const now = Date.now();
  const forPage: Suggestion[] = [];
  const general: Suggestion[] = [];
  const context = await pageGame(userId, page);

  if (context) {
    const brief = briefOf(context.game);
    const [mine] = await db
      .select()
      .from(e)
      .where(and(eq(e.gameId, context.game.id), eq(e.userId, userId)));
    if (mine?.achievementsTotal && (mine.achievementsUnlocked ?? 0) < mine.achievementsTotal) {
      forPage.push({
        kind: "achievements",
        entryId: mine.id,
        game: brief,
        remaining: mine.achievementsTotal - (mine.achievementsUnlocked ?? 0),
        total: mine.achievementsTotal,
      });
    }
    // Başkasının kaydındaysa onunla, değilse bu oyunu puanlamış en son kişiyle karşılaştır.
    const [other] = await db
      .select({
        username: user.displayUsername,
        name: user.name,
        image: user.image,
        rating: e.rating,
        playtimeMin: entryPlaytime,
      })
      .from(e)
      .innerJoin(user, eq(user.id, e.userId))
      .where(
        and(
          eq(e.gameId, context.game.id),
          context.ownerId ? eq(e.userId, context.ownerId) : ne(e.userId, userId),
        ),
      )
      .orderBy(sql`${e.rating} is null`, desc(e.updatedAt))
      .limit(1);
    if (other?.username) {
      forPage.push({
        kind: "compare",
        game: brief,
        user: { username: other.username, name: other.name, image: other.image },
        rating: other.rating === null ? null : ratingFromStored(other.rating),
        hours: hours(other.playtimeMin),
      });
    }
    if (mine?.status === "completed" && !mine.review) {
      forPage.push({ kind: "interview", entryId: mine.id, game: brief });
    }
    if (
      mine &&
      (mine.status === "playing" || mine.status === "paused") &&
      mine.lastPlayedAt &&
      now - mine.lastPlayedAt.getTime() > RECAP_AFTER_DAYS * DAY
    ) {
      forPage.push({
        kind: "recap",
        entryId: mine.id,
        game: brief,
        daysAway: Math.floor((now - mine.lastPlayedAt.getTime()) / DAY),
      });
    }
  }

  const [pending, [stale], [backlog], [unreviewed]] = await Promise.all([
    pendingCount(userId),
    db
      .select({ entry: e, game: g })
      .from(e)
      .innerJoin(g, eq(g.id, e.gameId))
      .where(
        and(
          eq(e.userId, userId),
          inArray(e.status, ["playing", "paused"]),
          lt(e.lastPlayedAt, new Date(now - RECAP_AFTER_DAYS * DAY)),
        ),
      )
      .orderBy(desc(e.lastPlayedAt))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(e)
      .where(and(eq(e.userId, userId), inArray(e.status, ["backlog", "paused"]))),
    db
      .select({ entry: e, game: g })
      .from(e)
      .innerJoin(g, eq(g.id, e.gameId))
      .where(
        and(
          eq(e.userId, userId),
          eq(e.status, "completed"),
          isNull(e.review),
          gte(e.finishedAt, new Date(now - 45 * DAY).toISOString().slice(0, 10)),
        ),
      )
      .orderBy(asc(e.finishedAt))
      .limit(1),
  ]);

  if (pending > 0) general.push({ kind: "inbox", count: pending });
  if ((backlog?.count ?? 0) > 0) general.push({ kind: "pick", backlog: backlog?.count ?? 0 });
  const shown = new Set(
    forPage.map((item) => ("entryId" in item ? `${item.kind}:${item.entryId}` : item.kind)),
  );
  if (stale?.entry.lastPlayedAt && !shown.has(`recap:${stale.entry.id}`)) {
    general.push({
      kind: "recap",
      entryId: stale.entry.id,
      game: briefOf(stale.game),
      daysAway: Math.floor((now - stale.entry.lastPlayedAt.getTime()) / DAY),
    });
  }
  if (unreviewed && !shown.has(`interview:${unreviewed.entry.id}`)) {
    general.push({
      kind: "interview",
      entryId: unreviewed.entry.id,
      game: briefOf(unreviewed.game),
    });
  }

  return {
    pageGame: context ? { name: context.game.name, accentColor: context.game.accentColor } : null,
    forPage: forPage.slice(0, 3),
    general: general.slice(0, 3),
  };
}

/**
 * `@` menüsü: kullanıcının kütüphanesindeki oyunlar ve diğer oyuncular. Sorgu boşsa son güncellenen
 * oyunlar ve en çok oyun takip eden kişiler gelir.
 */
export async function mentionCandidates(userId: string, query: string) {
  const q = query.trim();
  const [gameRows, people] = await Promise.all([
    db
      .select({
        entryId: e.id,
        status: e.status,
        rating: e.rating,
        playtimeMin: entryPlaytime,
        game: g,
      })
      .from(e)
      .innerJoin(g, eq(g.id, e.gameId))
      .where(and(eq(e.userId, userId), q ? sql`${g.name} ilike ${`%${q}%`}` : undefined))
      .orderBy(
        q ? sql`similarity(lower(${g.name}), lower(${q})) desc` : desc(e.updatedAt),
        desc(e.updatedAt),
      )
      .limit(6),
    db
      .select({
        username: user.displayUsername,
        name: user.name,
        image: user.image,
        games: sql<number>`count(${e.id})::int`,
      })
      .from(user)
      .leftJoin(e, eq(e.userId, user.id))
      .where(
        and(
          ne(user.id, userId),
          isNotNull(user.displayUsername),
          q
            ? sql`(${user.displayUsername} ilike ${`%${q}%`} or ${user.name} ilike ${`%${q}%`})`
            : undefined,
        ),
      )
      .groupBy(user.id)
      .orderBy(desc(sql`count(${e.id})`))
      .limit(4),
  ]);
  return {
    games: gameRows.map((row) => ({
      entryId: row.entryId,
      ...briefOf(row.game),
      status: row.status,
      rating: row.rating === null ? null : ratingFromStored(row.rating),
      hours: hours(row.playtimeMin),
    })),
    people: people.map((person) => ({
      username: person.username ?? "",
      name: person.name,
      image: person.image,
      games: person.games,
    })),
  };
}
