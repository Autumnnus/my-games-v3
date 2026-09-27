import {
  getSteamStatus,
  requestSteamSync,
  setSteamSyncEnabled,
  unlinkSteamAccount,
} from "@my-games/core/steam/accounts";
import { recentSyncRuns } from "@my-games/core/steam/sync";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, currentUser, rateLimit, requireUser, withSession } from "../middleware";
import { validate } from "../validation";

export const steamRoutes = new Hono<AppEnv>()
  .get("/steam", withSession, requireUser, async (c) => {
    const userId = currentUser(c).id;
    const [account, runs] = await Promise.all([getSteamStatus(userId), recentSyncRuns(userId, 5)]);
    return c.json({ account, runs });
  })
  .post(
    "/steam/sync",
    withSession,
    requireUser,
    rateLimit("steam-sync", 6, 60 * 60_000),
    async (c) => {
      await requestSteamSync(currentUser(c).id);
      return c.json({ ok: true }, 202);
    },
  )
  .patch(
    "/steam",
    withSession,
    requireUser,
    validate("json", z.object({ syncEnabled: z.boolean() })),
    async (c) => {
      await setSteamSyncEnabled(currentUser(c).id, c.req.valid("json").syncEnabled);
      return c.json({ account: await getSteamStatus(currentUser(c).id) });
    },
  )
  .delete("/steam", withSession, requireUser, async (c) => {
    await unlinkSteamAccount(currentUser(c).id);
    return c.json({ ok: true });
  });
