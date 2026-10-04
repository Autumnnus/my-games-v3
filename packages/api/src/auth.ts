import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { steamConfig, turnstileConfig } from "@my-games/core/config";
import { db } from "@my-games/core/db";
import { log } from "@my-games/core/log";
import { queueUserMediaCleanup } from "@my-games/core/media";
import { startOnboarding } from "@my-games/core/onboarding";
import { signupsOpen } from "@my-games/core/settings";
import { schema } from "@my-games/db";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { admin, captcha, lastLoginMethod, username } from "better-auth/plugins";
import { emailLocale, renderEmail, sendEmail } from "./email";
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
  // Uyarı ve hatalar sistem loglarına da düşer (yönetim paneli › Loglar).
  logger: {
    level: "warn",
    log: (level, message, ...args) => {
      if (level !== "warn" && level !== "error") return;
      log({
        level,
        source: "auth",
        event: level === "error" ? "auth_error" : "auth_warning",
        message,
        context: args.length ? { details: args.map(describe) } : undefined,
      });
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    // Sosyal girişle açılmış (şifresiz) hesaplarda sıfırlama bağlantısı şifre belirleme işini de görür: Better
    // Auth credential hesabı yoksa oluşturur.
    sendResetPassword: async ({ user, url }, request) => {
      if (isPlaceholderEmail(user.email)) return;
      const content = renderEmail("resetPassword", emailLocale(user, request), { url });
      await sendEmail({ to: user.email, ...content });
    },
    onPasswordReset: async ({ user }, request) => {
      await notifyPasswordChanged(user, request);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }, request) => {
      if (isPlaceholderEmail(user.email)) return;
      // E-posta değişikliğinin son adımı da bu yoldan gider (yeni adrese); metni ve dönüş sayfası farklı.
      const change = isEmailChangeLink(url);
      const content = change
        ? renderEmail("verifyNewEmail", emailLocale(user, request), {
            url: withChangeStep(url, "done"),
          })
        : renderEmail("verify", emailLocale(user, request), { url });
      try {
        await sendEmail({ to: user.email, ...content });
      } catch (error) {
        // Kayıtta hesap zaten oluştu; hata kaydı başarısız göstermesin (loglandı). Kullanıcı "tekrar gönder"i
        // kullanır. Elle tekrar gönderme ve e-posta değişikliğinde hata kullanıcıya döner.
        if (!request?.url.includes("/sign-up/")) throw error;
      }
    },
  },
  socialProviders,
  user: {
    additionalFields: {
      bio: { type: "string", required: false, input: true },
      // Push/e-posta bildirimlerinin dili (tarayıcıdan tespit edilir, dil değişince güncellenir).
      locale: { type: "string", required: false, input: true, defaultValue: "en" },
    },
    // Kullanıcılar hesabını kendisi silemez; silme yalnızca yönetim panelinden, denetim kaydıyla yapılır.
    deleteUser: { enabled: false },
    // Doğrulanmış adreste önce eski adrese onay, sonra yeni adrese doğrulama gider; adres ikinci bağlantıyla
    // değişir. Doğrulanmamış adreste (ör. Steam'in yer tutucu adresi) yalnızca yeni adres doğrulanır.
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }, request) => {
        if (isPlaceholderEmail(user.email)) return;
        const content = renderEmail("changeEmail", emailLocale(user, request), {
          url: withChangeStep(url, "confirmed"),
          newEmail,
        });
        await sendEmail({ to: user.email, ...content });
      },
    },
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
  hooks: {
    // Oturumdayken şifre değiştirilince güvenlik bildirimi (sıfırlamada `onPasswordReset` gönderir).
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/change-password" || isAPIError(ctx.context.returned)) return;
      const user = (ctx.context.returned as { user?: { email: string; locale?: unknown } } | null)
        ?.user;
      if (user) await notifyPasswordChanged(user, ctx.request);
    }),
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
        // Yeni üye rehberi yalnızca burada açılır; eski/taşınmış hesaplar rehberi görmez.
        // Rehber açılamazsa kayıt bozulmaz; yalnızca loglanır.
        after: async (user) => {
          await startOnboarding(user.id).catch((error: unknown) =>
            log({
              level: "warn",
              source: "auth",
              event: "onboarding_start_failed",
              message: error instanceof Error ? error.message : String(error),
              userId: user.id,
            }),
          );
        },
        // Sosyal girişte kullanıcı adı gelmez; profil URL'leri için otomatik üretilir, sonra değiştirilebilir.
        before: async (user, ctx) => {
          // Yönetim panelinden kayıtlar kapatıldıysa hiçbir yoldan (e-posta, Google, Discord, Steam) hesap açılmaz.
          if (!(await signupsOpen())) {
            throw new APIError("FORBIDDEN", { message: "signups_closed" });
          }
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

function describe(value: unknown) {
  if (value instanceof Error) return value.message;
  return typeof value === "string" ? value.slice(0, 500) : JSON.stringify(value)?.slice(0, 500);
}

/** Doğrulama bağlantısındaki JWT'nin `updateTo` alanı: e-posta değişikliğine ait bağlantı. */
function isEmailChangeLink(url: string) {
  const payload = new URL(url).searchParams.get("token")?.split(".")[1];
  if (!payload) return false;
  try {
    return Boolean(JSON.parse(Buffer.from(payload, "base64url").toString()).updateTo);
  } catch {
    return false;
  }
}

/**
 * E-posta değişikliğinin iki bağlantısı da aynı dönüş adresini taşır; sayfa hangi adımın bittiğini bilsin diye
 * `/verify-email` dönüşüne `step` eklenir. Onay adımında eklenen `step`, Better Auth ikinci bağlantıyı kurarken
 * kopyalanır; ikinci e-postada `done` ile değiştirilir.
 */
function withChangeStep(url: string, step: "confirmed" | "done") {
  const link = new URL(url);
  const callback = link.searchParams.get("callbackURL");
  if (!callback?.startsWith("/verify-email")) return url;
  const target = new URL(callback, link.origin);
  target.searchParams.set("step", step);
  link.searchParams.set("callbackURL", `${target.pathname}${target.search}`);
  return link.toString();
}

/** Bildirim gitmezse şifre değişikliği geri alınmaz; hata `sendEmail`'de loglanır. */
async function notifyPasswordChanged(
  user: { email: string; locale?: unknown },
  request?: Request | null,
) {
  if (isPlaceholderEmail(user.email)) return;
  const content = renderEmail("passwordChanged", emailLocale(user, request), {
    url: `${env.APP_URL}/forgot-password`,
  });
  await sendEmail({ to: user.email, ...content }).catch(() => {});
}

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
