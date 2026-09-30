import { schema } from "@my-games/db";
import type {
  EntryStatus,
  Platform,
  PlaySessionSource,
  Store,
  SyncProvider,
} from "@my-games/shared";
import { and, eq, sql } from "drizzle-orm";
import {
  type AchievementDef,
  linkAchievementSet,
  recordUserAchievements,
  saveAchievementSet,
  type UnlockedAchievement,
} from "../achievements";
import { type DbOrTx, db, type Tx } from "../db";
import { AppError } from "../errors";
import { emit } from "../events";
import { ignoreKey, notifyPending, type ProposalResult, propose } from "../proposals";

const { platformSnapshots, libraryEntries, games, playSessions, changeProposals, syncIgnores } =
  schema;

/** Platformun bildirdiği bir oyun (başlık). */
export type PlatformTitle = {
  /** Platformdaki kimlik; anlık görüntü ve yeni oyun önerisi bu kimlikle tutulur. */
  externalId: string;
  name: string;
  /** Toplam süre (dakika). Platform bildirmiyorsa `null` (ör. PS3 oyunları). */
  playtimeMin: number | null;
  lastPlayedAt: Date | null;
  /** Son iki hafta içinde oynandı (yeni oyun önerisinde durum "oynanıyor" olur). */
  recentlyPlayed: boolean;
  /** Başlığın başarımı/kupası var mı. */
  hasAchievements: boolean;
  /** Başlık listesinin bildirdiği açılan sayısı; değişince ayrıntı çekilir. Bilinmiyorsa `null`. */
  achievementsUnlocked: number | null;
  imageUrl?: string | null;
};

export type EngineEntry = {
  id: string;
  status: EntryStatus;
  gameId: string;
  name: string;
  steamAppId: number | null;
  playtimeManualMin: number;
  playtimeSteamMin: number | null;
  playtimePsnMin: number | null;
  playtimeXboxMin: number | null;
  achievementsUnlocked: number | null;
  achievementsTotal: number | null;
};

type PlaytimeField = "playtimeSteamMin" | "playtimePsnMin" | "playtimeXboxMin";

export type AchievementFetch = {
  /** Başarım setinin kimliği (Steam app id, PSN npCommunicationId, Xbox titleId). */
  gameKey: string;
  /** Yeni tanımlar; set güncelse `null` (tekrar yazılmaz). */
  defs: AchievementDef[] | null;
  unlocked: UnlockedAchievement[];
  total: number;
};

export type ProviderSpec = {
  provider: SyncProvider;
  playtimeField: PlaytimeField;
  sessionSource: PlaySessionSource;
  newEntry: { store: Store; platform: Platform };
  /** Başlığın kullanıcı kütüphanesindeki kaydı (gerekirse eski kaydı platforma bağlar). */
  findEntry: (title: PlatformTitle) => Promise<EngineEntry | undefined>;
  /**
   * Kütüphanede olmayan başlık için katalog oyunu (yeni oyun önerisi için). `null`: öneri açılmaz (ör.
   * başlık kütüphanedeki bir oyunun ikinci kimliği çıktı).
   */
  ensureGame: (title: PlatformTitle) => Promise<{ id: string; name: string } | null>;
  /** Başarım ayrıntıları; yoksa ya da gizliyse `null`. */
  fetchAchievements?: (title: PlatformTitle) => Promise<AchievementFetch | null>;
  /** Bir sync'te en fazla kaç başlığın başarım ayrıntısı çekilir (API kotası). */
  maxAchievementChecks: number;
};

export type EngineStats = {
  titles: number;
  updated: number;
  sessions: number;
  newGames: number;
  conflicts: number;
  statusSuggestions: number;
  achievements: number;
  achievementsUnlocked: number;
};

/** Platformda oynanınca "oynanıyor"a alınması önerilen durumlar. */
const RESUMABLE: EntryStatus[] = ["backlog", "wishlist", "paused"];

export async function loadEngineEntries(userId: string): Promise<EngineEntry[]> {
  return db
    .select({
      id: libraryEntries.id,
      status: libraryEntries.status,
      gameId: games.id,
      name: games.name,
      steamAppId: games.steamAppId,
      playtimeManualMin: libraryEntries.playtimeManualMin,
      playtimeSteamMin: libraryEntries.playtimeSteamMin,
      playtimePsnMin: libraryEntries.playtimePsnMin,
      playtimeXboxMin: libraryEntries.playtimeXboxMin,
      achievementsUnlocked: libraryEntries.achievementsUnlocked,
      achievementsTotal: libraryEntries.achievementsTotal,
    })
    .from(libraryEntries)
    .innerJoin(games, eq(games.id, libraryEntries.gameId))
    .where(eq(libraryEntries.userId, userId));
}

export const newGameKey = (provider: string, externalId: string) =>
  `${provider}:new_game:${externalId}`;

async function saveSnapshot(
  tx: DbOrTx,
  key: { userId: string; provider: string; externalId: string },
  values: {
    playtimeMin?: number | null;
    /** Yalnızca sürenin ilk gözleminde saklanır (`baselineLastPlayedAt`). */
    lastPlayedAt?: Date | null;
    achievementsUnlocked?: number | null;
    checkedAt?: Date;
  },
) {
  const now = new Date();
  const set = {
    ...(values.playtimeMin !== undefined ? { playtimeMin: values.playtimeMin } : {}),
    ...(values.achievementsUnlocked !== undefined
      ? { achievementsUnlocked: values.achievementsUnlocked }
      : {}),
    ...(values.checkedAt ? { achievementsCheckedAt: values.checkedAt } : {}),
    updatedAt: now,
  };
  // Sürenin ilk gözlemi oturum üretmez; o ana kadarki süre tahmini geçmiştir ve sınırı bir kez yazılır.
  const observed = values.playtimeMin !== undefined && values.playtimeMin !== null;
  const lastPlayedAt = values.lastPlayedAt ?? null;
  await tx
    .insert(platformSnapshots)
    .values({
      ...key,
      ...set,
      ...(observed ? { baselineAt: now, baselineLastPlayedAt: lastPlayedAt } : {}),
    })
    .onConflictDoUpdate({
      target: [platformSnapshots.userId, platformSnapshots.provider, platformSnapshots.externalId],
      set: {
        ...set,
        ...(observed
          ? {
              baselineAt: sql`coalesce(${platformSnapshots.baselineAt}, ${now}::timestamptz)`,
              baselineLastPlayedAt: sql`case when ${platformSnapshots.baselineAt} is null
                then ${lastPlayedAt}::timestamptz else ${platformSnapshots.baselineLastPlayedAt} end`,
            }
          : {}),
      },
    });
}

async function hasPendingConflict(userId: string, entryId: string, provider: string) {
  const [row] = await db
    .select({ id: changeProposals.id })
    .from(changeProposals)
    .where(
      and(
        eq(changeProposals.userId, userId),
        eq(changeProposals.entryId, entryId),
        eq(changeProposals.source, provider as "steam"),
        eq(changeProposals.kind, "playtime_conflict"),
        eq(changeProposals.status, "pending"),
      ),
    );
  return !!row;
}

function otherPlatformsMin(entry: EngineEntry, field: PlaytimeField) {
  const fields: PlaytimeField[] = ["playtimeSteamMin", "playtimePsnMin", "playtimeXboxMin"];
  return fields
    .filter((other) => other !== field)
    .reduce((sum, other) => sum + (entry[other] ?? 0), 0);
}

/**
 * Bir platformun başlık listesini kullanıcının kütüphanesine uygular. Tüm değişiklikler onay sisteminden
 * geçer: süre ve başarımlar varsayılan olarak otomatik uygulanır; yeni oyun, durum önerisi ve elle girilmiş
 * süreyle çakışma onay kutusuna düşer. Platformlar oturum geçmişi vermediği için süre farkları
 * `play_sessions` olarak kaydedilir (son gözlem `platform_snapshots`'ta).
 */
export async function applyPlatformTitles(input: {
  userId: string;
  spec: ProviderSpec;
  titles: PlatformTitle[];
  /** Önceki başarılı sync zamanı (oturum başlangıcının alt sınırı). */
  lastSyncedAt: Date | null;
  now?: Date;
  /** Başlık dışı kaynaklardan gelen bekleyen öneri sayısı (tek bildirimde toplanır). */
  extraPending?: number;
}) {
  const { userId, spec } = input;
  const provider = spec.provider;
  // İlk senkron kurulumdur: öneriler uygulanınca akışa aktivite düşmez.
  const initial = input.lastSyncedAt === null;
  const now = input.now ?? new Date();
  const field = spec.playtimeField;
  const stats: EngineStats = {
    titles: input.titles.length,
    updated: 0,
    sessions: 0,
    newGames: 0,
    conflicts: 0,
    statusSuggestions: 0,
    achievements: 0,
    achievementsUnlocked: 0,
  };
  let pending = input.extraPending ?? 0;
  const count = (result: ProposalResult) => {
    if (result.created) pending++;
    return result;
  };

  const ignored = new Set(
    (
      await db
        .select({ externalId: syncIgnores.externalId })
        .from(syncIgnores)
        .where(and(eq(syncIgnores.userId, userId), eq(syncIgnores.source, provider)))
    ).map((row) => row.externalId),
  );
  const snapshots = new Map(
    (
      await db
        .select()
        .from(platformSnapshots)
        .where(and(eq(platformSnapshots.userId, userId), eq(platformSnapshots.provider, provider)))
    ).map((row) => [row.externalId, row]),
  );
  const achievementChecks: Array<{ entry: EngineEntry; title: PlatformTitle }> = [];
  const handledEntries = new Set<string>();
  const snapshotKey = (title: PlatformTitle) => ({
    userId,
    provider,
    externalId: title.externalId,
  });

  for (const title of input.titles) {
    const snapshot = snapshots.get(title.externalId);
    // Son gözlemden bu yana oynanan süre. İlk gözlem başlangıç noktasıdır, oturum üretmez.
    const delta =
      snapshot?.playtimeMin != null && title.playtimeMin !== null
        ? title.playtimeMin - snapshot.playtimeMin
        : 0;
    const floor = input.lastSyncedAt;
    const lastPlayedAt = title.lastPlayedAt;
    // Son oynama zamanı son sync'ten eskiyse (saat farkı, gecikmeli güncelleme) oturum sync anına yazılır.
    const endedAt =
      lastPlayedAt && lastPlayedAt <= now && (!floor || lastPlayedAt > floor) ? lastPlayedAt : now;
    const recordSession = async (tx: Tx, gameId: string, entryId: string | null) => {
      if (delta <= 0) return;
      const earliest = endedAt.getTime() - delta * 60_000;
      const startedAt = new Date(floor ? Math.max(floor.getTime(), earliest) : earliest);
      await tx.insert(playSessions).values({
        userId,
        gameId,
        entryId,
        source: spec.sessionSource,
        startedAt,
        endedAt,
        durationMin: delta,
      });
      stats.sessions++;
    };
    const achievementsChanged =
      title.hasAchievements &&
      (!snapshot?.achievementsCheckedAt ||
        (title.achievementsUnlocked !== null &&
          title.achievementsUnlocked !== snapshot.achievementsUnlocked));

    const entry = await spec.findEntry(title);
    if (entry) {
      // Aynı kayda iki başlık düşerse (ör. oyunun iki sürümü) ilki kullanılır; ikisi birbirini ezmesin.
      if (handledEntries.has(entry.id)) continue;
      handledEntries.add(entry.id);
      const known = entry[field];
      const needsUpdate =
        title.playtimeMin !== null && (known === null || title.playtimeMin !== known);
      if (!needsUpdate && delta <= 0) {
        if (achievementsChanged) achievementChecks.push({ entry, title });
        if (!snapshot)
          await saveSnapshot(db, snapshotKey(title), {
            playtimeMin: title.playtimeMin,
            lastPlayedAt: title.lastPlayedAt,
          });
        continue;
      }

      const conflictPending =
        known === null ? false : await hasPendingConflict(userId, entry.id, provider);
      await db.transaction(async (tx) => {
        if (needsUpdate && title.playtimeMin !== null) {
          // İlk bağlantıda elle girilmiş süre varsa hangisinin doğru olduğunu kullanıcı seçer.
          if ((known === null && entry.playtimeManualMin > 0) || conflictPending) {
            const result = count(
              await propose(tx, {
                userId,
                initial,
                source: provider,
                kind: "playtime_conflict",
                entryId: entry.id,
                gameId: entry.gameId,
                dedupeKey: `${provider}:playtime_conflict:${entry.id}`,
                payload: {
                  op: "conflict",
                  provider,
                  manualMin: entry.playtimeManualMin,
                  platformMin: title.playtimeMin,
                },
              }),
            );
            if (result.status !== "ignored") stats.conflicts++;
          } else {
            const changes: Array<{ field: string; from: unknown; to: unknown }> = [
              { field, from: known, to: title.playtimeMin },
            ];
            if (lastPlayedAt) {
              changes.push({ field: "lastPlayedAt", from: null, to: lastPlayedAt.toISOString() });
            }
            count(
              await propose(tx, {
                userId,
                initial,
                source: provider,
                kind: "playtime",
                entryId: entry.id,
                gameId: entry.gameId,
                dedupeKey: `${provider}:playtime:${entry.id}`,
                payload: { op: "update", changes },
              }),
            );
            stats.updated++;
          }
        }

        if (delta > 0) {
          await recordSession(tx, entry.gameId, entry.id);
          await emit(tx, "playtime.recorded", {
            userId,
            gameId: entry.gameId,
            entryId: entry.id,
            minutes: delta,
            totalMin:
              entry.playtimeManualMin + (title.playtimeMin ?? 0) + otherPlatformsMin(entry, field),
          });
          if (RESUMABLE.includes(entry.status)) {
            const suggestion = count(
              await propose(tx, {
                userId,
                initial,
                source: provider,
                kind: "status",
                entryId: entry.id,
                gameId: entry.gameId,
                dedupeKey: `${provider}:status:${entry.id}`,
                payload: {
                  op: "update",
                  changes: [{ field: "status", from: entry.status, to: "playing" }],
                },
              }),
            );
            if (suggestion.status !== "ignored") stats.statusSuggestions++;
          }
        }
        await saveSnapshot(tx, snapshotKey(title), {
          playtimeMin: title.playtimeMin,
          lastPlayedAt: title.lastPlayedAt,
        });
      });
      if (achievementsChanged || (title.hasAchievements && delta > 0)) {
        achievementChecks.push({ entry, title });
      }
      continue;
    }

    // Kütüphanede yok: "yeni oyun" önerisi. Yok sayılanlar için katalog kaydı bile açılmaz.
    const key = newGameKey(provider, title.externalId);
    if (ignored.has(ignoreKey(provider, key) ?? "")) {
      await saveSnapshot(db, snapshotKey(title), {
        playtimeMin: title.playtimeMin,
        lastPlayedAt: title.lastPlayedAt,
      });
      continue;
    }
    if (snapshot && delta <= 0) continue;
    const catalogGame = await spec.ensureGame(title);
    if (!catalogGame) continue;
    await db.transaction(async (tx) => {
      const result = count(
        await propose(tx, {
          userId,
          initial,
          source: provider,
          kind: "new_game",
          gameId: catalogGame.id,
          dedupeKey: key,
          payload: {
            op: "create",
            game: {
              gameId: catalogGame.id,
              name: catalogGame.name,
              provider,
              externalId: title.externalId,
            },
            fields: {
              status: title.recentlyPlayed ? "playing" : "paused",
              store: spec.newEntry.store,
              platform: spec.newEntry.platform,
              [field]: title.playtimeMin,
              lastPlayedAt,
            },
          },
        }),
      );
      if (result.status !== "ignored") stats.newGames++;
      await recordSession(tx, catalogGame.id, null);
      await saveSnapshot(tx, snapshotKey(title), {
        playtimeMin: title.playtimeMin,
        lastPlayedAt: title.lastPlayedAt,
      });
    });
  }

  if (spec.fetchAchievements) {
    for (const { entry, title } of achievementChecks.slice(0, spec.maxAchievementChecks)) {
      let fetched: AchievementFetch | null;
      try {
        fetched = await spec.fetchAchievements(title);
      } catch (error) {
        // Geçici hata (istek sınırı, ağ): başlık "kontrol edildi" sayılmaz, sonraki sync yeniden dener. Steam
        // başarım sayısını önceden bildirmediği için işaretlenen başlık bir daha hiç denenmezdi.
        console.warn(`[${provider}] başarımlar alınamadı`, title.externalId, error);
        if (error instanceof AppError && error.code === "rate_limited") break;
        continue;
      }
      const checkedAt = new Date();
      // `null`: başlığın başarımı yok ya da gizli; tekrar sorulmaz.
      if (!fetched) {
        await saveSnapshot(db, snapshotKey(title), { checkedAt });
        continue;
      }
      await db.transaction(async (tx) => {
        if (fetched.defs) {
          await saveAchievementSet(tx, {
            provider,
            gameKey: fetched.gameKey,
            gameId: entry.gameId,
            defs: fetched.defs,
          });
        } else {
          await linkAchievementSet(tx, provider, fetched.gameKey, entry.gameId);
        }
        const recorded = await recordUserAchievements(tx, {
          userId,
          provider,
          gameKey: fetched.gameKey,
          unlocked: fetched.unlocked,
        });
        await saveSnapshot(tx, snapshotKey(title), {
          checkedAt,
          achievementsUnlocked: title.achievementsUnlocked ?? fetched.unlocked.length,
        });
        const unlockedCount = fetched.unlocked.length;
        if (
          unlockedCount !== entry.achievementsUnlocked ||
          fetched.total !== entry.achievementsTotal
        ) {
          count(
            await propose(tx, {
              userId,
              initial,
              source: provider,
              kind: "achievements",
              entryId: entry.id,
              gameId: entry.gameId,
              dedupeKey: `${provider}:achievements:${entry.id}`,
              payload: {
                op: "update",
                changes: [
                  {
                    field: "achievementsUnlocked",
                    from: entry.achievementsUnlocked,
                    to: unlockedCount,
                  },
                  { field: "achievementsTotal", from: entry.achievementsTotal, to: fetched.total },
                ],
              },
            }),
          );
        }
        // İlk içe aktarım akışı doldurmasın; sonraki sync'lerde yeni açılanlar akışa düşer.
        if (recorded.newly.length > 0 && !recorded.firstImport) {
          await emit(tx, "achievements.unlocked", {
            userId,
            entryId: entry.id,
            gameId: entry.gameId,
            provider,
            gameKey: fetched.gameKey,
            apiNames: recorded.newly,
          });
          stats.achievementsUnlocked += recorded.newly.length;
        }
      });
      stats.achievements++;
    }
  }

  await db.transaction(async (tx) => {
    await notifyPending(tx, userId, pending);
    // İlk gözlemler ve yeni kanıtlar (başarım tarihleri) tahmini geçmişi değiştirir.
    await emit(tx, "estimates.requested", { userId });
  });
  return { stats, pending };
}
