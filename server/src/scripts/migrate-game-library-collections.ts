import mongoose from "mongoose";
import slugify from "slugify";
import { connectDatabase } from "../config/db";
import Game from "../models/Game";
import LibraryEntry from "../models/LibraryEntry";
import Screenshot from "../models/Screenshot";
import type { GameStatus, IGDBData, Platform } from "@my-games/shared";

type LegacyGame = {
  _id: mongoose.Types.ObjectId;
  name?: string;
  gameName?: string;
  photo?: string;
  gamePhoto?: string;
  lastPlay?: Date;
  gameDate?: string;
  platform?: Platform;
  gamePlatform?: string;
  review?: string;
  gameReview?: string;
  rating?: number;
  gameScore?: number;
  status?: GameStatus;
  gameStatus?: string;
  playTime?: number;
  gameTotalTime?: number;
  screenshotSize?: number;
  userId?: mongoose.Types.ObjectId;
  firstFinished?: Date;
  igdb?: IGDBData;
  slug?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

const LegacyGameSchema = new mongoose.Schema(
  {},
  { strict: false, collection: "games_legacy" },
);
const LegacyGameModel = mongoose.model<LegacyGame & mongoose.Document>(
  "LegacyGame",
  LegacyGameSchema,
);

function makeSlug(value: string) {
  return slugify(value, {
    replacement: "-",
    remove: /[*+~.()'"!:@]/g,
    lower: true,
    strict: false,
    trim: true,
  });
}

function mapStatus(value?: string): GameStatus {
  const normalized = value?.toLowerCase();
  if (value === "completed" || normalized === "bitirildi") return "completed";
  if (
    value === "abandoned" ||
    normalized === "bırakıldı" ||
    normalized === "birakildi"
  )
    return "abandoned";
  if (
    value === "activePlaying" ||
    normalized === "oynanıyor" ||
    normalized === "oynaniyor"
  )
    return "activePlaying";
  return "toBeCompleted";
}

function mapPlatform(value?: string): Platform {
  const normalized = value?.toLowerCase();
  if (normalized === "steam") return "steam";
  if (normalized === "epicgames" || normalized === "epic games")
    return "epicGames";
  if (normalized === "ubisoft") return "ubisoft";
  if (normalized === "xboxpc" || normalized === "xbox pc") return "xboxPc";
  if (normalized === "eagames" || normalized === "ea games") return "eaGames";
  if (normalized === "torrent") return "torrent";
  if (normalized === "playstation") return "playstation";
  if (normalized === "xboxseries" || normalized === "xbox series")
    return "xboxSeries";
  if (normalized === "nintendo") return "nintendo";
  if (normalized === "mobile") return "mobile";
  return "otherPlatforms";
}

async function ensureLegacyCollection() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is not ready");

  const collections = await db.listCollections().toArray();
  const hasGames = collections.some(
    (collection) => collection.name === "games",
  );
  const hasLegacy = collections.some(
    (collection) => collection.name === "games_legacy",
  );

  if (hasGames && !hasLegacy) {
    await db.collection("games").rename("games_legacy");
    console.log("Renamed games collection to games_legacy");
  }
}

async function migrate() {
  await connectDatabase();
  await ensureLegacyCollection();

  const legacyGames = await LegacyGameModel.find({});
  let migrated = 0;

  for (const legacy of legacyGames) {
    const title = legacy.name ?? legacy.gameName;
    if (!title || !legacy.userId) continue;

    const igdb = legacy.igdb;
    const slug = legacy.slug ?? makeSlug(title);
    const game = await Game.findOneAndUpdate(
      igdb?.id ? { "sourceIds.igdbId": igdb.id } : { slug },
      {
        $setOnInsert: {
          title,
          slug,
          coverUrl: legacy.photo ?? legacy.gamePhoto ?? igdb?.cover?.url,
          sourceIds: { igdbId: igdb?.id },
          metadata: { igdb },
        },
      },
      { upsert: true, new: true },
    );

    const entry = await LibraryEntry.findOneAndUpdate(
      { legacyGameId: legacy._id },
      {
        $setOnInsert: {
          user: legacy.userId,
          game: game._id,
          platform: mapPlatform(legacy.platform ?? legacy.gamePlatform),
          status: mapStatus(legacy.status ?? legacy.gameStatus),
          rating: legacy.rating ?? legacy.gameScore,
          review: legacy.review ?? legacy.gameReview,
          playTimeMinutes: legacy.playTime ?? legacy.gameTotalTime ?? 0,
          lastPlayedAt:
            legacy.lastPlay ??
            (legacy.gameDate
              ? new Date(legacy.gameDate)
              : (legacy.createdAt ?? new Date())),
          firstCompletedAt: legacy.firstFinished,
          legacyGameId: legacy._id,
          createdAt: legacy.createdAt,
          updatedAt: legacy.updatedAt,
        },
      },
      { upsert: true, new: true },
    );

    await Screenshot.updateMany(
      { game: legacy._id, libraryEntry: { $exists: false } },
      { $set: { libraryEntry: entry._id }, $unset: { game: "" } },
    );
    migrated += 1;
  }

  console.log(`Migrated ${migrated} legacy games`);
  await mongoose.disconnect();
}

migrate().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
