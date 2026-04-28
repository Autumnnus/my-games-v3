import mongoose from "mongoose";
import Game from "../models/Game";
import LibraryEntry, { type ILibraryEntry } from "../models/LibraryEntry";
import type { AddGameInput } from "../schemas/game.schema";
import type { GameListItem } from "../types/contracts/game.contract";
import type {
  Game as SharedGame,
  GameStatus,
  IGDBData,
  Platform,
  Statistics,
} from "@my-games/shared";
import type { QueryOptions } from "mongoose";

type MatchCriteria = mongoose.QueryFilter<ILibraryEntry>;
type SortCriteria = NonNullable<QueryOptions<ILibraryEntry>["sort"]>;

type GameDocumentLike = SharedGame & { _id: mongoose.Types.ObjectId };
type PopulatedEntry = ILibraryEntry & { game: GameDocumentLike };

function isPopulatedGame(game: unknown): game is GameDocumentLike {
  return Boolean(game && typeof game === "object" && "title" in game);
}

export function toLegacyGameResponse(entry: ILibraryEntry): GameListItem & {
  title: string;
  coverUrl?: string;
  game?: GameDocumentLike;
  libraryEntry: ILibraryEntry;
} {
  const game = isPopulatedGame(entry.game) ? entry.game : undefined;

  return {
    _id: entry._id.toString(),
    name: game?.title ?? "",
    photo: game?.coverUrl,
    lastPlay: entry.lastPlayedAt,
    lastPlayDate: entry.lastPlayDate,
    platform: entry.platform,
    review: entry.review,
    rating: entry.rating,
    status: entry.status,
    playTime: entry.playTimeMinutes,
    screenshotSize: 0,
    userId: entry.user?.toString(),
    isFavorite: entry.isFavorite,
    firstFinished: entry.firstCompletedAt,
    completionDate: entry.completionDate,
    slug: game?.slug ?? "",
    igdb: game?.metadata?.igdb,
    steamAppId: game?.sourceIds?.steamAppId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    title: game?.title ?? "",
    coverUrl: game?.coverUrl,
    game,
    libraryEntry: entry,
  };
}

function buildGameData(data: AddGameInput) {
  const { igdb, name, photo, steamAppId } = data;

  return {
    title: name,
    coverUrl: photo ?? igdb?.cover?.url,
    sourceIds: {
      igdbId: igdb?.id,
      steamAppId,
    },
    metadata: {
      igdb,
    },
  };
}

function buildEntryData(
  data: AddGameInput,
  userId: string,
  gameId: mongoose.Types.ObjectId,
) {
  return {
    user: userId,
    game: gameId,
    platform: data.platform as Platform,
    status: data.status as GameStatus,
    rating: data.rating,
    review: data.review,
    playTimeMinutes: data.playTime,
    lastPlayedAt: data.lastPlay,
    lastPlayDate: data.lastPlayDate,
    firstCompletedAt: data.firstFinished,
    completionDate: data.completionDate ?? null,
    isFavorite: data.isFavorite,
  };
}

async function findOrCreateGame(data: AddGameInput) {
  const gameData = buildGameData(data);
  const igdbId = gameData.sourceIds.igdbId;
  const steamAppId = gameData.sourceIds.steamAppId;

  if (igdbId) {
    const existing = await Game.findOne({ "sourceIds.igdbId": igdbId });
    if (existing) {
      if (!existing.metadata?.igdb)
        existing.metadata = {
          ...existing.metadata,
          igdb: gameData.metadata.igdb,
        };
      if (!existing.coverUrl && gameData.coverUrl)
        existing.coverUrl = gameData.coverUrl;
      await existing.save();
      return existing;
    }
  }

  if (steamAppId) {
    const existing = await Game.findOne({ "sourceIds.steamAppId": steamAppId });
    if (existing) return existing;
  }

  const game = new Game(gameData);
  const existingBySlug = await Game.findOne({ slug: game.makeSlug() });
  if (existingBySlug) {
    if (igdbId && !existingBySlug.sourceIds?.igdbId)
      existingBySlug.sourceIds = { ...existingBySlug.sourceIds, igdbId };
    if (steamAppId && !existingBySlug.sourceIds?.steamAppId)
      existingBySlug.sourceIds = { ...existingBySlug.sourceIds, steamAppId };
    if (gameData.metadata.igdb && !existingBySlug.metadata?.igdb)
      existingBySlug.metadata = {
        ...existingBySlug.metadata,
        igdb: gameData.metadata.igdb,
      };
    if (!existingBySlug.coverUrl && gameData.coverUrl)
      existingBySlug.coverUrl = gameData.coverUrl;
    await existingBySlug.save();
    return existingBySlug;
  }

  return await game.save();
}

async function getGameById(id: string) {
  return await LibraryEntry.findById(id).populate("game");
}

async function getUserGameById(userId: string) {
  return await LibraryEntry.find({ user: userId }).populate("game");
}

async function createGame(data: AddGameInput, userId: string) {
  const game = await findOrCreateGame(data);
  const existingEntry = await LibraryEntry.findOne({
    user: userId,
    game: game._id,
  }).populate("game");
  if (existingEntry) return existingEntry;

  return await LibraryEntry.create(buildEntryData(data, userId, game._id));
}

async function findGameByIdAndDelete(id: string) {
  return await LibraryEntry.findByIdAndDelete(id);
}

async function getGames(
  matchCriteria: MatchCriteria,
  sortCriteria: SortCriteria,
  skip?: number,
  limit?: number,
) {
  const query = LibraryEntry.find(matchCriteria)
    .populate("game")
    .sort(sortCriteria);
  if (Number(skip) > 0) query.skip(Number(skip));
  if (Number(limit) > 0) query.limit(Number(limit));
  return await query;
}

async function updateEntryGameMetadata(entryId: string, igdbGame: IGDBData) {
  const entry = await LibraryEntry.findById(entryId);
  if (!entry) return null;

  await Game.updateOne(
    { _id: entry.game },
    {
      $set: {
        coverUrl: igdbGame.cover?.url,
        "sourceIds.igdbId": igdbGame.id,
        "metadata.igdb": igdbGame,
      },
    },
    { timestamps: false } as object,
  );

  return await LibraryEntry.findById(entryId).populate("game");
}

async function getCatalogGamesWithIgdb() {
  return await Game.find({ "sourceIds.igdbId": { $exists: true } });
}

async function updateCatalogGameIgdb(gameId: string, igdbGame: IGDBData) {
  return await Game.updateOne(
    { _id: gameId },
    {
      $set: {
        coverUrl: igdbGame.cover?.url,
        "sourceIds.igdbId": igdbGame.id,
        "metadata.igdb": igdbGame,
      },
    },
    { timestamps: false } as object,
  );
}

async function getGameStatistics(userId?: string): Promise<Statistics> {
  const matchStage = userId
    ? { $match: { user: new mongoose.Types.ObjectId(userId) } }
    : { $match: {} };

  const results = await LibraryEntry.aggregate([
    matchStage,
    {
      $lookup: {
        from: "games",
        localField: "game",
        foreignField: "_id",
        as: "game",
      },
    },
    { $unwind: "$game" },
    {
      $facet: {
        platformStats: [
          {
            $group: {
              _id: "$platform",
              playTime: { $sum: "$playTimeMinutes" },
              count: { $sum: 1 },
            },
          },
          { $sort: { playTime: -1 } },
        ],
        statusStats: [
          {
            $group: {
              _id: "$status",
              playTime: { $sum: "$playTimeMinutes" },
              count: { $sum: 1 },
            },
          },
          { $sort: { playTime: -1 } },
        ],
        myGamesRatingStats: [
          {
            $bucketAuto: {
              groupBy: "$rating",
              buckets: 10,
              output: {
                playTime: { $sum: "$playTimeMinutes" },
                count: { $sum: 1 },
                averageRating: { $avg: "$rating" },
              },
            },
          },
          {
            $project: {
              _id: { $concat: ["$id.min", " ", "$id.max"] },
              playTime: 1,
              count: 1,
              averageRating: 1,
            },
          },
          { $sort: { averageRating: 1 } },
        ],
        genreStats: [
          { $unwind: "$game.metadata.igdb.genres" },
          {
            $group: {
              _id: "$game.metadata.igdb.genres.name",
              playTime: { $sum: "$playTimeMinutes" },
              count: { $sum: 1 },
            },
          },
          { $sort: { playTime: -1 } },
        ],
        developerStats: [
          { $unwind: "$game.metadata.igdb.involved_companies" },
          {
            $match: { "game.metadata.igdb.involved_companies.developer": true },
          },
          {
            $group: {
              _id: "$game.metadata.igdb.involved_companies.company.name",
              playTime: { $sum: "$playTimeMinutes" },
              count: { $sum: 1 },
            },
          },
          { $sort: { playTime: -1 } },
        ],
        publisherStats: [
          { $unwind: "$game.metadata.igdb.involved_companies" },
          {
            $match: { "game.metadata.igdb.involved_companies.publisher": true },
          },
          {
            $group: {
              _id: "$game.metadata.igdb.involved_companies.company.name",
              playTime: { $sum: "$playTimeMinutes" },
              count: { $sum: 1 },
            },
          },
          { $sort: { playTime: -1 } },
        ],
        gameModeStats: [
          { $unwind: "$game.metadata.igdb.game_modes" },
          {
            $group: {
              _id: "$game.metadata.igdb.game_modes.name",
              playTime: { $sum: "$playTimeMinutes" },
              count: { $sum: 1 },
            },
          },
          { $sort: { playTime: -1 } },
        ],
        ratingStats: [
          {
            $match: {
              "game.metadata.igdb.aggregated_rating": { $exists: true },
            },
          },
          {
            $bucket: {
              groupBy: "$game.metadata.igdb.aggregated_rating",
              boundaries: [0, 50, 75, 90, 101],
              default: "Others",
              output: {
                playTime: { $sum: "$playTimeMinutes" },
                count: { $sum: 1 },
                averageRating: {
                  $avg: "$game.metadata.igdb.aggregated_rating",
                },
              },
            },
          },
        ],
        themeStats: [
          { $unwind: "$game.metadata.igdb.themes" },
          {
            $group: {
              _id: "$game.metadata.igdb.themes.name",
              playTime: { $sum: "$playTimeMinutes" },
              count: { $sum: 1 },
            },
          },
          { $sort: { playTime: -1 } },
        ],
        releaseYearStats: [
          {
            $match: {
              "game.metadata.igdb.first_release_date": { $exists: true },
            },
          },
          {
            $addFields: {
              releaseDate: {
                $toDate: {
                  $multiply: ["$game.metadata.igdb.first_release_date", 1000],
                },
              },
            },
          },
          {
            $group: {
              _id: { $year: "$releaseDate" },
              playTime: { $sum: "$playTimeMinutes" },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
        ],
        playerPerspectiveStats: [
          { $unwind: "$game.metadata.igdb.player_perspectives" },
          {
            $group: {
              _id: "$game.metadata.igdb.player_perspectives.name",
              playTime: { $sum: "$playTimeMinutes" },
              count: { $sum: 1 },
            },
          },
          { $sort: { playTime: -1 } },
        ],
      },
    },
  ]);

  return results[0] as Statistics;
}

export default {
  getGameById,
  getUserGameById,
  getGames,
  createGame,
  findGameByIdAndDelete,
  getGameStatistics,
  toLegacyGameResponse,
  updateEntryGameMetadata,
  getCatalogGamesWithIgdb,
  updateCatalogGameIgdb,
};
