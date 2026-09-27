import { steamConfig } from "../config";
import { AppError } from "../errors";

const API = "https://api.steampowered.com";

export type OwnedGame = {
  appid: number;
  name?: string;
  playtime_forever: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
  has_community_visible_stats?: boolean;
};

export type PlayerSummary = {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatarfull?: string;
  communityvisibilitystate: number;
  gameid?: string;
  gameextrainfo?: string;
};

export class SteamPrivateError extends AppError {
  constructor() {
    super("forbidden", "Steam profili veya oyun detayları gizli");
  }
}

async function call<T>(path: string, params: Record<string, string | number | boolean>) {
  const config = steamConfig();
  if (!config) throw new AppError("unavailable", "Steam yapılandırılmamış");
  const url = new URL(`${API}/${path}`);
  url.searchParams.set("key", config.apiKey);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    // Hatalı anahtar ve bazı hatalar JSON değil HTML döner; gövdeyi körlemesine parse etme.
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("json")) {
      if (response.status === 401 || response.status === 403) {
        throw new AppError("unavailable", `Steam API anahtarı reddedildi (${response.status})`);
      }
      throw new AppError("unavailable", `Steam ${path} ${response.status}`);
    }
    return { status: response.status, body: (await response.json()) as T };
  }
  throw new AppError("rate_limited", "Steam istek sınırı");
}

/** Sahip olunan oyunlar + süreler. Profil/oyun detayları gizliyse `SteamPrivateError`. */
export async function getOwnedGames(steamId: string) {
  const { body } = await call<{ response: { game_count?: number; games?: OwnedGame[] } }>(
    "IPlayerService/GetOwnedGames/v1/",
    { steamid: steamId, include_appinfo: true, include_played_free_games: true },
  );
  if (!body.response?.games) throw new SteamPrivateError();
  return body.response.games;
}

/** En fazla 100 kullanıcı için profil ve "şu an oynuyor" bilgisi. */
export async function getPlayerSummaries(steamIds: string[]) {
  if (steamIds.length === 0) return [];
  if (steamIds.length > 100) throw new AppError("invalid", "En fazla 100 Steam kimliği");
  const { body } = await call<{ response: { players: PlayerSummary[] } }>(
    "ISteamUser/GetPlayerSummaries/v2/",
    { steamids: steamIds.join(",") },
  );
  return body.response?.players ?? [];
}

export type PlayerAchievement = { apiname: string; achieved: number; unlocktime: number };

/** Kullanıcının bir oyundaki başarım durumu; oyunun başarımı yoksa ya da gizliyse `null`. */
export async function getPlayerAchievements(steamId: string, appId: number) {
  const { status, body } = await call<{
    playerstats?: { success?: boolean; achievements?: PlayerAchievement[] };
  }>("ISteamUserStats/GetPlayerAchievements/v1/", { steamid: steamId, appid: appId });
  const achievements = body.playerstats?.achievements;
  if (status !== 200 || !body.playerstats?.success || !achievements?.length) return null;
  return achievements;
}

export type SchemaAchievement = {
  name: string;
  displayName: string;
  description?: string;
  hidden: number;
  icon?: string;
  icongray?: string;
};

/** Oyunun başarım tanımları (`language`: `english`, `turkish`…). */
export async function getSchemaForGame(appId: number, language: string) {
  const { status, body } = await call<{
    game?: { availableGameStats?: { achievements?: SchemaAchievement[] } };
  }>("ISteamUserStats/GetSchemaForGame/v2/", { appid: appId, l: language });
  if (status !== 200) return null;
  return body.game?.availableGameStats?.achievements ?? [];
}

/** Başarımların oyuncular arasında açılma yüzdeleri (0–100). */
export async function getGlobalAchievementPercentages(appId: number) {
  const { status, body } = await call<{
    achievementpercentages?: { achievements?: Array<{ name: string; percent: number | string }> };
  }>("ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/", { gameid: appId });
  if (status !== 200) return new Map<string, number>();
  return new Map(
    (body.achievementpercentages?.achievements ?? []).map((row) => [row.name, Number(row.percent)]),
  );
}

export type SteamPublishedFile = {
  publishedfileid: string;
  consumer_appid?: number;
  file_url?: string;
  preview_url?: string;
  title?: string;
  file_description?: string;
  time_created?: number;
  image_width?: number;
  image_height?: number;
  visibility?: number;
};

/**
 * Kullanıcının Steam'de herkese açık paylaştığı ekran görüntüleri (bir sayfa). `filetype=4`:
 * `k_PFI_MatchingFileType_Screenshots`. Gizli/arkadaşlara açık olanlar gelmez.
 */
export async function getUserScreenshots(steamId: string, page: number, perPage = 100) {
  const { status, body } = await call<{
    response?: { total?: number; publishedfiledetails?: SteamPublishedFile[] };
  }>("IPublishedFileService/GetUserFiles/v1/", {
    steamid: steamId,
    filetype: 4,
    page,
    numperpage: perPage,
    return_previews: true,
  });
  if (status !== 200) return { total: 0, files: [] };
  return {
    total: body.response?.total ?? 0,
    files: body.response?.publishedfiledetails ?? [],
  };
}
