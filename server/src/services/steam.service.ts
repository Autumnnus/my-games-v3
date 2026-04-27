import { env } from "../config/env";
import { AppError } from "../lib/errors";
import ExternalAccount from "../models/ExternalAccount";
import Game from "../models/Game";
import LibraryEntry from "../models/LibraryEntry";
import User from "../models/User";
import igdbAuthHelper from "../repository/igdb-auth.helper";
import igdbService from "./igdb.service";
import activityService from "./activity.service";

// ─── Steam API types ──────────────────────────────────────────────────────────

interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  avatarfull: string;
  profileurl: string;
  loccountrycode?: string;
}

interface SteamOwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url: string;
}

interface SteamScreenshot {
  publishedfileid: string;
  title: string;
  file_url: string;
  preview_url: string;
  app_name?: string;
  consumer_appid?: number;
}

// ─── Steam Web API helpers ────────────────────────────────────────────────────

export async function fetchSteamProfile(
  steamId: string,
): Promise<SteamPlayerSummary> {
  const url = new URL(
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/",
  );
  url.searchParams.set("key", env.STEAM_API_KEY);
  url.searchParams.set("steamids", steamId);

  const res = await fetch(url.toString());
  if (!res.ok)
    throw new AppError("BAD_GATEWAY", "Failed to fetch Steam profile", 502);

  const data = (await res.json()) as {
    response: { players: SteamPlayerSummary[] };
  };
  const player = data.response.players[0];
  if (!player) throw new AppError("NOT_FOUND", "Steam profile not found", 404);

  return player;
}

export async function fetchSteamLibrary(
  steamId: string,
): Promise<SteamOwnedGame[]> {
  const url = new URL(
    "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/",
  );
  url.searchParams.set("key", env.STEAM_API_KEY);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("include_played_free_games", "true");

  const res = await fetch(url.toString());
  if (!res.ok)
    throw new AppError("BAD_GATEWAY", "Failed to fetch Steam library", 502);

  const data = (await res.json()) as { response: { games?: SteamOwnedGame[] } };
  return data.response.games ?? [];
}

export async function fetchSteamScreenshots(
  steamId: string,
  appId?: number,
): Promise<SteamScreenshot[]> {
  const url = new URL(
    "https://api.steampowered.com/IPublishedFileService/GetUserFiles/v1/",
  );
  url.searchParams.set("key", env.STEAM_API_KEY);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("appid", "760"); // Steam Screenshots app
  url.searchParams.set("filetype", "4"); // k_EPublishedFileType_Screenshot
  url.searchParams.set("numperpage", "50");
  url.searchParams.set("return_details", "true");

  const res = await fetch(url.toString());
  if (!res.ok)
    throw new AppError("BAD_GATEWAY", "Failed to fetch Steam screenshots", 502);

  const data = (await res.json()) as {
    response: { publishedfiledetails?: SteamScreenshot[] };
  };
  const all = data.response.publishedfiledetails ?? [];
  return appId ? all.filter((s) => s.consumer_appid === appId) : all;
}

// ─── IGDB enrichment via external_games ──────────────────────────────────────

async function findIgdbIdBySteamAppId(
  steamAppId: number,
): Promise<number | null> {
  const accessToken = await igdbAuthHelper.getAccessToken();

  const res = await fetch("https://api.igdb.com/v4/external_games", {
    method: "POST",
    headers: {
      "Client-ID": env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: `fields game; where uid = "${steamAppId}" & category = 1; limit 1;`,
  });

  if (!res.ok) return null;

  const results = (await res.json()) as { game: number }[];
  return results[0]?.game ?? null;
}

function igdbCoverToUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  // IGDB returns protocol-relative URLs like //images.igdb.com/.../t_thumb/hash.jpg
  // Upgrade to t_cover_big (264x374) and ensure https
  const withProtocol = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
  return withProtocol.replace("/t_thumb/", "/t_cover_big/");
}

async function enrichGameWithIGDB(
  game: InstanceType<typeof Game>,
  steamAppId: number,
  steamTitle: string,
): Promise<void> {
  const igdbId = await findIgdbIdBySteamAppId(steamAppId);
  if (!igdbId) return;

  const igdbGame = await igdbService.getIGDBGameService(igdbId);
  if (!igdbGame) return;

  const conflicts: {
    field: string;
    steamValue: unknown;
    igdbValue: unknown;
  }[] = [];

  if (igdbGame.name && igdbGame.name !== steamTitle) {
    conflicts.push({
      field: "title",
      steamValue: steamTitle,
      igdbValue: igdbGame.name,
    });
  }

  const igdbCoverUrl = igdbCoverToUrl(igdbGame.cover?.url);

  game.set("sourceIds.igdbId", igdbId);
  game.set("metadata.igdb", igdbGame);
  // IGDB cover takes priority over Steam cover; Steam cover is fallback
  if (igdbCoverUrl) {
    game.coverUrl = igdbCoverUrl;
  }
  if (conflicts.length > 0) game.pendingConflicts = conflicts;
}

// ─── Auth: login or register via Steam ───────────────────────────────────────

export async function steamLoginOrRegister(
  steamId: string,
): Promise<InstanceType<typeof User>> {
  const existing = await ExternalAccount.findOne({
    provider: "steam",
    providerUserId: steamId,
  });

  if (existing) {
    const user = await User.findById(existing.user);
    if (!user)
      throw new AppError(
        "NOT_FOUND",
        "User not found for this Steam account",
        404,
      );
    return user;
  }

  const profile = await fetchSteamProfile(steamId);

  const user = await User.create({
    name: profile.personaname,
    profileImage: profile.avatarfull,
    isVerified: true,
    authProviders: ["steam"],
  });

  await ExternalAccount.create({
    user: user._id,
    provider: "steam",
    providerUserId: steamId,
    displayName: profile.personaname,
    syncStatus: "idle",
  });

  return user;
}

// ─── Link/Unlink ─────────────────────────────────────────────────────────────

export async function linkSteamAccount(
  userId: string,
  steamId: string,
): Promise<void> {
  const existing = await ExternalAccount.findOne({
    provider: "steam",
    providerUserId: steamId,
  });

  if (existing && existing.user.toString() !== userId) {
    throw new AppError(
      "CONFLICT",
      "This Steam account is already linked to another user",
      409,
    );
  }

  if (existing && existing.user.toString() === userId) {
    throw new AppError(
      "CONFLICT",
      "This Steam account is already linked to your account",
      409,
    );
  }

  const profile = await fetchSteamProfile(steamId);

  await ExternalAccount.create({
    user: userId,
    provider: "steam",
    providerUserId: steamId,
    displayName: profile.personaname,
    syncStatus: "idle",
  });

  await User.findByIdAndUpdate(userId, {
    $addToSet: { authProviders: "steam" },
  });
}

export async function unlinkSteamAccount(userId: string): Promise<void> {
  const account = await ExternalAccount.findOne({
    user: userId,
    provider: "steam",
  });
  if (!account) throw new AppError("NOT_FOUND", "No Steam account linked", 404);

  const user = await User.findById(userId);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);

  // Prevent unlinking if Steam is the only auth provider
  if (user.authProviders.length === 1 && user.authProviders[0] === "steam") {
    throw new AppError(
      "BAD_REQUEST",
      "Cannot unlink Steam — it is your only login method. Add an email/password first.",
      400,
    );
  }

  await account.deleteOne();
  await User.findByIdAndUpdate(userId, { $pull: { authProviders: "steam" } });
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

// ─── Library preview (for manual selection UI) ───────────────────────────────

export interface SteamLibraryItem {
  appId: number;
  title: string;
  playtimeMinutes: number;
  coverUrl: string;
  existingPlaytimeMinutes?: number; // set if already in user's library
}

export async function getSteamLibraryPreview(
  userId: string,
): Promise<SteamLibraryItem[]> {
  const account = await ExternalAccount.findOne({
    user: userId,
    provider: "steam",
  });
  if (!account) throw new AppError("NOT_FOUND", "No Steam account linked", 404);

  const steamGames = await fetchSteamLibrary(account.providerUserId);

  // Bulk-fetch existing Game catalog entries for these appids
  const appIds = steamGames.map((g) => g.appid);
  const existingGames = await Game.find({
    "sourceIds.steamAppId": { $in: appIds },
  }).lean();
  const gameByAppId = new Map(
    existingGames.map((g) => [g.sourceIds?.steamAppId, g]),
  );

  // Bulk-fetch existing library entries for this user
  const gameIds = existingGames.map((g) => g._id);
  const existingEntries = await LibraryEntry.find({
    user: userId,
    game: { $in: gameIds },
  })
    .select("game playTimeMinutes")
    .lean();
  const entryByGameId = new Map(
    existingEntries.map((e) => [e.game.toString(), e.playTimeMinutes]),
  );

  return steamGames.map((g) => {
    const existingGame = gameByAppId.get(g.appid);
    const existingPlaytime = existingGame
      ? entryByGameId.get(existingGame._id.toString())
      : undefined;
    return {
      appId: g.appid,
      title: g.name,
      playtimeMinutes: g.playtime_forever ?? 0,
      coverUrl:
        existingGame?.coverUrl ||
        `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
      existingPlaytimeMinutes: existingPlaytime,
    };
  });
}

// ─── Sync selected games ──────────────────────────────────────────────────────

export type PlaytimeConflictResolution = "higher" | "steam" | "keep";

export async function syncSteamData(
  userId: string,
  options: { appIds: number[]; conflictResolution: PlaytimeConflictResolution },
): Promise<{ synced: number; failed: number }> {
  const account = await ExternalAccount.findOne({
    user: userId,
    provider: "steam",
  });
  if (!account) throw new AppError("NOT_FOUND", "No Steam account linked", 404);

  const steamId = account.providerUserId;
  account.syncStatus = "syncing";
  await account.save();

  let synced = 0;
  let failed = 0;

  try {
    const allGames = await fetchSteamLibrary(steamId);
    const selectedSet = new Set(options.appIds);
    const games = allGames.filter((g) => selectedSet.has(g.appid));

    for (const steamGame of games) {
      try {
        let game = await Game.findOne({
          "sourceIds.steamAppId": steamGame.appid,
        });

        if (!game) {
          game = new Game({
            title: steamGame.name,
            coverUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${steamGame.appid}/library_600x900.jpg`,
            sourceIds: { steamAppId: steamGame.appid },
          });
        } else if (
          !game.coverUrl ||
          game.coverUrl.includes("media.steampowered.com")
        ) {
          game.coverUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${steamGame.appid}/library_600x900.jpg`;
        }

        await game.save();

        try {
          await enrichGameWithIGDB(game, steamGame.appid, steamGame.name);
          await game.save();
        } catch {
          // Non-blocking: Steam sync should continue even if IGDB enrichment fails.
        }

        const steamPlaytime = steamGame.playtime_forever ?? 0;
        const existing = await LibraryEntry.findOne({
          user: userId,
          game: game._id,
        });

        let finalPlaytime = steamPlaytime;
        if (existing) {
          if (options.conflictResolution === "keep") {
            finalPlaytime = existing.playTimeMinutes;
          } else if (options.conflictResolution === "higher") {
            finalPlaytime = Math.max(existing.playTimeMinutes, steamPlaytime);
          }
          // 'steam' → always use steamPlaytime (default)
        }

        await LibraryEntry.findOneAndUpdate(
          { user: userId, game: game._id },
          {
            $set: {
              platform: "steam",
              playTimeMinutes: finalPlaytime,
              steamPlaytimeMinutes: steamPlaytime,
              syncedFromSteam: true,
              lastPlayedAt: new Date(),
            },
            $setOnInsert: {
              status: "toBeCompleted",
              isFavorite: false,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        synced++;
      } catch (err) {
        console.error(`Steam sync: failed for appid ${steamGame.appid}`, err);
        failed++;
      }
    }

    account.syncStatus = "idle";
    account.lastSyncAt = new Date();
    await account.save();

    // Log ONE activity for the entire sync (bulk operation — never per-game)
    if (synced > 0) {
      await activityService.log({
        userId,
        type: "steam_synced",
        metadata: { gamesAdded: synced, gamesUpdated: 0 },
      });
    }
  } catch (err) {
    account.syncStatus = "failed";
    await account.save();
    throw err;
  }

  return { synced, failed };
}

export async function getSyncStatus(userId: string) {
  const account = await ExternalAccount.findOne({
    user: userId,
    provider: "steam",
  });
  if (!account) return null;

  return {
    syncStatus: account.syncStatus,
    lastSyncAt: account.lastSyncAt,
    linkedAt: account.linkedAt,
    displayName: account.displayName,
  };
}
