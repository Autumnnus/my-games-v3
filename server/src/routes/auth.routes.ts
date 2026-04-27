import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ok } from "../lib/response";
import authService from "../services/auth.service";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  validateEmailSchema,
  editUserSchema,
} from "../schemas/auth.schema";
import { authMiddleware } from "../middlewares/auth.middleware";
import { withUserCounters } from "../services/counter.service";
import { buildSteamLoginUrl, verifySteamCallback } from "../lib/steam-openid";
import {
  steamLoginOrRegister,
  linkSteamAccount,
  unlinkSteamAccount,
} from "../services/steam.service";
import { verifyToken } from "../lib/jwt";
import type { AppVariables } from "../types/context";
import { env } from "../config/env";

const auth = new Hono<{ Variables: AppVariables }>();

auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, name, password } = c.req.valid("json");
  const user = await authService.registerService(email, name, password);
  const token = user.generateJwtFromUser();
  const userWithCounters = await withUserCounters(user);
  return c.json(ok({ token, user: userWithCounters }), 201);
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const user = await authService.loginService(email, password);
  const token = user.generateJwtFromUser();
  const userWithCounters = await withUserCounters(user);
  return c.json(ok({ token, user: userWithCounters }));
});

auth.post(
  "/forgotpassword",
  zValidator("json", forgotPasswordSchema),
  async (c) => {
    const { email } = c.req.valid("json");
    const data = await authService.forgotPasswordService(email);
    return c.json(ok(data));
  },
);

auth.put(
  "/resetpassword",
  zValidator("json", resetPasswordSchema),
  async (c) => {
    const { resetPasswordToken } = c.req.query();
    const { password } = c.req.valid("json");
    const data = await authService.resetPasswordService(
      resetPasswordToken,
      password,
    );
    return c.json(ok(data));
  },
);

auth.put(
  "/edit",
  authMiddleware,
  zValidator("json", editUserSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const user = await authService.editUserService(body, userId);
    return c.json(ok(user));
  },
);

auth.post(
  "/validateEmail",
  authMiddleware,
  zValidator("json", validateEmailSchema),
  async (c) => {
    const { email } = c.req.valid("json");
    const data = await authService.validateEmailService(email);
    return c.json(ok(data));
  },
);

auth.put("/verifyAccount", async (c) => {
  const { verificationToken } = c.req.query();
  const data = await authService.verifyAccountService(verificationToken);
  return c.json(ok(data));
});

// ─── Steam OpenID ─────────────────────────────────────────────────────────────

auth.get("/steam", (c) => {
  const loginUrl = buildSteamLoginUrl();
  return c.redirect(loginUrl);
});

auth.get("/steam/callback", async (c) => {
  try {
    const query = c.req.query() as Record<string, string>;
    const steamId = await verifySteamCallback(query);
    const user = await steamLoginOrRegister(steamId);
    const token = user.generateJwtFromUser();
    const userWithCounters = await withUserCounters(user);
    const encoded = encodeURIComponent(
      JSON.stringify({ token, user: userWithCounters }),
    );
    return c.redirect(`${env.FRONTEND_URL}/steam-callback?data=${encoded}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Steam auth failed";
    return c.redirect(
      `${env.FRONTEND_URL}/steam-callback?error=${encodeURIComponent(message)}`,
    );
  }
});

auth.post("/steam/link", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const query = c.req.query() as Record<string, string>;

  // Accept steamId directly (from a prior auth flow) or re-verify via OpenID params
  let steamId: string;
  if (query.steamId) {
    steamId = query.steamId;
  } else {
    steamId = await verifySteamCallback(query);
  }

  await linkSteamAccount(userId, steamId);
  return c.json(ok({ message: "Steam account linked successfully" }));
});

// ─── Steam Account Linking from Profile ──────────────────────────────────────

auth.get("/steam/link/init", async (c) => {
  const { token } = c.req.query();
  if (!token) return c.json({ success: false, error: "Missing token" }, 400);

  try {
    verifyToken(token);
  } catch {
    return c.json({ success: false, error: "Invalid or expired token" }, 401);
  }

  const linkCallbackUrl = `${env.STEAM_REALM}/api/auth/steam/link/callback?jwt=${encodeURIComponent(token)}`;
  const loginUrl = buildSteamLoginUrl(linkCallbackUrl);
  return c.redirect(loginUrl);
});

auth.get("/steam/link/callback", async (c) => {
  const query = c.req.query() as Record<string, string>;
  const { jwt: token } = query;

  try {
    if (!token) throw new Error("Missing token");
    const payload = verifyToken(token);
    const steamId = await verifySteamCallback(query);
    await linkSteamAccount(payload.id, steamId);
    return c.redirect(`${env.FRONTEND_URL}/profile?steamLinked=true`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Steam link failed";
    return c.redirect(
      `${env.FRONTEND_URL}/profile?steamError=${encodeURIComponent(message)}`,
    );
  }
});

auth.delete("/steam/unlink", authMiddleware, async (c) => {
  const userId = c.get("userId");
  await unlinkSteamAccount(userId);
  return c.json(ok({ message: "Steam account unlinked successfully" }));
});

export default auth;
