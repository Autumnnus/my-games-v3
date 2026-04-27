import mongoose, { Document, Schema } from "mongoose";

export interface IConfig extends Document {
  key: string;
  value: string;
}

const ConfigSchema = new Schema<IConfig>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
  },
  { timestamps: true },
);

export default mongoose.model<IConfig>("Config", ConfigSchema);
