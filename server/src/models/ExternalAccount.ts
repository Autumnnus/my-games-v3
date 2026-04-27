import mongoose, { Document, Schema } from "mongoose";

export type ExternalAccountProvider = "steam" | "xbox" | "psn";
export type ExternalAccountSyncStatus = "idle" | "syncing" | "failed";

export interface IExternalAccount extends Document {
  user: mongoose.Types.ObjectId;
  provider: ExternalAccountProvider;
  providerUserId: string;
  displayName?: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  expiresAt?: Date;
  linkedAt: Date;
  lastSyncAt?: Date;
  syncStatus: ExternalAccountSyncStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ExternalAccountSchema = new Schema<IExternalAccount>(
  {
    user: { type: mongoose.Schema.ObjectId, required: true, ref: "User" },
    provider: { type: String, enum: ["steam", "xbox", "psn"], required: true },
    providerUserId: { type: String, required: true },
    displayName: String,
    accessTokenEncrypted: String,
    refreshTokenEncrypted: String,
    expiresAt: Date,
    linkedAt: { type: Date, default: Date.now },
    lastSyncAt: Date,
    syncStatus: {
      type: String,
      enum: ["idle", "syncing", "failed"],
      default: "idle",
    },
  },
  { timestamps: true },
);

ExternalAccountSchema.index(
  { provider: 1, providerUserId: 1 },
  { unique: true },
);
ExternalAccountSchema.index({ user: 1, provider: 1 });

export default mongoose.model<IExternalAccount>(
  "ExternalAccount",
  ExternalAccountSchema,
);
