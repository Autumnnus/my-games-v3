import mongoose, { Document, Schema } from "mongoose";
import type { Statistics } from "@my-games/shared";

export interface IStatistics extends Document {
  statistics: Statistics;
  user?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StatisticsSchema = new Schema<IStatistics>(
  {
    statistics: { type: Object, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export default mongoose.model<IStatistics>("Statistics", StatisticsSchema);
