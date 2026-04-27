import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose, { Document, Schema } from "mongoose";
import { signToken } from "../lib/jwt";

export interface SteamSyncSettings {
  enabled: boolean;
  intervalHours: number;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "partial" | "failed" | null;
}

export interface IUser extends Document {
  name: string;
  password?: string;
  email?: string;
  isVerified: boolean;
  verificationToken?: string;
  verificationExpire?: Date;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  profileImage?: string;
  role: "user" | "admin" | "vip";
  authProviders: ("email" | "steam")[];
  steam: {
    steamId: string | null;
    username: string | null;
    linkedAt: string | null;
    avatarUrl: string | null;
  };
  steamSyncSettings: SteamSyncSettings;
  createdAt: Date;
  updatedAt: Date;
  generateJwtFromUser(): string;
  getResetPasswordTokenFromUser(): string;
  getVerificationTokenFromUser(): string;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: [true, "Please enter a name"] },
    password: {
      type: String,
      minlength: [6, "Please enter a password with min length 6"],
      select: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      match: [
        /^([\w-.]+@([\w-]+\.)+[\w-]{2,4})?$/,
        "Please provide a valid email",
      ],
    },
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationExpire: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    profileImage: String,
    role: { type: String, default: "user", enum: ["user", "admin", "vip"] },
    authProviders: {
      type: [String],
      enum: ["email", "steam"],
      default: ["email"],
    },
    steam: {
      steamId: { type: String, default: null },
      username: { type: String, default: null },
      linkedAt: { type: String, default: null },
      avatarUrl: { type: String, default: null },
    },
    steamSyncSettings: {
      type: Object,
      default: () => ({
        enabled: false,
        intervalHours: 24,
        lastSyncAt: null,
        lastSyncStatus: null,
      }),
    },
  },
  { timestamps: true },
);

UserSchema.methods.generateJwtFromUser = function () {
  return signToken({ id: this._id.toString(), name: this.name });
};

UserSchema.methods.getResetPasswordTokenFromUser = function () {
  const token = crypto
    .createHash("SHA256")
    .update(crypto.randomBytes(15).toString("hex"))
    .digest("hex");
  this.resetPasswordToken = token;
  this.resetPasswordExpire = new Date(Date.now() + 3600000);
  return token;
};

UserSchema.methods.getVerificationTokenFromUser = function () {
  const token = crypto
    .createHash("SHA256")
    .update(crypto.randomBytes(15).toString("hex"))
    .digest("hex");
  this.verificationToken = token;
  this.verificationExpire = new Date(Date.now() + 3600000);
  return token;
};

UserSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

export default mongoose.model<IUser>("User", UserSchema);
