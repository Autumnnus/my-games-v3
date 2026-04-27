import mongoose, { Document, Schema } from "mongoose";
import slugify from "slugify";
import type { GameMetadata, GameSourceIds } from "@my-games/shared";

export interface IGameConflict {
  field: string;
  steamValue: unknown;
  igdbValue: unknown;
}

export interface IGame extends Document {
  title: string;
  slug: string;
  coverUrl?: string;
  sourceIds?: GameSourceIds;
  metadata?: GameMetadata;
  pendingConflicts?: IGameConflict[];
  createdAt: Date;
  updatedAt: Date;
  makeSlug(): string;
}

const IgdbSchema = new Schema(
  {
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
  { _id: false },
);

const GameSchema = new Schema<IGame>(
  {
    title: {
      type: String,
      required: [true, "Please enter game title"],
      trim: true,
    },
    slug: { type: String, required: true, trim: true },
    coverUrl: String,
    sourceIds: {
      igdbId: Number,
      steamAppId: Number,
    },
    metadata: {
      igdb: IgdbSchema,
    },
    pendingConflicts: [
      {
        field: { type: String, required: true },
        steamValue: Schema.Types.Mixed,
        igdbValue: Schema.Types.Mixed,
        _id: false,
      },
    ],
  },
  { timestamps: true },
);

GameSchema.index({ slug: 1 }, { unique: true });
GameSchema.index({ "sourceIds.igdbId": 1 }, { unique: true, sparse: true });
GameSchema.index({ "sourceIds.steamAppId": 1 }, { unique: true, sparse: true });

GameSchema.pre("validate", function () {
  if (!this.slug && this.title) this.slug = this.makeSlug();
});

GameSchema.pre("save", function () {
  if (!this.isModified("title")) return;
  this.slug = this.makeSlug();
});

GameSchema.methods.makeSlug = function () {
  return slugify(this.title, {
    replacement: "-",
    remove: /[*+~.()'"!:@]/g,
    lower: true,
    strict: false,
    trim: true,
  });
};

export default mongoose.model<IGame>("Game", GameSchema);
