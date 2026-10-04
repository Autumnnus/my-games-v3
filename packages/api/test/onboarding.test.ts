import { randomUUID } from "node:crypto";
import { db } from "@my-games/core/db";
import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auth } from "../src/auth";
import { app } from "../src/index";

const ORIGIN = "http://localhost:3300";
const PASSWORD = "supersecret1";

function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function account(role: "admin" | "user" = "user") {
  const suffix = randomUUID().slice(0, 8);
  const email = `o-${suffix}@example.com`;
  await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: `O ${suffix}`, username: `o_${suffix}` },
  });
  const [row] = await db
    .update(schema.user)
    .set({ emailVerified: true, role })
    .where(eq(schema.user.email, email))
    .returning({ id: schema.user.id });
  if (!row) throw new Error("kayıt yok");
  const response = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return { id: row.id, cookie: cookieOf(response) };
}

function call(path: string, cookie: string, method = "GET") {
  return app.request(path, { method, headers: { origin: ORIGIN, cookie } });
}

describe("onboarding api", () => {
  it("starts the guide on signup and records the user's choices", async () => {
    const user = await account();
    const first = await call("/api/v1/me/onboarding", user.cookie);
    expect(first.status).toBe(200);
    const body = (await first.json()) as { onboarding: { welcomed: boolean; steps: unknown[] } };
    expect(body.onboarding.welcomed).toBe(false);
    expect(body.onboarding.steps.length).toBeGreaterThan(0);

    expect((await call("/api/v1/me/onboarding/welcome", user.cookie, "POST")).status).toBe(200);
    expect((await call("/api/v1/me/onboarding/tips/spotlight", user.cookie, "POST")).status).toBe(
      200,
    );
    expect((await call("/api/v1/me/onboarding/tips/nope", user.cookie, "POST")).status).toBe(400);

    const after = (await (await call("/api/v1/me/onboarding", user.cookie)).json()) as {
      onboarding: { welcomed: boolean; seenTips: string[] };
    };
    expect(after.onboarding).toMatchObject({ welcomed: true, seenTips: ["spotlight"] });
  });

  it("returns null for accounts without a guide and requires a session", async () => {
    const user = await account();
    await db.delete(schema.userOnboarding).where(eq(schema.userOnboarding.userId, user.id));
    const response = await call("/api/v1/me/onboarding", user.cookie);
    expect(await response.json()).toEqual({ onboarding: null });
    expect((await call("/api/v1/me/onboarding", "")).status).toBe(401);
  });

  it("lets an admin restart a user's guide", async () => {
    const admin = await account("admin");
    const user = await account();
    await db.delete(schema.userOnboarding).where(eq(schema.userOnboarding.userId, user.id));

    const reset = await call(
      `/api/v1/admin/users/${user.id}/onboarding/reset`,
      admin.cookie,
      "POST",
    );
    expect(reset.status).toBe(200);
    const body = (await (await call("/api/v1/me/onboarding", user.cookie)).json()) as {
      onboarding: unknown;
    };
    expect(body.onboarding).not.toBeNull();

    const forbidden = await call(
      `/api/v1/admin/users/${user.id}/onboarding/reset`,
      user.cookie,
      "POST",
    );
    expect(forbidden.status).toBe(404);
  });
});
