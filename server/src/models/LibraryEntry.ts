import mongoose, { Document, Schema } from "mongoose";
import type { GameStatus, Platform } from "@my-games/shared";

export type SyncStatus =
  | "synced"
  | "draft"
  | "conflict"
  | "resolved"
  | "excluded";

export interface ILibraryEntry extends Document {
  user: mongoose.Types.ObjectId;
  game: mongoose.Types.ObjectId;
  platform: Platform;
  status: GameStatus;
  rating?: number;
  review?: string;
  playTimeMinutes: number;
  steamPlaytimeMinutes?: number;
  syncedFromSteam: boolean;
  lastPlayedAt: Date;
  lastPlayDate?: Date;
  firstCompletedAt?: Date;
  completionDate?: Date | null;
  isFavorite: boolean;
  legacyGameId?: mongoose.Types.ObjectId;
  steamPlayTime: number | null;
  manualPlayTime: boolean;
  steamSyncExclude: boolean;
  syncStatus: SyncStatus;
  createdAt: Date;
  updatedAt: Date;
}

const LibraryEntrySchema = new Schema<ILibraryEntry>(
  {
    user: { type: mongoose.Schema.ObjectId, required: true, ref: "User" },
    game: { type: mongoose.Schema.ObjectId, required: true, ref: "Game" },
    platform: {
      type: String,
      enum: [
        "steam",
        "epicGames",
        "ubisoft",
        "xboxPc",
        "eaGames",
        "torrent",
        "playstation",
        "xboxSeries",
        "nintendo",
        "mobile",
        "otherPlatforms",
      ],
      required: [true, "Please enter platform"],
    },
    status: {
      type: String,
      enum: ["completed", "abandoned", "toBeCompleted", "activePlaying"],
      required: [true, "Please enter status"],
    },
    rating: Number,
    review: String,
    playTimeMinutes: {
      type: Number,
      required: [true, "Please enter play time"],
      min: 0,
    },
    steamPlaytimeMinutes: Number,
    syncedFromSteam: { type: Boolean, default: false },
    lastPlayedAt: { type: Date, default: Date.now },
    lastPlayDate: Date,
    firstCompletedAt: Date,
    completionDate: { type: Date, default: null },
    isFavorite: { type: Boolean, default: false },
    legacyGameId: { type: mongoose.Schema.ObjectId, index: true },
    steamPlayTime: { type: Number, default: null },
    manualPlayTime: { type: Boolean, default: false },
    steamSyncExclude: { type: Boolean, default: false },
    syncStatus: {
      type: String,
      enum: ["synced", "draft", "conflict", "resolved", "excluded"],
      default: "synced",
    },
  },
  { timestamps: true },
);

LibraryEntrySchema.index({ user: 1, game: 1 }, { unique: true });

export default mongoose.model<ILibraryEntry>(
  "LibraryEntry",
  LibraryEntrySchema,
);
