import { schema } from "@my-games/db";
import { entryStatuses, ratingFromStored } from "@my-games/shared";
import { type InferUITools, type ToolApprovalStatus, tool } from "ai";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { entryAchievements } from "../achievements";
import { searchCatalog } from "../catalog";
import { db } from "../db";
import { librarySorts, listLibrary } from "../library";
import { type LibraryFilter, normalizeFilter } from "../library-filter";
import { entryPlaytime } from "../playtime";
import { ruleFor } from "../proposals";
import { compareUsers, userStats } from "../stats";
import { findUserByUsername } from "../users";
import {
  applyAddToLibrary,
  applyEntryUpdate,
  applyResolveInbox,
  briefOf,
  type EntryPatch,
  inboxSummary,
  previewAddToLibrary,
  previewEntryUpdate,
  previewResolveInbox,
} from "./actions";

const { libraryEntries: e, games: g, user, playSessions, gameTerms, terms } = schema;

export type ToolContext = { userId: string; locale: string };

/** Model için sade değerler: süre saat (tek ondalık), puan 0–10. */
const hours = (minutes: number | null | undefined) => Math.round(((minutes ?? 0) / 60) * 10) / 10;
const rating = (stored: number | null | undefined) =>
  stored === null || stored === undefined ? null : ratingFromStored(stored);

async function resolveOwner(ctx: ToolContext, username?: string) {
  if (!username) {
    const [self] = await db.select().from(user).where(eq(user.id, ctx.userId));
    return self
      ? {
          id: self.id,
          username: self.displayUsername ?? self.username ?? "",
          name: self.name,
          self: true,
        }
      : null;
  }
  const found = await findUserByUsername(username.replace(/^@/, ""));
  return found
    ? {
        id: found.id,
        username: found.displayUsername ?? found.username ?? "",
        name: found.name,
        self: found.id === ctx.userId,
      }
    : null;
}

/** Kullanıcının kendi kaydı: kimlikle ya da adın bir parçasıyla (en yakın eşleşme). */
async function findOwnEntry(ctx: ToolContext, input: { entryId?: string; game?: string }) {
  const base = db.select({ entryId: e.id, gameId: g.id }).from(e).innerJoin(g, eq(g.id, e.gameId));
  if (input.entryId) {
    const [row] = await base.where(and(eq(e.id, input.entryId), eq(e.userId, ctx.userId)));
    return row ?? null;
  }
  if (input.game) {
    const [row] = await base
      .where(and(eq(e.userId, ctx.userId), ilike(g.name, `%${input.game}%`)))
      .orderBy(sql`similarity(lower(${g.name}), lower(${input.game})) desc`)
      .limit(1);
    return row ?? null;
  }
  return null;
}

const statusEnum = z.enum(entryStatuses);
const ratingInput = z.number().min(0).max(10);
const isoDate = z.iso.date();

const entryPatchShape = {
  status: statusEnum.optional(),
  rating: ratingInput
    .nullable()
    .optional()
    .describe("0–10 with one decimal. null removes the rating."),
  review: z
    .string()
    .max(5000)
    .nullable()
    .optional()
    .describe("Full review text (replaces the old one)."),
  favorite: z.boolean().optional(),
  startedAt: isoDate.nullable().optional(),
  finishedAt: isoDate.nullable().optional(),
  playtimeHours: z
    .number()
    .min(0)
    .max(100_000)
    .optional()
    .describe("Manually tracked hours. Platform-synced hours are separate and never change."),
};

const entryUpdateInput = z.object({ entryId: z.uuid(), ...entryPatchShape });

function patchOf(input: EntryPatch): EntryPatch {
  const { status, rating, review, favorite, startedAt, finishedAt, playtimeHours } = input;
  return { status, rating, review, favorite, startedAt, finishedAt, playtimeHours };
}

/**
 * Asistanın tool'ları. İstek başına üretilir; kullanıcı closure ile verilir. Çıktılar arayüzde kart olarak
 * gösterilir (kapaklar, grafikler, öneri kartları), bu yüzden kimlik ve görsel alanları taşır; metin için
 * gereken sade değerler de (saat, 0–10 puan) yanındadır.
 */
export function createTools(ctx: ToolContext) {
  return {
    queryLibrary: tool({
      description:
        "Find games in a user's library with filters (status, rating range, hours range, genre, finish year, favorites, name) and sorting. Use it for any 'which games…' / 'list my…' question. The result is shown as a cover grid the user can save as a smart list.",
      inputSchema: z.object({
        username: z.string().optional().describe("Username without @. Omit for the current user."),
        statuses: z.array(statusEnum).optional(),
        minRating: ratingInput.optional(),
        maxRating: ratingInput.optional(),
        unrated: z.boolean().optional(),
        minHours: z.number().min(0).optional(),
        maxHours: z.number().min(0).optional(),
        favorite: z.boolean().optional(),
        finishedYear: z.number().int().optional(),
        genre: z
          .string()
          .optional()
          .describe("Genre or theme name in English, e.g. RPG, Strategy, Horror."),
        query: z.string().optional().describe("Part of a game name."),
        sort: z.enum(librarySorts).optional(),
        order: z.enum(["asc", "desc"]).optional(),
        limit: z.number().int().min(1).max(30).optional(),
        title: z
          .string()
          .max(40)
          .optional()
          .describe("Short name for this result in the user's language, e.g. 'Başyapıtlarım'."),
      }),
      execute: async (input) => {
        const owner = await resolveOwner(ctx, input.username);
        if (!owner) return { error: "user_not_found" as const };
        const filter: LibraryFilter = normalizeFilter({
          statuses: input.statuses?.length ? input.statuses : undefined,
          minRating: input.minRating,
          maxRating: input.maxRating,
          unrated: input.unrated || undefined,
          minHours: input.minHours,
          maxHours: input.maxHours,
          favorite: input.favorite || undefined,
          finishedYear: input.finishedYear,
          genre: input.genre?.trim() || undefined,
          q: input.query?.trim() || undefined,
        });
        const sort = input.sort ?? (filter.minRating !== undefined ? "rating" : "updated");
        const result = await listLibrary(owner.id, {
          filter,
          sort,
          order: input.order,
          limit: input.limit ?? 12,
        });
        return {
          title: input.title?.trim() || null,
          owner: { username: owner.username, name: owner.name, self: owner.self },
          total: result.total,
          filter,
          sort,
          games: result.items.map((item) => ({
            entryId: item.id,
            gameId: item.game.id,
            slug: item.game.slug,
            name: item.game.name,
            coverUrl: item.game.coverUrl,
            accentColor: item.game.accentColor,
            status: item.status,
            rating: rating(item.rating),
            hours: hours(item.playtimeMin),
            finishedAt: item.finishedAt,
            lastPlayedAt: item.lastPlayedAt?.toISOString() ?? null,
            favorite: item.isFavorite,
          })),
        };
      },
    }),

    getStats: tool({
      description:
        "Aggregate statistics for a user: totals, statuses, platforms, genres, most played games, backlog size.",
      inputSchema: z.object({ username: z.string().optional() }),
      execute: async ({ username }) => {
        const owner = await resolveOwner(ctx, username);
        if (!owner) return { error: "user_not_found" as const };
        const stats = await userStats(owner.id);
        return {
          owner: { username: owner.username, name: owner.name, self: owner.self },
          totals: {
            games: stats.totals.games,
            completed: stats.totals.completed,
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
        "Look up a game in the catalog: summary, genres, modes, time to beat, community rating, the current user's entry and other players' ratings.",
      inputSchema: z.object({
        gameId: z.uuid().optional(),
        name: z.string().min(2).optional(),
      }),
      execute: async ({ gameId, name }) => {
        const [game] = gameId
          ? await db.select().from(g).where(eq(g.id, gameId))
          : name
            ? await db
                .select()
                .from(g)
                .where(ilike(g.name, `%${name}%`))
                .orderBy(sql`similarity(lower(${g.name}), lower(${name})) desc`)
                .limit(1)
            : [];
        if (!game) return { error: "game_not_found" as const };
        const [termRows, [community], [mine], players] = await Promise.all([
          db
            .select({ kind: terms.kind, name: terms.name })
            .from(gameTerms)
            .innerJoin(terms, eq(terms.id, gameTerms.termId))
            .where(
              and(
                eq(gameTerms.gameId, game.id),
                inArray(terms.kind, ["genre", "theme", "game_mode"]),
              ),
            ),
          db
            .select({
              players: sql<number>`count(*)::int`,
              averageRating: sql<number | null>`round(avg(${e.rating}))::int`,
            })
            .from(e)
            .where(eq(e.gameId, game.id)),
          db
            .select({
              entryId: e.id,
              status: e.status,
              rating: e.rating,
              playtimeMin: entryPlaytime,
            })
            .from(e)
            .where(and(eq(e.gameId, game.id), eq(e.userId, ctx.userId))),
          db
            .select({
              username: user.displayUsername,
              name: user.name,
              status: e.status,
              rating: e.rating,
              playtimeMin: entryPlaytime,
            })
            .from(e)
            .innerJoin(user, eq(user.id, e.userId))
            .where(and(eq(e.gameId, game.id), ne(e.userId, ctx.userId)))
            .orderBy(sql`${e.rating} desc nulls last`)
            .limit(5),
        ]);
        const ttb = (seconds: number | null) => (seconds ? hours(seconds / 60) : null);
        return {
          ...briefOf(game),
          heroUrl: game.heroUrl,
          releaseYear: game.releaseDate?.slice(0, 4) ?? null,
          summary: game.summary?.slice(0, 500) ?? null,
          genres: termRows.filter((row) => row.kind !== "game_mode").map((row) => row.name),
          modes: termRows.filter((row) => row.kind === "game_mode").map((row) => row.name),
          timeToBeatHours: {
            main: ttb(game.timeToBeatHastily),
            mainPlusExtras: ttb(game.timeToBeatNormally),
            completionist: ttb(game.timeToBeatCompletely),
          },
          community: {
            players: community?.players ?? 0,
            averageRating: rating(community?.averageRating),
          },
          currentUser: mine
            ? {
                entryId: mine.entryId,
                status: mine.status,
                rating: rating(mine.rating),
                hours: hours(mine.playtimeMin),
              }
            : null,
          otherPlayers: players.map((row) => ({
            username: row.username,
            name: row.name,
            status: row.status,
            rating: rating(row.rating),
            hours: hours(row.playtimeMin),
          })),
        };
      },
    }),

    compareWithUser: tool({
      description:
        "Compare the current user's library and ratings with another user: shared games, who rates higher, compatibility. Shown as a rating comparison chart.",
      inputSchema: z.object({
        username: z.string().describe("The other user's username without @."),
      }),
      execute: async ({ username }) => {
        const [me, other] = await Promise.all([resolveOwner(ctx), resolveOwner(ctx, username)]);
        if (!me || !other) return { error: "user_not_found" as const };
        if (other.self) return { error: "same_user" as const };
        const result = await compareUsers(ctx.userId, other.id);
        const rated = result.shared
          .filter((row) => row.a.rating !== null && row.b.rating !== null)
          .sort(
            (x, y) =>
              Math.abs((y.a.rating ?? 0) - (y.b.rating ?? 0)) -
              Math.abs((x.a.rating ?? 0) - (x.b.rating ?? 0)),
          );
        const youHigher = rated.filter((row) => (row.a.rating ?? 0) > (row.b.rating ?? 0)).length;
        const themHigher = rated.filter((row) => (row.b.rating ?? 0) > (row.a.rating ?? 0)).length;
        const meanGap = rated.length
          ? rated.reduce((sum, row) => sum + ((row.a.rating ?? 0) - (row.b.rating ?? 0)), 0) /
            rated.length /
            10
          : null;
        return {
          you: { username: me.username, name: me.name },
          other: { username: other.username, name: other.name },
          counts: result.counts,
          compatibilityPercent: result.compatibility,
          /** Pozitifse mevcut kullanıcı ortalamada daha yüksek puan veriyor. */
          averageGap: meanGap === null ? null : Math.round(meanGap * 10) / 10,
          youRateHigher: youHigher,
          theyRateHigher: themHigher,
          games: rated.slice(0, 12).map((row) => ({
            gameId: row.gameId,
            slug: row.slug,
            name: row.name,
            coverUrl: row.coverUrl,
            you: {
              rating: rating(row.a.rating),
              status: row.a.status,
              hours: hours(row.a.playtimeMin),
            },
            them: {
              rating: rating(row.b.rating),
              status: row.b.status,
              hours: hours(row.b.playtimeMin),
            },
          })),
        };
      },
    }),

    getAchievements: tool({
      description:
        "The current user's achievements for one of their games: progress, the remaining ones (most common first, so usually easiest first) and the latest unlocked.",
      inputSchema: z.object({
        entryId: z.uuid().optional(),
        game: z.string().optional().describe("Game name if entryId is unknown."),
      }),
      execute: async (input) => {
        const found = await findOwnEntry(ctx, input);
        if (!found) return { error: "entry_not_found" as const };
        const [game] = await db.select().from(g).where(eq(g.id, found.gameId));
        const sets = (await entryAchievements(found.entryId, ctx.locale)) ?? [];
        const items = sets.flatMap((set) =>
          set.items.map((item) => ({ ...item, provider: set.provider })),
        );
        const remaining = items
          .filter((item) => !item.unlocked)
          .sort((a, b) => (b.rarity ?? -1) - (a.rarity ?? -1))
          .slice(0, 15)
          .map((item) => ({
            id: `${item.provider}:${item.apiName}`,
            name: item.name || null,
            description: item.description,
            hidden: item.hidden,
            rarityPercent: item.rarity === null ? null : Math.round(item.rarity * 10) / 10,
            iconUrl: item.iconUrl,
          }));
        const recent = items
          .filter((item) => item.unlocked)
          .slice(0, 5)
          .map((item) => ({
            id: `${item.provider}:${item.apiName}`,
            name: item.name,
            unlockedAt: item.unlockedAt,
            rarityPercent: item.rarity === null ? null : Math.round(item.rarity * 10) / 10,
            iconUrl: item.iconUrl,
          }));
        return {
          entryId: found.entryId,
          game: game ? briefOf(game) : null,
          unlocked: sets.reduce((sum, set) => sum + set.unlocked, 0),
          total: sets.reduce((sum, set) => sum + set.total, 0),
          remaining,
          recent,
        };
      },
    }),

    getPlayHistory: tool({
      description:
        "Play sessions over the last N days, optionally for one game: total hours, weekly totals, recent sessions, most played games. Use for 'how much did I play…', 'when did I last play…'.",
      inputSchema: z.object({
        entryId: z.uuid().optional(),
        game: z.string().optional(),
        days: z.number().int().min(1).max(365).optional().describe("Default 30."),
      }),
      execute: async (input) => {
        const days = input.days ?? 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const found = input.entryId || input.game ? await findOwnEntry(ctx, input) : null;
        if ((input.entryId || input.game) && !found) return { error: "entry_not_found" as const };
        const where = and(
          eq(playSessions.userId, ctx.userId),
          gte(playSessions.endedAt, since),
          found ? eq(playSessions.gameId, found.gameId) : undefined,
        );
        const [sessions, weekly, perGame, [last]] = await Promise.all([
          db
            .select({
              name: g.name,
              startedAt: playSessions.startedAt,
              minutes: playSessions.durationMin,
            })
            .from(playSessions)
            .innerJoin(g, eq(g.id, playSessions.gameId))
            .where(where)
            .orderBy(desc(playSessions.startedAt))
            .limit(8),
          db
            .select({
              week: sql<string>`to_char(date_trunc('week', ${playSessions.startedAt}), 'YYYY-MM-DD')`,
              minutes: sql<number>`sum(${playSessions.durationMin})::int`,
            })
            .from(playSessions)
            .where(where)
            .groupBy(sql`1`)
            .orderBy(asc(sql`1`)),
          found
            ? Promise.resolve([])
            : db
                .select({
                  name: g.name,
                  minutes: sql<number>`sum(${playSessions.durationMin})::int`,
                })
                .from(playSessions)
                .innerJoin(g, eq(g.id, playSessions.gameId))
                .where(where)
                .groupBy(g.name)
                .orderBy(desc(sql`sum(${playSessions.durationMin})`))
                .limit(5),
          found
            ? db
                .select({ lastPlayedAt: e.lastPlayedAt, name: g.name })
                .from(e)
                .innerJoin(g, eq(g.id, e.gameId))
                .where(eq(e.id, found.entryId))
            : Promise.resolve([]),
        ]);
        return {
          days,
          game: last?.name ?? null,
          lastPlayedAt: last?.lastPlayedAt?.toISOString() ?? null,
          totalHours: hours(weekly.reduce((sum, row) => sum + row.minutes, 0)),
          weeks: weekly.map((row) => ({ weekStart: row.week, hours: hours(row.minutes) })),
          recentSessions: sessions.map((row) => ({
            game: row.name,
            startedAt: row.startedAt.toISOString(),
            minutes: row.minutes,
          })),
          topGames: perGame.map((row) => ({ name: row.name, hours: hours(row.minutes) })),
        };
      },
    }),

    suggestFromBacklog: tool({
      description:
        "Candidates to play next from the current user's backlog, paused and wishlist games, with time to beat and genres. For a quick guided pick the app also has a dedicated 'Ne oynasam?' deck.",
      inputSchema: z.object({
        maxHours: z
          .number()
          .positive()
          .optional()
          .describe("Only games that take at most this many hours."),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ maxHours, limit }) => {
        const rows = await db
          .select({
            entryId: e.id,
            status: e.status,
            playtimeMin: entryPlaytime,
            game: g,
          })
          .from(e)
          .innerJoin(g, eq(g.id, e.gameId))
          .where(
            and(
              eq(e.userId, ctx.userId),
              inArray(e.status, ["backlog", "wishlist", "paused"]),
              maxHours
                ? sql`(${g.timeToBeatNormally} is null or ${g.timeToBeatNormally} <= ${maxHours * 3600})`
                : undefined,
            ),
          )
          .orderBy(asc(sql`coalesce(${g.timeToBeatNormally}, 999999999)`))
          .limit(limit ?? 10);
        return rows.map((row) => ({
          entryId: row.entryId,
          ...briefOf(row.game),
          status: row.status,
          hoursPlayed: hours(row.playtimeMin),
          hoursToBeat: row.game.timeToBeatNormally ? hours(row.game.timeToBeatNormally / 60) : null,
          criticRating: row.game.rating ? Math.round(row.game.rating) / 10 : null,
          releaseYear: row.game.releaseDate?.slice(0, 4) ?? null,
        }));
      },
    }),

    listInbox: tool({
      description:
        "The current user's pending approvals (changes proposed by Steam/PSN/Xbox sync, catalog matching or earlier suggestions).",
      inputSchema: z.object({}),
      execute: async () => {
        const items = await inboxSummary(ctx.userId);
        return { count: items.length, items };
      },
    }),

    listPlayers: tool({
      description:
        "Other players on My games with how many games they track (to find someone to compare with).",
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
          .where(and(isNotNull(user.displayUsername), ne(user.id, ctx.userId)))
          .groupBy(user.id)
          .orderBy(desc(sql`count(${e.id})`))
          .limit(limit ?? 10),
    }),

    searchCatalog: tool({
      description:
        "Search the game catalog (IGDB) by name. Use before addToLibrary to get the exact gameId or igdbId.",
      inputSchema: z.object({ query: z.string().min(2).max(100) }),
      execute: async ({ query }) => {
        const results = await searchCatalog(query, ctx.userId);
        return results.slice(0, 6).map((result) => ({
          gameId: result.gameId,
          igdbId: result.igdbId,
          name: result.name,
          releaseYear: result.releaseYear,
          coverUrl: result.coverUrl,
          inLibrary: result.inLibrary,
        }));
      },
    }),

    updateEntry: tool({
      description:
        "Change one of the current user's library entries (status, rating, review, favorite, dates, manual hours). Pass only the fields that change. The user sees it as a proposal card and must approve it.",
      inputSchema: entryUpdateInput,
      execute: async (input) => applyEntryUpdate(ctx.userId, input.entryId, patchOf(input)),
    }),

    addToLibrary: tool({
      description:
        "Add a game to the current user's library. Needs a gameId or igdbId from searchCatalog. The user must approve it.",
      inputSchema: z
        .object({
          gameId: z.uuid().optional(),
          igdbId: z.number().int().positive().optional(),
          status: statusEnum,
          rating: ratingInput.nullable().optional(),
          review: z.string().max(5000).nullable().optional(),
          favorite: z.boolean().optional(),
          playtimeHours: z.number().min(0).max(100_000).optional(),
        })
        .refine((value) => value.gameId || value.igdbId, {
          message: "gameId or igdbId is required",
        }),
      execute: async (input) => applyAddToLibrary(ctx.userId, input),
    }),

    resolveInbox: tool({
      description:
        "Approve or reject pending approvals by id (from listInbox). The user must approve this action.",
      inputSchema: z.object({
        proposalIds: z.array(z.uuid()).min(1).max(20),
        action: z.enum(["approve", "reject"]),
      }),
      execute: async ({ proposalIds, action }) => {
        const results = await applyResolveInbox(ctx.userId, proposalIds, action);
        return { action, results };
      },
    }),
  };
}

export type AssistantTools = ReturnType<typeof createTools>;
export type AssistantUITools = InferUITools<AssistantTools>;
export type AssistantToolName = keyof AssistantTools;

export const WRITE_TOOLS = [
  "updateEntry",
  "addToLibrary",
  "resolveInbox",
] as const satisfies AssistantToolName[];
export const READ_TOOLS = [
  "queryLibrary",
  "getStats",
  "getGame",
  "compareWithUser",
  "getAchievements",
  "getPlayHistory",
  "suggestFromBacklog",
  "listInbox",
  "listPlayers",
  "searchCatalog",
] as const satisfies AssistantToolName[];

/**
 * Onay önizlemesi: kartın gösterdiği oyun ve "önce → sonra" farkı. Onay isteğinin `reason` alanında JSON
 * olarak taşınır (istemci ayrıştırır); böylece kart, öneri anındaki değerleri ek istek atmadan gösterir.
 */
export type ApprovalPreview =
  | {
      kind: "entry";
      game: ReturnType<typeof briefOf>;
      entryId?: string;
      changes: Array<{ field: string; from: unknown; to: unknown }>;
    }
  | {
      kind: "inbox";
      action: "approve" | "reject";
      items: Awaited<ReturnType<typeof previewResolveInbox>>;
    };

/**
 * Yazma tool'larının onay politikası. Kullanıcının `ai:*` kuralı (Ayarlar › onay kuralları) uygulanır:
 * `ask` kart gösterir, `auto` onaysız uygular, `ignore` reddeder. Geçersiz istek (kayıt yok, değişiklik yok)
 * gerekçesiyle reddedilir; model gerekçeyi görür ve düzeltir.
 */
export function toolApprovals(ctx: ToolContext) {
  async function decide(
    kind: "entry_update" | "entry_create",
    preview: ApprovalPreview,
  ): Promise<ToolApprovalStatus> {
    const rule = await ruleFor(db, ctx.userId, "ai", kind);
    if (rule === "ignore") {
      return {
        type: "denied",
        reason: "The user turned off assistant changes in their approval rules.",
      };
    }
    return {
      type: rule === "auto" ? "approved" : "user-approval",
      reason: JSON.stringify(preview),
    };
  }

  return {
    updateEntry: async (input: z.infer<typeof entryUpdateInput>) => {
      const preview = await previewEntryUpdate(ctx.userId, input.entryId, patchOf(input));
      if (!preview.ok)
        return { type: "denied", reason: preview.reason } satisfies ToolApprovalStatus;
      return decide("entry_update", {
        kind: "entry",
        game: preview.game,
        entryId: preview.entryId,
        changes: preview.changes,
      });
    },
    addToLibrary: async (input: Parameters<typeof previewAddToLibrary>[1]) => {
      const preview = await previewAddToLibrary(ctx.userId, input);
      if (!preview.ok)
        return { type: "denied", reason: preview.reason } satisfies ToolApprovalStatus;
      return decide("entry_create", {
        kind: "entry",
        game: preview.game,
        changes: preview.changes,
      });
    },
    resolveInbox: async (input: { proposalIds: string[]; action: "approve" | "reject" }) => {
      const items = await previewResolveInbox(ctx.userId, input.proposalIds);
      if (items.length === 0) {
        return {
          type: "denied",
          reason: "None of these approvals are pending anymore.",
        } satisfies ToolApprovalStatus;
      }
      return {
        type: "user-approval",
        reason: JSON.stringify({
          kind: "inbox",
          action: input.action,
          items,
        } satisfies ApprovalPreview),
      } satisfies ToolApprovalStatus;
    },
  };
}
