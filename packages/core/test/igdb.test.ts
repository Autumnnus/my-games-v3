import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importIgdbGame, searchCatalog } from "../src/catalog";
import { db } from "../src/db";
import { resetIgdbTokenCache, sanitizeSearch } from "../src/igdb/client";
import { mapIgdbGame } from "../src/igdb/games";
import { matchUnlinkedGames } from "../src/matching";
import { createGame, json, mockFetch } from "./factories";

const sekiro = {
  id: 113112,
  name: "Sekiro: Shadows Die Twice",
  slug: "sekiro-shadows-die-twice",
  summary: "Carve your own clever path to vengeance.",
  first_release_date: 1553212800,
  cover: { image_id: "co2a23" },
  genres: [{ id: 31, name: "Adventure" }],
  themes: [{ id: 1, name: "Action" }],
  game_modes: [{ id: 1, name: "Single player" }],
  player_perspectives: [{ id: 2, name: "Third person" }],
  involved_companies: [
    { company: { id: 1210, name: "FromSoftware" }, developer: true, publisher: false },
    { company: { id: 248, name: "Activision" }, developer: false, publisher: true },
  ],
  game_type: 0,
  total_rating: 89.4,
  total_rating_count: 1200,
  external_games: [
    { uid: "sekiro-gog", external_game_source: 5 },
    { uid: "814380", external_game_source: 1 },
  ],
};

let fetchMock: ReturnType<typeof mockFetch>;
let tokenRequests = 0;

beforeEach(() => {
  process.env.IGDB_CLIENT_ID = "client";
  process.env.IGDB_CLIENT_SECRET = "secret";
  resetIgdbTokenCache();
  tokenRequests = 0;
  fetchMock = mockFetch([
    {
      match: (url) => url.startsWith("https://id.twitch.tv/oauth2/token"),
      respond: () => {
        tokenRequests++;
        return json({
          access_token: `token-${tokenRequests}`,
          expires_in: 5_000_000,
          token_type: "bearer",
        });
      },
    },
    {
      match: (url) => url === "https://api.igdb.com/v4/multiquery",
      respond: () =>
        json([
          { name: "game", result: [sekiro] },
          {
            name: "ttb",
            result: [{ game_id: sekiro.id, hastily: 72000, normally: 108000, completely: 216000 }],
          },
        ]),
    },
    {
      match: (url) => url === "https://api.igdb.com/v4/games",
      respond: () => json([sekiro]),
    },
    {
      match: (url) => url === "https://api.igdb.com/v4/external_games",
      respond: () => json([{ game: sekiro.id }]),
    },
  ]);
});

afterEach(() => {
  fetchMock.restore();
  delete process.env.IGDB_CLIENT_ID;
  delete process.env.IGDB_CLIENT_SECRET;
});

describe("igdb", () => {
  it("maps IGDB games to catalog rows and terms", () => {
    const mapped = mapIgdbGame(sekiro, { game_id: sekiro.id, normally: 108000 });
    expect(mapped.game).toMatchObject({
      igdbId: 113112,
      steamAppId: 814380,
      releaseDate: "2019-03-22",
      gameType: "main_game",
      timeToBeatNormally: 108000,
    });
    expect(mapped.terms).toEqual(
      expect.arrayContaining([
        { kind: "company", igdbId: 1210, name: "FromSoftware", role: "developer" },
        { kind: "company", igdbId: 248, name: "Activision", role: "publisher" },
        { kind: "genre", igdbId: 31, name: "Adventure", role: "" },
      ]),
    );
  });

  it("strips quotes from search input", () => {
    expect(sanitizeSearch(' zelda" ; fields *; where "')).toBe("zelda ; fields *; where");
  });

  it("imports a game once, caching the token in the database", async () => {
    const first = await importIgdbGame(113112);
    const second = await importIgdbGame(113112);
    expect(second.id).toBe(first.id);
    expect(first.slug).toBe("sekiro-shadows-die-twice");
    expect(first.coverImageId).toBe("co2a23");

    const links = await db
      .select()
      .from(schema.gameTerms)
      .where(eq(schema.gameTerms.gameId, first.id));
    expect(links).toHaveLength(6);

    const [token] = await db
      .select()
      .from(schema.appConfig)
      .where(eq(schema.appConfig.key, "igdb_token"));
    expect((token?.value as { accessToken: string } | undefined)?.accessToken).toBe("token-1");
    const igdbCalls = fetchMock.calls.filter((call) => call.url.includes("api.igdb.com"));
    expect(igdbCalls).toHaveLength(1);
    expect(new Headers(igdbCalls[0]?.init?.headers).get("authorization")).toBe("Bearer token-1");
  });

  it("enriches an existing Steam-only game instead of duplicating it", async () => {
    const steamOnly = await createGame({
      source: "steam",
      steamAppId: 814380,
      name: "Sekiro",
      slug: "sekiro",
    });
    const imported = await importIgdbGame(113112);
    expect(imported.id).toBe(steamOnly.id);
    expect(imported.igdbId).toBe(113112);
    expect(imported.slug).toBe("sekiro");
  });

  it("matches unlinked Steam games by app id even when the names differ", async () => {
    const steamOnly = await createGame({
      source: "steam",
      steamAppId: 814380,
      name: "SEKIRO™ GOTY Edition",
      slug: "sekiro-goty",
      coverUrl: "https://example.com/library_600x900.jpg",
    });
    const result = await matchUnlinkedGames(10);
    expect(result.merged).toBe(1);
    const [game] = await db.select().from(schema.games).where(eq(schema.games.id, steamOnly.id));
    expect(game).toMatchObject({ igdbId: 113112, coverImageId: "co2a23", steamAppId: 814380 });
    const searches = fetchMock.calls.filter((call) => call.url === "https://api.igdb.com/v4/games");
    expect(searches).toHaveLength(0);
  });

  it("refreshes the token once on 401", async () => {
    fetchMock.restore();
    let igdbCalls = 0;
    fetchMock = mockFetch([
      {
        match: (url) => url.startsWith("https://id.twitch.tv"),
        respond: () => {
          tokenRequests++;
          return json({ access_token: `token-${tokenRequests}`, expires_in: 5_000_000 });
        },
      },
      {
        match: (url) => url === "https://api.igdb.com/v4/games",
        respond: () => {
          igdbCalls++;
          return igdbCalls === 1 ? json({ message: "Authorization Failure" }, 401) : json([sekiro]);
        },
      },
    ]);
    const results = await searchCatalog("sekiro");
    expect(results[0]).toMatchObject({
      igdbId: 113112,
      name: "Sekiro: Shadows Die Twice",
      releaseYear: 2019,
    });
    expect(tokenRequests).toBe(2);
  });
});
