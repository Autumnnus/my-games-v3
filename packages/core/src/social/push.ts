import { schema } from "@my-games/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { appUrl, pushConfig } from "../config";
import { db } from "../db";
import { AppError } from "../errors";
import { getNotification } from "./notifications";

const { pushSubscriptions, user } = schema;

const MAX_SUBSCRIPTIONS_PER_USER = 10;

/** Tarayıcıların push servisleri. Worker bu adreslere POST attığı için keyfi (iç ağ) adresler kabul edilmez. */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
];
const PUSH_SERVICE_SUFFIXES = [".notify.windows.com", ".push.apple.com"];

export function isPushServiceEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port) return false;
  return (
    PUSH_SERVICE_HOSTS.includes(url.hostname) ||
    PUSH_SERVICE_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  );
}

export function vapidPublicKey() {
  return pushConfig()?.publicKey ?? null;
}

export async function subscribePush(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string | null,
) {
  if (!pushConfig()) throw new AppError("unavailable", "Push bildirimleri yapılandırılmamış");
  if (!isPushServiceEndpoint(subscription.endpoint)) {
    throw new AppError("invalid", "Geçersiz push adresi");
  }
  // Kullanıcı başına sınırlı abonelik: en eskiler düşer (her tarayıcı/cihaz bir abonelik).
  const existing = await db
    .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt));
  const stale = existing
    .filter((row) => row.endpoint !== subscription.endpoint)
    .slice(MAX_SUBSCRIPTIONS_PER_USER - 1);
  if (stale.length > 0) {
    await db.delete(pushSubscriptions).where(
      inArray(
        pushSubscriptions.id,
        stale.map((row) => row.id),
      ),
    );
  }
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    });
}

export async function unsubscribePush(userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

type Locale = "tr" | "en";

const texts: Record<
  Locale,
  Record<string, (v: { actor: string; others: number; game: string; count: number }) => string>
> = {
  tr: {
    reaction: (v) =>
      `${v.actor}${v.others ? ` ve ${v.others} kişi daha` : ""} beğendi${v.game ? `: ${v.game}` : ""}`,
    comment: (v) =>
      `${v.actor}${v.others ? ` ve ${v.others} kişi daha` : ""} yorum yaptı${v.game ? `: ${v.game}` : ""}`,
    reply: (v) => `${v.actor} yorumuna yanıt verdi`,
    mention: (v) => `${v.actor} senden bahsetti`,
    proposals: (v) => `${v.count} değişiklik onayını bekliyor`,
    system: () => "My Games",
  },
  en: {
    reaction: (v) =>
      `${v.actor}${v.others ? ` and ${v.others} others` : ""} liked${v.game ? `: ${v.game}` : ""}`,
    comment: (v) =>
      `${v.actor}${v.others ? ` and ${v.others} others` : ""} commented${v.game ? `: ${v.game}` : ""}`,
    reply: (v) => `${v.actor} replied to your comment`,
    mention: (v) => `${v.actor} mentioned you`,
    proposals: (v) => `${v.count} changes waiting for your approval`,
    system: () => "My Games",
  },
};

/** Bildirimin tıklanınca açılacağı sayfa. */
export function notificationPath(notification: {
  type: string;
  targetType: string | null;
  data: Record<string, unknown>;
}) {
  if (notification.type === "proposals") return "/inbox";
  const entryId = notification.data.entryId;
  if (typeof entryId === "string") return `/e/${entryId}`;
  return "/notifications";
}

/** Bildirimi kullanıcının tüm cihazlarına gönderir; geçersizleşmiş abonelikleri siler. */
export async function sendPushForNotification(notificationId: string) {
  const config = pushConfig();
  if (!config) return { sent: 0 };
  const notification = await getNotification(notificationId);
  if (!notification) return { sent: 0 };

  const [recipient] = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, notification.recipientId));
  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, notification.recipientId));
  if (subscriptions.length === 0) return { sent: 0 };

  const actors = notification.actorIds.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, notification.actorIds))
    : [];
  const locale: Locale = recipient?.locale === "tr" ? "tr" : "en";
  const values = {
    actor: actors.find((actor) => actor.id === notification.actorIds[0])?.name ?? "",
    others: Math.max(0, notification.count - 1),
    game: String(notification.data.gameName ?? ""),
    count: notification.count,
  };
  const body = (texts[locale][notification.type] ?? texts[locale].system)?.(values) ?? "My Games";
  const payload = JSON.stringify({
    title: "My Games",
    body,
    url: `${appUrl()}${notificationPath(notification)}`,
    tag: notification.groupKey,
  });

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        { TTL: 60 * 60 },
      );
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
      } else {
        console.error("[push] gönderilemedi", status, (error as Error).message);
      }
    }
  }
  return { sent };
}
