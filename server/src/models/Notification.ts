import { Schema, model, Document, Types } from "mongoose";
import type { NotificationType, NotificationMetadata } from "@my-games/shared";

export interface INotification extends Document {
  recipient: Types.ObjectId;
  actor: Types.ObjectId;
  type: NotificationType;
  game?: Types.ObjectId;
  metadata: NotificationMetadata;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "game_completed",
        "game_reviewed",
        "milestone_100h",
        "screenshot_added",
      ],
      required: true,
    },
    game: { type: Schema.Types.ObjectId, ref: "Game" },
    metadata: {
      review: String,
      rating: Number,
      hours: Number,
      screenshotCount: Number,
      firstScreenshotUrl: String,
      playTimeMinutes: Number,
      actorLibraryEntryId: String,
    },
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
  },
  { timestamps: true },
);

// Kullanıcının bildirim listesi sorgusu
notificationSchema.index({ recipient: 1, createdAt: -1 });
// Okunmamış sayısı sorgusu
notificationSchema.index({ recipient: 1, isRead: 1 });
// Spam önleme: aynı actor+type+game için tek bildirim
notificationSchema.index(
  { actor: 1, type: 1, game: 1 },
  { unique: true, sparse: true },
);

export default model<INotification>("Notification", notificationSchema);
