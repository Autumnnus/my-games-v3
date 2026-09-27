import { schema } from "@my-games/db";
import type { EntryStatus } from "@my-games/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { ensureSteamGame, findGameBySteamApp } from "../catalog";
import { type DbOrTx, db, type Tx } from "../db";
import { emit } from "../events";
import { mergeGameInto } from "../matching";
import { ignoreKey, notifyPending, type ProposalResult, propose } from "../proposals";
import { titleSimilarity } from "../text";
import { getAchievementProgress, getOwnedGames, type OwnedGame, SteamPrivateError } from "./api";

const {
  steamAccounts,
  steamSnapshots,
  libraryEntries,
  games,
  playSessions,
  syncRuns,
  changeProposals,
  syncIgnores,
  steamAppAliases,
} = schema;

async function saveSnapshot(tx: DbOrTx, userId: string, appId: number, playtimeMin: number) {
  await tx
    .insert(steamSnapshots)
    .values({ userId, appId, playtimeMin })
    .onConflictDoUpdate({
      target: [steamSnapshots.userId, steamSnapshots.appId],
      set: { playtimeMin, updatedAt: new Date() },
    });
}

const newGameKey = (appId: number) => `steam:new_game:${appId}`;

/** Steam'de oynanınca "oynanıyor"a alınması önerilen durumlar. */
const RESUMABLE: EntryStatus[] = ["backlog", "wishlist", "paused"];
const LEGACY_MATCH_SCORE = 0.92;
const MAX_ACHIEVEMENT_CHECKS = 30;

type SyncStats = {
  owned: number;
  played: number;
  updated: number;
  sessions: number;
  newGames: number;
  conflicts: number;
  statusSuggestions: number;
  achievements: number;
  linkedLegacy: number;
};

type EntryRow = {
  id: string;
  status: EntryStatus;
  playtimeManualMin: number;
  playtimeSteamMin: number | null;
  achievementsUnlocked: number | null;
  achievementsTotal: number | null;
  gameId: string;
  steamAppId: number | null;
  name: string;
};

async function loadEntries(userId: string): Promise<EntryRow[]> {
  return db
    .select({
      id: libraryEntries.id,
      status: libraryEntries.status,
      playtimeManualMin: libraryEntries.playtimeManualMin,
      playtimeSteamMin: libraryEntries.playtimeSteamMin,
      achievementsUnlocked: libraryEntries.achievementsUnlocked,
      achievementsTotal: libraryEntries.achievementsTotal,
      gameId: games.id,
      steamAppId: games.steamAppId,
      name: games.name,
    })
    .from(libraryEntries)
    .innerJoin(games, eq(games.id, libraryEntries.gameId))
    .where(eq(libraryEntries.userId, userId));
}

/**
 * Steam kimliği olmayan (eski veri / elle eklenmiş) bir kaydı ad benzerliğiyle Steam uygulamasına bağlar.
 * Aynı Steam uygulaması katalogda zaten varsa eski oyun ona birleştirilir.
 */
async function linkLegacyEntry(entry: EntryRow, appId: number) {
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

async function hasPendingConflict(userId: string, entryId: string) {
  const [row] = await db
    .select({ id: changeProposals.id })
    .from(changeProposals)
    .where(
      and(
        eq(changeProposals.userId, userId),
        eq(changeProposals.entryId, entryId),
        eq(changeProposals.kind, "playtime_conflict"),
        eq(changeProposals.status, "pending"),
      ),
    );
  return !!row;
}

/**
 * Bir kullanıcının Steam kütüphanesini senkronize eder. Tüm değişiklikler onay sisteminden geçer:
 * süre/başarım otomatik uygulanır (varsayılan), yeni oyun ve durum önerileri onay kutusuna düşer.
 * Steam oturum geçmişi vermediği için süre farkları `play_sessions` olarak kaydedilir.
 */
export async function syncSteamUser(userId: string) {
  const [account] = await db.select().from(steamAccounts).where(eq(steamAccounts.userId, userId));
  if (!account?.syncEnabled) return { skipped: true as const };

  const [run] = await db
    .insert(syncRuns)
    .values({ userId, source: "steam" })
    .returning({ id: syncRuns.id });
  const stats: SyncStats = {
    owned: 0,
    played: 0,
    updated: 0,
    sessions: 0,
    newGames: 0,
    conflicts: 0,
    statusSuggestions: 0,
    achievements: 0,
    linkedLegacy: 0,
  };
  const now = new Date();
  let pending = 0;
  const count = (result: ProposalResult) => {
    if (result.created) pending++;
    return result;
  };

  try {
    const owned = await getOwnedGames(account.steamId);
    const played = owned.filter((game) => game.playtime_forever > 0);
    stats.owned = owned.length;
    stats.played = played.length;

    const entries = await loadEntries(userId);
    const byApp = new Map(
      entries.filter((entry) => entry.steamAppId).map((entry) => [entry.steamAppId, entry]),
    );
    // Aynı oyunun ek Steam kimlikleri. Asıl app de oynanmışsa süre ondan okunur (ikisi birbirini ezmesin).
    const playedApps = new Set(played.map((game) => game.appid));
    const byGame = new Map(entries.map((entry) => [entry.gameId, entry]));
    const aliases = entries.length
      ? await db
          .select({ appId: steamAppAliases.appId, gameId: steamAppAliases.gameId })
          .from(steamAppAliases)
          .where(
            inArray(
              steamAppAliases.gameId,
              entries.map((entry) => entry.gameId),
            ),
          )
      : [];
    for (const alias of aliases) {
      const entry = byGame.get(alias.gameId);
      if (entry && !(entry.steamAppId && playedApps.has(entry.steamAppId))) {
        byApp.set(alias.appId, entry);
      }
    }
    const unlinked = entries.filter((entry) => !entry.steamAppId);
    const ignored = new Set(
      (
        await db
          .select({ externalId: syncIgnores.externalId })
          .from(syncIgnores)
          .where(and(eq(syncIgnores.userId, userId), eq(syncIgnores.source, "steam")))
      ).map((row) => row.externalId),
    );
    const isNewGameIgnored = (appId: number) =>
      ignored.has(ignoreKey("steam", newGameKey(appId)) ?? "");
    const snapshots = new Map(
      (await db.select().from(steamSnapshots).where(eq(steamSnapshots.userId, userId))).map(
        (row) => [row.appId, row],
      ),
    );
    const achievementChecks: Array<{ entry: EntryRow; game: OwnedGame }> = [];

    for (const game of played) {
      let entry = byApp.get(game.appid);
      const snapshot = snapshots.get(game.appid);
      // Son gözlemden bu yana oynanan süre. İlk gözlem başlangıç noktasıdır, oturum üretmez.
      const delta = snapshot ? game.playtime_forever - snapshot.playtimeMin : 0;

      if (!entry && game.name) {
        const best = unlinked
          .map((candidate) => ({
            candidate,
            score: titleSimilarity(candidate.name, game.name ?? ""),
          }))
          .sort((a, b) => b.score - a.score)[0];
        if (best && best.score >= LEGACY_MATCH_SCORE) {
          entry = await linkLegacyEntry(best.candidate, game.appid);
          unlinked.splice(unlinked.indexOf(best.candidate), 1);
          stats.linkedLegacy++;
        }
      }

      const lastPlayedAt = game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : null;
      // Son oynama zamanı son sync'ten eskiyse (saat farkı, gecikmeli güncelleme) oturum sync anına yazılır.
      const floor = account.lastSyncedAt;
      const endedAt =
        lastPlayedAt && lastPlayedAt <= now && (!floor || lastPlayedAt > floor)
          ? lastPlayedAt
          : now;
      const recordSession = async (tx: Tx, gameId: string, entryId: string | null) => {
        if (delta <= 0) return;
        const earliest = endedAt.getTime() - delta * 60_000;
        const startedAt = new Date(floor ? Math.max(floor.getTime(), earliest) : earliest);
        await tx.insert(playSessions).values({
          userId,
          gameId,
          entryId,
          source: "steam_delta",
          startedAt,
          endedAt,
          durationMin: delta,
        });
        stats.sessions++;
      };

      if (entry) {
        const current = entry;
        const known = current.playtimeSteamMin;
        const needsUpdate = known === null || game.playtime_forever !== known;
        if (!needsUpdate && delta <= 0) {
          if (!snapshot?.achievementsCheckedAt && game.has_community_visible_stats) {
            achievementChecks.push({ entry: current, game });
          }
          continue;
        }

        const conflictPending =
          known === null ? false : await hasPendingConflict(userId, current.id);
        await db.transaction(async (tx) => {
          if (needsUpdate) {
            // İlk bağlantıda elle girilmiş süre varsa hangisinin doğru olduğunu kullanıcı seçer.
            if ((known === null && current.playtimeManualMin > 0) || conflictPending) {
              const result = count(
                await propose(tx, {
                  userId,
                  source: "steam",
                  kind: "playtime_conflict",
                  entryId: current.id,
                  gameId: current.gameId,
                  dedupeKey: `steam:playtime_conflict:${current.id}`,
                  payload: {
                    op: "conflict",
                    manualMin: current.playtimeManualMin,
                    steamMin: game.playtime_forever,
                  },
                }),
              );
              if (result.status !== "ignored") stats.conflicts++;
            } else {
              const changes: Array<{ field: string; from: unknown; to: unknown }> = [
                { field: "playtimeSteamMin", from: known, to: game.playtime_forever },
              ];
              if (lastPlayedAt) {
                changes.push({ field: "lastPlayedAt", from: null, to: lastPlayedAt.toISOString() });
              }
              count(
                await propose(tx, {
                  userId,
                  source: "steam",
                  kind: "playtime",
                  entryId: current.id,
                  gameId: current.gameId,
                  dedupeKey: `steam:playtime:${current.id}`,
                  payload: { op: "update", changes },
                }),
              );
              stats.updated++;
            }
          }

          if (delta > 0) {
            await recordSession(tx, current.gameId, current.id);
            await emit(tx, "playtime.recorded", {
              userId,
              gameId: current.gameId,
              entryId: current.id,
              minutes: delta,
              totalMin: current.playtimeManualMin + game.playtime_forever,
            });
            if (RESUMABLE.includes(current.status)) {
              const suggestion = count(
                await propose(tx, {
                  userId,
                  source: "steam",
                  kind: "status",
                  entryId: current.id,
                  gameId: current.gameId,
                  dedupeKey: `steam:status:${current.id}`,
                  payload: {
                    op: "update",
                    changes: [{ field: "status", from: current.status, to: "playing" }],
                  },
                }),
              );
              if (suggestion.status !== "ignored") stats.statusSuggestions++;
            }
          }
          await saveSnapshot(tx, userId, game.appid, game.playtime_forever);
        });
        if (game.has_community_visible_stats && (delta > 0 || !snapshot?.achievementsCheckedAt)) {
          achievementChecks.push({ entry: current, game });
        }
        continue;
      }

      // Kütüphanede yok: "yeni oyun" önerisi. Yok sayılanlar için katalog kaydı bile açılmaz.
      if (isNewGameIgnored(game.appid)) {
        await saveSnapshot(db, userId, game.appid, game.playtime_forever);
        continue;
      }
      if (snapshot && delta <= 0) continue;
      const catalogGame = await ensureSteamGame(game.appid, game.name ?? `Steam ${game.appid}`);
      // App, kütüphanedeki bir oyunun ek Steam kimliği çıktı (ör. asıl app'i de oynanıyor): öneri yok.
      if (byGame.has(catalogGame.id)) continue;
      await db.transaction(async (tx) => {
        const result = count(
          await propose(tx, {
            userId,
            source: "steam",
            kind: "new_game",
            gameId: catalogGame.id,
            dedupeKey: newGameKey(game.appid),
            payload: {
              op: "create",
              game: { gameId: catalogGame.id, steamAppId: game.appid, name: catalogGame.name },
              fields: {
                status: (game.playtime_2weeks ?? 0) > 0 ? "playing" : "paused",
                store: "steam",
                platform: "pc",
                playtimeSteamMin: game.playtime_forever,
                lastPlayedAt,
              },
            },
          }),
        );
        if (result.status !== "ignored") stats.newGames++;
        await recordSession(tx, catalogGame.id, null);
        await saveSnapshot(tx, userId, game.appid, game.playtime_forever);
      });
    }

    for (const { entry, game } of achievementChecks.slice(0, MAX_ACHIEVEMENT_CHECKS)) {
      const progress = await getAchievementProgress(account.steamId, game.appid).catch(() => null);
      await db
        .update(steamSnapshots)
        .set({ achievementsCheckedAt: new Date() })
        .where(and(eq(steamSnapshots.userId, userId), eq(steamSnapshots.appId, game.appid)));
      if (!progress) continue;
      if (
        progress.unlocked === entry.achievementsUnlocked &&
        progress.total === entry.achievementsTotal
      )
        continue;
      await db.transaction(async (tx) => {
        count(
          await propose(tx, {
            userId,
            source: "steam",
            kind: "achievements",
            entryId: entry.id,
            gameId: entry.gameId,
            dedupeKey: `steam:achievements:${entry.id}`,
            payload: {
              op: "update",
              changes: [
                {
                  field: "achievementsUnlocked",
                  from: entry.achievementsUnlocked,
                  to: progress.unlocked,
                },
                { field: "achievementsTotal", from: entry.achievementsTotal, to: progress.total },
              ],
            },
          }),
        );
      });
      stats.achievements++;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(steamAccounts)
        .set({ lastSyncedAt: now, lastSyncError: null })
        .where(eq(steamAccounts.userId, userId));
      await notifyPending(tx, userId, pending);
    });
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
    .where(and(eq(syncRuns.userId, userId), inArray(syncRuns.source, ["steam"])))
    .orderBy(sql`${syncRuns.startedAt} desc`)
    .limit(limit);
}
