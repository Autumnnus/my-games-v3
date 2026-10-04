import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET en az 32 karakter olmalı"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  DISCORD_CLIENT_ID: optional,
  DISCORD_CLIENT_SECRET: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("My Games <noreply@example.com>"),
  TURNSTILE_SITE_KEY: optional,
  TURNSTILE_SECRET_KEY: optional,
  CONTACT_EMAIL: optional,
  AI_PROVIDER: optional,
});

/**
 * Production'da eksik kalınca sessizce bozulan ayarlar açılışta durdurulur: e-posta doğrulaması zorunlu olduğu
 * için Resend'siz kimse kayıt olamaz (linkler yalnızca loga düşer), kayıt herkese açık olduğu için bot koruması
 * şart, gizlilik sayfası ve silme talepleri bir iletişim adresi ister.
 */
function productionIssues(values: z.infer<typeof schema>) {
  if (values.NODE_ENV !== "production") return [];
  const issues: string[] = [];
  if (!values.RESEND_API_KEY) issues.push("RESEND_API_KEY production'da zorunlu");
  if (values.EMAIL_FROM.includes("@example.com")) issues.push("EMAIL_FROM gerçek bir adres olmalı");
  if (!values.TURNSTILE_SITE_KEY || !values.TURNSTILE_SECRET_KEY)
    issues.push("TURNSTILE_SITE_KEY ve TURNSTILE_SECRET_KEY production'da zorunlu");
  if (!values.CONTACT_EMAIL) issues.push("CONTACT_EMAIL production'da zorunlu");
  if (values.AI_PROVIDER?.toLowerCase() === "mock")
    issues.push("AI_PROVIDER=mock yalnızca geliştirme içindir");
  if (!values.APP_URL.startsWith("https://")) issues.push("APP_URL production'da https olmalı");
  return issues;
}

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Geçersiz ortam değişkenleri:\n${z.prettifyError(parsed.error)}`);
}
const issues = productionIssues(parsed.data);
if (issues.length > 0) {
  throw new Error(
    `Geçersiz ortam değişkenleri:\n${issues.map((issue) => `✖ ${issue}`).join("\n")}`,
  );
}

export const env = parsed.data;
