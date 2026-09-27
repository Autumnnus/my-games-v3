import { features } from "@my-games/core/config";
import { pool } from "@my-games/core/db";
import { findEntryByGame } from "@my-games/core/library";
import { Hono } from "hono";
import { z } from "zod";
import { enabledSocialProviders } from "../auth";
import { type AppEnv, withSession } from "../middleware";
import { validate } from "../validation";
import { aiRoutes } from "./ai";
import { catalogRoutes } from "./catalog";
import { inboxRoutes } from "./inbox";
import { libraryRoutes } from "./library";
import { socialRoutes } from "./social";
import { statsRoutes } from "./stats";
import { steamRoutes } from "./steam";

export const v1 = new Hono<AppEnv>()
  .get("/health", async (c) => {
    await pool().query("select 1");
    return c.json({ ok: true });
  })
  .get("/meta", (c) => c.json({ socialProviders: enabledSocialProviders, features: features() }))
  .get("/me", withSession, (c) => {
    const user = c.get("user");
    if (!user) return c.json({ user: null });
    return c.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        username: user.username ?? null,
        displayUsername: user.displayUsername ?? null,
        bio: user.bio ?? null,
        role: user.role ?? "user",
      },
    });
  })
  .get("/me/entry", withSession, validate("query", z.object({ gameId: z.uuid() })), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ entry: null });
    return c.json({ entry: await findEntryByGame(user.id, c.req.valid("query").gameId) });
  })
  .route("/", catalogRoutes)
  .route("/", libraryRoutes)
  .route("/", inboxRoutes)
  .route("/", steamRoutes)
  .route("/", socialRoutes)
  .route("/", statsRoutes)
  .route("/", aiRoutes);
