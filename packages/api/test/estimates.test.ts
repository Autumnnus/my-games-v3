import { randomUUID } from "node:crypto";
import { db } from "@my-games/core/db";
import { rebuildPlayEstimates } from "@my-games/core/estimates/build";
import { addEntry } from "@my-games/core/library";
import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createGame } from "../../core/test/factories";
import { auth } from "../src/auth";
import { app } from "../src/index";

const ORIGIN = "http://localhost:3300";
const PASSWORD = "supersecret1";

async function account() {
  const suffix = randomUUID().slice(0, 8);
  const email = `u-${suffix}@example.com`;
  await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: `U ${suffix}`, username: `u_${suffix}` },
  });
  const [row] = await db
    .update(schema.user)
    .set({ emailVerified: true })
    .where(eq(schema.user.email, email))
    .returning({ id: schema.user.id });
  if (!row) throw new Error("kayıt yok");
  const response = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { id: row.id, cookie };
}

const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("origin", ORIGIN);
  headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  return app.request(path, { ...init, headers });
};

describe("play history routes", () => {
  it("is public to read and only the owner can correct it", async () => {
    const owner = await account();
    const other = await account();
    const game = await createGame({ releaseDate: "2015-05-19" });
    const entry = await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      playtimeManualMin: 40 * 60,
      finishedAt: "2020-06-01",
    });
    await rebuildPlayEstimates(owner.id, { ai: false });
    const path = `/api/v1/library/${entry.id}/play-history`;

    const read = await call(path);
    expect(read.status).toBe(200);
    const body = (await read.json()) as { estimate: { planner: string } | null; months: unknown[] };
    expect(body.estimate?.planner).toBe("heuristic");
    expect(body.months.length).toBeGreaterThan(0);

    const periods = JSON.stringify({
      periods: [{ from: "2019-01-01", to: "2019-03-31", intensity: "binge" }],
    });
    expect((await call(path, { method: "PUT", body: periods })).status).toBe(401);
    expect((await call(path, { method: "PUT", body: periods, cookie: other.cookie })).status).toBe(
      403,
    );
    // Dönem yok ve "oyun değil" de denmemiş: doğrulama hatası.
    expect((await call(path, { method: "PUT", body: "{}", cookie: owner.cookie })).status).toBe(
      400,
    );

    const saved = await call(path, { method: "PUT", body: periods, cookie: owner.cookie });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ estimate: { planner: "user" } });

    const reset = await call(path, { method: "DELETE", cookie: owner.cookie });
    expect(await reset.json()).toMatchObject({ estimate: { planner: "heuristic" } });
  });

  it("serves the quick questions only to the signed-in owner", async () => {
    const owner = await account();
    const game = await createGame({ releaseDate: "2014-03-25" });
    const entry = await addEntry(owner.id, {
      gameId: game.id,
      status: "playing",
      playtimeManualMin: 400 * 60,
    });
    await rebuildPlayEstimates(owner.id, { ai: false });

    expect((await call("/api/v1/me/play-history/questions")).status).toBe(401);
    const listed = await call("/api/v1/me/play-history/questions", { cookie: owner.cookie });
    const body = (await listed.json()) as { total: number; questions: Array<{ entryId: string }> };
    expect(body.questions.map((question) => question.entryId)).toEqual([entry.id]);

    const answer = `/api/v1/library/${entry.id}/play-history/answer`;
    const bad = JSON.stringify({ kind: "once", year: 1800 });
    expect((await call(answer, { method: "POST", body: bad, cookie: owner.cookie })).status).toBe(
      400,
    );
    const ok = JSON.stringify({ kind: "once", year: 2016, month: 3 });
    const saved = await call(answer, { method: "POST", body: ok, cookie: owner.cookie });
    expect(await saved.json()).toMatchObject({ estimate: { planner: "user" } });
  });
});
