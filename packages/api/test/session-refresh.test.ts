import { createHmac } from "node:crypto";
import { db } from "@my-games/core/db";
import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createUser } from "../../core/test/factories";

const { auth } = await import("../src/auth");
const { app } = await import("../src/index");
const { syncLocale } = await import("../src/locale-sync");

const DAY = 24 * 60 * 60;

/** Girişten `ageDays` gün önce açılmış (ve o günden beri uzatılmamış) bir oturum. */
async function staleSession(ageDays: number) {
  const user = await createUser();
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(user.id);
  const touched = new Date(Date.now() - ageDays * DAY * 1000);
  await db
    .update(schema.session)
    .set({
      updatedAt: touched,
      expiresAt: new Date(touched.getTime() + context.sessionConfig.expiresIn * 1000),
    })
    .where(eq(schema.session.token, session.token));
  const signature = createHmac("sha256", context.secret).update(session.token).digest("base64");
  return {
    token: session.token,
    cookie: `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`,
  };
}

function sessionCookie(setCookies: string[]) {
  return setCookies.find((cookie) => cookie.startsWith("better-auth.session_token="));
}

async function expiresAt(token: string) {
  const [row] = await db.select().from(schema.session).where(eq(schema.session.token, token));
  return row?.expiresAt.getTime() ?? 0;
}

describe("sliding session", () => {
  it("extends an active session and sends the renewed cookie on API requests", async () => {
    const { token, cookie } = await staleSession(3);
    const before = await expiresAt(token);

    const response = await app.request("/api/v1/me/storage", { headers: { cookie } });
    expect(response.status).toBe(200);
    const renewed = sessionCookie(response.headers.getSetCookie());
    expect(renewed).toContain(`Max-Age=${30 * DAY}`);
    expect(await expiresAt(token)).toBeGreaterThan(before);
  });

  it("renews the cookie on page loads too", async () => {
    const { cookie } = await staleSession(3);
    const { setCookies } = await syncLocale(
      new Request("http://localhost:3300/library", {
        headers: { cookie, accept: "text/html" },
      }),
    );
    expect(sessionCookie(setCookies)).toContain(`Max-Age=${30 * DAY}`);
  });

  it("does not rewrite the session cookie on every request", async () => {
    const { cookie } = await staleSession(0);
    const response = await app.request("/api/v1/me/storage", { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(sessionCookie(response.headers.getSetCookie())).toBeUndefined();
  });
});
