import { schema } from "@my-games/db";
import { and, asc, desc, eq, gte, inArray, lt, type SQL, sql } from "drizzle-orm";
import { aiPrices, costOf, type PriceTable, priceFor } from "../ai/pricing";
import type { AiPurpose, AiRunStatus } from "../ai/usage";
import { db } from "../db";
import { notFound } from "../errors";

const { aiUsage, user, chatThreads, chatMessages } = schema;

export const costRanges = ["today", "7d", "30d", "month"] as const;
export type CostRange = (typeof costRanges)[number];

/** Aralıklar uygulama saat diliminde (bağlantının oturum saat dilimi) günle hizalıdır. */
function rangeStart(range: CostRange): SQL {
  switch (range) {
    case "today":
      return sql`date_trunc('day', now())`;
    case "7d":
      return sql`date_trunc('day', now()) - interval '6 days'`;
    case "30d":
      return sql`date_trunc('day', now()) - interval '29 days'`;
    case "month":
      return sql`date_trunc('month', now())`;
  }
}

const dayOf = sql<string>`to_char(date_trunc('day', ${aiUsage.createdAt}), 'YYYY-MM-DD')`;
const tokenSums = {
  calls: sql<number>`count(*)::int`,
  errors: sql<number>`(count(*) filter (where ${aiUsage.status} = 'error'))::int`,
  inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::float8`,
  cachedInputTokens: sql<number>`coalesce(sum(${aiUsage.cachedInputTokens}), 0)::float8`,
  outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::float8`,
  reasoningTokens: sql<number>`coalesce(sum(${aiUsage.reasoningTokens}), 0)::float8`,
  totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::float8`,
};

type Bucket = {
  cost: number;
  calls: number;
  errors: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

const emptyBucket = (): Bucket => ({
  cost: 0,
  calls: 0,
  errors: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
});

function add(bucket: Bucket, row: Omit<Bucket, "cost">, cost: number) {
  bucket.cost += cost;
  bucket.calls += row.calls;
  bucket.errors += row.errors;
  bucket.inputTokens += row.inputTokens;
  bucket.cachedInputTokens += row.cachedInputTokens;
  bucket.outputTokens += row.outputTokens;
  bucket.reasoningTokens += row.reasoningTokens;
  bucket.totalTokens += row.totalTokens;
}

/** Sahte model ve boş çağrılar fiyatsız sayılmaz (uyarı listesine düşmez). */
function needsPrice(model: string) {
  return !model.startsWith("mock") && model !== "unknown";
}

/**
 * Maliyet özeti. Maliyet okuma anında güncel fiyat tablosuyla hesaplanır: fiyat sonradan düzeltilirse geçmiş
 * de düzelir (fiyatlar nadiren değişir, geçmişin o günkü fiyatla dondurulması gerekmiyor).
 */
export async function aiCostSummary(range: CostRange) {
  const start = rangeStart(range);
  const [rows, days, prices] = await Promise.all([
    db
      .select({
        day: dayOf,
        model: aiUsage.model,
        purpose: aiUsage.purpose,
        userId: aiUsage.userId,
        ...tokenSums,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, start))
      .groupBy(dayOf, aiUsage.model, aiUsage.purpose, aiUsage.userId),
    db.execute<{ day: string }>(
      sql`select to_char(d, 'YYYY-MM-DD') as day from generate_series(${start}, date_trunc('day', now()), interval '1 day') d`,
    ),
    aiPrices(),
  ]);

  const totals = emptyBucket();
  const byDay = new Map<string, Bucket>(days.rows.map((row) => [row.day, emptyBucket()]));
  const byModel = new Map<string, Bucket & { priced: boolean }>();
  const byPurpose = new Map<string, Bucket>();
  const byUser = new Map<string, Bucket>();
  const users = new Set<string>();
  const unpriced = new Set<string>();

  for (const row of rows) {
    const price = priceFor(prices, row.model);
    if (!price && needsPrice(row.model) && row.totalTokens > 0) unpriced.add(row.model);
    const cost = costOf(price, row);
    add(totals, row, cost);
    const day = byDay.get(row.day) ?? emptyBucket();
    add(day, row, cost);
    byDay.set(row.day, day);
    const model = byModel.get(row.model) ?? { ...emptyBucket(), priced: price !== null };
    add(model, row, cost);
    byModel.set(row.model, model);
    const purpose = byPurpose.get(row.purpose) ?? emptyBucket();
    add(purpose, row, cost);
    byPurpose.set(row.purpose, purpose);
    if (row.userId) {
      users.add(row.userId);
      const bucket = byUser.get(row.userId) ?? emptyBucket();
      add(bucket, row, cost);
      byUser.set(row.userId, bucket);
    }
  }

  const topUsers = [...byUser.entries()]
    .sort((a, b) => b[1].cost - a[1].cost || b[1].totalTokens - a[1].totalTokens)
    .slice(0, 10);
  const people = topUsers.length
    ? await db
        .select({
          id: user.id,
          name: user.name,
          username: user.displayUsername,
          image: user.image,
        })
        .from(user)
        .where(
          inArray(
            user.id,
            topUsers.map(([id]) => id),
          ),
        )
    : [];
  const person = new Map(people.map((row) => [row.id, row]));

  // Ay sonu tahmini: bu ayın günlük ortalaması × ayın gün sayısı.
  let projection: number | null = null;
  if (range === "month" && days.rows.length > 0) {
    const today = new Date(`${days.rows.at(-1)?.day}T00:00:00Z`);
    const daysInMonth = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0),
    ).getUTCDate();
    projection = (totals.cost / days.rows.length) * daysInMonth;
  }

  return {
    range,
    currency: "USD" as const,
    totals: { ...totals, users: users.size },
    projection,
    days: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, bucket]) => ({ day, ...bucket })),
    models: [...byModel.entries()]
      .map(([model, bucket]) => ({ model, ...bucket }))
      .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens),
    purposes: [...byPurpose.entries()]
      .map(([purpose, bucket]) => ({ purpose: purpose as AiPurpose, ...bucket }))
      .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens),
    users: topUsers.map(([id, bucket]) => ({
      userId: id,
      name: person.get(id)?.name ?? null,
      username: person.get(id)?.username ?? null,
      image: person.get(id)?.image ?? null,
      ...bucket,
    })),
    unpriced: [...unpriced],
  };
}

/** Kullanıcının son 30 günü (kullanıcı ayrıntısı). */
export async function userAiSummary(userId: string) {
  const [rows, prices] = await Promise.all([
    db
      .select({ model: aiUsage.model, ...tokenSums })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, rangeStart("30d"))))
      .groupBy(aiUsage.model),
    aiPrices(),
  ]);
  const bucket = emptyBucket();
  for (const row of rows) add(bucket, row, costOf(priceFor(prices, row.model), row));
  return bucket;
}

/** Kullanıcı listesindeki "30 günlük AI" sütunu için toplu hesap. */
export async function aiCostByUser(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { cost: number; tokens: number }>();
  const [rows, prices] = await Promise.all([
    db
      .select({ userId: aiUsage.userId, model: aiUsage.model, ...tokenSums })
      .from(aiUsage)
      .where(and(inArray(aiUsage.userId, userIds), gte(aiUsage.createdAt, rangeStart("30d"))))
      .groupBy(aiUsage.userId, aiUsage.model),
    aiPrices(),
  ]);
  const result = new Map<string, { cost: number; tokens: number }>();
  for (const row of rows) {
    if (!row.userId) continue;
    const current = result.get(row.userId) ?? { cost: 0, tokens: 0 };
    current.cost += costOf(priceFor(prices, row.model), row);
    current.tokens += row.totalTokens;
    result.set(row.userId, current);
  }
  return result;
}

// --- İzler ---

type RunRow = typeof aiUsage.$inferSelect;

function presentRun(run: RunRow, prices: PriceTable, withDetail = false) {
  const price = priceFor(prices, run.model);
  const tools = [
    ...new Set(run.detail?.steps.flatMap((step) => step.tools.map((tool) => tool.name)) ?? []),
  ];
  const failovers =
    run.detail?.steps.reduce((total, step) => total + (step.failovers?.length ?? 0), 0) ?? 0;
  return {
    id: run.id,
    createdAt: run.createdAt,
    purpose: run.purpose,
    status: run.status,
    error: run.error,
    model: run.model,
    provider: run.provider,
    mode: run.detail?.mode ?? null,
    steps: run.steps,
    durationMs: run.durationMs,
    inputTokens: run.inputTokens,
    cachedInputTokens: run.cachedInputTokens,
    outputTokens: run.outputTokens,
    reasoningTokens: run.reasoningTokens,
    totalTokens: run.totalTokens,
    cost: costOf(price, run),
    priced: price !== null || !needsPrice(run.model),
    threadId: run.threadId,
    messageId: run.messageId,
    tools,
    failovers,
    detail: withDetail ? (run.detail ?? { steps: [] }) : undefined,
  };
}

const runUser = {
  id: user.id,
  name: user.name,
  username: user.displayUsername,
  image: user.image,
};

export async function listTraces(input: {
  status?: AiRunStatus;
  purpose?: AiPurpose;
  userId?: string;
  before?: string;
  limit?: number;
}) {
  const limit = Math.min(input.limit ?? 50, 100);
  const conditions = [];
  if (input.status) conditions.push(eq(aiUsage.status, input.status));
  if (input.purpose) conditions.push(eq(aiUsage.purpose, input.purpose));
  if (input.userId) conditions.push(eq(aiUsage.userId, input.userId));
  if (input.before) conditions.push(lt(aiUsage.id, input.before));
  const [rows, prices] = await Promise.all([
    db
      .select({ run: aiUsage, user: runUser, threadTitle: chatThreads.title })
      .from(aiUsage)
      .leftJoin(user, eq(user.id, aiUsage.userId))
      .leftJoin(chatThreads, eq(chatThreads.id, aiUsage.threadId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(aiUsage.id))
      .limit(limit + 1),
    aiPrices(),
  ]);
  return {
    traces: rows.slice(0, limit).map((row) => ({
      ...presentRun(row.run, prices),
      user: row.user,
      threadTitle: row.threadTitle,
    })),
    nextBefore: rows.length > limit ? (rows[limit - 1]?.run.id ?? null) : null,
  };
}

/** Tek çağrının izi; sohbet çağrısıysa bütün sohbet (mesajlar + her turun izi) birlikte gelir. */
export async function traceDetail(id: string) {
  const [row] = await db
    .select({ run: aiUsage, user: runUser })
    .from(aiUsage)
    .leftJoin(user, eq(user.id, aiUsage.userId))
    .where(eq(aiUsage.id, id));
  if (!row) notFound("İz bulunamadı");
  const prices = await aiPrices();
  return {
    run: presentRun(row.run, prices, true),
    user: row.user,
    thread: row.run.threadId ? await threadTrace(row.run.threadId, prices) : null,
  };
}

/** Sohbetin tamamı: mesajlar (AI SDK parçalarıyla) ve her model çağrısının ölçümleri. */
export async function threadTrace(threadId: string, prices?: PriceTable) {
  const [thread] = await db
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      createdAt: chatThreads.createdAt,
      updatedAt: chatThreads.updatedAt,
      user: runUser,
    })
    .from(chatThreads)
    .leftJoin(user, eq(user.id, chatThreads.userId))
    .where(eq(chatThreads.id, threadId));
  if (!thread) return null;
  const table = prices ?? (await aiPrices());
  const [messages, runs] = await Promise.all([
    db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(asc(chatMessages.createdAt))
      .limit(500),
    db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.threadId, threadId))
      .orderBy(asc(aiUsage.createdAt))
      .limit(500),
  ]);
  const presented = runs.map((run) => presentRun(run, table, true));
  return {
    ...thread,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata,
      createdAt: message.createdAt,
    })),
    runs: presented,
    totals: {
      cost: presented.reduce((total, run) => total + run.cost, 0),
      tokens: presented.reduce((total, run) => total + run.totalTokens, 0),
      calls: presented.length,
      errors: presented.filter((run) => run.status === "error").length,
    },
  };
}
