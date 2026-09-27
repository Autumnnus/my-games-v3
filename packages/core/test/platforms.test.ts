import { schema } from "@my-games/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gameAchievements } from "../src/achievements";
import { encryptCredentials } from "../src/credentials";
import { db } from "../src/db";
import { addEntry } from "../src/library";
import { getPlatformAccount } from "../src/platforms/accounts";
import { listProposals } from "../src/proposals";
import { buildPsnTitles, linkPsnAccount, parsePsnDuration, syncPsnUser } from "../src/psn/sync";
import { completeXboxLink, createXboxState, verifyXboxState } from "../src/xbox/auth";
import { syncXboxUser } from "../src/xbox/sync";
import { createGame, createUser, json, mockFetch } from "./factories";

const NPSSO = "a".repeat(64);
const recent = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();

let fetchMock: ReturnType<typeof mockFetch> | undefined;

beforeEach(() => {
  process.env.CREDENTIALS_SECRET = "test-credentials-secret";
  process.env.XBOX_CLIENT_ID = "xbox-client";
  process.env.XBOX_CLIENT_SECRET = "xbox-secret";
});

afterEach(() => {
  fetchMock?.restore();
  fetchMock = undefined;
  delete process.env.CREDENTIALS_SECRET;
  delete process.env.XBOX_CLIENT_ID;
  delete process.env.XBOX_CLIENT_SECRET;
});

async function entriesOf(userId: string) {
  return db
    .select({ entry: schema.libraryEntries, game: schema.games })
    .from(schema.libraryEntries)
    .innerJoin(schema.games, eq(schema.games.id, schema.libraryEntries.gameId))
    .where(eq(schema.libraryEntries.userId, userId));
}

const trophy = (
  id: string,
  name: string,
  earned: number,
  defined: number,
  service: "trophy" | "trophy2" = "trophy2",
) => ({
  npServiceName: service,
  npCommunicationId: id,
  trophySetVersion: "01.00",
  trophyTitleName: name,
  trophyTitleIconUrl: `https://psn/${id}.png`,
  trophyTitlePlatform: service === "trophy2" ? "PS5" : "PS3",
  hasTrophyGroups: false,
  definedTrophies: { bronze: defined, silver: 0, gold: 0, platinum: 0 },
  earnedTrophies: { bronze: earned, silver: 0, gold: 0, platinum: 0 },
  progress: 0,
  hiddenFlag: false,
  lastUpdatedDateTime: recent,
});

function psnMock(state: { tokenError?: boolean } = {}) {
  return mockFetch([
    {
      match: (url) => url.includes("/oauth/authorize"),
      respond: () =>
        new Response(null, {
          status: 302,
          headers: { location: "com.scee.psxandroid.scecompcall://redirect/?code=v3.CODE&cid=x" },
        }),
    },
    {
      match: (url) => url.includes("/oauth/token"),
      respond: () =>
        state.tokenError
          ? json({ error: "invalid_grant" }, 400)
          : json({
              access_token: "psn-access",
              expires_in: 3600,
              id_token: "id",
              refresh_token: "psn-refresh-secret",
              refresh_token_expires_in: 5_184_000,
              scope: "psn:mobile.v2.core psn:clientapp",
              token_type: "bearer",
            }),
    },
    {
      match: (url) => url.includes("/userProfile/v1/internal/users/me/profiles"),
      respond: () =>
        json({
          onlineId: "kadir_psn",
          avatars: [{ size: "xl", url: "https://psn/avatar.png" }],
          isMe: true,
        }),
    },
    {
      match: (url) => url.includes("/userProfile/v1/users/kadir_psn/profile2"),
      respond: () => json({ profile: { onlineId: "kadir_psn", accountId: "1234567890" } }),
    },
    {
      match: (url) => url.includes("/gamelist/v2/users/me/titles"),
      respond: () =>
        json({
          titles: [
            {
              titleId: "PPSA04609_00",
              name: "ELDEN RING™",
              localizedName: "ELDEN RING™",
              imageUrl: "https://psn/er.png",
              category: "ps5_native_game",
              playCount: 20,
              concept: {
                id: 10001,
                titleIds: ["PPSA04609_00", "CUSA18333_00"],
                name: "ELDEN RING",
              },
              firstPlayedDateTime: recent,
              lastPlayedDateTime: recent,
              playDuration: "PT10H30M15S",
            },
          ],
          totalItemCount: 1,
        }),
    },
    {
      match: (url) => url.includes("/trophy/v1/users/me/trophyTitles"),
      respond: () =>
        json({
          trophyTitles: [
            trophy("NPWR20000_00", "ELDEN RING", 2, 3),
            trophy("NPWR00001_00", "Demon's Souls", 1, 5, "trophy"),
          ],
          totalItemCount: 2,
        }),
    },
    {
      match: (url) =>
        url.includes(
          "/trophy/v1/users/me/npCommunicationIds/NPWR20000_00/trophyGroups/all/trophies",
        ),
      respond: () =>
        json({
          trophySetVersion: "01.00",
          hasTrophyGroups: false,
          lastUpdatedDateTime: recent,
          totalItemCount: 3,
          trophies: [
            {
              trophyId: 0,
              trophyHidden: false,
              earned: true,
              earnedDateTime: recent,
              trophyType: "platinum",
              trophyEarnedRate: "4.1",
            },
            {
              trophyId: 1,
              trophyHidden: false,
              earned: true,
              earnedDateTime: recent,
              trophyType: "bronze",
              trophyEarnedRate: "80.0",
            },
            {
              trophyId: 2,
              trophyHidden: true,
              earned: false,
              trophyType: "gold",
              trophyEarnedRate: "10.0",
            },
          ],
        }),
    },
    {
      match: (url) =>
        url.includes("/trophy/v1/npCommunicationIds/NPWR20000_00/trophyGroups/all/trophies"),
      respond: (_url, init) => {
        const turkish = (init?.headers as Record<string, string>)?.["Accept-Language"] === "tr-TR";
        return json({
          trophySetVersion: "01.00",
          hasTrophyGroups: false,
          totalItemCount: 3,
          trophies: [
            {
              trophyId: 0,
              trophyHidden: false,
              trophyType: "platinum",
              trophyName: turkish ? "Elden Lordu" : "Elden Lord",
              trophyDetail: "All",
              trophyIconUrl: "https://psn/t0.png",
            },
            {
              trophyId: 1,
              trophyHidden: false,
              trophyType: "bronze",
              trophyName: "Roundtable",
              trophyDetail: "Arrive",
              trophyIconUrl: "https://psn/t1.png",
            },
            {
              trophyId: 2,
              trophyHidden: true,
              trophyType: "gold",
              trophyName: "Secret",
              trophyDetail: "Spoiler",
              trophyIconUrl: "https://psn/t2.png",
            },
          ],
        });
      },
    },
  ]);
}

describe("psn", () => {
  it("parses play durations and merges versions of the same game", () => {
    expect(parsePsnDuration("PT228H56M33S")).toBe(228 * 60 + 56);
    expect(parsePsnDuration("P1DT2H")).toBe(26 * 60);
    expect(parsePsnDuration("garbage")).toBeNull();

    const base = {
      name: "Ghost of Tsushima",
      localizedName: "Ghost of Tsushima",
      imageUrl: "",
      localizedImageUrl: "",
      category: "ps4_game",
      service: "none",
      playCount: 1,
      media: {},
      concept: {
        id: 7,
        titleIds: [],
        name: "Ghost of Tsushima",
        media: { audios: [], videos: [], images: [] },
      },
      firstPlayedDateTime: recent,
    };
    const { titles } = buildPsnTitles(
      [
        {
          ...base,
          titleId: "CUSA1",
          lastPlayedDateTime: "2024-01-01T00:00:00Z",
          playDuration: "PT10H",
        },
        { ...base, titleId: "PPSA1", lastPlayedDateTime: recent, playDuration: "PT5H" },
      ],
      [],
    );
    expect(titles).toHaveLength(1);
    expect(titles[0]).toMatchObject({
      externalId: "concept:7",
      playtimeMin: 900,
      recentlyPlayed: true,
    });
  });

  it("links an account with NPSSO without storing tokens in plain text", async () => {
    const owner = await createUser();
    fetchMock = psnMock();
    await linkPsnAccount(owner.id, NPSSO);
    const account = await getPlatformAccount(owner.id, "psn");
    expect(account).toMatchObject({ externalId: "1234567890", displayName: "kadir_psn" });
    expect(account?.credentials).not.toContain("psn-refresh-secret");
    expect(account?.credentials.startsWith("v1:")).toBe(true);
    await expect(linkPsnAccount(owner.id, "short")).rejects.toMatchObject({ code: "invalid" });
  });

  it("syncs playtime and trophies, linking existing entries by name", async () => {
    const owner = await createUser();
    const legacy = await createGame({ source: "legacy", name: "Elden Ring" });
    await addEntry(owner.id, { gameId: legacy.id, status: "playing" });
    fetchMock = psnMock();
    await linkPsnAccount(owner.id, NPSSO);

    const result = await syncPsnUser(owner.id);
    expect(result).toMatchObject({ skipped: false, stats: { newGames: 1, achievements: 1 } });

    const rows = await entriesOf(owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entry).toMatchObject({
      playtimePsnMin: 630,
      achievementsUnlocked: 2,
      achievementsTotal: 3,
    });
    const [set] = await gameAchievements({
      gameId: legacy.id,
      userId: owner.id,
      locale: "tr",
      providers: ["psn"],
    });
    expect(set).toMatchObject({ provider: "psn", total: 3, unlocked: 2 });
    expect(set?.items.find((item) => item.apiName === "0")).toMatchObject({
      name: "Elden Lordu",
      grade: "platinum",
      rarity: 4.1,
    });
    expect(set?.items.find((item) => item.apiName === "2")).toMatchObject({
      name: "",
      hidden: true,
    });

    // Oynanan listesinde olmayan (PS3) kupa başlığı yeni oyun olarak önerilir; süre bilinmez.
    const [proposal] = (await listProposals(owner.id)).filter((row) => row.kind === "new_game");
    expect(proposal?.payload).toMatchObject({
      game: { name: "Demon's Souls", provider: "psn" },
      fields: { platform: "playstation", playtimePsnMin: null },
    });
  });

  it("asks the user to reconnect when the refresh token is rejected", async () => {
    const owner = await createUser();
    fetchMock = psnMock();
    await linkPsnAccount(owner.id, NPSSO);
    await db
      .update(schema.platformAccounts)
      .set({
        credentials: encryptCredentials({
          accessToken: "old",
          accessExpiresAt: Date.now() - 1000,
          refreshToken: "expired",
        }),
      })
      .where(eq(schema.platformAccounts.userId, owner.id));
    fetchMock.restore();
    fetchMock = psnMock({ tokenError: true });

    expect(await syncPsnUser(owner.id)).toMatchObject({ error: "reauth" });
    expect(await getPlatformAccount(owner.id, "psn")).toMatchObject({ needsReauth: true });
    expect(await syncPsnUser(owner.id)).toMatchObject({ skipped: true });
  });
});

function xboxMock() {
  return mockFetch([
    {
      match: (url) => url.startsWith("https://login.live.com/oauth20_token.srf"),
      respond: () =>
        json({ access_token: "ms-access", refresh_token: "ms-refresh", expires_in: 3600 }),
    },
    {
      match: (url) => url.startsWith("https://user.auth.xboxlive.com/user/authenticate"),
      respond: () =>
        json({
          Token: "user-token",
          NotAfter: new Date(Date.now() + 86_400_000).toISOString(),
          DisplayClaims: { xui: [{ uhs: "UHS" }] },
        }),
    },
    {
      match: (url) => url.startsWith("https://xsts.auth.xboxlive.com/xsts/authorize"),
      respond: () =>
        json({
          Token: "xsts-token",
          NotAfter: new Date(Date.now() + 16 * 3600_000).toISOString(),
          DisplayClaims: { xui: [{ uhs: "UHS", xid: "2533274800000000", gtg: "KadirX" }] },
        }),
    },
    {
      match: (url) => url.startsWith("https://profile.xboxlive.com/"),
      respond: () =>
        json({
          profileUsers: [
            { settings: [{ id: "GameDisplayPicRaw", value: "https://xbox/pic.png" }] },
          ],
        }),
    },
    {
      match: (url) => url.startsWith("https://titlehub.xboxlive.com/"),
      respond: () =>
        json({
          xuid: "2533274800000000",
          titles: [
            {
              titleId: "1234",
              name: "Forza Horizon 5",
              type: "Game",
              devices: ["XboxSeries", "PC"],
              displayImage: "https://xbox/fh5.png",
              achievement: { currentAchievements: 1, totalAchievements: 2 },
              titleHistory: { lastTimePlayed: recent },
            },
            { titleId: "9999", name: "Netflix", type: "App", devices: ["XboxOne"] },
          ],
        }),
    },
    {
      match: (url) => url.startsWith("https://userstats.xboxlive.com/batch"),
      respond: () =>
        json({
          statlistscollection: [
            { stats: [{ titleid: "1234", name: "MinutesPlayed", value: "754" }] },
          ],
        }),
    },
    {
      match: (url) => url.startsWith("https://achievements.xboxlive.com/"),
      respond: () =>
        json({
          achievements: [
            {
              id: "1",
              name: "Welcome to Mexico",
              progressState: "Achieved",
              progression: { timeUnlocked: recent },
              mediaAssets: [{ type: "Icon", url: "https://xbox/a1.png" }],
              isSecret: false,
              description: "Start",
              rarity: { currentPercentage: 88.5 },
              rewards: [{ type: "Gamerscore", value: "10" }],
            },
            {
              id: "2",
              name: "Secret",
              progressState: "NotStarted",
              progression: { timeUnlocked: "0001-01-01T00:00:00.0000000Z" },
              isSecret: true,
              description: "",
              lockedDescription: "Hidden",
            },
          ],
        }),
    },
  ]);
}

describe("xbox", () => {
  it("binds the OAuth state to the user and a short lifetime", async () => {
    const state = createXboxState("user-a");
    expect(verifyXboxState(state, "user-a")).toBe(true);
    expect(verifyXboxState(state, "user-b")).toBe(false);
    expect(verifyXboxState(state, "user-a", Date.now() + 11 * 60_000)).toBe(false);
    expect(verifyXboxState(`${state}x`, "user-a")).toBe(false);
  });

  it("links a Microsoft account and syncs Xbox titles, playtime and achievements", async () => {
    const owner = await createUser();
    fetchMock = xboxMock();
    await expect(
      completeXboxLink(owner.id, "code", createXboxState("someone-else")),
    ).rejects.toMatchObject({ code: "forbidden" });
    await completeXboxLink(owner.id, "code", createXboxState(owner.id));
    expect(await getPlatformAccount(owner.id, "xbox")).toMatchObject({
      externalId: "2533274800000000",
      displayName: "KadirX",
      avatarUrl: "https://xbox/pic.png",
    });

    const result = await syncXboxUser(owner.id);
    expect(result).toMatchObject({ skipped: false, stats: { titles: 1, newGames: 1 } });
    const [proposal] = (await listProposals(owner.id)).filter((row) => row.kind === "new_game");
    expect(proposal?.payload).toMatchObject({
      game: { name: "Forza Horizon 5", provider: "xbox", externalId: "1234" },
      fields: { platform: "xbox", store: "xbox", playtimeXboxMin: 754, status: "playing" },
    });
    // Onay bekleyen yeni oyunun başarımları, oyun kütüphaneye girince gelir.
    const achievementRows = await db
      .select()
      .from(schema.userAchievements)
      .where(
        and(
          eq(schema.userAchievements.userId, owner.id),
          eq(schema.userAchievements.provider, "xbox"),
        ),
      );
    expect(achievementRows).toHaveLength(0);
  });
});
