import mongoose from "mongoose";
import LibraryEntry, { type ILibraryEntry } from "../models/LibraryEntry";
import Screenshot from "../models/Screenshot";
import { AppError } from "../lib/errors";
import { deleteFromR2 } from "../lib/upload";
import gameRepository from "../repository/game.repository";
import userRepository from "../repository/user.repository";
import type { AddGameInput, EditGameInput } from "../schemas/game.schema";
import type { GameListItem } from "../types/contracts/game.contract";
import { getScreenshotCountsByEntryIds } from "./counter.service";
import activityService from "./activity.service";
import * as notificationService from "./notification.service";

async function assertFavoriteLimit(
  userId: string,
  nextIsFavorite?: boolean,
  excludedEntryId?: string,
) {
  if (!nextIsFavorite) return;

  const criteria: mongoose.QueryFilter<ILibraryEntry> = {
    user: userId,
    isFavorite: true,
  };
  if (excludedEntryId) criteria._id = { $ne: excludedEntryId };

  const favoriteCount = await LibraryEntry.countDocuments(criteria);
  if (favoriteCount >= 3) {
    throw new AppError("BAD_REQUEST", "Maximum 3 favorite games allowed", 400);
  }
}

async function addNewGameService(
  data: AddGameInput,
  userId: string,
): Promise<GameListItem> {
  const user = await userRepository.getUserById(userId);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);

  await assertFavoriteLimit(userId, data.isFavorite);
  const entry = await gameRepository.createGame(data, userId);

  const populated = await gameRepository.getGameById(entry._id.toString());
  const response = gameRepository.toLegacyGameResponse(populated ?? entry);
  const screenshotSize = await Screenshot.countDocuments({
    libraryEntry: entry._id,
  });

  const gameId =
    (populated ?? entry).game?._id?.toString() ??
    (populated ?? entry).game?.toString();

  await activityService.log({
    userId,
    type: "game_added",
    gameId,
    libraryEntryId: entry._id.toString(),
    metadata: { platform: data.platform, status: data.status },
  });

  if (data.status === "completed") {
    await activityService.log({
      userId,
      type: "game_completed",
      gameId,
      libraryEntryId: entry._id.toString(),
      metadata: { playTimeMinutes: data.playTime },
    });
  }

  return { ...response, screenshotSize };
}

async function editGameService(
  data: EditGameInput,
  libraryEntryId: string,
  userId: string,
): Promise<GameListItem> {
  const entry = await gameRepository.getGameById(libraryEntryId);
  if (!entry) throw new AppError("NOT_FOUND", "Library entry not found", 404);

  const prevStatus = entry.status;
  const prevRating = entry.rating;
  const prevReview = entry.review;
  const prevIsFavorite = entry.isFavorite;
  const prevPlayTime = entry.playTimeMinutes;

  const update: Partial<{
    platform: EditGameInput["platform"];
    status: EditGameInput["status"];
    rating: EditGameInput["rating"];
    review: EditGameInput["review"];
    playTimeMinutes: number;
    lastPlayedAt: Date;
    firstCompletedAt: Date;
    isFavorite: boolean;
  }> = {};
  if (data.platform !== undefined) update.platform = data.platform;
  if (data.status !== undefined) update.status = data.status;
  if (data.rating !== undefined) update.rating = data.rating;
  if (data.review !== undefined) update.review = data.review;
  if (data.playTime !== undefined) update.playTimeMinutes = data.playTime;
  if (data.lastPlay !== undefined) update.lastPlayedAt = data.lastPlay;
  if (data.firstFinished !== undefined)
    update.firstCompletedAt = data.firstFinished;
  if (data.isFavorite !== undefined) {
    await assertFavoriteLimit(userId, data.isFavorite, libraryEntryId);
    update.isFavorite = data.isFavorite;
  }

  Object.assign(entry, update);
  await entry.save();

  if (data.igdb) {
    await gameRepository.updateEntryGameMetadata(libraryEntryId, data.igdb);
  }

  const populated = await gameRepository.getGameById(libraryEntryId);
  const response = gameRepository.toLegacyGameResponse(populated ?? entry);
  const screenshotSize = await Screenshot.countDocuments({
    libraryEntry: libraryEntryId,
  });

  const gameId =
    (populated ?? entry).game?._id?.toString() ??
    (populated ?? entry).game?.toString();
  const baseActivity = { userId, gameId, libraryEntryId };

  // Status change activities
  if (data.status !== undefined && data.status !== prevStatus) {
    if (data.status === "completed") {
      await activityService.log({
        ...baseActivity,
        type: "game_completed",
        metadata: {
          fromStatus: prevStatus,
          playTimeMinutes: entry.playTimeMinutes,
        },
      });
      // Bildirim: paralel, non-blocking
      if (gameId) {
        notificationService
          .notifyGameCompleted({
            actorId: userId,
            gameId,
            libraryEntryId,
            playTimeMinutes: entry.playTimeMinutes,
          })
          .catch(() => {});
      }
    } else if (data.status === "abandoned") {
      await activityService.log({
        ...baseActivity,
        type: "game_abandoned",
        metadata: { fromStatus: prevStatus },
      });
    } else {
      await activityService.log({
        ...baseActivity,
        type: "status_changed",
        metadata: { fromStatus: prevStatus, toStatus: data.status },
      });
    }
  }

  // Rating activity (only when rating is actually set, not just cleared)
  if (
    data.rating !== undefined &&
    data.rating !== prevRating &&
    data.rating > 0
  ) {
    await activityService.log({
      ...baseActivity,
      type: "game_rated",
      metadata: { rating: data.rating },
    });
  }

  // Review activity (only when a non-empty review is added/changed)
  if (
    data.review !== undefined &&
    data.review !== prevReview &&
    data.review.trim().length > 0
  ) {
    await activityService.log({
      ...baseActivity,
      type: "game_reviewed",
      metadata: { review: data.review.slice(0, 200) },
    });
    // Bildirim: sadece yeni inceleme yazıldığında (upsert'ta ilk kez)
    if (gameId) {
      notificationService
        .notifyGameReviewed({
          actorId: userId,
          gameId,
          libraryEntryId,
          review: data.review,
        })
        .catch(() => {});
    }
  }

  // Favorite activity
  if (data.isFavorite === true && !prevIsFavorite) {
    await activityService.log({
      ...baseActivity,
      type: "game_favorited",
    });
  }

  // Playtime milestone check
  if (data.playTime !== undefined && data.playTime !== prevPlayTime) {
    await activityService.checkAndLogPlaytimeMilestone({
      ...baseActivity,
      prevMinutes: prevPlayTime,
      newMinutes: data.playTime,
    });
  }

  return { ...response, screenshotSize };
}

async function deleteGameService(libraryEntryId: string, userId: string) {
  const entry = await gameRepository.getGameById(libraryEntryId);
  if (!entry) throw new AppError("NOT_FOUND", "Library entry not found", 404);

  const screenshots = await Screenshot.find({ libraryEntry: libraryEntryId });
  for (const screenshot of screenshots) {
    if (screenshot.key) {
      try {
        await deleteFromR2(screenshot.key);
      } catch {
        /* continue if R2 delete fails */
      }
    }
  }

  await Screenshot.deleteMany({ libraryEntry: libraryEntryId });
  await gameRepository.findGameByIdAndDelete(libraryEntryId);
  return true;
}

async function getGameDetailService(
  libraryEntryId: string,
): Promise<GameListItem> {
  const entry = await gameRepository.getGameById(libraryEntryId);
  if (!entry) throw new AppError("NOT_FOUND", "Library entry not found", 404);
  const response = gameRepository.toLegacyGameResponse(entry);
  const screenshotSize = await Screenshot.countDocuments({
    libraryEntry: libraryEntryId,
  });
  return { ...response, screenshotSize };
}

async function getUserGamesService({
  id,
  sortBy,
  order,
  search,
  status,
  platform,
  page,
  limit,
}: {
  id: string;
  sortBy?: string;
  order?: "asc" | "desc";
  search?: string;
  status?: string;
  platform?: string;
  page?: number;
  limit?: number;
}): Promise<{
  items: GameListItem[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const mappedSortBy =
    sortBy === "playTime"
      ? "playTimeMinutes"
      : sortBy === "lastPlay"
        ? "lastPlayedAt"
        : sortBy;
  const sortCriteria: Record<string, "asc" | "desc" | 1 | -1> = mappedSortBy
    ? { [mappedSortBy]: order === "asc" ? 1 : -1 }
    : { lastPlayedAt: -1 };

  const matchCriteria: mongoose.QueryFilter<ILibraryEntry> = { user: id };
  if (status) matchCriteria.status = status;
  if (platform) matchCriteria.platform = platform;
  if (search) {
    const entries = await LibraryEntry.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: "games",
          localField: "game",
          foreignField: "_id",
          as: "game",
        },
      },
      { $unwind: "$game" },
      { $match: { "game.title": { $regex: search, $options: "i" } } },
      { $project: { _id: 1 } },
    ]);
    matchCriteria._id = { $in: entries.map((entry) => entry._id) };
  }

  const pageNum = page ?? 1;
  const limitNum = limit ?? 25;
  const skip = (pageNum - 1) * limitNum;

  const [total, entries] = await Promise.all([
    LibraryEntry.countDocuments(matchCriteria),
    gameRepository.getGames(matchCriteria, sortCriteria, skip, limitNum),
  ]);

  const responses = entries.map(gameRepository.toLegacyGameResponse);
  const entryIds = responses.map((entry) => entry._id.toString());
  const screenshotCounts = await getScreenshotCountsByEntryIds(entryIds);

  const items = responses.map((entry) => ({
    ...entry,
    screenshotSize: screenshotCounts.get(entry._id.toString()) ?? 0,
  }));

  return {
    items,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  };
}

export default {
  addNewGameService,
  editGameService,
  deleteGameService,
  getGameDetailService,
  getUserGamesService,
};
