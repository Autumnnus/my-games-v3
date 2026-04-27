import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3030),
  MONGO_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRE: z.string().default("7d"),
  R2_ENDPOINT: z.string().url(),
  R2_KEY: z.string(),
  R2_SECRET: z.string(),
  R2_BUCKET: z.string(),
  R2_PUBLIC_URL: z.string().url(),
  SMTP_HOST: z.string(),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  FRONTEND_URL: z.string().url(),
  IGDB_CLIENT_ID: z.string(),
  IGDB_CLIENT_SECRET: z.string(),
  STEAM_API_KEY: z.string(),
  STEAM_REALM: z.string().url(),
  STEAM_RETURN_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
