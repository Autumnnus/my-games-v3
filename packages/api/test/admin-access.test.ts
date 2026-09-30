import { randomUUID } from "node:crypto";
import { db } from "@my-games/core/db";
import { writeSetting } from "@my-games/core/settings";
import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auth } from "../src/auth";
import { app } from "../src/index";

const ORIGIN = "http://localhost:3300";
const PASSWORD = "supersecret1";

type Account = { id: string; email: string; username: string; cookie: string };

function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function signIn(email: string) {
  const response = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  return cookieOf(response);
}

/** Gerçek kayıt + giriş: oturum çerezi (5 dk önbellekli) Better Auth'un ürettiği gibidir. */
async function account(role: "admin" | "user" = "user"): Promise<Account> {
  const suffix = randomUUID().slice(0, 8);
  const email = `u-${suffix}@example.com`;
  const username = `u_${suffix}`;
  await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: `U ${suffix}`, username },
  });
  const [row] = await db
    .update(schema.user)
    .set({ emailVerified: true, role })
    .where(eq(schema.user.email, email))
    .returning({ id: schema.user.id });
  if (!row) throw new Error("kayıt yok");
  return { id: row.id, email, username, cookie: await signIn(email) };
}

function call(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("origin", ORIGIN);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return app.request(path, { ...init, headers });
}

/** Uygulamadaki bütün yönetim route'ları (yeni eklenen de otomatik kapsanır). */
const adminRoutes = app.routes
  .filter((route) => route.path.startsWith("/api/v1/admin") && route.method !== "ALL")
  .map((route) => ({
    method: route.method,
    path: route.path.replace(/:id/g, randomUUID()),
  }));

describe("admin gate", () => {
  it("has admin routes only under /api/v1/admin", () => {
    expect(adminRoutes.length).toBeGreaterThan(20);
    const elsewhere = app.routes.filter(
      (route) =>
        /admin/i.test(route.path) &&
        !route.path.startsWith("/api/v1/admin") &&
        route.path !== "/api/auth/admin/*",
    );
    expect(elsewhere).toEqual([]);
  });

  it("answers 404 to anonymous visitors and regular users on every admin route", async () => {
    const regular = await account("user");
    for (const who of [undefined, regular.cookie]) {
      for (const route of adminRoutes) {
        const response = await call(route.path, {
          method: route.method,
          cookie: who,
          body: route.method === "GET" ? undefined : JSON.stringify({}),
        });
        expect(response.status, `${route.method} ${route.path}`).toBe(404);
        expect(await response.json()).toEqual({ error: "not_found" });
      }
    }
  });

  it("lets an admin in without caching the response", async () => {
    const admin = await account("admin");
    const response = await call("/api/v1/admin/overview", { cookie: admin.cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("reads the role from the database on every request, not from the cached session", async () => {
    const admin = await account("admin");
    await db.update(schema.user).set({ role: "user" }).where(eq(schema.user.id, admin.id));
    // Çerezdeki önbellek hâlâ "admin" diyor…
    const me = await (await call("/api/v1/me", { cookie: admin.cookie })).json();
    expect(me.user.role).toBe("admin");
    // …ama kapı veritabanına bakar.
    expect((await call("/api/v1/admin/overview", { cookie: admin.cookie })).status).toBe(404);

    await db
      .update(schema.user)
      .set({ role: "admin", banned: true })
      .where(eq(schema.user.id, admin.id));
    expect((await call("/api/v1/admin/overview", { cookie: admin.cookie })).status).toBe(404);
  });

  it("closes Better Auth's own admin endpoints, even for admins", async () => {
    const admin = await account("admin");
    const regular = await account("user");
    for (const [method, path, body] of [
      ["GET", "/api/auth/admin/list-users", undefined],
      ["POST", "/api/auth/admin/set-role", { userId: regular.id, role: "admin" }],
      ["POST", "/api/auth/admin/impersonate-user", { userId: regular.id }],
      ["POST", "/api/auth/admin/remove-user", { userId: regular.id }],
    ] as const) {
      const response = await call(path, {
        method,
        cookie: admin.cookie,
        body: body ? JSON.stringify(body) : undefined,
      });
      expect(response.status, path).toBe(404);
    }
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, regular.id));
    expect(row?.role).toBe("user");
  });

  it("does not let a user give themselves the admin role", async () => {
    const regular = await account("user");
    await call("/api/auth/update-user", {
      method: "POST",
      cookie: regular.cookie,
      body: JSON.stringify({ role: "admin", banned: false, name: "Hacker" }),
    });
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, regular.id));
    expect(row?.role).toBe("user");
    expect((await call("/api/v1/admin/overview", { cookie: regular.cookie })).status).toBe(404);
  });

  it("rejects cross-site form posts to admin actions", async () => {
    const admin = await account("admin");
    const regular = await account("user");
    const response = await app.request(`/api/v1/admin/users/${regular.id}/ban`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        cookie: admin.cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "reason=x",
    });
    expect(response.status).toBe(403);
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, regular.id));
    expect(row?.banned).toBe(false);
  });
});

describe("admin actions", () => {
  it("cuts a banned user's cached session off immediately and lets them back after unban", async () => {
    const admin = await account("admin");
    const regular = await account("user");
    expect(
      (await (await call("/api/v1/me", { cookie: regular.cookie })).json()).user,
    ).not.toBeNull();

    const banned = await call(`/api/v1/admin/users/${regular.id}/ban`, {
      method: "POST",
      cookie: admin.cookie,
      body: JSON.stringify({ reason: "spam" }),
    });
    expect(banned.status).toBe(200);
    expect((await (await call("/api/v1/me", { cookie: regular.cookie })).json()).user).toBeNull();

    await call(`/api/v1/admin/users/${regular.id}/unban`, { method: "POST", cookie: admin.cookie });
    const fresh = await signIn(regular.email);
    expect((await (await call("/api/v1/me", { cookie: fresh })).json()).user?.id).toBe(regular.id);
  });

  it("refuses to act on another admin through the API", async () => {
    const admin = await account("admin");
    const other = await account("admin");
    const response = await call(`/api/v1/admin/users/${other.id}`, {
      method: "DELETE",
      cookie: admin.cookie,
      body: JSON.stringify({ confirm: other.username }),
    });
    expect(response.status).toBe(403);
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, other.id));
    expect(row).toBeDefined();
  });

  it("deletes an account and its live session", async () => {
    const admin = await account("admin");
    const regular = await account("user");
    const response = await call(`/api/v1/admin/users/${regular.id}`, {
      method: "DELETE",
      cookie: admin.cookie,
      body: JSON.stringify({ confirm: `@${regular.username}` }),
    });
    expect(response.status).toBe(200);
    expect((await (await call("/api/v1/me", { cookie: regular.cookie })).json()).user).toBeNull();
    const audit = await (await call("/api/v1/admin/audit", { cookie: admin.cookie })).json();
    expect(audit.entries[0]).toMatchObject({
      action: "user.delete",
      targetLabel: `@${regular.username}`,
    });
  });

  it("stops new sign-ups when an admin closes them", async () => {
    await writeSetting("auth.signups_open", false);
    const response = await call("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({
        email: "late@example.com",
        password: PASSWORD,
        name: "Late",
        username: "late_comer",
      }),
    });
    // E-posta doğrulaması açıkken Better Auth hesap var/yok bilgisini sızdırmamak için başarısız kayıtta da
    // sahte bir başarı döner; önemli olan hesabın açılmaması. Kayıt sayfası `signupsOpen`'a bakıp formu gizler.
    expect(response.status).toBeLessThan(500);
    const rows = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "late@example.com"));
    expect(rows).toEqual([]);
    const meta = await (await call("/api/v1/meta")).json();
    expect(meta.signupsOpen).toBe(false);
  });
});
