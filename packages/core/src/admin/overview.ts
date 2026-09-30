import { schema } from "@my-games/db";
import { desc, sql } from "drizzle-orm";
import { storageLimits } from "../config";
import { db } from "../db";
import { listLogs, logSummary } from "../log";
import { aiCostSummary } from "./ai";

const { user } = schema;

type Kpi = {
  users: number;
  newUsers7d: number;
  activeUsers7d: number;
  bannedUsers: number;
  entries: number;
  screenshots: number;
  openReports: number;
  outboxPending: number;
  outboxDead: number;
  storageUsed: number;
};

/** Yönetim panelinin ilk ekranı: sayılar, son 30 günün kayıt ve maliyet eğrisi, son sorunlar. */
export async function adminOverview() {
  const [kpiResult, signups, month, last30, logs, problems, recentUsers] = await Promise.all([
    db.execute<Kpi>(sql`select
      (select count(*)::int from "user") as "users",
      (select count(*)::int from "user" where created_at >= now() - interval '7 days') as "newUsers7d",
      (select count(distinct user_id)::int from "session" where updated_at >= now() - interval '7 days') as "activeUsers7d",
      (select count(*)::int from "user" where banned) as "bannedUsers",
      (select count(*)::int from library_entries) as "entries",
      (select count(*)::int from screenshots) as "screenshots",
      (select count(*)::int from reports where status = 'open') as "openReports",
      (select count(*)::int from outbox where processed_at is null) as "outboxPending",
      (select count(*)::int from outbox where processed_at is not null and last_error is not null) as "outboxDead",
      (select coalesce(sum(total_bytes), 0)::float8 from media_assets where target_id is null) as "storageUsed"`),
    db.execute<{ day: string; count: number }>(sql`
      select to_char(d, 'YYYY-MM-DD') as day,
        (select count(*)::int from "user" u where u.created_at >= d and u.created_at < d + interval '1 day') as count
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
      order by d`),
    aiCostSummary("month"),
    aiCostSummary("30d"),
    logSummary(24),
    listLogs({ level: "problems", limit: 6 }),
    db
      .select({
        id: user.id,
        name: user.name,
        username: user.displayUsername,
        image: user.image,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(6),
  ]);
  const kpi = kpiResult.rows[0];
  if (!kpi) throw new Error("özet sayıları okunamadı");
  return {
    kpi,
    storage: { usedBytes: kpi.storageUsed, budgetBytes: storageLimits().budgetBytes },
    signups: signups.rows,
    ai: {
      month: {
        cost: month.totals.cost,
        tokens: month.totals.totalTokens,
        calls: month.totals.calls,
        errors: month.totals.errors,
        projection: month.projection,
      },
      today: last30.days.at(-1) ?? null,
      days: last30.days.map((day) => ({ day: day.day, cost: day.cost, tokens: day.totalTokens })),
      unpriced: last30.unpriced,
    },
    logs: { errors: logs.errors, warnings: logs.warnings, top: logs.top.slice(0, 5) },
    problems: problems.logs,
    recentUsers,
  };
}
