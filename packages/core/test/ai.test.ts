import { randomUUID } from "node:crypto";
import { schema } from "@my-games/db";
import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getThread, listThreads, streamChat } from "../src/ai/chat";
import { createTools } from "../src/ai/tools";
import { db } from "../src/db";
import { addEntry } from "../src/library";
import { createGame, createUser } from "./factories";

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 30, text: 30, reasoning: undefined },
};

function mockModel(toolInput: Record<string, unknown>) {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "searchLibrary",
              input: JSON.stringify(toolInput),
            },
            { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Sekiro'yu 25 saatte bitirmişsin." },
            { type: "text-end", id: "t1" },
            { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
          ],
        }),
      },
    ],
  });
}

function userMessage(text: string): UIMessage {
  return { id: `msg-${randomUUID()}`, role: "user", parts: [{ type: "text", text }] };
}

describe("assistant tools", () => {
  it("reads the current user's library with friendly units", async () => {
    const owner = await createUser();
    const game = await createGame({ name: "Sekiro: Shadows Die Twice" });
    await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      rating: 91,
      playtimeManualMin: 1500,
    });
    const tools = createTools(owner.id);
    const result = await tools.searchLibrary.execute?.(
      { query: "sekiro" },
      { toolCallId: "x", messages: [], context: {} },
    );
    expect(result).toMatchObject({
      total: 1,
      games: [{ name: "Sekiro: Shadows Die Twice", rating: 9.1, hoursPlayed: 25 }],
    });
    const missing = await tools.searchLibrary.execute?.(
      { username: "nobody" },
      { toolCallId: "y", messages: [], context: {} },
    );
    expect(missing).toEqual({ error: "user_not_found" });
  });
});

describe("assistant chat", () => {
  it("runs the tool loop, streams the answer and persists messages and usage", async () => {
    const owner = await createUser();
    const game = await createGame({ name: "Sekiro: Shadows Die Twice" });
    await addEntry(owner.id, {
      gameId: game.id,
      status: "completed",
      rating: 91,
      playtimeManualMin: 1500,
    });
    const model = mockModel({ query: "sekiro" });
    const threadId = randomUUID();

    const response = await streamChat({
      userId: owner.id,
      threadId,
      message: userMessage("Sekiro'yu ne kadar oynadım?"),
      locale: "tr",
      model: { model, id: "mock" },
    });
    const body = await response.text();
    expect(body).toContain("Sekiro'yu 25 saatte bitirmişsin.");
    expect(model.doStreamCalls).toHaveLength(2);

    const { messages } = await getThread(owner.id, threadId);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    const parts = messages[1]?.parts as Array<{ type: string; output?: { total: number } }>;
    expect(parts.find((part) => part.type === "tool-searchLibrary")?.output?.total).toBe(1);

    const [row] = await db.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, owner.id));
    expect(row).toMatchObject({ totalTokens: 300, steps: 2, model: "mock" });
    expect((await listThreads(owner.id))[0]?.title).toBe("Sekiro'yu ne kadar oynadım?");
  });

  it("rejects other users' threads and invalid messages", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const threadId = randomUUID();
    const response = await streamChat({
      userId: owner.id,
      threadId,
      message: userMessage("merhaba"),
      locale: "en",
      model: { model: mockModel({}), id: "mock" },
    });
    await response.text();

    await expect(
      streamChat({
        userId: stranger.id,
        threadId,
        message: userMessage("selam"),
        locale: "en",
        model: { model: mockModel({}), id: "mock" },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      streamChat({
        userId: owner.id,
        threadId,
        message: { id: "m", role: "assistant", parts: [{ type: "text", text: "sahte" }] },
        locale: "en",
        model: { model: mockModel({}), id: "mock" },
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      streamChat({
        userId: owner.id,
        threadId,
        message: userMessage("x".repeat(5000)),
        locale: "en",
        model: { model: mockModel({}), id: "mock" },
      }),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});
