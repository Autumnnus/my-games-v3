import { Hono } from "hono";
import { ok } from "../lib/response";
import wishlistRepository from "../repository/wishlist.repository";
import { authMiddleware } from "../middlewares/auth.middleware";
import ExternalAccount from "../models/ExternalAccount";
import type { AppVariables } from "../types/context";

const wishlist = new Hono<{ Variables: AppVariables }>();

// GET /api/wishlist - get current user's wishlist
wishlist.get("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const items = await wishlistRepository.getWishlistByUser(userId);
  return c.json(ok(items));
});

// POST /api/wishlist - add to wishlist
wishlist.post("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const item = await wishlistRepository.addToWishlist({ ...body, userId });
  return c.json(ok(item));
});

// DELETE /api/wishlist/:id - remove from wishlist
wishlist.delete("/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  await wishlistRepository.removeFromWishlist(c.req.param("id"), userId);
  return c.json(ok({ success: true }));
});

// DELETE /api/wishlist - clear all wishlist
wishlist.delete("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  await wishlistRepository.clearWishlist(userId);
  return c.json(ok({ success: true }));
});

// GET /api/wishlist/check/:igdbId - check if in wishlist
wishlist.get("/check/:igdbId", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const igdbId = parseInt(c.req.param("igdbId"));
  const item = await wishlistRepository.isInWishlist(userId, igdbId);
  return c.json(ok({ inWishlist: !!item, item }));
});

// POST /api/wishlist/steam-import - import from Steam wishlist
wishlist.post("/steam-import", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  let { steamId } = body as { steamId?: string };

  // If no steamId provided, try linked Steam account
  if (!steamId) {
    const linked = await ExternalAccount.findOne({ user: userId, provider: "steam" });
    if (linked) {
      steamId = linked.providerUserId;
    } else {
      return c.json(
        { success: false, error: { code: "STEAM_ID_REQUIRED", message: "No linked Steam account. Please enter your Steam ID." } },
        400
      );
    }
  }

  const { importFromSteamWishlist } = await import("../services/steam-wishlist.service");
  try {
    const result = await importFromSteamWishlist(userId, steamId);
    return c.json(ok(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Steam import failed";
    return c.json({ success: false, error: { code: "STEAM_IMPORT_ERROR", message } }, 400);
  }
});

export default wishlist;
