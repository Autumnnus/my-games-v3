import { schema } from "@my-games/db";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import { AppError } from "../src/errors";
import { suggestFinishDates } from "../src/estimates/finish";
import { addEntry } from "../src/library";
import {
  applyPlatformTitles,
  type PlatformTitle,
  type ProviderSpec,
} from "../src/platforms/engine";
import { resolveProposal } from "../src/proposals";
import { createGame, createUser } from "./factories";

const { achievementSets, achievements, userAchievements, changeProposals, libraryEntries } = schema;

async function gameWithEnding(options: { endings: string[] | null }) {
  const game = await createGame({ name: `Story ${Math.random().toString(36).slice(2, 7)}` });
  const gameKey = String(Math.floor(Math.random() * 1e9));
  await db.insert(achievementSets).values({
    provider: "steam",
    gameKey,
    gameId: game.id,
    total: 3,
    fetchedAt: new Date(),
    endingApiNames: options.endings,
    endingsCheckedAt: options.endings ? new Date() : null,
  });
  await db.insert(achievements).values(
    ["START", "BOSS", "ENDING"].map((apiName, position) => ({
      provider: "steam",
      gameKey,
      apiName,
      position,
      name: apiName === "ENDING" ? "The End" : apiName,
      hidden: apiName === "ENDING",
    })),
  );
  return { game, gameKey };
}

const unlock = (userId: string, gameKey: string, apiName: string, at: string) => ({
  userId,
  provider: "steam",
  gameKey,
  apiName,
  unlockedAt: new Date(at),
});

async function finishProposals(userId: string) {
  return db
    .select()
    .from(changeProposals)
    .where(and(eq(changeProposals.userId, userId), eq(changeProposals.kind, "finish_date")));
}

describe("finish date suggestions", () => {
  it("proposes the day the ending achievement unlocked, once", async () => {
    const owner = await createUser();
    const { game, gameKey } = await gameWithEnding({ endings: ["ENDING"] });
    await addEntry(owner.id, { gameId: game.id, status: "paused" });
    await db
      .insert(userAchievements)
      .values([
        unlock(owner.id, gameKey, "START", "2021-03-01T20:00:00Z"),
        unlock(owner.id, gameKey, "ENDING", "2021-03-19T22:10:00Z"),
      ]);

    expect(await suggestFinishDates(owner.id, { ai: false })).toMatchObject({ proposed: 1 });
    const [proposal] = await finishProposals(owner.id);
    expect(proposal).toMatchObject({ source: "steam", status: "pending", initial: true });
    expect(proposal?.payload).toMatchObject({
      op: "update",
      changes: [
        { field: "status", from: "paused", to: "completed" },
        { field: "finishedAt", from: null, to: "2021-03-19" },
      ],
      evidence: { kind: "achievement", name: "The End" },
    });

    // Reddedilen öneri bir daha gelmez.
    await resolveProposal(owner.id, proposal?.id ?? "", "reject");
    expect(await suggestFinishDates(owner.id, { ai: false })).toMatchObject({ proposed: 0 });
  });

  it("applies on approval and ignores bulk (retroactive) unlocks", async () => {
    const owner = await createUser();
    const bulk = await gameWithEnding({ endings: ["ENDING"] });
    const real = await gameWithEnding({ endings: ["ENDING"] });
    await addEntry(owner.id, { gameId: bulk.game.id, status: "playing" });
    const entry = await addEntry(owner.id, { gameId: real.game.id, status: "completed" });
    // Toplu açılım: aynı dakikada 5 başarım (oyuna sonradan eklenen başarımlar gibi); tarihi güvenilmez.
    await db
      .insert(userAchievements)
      .values(
        ["START", "BOSS", "ENDING", "X1", "X2"].map((apiName) =>
          unlock(owner.id, bulk.gameKey, apiName, "2019-06-01T10:00:30Z"),
        ),
      );
    await db
      .insert(userAchievements)
      .values(unlock(owner.id, real.gameKey, "ENDING", "2022-08-05T21:00:00Z"));
    // "Bitirildi" durumuna geçişte bugünün tarihi yazılmıştı; bu testte tarih bilinmiyor.
    await db
      .update(libraryEntries)
      .set({ finishedAt: null })
      .where(eq(libraryEntries.id, entry.id));

    await suggestFinishDates(owner.id, { ai: false });
    const proposals = await finishProposals(owner.id);
    expect(proposals.map((proposal) => proposal.entryId)).toEqual([entry.id]);
    await resolveProposal(owner.id, proposals[0]?.id ?? "", "approve");
    const [updated] = await db.select().from(libraryEntries).where(eq(libraryEntries.id, entry.id));
    expect(updated?.finishedAt).toBe("2022-08-05");
  });

  it("uses the last played day only for games marked finished without a date", async () => {
    const owner = await createUser();
    const game = await createGame();
    const other = await createGame();
    const done = await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      lastPlayedAt: new Date("2020-02-10T20:00:00Z"),
    });
    await addEntry(owner.id, {
      gameId: other.id,
      status: "paused",
      lastPlayedAt: new Date("2020-02-10T20:00:00Z"),
    });
    await db.update(libraryEntries).set({ finishedAt: null }).where(eq(libraryEntries.id, done.id));

    await suggestFinishDates(owner.id, { ai: false });
    const proposals = await finishProposals(owner.id);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ entryId: done.id, source: "system" });
    expect(proposals[0]?.payload).toMatchObject({
      changes: [{ field: "finishedAt", to: "2020-02-10" }],
      evidence: { kind: "last_played" },
    });
  });
});

describe("platform engine: achievement checks", () => {
  it("retries titles whose achievement fetch failed instead of marking them checked", async () => {
    const owner = await createUser();
    const game = await createGame({ steamAppId: 4242 });
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });
    const title: PlatformTitle = {
      externalId: "4242",
      name: game.name,
      playtimeMin: 600,
      lastPlayedAt: null,
      recentlyPlayed: false,
      hasAchievements: true,
      achievementsUnlocked: null,
    };
    const spec = (fetchAchievements: ProviderSpec["fetchAchievements"]): ProviderSpec => ({
      provider: "steam",
      playtimeField: "playtimeSteamMin",
      sessionSource: "steam_delta",
      newEntry: { store: "steam", platform: "pc" },
      findEntry: async () => ({
        id: entry.id,
        status: entry.status,
        gameId: game.id,
        name: game.name,
        steamAppId: 4242,
        playtimeManualMin: 0,
        playtimeSteamMin: null,
        playtimePsnMin: null,
        playtimeXboxMin: null,
        achievementsUnlocked: null,
        achievementsTotal: null,
      }),
      ensureGame: async () => null,
      fetchAchievements,
      maxAchievementChecks: 10,
    });
    const checkedAt = async () =>
      (
        await db
          .select({ at: schema.platformSnapshots.achievementsCheckedAt })
          .from(schema.platformSnapshots)
          .where(eq(schema.platformSnapshots.userId, owner.id))
      )[0]?.at ?? null;

    await applyPlatformTitles({
      userId: owner.id,
      spec: spec(async () => {
        throw new AppError("rate_limited", "Steam istek sınırı");
      }),
      titles: [title],
      lastSyncedAt: null,
    });
    expect(await checkedAt()).toBeNull();

    // Başarımı olmayan (ya da gizli) oyun ise bir daha sorulmaz.
    await applyPlatformTitles({
      userId: owner.id,
      spec: spec(async () => null),
      titles: [title],
      lastSyncedAt: new Date(),
    });
    expect(await checkedAt()).not.toBeNull();
  });
});
