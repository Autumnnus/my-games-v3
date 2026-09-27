import { schema } from "@my-games/db";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { type DbOrTx, db } from "./db";

const { achievementSets, achievements, userAchievements, libraryEntries } = schema;

/** Platformdan gelen başarım tanımı (oyun başına, herkes için ortak). */
export type AchievementDef = {
  apiName: string;
  name: string;
  description: string | null;
  localized?: Record<string, { name: string; description: string | null }> | null;
  iconUrl: string | null;
  iconLockedUrl?: string | null;
  hidden: boolean;
  /** Oyuncuların yüzde kaçı açtı (0–100). */
  rarity: number | null;
  grade?: string | null;
};

export type UnlockedAchievement = { apiName: string; unlockedAt: Date | null };

/** Tanımlar bu kadar eskiyse (ya da sayı değiştiyse) yeniden çekilir. */
export const ACHIEVEMENT_SET_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function getAchievementSet(tx: DbOrTx, provider: string, gameKey: string) {
  const [row] = await tx
    .select()
    .from(achievementSets)
    .where(and(eq(achievementSets.provider, provider), eq(achievementSets.gameKey, gameKey)));
  return row ?? null;
}

export function isSetStale(set: { fetchedAt: Date; total: number } | null, expectedTotal?: number) {
  if (!set) return true;
  if (expectedTotal !== undefined && expectedTotal !== set.total) return true;
  return Date.now() - set.fetchedAt.getTime() > ACHIEVEMENT_SET_TTL_MS;
}

/** Başarım setini ve tanımlarını kaydeder; artık listede olmayan tanımlar silinir. */
export async function saveAchievementSet(
  tx: DbOrTx,
  input: { provider: string; gameKey: string; gameId: string | null; defs: AchievementDef[] },
) {
  const { provider, gameKey, defs } = input;
  await tx
    .insert(achievementSets)
    .values({ provider, gameKey, gameId: input.gameId, total: defs.length, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [achievementSets.provider, achievementSets.gameKey],
      set: {
        total: defs.length,
        fetchedAt: new Date(),
        gameId: sql`coalesce(${input.gameId}::uuid, ${achievementSets.gameId})`,
      },
    });
  if (defs.length === 0) return;
  // Aynı apiName iki kez gelirse (platform hatası) son hâli kalır.
  const unique = [...new Map(defs.map((def) => [def.apiName, def])).values()];
  await tx
    .insert(achievements)
    .values(
      unique.map((def, position) => ({
        provider,
        gameKey,
        apiName: def.apiName,
        position,
        name: def.name,
        description: def.description,
        localized: def.localized ?? null,
        iconUrl: def.iconUrl,
        iconLockedUrl: def.iconLockedUrl ?? null,
        hidden: def.hidden,
        rarity: def.rarity,
        grade: def.grade ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: [achievements.provider, achievements.gameKey, achievements.apiName],
      set: {
        position: sql`excluded.position`,
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        localized: sql`excluded.localized`,
        iconUrl: sql`excluded.icon_url`,
        iconLockedUrl: sql`excluded.icon_locked_url`,
        hidden: sql`excluded.hidden`,
        rarity: sql`coalesce(excluded.rarity, ${achievements.rarity})`,
        grade: sql`excluded.grade`,
      },
    });
  await tx.delete(achievements).where(
    and(
      eq(achievements.provider, provider),
      eq(achievements.gameKey, gameKey),
      notInArray(
        achievements.apiName,
        unique.map((def) => def.apiName),
      ),
    ),
  );
}

/** Setin bağlı olduğu oyunu günceller (set başka bir kütüphane kaydından önce çekilmiş olabilir). */
export async function linkAchievementSet(
  tx: DbOrTx,
  provider: string,
  gameKey: string,
  gameId: string,
) {
  await tx
    .update(achievementSets)
    .set({ gameId })
    .where(and(eq(achievementSets.provider, provider), eq(achievementSets.gameKey, gameKey)));
}

/**
 * Kullanıcının açtığı başarımları kaydeder. `newly`: bu çağrıda ilk kez görülenler; `firstImport`: bu oyun
 * için daha önce hiç kayıt yoktu (ilk içe aktarım akışa düşmez).
 */
export async function recordUserAchievements(
  tx: DbOrTx,
  input: { userId: string; provider: string; gameKey: string; unlocked: UnlockedAchievement[] },
) {
  const existing = await tx
    .select({ apiName: userAchievements.apiName })
    .from(userAchievements)
    .where(
      and(
        eq(userAchievements.userId, input.userId),
        eq(userAchievements.provider, input.provider),
        eq(userAchievements.gameKey, input.gameKey),
      ),
    );
  const known = new Set(existing.map((row) => row.apiName));
  const fresh = input.unlocked.filter((item) => !known.has(item.apiName));
  if (fresh.length > 0) {
    await tx
      .insert(userAchievements)
      .values(
        fresh.map((item) => ({
          userId: input.userId,
          provider: input.provider,
          gameKey: input.gameKey,
          apiName: item.apiName,
          unlockedAt: item.unlockedAt,
        })),
      )
      .onConflictDoNothing();
  }
  return { newly: fresh.map((item) => item.apiName), firstImport: known.size === 0 };
}

export type AchievementView = {
  apiName: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  hidden: boolean;
  rarity: number | null;
  grade: string | null;
  unlockedAt: string | null;
  unlocked: boolean;
};

function localize(
  row: { name: string; description: string | null; localized: unknown },
  locale: string,
) {
  const localized = (
    row.localized as Record<string, { name: string; description: string | null }>
  )?.[locale];
  return localized ?? { name: row.name, description: row.description };
}

/**
 * Bir oyunun başarım setleri ve kullanıcının durumu. Gizli ve açılmamış başarımların adı/açıklaması
 * gösterilmez (platformlardaki davranış).
 */
export async function gameAchievements(input: {
  gameId: string;
  userId: string;
  locale: string;
  /** Kullanıcının bu oyunu oynadığı platformlar (hiç açılanı olmasa da seti gösterilir). */
  providers: string[];
}) {
  const sets = await db
    .select()
    .from(achievementSets)
    .where(eq(achievementSets.gameId, input.gameId));
  if (sets.length === 0) return [];

  const result = [];
  for (const set of sets) {
    const [defs, unlocks] = await Promise.all([
      db
        .select()
        .from(achievements)
        .where(and(eq(achievements.provider, set.provider), eq(achievements.gameKey, set.gameKey)))
        .orderBy(asc(achievements.position)),
      db
        .select({ apiName: userAchievements.apiName, unlockedAt: userAchievements.unlockedAt })
        .from(userAchievements)
        .where(
          and(
            eq(userAchievements.userId, input.userId),
            eq(userAchievements.provider, set.provider),
            eq(userAchievements.gameKey, set.gameKey),
          ),
        ),
    ]);
    const unlockedAt = new Map(unlocks.map((row) => [row.apiName, row.unlockedAt]));
    // Aynı oyunun başka platformdaki seti (başka bir kullanıcı için çekilmiş) bu kullanıcıya gösterilmez.
    if (unlockedAt.size === 0 && !input.providers.includes(set.provider)) continue;
    const items: AchievementView[] = defs.map((def) => {
      const unlocked = unlockedAt.has(def.apiName);
      const text = localize(def, input.locale);
      const masked = def.hidden && !unlocked;
      return {
        apiName: def.apiName,
        name: masked ? "" : text.name,
        description: masked ? null : text.description,
        iconUrl: unlocked ? def.iconUrl : (def.iconLockedUrl ?? def.iconUrl),
        hidden: def.hidden,
        rarity: def.rarity,
        grade: def.grade,
        unlocked,
        unlockedAt: unlockedAt.get(def.apiName)?.toISOString() ?? null,
      };
    });
    // Açılanlar önce (en yeni en üstte), sonra kilitliler nadirlikten yaygına değil, oyundaki sırayla.
    items.sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (a.unlocked && b.unlocked) return (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "");
      return 0;
    });
    result.push({
      provider: set.provider,
      gameKey: set.gameKey,
      total: defs.length,
      unlocked: unlockedAt.size,
      items,
    });
  }
  return result;
}

/** Akış kartı için başarım özetleri (ad + çeviriler, ikon, nadirlik); en nadirler önce. */
export async function achievementSummaries(
  tx: DbOrTx,
  input: { provider: string; gameKey: string; apiNames: string[] },
) {
  if (input.apiNames.length === 0) return [];
  const rows = await tx
    .select()
    .from(achievements)
    .where(
      and(
        eq(achievements.provider, input.provider),
        eq(achievements.gameKey, input.gameKey),
        inArray(achievements.apiName, input.apiNames),
      ),
    );
  return rows
    .map((row) => ({
      apiName: row.apiName,
      name: row.name,
      localized: row.localized ?? null,
      iconUrl: row.iconUrl,
      rarity: row.rarity,
      grade: row.grade,
    }))
    .sort((a, b) => (a.rarity ?? 101) - (b.rarity ?? 101));
}

/** Kütüphane kaydının başarımları (kaydın sahibinin durumu; kayıtlar herkese açık). */
export async function entryAchievements(entryId: string, locale: string) {
  const [entry] = await db
    .select({
      userId: libraryEntries.userId,
      gameId: libraryEntries.gameId,
      steam: libraryEntries.playtimeSteamMin,
      psn: libraryEntries.playtimePsnMin,
      xbox: libraryEntries.playtimeXboxMin,
    })
    .from(libraryEntries)
    .where(eq(libraryEntries.id, entryId));
  if (!entry) return null;
  const providers = (["steam", "psn", "xbox"] as const).filter((key) => entry[key] !== null);
  return gameAchievements({ gameId: entry.gameId, userId: entry.userId, locale, providers });
}
