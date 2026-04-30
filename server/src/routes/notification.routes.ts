import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ok } from "../lib/response";
import { authMiddleware } from "../middlewares/auth.middleware";
import * as notificationService from "../services/notification.service";
import type { AppVariables } from "../types/context";
import Notification from "../models/Notification";

const notifications = new Hono<{ Variables: AppVariables }>();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Bildirimleri listele
notifications.get(
  "/",
  authMiddleware,
  zValidator("query", paginationSchema),
  async (c) => {
    const userId = c.get("userId");
    const { page, limit } = c.req.valid("query");
    const data = await notificationService.getNotifications(
      userId,
      page,
      limit,
    );
    return c.json(ok(data));
  },
);

// Okunmamış sayısı (navbar badge için hafif endpoint)
notifications.get("/unread-count", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const count = await notificationService.getUnreadCount(userId);
  return c.json(ok({ count }));
});

// Tek bildirimi okundu işaretle
notifications.put("/:id/read", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  await notificationService.markAsRead(id, userId);
  return c.json(ok({ success: true }));
});

// Tümünü okundu işaretle
notifications.put("/read-all", authMiddleware, async (c) => {
  const userId = c.get("userId");
  await notificationService.markAllAsRead(userId);
  return c.json(ok({ success: true }));
});

// ─── DEV ONLY: kendine test bildirimi gönder ─────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  notifications.post("/test", authMiddleware, async (c) => {
    const userId = c.get("userId");

    // Kendine doğrudan bildirim oluştur (actor = recipient = self)
    const doc = await Notification.create({
      recipient: userId,
      actor: userId,
      type: "game_completed",
      metadata: { playTimeMinutes: 6000 },
    });

    const populated = await Notification.findById(doc._id)
      .populate("actor", "name profileImage")
      .lean();

    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    const { wsManager } = await import("../ws/ws.manager");
    wsManager.send(userId, {
      type: "notification:new",
      payload: populated as any,
    });
    wsManager.send(userId, {
      type: "notification:count",
      payload: { count: unreadCount },
    });

    return c.json(ok({ sent: true }));
  });
}

export default notifications;
