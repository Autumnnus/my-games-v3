import LibraryEntry from "../models/LibraryEntry";
import Notification from "../models/Notification";
import type {
  NotificationType,
  NotificationMetadata,
  NotificationListResponse,
} from "@my-games/shared";

// Bir oyunu kütüphanesinde bulunduran diğer kullanıcılar (actor hariç, max 100)
async function getOtherUsersWithGame(
  gameId: string,
  actorId: string,
): Promise<string[]> {
  const entries = await LibraryEntry.find({
    game: gameId,
    user: { $ne: actorId },
  })
    .select("user")
    .limit(100)
    .lean();
  return entries.map((e) => e.user.toString());
}

// Tek bir bildirim oluştur (spam önleme: actor+type+game unique index ile)
async function createOne(params: {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  gameId?: string;
  metadata?: NotificationMetadata;
}): Promise<void> {
  const { recipientId, actorId, type, gameId, metadata = {} } = params;
  try {
    await Notification.create({
      recipient: recipientId,
      actor: actorId,
      type,
      game: gameId,
      metadata,
    });
  } catch {
    // Duplicate (unique index hatası) → zaten bu bildirim var, sessizce geç
  }
}

// Bir olayı birden fazla alıcıya dağıt
async function broadcast(params: {
  actorId: string;
  type: NotificationType;
  gameId?: string;
  recipientIds: string[];
  metadata?: NotificationMetadata;
}): Promise<void> {
  const { actorId, type, gameId, recipientIds, metadata } = params;
  // Paralel ama tek tek — unique index spam'i yakalar
  await Promise.allSettled(
    recipientIds.map((recipientId) =>
      createOne({ recipientId, actorId, type, gameId, metadata }),
    ),
  );
}

// ─── Olay bazlı bildirim tetikleyiciler ──────────────────────────────────────

export async function notifyGameCompleted(params: {
  actorId: string;
  gameId: string;
  libraryEntryId: string;
  playTimeMinutes?: number;
}): Promise<void> {
  const { actorId, gameId, libraryEntryId, playTimeMinutes } = params;
  const recipients = await getOtherUsersWithGame(gameId, actorId);
  if (!recipients.length) return;
  await broadcast({
    actorId,
    type: "game_completed",
    gameId,
    recipientIds: recipients,
    metadata: { playTimeMinutes, actorLibraryEntryId: libraryEntryId },
  });
}

export async function notifyGameReviewed(params: {
  actorId: string;
  gameId: string;
  libraryEntryId: string;
  review: string;
}): Promise<void> {
  const { actorId, gameId, libraryEntryId, review } = params;
  const recipients = await getOtherUsersWithGame(gameId, actorId);
  if (!recipients.length) return;
  await broadcast({
    actorId,
    type: "game_reviewed",
    gameId,
    recipientIds: recipients,
    metadata: {
      review: review.slice(0, 300),
      actorLibraryEntryId: libraryEntryId,
    },
  });
}

export async function notifyMilestone100h(params: {
  actorId: string;
  gameId: string;
  libraryEntryId: string;
  playTimeMinutes: number;
}): Promise<void> {
  const { actorId, gameId, libraryEntryId, playTimeMinutes } = params;
  const recipients = await getOtherUsersWithGame(gameId, actorId);
  if (!recipients.length) return;
  await broadcast({
    actorId,
    type: "milestone_100h",
    gameId,
    recipientIds: recipients,
    metadata: {
      hours: 100,
      playTimeMinutes,
      actorLibraryEntryId: libraryEntryId,
    },
  });
}

export async function notifyScreenshotAdded(params: {
  actorId: string;
  gameId: string;
  libraryEntryId: string;
  screenshotCount: number;
  firstScreenshotUrl?: string;
}): Promise<void> {
  const {
    actorId,
    gameId,
    libraryEntryId,
    screenshotCount,
    firstScreenshotUrl,
  } = params;
  const recipients = await getOtherUsersWithGame(gameId, actorId);
  if (!recipients.length) return;
  await broadcast({
    actorId,
    type: "screenshot_added",
    gameId,
    recipientIds: recipients,
    metadata: {
      screenshotCount,
      firstScreenshotUrl,
      actorLibraryEntryId: libraryEntryId,
    },
  });
}

// ─── Okuma işlemleri ──────────────────────────────────────────────────────────

export async function getNotifications(
  userId: string,
  page: number,
  limit: number,
): Promise<NotificationListResponse> {
  const skip = (page - 1) * limit;

  const [items, total, unreadCount] = await Promise.all([
    Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("actor", "name profileImage")
      .populate("game", "title coverUrl slug")
      .lean(),
    Notification.countDocuments({ recipient: userId }),
    Notification.countDocuments({ recipient: userId, isRead: false }),
  ]);

  return {
    items: items as unknown as NotificationListResponse["items"],
    total,
    unreadCount,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ recipient: userId, isRead: false });
}

export async function markAsRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { $set: { isRead: true, readAt: new Date() } },
  );
}

export async function markAllAsRead(userId: string): Promise<void> {
  await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
}
