import { schema } from "@my-games/db";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { localToday } from "../src/config";
import { db } from "../src/db";
import {
  addEntry,
  deleteEntry,
  listHistory,
  listLibrary,
  revertHistory,
  updateEntry,
} from "../src/library";
import { isPushServiceEndpoint } from "../src/social/push";
import { createGame, createUser } from "./factories";

async function outboxTypes() {
  const rows = await db.select().from(schema.outbox).orderBy(schema.outbox.id);
  return rows.map((row) => row.type);
}

describe("library", () => {
  it("adds an entry, records history and emits an event", async () => {
    const owner = await createUser();
    const game = await createGame();

    const entry = await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      rating: 91,
      playtimeManualMin: 1500,
    });

    expect(entry.finishedAt).toBe(localToday());
    const history = await listHistory(owner.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.action).toBe("create");
    expect(history[0]?.changes.map((change) => change.field)).toEqual(
      expect.arrayContaining(["status", "rating", "playtimeManualMin", "finishedAt"]),
    );
    expect(await outboxTypes()).toEqual(["entry.created"]);
  });

  it("rejects adding the same game twice", async () => {
    const owner = await createUser();
    const game = await createGame();
    await addEntry(owner.id, { gameId: game.id, status: "backlog" });
    await expect(addEntry(owner.id, { gameId: game.id, status: "playing" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("updates only changed fields and forbids other users", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "backlog" });

    await expect(updateEntry(stranger.id, entry.id, { status: "playing" })).rejects.toMatchObject({
      code: "forbidden",
    });

    const unchanged = await updateEntry(owner.id, entry.id, { status: "backlog" });
    expect(unchanged.updatedAt.getTime()).toBe(entry.updatedAt.getTime());

    const updated = await updateEntry(owner.id, entry.id, {
      status: "playing",
      review: "  harika  ",
    });
    expect(updated.status).toBe("playing");
    expect(updated.review).toBe("harika");
    expect(updated.startedAt).not.toBeNull();

    const [latest] = await listHistory(owner.id, { entryId: entry.id });
    expect(latest?.changes).toEqual(
      expect.arrayContaining([
        { field: "status", from: "backlog", to: "playing" },
        { field: "review", from: null, to: "harika" },
      ]),
    );
    expect(await outboxTypes()).toEqual(["entry.created", "entry.updated"]);
  });

  it("reverts an update without clobbering fields changed later", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing", rating: 50 });
    await updateEntry(owner.id, entry.id, { rating: 80, review: "ilk" });
    const [ratingChange] = await listHistory(owner.id, { entryId: entry.id });
    await updateEntry(owner.id, entry.id, { review: "sonra değişti" });

    await revertHistory(owner.id, ratingChange?.id ?? "");
    const [row] = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.id, entry.id));
    expect(row?.rating).toBe(50);
    expect(row?.review).toBe("sonra değişti");
    await expect(revertHistory(owner.id, ratingChange?.id ?? "")).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("restores a deleted entry from history", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      rating: 77,
      lastPlayedAt: new Date("2024-05-25T10:00:00Z"),
    });
    await deleteEntry(owner.id, entry.id);
    const [deletion] = await listHistory(owner.id);
    expect(deletion?.action).toBe("delete");

    await revertHistory(owner.id, deletion?.id ?? "");
    const restored = await listLibrary(owner.id);
    expect(restored.items).toHaveLength(1);
    expect(restored.items[0]?.rating).toBe(77);
    expect(restored.items[0]?.lastPlayedAt?.toISOString()).toBe("2024-05-25T10:00:00.000Z");
  });

  it("lists with filters, sorting and status counts", async () => {
    const owner = await createUser();
    const other = await createUser();
    const zelda = await createGame({ name: "Zelda" });
    const alan = await createGame({ name: "Alan Wake" });
    const hades = await createGame({ name: "Hades" });
    await addEntry(owner.id, {
      gameId: zelda.id,
      status: "completed",
      rating: 95,
      playtimeManualMin: 100,
    });
    await addEntry(owner.id, {
      gameId: alan.id,
      status: "completed",
      rating: 70,
      playtimeManualMin: 900,
    });
    await addEntry(owner.id, {
      gameId: hades.id,
      status: "playing",
      playtimeManualMin: 50,
      playtimeSteamMin: 20,
    });
    await addEntry(other.id, { gameId: hades.id, status: "backlog" });

    const all = await listLibrary(owner.id, { sort: "name", order: "asc" });
    expect(all.items.map((item) => item.game.name)).toEqual(["Alan Wake", "Hades", "Zelda"]);
    expect(all.total).toBe(3);
    expect(all.statusCounts).toEqual({ completed: 2, playing: 1 });
    expect(all.items.find((item) => item.game.name === "Hades")?.playtimeMin).toBe(70);

    const completed = await listLibrary(owner.id, { status: "completed", sort: "rating" });
    expect(completed.items.map((item) => item.game.name)).toEqual(["Zelda", "Alan Wake"]);

    const byPlaytime = await listLibrary(owner.id, { sort: "playtime" });
    expect(byPlaytime.items[0]?.game.name).toBe("Alan Wake");

    const search = await listLibrary(owner.id, { q: "wake" });
    expect(search.items.map((item) => item.game.name)).toEqual(["Alan Wake"]);
  });
});

describe("small rules", () => {
  it("computes today in the app time zone", () => {
    // 31 Aralık 23:30 UTC, İstanbul'da 1 Ocak 02:30.
    expect(localToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(localToday(new Date("2026-06-15T12:00:00Z"))).toBe("2026-06-15");
  });

  it("uses the app time zone for day boundaries in SQL", async () => {
    const result = await db.execute<{ day: string }>(
      sql`select to_char(date_trunc('day', '2026-12-31T23:30:00Z'::timestamptz), 'YYYY-MM-DD') as day`,
    );
    expect(result.rows[0]?.day).toBe("2027-01-01");
  });

  it("accepts only browser push services as push endpoints", () => {
    expect(isPushServiceEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushServiceEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(
      true,
    );
    expect(isPushServiceEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isPushServiceEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isPushServiceEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isPushServiceEndpoint("https://fcm.googleapis.com.evil.dev/x")).toBe(false);
    expect(isPushServiceEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushServiceEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
  });
});
