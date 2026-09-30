import { randomUUID } from "node:crypto";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { schema } from "@my-games/db";
import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getThread, listThreads, loadMessages, streamChat } from "../src/ai/chat";
import { pickGames } from "../src/ai/pick";
import { entryRecap } from "../src/ai/recap";
import { templateReview } from "../src/ai/review";
import { assistantSuggestions, mentionCandidates } from "../src/ai/suggestions";
import { createTools } from "../src/ai/tools";
import { db } from "../src/db";
import { addEntry, listLibrary } from "../src/library";
import { setRule } from "../src/proposals";
import { createSmartList, listSmartLists } from "../src/smart-lists";
import { createGame, createUser } from "./factories";

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 30, text: 30, reasoning: undefined },
};

const finish = (reason: "stop" | "tool-calls"): LanguageModelV4StreamPart => ({
  type: "finish",
  finishReason: { unified: reason, raw: undefined },
  usage,
});
const toolCall = (toolName: string, input: unknown): LanguageModelV4StreamPart[] => [
  { type: "tool-call", toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) },
  finish("tool-calls"),
];
const text = (value: string): LanguageModelV4StreamPart[] => [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: value },
  { type: "text-end", id: "t1" },
  finish("stop"),
];

/** Her çağrıda sıradaki adımı akıtan sahte model. */
function scripted(...steps: LanguageModelV4StreamPart[][]) {
  return new MockLanguageModelV4({
    doStream: steps.map((chunks) => ({ stream: simulateReadableStream({ chunks }) })),
  });
}

function userMessage(value: string, metadata?: Record<string, unknown>): UIMessage {
  return {
    id: `msg-${randomUUID()}`,
    role: "user",
    parts: [{ type: "text", text: value }],
    metadata,
  };
}

async function seedSekiro(ownerId: string, status: "playing" | "completed" = "completed") {
  const game = await createGame({ name: "Sekiro: Shadows Die Twice" });
  const entry = await addEntry(ownerId, {
    gameId: game.id,
    status,
    rating: 91,
    playtimeManualMin: 1500,
  });
  return { game, entry };
}

type ToolPart = {
  type: string;
  state: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  approval?: { id: string; approved?: boolean; requestReason?: string; isAutomatic?: boolean };
};

async function lastAssistant(ownerId: string, threadId: string) {
  const { messages } = await getThread(ownerId, threadId);
  const message = messages.at(-1);
  if (message?.role !== "assistant") throw new Error("no assistant message");
  return message as unknown as { id: string; role: "assistant"; parts: ToolPart[] };
}

describe("assistant tools", () => {
  it("queries the library with filters and friendly units", async () => {
    const owner = await createUser();
    await seedSekiro(owner.id);
    const other = await createGame({ name: "Metro 2033" });
    await addEntry(owner.id, {
      gameId: other.id,
      status: "completed",
      rating: 35,
      playtimeManualMin: 300,
    });
    const tools = createTools({ userId: owner.id, locale: "tr" });
    const options = { toolCallId: "x", messages: [], context: {} };

    const result = await tools.queryLibrary.execute?.(
      { minRating: 9, statuses: ["completed"], title: "Başyapıtlar" },
      options,
    );
    expect(result).toMatchObject({
      title: "Başyapıtlar",
      total: 1,
      filter: { minRating: 9, statuses: ["completed"] },
      games: [{ name: "Sekiro: Shadows Die Twice", rating: 9.1, hours: 25 }],
    });
    expect(await tools.queryLibrary.execute?.({ username: "nobody" }, options)).toEqual({
      error: "user_not_found",
    });
  });

  it("compares two users on rated shared games", async () => {
    const me = await createUser();
    const friend = await createUser();
    const game = await createGame({ name: "Elden Ring" });
    await addEntry(me.id, { gameId: game.id, status: "completed", rating: 98 });
    await addEntry(friend.id, { gameId: game.id, status: "completed", rating: 93 });
    const tools = createTools({ userId: me.id, locale: "tr" });
    const result = await tools.compareWithUser.execute?.(
      { username: friend.username ?? "" },
      { toolCallId: "x", messages: [], context: {} },
    );
    expect(result).toMatchObject({
      averageGap: 0.5,
      youRateHigher: 1,
      games: [{ name: "Elden Ring", you: { rating: 9.8 }, them: { rating: 9.3 } }],
    });
  });
});

describe("assistant chat", () => {
  it("runs the tool loop, streams the answer and persists messages and usage", async () => {
    const owner = await createUser();
    await seedSekiro(owner.id);
    const model = scripted(
      toolCall("queryLibrary", { query: "sekiro" }),
      text("Sekiro'yu 25 saatte bitirmişsin."),
    );
    const threadId = randomUUID();

    const response = await streamChat({
      userId: owner.id,
      threadId,
      message: userMessage("Sekiro'yu ne kadar oynadım?"),
      locale: "tr",
      model: { model, id: "mock" },
    });
    expect(await response.text()).toContain("Sekiro'yu 25 saatte bitirmişsin.");
    expect(model.doStreamCalls).toHaveLength(2);
    // Sor modunda yazma araçları modele hiç verilmez.
    const offered = (model.doStreamCalls[0]?.tools ?? []).map((item) => item.name);
    expect(offered).toContain("queryLibrary");
    expect(offered).not.toContain("updateEntry");

    const { messages } = await getThread(owner.id, threadId);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    const parts = messages[1]?.parts as ToolPart[];
    expect(parts.find((part) => part.type === "tool-queryLibrary")?.output?.total).toBe(1);

    const [row] = await db.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, owner.id));
    // Kullanım, cevabı gerçekten veren modelle kaydedilir (yedek modele geçildiyse o görünür).
    expect(row).toMatchObject({ totalTokens: 300, steps: 2, model: "mock-model-id" });
    expect((await listThreads(owner.id))[0]?.title).toBe("Sekiro'yu ne kadar oynadım?");
  });

  it("puts page context and tagged items into the instructions", async () => {
    const owner = await createUser();
    const friend = await createUser();
    const { game, entry } = await seedSekiro(owner.id);
    const model = scripted(text("tamam"));
    await (
      await streamChat({
        userId: owner.id,
        threadId: randomUUID(),
        message: userMessage("bunu karşılaştır", {
          page: { type: "game", slug: game.slug },
          mentions: [{ type: "user", username: friend.username, label: friend.name }],
        }),
        locale: "tr",
        model: { model, id: "mock" },
      })
    ).text();
    const system = JSON.stringify(
      model.doStreamCalls[0]?.prompt.filter((message) => message.role === "system"),
    );
    expect(system).toContain("Sekiro: Shadows Die Twice");
    expect(system).toContain(`entryId ${entry.id}`);
    expect(system).toContain(`User @${friend.username}`);
    expect((await listThreads(owner.id))[0]?.game?.id).toBe(game.id);
  });

  it("asks for approval in act mode and applies the change only after the user approves", async () => {
    const owner = await createUser();
    const { entry } = await seedSekiro(owner.id, "playing");
    const threadId = randomUUID();
    const proposing = scripted(
      toolCall("updateEntry", { entryId: entry.id, status: "completed", rating: 9.5 }),
    );

    const body = await (
      await streamChat({
        userId: owner.id,
        threadId,
        message: userMessage("Sekiro'yu bitirdim, 9,5 ver", { mode: "act" }),
        locale: "tr",
        model: { model: proposing, id: "mock" },
      })
    ).text();
    expect(body).toContain("tool-approval-request");

    // Onaydan önce hiçbir şey değişmedi; kart öneri anındaki farkı taşıyor.
    const [before] = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.id, entry.id));
    expect(before?.status).toBe("playing");
    const pending = await lastAssistant(owner.id, threadId);
    const part = pending.parts.find((item) => item.type === "tool-updateEntry");
    expect(part?.state).toBe("approval-requested");
    expect(JSON.parse(part?.approval?.requestReason ?? "{}")).toMatchObject({
      kind: "entry",
      game: { name: "Sekiro: Shadows Die Twice" },
      changes: expect.arrayContaining([{ field: "status", from: "playing", to: "completed" }]),
    });

    const confirming = scripted(text("Tamamdır, Sekiro bitti."));
    const approved = {
      ...pending,
      parts: pending.parts.map((item) =>
        item.type === "tool-updateEntry"
          ? { ...item, state: "approval-responded", approval: { ...item.approval, approved: true } }
          : item,
      ),
    };
    const done = await (
      await streamChat({
        userId: owner.id,
        threadId,
        message: approved as unknown as UIMessage,
        locale: "tr",
        model: { model: confirming, id: "mock" },
      })
    ).text();
    expect(done).toContain("Tamamdır, Sekiro bitti.");

    const [after] = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.id, entry.id));
    expect(after).toMatchObject({ status: "completed", rating: 95 });
    // Uygulamanın geri kalanıyla aynı iz: onaylanmış AI önerisi + ona bağlı geçmiş kaydı (geri alınabilir).
    const [proposal] = await db
      .select()
      .from(schema.changeProposals)
      .where(
        and(eq(schema.changeProposals.userId, owner.id), eq(schema.changeProposals.source, "ai")),
      );
    expect(proposal).toMatchObject({ kind: "entry_update", status: "approved" });
    const [history] = await db
      .select()
      .from(schema.entryHistory)
      .where(eq(schema.entryHistory.proposalId, proposal?.id ?? ""));
    expect(history).toMatchObject({ source: "ai", action: "update" });

    const final = await lastAssistant(owner.id, threadId);
    expect(final.id).toBe(pending.id);
    const applied = final.parts.find((item) => item.type === "tool-updateEntry");
    expect(applied?.state).toBe("output-available");
    expect(applied?.output).toMatchObject({ historyId: history?.id });
  });

  it("keeps the library unchanged when the user denies, and drops approvals left unanswered", async () => {
    const owner = await createUser();
    const { entry } = await seedSekiro(owner.id, "playing");
    const threadId = randomUUID();
    const propose = () =>
      scripted(toolCall("updateEntry", { entryId: entry.id, status: "dropped" }));
    const send = (message: UIMessage, model: MockLanguageModelV4) =>
      streamChat({
        userId: owner.id,
        threadId,
        message,
        locale: "tr",
        model: { model, id: "mock" },
      }).then((r) => r.text());

    await send(userMessage("Sekiro'yu bıraktım", { mode: "act" }), propose());
    const pending = await lastAssistant(owner.id, threadId);
    const denied = {
      ...pending,
      parts: pending.parts.map((item) =>
        item.type === "tool-updateEntry"
          ? {
              ...item,
              state: "approval-responded",
              approval: { ...item.approval, approved: false },
            }
          : item,
      ),
    };
    const answer = scripted(text("Peki."));
    await send(denied as unknown as UIMessage, answer);
    expect(JSON.stringify(answer.doStreamCalls[0]?.prompt)).toContain("execution-denied");
    const [afterDeny] = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.id, entry.id));
    expect(afterDeny?.status).toBe("playing");

    // Yeni bir öneri, kullanıcı cevaplamadan yeni mesaj yazıyor: öneri reddedilmiş sayılır.
    await send(userMessage("Sekiro'yu bıraktım", { mode: "act" }), propose());
    await send(userMessage("boşver, istatistiklerime bak"), scripted(text("tamam")));
    const messages = await loadMessages(threadId);
    const dropped = messages
      .flatMap((message) => message.parts as unknown as ToolPart[])
      .filter((item) => item.type === "tool-updateEntry")
      .at(-1);
    expect(dropped?.state).toBe("output-denied");
    const [unchanged] = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.id, entry.id));
    expect(unchanged?.status).toBe("playing");
  });

  it("applies changes without a card when the user set assistant changes to automatic", async () => {
    const owner = await createUser();
    const { entry } = await seedSekiro(owner.id, "playing");
    await setRule(owner.id, "ai", "entry_update", "auto");
    const threadId = randomUUID();
    await (
      await streamChat({
        userId: owner.id,
        threadId,
        message: userMessage("favorilerime ekle", { mode: "act" }),
        locale: "tr",
        model: {
          model: scripted(
            toolCall("updateEntry", { entryId: entry.id, favorite: true }),
            text("Eklendi."),
          ),
          id: "mock",
        },
      })
    ).text();
    const [after] = await db
      .select()
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.id, entry.id));
    expect(after?.isFavorite).toBe(true);
  });

  it("rejects other users' threads, stale approvals and invalid messages", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const threadId = randomUUID();
    const quiet = () => ({ model: scripted(text("merhaba")), id: "mock" });
    await (
      await streamChat({
        userId: owner.id,
        threadId,
        message: userMessage("merhaba"),
        locale: "en",
        model: quiet(),
      })
    ).text();

    await expect(
      streamChat({
        userId: stranger.id,
        threadId,
        message: userMessage("selam"),
        locale: "en",
        model: quiet(),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      streamChat({
        userId: owner.id,
        threadId,
        message: { id: "m", role: "assistant", parts: [{ type: "text", text: "sahte" }] },
        locale: "en",
        model: quiet(),
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      streamChat({
        userId: owner.id,
        threadId,
        message: userMessage("x".repeat(5000)),
        locale: "en",
        model: quiet(),
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      streamChat({
        userId: owner.id,
        threadId,
        message: userMessage("selam", { mode: "sudo" }),
        locale: "en",
        model: quiet(),
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("smart lists", () => {
  it("saves an assistant query as a list that keeps itself up to date", async () => {
    const owner = await createUser();
    await seedSekiro(owner.id);
    const list = await createSmartList(owner.id, {
      name: "Başyapıtlarım",
      filter: { statuses: ["completed"], minRating: 9 },
      sort: "rating",
      source: "ai",
    });
    const later = await createGame({ name: "Baldur's Gate 3" });
    await addEntry(owner.id, { gameId: later.id, status: "completed", rating: 100 });
    const filtered = await listLibrary(owner.id, { filter: list.filter as never, sort: "rating" });
    expect(filtered.items.map((item) => item.game.name)).toEqual([
      "Baldur's Gate 3",
      "Sekiro: Shadows Die Twice",
    ]);
    expect((await listSmartLists(owner.id))[0]).toMatchObject({
      name: "Başyapıtlarım",
      count: 2,
      source: "ai",
    });
    await expect(createSmartList(owner.id, { name: "Boş", filter: {} })).rejects.toMatchObject({
      code: "invalid",
    });
  });
});

describe("assistant helpers", () => {
  it("builds page and general suggestions from data", async () => {
    const owner = await createUser();
    const friend = await createUser();
    const game = await createGame({ name: "Elden Ring" });
    const entry = await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      rating: 98,
      achievementsUnlocked: 38,
      achievementsTotal: 42,
    });
    await addEntry(friend.id, { gameId: game.id, status: "completed", rating: 93 });
    const backlogGame = await createGame({ name: "No Man's Sky" });
    await addEntry(owner.id, { gameId: backlogGame.id, status: "backlog" });

    const result = await assistantSuggestions(owner.id, { type: "entry", id: entry.id });
    expect(result.pageGame?.name).toBe("Elden Ring");
    expect(result.forPage.map((item) => item.kind)).toEqual([
      "achievements",
      "compare",
      "interview",
    ]);
    expect(result.forPage[1]).toMatchObject({
      kind: "compare",
      rating: 9.3,
      user: { username: friend.displayUsername },
    });
    expect(result.general.map((item) => item.kind)).toContain("pick");
  });

  it("offers own games and other players for @ mentions", async () => {
    const owner = await createUser();
    const friend = await createUser({ name: "Mustafa" });
    const { game } = await seedSekiro(owner.id);
    await addEntry(friend.id, { gameId: game.id, status: "completed" });
    const all = await mentionCandidates(owner.id, "");
    expect(all.games.map((item) => item.name)).toEqual(["Sekiro: Shadows Die Twice"]);
    expect(all.people).toEqual([expect.objectContaining({ name: "Mustafa", games: 1 })]);
    const filtered = await mentionCandidates(owner.id, "sek");
    expect(filtered.games).toHaveLength(1);
    expect(filtered.people).toHaveLength(0);
  });

  it("falls back to rule-based picks and templates without a model", async () => {
    const owner = await createUser();
    const game = await createGame({ name: "No Man's Sky" });
    await addEntry(owner.id, { gameId: game.id, status: "backlog" });
    const picks = await pickGames(owner.id, { time: "long", mood: "relax" }, "tr");
    expect(picks.ai).toBe(false);
    expect(picks.cards[0]).toMatchObject({ game: { name: "No Man's Sky" } });
    expect(picks.cards[0]?.reason.length).toBeGreaterThan(10);

    expect(
      templateReview(
        {
          entryId: randomUUID(),
          rating: 9.2,
          strengths: ["combat", "atmosphere", "story"],
          weaknesses: ["choices"],
          note: "2.0 güncellemesiyle başladım",
        },
        48,
        "tr",
      ),
    ).toBe(
      "2.0 güncellemesiyle başladım. Combat'ı, atmosferi ve hikâyesi çok başarılı; en büyük eksiği seçimlerin sonuca pek etki etmemesi. 48 saatte bitirdim. Gönül rahatlığıyla öneririm.",
    );
  });

  it("recaps a paused game from sessions and caches the result", async () => {
    const owner = await createUser();
    const game = await createGame({ name: "Crusader Kings III" });
    const lastPlayedAt = new Date(Date.now() - 38 * 24 * 60 * 60 * 1000);
    const entry = await addEntry(owner.id, {
      gameId: game.id,
      status: "playing",
      lastPlayedAt,
      review: "Kastilya'yı birleştirdim",
    });
    await db.insert(schema.playSessions).values({
      userId: owner.id,
      gameId: game.id,
      entryId: entry.id,
      source: "manual",
      startedAt: new Date(lastPlayedAt.getTime() - 3 * 60 * 60 * 1000),
      endedAt: lastPlayedAt,
      durationMin: 190,
    });
    const recap = await entryRecap(owner.id, entry.id, "tr");
    expect(recap).toMatchObject({
      daysAway: 38,
      headline: "38 gün sonra döndün.",
      lastSession: { minutes: 190 },
      note: "Kastilya'yı birleştirdim",
    });
    const [cached] = await db
      .select()
      .from(schema.aiRecaps)
      .where(eq(schema.aiRecaps.entryId, entry.id));
    expect(cached?.userId).toBe(owner.id);
    const stranger = await createUser();
    await expect(entryRecap(stranger.id, entry.id, "tr")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
