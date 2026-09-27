import { schema } from "@my-games/db";
import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import { addEntry } from "../src/library";
import { compareUsers, globalStats, userStats, wrapped, wrappedYears } from "../src/stats";
import { createGame, createUser } from "./factories";

describe("stats", () => {
  it("aggregates a user's library", async () => {
    const owner = await createUser();
    const [a, b, c] = await Promise.all([
      createGame({ releaseDate: "2019-03-22", timeToBeatNormally: 36_000 }),
      createGame({ releaseDate: "2019-10-01" }),
      createGame({ releaseDate: "2022-02-25", timeToBeatNormally: 72_000 }),
    ]);
    const genre = await db
      .insert(schema.terms)
      .values({ kind: "genre", igdbId: 31, name: "Adventure", slug: "adventure-31" })
      .returning();
    await db.insert(schema.gameTerms).values([
      { gameId: a?.id ?? "", termId: genre[0]?.id ?? 0 },
      { gameId: b?.id ?? "", termId: genre[0]?.id ?? 0 },
    ]);

    await addEntry(owner.id, {
      gameId: a?.id ?? "",
      status: "completed",
      rating: 91,
      platform: "pc",
      store: "steam",
      playtimeManualMin: 1500,
      finishedAt: "2024-05-25",
    });
    await addEntry(owner.id, {
      gameId: b?.id ?? "",
      status: "dropped",
      rating: 40,
      platform: "pc",
      playtimeManualMin: 60,
    });
    await addEntry(owner.id, { gameId: c?.id ?? "", status: "backlog" });

    const stats = await userStats(owner.id);
    expect(stats.totals).toMatchObject({
      games: 3,
      completed: 1,
      playtimeMin: 1560,
      rated: 2,
      averageRating: 66,
    });
    expect(stats.status.map((bucket) => bucket.key).sort()).toEqual([
      "backlog",
      "completed",
      "dropped",
    ]);
    expect(stats.platform).toEqual([{ key: "pc", count: 2, playtimeMin: 1560 }]);
    expect(stats.terms.genres).toEqual([
      { key: "Adventure", count: 2, playtimeMin: 1560, averageRating: 66 },
    ]);
    expect(stats.releaseYears).toEqual([
      { key: "2019", count: 2 },
      { key: "2022", count: 1 },
    ]);
    expect(stats.ratings).toEqual([
      { key: "4", count: 1 },
      { key: "9", count: 1 },
    ]);
    expect(stats.completions).toEqual([{ key: "2024", count: 1 }]);
    expect(stats.topPlayed[0]?.playtimeMin).toBe(1500);
    expect(stats.backlog).toEqual({ count: 1, estimated: 1, timeToBeatMin: 1200 });

    const global = await globalStats();
    expect(global.totals).toMatchObject({ entries: 3, completed: 1 });
  });

  it("compares two users and scores taste compatibility", async () => {
    const kadir = await createUser();
    const mustafa = await createUser();
    const games = await Promise.all(Array.from({ length: 5 }, () => createGame()));
    const ratings: Array<[number, number]> = [
      [95, 90],
      [80, 85],
      [60, 55],
      [30, 40],
      [90, 20],
    ];
    for (const [index, [a, b]] of ratings.entries()) {
      await addEntry(kadir.id, { gameId: games[index]?.id ?? "", status: "completed", rating: a });
      await addEntry(mustafa.id, {
        gameId: games[index]?.id ?? "",
        status: index === 4 ? "dropped" : "completed",
        rating: b,
      });
    }
    const only = await createGame();
    await addEntry(kadir.id, { gameId: only.id, status: "backlog" });

    const result = await compareUsers(kadir.id, mustafa.id);
    expect(result.counts).toEqual({
      shared: 5,
      onlyA: 1,
      onlyB: 0,
      bothCompleted: 4,
      ratedTogether: 5,
    });
    expect(result.disagreements[0]?.a.rating).toBe(90);
    expect(result.disagreements[0]?.b.rating).toBe(20);
    expect(result.compatibility).toBeGreaterThan(50);
    expect(result.compatibility).toBeLessThan(100);
  });

  it("builds a year in review from completions and sessions", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      rating: 88,
      finishedAt: "2025-11-02",
    });
    await db.insert(schema.playSessions).values([
      {
        userId: owner.id,
        gameId: game.id,
        entryId: entry.id,
        source: "steam_delta",
        startedAt: new Date("2025-11-01T18:00:00Z"),
        endedAt: new Date("2025-11-01T20:00:00Z"),
        durationMin: 120,
      },
      {
        userId: owner.id,
        gameId: game.id,
        entryId: entry.id,
        source: "steam_delta",
        startedAt: new Date("2025-03-01T18:00:00Z"),
        endedAt: new Date("2025-03-01T19:00:00Z"),
        durationMin: 60,
      },
    ]);

    const result = await wrapped(owner.id, 2025);
    expect(result).toMatchObject({
      finishedCount: 1,
      averageRating: 88,
      playedMinutes: 180,
      playedDays: 2,
      playedGames: 1,
    });
    expect(result.busiestMonth).toEqual({ month: 11, minutes: 120 });
    expect(await wrappedYears(owner.id)).toEqual([2025]);
  });
});
