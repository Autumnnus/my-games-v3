import { schema } from "@my-games/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db";
import { addEntry } from "../src/library";
import { listProposals, resolveProposal, setRule } from "../src/proposals";
import { linkSteamAccount } from "../src/steam/accounts";
import { pollPresence } from "../src/steam/presence";
import { syncSteamUser } from "../src/steam/sync";
import { createGame, createUser, json, mockFetch } from "./factories";

const STEAM_ID = "76561197960435530";

type Owned = {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_2weeks?: number;
  rtime_last_played?: number;
};

let owned: Owned[] = [];
let privateProfile = false;
let playing: { gameid?: string; gameextrainfo?: string } = {};
let fetchMock: ReturnType<typeof mockFetch>;

beforeEach(() => {
  process.env.STEAM_API_KEY = "steam-key";
  owned = [];
  privateProfile = false;
  playing = {};
  fetchMock = mockFetch([
    {
      match: (url) => url.includes("IPlayerService/GetOwnedGames"),
      respond: () =>
        json({ response: privateProfile ? {} : { game_count: owned.length, games: owned } }),
    },
    {
      match: (url) => url.includes("ISteamUser/GetPlayerSummaries"),
      respond: () =>
        json({
          response: {
            players: [
              {
                steamid: STEAM_ID,
                personaname: "kadir",
                profileurl: "https://steamcommunity.com/id/kadir",
                communityvisibilitystate: 3,
                ...playing,
              },
            ],
          },
        }),
    },
  ]);
});

afterEach(() => {
  fetchMock.restore();
  delete process.env.STEAM_API_KEY;
});

async function entries(userId: string) {
  return db
    .select({ entry: schema.libraryEntries, game: schema.games })
    .from(schema.libraryEntries)
    .innerJoin(schema.games, eq(schema.games.id, schema.libraryEntries.gameId))
    .where(eq(schema.libraryEntries.userId, userId));
}

async function sessions(userId: string) {
  return db.select().from(schema.playSessions).where(eq(schema.playSessions.userId, userId));
}

describe("steam sync", () => {
  it("links legacy entries, raises conflicts, proposes new games and records sessions later", async () => {
    const owner = await createUser();
    const legacy = await createGame({ source: "legacy", name: "Sekiro: Shadows Die Twice" });
    await addEntry(owner.id, { gameId: legacy.id, status: "completed", playtimeManualMin: 1500 });
    await linkSteamAccount(owner.id, STEAM_ID);

    owned = [
      {
        appid: 814380,
        name: "Sekiro™: Shadows Die Twice",
        playtime_forever: 1560,
        rtime_last_played: 1716000000,
      },
      { appid: 1145360, name: "Hades", playtime_forever: 600, rtime_last_played: 1716100000 },
      { appid: 10, name: "Counter-Strike", playtime_forever: 0 },
    ];
    const first = await syncSteamUser(owner.id);
    expect(first).toMatchObject({
      stats: { linkedLegacy: 1, conflicts: 1, newGames: 1, sessions: 0 },
      pending: 2,
    });

    const [linked] = await db.select().from(schema.games).where(eq(schema.games.id, legacy.id));
    expect(linked?.steamAppId).toBe(814380);

    const pending = await listProposals(owner.id);
    expect(pending.map((proposal) => proposal.kind).sort()).toEqual([
      "new_game",
      "playtime_conflict",
    ]);
    const conflict = pending.find((proposal) => proposal.kind === "playtime_conflict");
    await resolveProposal(owner.id, conflict?.id ?? "", "approve", { choice: "use_steam" });

    let [sekiro] = (await entries(owner.id)).filter((row) => row.game.steamAppId === 814380);
    expect(sekiro?.entry).toMatchObject({ playtimeManualMin: 0, playtimeSteamMin: 1560 });

    // İkinci sync: Sekiro'da +60 dk → otomatik süre güncellemesi ve bir oturum.
    owned = owned.map((game) =>
      game.appid === 814380 ? { ...game, playtime_forever: 1620 } : game,
    );
    const second = await syncSteamUser(owner.id);
    expect(second).toMatchObject({ stats: { updated: 1, sessions: 1, newGames: 0 } });
    [sekiro] = (await entries(owner.id)).filter((row) => row.game.steamAppId === 814380);
    expect(sekiro?.entry.playtimeSteamMin).toBe(1620);
    expect((await sessions(owner.id)).map((session) => session.durationMin)).toEqual([60]);

    const events = await db
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.type, "playtime.recorded"));
    expect(events).toHaveLength(1);

    // Üçüncü sync: değişiklik yok → yeni oturum yok.
    await syncSteamUser(owner.id);
    expect(await sessions(owner.id)).toHaveLength(1);

    // Onay bekleyen yeni oyun oynanmaya devam ederse öneri güncellenir, oturum oyuna yazılır.
    owned = owned.map((game) =>
      game.appid === 1145360 ? { ...game, playtime_forever: 630 } : game,
    );
    await syncSteamUser(owner.id);
    const [newGame] = (await listProposals(owner.id)).filter(
      (proposal) => proposal.kind === "new_game",
    );
    expect(
      (newGame?.payload as { fields: { playtimeSteamMin: number } } | undefined)?.fields
        .playtimeSteamMin,
    ).toBe(630);
    const recorded = await sessions(owner.id);
    expect(recorded.map((session) => session.durationMin).sort()).toEqual([30, 60]);
    // Son oynama zamanı son sync'ten eski olsa da oturum ters (bitişten sonra başlayan) olmaz.
    expect(recorded.every((session) => session.startedAt <= session.endedAt)).toBe(true);

    // Steam'in son oynama zamanıyla gelen yeni oyun onaylanabilir (jsonb'deki tarih geri çevrilir).
    await resolveProposal(owner.id, newGame?.id ?? "", "approve");
    const [hades] = (await entries(owner.id)).filter((row) => row.game.steamAppId === 1145360);
    expect(hades?.entry).toMatchObject({ playtimeSteamMin: 630, store: "steam" });
    expect(hades?.entry.lastPlayedAt?.getTime()).toBe(1716100000 * 1000);
  });

  it("does not double count sessions while playtime updates wait for approval", async () => {
    const owner = await createUser();
    const game = await createGame({ steamAppId: 620, name: "Portal 2" });
    await addEntry(owner.id, { gameId: game.id, status: "playing" });
    await setRule(owner.id, "steam", "playtime", "ask");
    await linkSteamAccount(owner.id, STEAM_ID);

    owned = [{ appid: 620, name: "Portal 2", playtime_forever: 100 }];
    await syncSteamUser(owner.id);
    owned = [{ appid: 620, name: "Portal 2", playtime_forever: 160 }];
    await syncSteamUser(owner.id);
    owned = [{ appid: 620, name: "Portal 2", playtime_forever: 200 }];
    await syncSteamUser(owner.id);

    expect((await sessions(owner.id)).map((session) => session.durationMin).sort()).toEqual([
      40, 60,
    ]);
    const pending = (await listProposals(owner.id)).filter(
      (proposal) => proposal.kind === "playtime",
    );
    expect(pending).toHaveLength(1);
    const [row] = await entries(owner.id);
    expect(row?.entry.playtimeSteamMin).toBeNull();
  });

  it("suggests resuming backlog games that get played", async () => {
    const owner = await createUser();
    const game = await createGame({ steamAppId: 400, name: "Portal" });
    await addEntry(owner.id, { gameId: game.id, status: "backlog" });
    await linkSteamAccount(owner.id, STEAM_ID);
    owned = [{ appid: 400, name: "Portal", playtime_forever: 10 }];
    await syncSteamUser(owner.id);
    owned = [{ appid: 400, name: "Portal", playtime_forever: 70 }];
    await syncSteamUser(owner.id);
    const [suggestion] = (await listProposals(owner.id)).filter(
      (proposal) => proposal.kind === "status",
    );
    expect(suggestion?.payload).toMatchObject({
      changes: [{ field: "status", from: "backlog", to: "playing" }],
    });
  });

  it("records a private profile error without throwing", async () => {
    const owner = await createUser();
    await linkSteamAccount(owner.id, STEAM_ID);
    privateProfile = true;
    const result = await syncSteamUser(owner.id);
    expect(result).toMatchObject({ error: "private" });
    const [account] = await db
      .select()
      .from(schema.steamAccounts)
      .where(eq(schema.steamAccounts.userId, owner.id));
    expect(account?.lastSyncError).toBe("private");
  });

  it("rejects linking a Steam account that belongs to someone else", async () => {
    const first = await createUser();
    const second = await createUser();
    await linkSteamAccount(first.id, STEAM_ID);
    await expect(linkSteamAccount(second.id, STEAM_ID)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("steam presence", () => {
  it("tracks the current game and requests a sync when it stops", async () => {
    const owner = await createUser();
    await linkSteamAccount(owner.id, STEAM_ID);
    await db.delete(schema.outbox);

    playing = { gameid: "814380", gameextrainfo: "Sekiro" };
    expect(await pollPresence()).toMatchObject({ checked: 1, changed: 1 });
    let [account] = await db
      .select()
      .from(schema.steamAccounts)
      .where(eq(schema.steamAccounts.userId, owner.id));
    expect(account).toMatchObject({ currentAppId: 814380, currentGameName: "Sekiro" });

    expect(await pollPresence()).toMatchObject({ changed: 0 });

    playing = {};
    await pollPresence();
    [account] = await db
      .select()
      .from(schema.steamAccounts)
      .where(eq(schema.steamAccounts.userId, owner.id));
    expect(account?.currentAppId).toBeNull();
    const requested = await db
      .select()
      .from(schema.outbox)
      .where(and(eq(schema.outbox.type, "steam.sync_requested")));
    expect(requested).toHaveLength(1);
  });
});
