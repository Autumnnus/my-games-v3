import mongoose, { Document, Schema } from "mongoose";

export interface ISteamSyncConflict extends Document {
  userId: mongoose.Types.ObjectId;
  libraryEntryId: mongoose.Types.ObjectId;
  manualValue: number;
  steamValue: number;
  diff: number;
  detectedAt: string;
  status: "pending" | "resolved";
  resolution: "take_steam" | "keep_manual" | "ignore" | null;
  resolvedAt: string | null;
}

const SteamSyncConflictSchema = new Schema<ISteamSyncConflict>(
  {
    userId: { type: mongoose.Schema.ObjectId, required: true, ref: "User" },
    libraryEntryId: {
      type: mongoose.Schema.ObjectId,
      required: true,
      ref: "LibraryEntry",
    },
    manualValue: { type: Number, required: true },
    steamValue: { type: Number, required: true },
    diff: { type: Number, required: true },
    detectedAt: { type: String, required: true },
    status: { type: String, enum: ["pending", "resolved"], default: "pending" },
    resolution: {
      type: String,
      enum: ["take_steam", "keep_manual", "ignore", null],
      default: null,
    },
    resolvedAt: { type: String, default: null },
  },
  { timestamps: true },
);

// Indexes
SteamSyncConflictSchema.index({ userId: 1, status: 1 });
SteamSyncConflictSchema.index({ libraryEntryId: 1 });
SteamSyncConflictSchema.index(
  { userId: 1, libraryEntryId: 1, status: 1 },
  { unique: true },
);

export default mongoose.model<ISteamSyncConflict>(
  "SteamSyncConflict",
  SteamSyncConflictSchema,
);
