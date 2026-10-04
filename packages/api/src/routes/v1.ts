import { aiEnabled } from "@my-games/core/ai/keys";
import { contactEmail, features } from "@my-games/core/config";
import { pool } from "@my-games/core/db";
import { findEntryByGame } from "@my-games/core/library";
import {
  dismissOnboarding,
  getOnboarding,
  markTipSeen,
  markWelcomed,
  restoreOnboarding,
} from "@my-games/core/onboarding";
import { signupsOpen } from "@my-games/core/settings";
import { onboardingTips } from "@my-games/shared";
import { Hono } from "hono";
import { z } from "zod";
import { enabledSocialProviders } from "../auth";
import { type AppEnv, currentUser, requireUser, withSession } from "../middleware";
import { validate } from "../validation";
import { adminRoutes } from "./admin";
import { aiRoutes } from "./ai";
import { catalogRoutes } from "./catalog";
import { estimateRoutes } from "./estimates";
import { inboxRoutes } from "./inbox";
import { libraryRoutes } from "./library";
import { mediaRoutes } from "./media";
import { platformRoutes } from "./platforms";
import { socialRoutes } from "./social";
import { statsRoutes } from "./stats";
import { steamRoutes } from "./steam";

export const v1 = new Hono<AppEnv>()
  .get("/health", async (c) => {
    await pool().query("select 1");
    return c.json({ ok: true });
  })
  .get("/meta", async (c) =>
    c.json({
      socialProviders: enabledSocialProviders,
      // AI anahtarları panelden de eklenebildiği için veritabanına bakar (önbellekli).
      features: { ...features(), ai: await aiEnabled() },
      signupsOpen: await signupsOpen(),
      contactEmail: contactEmail(),
    }),
  )
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
        locale: user.locale ?? null,
      },
    });
  })
  .get("/me/entry", withSession, validate("query", z.object({ gameId: z.uuid() })), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ entry: null });
    return c.json({ entry: await findEntryByGame(user.id, c.req.valid("query").gameId) });
  })
  // --- Yeni üye rehberi (rehberi olmayan hesaplarda `onboarding: null`) ---
  .get("/me/onboarding", withSession, requireUser, async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ onboarding: await getOnboarding(currentUser(c).id) });
  })
  .post("/me/onboarding/welcome", withSession, requireUser, async (c) => {
    await markWelcomed(currentUser(c).id);
    return c.json({ ok: true });
  })
  .post("/me/onboarding/dismiss", withSession, requireUser, async (c) => {
    await dismissOnboarding(currentUser(c).id);
    return c.json({ ok: true });
  })
  .post("/me/onboarding/restore", withSession, requireUser, async (c) => {
    await restoreOnboarding(currentUser(c).id);
    return c.json({ ok: true });
  })
  .post(
    "/me/onboarding/tips/:tip",
    withSession,
    requireUser,
    validate("param", z.object({ tip: z.enum(onboardingTips) })),
    async (c) => {
      await markTipSeen(currentUser(c).id, c.req.valid("param").tip);
      return c.json({ ok: true });
    },
  )
  .route("/", catalogRoutes)
  .route("/", libraryRoutes)
  .route("/", mediaRoutes)
  .route("/", inboxRoutes)
  .route("/", steamRoutes)
  .route("/", platformRoutes)
  .route("/", socialRoutes)
  .route("/", statsRoutes)
  .route("/", estimateRoutes)
  .route("/", aiRoutes);

// Yönetim API'si ayrı tiple (`AdminAppType`) kullanılır; uygulamanın istemci tipine karışmaz. Kapısı kendi
// içinde (`routes/admin.ts`).
v1.route("/admin", adminRoutes);
