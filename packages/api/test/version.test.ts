import { afterEach, describe, expect, it } from "vitest";

const { app } = await import("../src/index");

const KEYS = ["APP_VERSION", "APP_RELEASED_AT", "APP_COMMIT"] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

async function json(path: string) {
  const response = await app.request(`/api/v1${path}`);
  expect(response.status).toBe(200);
  return (await response.json()) as { version: unknown };
}

describe("release version", () => {
  it("reports the version CI baked into the image", async () => {
    process.env.APP_VERSION = "3";
    process.env.APP_RELEASED_AT = "2026-11-14T18:30:00Z";
    process.env.APP_COMMIT = "c00337d1234567890";
    const expected = { number: 3, releasedAt: "2026-11-14T18:30:00Z", commit: "c00337d" };
    expect((await json("/health")).version).toEqual(expected);
    expect((await json("/meta")).version).toEqual(expected);
  });

  it("reports no number outside CI builds", async () => {
    process.env.APP_VERSION = "";
    expect((await json("/meta")).version).toEqual({
      number: null,
      releasedAt: null,
      commit: null,
    });
  });
});
