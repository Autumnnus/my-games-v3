import mongoose, { Document, Schema } from "mongoose";
import type { ScreenshotType } from "@my-games/shared";

export interface IScreenshot extends Document {
  name?: string;
  url: string;
  thumbnail?: string;
  key?: string;
  user: mongoose.Types.ObjectId;
  libraryEntry: mongoose.Types.ObjectId;
  type: ScreenshotType;
  createdAt: Date;
  updatedAt: Date;
}

const ScreenshotSchema = new Schema<IScreenshot>(
  {
    name: String,
    url: { type: String, required: [true, "Photo is required"] },
    thumbnail: String,
    key: String,
    user: { type: mongoose.Schema.ObjectId, required: true, ref: "User" },
    libraryEntry: {
      type: mongoose.Schema.ObjectId,
      required: true,
      ref: "LibraryEntry",
    },
    type: {
      type: String,
      enum: ["text", "image"],
      required: [true, "Please enter a type"],
    },
  },
  { timestamps: true },
);

export default mongoose.model<IScreenshot>("Screenshot", ScreenshotSchema);
