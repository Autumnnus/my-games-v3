import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { findGameBySteamApp } from "../src/catalog";
import { db } from "../src/db";
import { addEntry, listHistory } from "../src/library";
import { mergeGameInto } from "../src/matching";
import {
  getRules,
  listIgnores,
  listProposals,
  pendingCount,
  propose,
  resolveMany,
  resolveProposal,
  setRule,
} from "../src/proposals";
import { createGame, createUser } from "./factories";

async function entryOf(id: string) {
  const [row] = await db
    .select()
    .from(schema.libraryEntries)
    .where(eq(schema.libraryEntries.id, id));
  return row;
}

describe("proposals", () => {
  it("auto-applies playtime updates by default and records the source", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "playing" });

    const result = await db.transaction((tx) =>
      propose(tx, {
        userId: owner.id,
        source: "steam",
        kind: "playtime",
        entryId: entry.id,
        gameId: game.id,
        payload: { op: "update", changes: [{ field: "playtimeSteamMin", from: null, to: 600 }] },
      }),
    );

    expect(result.status).toBe("auto_applied");
    expect((await entryOf(entry.id))?.playtimeSteamMin).toBe(600);
    const [latest] = await listHistory(owner.id, { entryId: entry.id });
    expect(latest?.source).toBe("steam");
  });

  it("keeps asked proposals pending, dedupes them and applies on approval", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "backlog" });
    const suggest = (to: string) =>
      db.transaction((tx) =>
        propose(tx, {
          userId: owner.id,
          source: "steam",
          kind: "status",
          entryId: entry.id,
          gameId: game.id,
          dedupeKey: `steam:status:${entry.id}`,
          payload: { op: "update", changes: [{ field: "status", from: "backlog", to }] },
        }),
      );

    const first = await suggest("playing");
    const second = await suggest("completed");
    expect(first.status).toBe("pending");
    expect(second.proposalId).toBe(first.proposalId);
    expect(await pendingCount(owner.id)).toBe(1);
    expect((await entryOf(entry.id))?.status).toBe("backlog");

    await resolveProposal(owner.id, first.proposalId ?? "", "approve");
    expect((await entryOf(entry.id))?.status).toBe("completed");
    expect(await pendingCount(owner.id)).toBe(0);
    await expect(
      resolveProposal(owner.id, first.proposalId ?? "", "approve"),
    ).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("respects user rules and the ignore list", async () => {
    const owner = await createUser();
    const game = await createGame({ steamAppId: 440 });
    await setRule(owner.id, "steam", "playtime", "ignore");
    expect((await getRules(owner.id)).find((rule) => rule.kind === "playtime")?.action).toBe(
      "ignore",
    );

    const newGame = () =>
      db.transaction((tx) =>
        propose(tx, {
          userId: owner.id,
          source: "steam",
          kind: "new_game",
          gameId: game.id,
          dedupeKey: "steam:new_game:440",
          payload: {
            op: "create",
            game: { gameId: game.id, steamAppId: 440, name: game.name },
            fields: { status: "backlog", playtimeSteamMin: 30 },
          },
        }),
      );

    const created = await newGame();
    expect(created.status).toBe("pending");
    await resolveProposal(owner.id, created.proposalId ?? "", "reject", { ignore: true });
    expect((await newGame()).status).toBe("ignored");
    expect(await listProposals(owner.id, "pending")).toHaveLength(0);
  });

  it("creates entries from approved new-game proposals and resolves in bulk", async () => {
    const owner = await createUser();
    const games = await Promise.all([createGame(), createGame()]);
    const ids: string[] = [];
    for (const game of games) {
      const result = await db.transaction((tx) =>
        propose(tx, {
          userId: owner.id,
          source: "steam",
          kind: "new_game",
          gameId: game.id,
          payload: {
            op: "create",
            game: { gameId: game.id, name: game.name },
            fields: { status: "backlog", playtimeSteamMin: 90 },
          },
        }),
      );
      ids.push(result.proposalId ?? "");
    }
    const results = await resolveMany(owner.id, ids, "approve");
    expect(results.every((result) => result.ok)).toBe(true);
    const entries = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.userId, owner.id));
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.playtimeSteamMin === 90)).toBe(true);
  });

  it("resolves playtime conflicts by adopting Steam playtime", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      playtimeManualMin: 1500,
      playtimeSteamMin: 1560,
    });
    const result = await db.transaction((tx) =>
      propose(tx, {
        userId: owner.id,
        source: "steam",
        kind: "playtime_conflict",
        entryId: entry.id,
        gameId: game.id,
        payload: { op: "conflict", manualMin: 1500, steamMin: 1560 },
      }),
    );
    expect(result.status).toBe("pending");
    await resolveProposal(owner.id, result.proposalId ?? "", "approve", { choice: "use_steam" });
    expect((await entryOf(entry.id))?.playtimeManualMin).toBe(0);
  });

  it("does not let other users resolve a proposal", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "backlog" });
    const result = await db.transaction((tx) =>
      propose(tx, {
        userId: owner.id,
        source: "ai",
        kind: "entry_update",
        entryId: entry.id,
        payload: { op: "update", changes: [{ field: "rating", from: null, to: 80 }] },
      }),
    );
    await expect(
      resolveProposal(stranger.id, result.proposalId ?? "", "approve"),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("revives dates stored in jsonb when approving a new game", async () => {
    const owner = await createUser();
    const game = await createGame({ steamAppId: 620 });
    const lastPlayedAt = new Date("2026-09-20T18:30:00Z");
    const result = await db.transaction((tx) =>
      propose(tx, {
        userId: owner.id,
        source: "steam",
        kind: "new_game",
        gameId: game.id,
        dedupeKey: "steam:new_game:620",
        payload: {
          op: "create",
          game: { gameId: game.id, steamAppId: 620, name: game.name },
          fields: { status: "paused", playtimeSteamMin: 840, lastPlayedAt },
        },
      }),
    );
    await resolveProposal(owner.id, result.proposalId ?? "", "approve");
    const [entry] = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.userId, owner.id));
    expect(entry?.lastPlayedAt?.toISOString()).toBe(lastPlayedAt.toISOString());
  });

  it("honours 'don't ask again' for every kind and counts only new proposals", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, { gameId: game.id, status: "backlog" });
    const suggest = () =>
      db.transaction((tx) =>
        propose(tx, {
          userId: owner.id,
          source: "steam",
          kind: "status",
          entryId: entry.id,
          gameId: game.id,
          dedupeKey: `steam:status:${entry.id}`,
          payload: { op: "update", changes: [{ field: "status", from: "backlog", to: "playing" }] },
        }),
      );
    const first = await suggest();
    expect(first.created).toBe(true);
    const refreshed = await suggest();
    expect(refreshed.status).toBe("pending");
    expect(refreshed.created).toBe(false);

    await resolveProposal(owner.id, first.proposalId ?? "", "reject", { ignore: true });
    expect((await suggest()).status).toBe("ignored");
    const [ignore] = await listIgnores(owner.id);
    expect(ignore).toMatchObject({ externalId: `status:${entry.id}`, label: game.name });
  });

  it("treats a rejected playtime conflict as final", async () => {
    const owner = await createUser();
    const game = await createGame();
    const entry = await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      playtimeManualMin: 600,
    });
    const conflict = () =>
      db.transaction((tx) =>
        propose(tx, {
          userId: owner.id,
          source: "steam",
          kind: "playtime_conflict",
          entryId: entry.id,
          gameId: game.id,
          dedupeKey: `steam:playtime_conflict:${entry.id}`,
          payload: { op: "conflict", manualMin: 600, steamMin: 700 },
        }),
      );
    const first = await conflict();
    await resolveProposal(owner.id, first.proposalId ?? "", "reject");
    expect((await conflict()).status).toBe("ignored");
  });

  it("accepts only offered match candidates and moves only the approving user's entry", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const legacy = await createGame({ source: "legacy", name: "Elden Ring" });
    const target = await createGame({ source: "igdb", igdbId: 119133, name: "Elden Ring" });
    const candidates = [
      {
        igdbId: 119133,
        name: "Elden Ring",
        coverImageId: null,
        releaseYear: 2022,
        gameType: "main_game",
        score: 0.9,
      },
    ];
    const proposalIds: Record<string, string> = {};
    for (const user of [alice, bob]) {
      const entry = await addEntry(user.id, { gameId: legacy.id, status: "completed" });
      const result = await db.transaction((tx) =>
        propose(tx, {
          userId: user.id,
          source: "migration",
          kind: "match",
          gameId: legacy.id,
          entryId: entry.id,
          dedupeKey: `migration:match:${legacy.id}`,
          payload: { op: "match", gameName: "Elden Ring", candidates },
        }),
      );
      proposalIds[user.id] = result.proposalId ?? "";
    }

    await expect(
      resolveProposal(alice.id, proposalIds[alice.id] ?? "", "approve", { choice: "1" }),
    ).rejects.toMatchObject({ code: "invalid" });

    await resolveProposal(alice.id, proposalIds[alice.id] ?? "", "approve", { choice: "119133" });
    const gameOf = async (userId: string) =>
      (
        await db
          .select({ gameId: schema.libraryEntries.gameId })
          .from(schema.libraryEntries)
          .where(eq(schema.libraryEntries.userId, userId))
      )[0]?.gameId;
    expect(await gameOf(alice.id)).toBe(target.id);
    expect(await gameOf(bob.id)).toBe(legacy.id);
    expect(await pendingCount(bob.id)).toBe(1);

    await resolveProposal(bob.id, proposalIds[bob.id] ?? "", "approve", { choice: "119133" });
    expect(await gameOf(bob.id)).toBe(target.id);
    const [gone] = await db.select().from(schema.games).where(eq(schema.games.id, legacy.id));
    expect(gone).toBeUndefined();
  });

  it("keeps the Steam link and pending Steam data when merging a Steam-only game", async () => {
    const [owner, other] = await Promise.all([createUser(), createUser()]);
    const steamOnly = await createGame({ source: "steam", steamAppId: 777, name: "Hollow Knight" });
    const target = await createGame({ source: "igdb", igdbId: 14593, name: "Hollow Knight" });
    await addEntry(owner.id, { gameId: steamOnly.id, status: "playing" });
    // Diğer kullanıcının onay bekleyen "yeni oyun" önerisi ve kayıtsız oturumu.
    const pending = await db.transaction(async (tx) => {
      await tx.insert(schema.playSessions).values({
        userId: other.id,
        gameId: steamOnly.id,
        source: "steam_delta",
        startedAt: new Date(Date.now() - 3_600_000),
        endedAt: new Date(),
        durationMin: 60,
      });
      return propose(tx, {
        userId: other.id,
        source: "steam",
        kind: "new_game",
        gameId: steamOnly.id,
        dedupeKey: "steam:new_game:777",
        payload: {
          op: "create",
          game: { gameId: steamOnly.id, steamAppId: 777, name: steamOnly.name },
          fields: { status: "playing", playtimeSteamMin: 60 },
        },
      });
    });

    await db.transaction((tx) => mergeGameInto(tx, steamOnly.id, target.id));

    expect((await findGameBySteamApp(db, 777))?.id).toBe(target.id);
    const sessions = await db
      .select()
      .from(schema.playSessions)
      .where(eq(schema.playSessions.userId, other.id));
    expect(sessions.map((session) => session.gameId)).toEqual([target.id]);
    await resolveProposal(other.id, pending.proposalId ?? "", "approve");
    const [entry] = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.userId, other.id));
    expect(entry?.gameId).toBe(target.id);
  });

  it("maps a second Steam app to a game as an alias when the target has its own", async () => {
    const legacySteam = await createGame({
      source: "steam",
      steamAppId: 1245620,
      name: "Elden Ring",
    });
    const target = await createGame({ source: "igdb", igdbId: 119134, steamAppId: 1245621 });
    await db.transaction((tx) => mergeGameInto(tx, legacySteam.id, target.id));
    expect((await findGameBySteamApp(db, 1245620))?.id).toBe(target.id);
    expect((await findGameBySteamApp(db, 1245621))?.id).toBe(target.id);
  });

  it("merges a user's two entries of the same game into one", async () => {
    const user = await createUser();
    const legacy = await createGame({ source: "legacy", name: "Dark Souls III" });
    const target = await createGame({ source: "igdb", igdbId: 11133, steamAppId: 374320 });
    const old = await addEntry(user.id, {
      gameId: legacy.id,
      status: "completed",
      rating: 90,
      playtimeManualMin: 3000,
      finishedAt: "2023-12-29",
      legacyRef: "legacy:1",
    });
    const fromSteam = await addEntry(user.id, {
      gameId: target.id,
      status: "paused",
      playtimeSteamMin: 4200,
    });
    await db.insert(schema.screenshots).values({
      entryId: old.id,
      userId: user.id,
      gameId: legacy.id,
      kind: "external",
      url: "https://example.com/shot.jpg",
    });

    await db.transaction((tx) => mergeGameInto(tx, legacy.id, target.id));

    expect(await entryOf(old.id)).toBeUndefined();
    expect(await entryOf(fromSteam.id)).toMatchObject({
      status: "completed",
      rating: 90,
      playtimeManualMin: 3000,
      playtimeSteamMin: 4200,
      finishedAt: "2023-12-29",
      legacyRef: "legacy:1",
    });
    const shots = await db
      .select()
      .from(schema.screenshots)
      .where(eq(schema.screenshots.userId, user.id));
    expect(shots.map((shot) => [shot.entryId, shot.gameId])).toEqual([[fromSteam.id, target.id]]);
    const [gone] = await db.select().from(schema.games).where(eq(schema.games.id, legacy.id));
    expect(gone).toBeUndefined();
  });
});
