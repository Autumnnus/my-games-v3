import { createMiddleware } from "hono/factory";
import { verifyToken } from "../lib/jwt";
import { fail } from "../lib/response";
import LibraryEntry from "../models/LibraryEntry";
import Screenshot from "../models/Screenshot";
import User from "../models/User";
import { AppError } from "../lib/errors";

type AuthVariables = { userId: string; userRole: string };

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json(fail("UNAUTHORIZED", "No token provided"), 401);
    }
    const token = header.slice(7);
    const payload = verifyToken(token);
    c.set("userId", payload.id);

    const user = await User.findById(payload.id).select("role");
    if (!user) return c.json(fail("UNAUTHORIZED", "User not found"), 401);
    c.set("userRole", user.role);

    await next();
  },
);

export const adminMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const role = c.get("userRole");
    if (role !== "admin") {
      return c.json(fail("FORBIDDEN", "Admin access required"), 403);
    }
    await next();
  },
);

export const adminOrVipMiddleware = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const role = c.get("userRole");
  if (role !== "admin" && role !== "vip") {
    return c.json(fail("FORBIDDEN", "Admin or VIP access required"), 403);
  }
  await next();
});

export const gameOwnerMiddleware = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const gameId = c.req.param("id") || c.req.param("game_id");
  const userId = c.get("userId");

  const entry = await LibraryEntry.findById(gameId);
  if (!entry) throw new AppError("NOT_FOUND", "Library entry not found", 404);
  if (entry.user.toString() !== userId) {
    return c.json(fail("FORBIDDEN", "You do not own this game"), 403);
  }
  await next();
});

export const screenshotOwnerMiddleware = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const gameId = c.req.param("game_id");
  const screenshotId = c.req.param("screenshot_id");
  const userId = c.get("userId");

  const entry = await LibraryEntry.findById(gameId);
  if (!entry) throw new AppError("NOT_FOUND", "Library entry not found", 404);
  if (entry.user.toString() !== userId) {
    return c.json(fail("FORBIDDEN", "You do not own this game"), 403);
  }

  const screenshot = await Screenshot.findById(screenshotId);
  if (!screenshot) throw new AppError("NOT_FOUND", "Screenshot not found", 404);
  if (
    screenshot.user.toString() !== userId ||
    screenshot.libraryEntry.toString() !== gameId
  ) {
    return c.json(fail("FORBIDDEN", "You do not own this screenshot"), 403);
  }

  await next();
});
