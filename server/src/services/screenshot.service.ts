import LibraryEntry from "../models/LibraryEntry";
import Screenshot from "../models/Screenshot";
import User from "../models/User";
import { AppError } from "../lib/errors";
import {
  deleteFromR2,
  updateInR2,
  uploadToR2,
  uploadToR2Structured,
} from "../lib/upload";
import type {
  ScreenshotListResponse,
  ScreenshotSortBy,
} from "../types/contracts/screenshot.contract";
import activityService from "./activity.service";
import * as notificationService from "./notification.service";

type AddTextParams = {
  userId: string;
  gameId: string;
  type: "text";
  payload: { name?: string; url: string }[];
};

type AddImageParams = {
  userId: string;
  gameId: string;
  type: "image";
  files: { name?: string; file: File }[];
};

type AddExternalParams = {
  userId: string;
  gameId: string;
  type: "external";
  payload: { url: string; thumbnail?: string; name?: string }[];
};

async function addScreenshotService(
  params: AddTextParams | AddImageParams | AddExternalParams,
) {
  const { userId, gameId, type } = params;
  const user = await User.findById(userId);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  const entry = await LibraryEntry.findById(gameId);
  if (!entry) throw new AppError("NOT_FOUND", "Library entry not found", 404);

  if (type === "text") {
    const { payload } = params;
    const created = [];
    for (const item of payload) {
      const ss = await Screenshot.create({
        name: item.name,
        url: item.url,
        user: userId,
        libraryEntry: gameId,
        type: "text",
      });
      created.push(ss);
    }
    await logScreenshotActivity(
      userId,
      gameId,
      entry.game?.toString(),
      created.length,
      created[0]?.url,
    );
    return created;
  }

  if (type === "image") {
    if (user.role !== "admin" && user.role !== "vip")
      throw new AppError("FORBIDDEN", "Admin or VIP access required", 403);
    const { files } = params;
    if (!files.length)
      throw new AppError("BAD_REQUEST", "No files provided", 400);

    const created = [];
    for (const item of files) {
      const { url, key } = await uploadToR2Structured(
        item.file,
        userId,
        gameId,
        item.name || "screenshot",
      );
      const ss = await Screenshot.create({
        name: item.name,
        url,
        key,
        user: userId,
        libraryEntry: gameId,
        type: "image",
      });
      created.push(ss);
    }
    await logScreenshotActivity(
      userId,
      gameId,
      entry.game?.toString(),
      created.length,
      created[0]?.url,
    );
    return created;
  }

  if (type === "external") {
    const { payload } = params;
    if (!payload.length)
      throw new AppError("BAD_REQUEST", "No items provided", 400);
    const created = [];
    for (const item of payload) {
      if (!item.url) continue;
      const ss = await Screenshot.create({
        name: item.name,
        url: item.url,
        thumbnail: item.thumbnail,
        user: userId,
        libraryEntry: gameId,
        type: "image",
      });
      created.push(ss);
    }
    const firstThumbnail = created[0]?.thumbnail ?? created[0]?.url;
    await logScreenshotActivity(
      userId,
      gameId,
      entry.game?.toString(),
      created.length,
      firstThumbnail,
    );
    return created;
  }

  throw new AppError("BAD_REQUEST", "Invalid screenshot type", 400);
}

async function logScreenshotActivity(
  userId: string,
  libraryEntryId: string,
  gameId: string | undefined,
  count: number,
  firstUrl?: string,
) {
  await activityService.log({
    userId,
    type: "screenshot_added",
    gameId,
    libraryEntryId,
    metadata: { screenshotCount: count, firstScreenshotUrl: firstUrl },
  });
  if (gameId) {
    notificationService
      .notifyScreenshotAdded({
        actorId: userId,
        gameId,
        libraryEntryId,
        screenshotCount: count,
        firstScreenshotUrl: firstUrl,
      })
      .catch(() => {});
  }
}

async function editScreenshotService(params: {
  userId: string;
  gameId: string;
  screenshotId: string;
  type: "text" | "image";
  name?: string;
  url?: string;
  file?: File;
}) {
  const { screenshotId, type, name, url, file } = params;
  const screenshot = await Screenshot.findById(screenshotId);
  if (!screenshot) throw new AppError("NOT_FOUND", "Screenshot not found", 404);

  if (type === "text") {
    if (name !== undefined) screenshot.name = name;
    if (url) screenshot.url = url;
    screenshot.type = "text";
    await screenshot.save();
    return screenshot;
  }

  if (type === "image") {
    if (file) {
      const { url: newUrl, key: newKey } = await updateInR2(
        screenshot.key || "",
        file,
        "screenshots",
      );
      screenshot.url = newUrl;
      screenshot.key = newKey;
    }
    if (name !== undefined) screenshot.name = name;
    screenshot.type = "image";
    await screenshot.save();
    return screenshot;
  }

  throw new AppError("BAD_REQUEST", "Invalid screenshot type", 400);
}

async function bulkDeleteScreenshotService(params: {
  userId: string;
  gameId: string;
  screenshotIds: string[];
}) {
  const { userId, gameId, screenshotIds } = params;
  const [user, entry] = await Promise.all([
    User.findById(userId),
    LibraryEntry.findById(gameId),
  ]);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  if (!entry) throw new AppError("NOT_FOUND", "Library entry not found", 404);

  const screenshots = await Screenshot.find({
    _id: { $in: screenshotIds },
    user: userId,
    libraryEntry: gameId,
  });

  if (!screenshots.length) {
    throw new AppError(
      "NOT_FOUND",
      "No matching screenshots found for bulk delete",
      404,
    );
  }

  const foundIds = new Set(screenshots.map((s) => s._id.toString()));
  const missingIds = screenshotIds.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    throw new AppError(
      "BAD_REQUEST",
      "Some screenshot ids are invalid or not owned by user/game",
      400,
      { missingIds },
    );
  }

  for (const screenshot of screenshots) {
    if (screenshot.key) {
      try {
        await deleteFromR2(screenshot.key);
      } catch {
        /* non-fatal */
      }
    }
  }

  await Screenshot.deleteMany({
    _id: { $in: screenshotIds },
    user: userId,
    libraryEntry: gameId,
  });
  return { message: "Screenshots deleted", deletedCount: screenshots.length };
}

async function deleteAllScreenshotsForGameService(params: {
  userId: string;
  gameId: string;
}) {
  const { userId, gameId } = params;
  const [user, entry] = await Promise.all([
    User.findById(userId),
    LibraryEntry.findById(gameId),
  ]);
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  if (!entry) throw new AppError("NOT_FOUND", "Library entry not found", 404);

  const screenshots = await Screenshot.find({ libraryEntry: gameId });
  const deletedCount = screenshots.length;

  for (const screenshot of screenshots) {
    if (screenshot.key) {
      try {
        await deleteFromR2(screenshot.key);
      } catch {
        /* non-fatal */
      }
    }
  }

  await Screenshot.deleteMany({ libraryEntry: gameId });
  return { message: "All screenshots deleted for game", deletedCount };
}

async function getScreenshotService(params: {
  gameId: string;
  page?: number;
  limit?: number;
  sortBy?: ScreenshotSortBy;
  order?: "asc" | "desc";
}): Promise<ScreenshotListResponse> {
  const {
    gameId,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    order = "desc",
  } = params;

  const skip = (page - 1) * limit;
  const direction = order === "asc" ? 1 : -1;
  const sort: Record<ScreenshotSortBy, 1 | -1> = {
    createdAt: -1,
    updatedAt: -1,
    name: -1,
    type: -1,
  };
  sort[sortBy] = direction;

  const [items, total] = await Promise.all([
    Screenshot.find({ libraryEntry: gameId })
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Screenshot.countDocuments({ libraryEntry: gameId }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    sorting: {
      sortBy,
      order,
    },
  };
}

async function getRandomScreenshotsService(count: number) {
  const all = await Screenshot.find().populate({
    path: "libraryEntry",
    populate: { path: "game" },
  });
  if (!all.length) throw new AppError("NOT_FOUND", "No screenshots found", 404);
  if (count > all.length)
    throw new AppError(
      "BAD_REQUEST",
      "Requested count exceeds available screenshots",
      400,
    );

  const pool = [...all];
  const result = [];
  while (result.length < count) {
    const i = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(i, 1)[0]);
  }
  return result;
}

async function getUserScreenshotsService(userId: string) {
  return await Screenshot.find({ user: userId })
    .populate({
      path: "libraryEntry",
      populate: { path: "game" },
    })
    .sort({ createdAt: -1 });
}

export default {
  addScreenshotService,
  editScreenshotService,
  bulkDeleteScreenshotService,
  deleteAllScreenshotsForGameService,
  getScreenshotService,
  getRandomScreenshotsService,
  getUserScreenshotsService,
};
