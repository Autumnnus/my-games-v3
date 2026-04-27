import { Schema, model, Document, Types } from "mongoose";
import type { ActivityType, ActivityMetadata } from "@my-games/shared";

export interface IActivity extends Document {
  user: Types.ObjectId;
  type: ActivityType;
  game?: Types.ObjectId;
  libraryEntry?: Types.ObjectId;
  metadata: ActivityMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "game_added",
        "game_completed",
        "game_abandoned",
        "status_changed",
        "game_rated",
        "game_reviewed",
        "screenshot_added",
        "game_favorited",
        "steam_synced",
        "milestone_playtime",
      ],
      required: true,
    },
    game: { type: Schema.Types.ObjectId, ref: "Game", index: true },
    libraryEntry: { type: Schema.Types.ObjectId, ref: "LibraryEntry" },
    metadata: {
      platform: String,
      status: String,
      fromStatus: String,
      toStatus: String,
      rating: Number,
      review: String,
      screenshotCount: Number,
      firstScreenshotUrl: String,
      gamesAdded: Number,
      gamesUpdated: Number,
      hours: Number,
      playTimeMinutes: Number,
    },
  },
  { timestamps: true },
);

// Feed query: user's activity sorted by date
activitySchema.index({ user: 1, createdAt: -1 });
// Global feed
activitySchema.index({ createdAt: -1 });

export default model<IActivity>("Activity", activitySchema);
