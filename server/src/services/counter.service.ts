import mongoose from "mongoose";
import LibraryEntry from "../models/LibraryEntry";
import Screenshot from "../models/Screenshot";
import gameRepository from "../repository/game.repository";
import type { IUser } from "../models/User";

export async function getUserCounters(userId: string) {
  const [gameSize, completedGameSize, screenshotSize] = await Promise.all([
    LibraryEntry.countDocuments({ user: userId }),
    LibraryEntry.countDocuments({ user: userId, status: "completed" }),
    Screenshot.countDocuments({ user: userId }),
  ]);

  return { gameSize, completedGameSize, screenshotSize };
}

export async function withUserCounters<T extends IUser>(user: T) {
  const counters = await getUserCounters(user._id.toString());
  return {
    ...user.toObject(),
    ...counters,
  };
}

export async function withUsersCounters<T extends IUser>(users: T[]) {
  const result = await Promise.all(users.map(withUserCounters));
  return result;
}

export async function getScreenshotCountsByEntryIds(entryIds: string[]) {
  if (!entryIds.length) return new Map<string, number>();

  const objectIds = entryIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await Screenshot.aggregate<{
    _id: mongoose.Types.ObjectId;
    count: number;
  }>([
    { $match: { libraryEntry: { $in: objectIds } } },
    { $group: { _id: "$libraryEntry", count: { $sum: 1 } } },
  ]);

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row._id.toString(), row.count);
  }

  return counts;
}

export async function getFavoriteGamesByUserIds(userIds: string[]) {
  if (!userIds.length) return new Map<string, unknown[]>();

  const objectIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const entries = await LibraryEntry.find({
    user: { $in: objectIds },
    isFavorite: true,
  })
    .populate("game")
    .sort({ updatedAt: -1 });

  const grouped = new Map<string, unknown[]>();
  for (const entry of entries) {
    const userId = entry.user.toString();
    const current = grouped.get(userId) ?? [];
    current.push(gameRepository.toLegacyGameResponse(entry));
    grouped.set(userId, current);
  }

  return grouped;
}
