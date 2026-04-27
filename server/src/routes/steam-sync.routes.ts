import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../lib/response";
import { authMiddleware } from "../middlewares/auth.middleware";
import LibraryEntry from "../models/LibraryEntry";
import SteamSyncConflict from "../models/SteamSyncConflict";
import User from "../models/User";
import {
  checkSyncNeeded,
  getSteamSyncStatus,
  markExcluded,
  resolveConflict,
  syncUserGames,
} from "../services/steam-sync.service";
import type { AppVariables } from "../types/context";

const steamSync = new Hono<{ Variables: AppVariables }>();

steamSync.use("*", authMiddleware);

// ─── Settings (GET /api/steam-sync/users/me/steam-sync-settings) ─────────────

steamSync.get("/users/me/steam-sync-settings", async (c) => {
  const userId = c.get("userId");
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const settings = user.steamSyncSettings as {
    enabled: boolean;
    intervalHours: number;
    lastSyncAt: string | null;
    lastSyncStatus: "success" | "partial" | "failed" | null;
  };

  return c.json(
    ok({
      enabled: settings?.enabled ?? false,
      intervalHours: settings?.intervalHours ?? 24,
      lastSyncAt: settings?.lastSyncAt ?? null,
      lastSyncStatus: settings?.lastSyncStatus ?? null,
    }),
  );
});

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  intervalHours: z.number().int().min(1).max(168).optional(),
});

steamSync.put("/users/me/steam-sync-settings", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid settings",
          details: parsed.error.flatten(),
        },
      },
      400,
    );
  }

  const data = parsed.data;
  const update: Record<string, unknown> = {};

  if (data.enabled !== undefined) {
    update["steamSyncSettings.enabled"] = data.enabled;
  }
  if (data.intervalHours !== undefined) {
    update["steamSyncSettings.intervalHours"] = data.intervalHours;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true },
  );
  if (!user) throw new Error("User not found");

  const settings = user.steamSyncSettings as any;

  // If enabling for the first time and Steam is linked, trigger sync immediately
  if (data.enabled === true) {
    const hasSteam = (user.authProviders as string[]).includes("steam");
    if (hasSteam) {
      setImmediate(() => {
        syncUserGames(userId).catch((err) =>
          console.error("[Steam Sync] Initial sync on enable failed:", err),
        );
      });
    }
  }

  return c.json(
    ok({
      enabled: settings?.enabled ?? false,
      intervalHours: settings?.intervalHours ?? 24,
      lastSyncAt: settings?.lastSyncAt ?? null,
      lastSyncStatus: settings?.lastSyncStatus ?? null,
    }),
  );
});

// ─── Status & trigger ─────────────────────────────────────────────────────────

steamSync.get("/steam-sync/status", async (c) => {
  const userId = c.get("userId");
  const status = await getSteamSyncStatus(userId);
  if (!status) throw new Error("Steam sync not available");
  return c.json(ok(status));
});

// Rate limit map: userId -> last trigger timestamp
const lastTriggerAt = new Map<string, number>();
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

steamSync.post("/steam-sync/trigger", async (c) => {
  const userId = c.get("userId");
  const now = Date.now();
  const last = lastTriggerAt.get(userId) ?? 0;

  if (now - last < RATE_LIMIT_MS) {
    return c.json(
      ok({
        message: "Rate limited. Please wait before triggering again.",
        retryAfterMs: RATE_LIMIT_MS - (now - last),
      }),
      429,
    );
  }

  lastTriggerAt.set(userId, now);

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const enabled = (user.steamSyncSettings as any)?.enabled;
  if (!enabled) {
    return c.json(ok({ message: "Steam sync is not enabled for this user" }));
  }

  const jobId = `sync_${now}`;

  setImmediate(() => {
    syncUserGames(userId).catch((err) =>
      console.error("[Steam Sync] Manual trigger failed:", err),
    );
  });

  return c.json(ok({ message: "Sync triggered", jobId }), 202);
});

// ─── Conflicts ────────────────────────────────────────────────────────────────

steamSync.get("/steam-sync/conflicts", async (c) => {
  const userId = c.get("userId");
  const statusFilter = c.req.query("status") ?? "pending";

  const query: Record<string, unknown> = { userId };
  if (statusFilter !== "all") {
    query.status = statusFilter;
  }

  const conflicts = await SteamSyncConflict.find(query).lean();

  const entryIds = conflicts.map((conflict: any) => conflict.libraryEntryId);
  const entries = await LibraryEntry.find({ _id: { $in: entryIds } })
    .populate<{ game: { title: string; coverUrl?: string | null } }>(
      "game",
      "title coverUrl",
    )
    .lean();

  const entryMap = new Map(entries.map((e: any) => [e._id.toString(), e]));

  return c.json(
    ok({
      conflicts: conflicts.map((conflict: any) => {
        const entry = entryMap.get(conflict.libraryEntryId.toString());
        return {
          id: conflict._id.toString(),
          libraryEntryId: conflict.libraryEntryId.toString(),
          gameName: entry?.game?.title ?? "Unknown",
          gameCoverUrl: entry?.game?.coverUrl ?? null,
          manualValue: conflict.manualValue,
          steamValue: conflict.steamValue,
          diff: conflict.diff,
          detectedAt: conflict.detectedAt,
          status: conflict.status,
        };
      }),
      total: conflicts.length,
    }),
  );
});

const resolveSchema = z.object({
  conflictId: z.string(),
  resolution: z.enum(["take_steam", "keep_manual", "ignore"]),
});

steamSync.post("/steam-sync/resolve", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid request" },
      },
      400,
    );
  }

  const conflict = await SteamSyncConflict.findOne({
    _id: parsed.data.conflictId,
  });
  if (!conflict) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Conflict not found" },
      },
      404,
    );
  }
  if (conflict.userId.toString() !== userId) {
    return c.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Not your conflict" },
      },
      403,
    );
  }
  if (conflict.status === "resolved") {
    return c.json(
      {
        success: false,
        error: { code: "CONFLICT", message: "Already resolved" },
      },
      409,
    );
  }

  await resolveConflict(parsed.data.conflictId, userId, parsed.data.resolution);

  const updated = await SteamSyncConflict.findById(parsed.data.conflictId);
  return c.json(
    ok({
      conflictId: parsed.data.conflictId,
      status: "resolved",
      resolution: updated?.resolution,
      resolvedAt: updated?.resolvedAt,
    }),
  );
});

// ─── Per-game exclusion ───────────────────────────────────────────────────────

steamSync.patch("/library/:entryId/steam-sync-exclude", async (c) => {
  const userId = c.get("userId");
  const entryId = c.req.param("entryId");
  const body = (await c.req.json().catch(() => ({}))) as { exclude?: boolean };
  if (typeof body.exclude !== "boolean") {
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: '"exclude" must be a boolean',
        },
      },
      400,
    );
  }

  const entry = await LibraryEntry.findOne({ _id: entryId, user: userId });
  if (!entry) {
    return c.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Library entry not found" },
      },
      404,
    );
  }

  await markExcluded(entryId, userId, body.exclude);

  const updated = await LibraryEntry.findById(entryId);
  return c.json(
    ok({
      libraryEntryId: entryId,
      steamSyncExclude: updated?.steamSyncExclude ?? body.exclude,
      syncStatus: updated?.syncStatus ?? (body.exclude ? "excluded" : "synced"),
    }),
  );
});

export default steamSync;
