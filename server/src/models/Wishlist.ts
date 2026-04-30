import mongoose, { Schema } from "mongoose";

const WishlistItemSchema = new Schema({
  userId: { type: String, required: true, index: true },
  igdbId: { type: Number, required: true },
  name: { type: String, required: true },
  coverUrl: { type: String },
  platform: { type: String, default: "otherPlatforms" },
  genres: [{ type: String }],
  releaseYear: { type: Number },
  developer: { type: String },
  igdbData: { type: Schema.Types.Mixed },
  addedAt: { type: Date, default: Date.now },
  source: { type: String, enum: ["manual", "steam"], default: "manual" },
  steamAppId: { type: Number },
});

export default mongoose.model("WishlistItem", WishlistItemSchema);