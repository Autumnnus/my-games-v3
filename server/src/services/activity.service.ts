import Activity from "../models/Activity";
import type {
  ActivityType,
  ActivityMetadata,
  ActivityFeedResponse,
} from "@my-games/shared";
import * as notificationService from "./notification.service";

const PLAYTIME_MILESTONES = [600, 3000, 6000]; // 10h, 50h, 100h in minutes

// Zaman penceresi içinde aynı aktivite varsa güncelle, yoksa yeni oluştur
const WINDOW_MS = 60 * 60 * 1000; // 1 saat

// Bu tipler için zaman sınırı yok — her zaman mevcut olanı güncelle (oyun başına tek activity)
const ALWAYS_UPSERT: ActivityType[] = ["game_rated", "game_reviewed"];

// Bu tipler için 1 saat içindeyse güncelle, geçmişse yeni oluştur
const WINDOW_UPSERT: ActivityType[] = ["status_changed", "steam_synced"];

// Bu tipler hiç upsert yapmaz — her seferinde yeni oluşturur (tek seferlik olaylar)
// game_added, game_completed, game_abandoned, game_favorited, milestone_playtime, screenshot_added

async function log(params: {
  userId: string;
  type: ActivityType;
  gameId?: string;
  libraryEntryId?: string;
  metadata?: ActivityMetadata;
}): Promise<void> {
  try {
    const { userId, type, gameId, libraryEntryId, metadata = {} } = params;

    if (ALWAYS_UPSERT.includes(type)) {
      // Oyun başına tek activity — her zaman mevcut olanı güncelle
      await Activity.findOneAndUpdate(
        { user: userId, type, game: gameId ?? null },
        { $set: { metadata, libraryEntry: libraryEntryId } },
        { upsert: true, new: true },
      );
      return;
    }

    if (WINDOW_UPSERT.includes(type)) {
      // 1 saat içinde aynı tip + oyun varsa güncelle
      const windowStart = new Date(Date.now() - WINDOW_MS);
      const updated = await Activity.findOneAndUpdate(
        {
          user: userId,
          type,
          game: gameId ?? null,
          updatedAt: { $gte: windowStart },
        },
        { $set: { metadata } },
        { sort: { updatedAt: -1 } },
      );
      if (updated) return;
      // Pencere dışı → yeni oluştur
    }

    if (type === "screenshot_added") {
      // 1 saat içinde aynı oyun için screenshot_added varsa count'ı artır
      const windowStart = new Date(Date.now() - WINDOW_MS);
      const updated = await Activity.findOneAndUpdate(
        {
          user: userId,
          type: "screenshot_added",
          libraryEntry: libraryEntryId ?? null,
          updatedAt: { $gte: windowStart },
        },
        {
          $inc: { "metadata.screenshotCount": metadata.screenshotCount ?? 1 },
          $setOnInsert: {
            "metadata.firstScreenshotUrl": metadata.firstScreenshotUrl,
          },
        },
        { sort: { updatedAt: -1 } },
      );
      if (updated) return;
    }

    // Yeni activity oluştur (one-time olaylar veya pencere dışı)
    await Activity.create({
      user: userId,
      type,
      game: gameId,
      libraryEntry: libraryEntryId,
      metadata,
    });
  } catch {
    // Activity logging hiçbir zaman ana işlemi bloklamamalı
  }
}

async function checkAndLogPlaytimeMilestone(params: {
  userId: string;
  gameId: string;
  libraryEntryId: string;
  prevMinutes: number;
  newMinutes: number;
}): Promise<void> {
  const { prevMinutes, newMinutes, ...rest } = params;
  for (const milestone of PLAYTIME_MILESTONES) {
    if (prevMinutes < milestone && newMinutes >= milestone) {
      const hours = Math.round(milestone / 60);
      await log({
        ...rest,
        type: "milestone_playtime",
        metadata: { hours, playTimeMinutes: newMinutes },
      });
      // Sadece 100 saat milestone'u bildirim üretir
      if (milestone === 6000 && rest.gameId) {
        notificationService
          .notifyMilestone100h({
            actorId: rest.userId,
            gameId: rest.gameId,
            libraryEntryId: rest.libraryEntryId,
            playTimeMinutes: newMinutes,
          })
          .catch(() => {});
      }
    }
  }
}

async function getFeed(
  page: number,
  limit: number,
): Promise<ActivityFeedResponse> {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Activity.find()
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "name profileImage")
      .populate("game", "title coverUrl slug"),
    Activity.countDocuments(),
  ]);

  return {
    items: items as unknown as ActivityFeedResponse["items"],
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

async function getUserFeed(
  userId: string,
  page: number,
  limit: number,
): Promise<ActivityFeedResponse> {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Activity.find({ user: userId })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "name profileImage")
      .populate("game", "title coverUrl slug"),
    Activity.countDocuments({ user: userId }),
  ]);

  return {
    items: items as unknown as ActivityFeedResponse["items"],
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export default { log, checkAndLogPlaytimeMilestone, getFeed, getUserFeed };
