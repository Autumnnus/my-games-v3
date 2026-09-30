import { db } from "@my-games/core/db";
import { schema } from "@my-games/db";
import { hc, type InferResponseType } from "hono/client";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createGame, createUser } from "../../core/test/factories";
import { app } from "../src/index";

// Web istemcisiyle aynı tipli istemci: yanıt tiplerinin `AppType`'tan çıkarıldığını da sınar.
const client = hc<typeof app>("http://localhost", {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => app.request(input, init),
}).api.v1;

// Web'deki `unwrap` gibi: doğrulama hatası gövdesi (`{ error }`) başarılı yanıtın tipinden çıkarılır.
type Ok<T> = Exclude<T, { error: string }>;
type Directory = Ok<InferResponseType<typeof client.users.$get>>;
type Overview = Ok<InferResponseType<(typeof client.users)[":username"]["overview"]["$get"]>>;
type Library = Ok<InferResponseType<(typeof client.users)[":username"]["library"]["$get"]>>;

async function libraryEntry(
  userId: string,
  fields: Partial<typeof schema.libraryEntries.$inferInsert>,
) {
  const game = await createGame({ coverImageId: "cover1" });
  await db
    .insert(schema.libraryEntries)
    .values({ userId, gameId: game.id, status: "backlog", ...fields });
}

describe("public user routes", () => {
  it("lists the directory without banned users and validates the query", async () => {
    const visible = await createUser({ name: "Görünen" });
    await createUser({ name: "Banlı", banned: true });
    await libraryEntry(visible.id, { status: "completed", rating: 90 });

    const response = await client.users.$get({ query: { sort: "games" } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Directory;
    expect(body.nextOffset).toBeNull();
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).toMatchObject({
      id: visible.id,
      games: 1,
      completed: 1,
      averageRating: 90,
      nowPlaying: null,
    });
    expect(body.users[0]?.covers[0]?.coverUrl).toContain("cover1");

    const invalid = await app.request("/api/v1/users?sort=nope");
    expect(invalid.status).toBe(400);
    const tooLong = await app.request(`/api/v1/users?q=${"a".repeat(65)}`);
    expect(tooLong.status).toBe(400);
  });

  it("returns the profile overview with library-shaped items", async () => {
    const owner = await createUser();
    await libraryEntry(owner.id, {
      status: "playing",
      isFavorite: true,
      rating: 75,
      platform: "pc",
    });

    const response = await client.users[":username"].overview.$get({
      param: { username: owner.username ?? "" },
    });
    expect(response.status).toBe(200);
    const overview = (await response.json()) as Overview;
    const library = (await (
      await client.users[":username"].library.$get({
        param: { username: owner.username ?? "" },
        query: {},
      })
    ).json()) as Library;

    expect(overview.recent).toEqual(library.items);
    expect(overview.nowPlaying).toHaveLength(1);
    expect(overview.favorites).toHaveLength(1);
    expect(overview.statusCounts.playing).toBe(1);
    expect(overview.platforms).toEqual([{ platform: "pc", count: 1 }]);
    expect(overview.thisYear.completed).toBe(0);
    expectTypeOf<Overview["recent"][number]>().toEqualTypeOf<Library["items"][number]>();

    const missing = await app.request("/api/v1/users/nobody/overview");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: "not_found", reason: "user_not_found" });
  });
});
