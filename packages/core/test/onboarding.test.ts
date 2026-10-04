import { schema } from "@my-games/db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { clearKeyCache } from "../src/ai/keys";
import { db } from "../src/db";
import { addEntry } from "../src/library";
import {
  dismissOnboarding,
  getOnboarding,
  markTipSeen,
  markWelcomed,
  ONBOARDING_DAYS,
  onboardingFunnel,
  resetOnboarding,
  restoreOnboarding,
  startOnboarding,
} from "../src/onboarding";
import { createGame, createUser } from "./factories";

const stepIds = (state: Awaited<ReturnType<typeof getOnboarding>>) =>
  state?.steps.map((step) => `${step.id}:${step.done ? "done" : "todo"}`);

afterEach(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.PSN_DISABLED;
  clearKeyCache();
});

describe("onboarding", () => {
  it("is only offered to accounts that started it at signup", async () => {
    const legacy = await createUser();
    expect(await getOnboarding(legacy.id)).toBeNull();

    const fresh = await createUser();
    await startOnboarding(fresh.id);
    const state = await getOnboarding(fresh.id);
    expect(state).toMatchObject({ welcomed: false, dismissed: false, justCompleted: false });
    // AI kapalı (test ortamında anahtar yok); gelen kutusu adımı platform bağlanmadan görünmez.
    expect(stepIds(state)).toEqual(["platform:todo", "game:todo", "profile:todo"]);
  });

  it("derives steps from data and hides feature-less steps", async () => {
    process.env.AI_PROVIDER = "mock";
    process.env.PSN_DISABLED = "true";
    clearKeyCache();
    const owner = await createUser();
    await startOnboarding(owner.id);
    expect(stepIds(await getOnboarding(owner.id))).toEqual([
      "game:todo",
      "ai:todo",
      "profile:todo",
    ]);

    const game = await createGame();
    await addEntry(owner.id, { gameId: game.id, status: "playing" });
    await db.insert(schema.chatThreads).values({ userId: owner.id });
    expect(stepIds(await getOnboarding(owner.id))).toEqual([
      "game:done",
      "ai:done",
      "profile:todo",
    ]);
  });

  it("shows the inbox step once a platform is linked and completes it after the first sync", async () => {
    const owner = await createUser();
    await startOnboarding(owner.id);
    await db.insert(schema.steamAccounts).values({ userId: owner.id, steamId: "7656" });
    expect(stepIds(await getOnboarding(owner.id))).toEqual([
      "platform:done",
      "inbox:todo",
      "game:todo",
      "profile:todo",
    ]);

    await db.insert(schema.changeProposals).values({
      userId: owner.id,
      source: "steam",
      kind: "new_game",
      payload: {},
    });
    await db
      .update(schema.steamAccounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(schema.steamAccounts.userId, owner.id));
    // Senkron bitti ama bekleyen öneri var: kullanıcı henüz gözden geçirmedi.
    expect((await getOnboarding(owner.id))?.steps[1]).toEqual({ id: "inbox", done: false });

    await db
      .update(schema.changeProposals)
      .set({ status: "approved" })
      .where(eq(schema.changeProposals.userId, owner.id));
    expect((await getOnboarding(owner.id))?.steps[1]).toEqual({ id: "inbox", done: true });
  });

  it("celebrates once when every step is done, then disappears", async () => {
    process.env.PSN_DISABLED = "true";
    const owner = await createUser({ bio: "Hi" });
    await startOnboarding(owner.id);
    const game = await createGame();
    await addEntry(owner.id, { gameId: game.id, status: "completed" });

    const first = await getOnboarding(owner.id);
    expect(first?.justCompleted).toBe(true);
    expect(await getOnboarding(owner.id)).toBeNull();
  });

  it("closes after the onboarding window", async () => {
    const owner = await createUser();
    await db.insert(schema.userOnboarding).values({
      userId: owner.id,
      createdAt: new Date(Date.now() - (ONBOARDING_DAYS + 1) * 24 * 60 * 60_000),
    });
    expect(await getOnboarding(owner.id)).toBeNull();

    await resetOnboarding(owner.id);
    expect(await getOnboarding(owner.id)).not.toBeNull();
  });

  it("records welcome, dismiss/restore and seen tips without duplicates", async () => {
    const owner = await createUser();
    await startOnboarding(owner.id);
    await markWelcomed(owner.id);
    await markTipSeen(owner.id, "spotlight");
    await markTipSeen(owner.id, "spotlight");
    await markTipSeen(owner.id, "inbox_deck");
    expect(await getOnboarding(owner.id)).toMatchObject({
      welcomed: true,
      seenTips: ["spotlight", "inbox_deck"],
    });

    await dismissOnboarding(owner.id);
    expect((await getOnboarding(owner.id))?.dismissed).toBe(true);
    await restoreOnboarding(owner.id);
    expect((await getOnboarding(owner.id))?.dismissed).toBe(false);
  });

  it("dismissing also counts as welcomed so the dialog never comes back", async () => {
    const owner = await createUser();
    await startOnboarding(owner.id);
    await dismissOnboarding(owner.id);
    expect((await getOnboarding(owner.id))?.welcomed).toBe(true);
  });

  it("builds an admin funnel of recent signups", async () => {
    const a = await createUser();
    const b = await createUser();
    await createUser(); // rehberi olmayan eski hesap sayılmaz
    await startOnboarding(a.id);
    await startOnboarding(b.id);
    await markWelcomed(a.id);
    const game = await createGame();
    await addEntry(a.id, { gameId: game.id, status: "playing" });

    const funnel = await onboardingFunnel();
    expect(funnel).toMatchObject({ total: 2, welcomed: 1, dismissed: 0, completed: 0 });
    expect(funnel.steps.find((step) => step.id === "game")?.done).toBe(1);
  });
});
