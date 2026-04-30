import { env } from "../config/env";
import ExternalAccount from "../models/ExternalAccount";
import LibraryEntry from "../models/LibraryEntry";
import SteamSyncConflict from "../models/SteamSyncConflict";
import User from "../models/User";
import { fetchSteamLibrary } from "./steam.service";
import { wsManager } from "../ws/ws.manager";

export type Resolution = "take_steam" | "keep_manual" | "ignore";

export interface SyncResult {
  synced: number;
  conflicts: number;
  errors: number;
}

// ─── Check if sync is needed ─────────────────────────────────────────────────

export function checkSyncNeeded(user: InstanceType<typeof User>): boolean {
  const settings = user.steamSyncSettings as {
    enabled: boolean;
    intervalHours: number;
    lastSyncAt: string | null;
  };
  if (!settings.enabled || !settings.lastSyncAt) return true;

  const intervalMs = settings.intervalHours * 60 * 60 * 1000;
  const elapsed = Date.now() - new Date(settings.lastSyncAt).getTime();
  return elapsed >= intervalMs;
}

// ─── Sync all games for a user ───────────────────────────────────────────────

export async function syncUserGames(userId: string): Promise<SyncResult> {
  const account = await ExternalAccount.findOne({
    user: userId,
    provider: "steam",
  });
  if (!account) return { synced: 0, conflicts: 0, errors: 0 };

  let synced = 0;
  let conflicts = 0;
  let errors = 0;

  try {
    const steamGames = await fetchSteamLibrary(account.providerUserId);

    for (const sg of steamGames) {
      try {
        const entry = await LibraryEntry.findOne({
          user: userId,
          game: undefined, // placeholder; resolved below
        });

        // Find library entry by linked steam appid
        const gameEntry = await LibraryEntry.findOne({
          user: userId,
          "game.sourceIds.steamAppId": sg.appid,
        }).populate("game");

        if (!gameEntry) continue;
        if ((gameEntry as any).steamSyncExclude === true) continue;

        const steamPlaytime = sg.playtime_forever ?? 0;

        // Update steamPlayTime on the entry
        await LibraryEntry.findByIdAndUpdate(gameEntry._id, {
          $set: { steamPlayTime: steamPlaytime },
        });

        if ((gameEntry as any).manualPlayTime === false) {
          // No manual override — take Steam value
          await LibraryEntry.findByIdAndUpdate(gameEntry._id, {
            $set: {
              playTimeMinutes: steamPlaytime,
              syncedFromSteam: true,
              syncStatus: "synced",
              lastPlayedAt: new Date(),
            },
          });
          synced++;
        } else {
          // Manual override active — check for conflict
          if (steamPlaytime !== (gameEntry as any).playTimeMinutes) {
            await createConflict(
              userId,
              gameEntry._id.toString(),
              (gameEntry as any).playTimeMinutes,
              steamPlaytime,
            );
            await LibraryEntry.findByIdAndUpdate(gameEntry._id, {
              $set: { syncStatus: "conflict" },
            });
            conflicts++;
          }
        }
      } catch (err) {
        console.error(`Steam sync: error for appid ${sg.appid}`, err);
        errors++;
      }
    }

    // Update last sync status on user
    await User.findByIdAndUpdate(userId, {
      $set: {
        "steamSyncSettings.lastSyncAt": new Date().toISOString(),
        "steamSyncSettings.lastSyncStatus":
          errors > 0 ? (conflicts > 0 ? "partial" : "failed") : "success",
      },
    });
  } catch (err) {
    console.error("Steam sync: failed to fetch library", err);
    await User.findByIdAndUpdate(userId, {
      $set: {
        "steamSyncSettings.lastSyncStatus": "failed",
      },
    });
    errors++;
  }

  wsManager.send(userId, {
    type: "sync:complete",
    payload: { synced, conflicts, errors },
  });

  return { synced, conflicts, errors };
}

// ─── Check conflicts for a user ──────────────────────────────────────────────

export async function checkConflicts(
  userId: string,
): Promise<InstanceType<typeof SteamSyncConflict>[]> {
  const entries = await LibraryEntry.find({
    user: userId,
    steamSyncExclude: false,
    manualPlayTime: true,
    steamPlayTime: { $ne: null },
  });

  const created: InstanceType<typeof SteamSyncConflict>[] = [];

  for (const entry of entries) {
    const entryAny = entry as any;
    if (entryAny.playTimeMinutes !== entryAny.steamPlayTime) {
      const conflict = await createConflict(
        userId,
        entry._id.toString(),
        entryAny.playTimeMinutes,
        entryAny.steamPlayTime,
      );
      if (conflict) created.push(conflict);

      await LibraryEntry.findByIdAndUpdate(entry._id, {
        $set: { syncStatus: "conflict" },
      });
    }
  }

  return created;
}

// ─── Resolve a conflict ───────────────────────────────────────────────────────

export async function resolveConflict(
  conflictId: string,
  userId: string,
  resolution: Resolution,
): Promise<void> {
  const conflict = await SteamSyncConflict.findOne({ _id: conflictId, userId });
  if (!conflict) return;

  const entry = await LibraryEntry.findById(conflict.libraryEntryId);
  if (!entry) return;

  const update: Record<string, unknown> = { syncStatus: "resolved" };

  if (resolution === "take_steam") {
    update.playTimeMinutes = conflict.steamValue;
    update.manualPlayTime = false;
  } else if (resolution === "keep_manual") {
    update.manualPlayTime = true;
  }
  // 'ignore' — only syncStatus changes

  await LibraryEntry.findByIdAndUpdate(entry._id, { $set: update });

  conflict.status = "resolved";
  conflict.resolution = resolution;
  conflict.resolvedAt = new Date().toISOString();
  await conflict.save();
}

// ─── Mark exclusion ───────────────────────────────────────────────────────────

export async function markExcluded(
  libraryEntryId: string,
  userId: string,
  exclude: boolean,
): Promise<void> {
  await LibraryEntry.findOneAndUpdate(
    { _id: libraryEntryId, user: userId },
    {
      $set: {
        steamSyncExclude: exclude,
        syncStatus: exclude ? "excluded" : "synced",
      },
    },
  );

  if (exclude) {
    await SteamSyncConflict.findOneAndUpdate(
      { libraryEntryId, status: "pending" },
      {
        $set: {
          status: "resolved",
          resolution: "ignore",
          resolvedAt: new Date().toISOString(),
        },
      },
    );
  }
}

// ─── Get sync status ──────────────────────────────────────────────────────────

export async function getSteamSyncStatus(userId: string) {
  const user = await User.findById(userId);
  if (!user) return null;

  const settings = user.steamSyncSettings as {
    enabled: boolean;
    intervalHours: number;
    lastSyncAt: string | null;
    lastSyncStatus: "success" | "partial" | "failed" | null;
  };

  const pendingCount = await SteamSyncConflict.countDocuments({
    userId,
    status: "pending",
  });

  return {
    enabled: settings.enabled ?? false,
    intervalHours: settings.intervalHours ?? 24,
    lastSyncAt: settings.lastSyncAt ?? null,
    lastSyncStatus: settings.lastSyncStatus ?? null,
    pendingConflicts: pendingCount,
    lastError: null as string | null,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createConflict(
  userId: string,
  libraryEntryId: string,
  manualValue: number,
  steamValue: number,
): Promise<InstanceType<typeof SteamSyncConflict> | null> {
  try {
    const conflict = await SteamSyncConflict.create({
      userId,
      libraryEntryId,
      manualValue,
      steamValue,
      diff: steamValue - manualValue,
      detectedAt: new Date().toISOString(),
      status: "pending",
    });
    return conflict;
  } catch {
    // Unique index prevents duplicates; skip if already exists
    return null;
  }
}

// ─── Cron job ─────────────────────────────────────────────────────────────────

import { CronJob } from "cron";
import { AppError } from "../lib/errors";

const CRON_PATTERN = process.env.CRON_STEAM_SYNC ?? "0 3 * * *";
const CONCURRENCY = parseInt(process.env.STEAM_SYNC_CONCURRENCY ?? "10", 10);

export function startSteamSyncCron(): void {
  const job = new CronJob(
    CRON_PATTERN,
    async () => {
      console.log("[Steam Sync Cron] Starting sync job");

      const users = await User.find({
        "steamSyncSettings.enabled": true,
      }).select("_id");

      const chunks = chunkArray(
        users.map((u) => u._id.toString()),
        CONCURRENCY,
      );

      let totalSynced = 0;
      let totalConflicts = 0;
      let totalErrors = 0;

      for (const batch of chunks) {
        const results = await Promise.allSettled(
          batch.map((uid) => syncUserGames(uid)),
        );
        for (const r of results) {
          if (r.status === "fulfilled") {
            totalSynced += r.value.synced;
            totalConflicts += r.value.conflicts;
            totalErrors += r.value.errors;
          } else {
            totalErrors++;
          }
        }
      }

      console.log(
        `[Steam Sync Cron] Done — synced:${totalSynced} conflicts:${totalConflicts} errors:${totalErrors}`,
      );
    },
    null,
    false,
    "UTC",
  );

  job.start();
  console.log(`[Steam Sync Cron] Scheduled: ${CRON_PATTERN}`);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
