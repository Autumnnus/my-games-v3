import { schema } from "@my-games/db";
import {
  createAgentUIStreamResponse,
  createIdGenerator,
  generateText,
  isToolUIPart,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { aiConfig } from "../config";
import { db } from "../db";
import { AppError, notFound } from "../errors";
import { errorInfo, errorMessageOf, logger } from "../log";
import { createAssistantAgent } from "./agent";
import {
  type AssistantMode,
  resolveContext,
  type UserMessageMetadata,
  userMessageMetadataSchema,
} from "./context";
import { resolveModel } from "./models";
import { AiUnavailableError } from "./pooled-model";
import type { AssistantUITools } from "./tools";
import { READ_TOOLS, WRITE_TOOLS } from "./tools";
import { assertQuota, recordRun, type StepLike } from "./usage";

const { chatThreads, chatMessages, user, games } = schema;

const MAX_HISTORY = 40;
const MAX_MESSAGE_CHARS = 4000;
const KNOWN_TOOLS = new Set<string>([...READ_TOOLS, ...WRITE_TOOLS]);

export type AssistantMessageMetadata = UserMessageMetadata & {
  model?: string;
  totalTokens?: number;
};
export type AssistantUIMessage = UIMessage<AssistantMessageMetadata, never, AssistantUITools>;

function textOf(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

export async function loadMessages(
  threadId: string,
  limit = MAX_HISTORY,
): Promise<AssistantUIMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows.reverse().map((row) => ({
    id: row.id,
    role: row.role,
    parts: row.parts as AssistantUIMessage["parts"],
    metadata: (row.metadata as AssistantMessageMetadata | null) ?? undefined,
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

function validateUserMessage(message: UIMessage): AssistantUIMessage {
  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  if (!text.trim()) throw new AppError("invalid", "Mesaj boş", "message_empty");
  if (text.length > MAX_MESSAGE_CHARS)
    throw new AppError("invalid", "Mesaj çok uzun", "message_too_long");
  if (message.parts.some((part) => part.type !== "text")) {
    throw new AppError("invalid", "Sadece metin desteklenir");
  }
  const metadata = userMessageMetadataSchema.safeParse(message.metadata ?? {});
  if (!metadata.success) throw new AppError("invalid", "Mesaj bilgisi geçersiz");
  return {
    id: message.id,
    role: "user",
    parts: message.parts.map((part) => ({
      type: "text" as const,
      text: part.type === "text" ? part.text : "",
    })),
    metadata: { ...metadata.data, createdAt: Date.now() },
  };
}

function hasPendingApproval(message: UIMessage | undefined) {
  return !!message?.parts.some((part) => isToolUIPart(part) && part.state === "approval-requested");
}

/**
 * Onay beklerken kullanıcı başka bir şey yazdıysa bekleyen öneriler reddedilmiş sayılır. Aksi hâlde model
 * cevapsız araç çağrılarıyla karşılaşır ve kart ekranda sonsuza kadar onay bekler.
 */
function denyPending(message: AssistantUIMessage): AssistantUIMessage {
  return {
    ...message,
    parts: message.parts.map((part) =>
      isToolUIPart(part) && part.state === "approval-requested"
        ? ({
            ...part,
            state: "output-denied",
            approval: {
              ...part.approval,
              approved: false,
              reason: "The user wrote a new message instead of answering.",
            },
          } as unknown as typeof part)
        : part,
    ),
  };
}

/**
 * Onay turu: istemcinin gönderdiği asistan mesajından yalnızca kararlar (onay/ret ve gerekçe) alınır, geri
 * kalan her şey sunucudaki kayıttan gelir. İstemci araç girdisini ya da çıktısını değiştiremez; onayların
 * imzası da agent tarafından ayrıca doğrulanır.
 */
function mergeApprovals(stored: AssistantUIMessage, incoming: UIMessage): AssistantUIMessage {
  const decisions = new Map<string, { approved: boolean; reason?: string }>();
  for (const part of incoming.parts) {
    if (isToolUIPart(part) && part.state === "approval-responded") {
      decisions.set(part.approval.id, {
        approved: part.approval.approved === true,
        reason: part.approval.reason?.slice(0, 300),
      });
    }
  }
  let changed = 0;
  const parts = stored.parts.map((part) => {
    if (!isToolUIPart(part) || part.state !== "approval-requested") return part;
    const decision = decisions.get(part.approval.id);
    if (!decision) return part;
    changed++;
    return {
      ...part,
      state: "approval-responded",
      approval: { ...part.approval, approved: decision.approved, reason: decision.reason },
    } as unknown as typeof part;
  });
  if (changed === 0) throw new AppError("invalid", "Yanıtlanacak onay yok");
  return { ...stored, parts };
}

/**
 * Model geçmişi: artık olmayan araçların parçaları (eski sürümler) ve yarım kalmış araç çağrıları (akış
 * kesildi) çıkarılır; bunlar modele cevapsız çağrı olarak gider ve sağlayıcı isteği reddeder.
 */
function forModel(messages: AssistantUIMessage[]) {
  return messages
    .map((message) => ({
      ...message,
      parts: message.parts.filter((part) => {
        if (!isToolUIPart(part)) return true;
        const name = part.type.slice("tool-".length);
        if (!KNOWN_TOOLS.has(name)) return false;
        return part.state !== "input-streaming" && part.state !== "input-available";
      }),
    }))
    .filter((message) => message.parts.length > 0);
}

async function ensureThread(input: {
  userId: string;
  threadId: string;
  title: string | null;
  contextGameId: string | null;
}) {
  const [existing] = await db.select().from(chatThreads).where(eq(chatThreads.id, input.threadId));
  if (existing) {
    if (existing.userId !== input.userId) notFound("Sohbet bulunamadı");
    return { thread: existing, created: false };
  }
  const [created] = await db
    .insert(chatThreads)
    .values({
      id: input.threadId,
      userId: input.userId,
      title: input.title?.slice(0, 80) || null,
      contextGameId: input.contextGameId,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) throw new AppError("conflict");
  return { thread: created, created: true };
}

/** Yeni sohbetin başlığı (hafif modelle, arka planda). Başarısız olursa ilk mesajın başı kalır. */
async function titleThread(threadId: string, userId: string, text: string, locale: string) {
  const startedAt = Date.now();
  try {
    const { model, id } = await resolveModel("light");
    if (id === "mock") return;
    const result = await generateText({
      model,
      maxOutputTokens: 30,
      maxRetries: 0,
      prompt: `Write a 2–5 word title in ${locale === "tr" ? "Turkish" : "English"} for a chat that starts with the message below. Reply with the title only, no quotes or punctuation at the end.\n\n${text.slice(0, 500)}`,
    });
    const title = result.text
      .trim()
      .replace(/^["'“”]+|["'“”.]+$/g, "")
      .slice(0, 60);
    if (title) await db.update(chatThreads).set({ title }).where(eq(chatThreads.id, threadId));
    await recordRun({ userId, threadId, purpose: "title", startedAt, steps: result.steps });
  } catch (error) {
    logger.warn("ai", "title_failed", `sohbet başlığı üretilemedi: ${errorMessageOf(error)}`, {
      userId,
    });
    await recordRun({ userId, threadId, purpose: "title", startedAt, error }).catch(() => {});
  }
}

/** Stream'deki hataları istemcinin çevirebileceği kısa kodlara indirger (ayrıntı loglanır). */
function streamErrorCode(error: unknown, userId: string, threadId: string) {
  if (error instanceof AiUnavailableError) {
    logger.error(
      "ai",
      "unavailable",
      `bütün anahtarlar dolu/bozuk (${error.reason ?? "?"}), en erken: ${error.retryAt?.toISOString() ?? "bilinmiyor"}`,
      { userId, context: { threadId } },
    );
    return `ai_busy${error.retryAt ? `:${error.retryAt.toISOString()}` : ""}`;
  }
  logger.error("ai", "chat_failed", `sohbet hatası: ${errorMessageOf(error)}`, {
    userId,
    context: { threadId, error: errorInfo(error) },
  });
  return "ai_error";
}

/**
 * Sohbetin bir turu. İki çeşit istek gelir:
 * - Kullanıcı mesajı: doğrulanır, bağlamıyla (mod, sayfa, etiketler) birlikte kaydedilir, agent çalışır.
 * - Onay turu (asistan mesajı): son asistan mesajına kullanıcının kararları işlenir, agent kaldığı yerden
 *   devam eder (onaylanan araçlar çalışır, reddedilenler modele bildirilir).
 * Geçmiş sunucuda tutulur; istemci yalnızca son mesajı gönderir.
 */
export async function streamChat(input: {
  userId: string;
  threadId: string;
  message: UIMessage;
  locale: string;
  abortSignal?: AbortSignal;
  model?: { model: LanguageModel; id: string };
}) {
  const incoming = input.message;
  if (incoming.role !== "user" && incoming.role !== "assistant") {
    throw new AppError("invalid", "Geçersiz mesaj");
  }
  if (!input.model) await assertQuota(input.userId);

  let uiMessages: AssistantUIMessage[];
  let metadata: UserMessageMetadata | undefined;
  let threadId = input.threadId;
  let firstText: string | null = null;

  if (incoming.role === "user") {
    const message = validateUserMessage(incoming);
    metadata = message.metadata;
    const context = await resolveContext(input.userId, metadata);
    const { thread, created } = await ensureThread({
      userId: input.userId,
      threadId: input.threadId,
      title: textOf(message),
      contextGameId: context.gameId,
    });
    threadId = thread.id;
    if (created) firstText = textOf(message);
    const history = await loadMessages(thread.id);
    const last = history.at(-1);
    if (last?.role === "assistant" && hasPendingApproval(last)) {
      const denied = denyPending(last);
      history[history.length - 1] = denied;
      await saveMessages(thread.id, [denied]);
    }
    uiMessages = [...history.filter((item) => item.id !== message.id), message];
    await saveMessages(thread.id, [message]);
    return runAgent({ ...input, threadId, uiMessages, metadata, contextLines: context, firstText });
  }

  const [thread] = await db.select().from(chatThreads).where(eq(chatThreads.id, input.threadId));
  if (!thread || thread.userId !== input.userId) notFound("Sohbet bulunamadı");
  const history = await loadMessages(thread.id);
  const last = history.at(-1);
  if (last?.role !== "assistant" || last.id !== incoming.id) {
    throw new AppError("conflict", "Onay artık geçerli değil");
  }
  const merged = mergeApprovals(last, incoming);
  uiMessages = [...history.slice(0, -1), merged];
  metadata = [...history].reverse().find((item) => item.role === "user")?.metadata;
  const context = await resolveContext(input.userId, metadata);
  return runAgent({ ...input, threadId, uiMessages, metadata, contextLines: context, firstText });
}

async function runAgent(input: {
  userId: string;
  threadId: string;
  locale: string;
  abortSignal?: AbortSignal;
  model?: { model: LanguageModel; id: string };
  uiMessages: AssistantUIMessage[];
  metadata: UserMessageMetadata | undefined;
  contextLines: Awaited<ReturnType<typeof resolveContext>>;
  firstText: string | null;
}) {
  const { model, id: modelId } = input.model ?? (await resolveModel("chat"));
  const [profile] = await db
    .select({ name: user.name, username: user.displayUsername })
    .from(user)
    .where(eq(user.id, input.userId));
  const mode: AssistantMode = input.metadata?.mode ?? "ask";
  if (input.firstText && !input.model)
    void titleThread(input.threadId, input.userId, input.firstText, input.locale);

  // İzleme: adımlar biriktirilir, tur bittiğinde (başarılı, hatalı ya da yarıda kesilmiş) tek satır yazılır.
  const startedAt = Date.now();
  const steps: StepLike[] = [];
  let failure: unknown = null;
  const agent = createAssistantAgent({
    model,
    ctx: {
      userId: input.userId,
      name: profile?.name ?? "",
      username: profile?.username ?? "",
      locale: input.locale,
      mode,
      context: input.contextLines,
      maxSteps: aiConfig()?.maxSteps ?? 10,
    },
    onStepEnd: (step) => {
      steps.push(step as StepLike);
    },
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: forModel(input.uiMessages),
    abortSignal: input.abortSignal,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    messageMetadata: ({ part }) =>
      part.type === "start"
        ? { createdAt: Date.now(), mode, model: modelId }
        : part.type === "finish"
          ? { totalTokens: part.totalUsage.totalTokens ?? 0 }
          : undefined,
    onError: (error) => {
      // AI SDK aynı hatayı mesaj işlenirken bir kez daha, bu kez eşlenmiş metinle (`ai_error`) verir; asıl
      // hata ilkidir (kayda o yazılır, log da bir kez düşer).
      if (failure !== null) return error instanceof Error ? error.message : "ai_error";
      failure = error;
      return streamErrorCode(error, input.userId, input.threadId);
    },
    onEnd: async ({ messages, responseMessage, outcome, isAborted }) => {
      await saveMessages(input.threadId, messages);
      const error = failure ?? (outcome.status === "failed" ? outcome.error : undefined);
      await recordRun({
        userId: input.userId,
        threadId: input.threadId,
        messageId: responseMessage?.id,
        purpose: "chat",
        mode,
        startedAt,
        steps,
        model: modelId,
        status: error ? "error" : isAborted || outcome.status === "aborted" ? "aborted" : "ok",
        error: error ?? undefined,
      });
    },
  });
}

export async function listThreads(userId: string) {
  return db
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      updatedAt: chatThreads.updatedAt,
      game: {
        id: games.id,
        name: games.name,
        slug: games.slug,
        coverImageId: games.coverImageId,
        coverUrl: games.coverUrl,
        accentColor: games.accentColor,
      },
    })
    .from(chatThreads)
    .leftJoin(games, eq(games.id, chatThreads.contextGameId))
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
