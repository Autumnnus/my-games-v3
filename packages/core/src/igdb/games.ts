import type { TermKind } from "@my-games/shared";
import { igdbQuery, sanitizeSearch } from "./client";

/** IGDB `external_game_sources` içinde Steam'in kimliği (eski enum'dan taşındı). */
export const STEAM_SOURCE_ID = 1;

/** IGDB game type kimlikleri (eski `category` enum'uyla aynı değerler). */
export const GAME_TYPES: Record<number, string> = {
  0: "main_game",
  1: "dlc_addon",
  2: "expansion",
  3: "bundle",
  4: "standalone_expansion",
  5: "mod",
  6: "episode",
  7: "season",
  8: "remake",
  9: "remaster",
  10: "expanded_game",
  11: "port",
  12: "fork",
  13: "pack",
  14: "update",
};

/** Aramada gösterilen türler: ana oyun, genişleme, bağımsız genişleme, remake, remaster, expanded, port. */
const SEARCHABLE_TYPES = "(0,2,4,8,9,10,11)";

type Named = { id: number; name: string };

export type IgdbGame = {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  storyline?: string;
  first_release_date?: number;
  cover?: { image_id: string };
  genres?: Named[];
  themes?: Named[];
  game_modes?: Named[];
  player_perspectives?: Named[];
  involved_companies?: Array<{ company?: Named; developer?: boolean; publisher?: boolean }>;
  game_type?: number | { id: number };
  total_rating?: number;
  total_rating_count?: number;
  external_games?: Array<{ uid?: string; external_game_source?: number | { id: number } }>;
};

export type IgdbTimeToBeat = {
  game_id: number;
  hastily?: number;
  normally?: number;
  completely?: number;
};

const DETAIL_FIELDS = [
  "name",
  "slug",
  "summary",
  "storyline",
  "first_release_date",
  "cover.image_id",
  "genres.name",
  "themes.name",
  "game_modes.name",
  "player_perspectives.name",
  "involved_companies.company.name",
  "involved_companies.developer",
  "involved_companies.publisher",
  "game_type",
  "total_rating",
  "total_rating_count",
  "external_games.uid",
  "external_games.external_game_source",
].join(",");

const SEARCH_FIELDS = "name,slug,cover.image_id,first_release_date,game_type";

export type IgdbSearchResult = {
  igdbId: number;
  name: string;
  coverImageId: string | null;
  releaseYear: number | null;
  gameType: string | null;
};

export async function searchIgdbGames(query: string, limit = 20): Promise<IgdbSearchResult[]> {
  const term = sanitizeSearch(query);
  if (term.length < 2) return [];
  const rows = await igdbQuery<IgdbGame[]>(
    "games",
    `fields ${SEARCH_FIELDS}; search "${term}"; where game_type = ${SEARCHABLE_TYPES} & version_parent = null; limit ${limit};`,
  );
  return rows.map(toSearchResult);
}

export function toSearchResult(game: IgdbGame): IgdbSearchResult {
  return {
    igdbId: game.id,
    name: game.name,
    coverImageId: game.cover?.image_id ?? null,
    releaseYear: game.first_release_date
      ? new Date(game.first_release_date * 1000).getUTCFullYear()
      : null,
    gameType: gameTypeName(game.game_type),
  };
}

export async function fetchIgdbGame(igdbId: number) {
  const result = await igdbQuery<Array<{ name: string; result: unknown[] }>>(
    "multiquery",
    [
      `query games "game" { fields ${DETAIL_FIELDS}; where id = ${Math.trunc(igdbId)}; };`,
      `query game_time_to_beats "ttb" { fields game_id,hastily,normally,completely; where game_id = ${Math.trunc(igdbId)}; };`,
    ].join("\n"),
  );
  const game = result.find((part) => part.name === "game")?.result[0] as IgdbGame | undefined;
  const ttb = result.find((part) => part.name === "ttb")?.result[0] as IgdbTimeToBeat | undefined;
  return game ? { game, timeToBeat: ttb ?? null } : null;
}

export async function findIgdbIdBySteamApp(appId: number): Promise<number | null> {
  const rows = await igdbQuery<Array<{ game?: number }>>(
    "external_games",
    `fields game,uid; where external_game_source = ${STEAM_SOURCE_ID} & uid = "${Math.trunc(appId)}"; limit 1;`,
  );
  return rows[0]?.game ?? null;
}

export function gameTypeName(value: IgdbGame["game_type"]) {
  const id = typeof value === "object" ? value?.id : value;
  return id === undefined ? null : (GAME_TYPES[id] ?? null);
}

export function steamAppIdOf(game: IgdbGame): number | null {
  for (const external of game.external_games ?? []) {
    const source =
      typeof external.external_game_source === "object"
        ? external.external_game_source?.id
        : external.external_game_source;
    const appId = Number(external.uid);
    if (source === STEAM_SOURCE_ID && Number.isInteger(appId) && appId > 0) return appId;
  }
  return null;
}

export type MappedTerm = { kind: TermKind; igdbId: number; name: string; role: string };

/** IGDB oyununu katalog satırına ve taksonomi terimlerine çevirir. */
export function mapIgdbGame(game: IgdbGame, timeToBeat: IgdbTimeToBeat | null) {
  const terms: MappedTerm[] = [];
  const push = (kind: TermKind, items: Named[] | undefined) => {
    for (const item of items ?? [])
      terms.push({ kind, igdbId: item.id, name: item.name, role: "" });
  };
  push("genre", game.genres);
  push("theme", game.themes);
  push("game_mode", game.game_modes);
  push("player_perspective", game.player_perspectives);
  for (const involved of game.involved_companies ?? []) {
    if (!involved.company) continue;
    const base = {
      kind: "company" as const,
      igdbId: involved.company.id,
      name: involved.company.name,
    };
    if (involved.developer) terms.push({ ...base, role: "developer" });
    if (involved.publisher) terms.push({ ...base, role: "publisher" });
  }

  return {
    game: {
      source: "igdb" as const,
      igdbId: game.id,
      steamAppId: steamAppIdOf(game),
      name: game.name,
      summary: game.summary ?? null,
      storyline: game.storyline ?? null,
      coverImageId: game.cover?.image_id ?? null,
      releaseDate: game.first_release_date
        ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10)
        : null,
      gameType: gameTypeName(game.game_type),
      rating: game.total_rating ?? null,
      ratingCount: game.total_rating_count ?? null,
      timeToBeatHastily: timeToBeat?.hastily ?? null,
      timeToBeatNormally: timeToBeat?.normally ?? null,
      timeToBeatCompletely: timeToBeat?.completely ?? null,
    },
    terms,
  };
}
