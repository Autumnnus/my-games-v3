import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { steamConfig } from "../config";
import { db } from "../db";
import { emit } from "../events";
import { getPlayerSummaries } from "./api";

const { steamAccounts } = schema;

/**
 * "Şu an oynuyor" bilgisini tazeler. Tek istekte 100 kullanıcı sorgulanır. Bir oyun kapandığında o
 * kullanıcı için senkronizasyon istenir; böylece oturum süresi beklemeden kaydedilir.
 */
export async function pollPresence() {
  if (!steamConfig()) return { checked: 0, changed: 0 };
  const accounts = await db
    .select({
      userId: steamAccounts.userId,
      steamId: steamAccounts.steamId,
      currentAppId: steamAccounts.currentAppId,
    })
    .from(steamAccounts)
    .where(eq(steamAccounts.syncEnabled, true));

  let changed = 0;
  for (let index = 0; index < accounts.length; index += 100) {
    const chunk = accounts.slice(index, index + 100);
    const summaries = await getPlayerSummaries(chunk.map((account) => account.steamId));
    const bySteamId = new Map(summaries.map((summary) => [summary.steamid, summary]));

    for (const account of chunk) {
      const summary = bySteamId.get(account.steamId);
      const appId = summary?.gameid ? Number(summary.gameid) : null;
      if (appId === account.currentAppId) continue;
      changed++;
      await db.transaction(async (tx) => {
        await tx
          .update(steamAccounts)
          .set({
            currentAppId: appId,
            currentGameName: appId ? (summary?.gameextrainfo ?? null) : null,
            currentSince: appId ? new Date() : null,
            ...(summary
              ? {
                  personaName: summary.personaname,
                  avatarUrl: summary.avatarfull ?? null,
                  visibility: summary.communityvisibilitystate,
                }
              : {}),
          })
          .where(eq(steamAccounts.userId, account.userId));
        if (account.currentAppId && account.currentAppId !== appId) {
          await emit(tx, "steam.sync_requested", { userId: account.userId });
        }
      });
    }
  }
  return { checked: accounts.length, changed };
}

/** Akıştaki "şu an oynayanlar" bölümü. */
export async function nowPlaying(limit = 20) {
  const { user } = schema;
  return db
    .select({
      appId: steamAccounts.currentAppId,
      gameName: steamAccounts.currentGameName,
      since: steamAccounts.currentSince,
      user: { id: user.id, name: user.name, username: user.displayUsername, image: user.image },
    })
    .from(steamAccounts)
    .innerJoin(user, eq(user.id, steamAccounts.userId))
    .where(eq(steamAccounts.syncEnabled, true))
    .orderBy(steamAccounts.currentSince)
    .limit(limit)
    .then((rows) => rows.filter((row) => row.appId !== null));
}
