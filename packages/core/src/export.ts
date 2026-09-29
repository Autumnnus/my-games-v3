import { schema } from "@my-games/db";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { assetUrls } from "./media";

const {
  user,
  libraryEntries,
  games,
  entryHistory,
  screenshots,
  mediaAssets,
  userAchievements,
  achievements,
  platformAccounts,
  steamAccounts,
} = schema;

/** Kullanıcının tüm verisi (KVKK/GDPR dışa aktarma). */
export async function exportUserData(userId: string) {
  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.displayUsername,
      bio: user.bio,
      image: user.image,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId));

  const [library, history, shots, unlocked, platforms, steam] = await Promise.all([
    db
      .select({
        entry: libraryEntries,
        game: {
          name: games.name,
          slug: games.slug,
          igdbId: games.igdbId,
          steamAppId: games.steamAppId,
        },
      })
      .from(libraryEntries)
      .innerJoin(games, eq(games.id, libraryEntries.gameId))
      .where(eq(libraryEntries.userId, userId))
      .orderBy(asc(games.name)),
    db
      .select()
      .from(entryHistory)
      .where(eq(entryHistory.userId, userId))
      .orderBy(asc(entryHistory.createdAt)),
    db
      .select({ screenshot: screenshots, asset: mediaAssets })
      .from(screenshots)
      .leftJoin(mediaAssets, eq(mediaAssets.id, screenshots.assetId))
      .where(eq(screenshots.userId, userId))
      .orderBy(asc(screenshots.createdAt)),
    db
      .select({
        provider: userAchievements.provider,
        gameKey: userAchievements.gameKey,
        apiName: userAchievements.apiName,
        name: achievements.name,
        unlockedAt: userAchievements.unlockedAt,
      })
      .from(userAchievements)
      .leftJoin(
        achievements,
        and(
          eq(achievements.provider, userAchievements.provider),
          eq(achievements.gameKey, userAchievements.gameKey),
          eq(achievements.apiName, userAchievements.apiName),
        ),
      )
      .where(eq(userAchievements.userId, userId))
      .orderBy(asc(userAchievements.unlockedAt)),
    // Bağlı hesaplar; token'lar asla dışa aktarılmaz.
    db
      .select({
        provider: platformAccounts.provider,
        externalId: platformAccounts.externalId,
        displayName: platformAccounts.displayName,
        lastSyncedAt: platformAccounts.lastSyncedAt,
      })
      .from(platformAccounts)
      .where(eq(platformAccounts.userId, userId)),
    db
      .select({ steamId: steamAccounts.steamId, personaName: steamAccounts.personaName })
      .from(steamAccounts)
      .where(eq(steamAccounts.userId, userId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile,
    library: library.map(({ entry, game }) => ({ ...entry, game })),
    history,
    // Yüklenen görsellerin adresleri (dosyaların kendisi dışa aktarılmaz, adreslerden indirilebilir).
    screenshots: shots.map(({ screenshot, asset }) => ({
      ...screenshot,
      ...(asset
        ? { ...assetUrls(asset), quality: asset.quality, sizeBytes: asset.totalBytes }
        : {}),
    })),
    achievements: unlocked,
    linkedAccounts: [
      ...steam.map((row) => ({
        provider: "steam",
        externalId: row.steamId,
        displayName: row.personaName,
      })),
      ...platforms,
    ],
  };
}
