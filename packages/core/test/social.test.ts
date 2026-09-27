import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import { emit } from "../src/events";
import { addEntry, updateEntry } from "../src/library";
import { processOutbox } from "../src/outbox";
import { listFeed } from "../src/social/activities";
import { socialHandlers } from "../src/social/handlers";
import {
  addComment,
  deleteComment,
  extractMentions,
  listComments,
  react,
  unreact,
} from "../src/social/interactions";
import { createReport, listReports, resolveReport } from "../src/social/moderation";
import {
  listNotifications,
  markRead,
  setPreference,
  unreadCount,
} from "../src/social/notifications";
import { createGame, createUser } from "./factories";

const drain = () => processOutbox(socialHandlers, 500);

async function activitiesOf(actorId: string) {
  return db.select().from(schema.activities).where(eq(schema.activities.actorId, actorId));
}

describe("activity feed", () => {
  it("groups same-day additions and skips imports", async () => {
    const owner = await createUser();
    const [a, b, c] = await Promise.all([createGame(), createGame(), createGame()]);
    await addEntry(owner.id, { gameId: a?.id ?? "", status: "playing" });
    await addEntry(owner.id, { gameId: b?.id ?? "", status: "backlog" });
    await addEntry(owner.id, { gameId: c?.id ?? "", status: "completed" }, { source: "migration" });
    await drain();

    const rows = await activitiesOf(owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.verb).toBe("entry_added");
    expect(rows[0]?.data).toMatchObject({ count: 2 });
  });

  it("records status, rating and review changes", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
    await updateEntry(owner.id, entry.id, { status: "completed", rating: 90, review: "Çok iyi" });
    await drain();
    const verbs = (await activitiesOf(owner.id)).map((row) => row.verb).sort();
    expect(verbs).toEqual(["entry_added", "rated", "reviewed", "status_changed"]);
  });

  it("sums daily playtime and marks milestones", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
    await db.transaction(async (tx) => {
      await emit(tx, "playtime.recorded", {
        userId: owner.id,
        gameId: game.id,
        entryId: entry.id,
        minutes: 90,
        totalMin: 560,
      });
      await emit(tx, "playtime.recorded", {
        userId: owner.id,
        gameId: game.id,
        entryId: entry.id,
        minutes: 60,
        totalMin: 620,
      });
    });
    await drain();
    const rows = await activitiesOf(owner.id);
    expect(rows.find((row) => row.verb === "played")?.data).toEqual({ minutes: 150 });
    expect(rows.find((row) => row.verb === "playtime_milestone")?.data).toEqual({ minutes: 600 });
  });

  it("lists the global feed with counts and cursor pagination", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    for (let index = 0; index < 3; index++) {
      const game = await createGame();
      const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
      await updateEntry(owner.id, entry.id, { rating: 50 + index });
    }
    await drain();

    const first = await listFeed({ viewerId: viewer.id, limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await listFeed({
      viewerId: viewer.id,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    const target = first.items[0];
    await react(viewer.id, "activity", target?.id ?? "");
    const again = await listFeed({ viewerId: viewer.id, limit: 1 });
    expect(again.items[0]).toMatchObject({ reactionCount: 1, viewerReacted: true });
  });
});

describe("activity feed pagination", () => {
  it("does not skip activities created in the same transaction", async () => {
    const owner = await createUser();
    const game = await createGame();
    // Aynı transaction'da oluşan aktiviteler aynı mikro saniyeli now() değerini paylaşır.
    await db.transaction(async (tx) => {
      for (const verb of ["status_changed", "rated", "reviewed"] as const) {
        await tx.insert(schema.activities).values({ actorId: owner.id, verb, gameId: game.id });
      }
    });
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = await listFeed({ actorId: owner.id, limit: 1, cursor });
      seen.push(...result.items.map((item) => item.id));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
    // Bozuk imleç hata değil, ilk sayfa döner.
    expect((await listFeed({ actorId: owner.id, cursor: "bozuk" })).items).toHaveLength(3);
  });
});

describe("notifications", () => {
  it("groups reactions, ignores self-likes and does not double count", async () => {
    const owner = await createUser();
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const game = await createGame({ name: "Hades" });
    const entry = await addEntry(owner.id, { gameId: game.id, status: "completed" });

    await react(owner.id, "entry", entry.id);
    await react(alice.id, "entry", entry.id);
    await unreact(alice.id, "entry", entry.id);
    await react(alice.id, "entry", entry.id);
    await react(bob.id, "entry", entry.id);
    await drain();

    const [notification] = await listNotifications(owner.id);
    expect(notification).toMatchObject({ type: "reaction", count: 2, data: { gameName: "Hades" } });
    expect(notification?.actors.map((actor) => actor.id)).toEqual([bob.id, alice.id]);
    expect(await unreadCount(owner.id)).toBe(1);

    await markRead(owner.id);
    expect(await unreadCount(owner.id)).toBe(0);
    // Okunduktan sonra gelen beğeni yeni bir bildirim açar.
    const carol = await createUser();
    await react(carol.id, "entry", entry.id);
    await drain();
    expect(await unreadCount(owner.id)).toBe(1);
  });

  it("notifies owners, parent authors and mentioned users once each", async () => {
    const owner = await createUser({ username: "owner", displayUsername: "owner" });
    const alice = await createUser({ username: "alice", displayUsername: "alice" });
    const bob = await createUser({ username: "bob", displayUsername: "bob" });
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "completed" });

    const root = await addComment(alice.id, {
      targetType: "entry",
      targetId: entry.id,
      body: "Katılıyorum",
    });
    const reply = await addComment(bob.id, {
      targetType: "entry",
      targetId: entry.id,
      body: "@alice @owner @bob haklısın",
      parentId: root.id,
    });
    await addComment(owner.id, {
      targetType: "entry",
      targetId: entry.id,
      body: "Teşekkürler",
      parentId: reply.id,
    });
    await drain();

    const types = async (userId: string) =>
      (await listNotifications(userId)).map((item) => item.type).sort();
    expect(await types(owner.id)).toEqual(["comment"]);
    expect(await types(alice.id)).toEqual(["reply"]);
    expect(await types(bob.id)).toEqual(["reply"]);

    const comments = await listComments("entry", entry.id);
    expect(comments.map((comment) => comment.parentId)).toEqual([null, root.id, root.id]);
  });

  it("respects preferences and extracts mentions", async () => {
    const owner = await createUser();
    const fan = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "completed" });
    await setPreference(owner.id, "reaction", { inApp: false, push: false });
    await react(fan.id, "entry", entry.id);
    await drain();
    expect(await listNotifications(owner.id)).toHaveLength(0);

    expect(extractMentions("selam @Kadir ve @mustafa.! mail@example.com @ab")).toEqual([
      "kadir",
      "mustafa",
    ]);
  });
});

describe("moderation", () => {
  it("resolves a report and removes the comment", async () => {
    const owner = await createUser();
    const troll = await createUser();
    const admin = await createUser({ role: "admin" });
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "completed" });
    const comment = await addComment(troll.id, {
      targetType: "entry",
      targetId: entry.id,
      body: "spam",
    });

    await createReport(owner.id, { targetType: "comment", targetId: comment.id, reason: "spam" });
    await createReport(owner.id, {
      targetType: "comment",
      targetId: comment.id,
      reason: "spam again",
    });
    const open = await listReports("open");
    expect(open).toHaveLength(1);
    expect(open[0]?.preview).toMatchObject({ text: "spam", ownerId: troll.id });

    await resolveReport(admin.id, open[0]?.id ?? "", "resolved", true);
    expect(await listReports("open")).toHaveLength(0);
    expect(await listComments("entry", entry.id)).toHaveLength(0);
    await expect(deleteComment(troll.id, comment.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
