import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { steamConfig, turnstileConfig } from "@my-games/core/config";
import { db } from "@my-games/core/db";
import { queueUserMediaCleanup } from "@my-games/core/media";
import { schema } from "@my-games/db";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { admin, captcha, lastLoginMethod, username } from "better-auth/plugins";
import { renderEmail, sendEmail } from "./email";
import { env } from "./env";
import { localeFromRequest } from "./locale";
import { steamAuth } from "./steam-plugin";

const socialProviders = {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {}),
  ...(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
    ? { discord: { clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET } }
    : {}),
};

export const enabledSocialProviders = Object.keys(socialProviders) as Array<
  keyof typeof socialProviders
>;

export const auth = betterAuth({
  appName: "My Games",
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_URL],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }, request) => {
      if (isPlaceholderEmail(user.email)) return;
      const content = renderEmail("resetPassword", localeFromRequest(request), url);
      await sendEmail({ to: user.email, ...content });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }, request) => {
      if (isPlaceholderEmail(user.email)) return;
      const content = renderEmail("verify", localeFromRequest(request), url);
      await sendEmail({ to: user.email, ...content });
    },
  },
  socialProviders,
  user: {
    additionalFields: {
      bio: { type: "string", required: false, input: true },
      // Push/e-posta bildirimlerinin dili (tarayıcıdan tespit edilir, dil değişince güncellenir).
      locale: { type: "string", required: false, input: true, defaultValue: "en" },
    },
    deleteUser: { enabled: true },
  },
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google", "discord"] },
  },
  advanced: {
    // Cloudflare arkasında gerçek istemci IP'si bu başlıkta; rate limit herkes için tek kovaya düşmesin.
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
  },
  session: {
    // Her istekte DB'ye gitmemek için oturum 5 dakika imzalı cookie'de önbelleklenir.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  databaseHooks: {
    user: {
      delete: {
        // Satırlar cascade ile gider; R2'deki dosyalar worker'da silinir.
        before: async (user) => {
          await queueUserMediaCleanup(user.id);
        },
      },
      update: {
        // Avatar yalnızca yükleme akışından (`/api/v1/me/avatar`) yazılır; istemci keyfi bir adres koyamaz.
        before: async (data, ctx) => {
          // Better Auth her güncellemede `image` anahtarını (değeri `undefined` olsa da) gönderir.
          if (ctx?.path === "/update-user" && data.image !== undefined) {
            throw new APIError("BAD_REQUEST", { message: "Avatar yükleme akışıyla değiştirilir" });
          }
          // Username eklentisi `displayUsername`'i yalnızca kayıtta doldurur; güncellemede eski adda
          // kalırsa profil linkleri (displayUsername ile kurulur) artık var olmayan adrese gider.
          const record = data as typeof data & { username?: unknown; displayUsername?: unknown };
          if (typeof record.username === "string" && record.displayUsername === undefined) {
            return { data: { ...data, displayUsername: record.username } };
          }
        },
      },
      create: {
        // Sosyal girişte kullanıcı adı gelmez; profil URL'leri için otomatik üretilir, sonra değiştirilebilir.
        before: async (user, ctx) => {
          // Steam kullanıcılarına üretilen adresler başkası tarafından e-postayla alınamasın (Steam id'leri herkese açık).
          if (isPlaceholderEmail(user.email) && ctx?.path !== "/steam/callback") {
            throw new APIError("BAD_REQUEST", { message: "Invalid email" });
          }
          const record = user as typeof user & { username?: string | null; locale?: string | null };
          const locale =
            record.locale && record.locale !== "en"
              ? record.locale
              : localeFromRequest(ctx?.request);
          if (record.username) return { data: { ...user, locale } };
          const generated = generateUsername(user.name, user.email);
          return { data: { ...user, locale, username: generated, displayUsername: generated } };
        },
      },
    },
  },
  plugins: [
    username({ minUsernameLength: 3, maxUsernameLength: 30 }),
    admin(),
    lastLoginMethod({
      customResolveMethod: (ctx) => (ctx.path === "/steam/callback" ? "steam" : null),
    }),
    // Cloudflare Turnstile: tanımlıysa kayıt, giriş ve şifre sıfırlama bot korumalı olur.
    ...(turnstileConfig()
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: turnstileConfig()?.secretKey ?? "",
            endpoints: [
              "/sign-up/email",
              "/sign-in/email",
              "/sign-in/username",
              "/request-password-reset",
            ],
          }),
        ]
      : []),
    // Steam girişi yalnızca STEAM_API_KEY tanımlıysa açılır (profil bilgisi için gerekli).
    ...(steamConfig() ? [steamAuth()] : []),
  ],
});

/** Steam gibi e-posta vermeyen sağlayıcılar için üretilen adresler (`…@steam.placeholder.invalid`). */
export function isPlaceholderEmail(email: string) {
  return email.endsWith(".placeholder.invalid");
}

function generateUsername(name: string | undefined, email: string) {
  const base =
    (name || email.split("@")[0] || "user")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 20) || "user";
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base.length < 3 ? "user" : base}_${suffix}`;
}

export type Auth = typeof auth;
export type SessionUser = Auth["$Infer"]["Session"]["user"];
export type Session = Auth["$Infer"]["Session"]["session"];
