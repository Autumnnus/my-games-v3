import { randomUUID } from "node:crypto";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { schema } from "@my-games/db";
import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { aiCostSummary, listTraces, traceDetail } from "../src/admin/ai";
import { type AdminActor, listAudit } from "../src/admin/audit";
import { adminOverview } from "../src/admin/overview";
import { adminSettings, retryOutboxEvent, updateSettings } from "../src/admin/system";
import {
  adminUserDetail,
  banUser,
  deleteUserAccount,
  listUsers,
  purgeUserData,
  revokeSessions,
  setUserLimits,
} from "../src/admin/users";
import { streamChat } from "../src/ai/chat";
import { KeyPool } from "../src/ai/key-pool";
import { createPooledModel } from "../src/ai/pooled-model";
import { costOf, DEFAULT_PRICES, priceFor } from "../src/ai/pricing";
import type { ProviderAdapter } from "../src/ai/providers";
import { assertQuota, recordRun, usageToday } from "../src/ai/usage";
import { db } from "../src/db";
import { addEntry } from "../src/library";
import { flushLogs, listLogs, log } from "../src/log";
import { signupsOpen } from "../src/settings";
import { createGame, createUser } from "./factories";

const {
  aiUsage,
  adminAudit,
  user,
  session,
  libraryEntries,
  mediaAssets,
  screenshots,
  chatThreads,
  comments,
  reactions,
  activities,
  notifications,
  steamAccounts,
  outbox,
} = schema;

const usage = {
  inputTokens: { total: 1000, noCache: 800, cacheRead: 200, cacheWrite: undefined },
  outputTokens: { total: 500, text: 300, reasoning: 200 },
};
const finish = (reason: "stop" | "tool-calls"): LanguageModelV4StreamPart => ({
  type: "finish",
  finishReason: { unified: reason, raw: undefined },
  usage,
});

function scripted(...steps: LanguageModelV4StreamPart[][]) {
  return new MockLanguageModelV4({
    modelId: "gemini-3.5-flash",
    doStream: steps.map((chunks) => ({ stream: simulateReadableStream({ chunks }) })),
  });
}

function userMessage(text: string): UIMessage {
  return { id: `msg-${randomUUID()}`, role: "user", parts: [{ type: "text", text }] };
}

async function createAdmin() {
  const row = await createUser({ role: "admin" });
  const actor: AdminActor = { id: row.id, name: row.displayUsername ?? row.name, ip: "10.0.0.1" };
  return { row, actor };
}

describe("AI traces", () => {
  it("records a chat turn with steps, tools, tokens and the answering message", async () => {
    const owner = await createUser();
    const threadId = randomUUID();
    const model = scripted(
      [
        { type: "tool-call", toolCallId: "c1", toolName: "getStats", input: "{}" },
        finish("tool-calls"),
      ],
      [
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "İşte istatistiklerin." },
        { type: "text-end", id: "t" },
        finish("stop"),
      ],
    );
    await (
      await streamChat({
        userId: owner.id,
        threadId,
        message: userMessage("istatistiklerim?"),
        locale: "tr",
        model: { model, id: "mock" },
      })
    ).text();

    const [run] = await db.select().from(aiUsage).where(eq(aiUsage.threadId, threadId));
    expect(run).toMatchObject({
      userId: owner.id,
      purpose: "chat",
      status: "ok",
      steps: 2,
      inputTokens: 2000,
      cachedInputTokens: 400,
      outputTokens: 1000,
      reasoningTokens: 400,
      totalTokens: 3000,
    });
    expect(run?.detail?.mode).toBe("ask");
    expect(run?.detail?.steps[0]?.tools).toEqual([
      expect.objectContaining({ name: "getStats", status: "ok" }),
    ]);
    const [message] = await db
      .select()
      .from(schema.chatMessages)
      .where(
        and(eq(schema.chatMessages.threadId, threadId), eq(schema.chatMessages.role, "assistant")),
      );
    expect(run?.messageId).toBe(message?.id);

    // İz ekranı sohbetin tamamını (mesajlar + tur ölçümleri) birlikte verir.
    const detail = await traceDetail(run?.id ?? "");
    expect(detail.thread?.messages.map((item) => item.role)).toEqual(["user", "assistant"]);
    expect(detail.thread?.runs).toHaveLength(1);
    expect(detail.run.cost).toBeGreaterThan(0);
  });

  it("keeps the key label of the pool in the trace, never in the chat stream", async () => {
    const owner = await createUser();
    const threadId = randomUUID();
    const pool = new KeyPool("fake", ["secret-key-aaaa1111", "secret-key-bbbb2222"]);
    const adapter: ProviderAdapter = {
      id: "fake",
      defaults: { chat: "m1", light: "m1" },
      createModel: () =>
        scripted([
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "selam" },
          { type: "text-end", id: "t" },
          finish("stop"),
        ]),
    };
    const model = createPooledModel([{ adapter, pool, modelId: "m1" }]);
    const body = await (
      await streamChat({
        userId: owner.id,
        threadId,
        message: userMessage("merhaba"),
        locale: "tr",
        model: { model, id: "mock" },
      })
    ).text();
    const labels = pool.snapshot().map((key) => key.label);
    const [run] = await db.select().from(aiUsage).where(eq(aiUsage.threadId, threadId));
    expect(labels).toContain(run?.detail?.steps[0]?.key);
    const stored = JSON.stringify(
      await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.threadId, threadId)),
    );
    for (const secret of [...labels, "secret-key", '"pool":{']) {
      expect(body).not.toContain(secret);
      expect(stored).not.toContain(secret);
    }
  });

  it("records a failed turn with its error", async () => {
    const owner = await createUser();
    const threadId = randomUUID();
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("upstream exploded");
      },
    });
    await (
      await streamChat({
        userId: owner.id,
        threadId,
        message: userMessage("merhaba"),
        locale: "tr",
        model: { model, id: "mock" },
      })
    ).text();
    const [run] = await db.select().from(aiUsage).where(eq(aiUsage.threadId, threadId));
    expect(run).toMatchObject({ status: "error", steps: 0, totalTokens: 0 });
    expect(run?.error).toContain("upstream exploded");
    const { traces } = await listTraces({ status: "error" });
    expect(traces.map((trace) => trace.id)).toEqual([run?.id]);
  });
});

describe("AI costs", () => {
  it("prices models by exact id, versioned id and provider prefix", () => {
    expect(priceFor(DEFAULT_PRICES, "gemini-3.5-flash-lite")).toEqual(
      DEFAULT_PRICES["gemini-3.5-flash-lite"],
    );
    // En uzun önek kazanır: "-lite-001" lite fiyatını alır, düz flash'ınkini değil.
    expect(priceFor(DEFAULT_PRICES, "models/gemini-3.5-flash-lite-001")).toEqual(
      DEFAULT_PRICES["gemini-3.5-flash-lite"],
    );
    expect(priceFor(DEFAULT_PRICES, "google:gemini-3.5-flash")).toEqual(
      DEFAULT_PRICES["gemini-3.5-flash"],
    );
    expect(priceFor(DEFAULT_PRICES, "someone-else")).toBeNull();
    // 800 yeni giriş × 1.5 + 200 önbellek × 0.15 + 500 çıkış × 9 (USD / 1M)
    expect(
      costOf(DEFAULT_PRICES["gemini-3.5-flash"] ?? null, {
        inputTokens: 1000,
        cachedInputTokens: 200,
        outputTokens: 500,
      }),
    ).toBeCloseTo((800 * 1.5 + 200 * 0.15 + 500 * 9) / 1_000_000, 10);
  });

  it("summarizes cost by day, model, purpose and user with the current price table", async () => {
    const owner = await createUser();
    const { actor } = await createAdmin();
    const step = (model: string) => ({
      model: { provider: "google", modelId: model },
      finishReason: "stop",
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        inputTokenDetails: { noCacheTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    });
    await recordRun({
      userId: owner.id,
      purpose: "chat",
      startedAt: Date.now(),
      steps: [step("gemini-3.5-flash")],
    });
    await recordRun({
      userId: owner.id,
      purpose: "title",
      startedAt: Date.now(),
      steps: [step("gemini-3.5-flash-lite")],
    });
    await recordRun({
      userId: owner.id,
      purpose: "pick",
      startedAt: Date.now(),
      steps: [step("mystery-model")],
    });

    const summary = await aiCostSummary("today");
    // 1M × 1.5 + 0.1M × 9 = 2.4 ; 1M × 0.3 + 0.1M × 2.5 = 0.55
    expect(summary.totals.cost).toBeCloseTo(2.95, 6);
    expect(summary.totals.calls).toBe(3);
    expect(summary.unpriced).toEqual(["mystery-model"]);
    expect(summary.users[0]).toMatchObject({ userId: owner.id, calls: 3 });
    expect(summary.purposes.map((item) => item.purpose)).toEqual(["chat", "title", "pick"]);
    expect(summary.days.at(-1)?.cost).toBeCloseTo(2.95, 6);

    // Fiyat düzeltilince geçmiş de düzelir.
    await updateSettings(actor, {
      aiPrices: { ...DEFAULT_PRICES, "mystery-model": { input: 1, output: 0 } },
    });
    const repriced = await aiCostSummary("today");
    expect(repriced.totals.cost).toBeCloseTo(3.95, 6);
    expect(repriced.unpriced).toEqual([]);
  });
});

describe("AI limits", () => {
  it("applies the runtime default, per-user overrides and the AI block", async () => {
    const owner = await createUser();
    const { actor } = await createAdmin();
    await recordRun({
      userId: owner.id,
      purpose: "chat",
      startedAt: Date.now(),
      steps: [
        {
          model: { provider: "google", modelId: "gemini-3.5-flash" },
          finishReason: "stop",
          usage: { inputTokens: 900, outputTokens: 100 },
        },
      ],
    });

    await updateSettings(actor, { aiDailyTokens: 500 });
    expect(await usageToday(owner.id)).toMatchObject({ used: 1000, limit: 500, blocked: false });
    await expect(assertQuota(owner.id)).rejects.toMatchObject({ code: "quota_exceeded" });

    // Kişiye özel sınır varsayılanı ezer (0 = sınırsız).
    await setUserLimits(actor, owner.id, { aiDailyTokens: 0, aiBlocked: false });
    await expect(assertQuota(owner.id)).resolves.toBeUndefined();

    await setUserLimits(actor, owner.id, { aiDailyTokens: null, aiBlocked: true, note: "spam" });
    await expect(assertQuota(owner.id)).rejects.toMatchObject({ code: "ai_blocked" });

    const { entries } = await listAudit({ targetType: "user", targetId: owner.id });
    expect(entries.map((entry) => entry.action)).toEqual(["user.ai_limits", "user.ai_limits"]);
    expect(entries[0]).toMatchObject({ adminId: actor.id, ip: "10.0.0.1" });
  });
});

describe("user administration", () => {
  it("lists users with search, filters and per-user totals", async () => {
    const { row: admin } = await createAdmin();
    const target = await createUser({ name: "Aranan Kişi", banned: true });
    const game = await createGame();
    await addEntry(target.id, { gameId: game.id, status: "playing" });

    const found = await listUsers({ q: "aranan" });
    expect(found.users.map((item) => item.id)).toEqual([target.id]);
    expect(found.users[0]).toMatchObject({ entries: 1, banned: true, role: "user" });
    expect((await listUsers({ filter: "admins" })).users.map((item) => item.id)).toEqual([
      admin.id,
    ]);
    expect((await listUsers({ filter: "banned" })).total).toBe(1);
    expect((await listUsers({ sort: "entries" })).users[0]?.id).toBe(target.id);
  });

  it("bans a user, closes their sessions and refuses to act on admins or oneself", async () => {
    const { row: admin, actor } = await createAdmin();
    const other = await createAdmin();
    const target = await createUser();
    await db.insert(session).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: target.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await banUser(actor, target.id, { reason: "spam", days: 7 });
    const [banned] = await db.select().from(user).where(eq(user.id, target.id));
    expect(banned).toMatchObject({ banned: true, banReason: "spam" });
    expect(banned?.banExpires?.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(await db.select().from(session).where(eq(session.userId, target.id))).toEqual([]);

    await expect(banUser(actor, admin.id, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(banUser(actor, other.row.id, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(revokeSessions(actor, other.row.id)).rejects.toMatchObject({ code: "forbidden" });
    const detail = await adminUserDetail(target.id);
    expect(detail.audit.map((entry) => entry.action)).toEqual(["user.ban"]);
  });

  it("purges only the selected categories of one user and queues their files for deletion", async () => {
    const { actor } = await createAdmin();
    const target = await createUser({ bio: "hello" });
    const bystander = await createUser();
    const game = await createGame();
    const entry = await addEntry(target.id, { gameId: game.id, status: "completed" });
    const theirs = await addEntry(bystander.id, { gameId: game.id, status: "playing" });
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        userId: target.id,
        purpose: "screenshot",
        quality: "optimized",
        status: "ready",
        variants: [
          {
            name: "display",
            key: `users/${target.id}/screenshots/a/display.avif`,
            bytes: 100,
            contentType: "image/avif",
            width: null,
            height: null,
          },
        ],
        totalBytes: 100,
      })
      .returning();
    await db.insert(screenshots).values([
      { entryId: entry.id, userId: target.id, gameId: game.id, kind: "upload", assetId: asset?.id },
      {
        entryId: entry.id,
        userId: target.id,
        gameId: game.id,
        kind: "external",
        url: "https://x.test/a.png",
      },
    ]);
    await db.insert(chatThreads).values({ userId: target.id, title: "sohbet" });
    // Hedefin yorumuna başkası yanıt verdi: metin silinir, yeri kalır. Diğer yorumu tamamen gider.
    const [root] = await db
      .insert(comments)
      .values({
        targetType: "entry",
        targetId: theirs.id,
        authorId: target.id,
        body: "gizli metin",
      })
      .returning();
    await db.insert(comments).values([
      {
        targetType: "entry",
        targetId: theirs.id,
        authorId: bystander.id,
        body: "yanıt",
        parentId: root?.id,
      },
      { targetType: "entry", targetId: theirs.id, authorId: target.id, body: "tek başına" },
    ]);
    await db
      .insert(reactions)
      .values({ userId: target.id, targetType: "entry", targetId: theirs.id });
    await db.insert(steamAccounts).values({ userId: target.id, steamId: "7656" });

    const { removed } = await purgeUserData(actor, target.id, ["screenshots", "ai", "social"]);
    expect(removed).toMatchObject({
      screenshots: 2,
      files: 1,
      threads: 1,
      comments: 1,
      reactions: 1,
    });

    expect(await db.select().from(screenshots).where(eq(screenshots.userId, target.id))).toEqual(
      [],
    );
    expect(await db.select().from(chatThreads).where(eq(chatThreads.userId, target.id))).toEqual(
      [],
    );
    const left = await db.select().from(comments).where(eq(comments.authorId, target.id));
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: root?.id, body: "" });
    expect(left[0]?.deletedAt).not.toBeNull();
    // Seçilmeyenler ve başkasının verisi yerinde.
    expect(
      await db.select().from(libraryEntries).where(eq(libraryEntries.userId, target.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(steamAccounts).where(eq(steamAccounts.userId, target.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(libraryEntries).where(eq(libraryEntries.userId, bystander.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(comments).where(eq(comments.authorId, bystander.id)),
    ).toHaveLength(1);
    // Dosya depodan worker'da silinir.
    const events = await db
      .select()
      .from(outbox)
      .where(eq(outbox.type, "storage.objects_orphaned"));
    expect(events.flatMap((event) => event.payload.keys as string[])).toContain(
      `users/${target.id}/screenshots/a/display.avif`,
    );

    await purgeUserData(actor, target.id, ["library", "platforms", "profile"]);
    expect(
      await db.select().from(libraryEntries).where(eq(libraryEntries.userId, target.id)),
    ).toEqual([]);
    expect(
      await db.select().from(steamAccounts).where(eq(steamAccounts.userId, target.id)),
    ).toEqual([]);
    const [profile] = await db.select().from(user).where(eq(user.id, target.id));
    expect(profile?.bio).toBeNull();

    const { entries } = await listAudit({ targetType: "user", targetId: target.id });
    expect(entries.map((item) => item.action)).toEqual(["user.purge", "user.purge"]);
    await expect(purgeUserData(actor, target.id, [])).rejects.toMatchObject({ code: "invalid" });
  });

  it("deletes an account after typed confirmation and keeps anonymous cost history", async () => {
    const { actor } = await createAdmin();
    const target = await createUser();
    const game = await createGame();
    await addEntry(target.id, { gameId: game.id, status: "completed" });
    await recordRun({ userId: target.id, purpose: "chat", startedAt: Date.now() });
    await db.insert(activities).values({ actorId: target.id, verb: "rated", gameId: game.id });
    await db
      .insert(notifications)
      .values({ recipientId: target.id, type: "comment", groupKey: "x" });

    await expect(deleteUserAccount(actor, target.id, "yanlış")).rejects.toMatchObject({
      code: "invalid",
    });
    await deleteUserAccount(actor, target.id, `@${target.displayUsername}`);

    expect(await db.select().from(user).where(eq(user.id, target.id))).toEqual([]);
    const runs = await db.select().from(aiUsage);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.userId).toBeNull();
    const [entry] = await db.select().from(adminAudit).where(eq(adminAudit.action, "user.delete"));
    expect(entry).toMatchObject({
      targetId: target.id,
      targetLabel: `@${target.displayUsername}`,
      adminName: actor.name,
    });
    // Silinen kişinin e-postası kayıtta tutulmaz.
    expect(JSON.stringify(entry)).not.toContain(target.email);
    await expect(deleteUserAccount(actor, actor.id, "x")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("system", () => {
  it("toggles sign-ups and reports settings", async () => {
    const { actor } = await createAdmin();
    expect(await signupsOpen()).toBe(true);
    const settings = await updateSettings(actor, { signupsOpen: false });
    expect(settings.signupsOpen).toBe(false);
    expect(await signupsOpen()).toBe(false);
    expect((await adminSettings()).ai.pricesCustomized).toBe(false);
  });

  it("writes logs in batches and lists them newest first with filters", async () => {
    process.env.SYSTEM_LOG_DB = "on";
    try {
      log({ level: "info", source: "api", event: "started", message: "hazır" });
      log({
        level: "error",
        source: "worker",
        event: "job_failed",
        message: "steam.sync-user: boom",
      });
      await flushLogs();
    } finally {
      process.env.SYSTEM_LOG_DB = "off";
    }
    const all = await listLogs({});
    expect(all.logs.map((row) => row.event)).toEqual(["job_failed", "started"]);
    expect((await listLogs({ level: "problems" })).logs).toHaveLength(1);
    expect((await listLogs({ q: "boom" })).logs[0]?.source).toBe("worker");
  });

  it("re-queues an outbox event that ran out of attempts", async () => {
    const { actor } = await createAdmin();
    const [dead] = await db
      .insert(outbox)
      .values({
        type: "igdb.match_requested",
        payload: {},
        attempts: 8,
        lastError: "boom",
        processedAt: new Date(),
      })
      .returning();
    await retryOutboxEvent(actor, dead?.id ?? 0);
    const [row] = await db
      .select()
      .from(outbox)
      .where(eq(outbox.id, dead?.id ?? 0));
    expect(row?.processedAt).toBeNull();
    await expect(retryOutboxEvent(actor, dead?.id ?? 0)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("builds the overview", async () => {
    await createAdmin();
    const overview = await adminOverview();
    expect(overview.kpi.users).toBe(1);
    expect(overview.signups).toHaveLength(30);
    expect(overview.ai.days).toHaveLength(30);
  });
});

describe("model selection", () => {
  it("overrides the environment's model chain and falls back when cleared", async () => {
    const { aiStatus, setModelSettings } = await import("../src/ai/models");
    process.env.GOOGLE_GENERATIVE_AI_API_KEYS = "test-key-1";
    process.env.AI_MODEL = "gemini-3.5-flash-lite";
    try {
      const chains = async () => {
        const status = await aiStatus();
        return status.enabled ? status.chains : null;
      };
      expect((await chains())?.chat).toEqual(["google:gemini-3.5-flash-lite"]);
      await setModelSettings({
        model: "gemini-3.5-flash",
        fallbackModels: ["gemini-2.5-flash"],
        lightModel: "gemini-2.5-flash-lite",
      });
      expect(await chains()).toEqual({
        chat: ["google:gemini-3.5-flash", "google:gemini-2.5-flash"],
        light: [
          "google:gemini-2.5-flash-lite",
          "google:gemini-3.5-flash",
          "google:gemini-2.5-flash",
        ],
      });
      await setModelSettings(null);
      expect((await chains())?.chat).toEqual(["google:gemini-3.5-flash-lite"]);
    } finally {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEYS;
      delete process.env.AI_MODEL;
    }
  });
});
