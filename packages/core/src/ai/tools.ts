import { schema } from "@my-games/db";
import { entryStatuses, ratingFromStored } from "@my-games/shared";
import { tool } from "ai";
import { and, asc, desc, eq, ilike, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { listLibrary } from "../library";
import { compareUsers, userStats } from "../stats";
import { findUserByUsername } from "../users";

const { libraryEntries: e, games: g, user } = schema;

/** Model için sade değerler: süre saat, puan 0–10. */
const hours = (minutes: number | null | undefined) => Math.round(((minutes ?? 0) / 60) * 10) / 10;
const rating = (stored: number | null | undefined) =>
  stored === null || stored === undefined ? null : ratingFromStored(stored);

async function resolveUser(currentUserId: string, username?: string) {
  if (!username) return { id: currentUserId };
  const found = await findUserByUsername(username.replace(/^@/, ""));
  return found ? { id: found.id } : null;
}

/**
 * Asistanın salt-okunur tool'ları. İstek başına üretilir; mevcut kullanıcı closure ile verilir. Veri
 * değiştiren tool'lar bilerek yok (ileride öneri → onay kutusu akışıyla eklenecek).
 */
export function createTools(currentUserId: string) {
  return {
    searchLibrary: tool({
      description:
        "Search a user's game library. Use it to answer questions about what someone has played, finished, rated or is playing.",
      inputSchema: z.object({
        username: z.string().optional().describe("Username without @. Omit for the current user."),
        query: z.string().optional().describe("Part of a game name."),
        status: z.enum(entryStatuses).optional(),
        sort: z
          .enum(["updated", "rating", "playtime", "last_played", "finished", "name"])
          .optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ username, query, status, sort, limit }) => {
        const owner = await resolveUser(currentUserId, username);
        if (!owner) return { error: "user_not_found" };
        const result = await listLibrary(owner.id, { q: query, status, sort, limit: limit ?? 20 });
        return {
          total: result.total,
          statusCounts: result.statusCounts,
          games: result.items.map((item) => ({
            name: item.game.name,
            status: item.status,
            rating: rating(item.rating),
            hoursPlayed: hours(item.playtimeMin),
            finishedAt: item.finishedAt,
            lastPlayedAt: item.lastPlayedAt,
            favorite: item.isFavorite,
            review: item.review ? item.review.slice(0, 300) : null,
          })),
        };
      },
    }),

    getStats: tool({
      description:
        "Get aggregate statistics for a user: totals, statuses, platforms, genres, most played.",
      inputSchema: z.object({ username: z.string().optional() }),
      execute: async ({ username }) => {
        const owner = await resolveUser(currentUserId, username);
        if (!owner) return { error: "user_not_found" };
        const stats = await userStats(owner.id);
        return {
          totals: {
            ...stats.totals,
            hoursPlayed: hours(stats.totals.playtimeMin),
            averageRating: rating(stats.totals.averageRating),
          },
          byStatus: stats.status.map((item) => ({ status: item.key, games: item.count })),
          byPlatform: stats.platform.map((item) => ({ platform: item.key, games: item.count })),
          genres: stats.terms.genres
            .slice(0, 8)
            .map((item) => ({ genre: item.key, games: item.count })),
          mostPlayed: stats.topPlayed
            .slice(0, 5)
            .map((item) => ({ name: item.name, hours: hours(item.playtimeMin) })),
          backlog: {
            games: stats.backlog.count,
            estimatedHours: hours(stats.backlog.timeToBeatMin),
          },
        };
      },
    }),

    getGame: tool({
      description:
        "Look up a game in the catalog: summary, genres, time to beat, community rating and who tracks it.",
      inputSchema: z.object({ name: z.string().min(2) }),
      execute: async ({ name }) => {
        const [game] = await db
          .select()
          .from(g)
          .where(ilike(g.name, `%${name}%`))
          .orderBy(sql`similarity(lower(${g.name}), lower(${name})) desc`)
          .limit(1);
        if (!game) return { error: "game_not_found" };
        const [community] = await db
          .select({
            players: sql<number>`count(*)::int`,
            averageRating: sql<number | null>`round(avg(${e.rating}))::int`,
          })
          .from(e)
          .where(eq(e.gameId, game.id));
        const [mine] = await db
          .select({
            status: e.status,
            rating: e.rating,
            playtimeMin: sql<number>`${e.playtimeManualMin} + coalesce(${e.playtimeSteamMin}, 0)`,
          })
          .from(e)
          .where(and(eq(e.gameId, game.id), eq(e.userId, currentUserId)));
        return {
          name: game.name,
          releaseDate: game.releaseDate,
          summary: game.summary?.slice(0, 600) ?? null,
          timeToBeatHours: {
            main: game.timeToBeatHastily ? hours(game.timeToBeatHastily / 60) : null,
            mainPlusExtras: game.timeToBeatNormally ? hours(game.timeToBeatNormally / 60) : null,
            completionist: game.timeToBeatCompletely ? hours(game.timeToBeatCompletely / 60) : null,
          },
          community: {
            players: community?.players ?? 0,
            averageRating: rating(community?.averageRating),
          },
          currentUser: mine
            ? {
                status: mine.status,
                rating: rating(mine.rating),
                hoursPlayed: hours(mine.playtimeMin),
              }
            : null,
        };
      },
    }),

    compareWithUser: tool({
      description:
        "Compare the current user's taste with another user: shared games, rating agreement, compatibility.",
      inputSchema: z.object({ username: z.string() }),
      execute: async ({ username }) => {
        const other = await resolveUser(currentUserId, username);
        if (!other) return { error: "user_not_found" };
        const result = await compareUsers(currentUserId, other.id);
        const brief = (row: (typeof result.shared)[number]) => ({
          name: row.name,
          currentUserRating: rating(row.a.rating),
          otherRating: rating(row.b.rating),
        });
        return {
          counts: result.counts,
          compatibilityPercent: result.compatibility,
          bothLoved: result.agreements.slice(0, 5).map(brief),
          biggestDisagreements: result.disagreements.slice(0, 5).map(brief),
        };
      },
    }),

    suggestFromBacklog: tool({
      description:
        "List games from the current user's backlog/wishlist with their time to beat, to help pick what to play next.",
      inputSchema: z.object({
        maxHours: z
          .number()
          .positive()
          .optional()
          .describe("Only games that take at most this many hours."),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ maxHours, limit }) => {
        const rows = await db
          .select({
            name: g.name,
            status: e.status,
            ttb: g.timeToBeatNormally,
            rating: g.rating,
            releaseDate: g.releaseDate,
          })
          .from(e)
          .innerJoin(g, eq(g.id, e.gameId))
          .where(
            and(
              eq(e.userId, currentUserId),
              inArray(e.status, ["backlog", "wishlist", "paused"]),
              maxHours
                ? sql`(${g.timeToBeatNormally} is null or ${g.timeToBeatNormally} <= ${maxHours * 3600})`
                : undefined,
            ),
          )
          .orderBy(asc(sql`coalesce(${g.timeToBeatNormally}, 999999999)`))
          .limit(limit ?? 15);
        return rows.map((row) => ({
          name: row.name,
          status: row.status,
          hoursToBeat: row.ttb ? hours(row.ttb / 60) : null,
          criticRating: row.rating ? Math.round(row.rating) / 10 : null,
          releaseYear: row.releaseDate?.slice(0, 4) ?? null,
        }));
      },
    }),

    listPlayers: tool({
      description:
        "List other players on My Games with how many games they track (to find someone to compare with).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(30).optional() }),
      execute: async ({ limit }) =>
        db
          .select({
            username: user.displayUsername,
            name: user.name,
            games: sql<number>`count(${e.id})::int`,
          })
          .from(user)
          .leftJoin(e, eq(e.userId, user.id))
          .where(isNotNull(user.displayUsername))
          .groupBy(user.id)
          .orderBy(desc(sql`count(${e.id})`))
          .limit(limit ?? 10),
    }),
  };
}

export type AssistantTools = ReturnType<typeof createTools>;
