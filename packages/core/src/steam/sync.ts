import { schema } from "@my-games/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { type AchievementDef, getAchievementSet, isSetStale } from "../achievements";
import { ensureSteamGame, findGameBySteamApp } from "../catalog";
import { db } from "../db";
import { mergeGameInto } from "../matching";
import {
  type AchievementFetch,
  applyPlatformTitles,
  type EngineEntry,
  loadEngineEntries,
  type PlatformTitle,
} from "../platforms/engine";
import { titleSimilarity } from "../text";
import {
  getGlobalAchievementPercentages,
  getOwnedGames,
  getPlayerAchievements,
  getSchemaForGame,
  SteamPrivateError,
} from "./api";
import { syncSteamScreenshots } from "./screenshots";

const { steamAccounts, games, syncRuns, gameExternalIds } = schema;

const LEGACY_MATCH_SCORE = 0.92;
/** Steam Web API günlük 100.000 istek; ilk bağlantıda büyük kütüphaneler birkaç sync'e yayılır. */
const MAX_ACHIEVEMENT_CHECKS = 100;

/**
 * Steam kimliği olmayan (eski veri / elle eklenmiş) bir kaydı Steam uygulamasına bağlar. Aynı Steam
 * uygulaması katalogda zaten varsa eski oyun ona birleştirilir.
 */
async function linkLegacyEntry(entry: EngineEntry, appId: number): Promise<EngineEntry> {
  const existing = await findGameBySteamApp(db, appId);
  if (existing) {
    await db.transaction((tx) => mergeGameInto(tx, entry.gameId, existing.id));
    return { ...entry, gameId: existing.id, steamAppId: appId };
  }
  await db
    .update(games)
    .set({ steamAppId: appId })
    .where(and(eq(games.id, entry.gameId), isNull(games.steamAppId)));
  return { ...entry, steamAppId: appId };
}

/** Oyunun Steam başarım tanımları: İngilizce + Türkçe adlar, ikonlar ve açılma yüzdeleri. */
async function steamAchievementDefs(appId: number, fallback: string[]): Promise<AchievementDef[]> {
  const [english, turkish, percentages] = await Promise.all([
    getSchemaForGame(appId, "english"),
    getSchemaForGame(appId, "turkish").catch(() => null),
    getGlobalAchievementPercentages(appId).catch(() => new Map<string, number>()),
  ]);
  if (!english?.length) {
    // Şema okunamadı (nadiren): en azından sayılar ve açılma zamanları tutulur.
    return fallback.map((apiName) => ({
      apiName,
      name: apiName,
      description: null,
      iconUrl: null,
      hidden: false,
      rarity: percentages.get(apiName) ?? null,
    }));
  }
  const turkishByName = new Map((turkish ?? []).map((row) => [row.name, row]));
  return english.map((row) => {
    const tr = turkishByName.get(row.name);
    const localized =
      tr && (tr.displayName !== row.displayName || tr.description !== row.description)
        ? { tr: { name: tr.displayName, description: tr.description ?? null } }
        : null;
    return {
      apiName: row.name,
      name: row.displayName || row.name,
      description: row.description ?? null,
      localized,
      iconUrl: row.icon ?? null,
      iconLockedUrl: row.icongray ?? null,
      hidden: row.hidden === 1,
      rarity: percentages.get(row.name) ?? null,
    };
  });
}

async function fetchSteamAchievements(
  steamId: string,
  title: PlatformTitle,
): Promise<AchievementFetch | null> {
  const appId = Number(title.externalId);
  const player = await getPlayerAchievements(steamId, appId);
  if (!player) return null;
  const set = await getAchievementSet(db, "steam", title.externalId);
  const defs = isSetStale(set, player.length)
    ? await steamAchievementDefs(
        appId,
        player.map((row) => row.apiname),
      )
    : null;
  return {
    gameKey: title.externalId,
    defs,
    total: player.length,
    unlocked: player
      .filter((row) => row.achieved === 1)
      .map((row) => ({
        apiName: row.apiname,
        unlockedAt: row.unlocktime ? new Date(row.unlocktime * 1000) : null,
      })),
  };
}

/**
 * Bir kullanıcının Steam kütüphanesini senkronize eder (süre, son oynama, başarımlar, yeni oyun ve durum
 * önerileri), ardından Steam'de herkese açık paylaştığı ekran görüntülerini içe aktarır.
 */
export async function syncSteamUser(userId: string) {
  const [account] = await db.select().from(steamAccounts).where(eq(steamAccounts.userId, userId));
  if (!account?.syncEnabled) return { skipped: true as const };

  const [run] = await db
    .insert(syncRuns)
    .values({ userId, source: "steam" })
    .returning({ id: syncRuns.id });
  const now = new Date();
  let stats: Record<string, number> = { owned: 0, played: 0, linkedLegacy: 0 };
  let pending = 0;

  try {
    const owned = await getOwnedGames(account.steamId);
    const played = owned.filter((game) => game.playtime_forever > 0);
    stats.owned = owned.length;
    stats.played = played.length;

    const entries = await loadEngineEntries(userId);
    const byApp = new Map(
      entries.filter((entry) => entry.steamAppId).map((entry) => [entry.steamAppId, entry]),
    );
    // Aynı oyunun ek Steam kimlikleri. Asıl app de oynanmışsa süre ondan okunur (ikisi birbirini ezmesin).
    const playedApps = new Set(played.map((game) => game.appid));
    const byGame = new Map(entries.map((entry) => [entry.gameId, entry]));
    const aliases = entries.length
      ? await db
          .select({ appId: gameExternalIds.externalId, gameId: gameExternalIds.gameId })
          .from(gameExternalIds)
          .where(
            and(
              eq(gameExternalIds.provider, "steam"),
              inArray(
                gameExternalIds.gameId,
                entries.map((entry) => entry.gameId),
              ),
            ),
          )
      : [];
    for (const alias of aliases) {
      const entry = byGame.get(alias.gameId);
      if (entry && !(entry.steamAppId && playedApps.has(entry.steamAppId))) {
        byApp.set(Number(alias.appId), entry);
      }
    }
    const unlinked = entries.filter((entry) => !entry.steamAppId);

    const titles: PlatformTitle[] = played.map((game) => ({
      externalId: String(game.appid),
      name: game.name ?? `Steam ${game.appid}`,
      playtimeMin: game.playtime_forever,
      lastPlayedAt: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null,
      recentlyPlayed: (game.playtime_2weeks ?? 0) > 0,
      hasAchievements: game.has_community_visible_stats === true,
      achievementsUnlocked: null,
    }));

    const result = await applyPlatformTitles({
      userId,
      titles,
      lastSyncedAt: account.lastSyncedAt,
      now,
      spec: {
        provider: "steam",
        playtimeField: "playtimeSteamMin",
        sessionSource: "steam_delta",
        newEntry: { store: "steam", platform: "pc" },
        maxAchievementChecks: MAX_ACHIEVEMENT_CHECKS,
        findEntry: async (title) => {
          const appId = Number(title.externalId);
          const entry = byApp.get(appId);
          if (entry) return entry;
          // Eski/elle eklenmiş kayıtlar ad benzerliğiyle Steam uygulamasına bağlanır.
          const best = unlinked
            .map((candidate) => ({ candidate, score: titleSimilarity(candidate.name, title.name) }))
            .sort((a, b) => b.score - a.score)[0];
          if (!best || best.score < LEGACY_MATCH_SCORE) return undefined;
          const linked = await linkLegacyEntry(best.candidate, appId);
          unlinked.splice(unlinked.indexOf(best.candidate), 1);
          byApp.set(appId, linked);
          stats.linkedLegacy = (stats.linkedLegacy ?? 0) + 1;
          return linked;
        },
        ensureGame: async (title) => {
          const game = await ensureSteamGame(Number(title.externalId), title.name);
          // App, kütüphanedeki bir oyunun ek Steam kimliği çıktı (asıl app'i de oynanıyor): öneri yok.
          return byGame.has(game.id) ? null : game;
        },
        fetchAchievements: (title) => fetchSteamAchievements(account.steamId, title),
      },
    });
    stats = { ...stats, ...result.stats };
    pending = result.pending;

    await db
      .update(steamAccounts)
      .set({ lastSyncedAt: now, lastSyncError: null })
      .where(eq(steamAccounts.userId, userId));
    const screenshots = await syncSteamScreenshots(userId).catch((error: unknown) => {
      console.warn("[steam] ekran görüntüleri alınamadı", userId, error);
      return null;
    });
    if (screenshots) stats.screenshots = screenshots.imported;

    if (run) {
      await db
        .update(syncRuns)
        .set({ finishedAt: new Date(), ok: true, stats })
        .where(eq(syncRuns.id, run.id));
    }
    return { skipped: false as const, stats, pending };
  } catch (error) {
    const message =
      error instanceof SteamPrivateError
        ? "private"
        : error instanceof Error
          ? error.message
          : String(error);
    await db
      .update(steamAccounts)
      .set({ lastSyncError: message })
      .where(eq(steamAccounts.userId, userId));
    if (run) {
      await db
        .update(syncRuns)
        .set({ finishedAt: new Date(), ok: false, error: message, stats })
        .where(eq(syncRuns.id, run.id));
    }
    if (error instanceof SteamPrivateError)
      return { skipped: false as const, stats, pending, error: message };
    throw error;
  }
}

/** Son senkronizasyonu `hours` saatten eski olan kullanıcılar (cron bunları kuyruğa atar). */
export async function usersDueForSync(hours = 6, limit = 500) {
  const rows = await db
    .select({ userId: steamAccounts.userId })
    .from(steamAccounts)
    .where(
      and(
        eq(steamAccounts.syncEnabled, true),
        sql`(${steamAccounts.lastSyncedAt} is null or ${steamAccounts.lastSyncedAt} < now() - make_interval(hours => ${hours}))`,
      ),
    )
    .limit(limit);
  return rows.map((row) => row.userId);
}

export async function recentSyncRuns(userId: string, limit = 10) {
  return db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.userId, userId), inArray(syncRuns.source, ["steam", "psn", "xbox"])))
    .orderBy(sql`${syncRuns.startedAt} desc`)
    .limit(limit);
}
