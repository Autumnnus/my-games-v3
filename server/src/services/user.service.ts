import LibraryEntry from "../models/LibraryEntry";
import Screenshot from "../models/Screenshot";
import User from "../models/User";
import { AppError } from "../lib/errors";
import { deleteFromR2 } from "../lib/upload";
import {
  getFavoriteGamesByUserIds,
  withUserCounters,
  withUsersCounters,
} from "./counter.service";

async function getSingleUserService(id: string) {
  const user = await User.findById(id);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  const userWithCounters = await withUserCounters(user);
  const favoritesMap = await getFavoriteGamesByUserIds([id]);
  return {
    ...userWithCounters,
    favoriteGames: favoritesMap.get(id) ?? [],
  };
}

async function getAllUsersService() {
  const users = await User.find().select("-password");
  const usersWithCounters = await withUsersCounters(users);
  const favoritesMap = await getFavoriteGamesByUserIds(
    users.map((user) => user._id.toString()),
  );

  return usersWithCounters.map((user) => ({
    ...user,
    favoriteGames: favoritesMap.get(user._id.toString()) ?? [],
  }));
}

async function deleteUserService(adminId: string, targetUserId: string) {
  const admin = await User.findById(adminId);
  if (!admin) throw new AppError("NOT_FOUND", "User not found", 404);
  if (admin.role !== "admin")
    throw new AppError("FORBIDDEN", "Admin access required", 403);
  if (adminId === targetUserId)
    throw new AppError("BAD_REQUEST", "Cannot delete yourself", 400);

  const screenshots = await Screenshot.find({ user: targetUserId });
  for (const ss of screenshots) {
    if (ss.key) {
      try {
        await deleteFromR2(ss.key);
      } catch {
        /* continue if R2 delete fails */
      }
    }
  }

  await LibraryEntry.deleteMany({ user: targetUserId });
  await Screenshot.deleteMany({ user: targetUserId });
  await User.findByIdAndDelete(targetUserId);
  return { message: `User deleted` };
}

export default { getSingleUserService, getAllUsersService, deleteUserService };
