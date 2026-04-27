import { AppError } from "../lib/errors";
import gameRepository from "../repository/game.repository";
import igdbRepository from "../repository/igdb.repository";

const IGDB_FIELDS =
  "name,id,cover.game,cover.url,slug,summary,genres.name,themes.name,player_perspectives.name,game_modes.name,release_dates.date,involved_companies.publisher,involved_companies.developer,aggregated_rating,involved_companies.company.name,aggregated_rating_count,category,first_release_date";

function escapeIgdbSearch(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function getIGDBGamesService(search: string) {
  const query = search.trim();
  if (!query) return [];

  const escaped = escapeIgdbSearch(query);
  const strictBody = `fields ${IGDB_FIELDS};\nwhere category = (0,4,8,9,10);\nlimit 30;\nsearch "${escaped}";`;
  const strictResults = await igdbRepository.fetchIgdbGames(strictBody);
  if (strictResults.length > 0) return strictResults;

  const fallbackBody = `fields ${IGDB_FIELDS};\nlimit 30;\nsearch "${escaped}";`;
  return await igdbRepository.fetchIgdbGames(fallbackBody);
}

async function getIGDBGameService(gameId: number) {
  const body = `fields ${IGDB_FIELDS};\nwhere id = ${gameId};\nlimit 1;`;
  const games = await igdbRepository.fetchIgdbGames(body);
  return games[0];
}

async function updateGameIGDBDataService(libraryEntryId: string) {
  const entry = await gameRepository.getGameById(libraryEntryId);
  if (!entry) throw new AppError("NOT_FOUND", "Library entry not found", 404);

  const response = gameRepository.toLegacyGameResponse(entry);
  if (!response.igdb?.id)
    throw new AppError("BAD_REQUEST", "Game does not have an IGDB ID", 400);

  const igdbGame = await getIGDBGameService(response.igdb.id);
  await gameRepository.updateEntryGameMetadata(libraryEntryId, igdbGame);
  return { message: "Game IGDB data updated" };
}

async function updateAllGamesIGDBDataService() {
  const allGames = await gameRepository.getCatalogGamesWithIgdb();
  const updated = [];

  for (const game of allGames) {
    if (!game.sourceIds?.igdbId) continue;
    try {
      const igdbGame = await getIGDBGameService(game.sourceIds.igdbId);
      await gameRepository.updateCatalogGameIgdb(game._id.toString(), igdbGame);
      updated.push(game._id);
    } catch (err) {
      console.error(`Failed to update game ${game._id}:`, err);
    }
  }

  return { count: updated.length, updated };
}

export default {
  getIGDBGamesService,
  getIGDBGameService,
  updateGameIGDBDataService,
  updateAllGamesIGDBDataService,
};
