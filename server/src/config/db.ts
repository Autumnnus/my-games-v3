import mongoose from "mongoose";
import { env } from "./env";

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(env.MONGO_URL, {
    family: 4, // IPv4 zorla — Bun'un IPv6/SRV sorunu için
  });
  console.log("MongoDB connected");
}
