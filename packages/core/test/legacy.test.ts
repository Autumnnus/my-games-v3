import { existsSync, readFileSync } from "node:fs";
import { schema } from "@my-games/db";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../src/db";
import { resetIgdbTokenCache } from "../src/igdb/client";
import { importLegacyRecords, type LegacyRecord, normalizeLegacyRecord } from "../src/legacy";
import { type MatchCandidate, pickAutoMatch } from "../src/matching";
import { listProposals, resolveProposal } from "../src/proposals";
import { titleSimilarity } from "../src/text";
import { createUser, json, mockFetch } from "./factories";

const dumpDir = new URL("../../../../my-games-old/old_db_data/", import.meta.url);
const hasDumps = existsSync(new URL("kadir_games.json", dumpDir));
const load = (file: string) =>
  JSON.parse(readFileSync(new URL(file, dumpDir), "utf8")) as LegacyRecord[];

afterEach(() => {
  delete process.env.IGDB_CLIENT_ID;
  delete process.env.IGDB_CLIENT_SECRET;
});

describe("legacy normalization", () => {
  it("maps Turkish statuses, platforms, scores and dirty playtimes", () => {
    const record = normalizeLegacyRecord({
      id: "abc",
      gameName: " Sekiro: Shadows Die Twice ",
      gameStatus: "Bitirildi",
      gamePlatform: "Xbox(Pc)",
      gameScore: 9.1,
      gameTotalTime: "7.8",
      gameDate: "2024-05-25",
      gameReview: "  Harika  ",
      gamePhoto: "https://example.com/cover.jpg",
      createdAt: { seconds: 1716738017, nanoseconds: 0 },
      screenshots: [{ ssUrl: "https://steamuserimages-a.akamaihd.net/ugc/1/x", ssName: "" }],
    });
    expect(record).toMatchObject({
      legacyRef: "legacy:abc",
      name: "Sekiro: Shadows Die Twice",
      status: "completed",
      platform: "pc",
      store: "xbox",
      rating: 91,
      playtimeMin: 468,
      finishedAt: "2024-05-25",
      review: "Harika",
      coverUrl: "https://example.com/cover.jpg",
    });
    expect(record.lastPlayedAt?.toISOString()).toBe("2024-05-25T12:00:00.000Z");
    expect(record.createdAt?.toISOString()).toBe("2024-05-26T15:40:17.000Z");
    expect(record.screenshots).toEqual([
      { url: "https://steamuserimages-a.akamaihd.net/ugc/1/x", caption: null },
    ]);
    expect(record.warnings).toHaveLength(1);

    expect(
      normalizeLegacyRecord({
        id: "x",
        gameName: "A",
        gameStatus: "Bırakıldı",
        gameTotalTime: null,
      }),
    ).toMatchObject({ status: "dropped", playtimeMin: 0, finishedAt: null });
  });

  it("scores title similarity", () => {
    expect(titleSimilarity("Dark Souls III", "DARK SOULS 3")).toBe(1);
    expect(titleSimilarity("The Witcher 3: Wild Hunt", "Witcher 3 Wild Hunt")).toBe(1);
    expect(titleSimilarity("Hades", "Hades II")).toBeLessThan(0.92);
    expect(titleSimilarity("Hitman™ III", "Hitman 3")).toBe(1);
  });

  it("picks auto matches only when one candidate clearly wins", () => {
    const candidate = (igdbId: number, name: string, score: number, ratingCount = 0) =>
      ({
        igdbId,
        name,
        score,
        ratingCount,
        coverImageId: null,
        releaseYear: null,
        gameType: null,
      }) satisfies MatchCandidate;
    // Birebir aynı ad, yalnızca benzeyen ada üstün gelir.
    expect(
      pickAutoMatch([
        candidate(1, "BioShock Remastered", 1),
        candidate(2, "BioShock 2 Remastered", 0.95),
      ])?.igdbId,
    ).toBe(1);
    // Aynı adlı port/remaster: oy sayısı açıkça öne çıkan seçilir.
    expect(
      pickAutoMatch([
        candidate(10, "Assassin's Creed II", 1, 30),
        candidate(11, "Assassin's Creed II", 1, 3222),
      ])?.igdbId,
    ).toBe(11);
    // Belirgin fark yoksa karar kullanıcıya kalır.
    expect(
      pickAutoMatch([candidate(20, "Maneater", 1, 5), candidate(21, "Maneater", 1, 3)]),
    ).toBeNull();
    expect(
      pickAutoMatch([candidate(30, "Game One", 0.94), candidate(31, "Game Two", 0.93)]),
    ).toBeNull();
  });
});

describe.skipIf(!hasDumps)("legacy import (real dumps)", () => {
  it("imports Kadir's and Mustafa's games idempotently", async () => {
    const kadir = await createUser({ username: "kadir", displayUsername: "kadir" });
    const mustafa = await createUser({ username: "mustafa", displayUsername: "mustafa" });

    const kadirReport = await importLegacyRecords(kadir.id, load("kadir_games.json"));
    const mustafaReport = await importLegacyRecords(mustafa.id, load("mustafa_games.json"));

    expect(kadirReport.imported).toBe(98);
    expect(kadirReport.screenshots).toBeGreaterThan(0);
    expect(mustafaReport.imported).toBe(262);
    expect(mustafaReport.duplicates).toEqual(["Lego Harry Potter 1-4"]);

    const counts = await db
      .select({ userId: schema.libraryEntries.userId, count: sql<number>`count(*)::int` })
      .from(schema.libraryEntries)
      .groupBy(schema.libraryEntries.userId);
    expect(Object.fromEntries(counts.map((row) => [row.userId, row.count]))).toEqual({
      [kadir.id]: 98,
      [mustafa.id]: 262,
    });

    // Aynı oyunu oynayan iki kişi aynı katalog kaydını paylaşır.
    const [shared] = await db
      .execute<{ count: number }>(sql`
      select count(*)::int as count from (
        select game_id from library_entries group by game_id having count(distinct user_id) = 2
      ) shared
    `)
      .then((result) => result.rows);
    expect(shared?.count).toBeGreaterThan(10);

    const again = await importLegacyRecords(kadir.id, load("kadir_games.json"));
    expect(again.imported).toBe(0);
    expect(again.skippedExisting).toBe(98);

    // Migration akışa düşmez ama outbox'a kaynağıyla birlikte yazılır.
    const [event] = await db.select().from(schema.outbox).limit(1);
    expect((event?.payload as { source: string } | undefined)?.source).toBe("migration");
  });
});

describe("legacy import with IGDB matching", () => {
  it("auto-links confident matches and proposes ambiguous ones", async () => {
    process.env.IGDB_CLIENT_ID = "client";
    process.env.IGDB_CLIENT_SECRET = "secret";
    resetIgdbTokenCache();
    const games: Record<string, Array<{ id: number; name: string; game_type: number }>> = {
      sekiro: [{ id: 113112, name: "Sekiro: Shadows Die Twice", game_type: 0 }],
      hades: [
        { id: 1, name: "Hades II", game_type: 0 },
        { id: 2, name: "Hades: Battle Out of Hell", game_type: 0 },
      ],
    };
    const fetchMock = mockFetch([
      {
        match: (url) => url.startsWith("https://id.twitch.tv"),
        respond: () => json({ access_token: "t", expires_in: 5_000_000 }),
      },
      {
        match: (url) => url === "https://api.igdb.com/v4/games",
        respond: (_url, init) => {
          const body = String(init?.body).toLowerCase();
          return json(body.includes("sekiro") ? games.sekiro : games.hades);
        },
      },
      {
        match: (url) => url === "https://api.igdb.com/v4/multiquery",
        respond: (_url, init) => {
          const id = Number(/where id = (\d+)/.exec(String(init?.body))?.[1]);
          const game = [...(games.sekiro ?? []), ...(games.hades ?? [])].find(
            (item) => item.id === id,
          );
          return json([
            { name: "game", result: game ? [game] : [] },
            { name: "ttb", result: [] },
          ]);
        },
      },
    ]);

    try {
      const owner = await createUser();
      const report = await importLegacyRecords(owner.id, [
        {
          id: "1",
          gameName: "Sekiro: Shadows Die Twice",
          gameStatus: "Bitirildi",
          gamePlatform: "Steam",
        },
        { id: "2", gameName: "Hades", gameStatus: "Bitirildi", gamePlatform: "Steam" },
      ]);
      expect(report).toMatchObject({ imported: 2, autoMatched: 1, pendingMatches: 1 });

      const [pending] = await listProposals(owner.id);
      expect(pending?.kind).toBe("match");
      await resolveProposal(owner.id, pending?.id ?? "", "approve", { choice: "1" });

      const entries = await db
        .select({ name: schema.games.name, igdbId: schema.games.igdbId })
        .from(schema.libraryEntries)
        .innerJoin(schema.games, eq(schema.games.id, schema.libraryEntries.gameId))
        .where(eq(schema.libraryEntries.userId, owner.id));
      expect(entries.map((entry) => entry.igdbId).sort()).toEqual([1, 113112]);
      const legacyLeft = await db
        .select()
        .from(schema.games)
        .where(eq(schema.games.source, "legacy"));
      expect(legacyLeft).toHaveLength(0);
    } finally {
      fetchMock.restore();
    }
  });
});
