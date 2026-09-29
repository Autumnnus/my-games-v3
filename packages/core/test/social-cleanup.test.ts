import { schema } from "@my-games/db";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import { addEntry, deleteEntry, updateEntry } from "../src/library";
import { processOutbox } from "../src/outbox";
import { deleteScreenshot, insertPlatformScreenshots } from "../src/screenshots";
import { socialHandlers } from "../src/social/handlers";
import { addComment, react } from "../src/social/interactions";
import { createGame, createUser } from "./factories";

const { activities, comments, reactions, notifications } = schema;
const drain = () => processOutbox(socialHandlers, 500);

async function activitiesOf(actorId: string, verb: string) {
  return db
    .select()
    .from(activities)
    .where(and(eq(activities.actorId, actorId), eq(activities.verb, verb as "rated")));
}

async function socialCount(targetId: string) {
  const [r, c, n] = await Promise.all([
    db.select().from(reactions).where(eq(reactions.targetId, targetId)),
    db.select().from(comments).where(eq(comments.targetId, targetId)),
    db.select().from(notifications).where(eq(notifications.targetId, targetId)),
  ]);
  return r.length + c.length + n.length;
}

/** Sahibi olmayan biri hedefi beğenir ve yorum yapar (sahibe bildirim düşer). */
async function engage(targetType: "activity" | "screenshot", targetId: string) {
  const fan = await createUser();
  await react(fan.id, targetType, targetId);
  await addComment(fan.id, { targetType, targetId, body: "Harika" });
  await drain();
}

async function addShots(userId: string, entryId: string, count: number) {
  const ids = await db.transaction((tx) =>
    insertPlatformScreenshots(tx, {
      userId,
      entryId,
      gameId: null,
      announce: true,
      items: Array.from({ length: count }, (_, index) => ({
        externalId: `${entryId}-${Date.now()}-${index}`,
        url: `https://example.com/${index}.jpg`,
        thumbUrl: null,
        caption: null,
        width: null,
        height: null,
        takenAt: null,
      })),
    }),
  );
  await drain();
  return ids.map((row) => row.id);
}

describe("deleting social targets", () => {
  it("drops a deleted screenshot from its activity and removes its likes and comments", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
    // 10 görüntü: eskiden aktivite yalnızca ilk 8'ini tutardı.
    const ids = await addShots(owner.id, entry.id, 10);
    const [activity] = await activitiesOf(owner.id, "screenshots_added");
    expect(activity?.data).toMatchObject({ count: 10 });

    const [first, ...rest] = ids;
    await engage("screenshot", first ?? "");
    await engage("activity", activity?.id ?? "");
    expect(await socialCount(first ?? "")).toBeGreaterThan(0);

    await deleteScreenshot(owner.id, first ?? "");
    expect(await socialCount(first ?? "")).toBe(0);
    const [pruned] = await activitiesOf(owner.id, "screenshots_added");
    expect(pruned?.data).toEqual({ screenshotIds: rest, count: 9 });
    // Aktivite hâlâ duruyor; onun beğeni/yorumları yerinde.
    expect(await socialCount(activity?.id ?? "")).toBeGreaterThan(0);

    for (const id of rest) await deleteScreenshot(owner.id, id);
    expect(await activitiesOf(owner.id, "screenshots_added")).toHaveLength(0);
    expect(await socialCount(activity?.id ?? "")).toBe(0);
  });

  it("removes a deleted entry from the grouped 'added games' activity", async () => {
    const owner = await createUser();
    const [a, b] = await Promise.all([createGame(), createGame()]);
    const first = await addEntry(owner.id, { gameId: a.id, status: "playing" });
    const second = await addEntry(owner.id, { gameId: b.id, status: "backlog" });
    await drain();
    const [activity] = await activitiesOf(owner.id, "entry_added");
    expect(activity?.entryId).toBe(second.id);
    await engage("activity", activity?.id ?? "");

    // Aktivitenin baktığı (son eklenen) kayıt silinse de grup kalır, kalan oyuna taşınır.
    await deleteEntry(owner.id, second.id);
    const [kept] = await activitiesOf(owner.id, "entry_added");
    expect(kept?.id).toBe(activity?.id);
    expect(kept?.entryId).toBe(first.id);
    expect(kept?.gameId).toBe(a.id);
    expect(kept?.data).toMatchObject({ count: 1 });

    await deleteEntry(owner.id, first.id);
    expect(await activitiesOf(owner.id, "entry_added")).toHaveLength(0);
    expect(await socialCount(activity?.id ?? "")).toBe(0);
  });

  it("removes an entry's own likes and comments with it", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
    const fan = await createUser();
    await react(fan.id, "entry", entry.id);
    await addComment(fan.id, { targetType: "entry", targetId: entry.id, body: "Güzel" });
    await deleteEntry(owner.id, entry.id);
    expect(await socialCount(entry.id)).toBe(0);
  });

  it("withdraws activities when the change is undone", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
    await updateEntry(owner.id, entry.id, { status: "completed", rating: 80, review: "İyi" });
    await drain();
    const [rated] = await activitiesOf(owner.id, "rated");
    await engage("activity", rated?.id ?? "");

    await updateEntry(owner.id, entry.id, { status: "playing", rating: null, review: null });
    await drain();
    expect(await activitiesOf(owner.id, "status_changed")).toHaveLength(0);
    expect(await activitiesOf(owner.id, "rated")).toHaveLength(0);
    expect(await activitiesOf(owner.id, "reviewed")).toHaveLength(0);
    expect(await socialCount(rated?.id ?? "")).toBe(0);
  });
});
