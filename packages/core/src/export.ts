import { schema } from "@my-games/db";
import { asc, eq } from "drizzle-orm";
import { db } from "./db";

const { user, libraryEntries, games, entryHistory, screenshots } = schema;

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

  const [library, history, shots] = await Promise.all([
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
      .select()
      .from(screenshots)
      .where(eq(screenshots.userId, userId))
      .orderBy(asc(screenshots.createdAt)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile,
    library: library.map(({ entry, game }) => ({ ...entry, game })),
    history,
    screenshots: shots,
  };
}
