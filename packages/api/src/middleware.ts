import { createMiddleware } from "hono/factory";
import { auth, type Session, type SessionUser } from "./auth";

export type AppEnv = {
  Variables: {
    user: SessionUser | null;
    session: Session | null;
  };
};

/** Oturumu okur; kullanıcı yoksa `null` bırakır. */
export const withSession = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", result?.user ?? null);
  c.set("session", result?.session ?? null);
  await next();
});

/** Oturum zorunlu; yoksa 401, banlıysa 403. `withSession`'dan sonra kullanılır. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.banned) return c.json({ error: "banned" }, 403);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("user")?.role !== "admin") return c.json({ error: "forbidden" }, 403);
  await next();
});

/** Oturum zorunlu route'larda kullanıcıyı tipli döner. */
export function currentUser(c: { get: (key: "user") => SessionUser | null }) {
  const user = c.get("user");
  if (!user) throw new Error("requireUser middleware eksik");
  return user;
}

/**
 * Bellek içi, kullanıcı (yoksa IP) başına kayan pencere sınırı. Tek app process'i çalıştığı için yeterli;
 * birden fazla instance'a çıkılırsa Postgres/Redis tabanlı sınırlamaya geçilmeli.
 */
export function rateLimit(name: string, limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return createMiddleware<AppEnv>(async (c, next) => {
    const key =
      c.get("user")?.id ??
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for") ??
      "anon";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      return c.json({ error: "rate_limited", message: `${name}: çok fazla istek` }, 429);
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.delete(hits.keys().next().value as string);
    await next();
  });
}
