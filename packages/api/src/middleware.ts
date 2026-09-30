import { isAdmin } from "@my-games/core/admin/access";
import type { AdminActor } from "@my-games/core/admin/audit";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { auth, type Session, type SessionUser } from "./auth";

export type AppEnv = {
  Variables: {
    user: SessionUser | null;
    session: Session | null;
  };
};

/**
 * Oturum 5 dakika imzalı çerezde önbelleklendiği için silinen/banlanan kullanıcının çerezi o süre boyunca
 * geçerli kalırdı. Admin bir hesabı banlayınca, silince ya da oturumlarını kapatınca bu süreçte kaydedilir:
 * o andan önce açılmış oturumlar anında düşer (tek app süreci; bkz. `rateLimit`).
 */
const revokedAt = new Map<string, number>();
const REVOKE_TTL_MS = 10 * 60_000;

export function revokeUserAccess(userId: string) {
  const now = Date.now();
  revokedAt.set(userId, now);
  for (const [id, at] of revokedAt) if (now - at > REVOKE_TTL_MS) revokedAt.delete(id);
}

function isRevoked(userId: string, sessionCreatedAt: Date | string | undefined) {
  const at = revokedAt.get(userId);
  if (at === undefined) return false;
  if (Date.now() - at > REVOKE_TTL_MS) {
    revokedAt.delete(userId);
    return false;
  }
  return !sessionCreatedAt || new Date(sessionCreatedAt).getTime() <= at;
}

/** Oturumu okur; kullanıcı yoksa `null` bırakır. */
export const withSession = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  const revoked = result ? isRevoked(result.user.id, result.session.createdAt) : false;
  c.set("user", revoked ? null : (result?.user ?? null));
  c.set("session", revoked ? null : (result?.session ?? null));
  await next();
});

/** Oturum zorunlu; yoksa 401, banlıysa 403. `withSession`'dan sonra kullanılır. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (user.banned) return c.json({ error: "banned" }, 403);
  await next();
});

/**
 * Yönetim bölümünün kapısı (bütün `/admin` route'ları bunun arkasında). Rol çerezdeki önbellekten değil her
 * istekte veritabanından okunur. Admin olmayana bölüm yokmuş gibi 404 dönülür; başka kullanıcının yerine
 * geçilmiş (impersonation) oturumlar kabul edilmez. Yanıtlar önbelleğe alınmaz ve indekslenmez.
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  const session = c.get("session");
  const allowed = !!user && !user.banned && !session?.impersonatedBy && (await isAdmin(user.id));
  if (!allowed) return c.json({ error: "not_found" }, 404);
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  await next();
});

/** Admin işlemini yapan (denetim kaydı için). `requireAdmin`'den sonra kullanılır. */
export function adminActor(c: Context<AppEnv>): AdminActor {
  const user = currentUser(c);
  return { id: user.id, name: user.displayUsername ?? user.name, ip: clientIp(c) };
}

export function clientIp(c: Context<AppEnv>) {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

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
