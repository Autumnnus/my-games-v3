import { schema } from "@my-games/db";
import type { LanguageModelUsage } from "ai";
import { and, eq, gte, sql } from "drizzle-orm";
import { aiConfig } from "../config";
import { db } from "../db";
import { AppError } from "../errors";
import { errorMessageOf } from "../log";
import { readSetting, SETTING_KEYS } from "../settings";

const { aiUsage, userLimits } = schema;

export type AiPurpose = schema.AiPurpose;
export type AiRunStatus = schema.AiRunStatus;
export type AiTraceStep = schema.AiTraceStep;

/** Varsayılan günlük token sınırı: panelden verilen değer, yoksa `AI_DAILY_TOKEN_LIMIT`. 0 = sınırsız. */
export async function defaultDailyTokenLimit() {
  const stored = await readSetting<number>(SETTING_KEYS.aiDailyTokens);
  if (typeof stored === "number" && Number.isInteger(stored) && stored >= 0) return stored;
  return aiConfig()?.dailyTokenLimit ?? 0;
}

async function limitsOf(userId: string) {
  const [row] = await db.select().from(userLimits).where(eq(userLimits.userId, userId));
  return row ?? null;
}

/** Kullanıcının bugün (UTC) harcadığı token ve günlük sınırı (0 = sınırsız). */
export async function usageToday(userId: string) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [[row], limits, fallback] = await Promise.all([
    db
      .select({ tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int` })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since))),
    limitsOf(userId),
    defaultDailyTokenLimit(),
  ]);
  return {
    used: row?.tokens ?? 0,
    limit: limits?.aiDailyTokens ?? fallback,
    blocked: limits?.aiBlocked ?? false,
  };
}

export async function assertQuota(userId: string) {
  const quota = await usageToday(userId);
  if (quota.blocked) throw new AppError("ai_blocked", "AI bu hesap için kapatıldı");
  if (quota.limit > 0 && quota.used >= quota.limit) {
    throw new AppError("quota_exceeded", "Günlük AI kullanım sınırına ulaştın", "ai_daily_limit");
  }
}

/** Adım listesi için gereken alanlar (AI SDK `StepResult`'ın alt kümesi; testler elle kurabilsin). */
export type StepLike = {
  model: { provider: string; modelId: string };
  response?: { modelId?: string };
  finishReason: string;
  usage: Partial<
    Pick<LanguageModelUsage, "inputTokens" | "outputTokens" | "totalTokens" | "inputTokenDetails">
  > & { outputTokenDetails?: { reasoningTokens?: number | undefined } };
  performance?: {
    stepTimeMs?: number;
    timeToFirstOutputMs?: number;
    toolExecutionMs?: Readonly<Record<string, number>>;
  };
  content?: ReadonlyArray<{
    type: string;
    toolCallId?: string;
    toolCall?: { toolCallId: string };
    approved?: boolean;
  }>;
  toolCalls?: ReadonlyArray<{ toolCallId: string; toolName: string }>;
  providerMetadata?: Record<string, unknown> | undefined;
};

type PoolMetadata = { key?: string; failovers?: AiTraceStep["failovers"] };

function toolsOf(step: StepLike): AiTraceStep["tools"] {
  const content = step.content ?? [];
  const status = new Map<string, AiTraceStep["tools"][number]["status"]>();
  for (const part of content) {
    const id = part.toolCallId ?? part.toolCall?.toolCallId;
    if (!id) continue;
    if (part.type === "tool-result") status.set(id, "ok");
    else if (part.type === "tool-error") status.set(id, "error");
    else if (part.type === "tool-approval-response" && part.approved === false)
      status.set(id, "denied");
    else if (part.type === "tool-approval-request" && !status.has(id)) status.set(id, "approval");
  }
  return (step.toolCalls ?? []).map((call) => ({
    name: call.toolName,
    status: status.get(call.toolCallId) ?? "approval",
    ms: step.performance?.toolExecutionMs?.[call.toolCallId],
  }));
}

/** AI SDK adımlarını izleme kaydına çevirir (içerik değil, yalnızca ölçümler). */
export function traceSteps(steps: readonly StepLike[]): AiTraceStep[] {
  return steps.map((step) => {
    const pool = step.providerMetadata?.pool as PoolMetadata | undefined;
    return {
      model: step.response?.modelId || step.model.modelId,
      finishReason: step.finishReason,
      inputTokens: step.usage.inputTokens ?? 0,
      outputTokens: step.usage.outputTokens ?? 0,
      cachedInputTokens: step.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      reasoningTokens: step.usage.outputTokenDetails?.reasoningTokens ?? 0,
      ms: Math.round(step.performance?.stepTimeMs ?? 0),
      firstOutputMs:
        step.performance?.timeToFirstOutputMs !== undefined
          ? Math.round(step.performance.timeToFirstOutputMs)
          : undefined,
      tools: toolsOf(step),
      ...(pool?.key ? { key: pool.key } : {}),
      ...(pool?.failovers?.length ? { failovers: pool.failovers } : {}),
    };
  });
}

/**
 * Her model çağrısı (sohbet turu, başlık, öneri, taslak, özet) kotaya, maliyete ve izlemeye yazılır.
 * Hata ve iptal de kaydedilir: yönetim ekranında hangi çağrının neden düştüğü görünür.
 */
export async function recordRun(input: {
  userId: string;
  purpose: AiPurpose;
  startedAt: number;
  threadId?: string | null;
  messageId?: string | null;
  /** Adımlardan okunamazsa (hiç adım yoksa) gösterilecek model. */
  model?: string;
  mode?: string;
  steps?: readonly StepLike[];
  status?: AiRunStatus;
  error?: unknown;
}) {
  const steps = traceSteps(input.steps ?? []);
  const sum = (pick: (step: AiTraceStep) => number) =>
    steps.reduce((total, step) => total + pick(step), 0);
  const inputTokens = sum((step) => step.inputTokens);
  const outputTokens = sum((step) => step.outputTokens);
  const model = steps.at(-1)?.model || input.model || "unknown";
  const status: AiRunStatus = input.status ?? (input.error ? "error" : "ok");
  await db.insert(aiUsage).values({
    userId: input.userId,
    threadId: input.threadId ?? null,
    messageId: input.messageId ?? null,
    purpose: input.purpose,
    status,
    error: input.error ? errorMessageOf(input.error).slice(0, 1000) : null,
    provider: input.steps?.at(-1)?.model.provider ?? null,
    model,
    inputTokens,
    cachedInputTokens: sum((step) => step.cachedInputTokens),
    outputTokens,
    reasoningTokens: sum((step) => step.reasoningTokens),
    totalTokens: inputTokens + outputTokens,
    steps: steps.length,
    durationMs: Math.max(0, Math.round(Date.now() - input.startedAt)),
    detail: { ...(input.mode ? { mode: input.mode } : {}), steps },
  });
}

/** Yönetim ekranı: bugünkü toplam kullanım. */
export async function usageSummaryToday() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({
      tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
      calls: sql<number>`count(*)::int`,
      users: sql<number>`count(distinct ${aiUsage.userId})::int`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, since));
  return { tokens: row?.tokens ?? 0, calls: row?.calls ?? 0, users: row?.users ?? 0 };
}
