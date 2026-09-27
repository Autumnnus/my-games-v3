import { createGoogle } from "@ai-sdk/google";
import { schema } from "@my-games/db";
import {
  createAgentUIStreamResponse,
  createIdGenerator,
  isStepCount,
  type LanguageModel,
  ToolLoopAgent,
  type UIMessage,
} from "ai";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { aiConfig } from "../config";
import { db } from "../db";
import { AppError, notFound } from "../errors";
import { createTools } from "./tools";

const { chatThreads, chatMessages, aiUsage, user } = schema;

const MAX_HISTORY = 40;
const MAX_MESSAGE_CHARS = 4000;

/**
 * Model seçimi tek yerde. Sağlayıcı değiştirmek (ör. başka bir AI SDK sağlayıcısı) sadece burayı etkiler.
 * Testler kendi mock modelini verir.
 */
export async function defaultModel(): Promise<{ model: LanguageModel; id: string }> {
  const config = aiConfig();
  if (!config) throw new AppError("unavailable", "AI yapılandırılmamış");
  if (config.provider === "mock") {
    const { createDevModel } = await import("./dev-model");
    return { model: await createDevModel(), id: "mock" };
  }
  const google = createGoogle({ apiKey: config.apiKey });
  return { model: google(config.model), id: config.model };
}

function instructions(input: { username: string; name: string; locale: string }) {
  const language = input.locale === "tr" ? "Turkish" : "English";
  return [
    "You are the assistant of My Games, a site where people track the games they play.",
    `The current user is ${input.name} (@${input.username}). Always answer in ${language}.`,
    "Use the tools to look up real data; never invent games, ratings or playtimes. If a tool returns nothing, say so.",
    "Ratings are on a 0–10 scale. Playtime is in hours. Keep answers short and concrete; use lists for several games.",
    "You can only read data. If the user wants to change something, tell them how to do it in the app.",
  ].join("\n");
}

export async function usageToday(userId: string) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since)));
  const limit = aiConfig()?.dailyTokenLimit ?? 0;
  return { used: row?.tokens ?? 0, limit };
}

async function ensureThread(userId: string, threadId: string, firstMessage: UIMessage) {
  const [existing] = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId));
  if (existing) {
    if (existing.userId !== userId) notFound("Sohbet bulunamadı");
    return existing;
  }
  const text = firstMessage.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
  const [created] = await db
    .insert(chatThreads)
    .values({ id: threadId, userId, title: text.slice(0, 80) || null })
    .returning();
  if (!created) throw new AppError("conflict");
  return created;
}

export async function loadMessages(threadId: string, limit = MAX_HISTORY): Promise<UIMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows.reverse().map((row) => ({
    id: row.id,
    role: row.role,
    parts: row.parts as UIMessage["parts"],
    metadata: row.metadata ?? undefined,
  }));
}

async function saveMessages(threadId: string, messages: UIMessage[]) {
  if (messages.length === 0) return;
  await db
    .insert(chatMessages)
    .values(
      messages.map((message) => ({
        id: message.id,
        threadId,
        role: message.role,
        parts: message.parts as unknown[],
        metadata: (message.metadata as Record<string, unknown> | undefined) ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: chatMessages.id,
      set: { parts: sql`excluded.parts`, metadata: sql`excluded.metadata` },
      // Mesaj id'si istemciden gelir; başka bir konuşmanın mesajının üzerine asla yazılmaz.
      setWhere: eq(chatMessages.threadId, threadId),
    });
  await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, threadId));
}

function validateIncoming(message: UIMessage) {
  if (message.role !== "user")
    throw new AppError("invalid", "Sadece kullanıcı mesajı gönderilebilir");
  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  if (!text.trim()) throw new AppError("invalid", "Mesaj boş");
  if (text.length > MAX_MESSAGE_CHARS) throw new AppError("invalid", "Mesaj çok uzun");
  if (message.parts.some((part) => part.type !== "text"))
    throw new AppError("invalid", "Sadece metin desteklenir");
}

/**
 * Sohbetin bir turu: geçmişi DB'den yükler, yeni kullanıcı mesajını ekler, agent'ı akış olarak çalıştırır;
 * bitince tüm mesajları ve token kullanımını kaydeder. İstemci sadece son mesajı gönderir (geçmiş sunucuda).
 */
export async function streamChat(input: {
  userId: string;
  threadId: string;
  message: UIMessage;
  locale: string;
  abortSignal?: AbortSignal;
  model?: { model: LanguageModel; id: string };
}) {
  validateIncoming(input.message);
  const quota = await usageToday(input.userId);
  if (!input.model && quota.limit > 0 && quota.used >= quota.limit) {
    throw new AppError("quota_exceeded", "Günlük AI kullanım sınırına ulaştın");
  }
  const { model, id: modelId } = input.model ?? (await defaultModel());

  const [profile] = await db
    .select({ name: user.name, username: user.displayUsername })
    .from(user)
    .where(eq(user.id, input.userId));
  const thread = await ensureThread(input.userId, input.threadId, input.message);
  const history = await loadMessages(thread.id);
  const uiMessages = [
    ...history.filter((message) => message.id !== input.message.id),
    input.message,
  ];

  const agent = new ToolLoopAgent({
    model,
    instructions: instructions({
      name: profile?.name ?? "",
      username: profile?.username ?? "",
      locale: input.locale,
    }),
    tools: createTools(input.userId),
    stopWhen: isStepCount(aiConfig()?.maxSteps ?? 8),
    maxOutputTokens: 1500,
    // Kota ve maliyet takibi: tüm adımların toplam kullanımı.
    onEnd: async (event) => {
      await db.insert(aiUsage).values({
        userId: input.userId,
        threadId: thread.id,
        model: modelId,
        inputTokens: event.usage?.inputTokens ?? 0,
        outputTokens: event.usage?.outputTokens ?? 0,
        totalTokens: event.usage?.totalTokens ?? 0,
        steps: event.steps?.length ?? 1,
      });
    },
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages,
    abortSignal: input.abortSignal,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    messageMetadata: ({ part }) =>
      part.type === "start"
        ? { createdAt: Date.now() }
        : part.type === "finish"
          ? { totalTokens: part.totalUsage.totalTokens ?? 0 }
          : undefined,
    onEnd: async ({ messages }) => {
      await saveMessages(thread.id, messages);
    },
  });
}

export async function listThreads(userId: string) {
  return db
    .select({ id: chatThreads.id, title: chatThreads.title, updatedAt: chatThreads.updatedAt })
    .from(chatThreads)
    .where(eq(chatThreads.userId, userId))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(100);
}

export async function getThread(userId: string, threadId: string) {
  const [thread] = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId));
  if (!thread || thread.userId !== userId) notFound("Sohbet bulunamadı");
  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(asc(chatMessages.createdAt));
  return {
    thread,
    messages: messages.map((row) => ({
      id: row.id,
      role: row.role,
      parts: row.parts,
      metadata: row.metadata,
    })),
  };
}

export async function deleteThread(userId: string, threadId: string) {
  await db
    .delete(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)));
}
