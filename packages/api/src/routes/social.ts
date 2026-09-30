import { isAdmin } from "@my-games/core/admin/access";
import { findGameIdBySlug } from "@my-games/core/catalog";
import { AppError } from "@my-games/core/errors";
import { listFeed } from "@my-games/core/social/activities";
import {
  addComment,
  deleteComment,
  editComment,
  listComments,
  react,
  reactionSummary,
  unreact,
} from "@my-games/core/social/interactions";
import { createReport } from "@my-games/core/social/moderation";
import {
  getPreferences,
  listNotifications,
  markRead,
  setPreference,
  unreadCount,
} from "@my-games/core/social/notifications";
import { subscribePush, unsubscribePush, vapidPublicKey } from "@my-games/core/social/push";
import { nowPlaying } from "@my-games/core/steam/presence";
import { findUserByUsername } from "@my-games/core/users";
import { notificationTypes, socialTargets } from "@my-games/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { type AppEnv, currentUser, rateLimit, requireUser, withSession } from "../middleware";
import { subscribe } from "../realtime";
import { uuidParam, validate } from "../validation";

const target = z.object({ targetType: z.enum(socialTargets), targetId: z.uuid() });
const feedQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const socialRoutes = new Hono<AppEnv>()
  // --- Akış ---
  .get("/feed", withSession, validate("query", feedQuery), async (c) =>
    c.json(await listFeed({ viewerId: c.get("user")?.id, ...c.req.valid("query") })),
  )
  .get("/users/:username/activity", withSession, validate("query", feedQuery), async (c) => {
    const owner = await findUserByUsername(c.req.param("username"));
    if (!owner) throw new AppError("not_found", "Kullanıcı bulunamadı");
    return c.json(
      await listFeed({ viewerId: c.get("user")?.id, actorId: owner.id, ...c.req.valid("query") }),
    );
  })
  .get("/games/:slug/activity", withSession, validate("query", feedQuery), async (c) => {
    const gameId = await findGameIdBySlug(c.req.param("slug"));
    return c.json(await listFeed({ viewerId: c.get("user")?.id, gameId, ...c.req.valid("query") }));
  })
  .get("/now-playing", async (c) => c.json({ players: await nowPlaying(20) }))

  // --- Beğeni ---
  .get("/reactions", withSession, validate("query", target), async (c) => {
    const { targetType, targetId } = c.req.valid("query");
    return c.json(await reactionSummary(targetType, targetId, c.get("user")?.id));
  })
  .post(
    "/reactions",
    withSession,
    requireUser,
    rateLimit("reaction", 120, 60_000),
    validate("json", target),
    async (c) => {
      const { targetType, targetId } = c.req.valid("json");
      return c.json(await react(currentUser(c).id, targetType, targetId));
    },
  )
  .delete("/reactions", withSession, requireUser, validate("json", target), async (c) => {
    const { targetType, targetId } = c.req.valid("json");
    return c.json(await unreact(currentUser(c).id, targetType, targetId));
  })

  // --- Yorum ---
  .get("/comments", validate("query", target), async (c) => {
    const { targetType, targetId } = c.req.valid("query");
    return c.json({ comments: await listComments(targetType, targetId) });
  })
  .post(
    "/comments",
    withSession,
    requireUser,
    rateLimit("comment", 10, 60_000),
    validate(
      "json",
      target.extend({
        body: z.string().min(1).max(2000),
        parentId: z.uuid().nullable().optional(),
      }),
    ),
    async (c) => c.json({ comment: await addComment(currentUser(c).id, c.req.valid("json")) }, 201),
  )
  .patch(
    "/comments/:id",
    withSession,
    requireUser,
    validate("param", uuidParam),
    validate("json", z.object({ body: z.string().min(1).max(2000) })),
    async (c) =>
      c.json({
        comment: await editComment(
          currentUser(c).id,
          c.req.valid("param").id,
          c.req.valid("json").body,
        ),
      }),
  )
  .delete("/comments/:id", withSession, requireUser, validate("param", uuidParam), async (c) => {
    const user = currentUser(c);
    await deleteComment(
      user.id,
      c.req.valid("param").id,
      user.role === "admin" && (await isAdmin(user.id)),
    );
    return c.json({ ok: true });
  })

  // --- Bildirimler ---
  .get(
    "/notifications",
    withSession,
    requireUser,
    validate("query", z.object({ before: z.iso.datetime().optional() })),
    async (c) =>
      c.json({ notifications: await listNotifications(currentUser(c).id, c.req.valid("query")) }),
  )
  .get("/notifications/unread", withSession, requireUser, async (c) =>
    c.json({ count: await unreadCount(currentUser(c).id) }),
  )
  .post(
    "/notifications/read",
    withSession,
    requireUser,
    validate("json", z.object({ ids: z.array(z.uuid()).max(200).optional() })),
    async (c) => {
      await markRead(currentUser(c).id, c.req.valid("json").ids);
      return c.json({ count: await unreadCount(currentUser(c).id) });
    },
  )
  .get("/notifications/preferences", withSession, requireUser, async (c) =>
    c.json({ preferences: await getPreferences(currentUser(c).id) }),
  )
  .put(
    "/notifications/preferences",
    withSession,
    requireUser,
    validate(
      "json",
      z.object({ type: z.enum(notificationTypes), inApp: z.boolean(), push: z.boolean() }),
    ),
    async (c) => {
      const { type, ...value } = c.req.valid("json");
      await setPreference(currentUser(c).id, type, value);
      return c.json({ preferences: await getPreferences(currentUser(c).id) });
    },
  )
  // Okunmamış sayısı değiştikçe bildirilir; istemci listeyi kendisi tazeler.
  .get("/notifications/stream", withSession, requireUser, (c) => {
    const userId = currentUser(c).id;
    return streamSSE(c, async (stream) => {
      const send = async () =>
        stream.writeSSE({
          event: "unread",
          data: JSON.stringify({ count: await unreadCount(userId) }),
        });
      await send();
      const unsubscribe = await subscribe(userId, () => void send().catch(() => {}));
      const heartbeat = setInterval(
        () => void stream.writeSSE({ event: "ping", data: "" }).catch(() => {}),
        25_000,
      );
      stream.onAbort(() => {
        unsubscribe();
        clearInterval(heartbeat);
      });
      while (!stream.aborted) await stream.sleep(30_000);
      unsubscribe();
      clearInterval(heartbeat);
    });
  })

  // --- Web Push ---
  .get("/push/key", (c) => c.json({ publicKey: vapidPublicKey() }))
  .post(
    "/push/subscribe",
    withSession,
    requireUser,
    validate(
      "json",
      z.object({
        endpoint: z.url(),
        keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
      }),
    ),
    async (c) => {
      await subscribePush(currentUser(c).id, c.req.valid("json"), c.req.header("user-agent"));
      return c.json({ ok: true }, 201);
    },
  )
  .delete(
    "/push/subscribe",
    withSession,
    requireUser,
    validate("json", z.object({ endpoint: z.url() })),
    async (c) => {
      await unsubscribePush(currentUser(c).id, c.req.valid("json").endpoint);
      return c.json({ ok: true });
    },
  )

  // --- Şikayet ve moderasyon ---
  .post(
    "/reports",
    withSession,
    requireUser,
    rateLimit("report", 20, 60 * 60_000),
    validate(
      "json",
      z.object({
        targetType: z.enum(["comment", "entry", "screenshot", "user"]),
        targetId: z.string().min(1).max(100),
        reason: z.string().min(1).max(1000),
      }),
    ),
    async (c) =>
      c.json({ report: await createReport(currentUser(c).id, c.req.valid("json")) }, 201),
  );
