import { Hono } from "hono";
import { ok } from "../lib/response";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  fetchSteamProfile,
  fetchSteamScreenshots,
  getSyncStatus,
  getSteamLibraryPreview,
  syncSteamData,
} from "../services/steam.service";
import ExternalAccount from "../models/ExternalAccount";
import { AppError } from "../lib/errors";
import type { AppVariables } from "../types/context";

const steam = new Hono<{ Variables: AppVariables }>();

steam.use("*", authMiddleware);

steam.get("/profile", async (c) => {
  const userId = c.get("userId");
  const account = await ExternalAccount.findOne({
    user: userId,
    provider: "steam",
  });
  if (!account) throw new AppError("NOT_FOUND", "No Steam account linked", 404);

  const profile = await fetchSteamProfile(account.providerUserId);
  return c.json(
    ok({
      steamId: profile.steamid,
      displayName: profile.personaname,
      avatarUrl: profile.avatarfull,
      profileUrl: profile.profileurl,
      country: profile.loccountrycode,
      linkedAt: account.linkedAt,
    }),
  );
});

steam.get("/library", async (c) => {
  const userId = c.get("userId");
  const items = await getSteamLibraryPreview(userId);
  return c.json(ok(items));
});

steam.post("/sync", async (c) => {
  const userId = c.get("userId");

  const account = await ExternalAccount.findOne({
    user: userId,
    provider: "steam",
  });
  if (!account) throw new AppError("NOT_FOUND", "No Steam account linked", 404);

  if (account.syncStatus === "syncing") {
    return c.json(
      ok({ message: "Sync already in progress", syncStatus: "syncing" }),
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    appIds?: number[];
    conflictResolution?: "higher" | "steam" | "keep";
  };

  if (!body.appIds?.length) {
    throw new AppError(
      "BAD_REQUEST",
      "appIds is required and must not be empty",
      400,
    );
  }

  const options = {
    appIds: body.appIds,
    conflictResolution: body.conflictResolution ?? "higher",
  };

  // Fire and forget — sync runs in background
  setImmediate(() => {
    syncSteamData(userId, options).catch((err) =>
      console.error("Steam background sync failed:", err),
    );
  });

  return c.json(ok({ message: "Sync started", syncStatus: "syncing" }));
});

steam.get("/sync/status", async (c) => {
  const userId = c.get("userId");
  const status = await getSyncStatus(userId);
  if (!status) throw new AppError("NOT_FOUND", "No Steam account linked", 404);
  return c.json(ok(status));
});

steam.get("/screenshots", async (c) => {
  const userId = c.get("userId");
  const appIdParam = c.req.query("appId");
  const appId = appIdParam ? Number(appIdParam) : undefined;

  const account = await ExternalAccount.findOne({
    user: userId,
    provider: "steam",
  });
  if (!account) throw new AppError("NOT_FOUND", "No Steam account linked", 404);

  const screenshots = await fetchSteamScreenshots(
    account.providerUserId,
    appId,
  );
  return c.json(
    ok(
      screenshots.map((s) => ({
        id: s.publishedfileid,
        title: s.title,
        fileUrl: s.file_url,
        previewUrl: s.preview_url,
        appName: s.app_name,
        appId: s.consumer_appid,
      })),
    ),
  );
});

export default steam;
