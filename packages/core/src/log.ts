import { schema } from "@my-games/db";
import { and, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "./db";

const { systemLogs } = schema;

export type LogLevel = schema.LogLevel;

type LogRow = typeof systemLogs.$inferInsert;

/**
 * Sistem logları: her kayıt stdout'a (Coolify log'ları) ve arka planda `system_logs`'a yazılır. Yazma
 * isteği bekletmez; kayıtlar biriktirilip toplu eklenir. Veritabanı çökerse ya da hata fırtınası olursa
 * uygulama yavaşlamasın diye dakikada en fazla `MAX_PER_MINUTE` kayıt yazılır, fazlası sayılıp özetlenir.
 */
const FLUSH_MS = 2_000;
const MAX_BUFFER = 500;
const MAX_PER_MINUTE = 120;
const MAX_MESSAGE = 2_000;

let buffer: LogRow[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let windowStart = Date.now();
let windowCount = 0;
let suppressed = 0;

export type LogInput = {
  level: LogLevel;
  source: string;
  event: string;
  message: string;
  context?: Record<string, unknown>;
  userId?: string | null;
};

function toConsole(input: LogInput) {
  const line = `[${input.source}] ${input.event}: ${input.message}`;
  const write =
    input.level === "error" ? console.error : input.level === "warn" ? console.warn : console.info;
  if (input.context && Object.keys(input.context).length > 0) write(line, input.context);
  else write(line);
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushLogs();
  }, FLUSH_MS);
  // Kuyrukta log bekliyor diye süreç kapanmayı beklemesin.
  timer.unref?.();
}

export function log(input: LogInput) {
  toConsole(input);
  if (process.env.SYSTEM_LOG_DB === "off") return;

  const now = Date.now();
  if (now - windowStart >= 60_000) {
    if (suppressed > 0) {
      buffer.push({
        level: "warn",
        source: "log",
        event: "suppressed",
        message: `Son dakikada ${suppressed} log kaydı sınırı aştığı için veritabanına yazılmadı (stdout'ta var).`,
      });
    }
    windowStart = now;
    windowCount = 0;
    suppressed = 0;
  }
  if (windowCount >= MAX_PER_MINUTE || buffer.length >= MAX_BUFFER) {
    suppressed++;
    return;
  }
  windowCount++;
  buffer.push({
    level: input.level,
    source: input.source.slice(0, 40),
    event: input.event.slice(0, 80),
    message: input.message.slice(0, MAX_MESSAGE),
    context: input.context ? safeContext(input.context) : null,
    userId: input.userId ?? null,
  });
  schedule();
}

type LogExtra = Pick<LogInput, "context" | "userId">;

export const logger = {
  info: (source: string, event: string, message: string, extra?: LogExtra) =>
    log({ level: "info", source, event, message, ...extra }),
  warn: (source: string, event: string, message: string, extra?: LogExtra) =>
    log({ level: "warn", source, event, message, ...extra }),
  error: (source: string, event: string, message: string, extra?: LogExtra) =>
    log({ level: "error", source, event, message, ...extra }),
};

/** Hata nesnesini log bağlamına uygun, kısaltılmış bir şekle getirir. */
export function errorInfo(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error).slice(0, MAX_MESSAGE) };
  const extra = error as Error & { code?: unknown; status?: unknown; statusCode?: unknown };
  return {
    name: error.name,
    message: error.message.slice(0, MAX_MESSAGE),
    ...(extra.code !== undefined ? { code: String(extra.code) } : {}),
    ...(extra.statusCode !== undefined || extra.status !== undefined
      ? { status: Number(extra.statusCode ?? extra.status) }
      : {}),
    stack: error.stack?.split("\n").slice(1, 9).join("\n"),
  };
}

export function errorMessageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** JSON'a çevrilemeyen (döngüsel, BigInt) ya da çok büyük bağlam yazmayı bozmasın. */
function safeContext(context: Record<string, unknown>) {
  try {
    const text = JSON.stringify(context, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    if (text.length <= 8_000) return JSON.parse(text) as Record<string, unknown>;
    return { truncated: text.slice(0, 8_000) };
  } catch {
    return { unserializable: true };
  }
}

/** Biriken kayıtları yazar. Kapanışta ve testlerde çağrılır. */
export async function flushLogs() {
  if (flushing) await flushing;
  if (buffer.length === 0) return;
  const rows = buffer;
  buffer = [];
  flushing = (async () => {
    try {
      await db.insert(systemLogs).values(rows);
    } catch {
      // En olası sebep: kayıttaki kullanıcı bu arada silindi. Kullanıcısız bir kez daha denenir.
      try {
        await db.insert(systemLogs).values(rows.map((row) => ({ ...row, userId: null })));
      } catch (error) {
        console.error("[log] sistem logları yazılamadı", errorMessageOf(error));
      }
    }
  })();
  await flushing;
  flushing = null;
}

// --- Okuma (yönetim paneli) ---

export async function listLogs(input: {
  level?: LogLevel | "problems";
  source?: string;
  q?: string;
  before?: number;
  limit?: number;
}) {
  const limit = Math.min(input.limit ?? 100, 200);
  const conditions = [];
  if (input.level === "problems")
    conditions.push(or(eq(systemLogs.level, "warn"), eq(systemLogs.level, "error")));
  else if (input.level) conditions.push(eq(systemLogs.level, input.level));
  if (input.source) conditions.push(eq(systemLogs.source, input.source));
  if (input.before) conditions.push(lt(systemLogs.id, input.before));
  if (input.q?.trim()) {
    const pattern = `%${input.q.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    conditions.push(or(ilike(systemLogs.message, pattern), ilike(systemLogs.event, pattern)));
  }
  const rows = await db
    .select({
      id: systemLogs.id,
      level: systemLogs.level,
      source: systemLogs.source,
      event: systemLogs.event,
      message: systemLogs.message,
      context: systemLogs.context,
      userId: systemLogs.userId,
      username: schema.user.displayUsername,
      createdAt: systemLogs.createdAt,
    })
    .from(systemLogs)
    .leftJoin(schema.user, eq(schema.user.id, systemLogs.userId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(systemLogs.id))
    .limit(limit + 1);
  return {
    logs: rows.slice(0, limit),
    nextBefore: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
  };
}

/** Son 24 saatin seviye sayıları ve en sık hata/uyarı olayları. */
export async function logSummary(hours = 24) {
  const since = new Date(Date.now() - hours * 3_600_000);
  const [levels, sources, top] = await Promise.all([
    db
      .select({ level: systemLogs.level, count: sql<number>`count(*)::int` })
      .from(systemLogs)
      .where(gte(systemLogs.createdAt, since))
      .groupBy(systemLogs.level),
    db.selectDistinct({ source: systemLogs.source }).from(systemLogs).orderBy(systemLogs.source),
    db
      .select({
        source: systemLogs.source,
        event: systemLogs.event,
        level: systemLogs.level,
        count: sql<number>`count(*)::int`,
        lastAt: sql<Date>`max(${systemLogs.createdAt})`,
      })
      .from(systemLogs)
      .where(and(gte(systemLogs.createdAt, since), sql`${systemLogs.level} <> 'info'`))
      .groupBy(systemLogs.source, systemLogs.event, systemLogs.level)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
  ]);
  const count = (level: LogLevel) => levels.find((row) => row.level === level)?.count ?? 0;
  return {
    errors: count("error"),
    warnings: count("warn"),
    info: count("info"),
    sources: sources.map((row) => row.source),
    top,
  };
}

export async function pruneLogs(olderThanDays = 30) {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const rows = await db
    .delete(systemLogs)
    .where(lt(systemLogs.createdAt, cutoff))
    .returning({ id: systemLogs.id });
  return { deleted: rows.length };
}
