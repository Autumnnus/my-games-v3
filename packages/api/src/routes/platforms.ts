import { entryAchievements } from "@my-games/core/achievements";
import { appUrl } from "@my-games/core/config";
import { AppError } from "@my-games/core/errors";
import {
  platformStatuses,
  requestPlatformSync,
  setPlatformSyncEnabled,
  unlinkPlatformAccount,
} from "@my-games/core/platforms/accounts";
import { linkPsnAccount } from "@my-games/core/psn/sync";
import { recentSyncRuns } from "@my-games/core/steam/sync";
import { completeXboxLink, xboxAuthorizeUrl } from "@my-games/core/xbox/auth";
import { Hono } from "hono";
import { z } from "zod";
import { localeFromRequest } from "../locale";
import { type AppEnv, currentUser, rateLimit, requireUser, withSession } from "../middleware";
import { uuidParam, validate } from "../validation";

const providerParam = z.object({ provider: z.enum(["psn", "xbox"]) });

function settingsUrl(params: Record<string, string>) {
  const url = new URL("/settings", appUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export const platformRoutes = new Hono<AppEnv>()
  .get("/library/:id/achievements", validate("param", uuidParam), async (c) => {
    const sets = await entryAchievements(c.req.valid("param").id, localeFromRequest(c.req.raw));
    if (!sets) throw new AppError("not_found", "Kayıt bulunamadı");
    return c.json({ sets });
  })
  .get("/platforms", withSession, requireUser, async (c) => {
    const userId = currentUser(c).id;
    const [accounts, runs] = await Promise.all([
      platformStatuses(userId),
      recentSyncRuns(userId, 10),
    ]);
    return c.json({ accounts, runs });
  })
  .post(
    "/platforms/psn",
    withSession,
    requireUser,
    rateLimit("psn-link", 10, 60 * 60_000),
    validate("json", z.object({ npsso: z.string().min(1).max(512) })),
    async (c) => {
      await linkPsnAccount(currentUser(c).id, c.req.valid("json").npsso);
      return c.json({ accounts: await platformStatuses(currentUser(c).id) }, 201);
    },
  )
  // Microsoft girişine yönlendirir; dönüşte hesabı bağlar ve ayarlara geri gönderir.
  .get("/platforms/xbox/connect", withSession, requireUser, (c) =>
    c.redirect(xboxAuthorizeUrl(currentUser(c).id)),
  )
  .get("/platforms/xbox/callback", withSession, async (c) => {
    const user = c.get("user");
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!user) return c.redirect(new URL("/login", appUrl()).toString());
    if (!code || !state) return c.redirect(settingsUrl({ error: "xbox_cancelled" }));
    try {
      await completeXboxLink(user.id, code, state);
      return c.redirect(settingsUrl({ linked: "xbox" }));
    } catch (error) {
      const reason =
        error instanceof AppError && error.code === "conflict" ? "xbox_taken" : "xbox_failed";
      console.warn("[xbox] bağlama başarısız", error);
      return c.redirect(settingsUrl({ error: reason }));
    }
  })
  .post(
    "/platforms/:provider/sync",
    withSession,
    requireUser,
    rateLimit("platform-sync", 6, 60 * 60_000),
    validate("param", providerParam),
    async (c) => {
      await requestPlatformSync(currentUser(c).id, c.req.valid("param").provider);
      return c.json({ ok: true }, 202);
    },
  )
  .patch(
    "/platforms/:provider",
    withSession,
    requireUser,
    validate("param", providerParam),
    validate("json", z.object({ syncEnabled: z.boolean() })),
    async (c) => {
      const userId = currentUser(c).id;
      await setPlatformSyncEnabled(
        userId,
        c.req.valid("param").provider,
        c.req.valid("json").syncEnabled,
      );
      return c.json({ accounts: await platformStatuses(userId) });
    },
  )
  .delete(
    "/platforms/:provider",
    withSession,
    requireUser,
    validate("param", providerParam),
    async (c) => {
      await unlinkPlatformAccount(currentUser(c).id, c.req.valid("param").provider);
      return c.json({ ok: true });
    },
  );
