import { schema } from "@my-games/db";
import { sql } from "drizzle-orm";

const e = schema.libraryEntries;

/** Bir kaydın toplam süresi (dakika): elle girilen + Steam + PSN + Xbox. */
export const entryPlaytime = sql<number>`(${e.playtimeManualMin} + coalesce(${e.playtimeSteamMin}, 0) + coalesce(${e.playtimePsnMin}, 0) + coalesce(${e.playtimeXboxMin}, 0))`;

/** Aynı toplam, ham SQL'de takma adlı tablo için (`a.` gibi). */
export function aliasedPlaytime(alias: string) {
  const column = (name: string) => sql.raw(`${alias}.${name}`);
  return sql`(${column("playtime_manual_min")} + coalesce(${column("playtime_steam_min")}, 0) + coalesce(${column("playtime_psn_min")}, 0) + coalesce(${column("playtime_xbox_min")}, 0))`;
}
