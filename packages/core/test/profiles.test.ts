import { schema } from "@my-games/db";
import { describe, expect, it } from "vitest";
import { localToday } from "../src/config";
import { db } from "../src/db";
import { listLibrary } from "../src/library";
import { getProfileOverview, listUsers } from "../src/profiles";
import { createGame, createUser } from "./factories";

type EntryInsert = typeof schema.libraryEntries.$inferInsert;

const base = Date.parse("2026-06-01T12:00:00Z");
/** Tabandan `minutes` dakika sonrası; sıralamalar sabit zamanlarla sınanır. */
const at = (minutes: number) => new Date(base + minutes * 60_000);

/** Yeni bir oyun + kayıt; zamanlar elle verilir (addEntry hep "şimdi"yi yazar). */
async function entry(
  userId: string,
  fields: Partial<EntryInsert> = {},
  game: Partial<typeof schema.games.$inferInsert> = {},
) {
  const created = await createGame(game);
  const [row] = await db
    .insert(schema.libraryEntries)
    .values({ userId, gameId: created.id, status: "backlog", ...fields })
    .returning();
  if (!row) throw new Error("entry insert failed");
  return { entry: row, game: created };
}

describe("user directory", () => {
  it("lists users with summary numbers and hides banned ones", async () => {
    const kadir = await createUser({ name: "Kadir", username: "kadir", displayUsername: "Kadir" });
    const banned = await createUser({ banned: true });
    await entry(kadir.id, { status: "completed", rating: 80, playtimeManualMin: 60 });
    await entry(kadir.id, { status: "playing", rating: 91, playtimeSteamMin: 30 });
    await entry(kadir.id, { status: "backlog" });
    await entry(banned.id, { status: "playing" });
    await db.insert(schema.steamAccounts).values({
      userId: kadir.id,
      steamId: "7656",
      currentAppId: 570,
      currentGameName: "Dota 2",
    });

    const { users, nextOffset } = await listUsers();
    expect(users.map((row) => row.id)).toEqual([kadir.id]);
    expect(nextOffset).toBeNull();
    expect(users[0]).toMatchObject({
      name: "Kadir",
      username: "Kadir",
      games: 3,
      completed: 1,
      playing: 1,
      playtimeMin: 90,
      averageRating: 86,
      nowPlaying: { name: "Dota 2" },
    });
    expect(users[0]?.lastActiveAt).toBeInstanceOf(Date);
  });

  it("returns zeros for users without entries and ignores stale presence", async () => {
    const empty = await createUser();
    await db.insert(schema.steamAccounts).values({
      userId: empty.id,
      steamId: "1",
      syncEnabled: false,
      currentAppId: 570,
      currentGameName: "Dota 2",
    });
    const [row] = (await listUsers()).users;
    expect(row).toMatchObject({
      games: 0,
      completed: 0,
      playing: 0,
      playtimeMin: 0,
      averageRating: null,
      lastActiveAt: null,
      nowPlaying: null,
      covers: [],
    });
  });

  it("searches name, username and display name case-insensitively", async () => {
    const byName = await createUser({ name: "Mustafa Yılmaz" });
    const byUsername = await createUser({ username: "gamer_mus", displayUsername: "Gamer_Mus" });
    await createUser({ name: "Başka Biri", username: "other", displayUsername: "other" });
    await createUser({ name: "100% Real", username: "percent", displayUsername: "percent" });

    const ids = async (q: string) => (await listUsers({ q })).users.map((row) => row.id).sort();
    expect(await ids("  MUS  ")).toEqual([byName.id, byUsername.id].sort());
    expect(await ids("@gamer_")).toEqual([byUsername.id]);
    // `%` ve `_` joker değil, harfiyen aranır.
    expect(await ids("%")).toHaveLength(1);
    expect(await ids("nobody")).toEqual([]);
  });

  it("sorts by activity, library size and join date", async () => {
    const early = await createUser({ createdAt: at(-300) });
    const middle = await createUser({ createdAt: at(-200) });
    const late = await createUser({ createdAt: at(-100) });
    const idle = await createUser({ createdAt: at(-50) });
    // early: iki kayıt, en yeni etkinlik son oynamadan geliyor.
    await entry(early.id, { updatedAt: at(10), lastPlayedAt: at(50) });
    await entry(early.id, { updatedAt: at(5) });
    // middle: üç kayıt, en yeni etkinlik güncellemeden.
    await entry(middle.id, { updatedAt: at(40) });
    await entry(middle.id, { updatedAt: at(1) });
    await entry(middle.id, { updatedAt: at(2) });
    // late: tek kayıt, en eski etkinlik.
    await entry(late.id, { updatedAt: at(0) });

    const order = async (sort: "active" | "games" | "new") =>
      (await listUsers({ sort })).users.map((row) => row.id);
    // Kaydı olmayan (idle) en sona düşer.
    expect(await order("active")).toEqual([early.id, middle.id, late.id, idle.id]);
    expect(await listUsers()).toEqual(await listUsers({ sort: "active" }));
    expect(await order("games")).toEqual([middle.id, early.id, late.id, idle.id]);
    expect(await order("new")).toEqual([idle.id, late.id, middle.id, early.id]);

    const [first] = (await listUsers()).users;
    expect(first?.lastActiveAt?.toISOString()).toBe(at(50).toISOString());
  });

  it("pages 24 users at a time", async () => {
    for (let index = 0; index < 26; index++) await createUser({ createdAt: at(index) });
    const first = await listUsers({ sort: "new" });
    expect(first.users).toHaveLength(24);
    expect(first.nextOffset).toBe(24);
    const second = await listUsers({ sort: "new", offset: first.nextOffset ?? 0 });
    expect(second.users).toHaveLength(2);
    expect(second.nextOffset).toBeNull();
    const seen = new Set([...first.users, ...second.users].map((row) => row.id));
    expect(seen.size).toBe(26);
  });

  it("shows up to four covers of the most recently updated entries", async () => {
    const owner = await createUser();
    const other = await createUser();
    const names: string[] = [];
    for (let index = 0; index < 6; index++) {
      const { game } = await entry(
        owner.id,
        { updatedAt: at(index) },
        { name: `Cover ${index}`, coverImageId: `img${index}` },
      );
      names.push(game.name);
    }
    // En yeni kayıt ama kapağı yok: atlanır.
    await entry(owner.id, { updatedAt: at(100) }, { name: "No cover" });
    await entry(other.id, { updatedAt: at(0) }, { name: "Direct", coverUrl: "https://x/c.jpg" });

    const { users } = await listUsers();
    const covers = users.find((row) => row.id === owner.id)?.covers;
    expect(covers?.map((cover) => cover.name)).toEqual([
      "Cover 5",
      "Cover 4",
      "Cover 3",
      "Cover 2",
    ]);
    expect(covers?.[0]?.coverUrl).toContain("img5");
    expect(covers?.[0]?.slug).toBeTruthy();
    expect(users.find((row) => row.id === other.id)?.covers).toEqual([
      expect.objectContaining({ name: "Direct", coverUrl: "https://x/c.jpg" }),
    ]);
  });
});

describe("profile overview", () => {
  it("rejects unknown users", async () => {
    await expect(getProfileOverview("nobody")).rejects.toMatchObject({ code: "not_found" });
  });

  it("returns empty sections for an empty library", async () => {
    const owner = await createUser();
    const overview = await getProfileOverview(owner.username ?? "");
    expect(overview).toMatchObject({
      nowPlaying: [],
      favorites: [],
      recentlyCompleted: [],
      topRated: [],
      recent: [],
      platforms: [],
      screenshots: [],
      thisYear: { year: Number(localToday().slice(0, 4)), completed: 0, playtimeMin: 0 },
    });
    expect(Object.values(overview.statusCounts).every((count) => count === 0)).toBe(true);
    expect(Object.keys(overview.statusCounts)).toContain("wishlist");
  });

  it("uses the library item shape", async () => {
    const owner = await createUser();
    await entry(owner.id, { status: "playing", rating: 70 }, { coverImageId: "abc" });
    const overview = await getProfileOverview(owner.username ?? "");
    const { items } = await listLibrary(owner.id);
    expect(overview.recent).toEqual(items);
    expect(overview.nowPlaying).toEqual(items);
    expect(overview.recent[0]?.game.coverUrl).toContain("abc");
  });

  it("orders and limits the shelves", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await entry(stranger.id, { status: "playing", isFavorite: true, rating: 100 });

    // Oynananlar: son oynama, yoksa güncelleme zamanı.
    const playing = [];
    for (let index = 0; index < 10; index++) {
      const { entry: row } = await entry(owner.id, {
        status: "playing",
        updatedAt: at(index),
        lastPlayedAt: index === 0 ? at(1000) : null,
      });
      playing.push(row.id);
    }
    const overview = await getProfileOverview(owner.username ?? "");
    expect(overview.nowPlaying.map((item) => item.id)).toEqual([
      playing[0],
      ...playing.slice(3).reverse(),
    ]);
    expect(overview.recent.map((item) => item.id)).toEqual(playing.slice(2).reverse());
  });

  it("builds favorites, completed and top rated shelves", async () => {
    const owner = await createUser();
    const favorites = [];
    for (let index = 0; index < 13; index++) {
      const { entry: row } = await entry(owner.id, {
        isFavorite: true,
        rating: index < 3 ? null : 50 + index,
        updatedAt: at(index),
      });
      favorites.push(row);
    }
    const thisYear = Number(localToday().slice(0, 4));
    const done = [
      await entry(owner.id, { status: "completed", finishedAt: `${thisYear}-01-10` }),
      await entry(owner.id, { status: "completed", finishedAt: null, updatedAt: at(500) }),
      await entry(owner.id, { status: "completed", finishedAt: `${thisYear}-03-01` }),
      await entry(owner.id, { status: "completed", finishedAt: `${thisYear - 1}-12-31` }),
    ].map((row) => row.entry.id);

    const overview = await getProfileOverview(owner.username ?? "");
    // Puana göre azalan, puansızlar sonda (kendi aralarında güncellemeye göre); en fazla 12.
    expect(overview.favorites).toHaveLength(12);
    expect(overview.favorites.map((item) => item.id)).toEqual([
      ...favorites
        .slice(3)
        .reverse()
        .map((row) => row.id),
      favorites[2]?.id,
      favorites[1]?.id,
    ]);
    expect(overview.recentlyCompleted.map((item) => item.id)).toEqual([
      done[2],
      done[0],
      done[3],
      done[1],
    ]);
    expect(overview.topRated).toHaveLength(8);
    expect(overview.topRated.map((item) => item.rating)).toEqual([62, 61, 60, 59, 58, 57, 56, 55]);
    expect(overview.statusCounts).toMatchObject({ backlog: 13, completed: 4, playing: 0 });
    expect(overview.thisYear.completed).toBe(2);
  });

  it("counts platforms and this year's play time, lists recent screenshots", async () => {
    const owner = await createUser();
    await entry(owner.id, { platform: "pc" });
    await entry(owner.id, { platform: "pc" });
    await entry(owner.id, { platform: "playstation" });
    const { entry: played, game } = await entry(owner.id, { platform: null });

    const year = Number(localToday().slice(0, 4));
    await db.insert(schema.playSessions).values([
      {
        userId: owner.id,
        gameId: game.id,
        entryId: played.id,
        source: "manual",
        startedAt: new Date(`${year}-02-01T10:00:00Z`),
        endedAt: new Date(`${year}-02-01T12:00:00Z`),
        durationMin: 120,
      },
      {
        userId: owner.id,
        gameId: game.id,
        entryId: played.id,
        source: "manual",
        startedAt: new Date(`${year - 1}-06-01T10:00:00Z`),
        endedAt: new Date(`${year - 1}-06-01T11:00:00Z`),
        durationMin: 60,
      },
    ]);
    await db.insert(schema.screenshots).values(
      Array.from({ length: 9 }, (_, index) => ({
        entryId: played.id,
        userId: owner.id,
        gameId: game.id,
        kind: "external" as const,
        url: `https://example.com/${index}.jpg`,
        takenAt: at(index),
      })),
    );

    const overview = await getProfileOverview(owner.username ?? "");
    expect(overview.platforms).toEqual([
      { platform: "pc", count: 2 },
      { platform: "playstation", count: 1 },
    ]);
    expect(overview.thisYear).toEqual({ year, completed: 0, playtimeMin: 120 });
    expect(overview.screenshots).toHaveLength(8);
    expect(overview.screenshots[0]?.url).toBe("https://example.com/8.jpg");
    expect(overview.screenshots[0]).toMatchObject({ thumbUrl: "https://example.com/8.jpg" });
  });
});
