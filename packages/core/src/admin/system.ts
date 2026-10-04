import { readFile } from "node:fs/promises";
import os from "node:os";
import { schema } from "@my-games/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { aiPrices, DEFAULT_PRICES, type PriceTable, setAiPrices } from "../ai/pricing";
import { defaultDailyTokenLimit } from "../ai/usage";
import { aiConfig } from "../config";
import { db } from "../db";
import { notFound } from "../errors";
import { OUTBOX_CHANNEL } from "../events";
import { readSetting, SETTING_KEYS, signupsOpen, writeSetting } from "../settings";
import { type AdminActor, audit } from "./audit";

const { outbox } = schema;

export type WorkerHeartbeat = {
  at: string;
  pid: number;
  startedAt: string;
  rss: number;
  heapUsed: number;
  node: string;
};

/** Worker dakikada bir yazar; panel "son görülme" ve bellek kullanımını buradan okur. */
export async function writeWorkerHeartbeat(startedAt: Date) {
  const memory = process.memoryUsage();
  const value: WorkerHeartbeat = {
    at: new Date().toISOString(),
    pid: process.pid,
    startedAt: startedAt.toISOString(),
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    node: process.version,
  };
  await writeSetting(SETTING_KEYS.workerHeartbeat, value);
}

/** Container'ın bellek sınırı (cgroup v2/v1). Okunamazsa `null`. */
async function memoryLimit() {
  for (const path of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const value = Number((await readFile(path, "utf8")).trim());
      // "max" ya da pratikte sınırsız değer (v1'de ~9.2e18) sınır değildir.
      if (Number.isFinite(value) && value > 0 && value < 2 ** 50) return value;
    } catch {
      // Container dışında (yerel geliştirme) dosya yoktur.
    }
  }
  return null;
}

async function processInfo() {
  const memory = process.memoryUsage();
  return {
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    node: process.version,
    memoryLimit: await memoryLimit(),
    loadavg: os.loadavg(),
    cpus: os.cpus().length,
  };
}

async function databaseInfo() {
  const [info, connections, tables, boss] = await Promise.all([
    db.execute<{
      version: string;
      size: number;
      startedAt: Date;
      maxConnections: number;
      cacheHit: number | null;
    }>(sql`select
      current_setting('server_version') as "version",
      pg_database_size(current_database())::float8 as "size",
      pg_postmaster_start_time() as "startedAt",
      current_setting('max_connections')::int as "maxConnections",
      (select round(sum(blks_hit) * 100.0 / nullif(sum(blks_hit) + sum(blks_read), 0), 1)::float8
        from pg_stat_database where datname = current_database()) as "cacheHit"`),
    db.execute<{ state: string | null; count: number }>(sql`
      select state, count(*)::int as count from pg_stat_activity
      where datname = current_database() group by state`),
    db.execute<{ name: string; bytes: number; rows: number }>(sql`
      select c.relname as name, pg_total_relation_size(c.oid)::float8 as bytes,
        greatest(c.reltuples, 0)::float8 as rows
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname = 'public'
      order by pg_total_relation_size(c.oid) desc limit 12`),
    db.execute<{ bytes: number | null }>(sql`
      select sum(pg_total_relation_size(c.oid))::float8 as bytes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname = 'pgboss'`),
  ]);
  return {
    ...info.rows[0],
    connections: connections.rows.map((row) => ({
      state: row.state ?? "unknown",
      count: row.count,
    })),
    tables: tables.rows,
    queueBytes: boss.rows[0]?.bytes ?? 0,
  };
}

/** pg-boss kuyrukları (worker'ın şeması). Şema yoksa (testler, worker hiç çalışmadı) boş döner. */
async function queueInfo() {
  const exists = await db.execute<{ ok: boolean }>(
    sql`select to_regclass('pgboss.job') is not null as ok`,
  );
  if (!exists.rows[0]?.ok) return { available: false as const };
  const [states, last, schedules, failed] = await Promise.all([
    db.execute<{ name: string; state: string; count: number }>(sql`
      select name, state::text as state, count(*)::int as count from pgboss.job
      where created_on >= now() - interval '24 hours' and name not like '\\_\\_pgboss%'
      group by name, state`),
    db.execute<{ name: string; state: string; createdOn: Date; completedOn: Date | null }>(sql`
      select distinct on (name) name, state::text as state, created_on as "createdOn",
        completed_on as "completedOn"
      from pgboss.job where name not like '\\_\\_pgboss%'
      order by name, created_on desc`),
    db.execute<{ name: string; cron: string }>(sql`select name, cron from pgboss.schedule`),
    db.execute<{
      id: string;
      name: string;
      output: unknown;
      retryCount: number;
      createdOn: Date;
      completedOn: Date | null;
    }>(sql`
      select id, name, output, retry_count as "retryCount", created_on as "createdOn",
        completed_on as "completedOn"
      from pgboss.job where state = 'failed'
      order by coalesce(completed_on, created_on) desc limit 15`),
  ]);
  const queues = new Map<
    string,
    { name: string; cron: string | null; counts: Record<string, number>; last: unknown }
  >();
  const entry = (name: string) => {
    let value = queues.get(name);
    if (!value) {
      value = { name, cron: null, counts: {}, last: null };
      queues.set(name, value);
    }
    return value;
  };
  for (const row of states.rows) entry(row.name).counts[row.state] = row.count;
  for (const row of last.rows) entry(row.name).last = row;
  for (const row of schedules.rows) entry(row.name).cron = row.cron;
  return {
    available: true as const,
    queues: [...queues.values()]
      .map((queue) => ({
        ...queue,
        last: queue.last as (typeof last.rows)[number] | null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    failed: failed.rows.map((row) => ({
      ...row,
      error: jobError(row.output),
    })),
  };
}

/** pg-boss başarısız işin hatasını `output` içine yazar (`{ message, stack }` ya da düz değer). */
function jobError(output: unknown) {
  if (output && typeof output === "object" && "message" in output)
    return String((output as { message: unknown }).message).slice(0, 500);
  return output == null ? null : JSON.stringify(output).slice(0, 500);
}

async function outboxInfo() {
  const [summary, dead, syncFailures] = await Promise.all([
    db.execute<{ pending: number; oldest: Date | null; retrying: number }>(sql`select
      count(*) filter (where processed_at is null)::int as pending,
      min(created_at) filter (where processed_at is null) as oldest,
      count(*) filter (where processed_at is null and attempts > 0)::int as retrying
      from outbox`),
    db.execute<{
      id: number;
      type: string;
      attempts: number;
      lastError: string;
      createdAt: Date;
      processedAt: Date;
    }>(sql`
      select id, type, attempts, last_error as "lastError", created_at as "createdAt",
        processed_at as "processedAt"
      from outbox where processed_at is not null and last_error is not null
      order by id desc limit 20`),
    db.execute<{
      id: string;
      source: string;
      error: string | null;
      startedAt: Date;
      username: string | null;
      userId: string | null;
    }>(sql`
      select r.id, r.source::text as source, r.error, r.started_at as "startedAt",
        u.display_username as username, r.user_id as "userId"
      from sync_runs r left join "user" u on u.id = r.user_id
      where r.ok = false order by r.started_at desc limit 10`),
  ]);
  return {
    ...(summary.rows[0] ?? { pending: 0, oldest: null, retrying: 0 }),
    dead: dead.rows,
    syncFailures: syncFailures.rows,
  };
}

export async function systemStatus() {
  const [database, app, worker, queues, events] = await Promise.all([
    databaseInfo(),
    processInfo(),
    readSetting<WorkerHeartbeat>(SETTING_KEYS.workerHeartbeat),
    queueInfo(),
    outboxInfo(),
  ]);
  return { database, app, worker, queues, outbox: events, checkedAt: new Date() };
}

/** Denemeleri tükenen outbox olayını bir kez daha kuyruğa koyar. */
export async function retryOutboxEvent(actor: AdminActor, id: number) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(outbox)
      .set({ processedAt: null, availableAt: new Date() })
      .where(and(eq(outbox.id, id), isNotNull(outbox.processedAt), isNotNull(outbox.lastError)))
      .returning({ id: outbox.id, type: outbox.type });
    if (!row) notFound("Olay bulunamadı ya da zaten işlendi");
    await audit(tx, actor, "outbox.retry", { type: "outbox", id: String(id), label: row.type });
    await tx.execute(sql`select pg_notify(${OUTBOX_CHANNEL}, ${row.type})`);
  });
}

// --- Ayarlar ---

export async function adminSettings() {
  const [open, stored, effective, prices, storedPrices] = await Promise.all([
    signupsOpen(),
    readSetting<number>(SETTING_KEYS.aiDailyTokens),
    defaultDailyTokenLimit(),
    aiPrices(),
    readSetting<unknown>(SETTING_KEYS.aiPrices),
  ]);
  return {
    signupsOpen: open,
    ai: {
      dailyTokens: typeof stored === "number" ? stored : null,
      effectiveDailyTokens: effective,
      envDailyTokens: aiConfig().dailyTokenLimit,
      prices,
      pricesCustomized: storedPrices !== null,
      defaultPrices: DEFAULT_PRICES,
    },
  };
}

export async function updateSettings(
  actor: AdminActor,
  patch: {
    signupsOpen?: boolean;
    aiDailyTokens?: number | null;
    aiPrices?: PriceTable | null;
  },
) {
  if (patch.signupsOpen !== undefined) {
    await writeSetting(SETTING_KEYS.signupsOpen, patch.signupsOpen ? null : false);
  }
  if (patch.aiDailyTokens !== undefined) {
    await writeSetting(SETTING_KEYS.aiDailyTokens, patch.aiDailyTokens);
  }
  if (patch.aiPrices !== undefined) await setAiPrices(patch.aiPrices);
  await audit(
    db,
    actor,
    "settings.update",
    { type: "settings", id: "app" },
    {
      ...(patch.signupsOpen !== undefined ? { signupsOpen: patch.signupsOpen } : {}),
      ...(patch.aiDailyTokens !== undefined ? { aiDailyTokens: patch.aiDailyTokens } : {}),
      ...(patch.aiPrices !== undefined
        ? { aiPrices: patch.aiPrices === null ? "default" : Object.keys(patch.aiPrices).length }
        : {}),
    },
  );
  return adminSettings();
}
