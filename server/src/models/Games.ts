import mongoose, { Document, Schema } from "mongoose";
import slugify from "slugify";
import type { Platform, GameStatus, IGDBData } from "@my-games/shared";

export interface IGame extends Document {
  name: string;
  photo?: string;
  lastPlay: Date;
  platform: Platform;
  review?: string;
  rating?: number;
  status: GameStatus;
  playTime: number;
  userId: mongoose.Types.ObjectId;
  isFavorite: boolean;
  firstFinished?: Date;
  igdb?: IGDBData;
  slug?: string;
  createdAt: Date;
  updatedAt: Date;
  makeSlug(): string;
}

const GamesSchema = new Schema<IGame>(
  {
    name: { type: String, required: [true, "Please enter game name"] },
    photo: String,
    lastPlay: { type: Date, default: Date.now },
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
    review: String,
    rating: Number,
    status: {
      type: String,
      enum: ["completed", "abandoned", "toBeCompleted", "activePlaying"],
      required: [true, "Please enter status"],
    },
    playTime: { type: Number, required: [true, "Please enter play time"] },
    userId: { type: mongoose.Schema.ObjectId, required: true, ref: "User" },
    isFavorite: { type: Boolean, default: false },
    firstFinished: Date,
    igdb: {
      id: Number,
      cover: { id: Number, url: String, game: Number },
      aggregated_rating: Number,
      aggregated_rating_count: Number,
      first_release_date: Number,
      category: Number,
      game_modes: [{ id: Number, name: String }],
      genres: [{ id: Number, name: String }],
      involved_companies: [
        {
          id: Number,
          company: { id: Number, name: String },
          developer: Boolean,
          publisher: Boolean,
        },
      ],
      player_perspectives: [{ id: Number, name: String }],
      release_dates: [{ id: Number, date: Number }],
      themes: [{ id: Number, name: String }],
    },
    slug: String,
  },
  { timestamps: true },
);

GamesSchema.pre("save", function () {
  if (!this.isModified("name")) return;
  this.slug = this.makeSlug();
});

GamesSchema.methods.makeSlug = function () {
  return slugify(this.name, {
    replacement: "-",
    remove: /[*+~.()'"!:@]/g,
    lower: true,
    strict: false,
    trim: true,
  });
};

export default mongoose.model<IGame>("Games", GamesSchema);
