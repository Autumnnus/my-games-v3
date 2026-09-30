import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDollarSignIcon,
  FlagIcon,
  InboxIcon,
  ScrollTextIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { DailyColumns } from "@/components/admin/charts";
import { AdminHeader } from "@/components/admin/shell";
import { Empty, Kpi, Meter, Panel, Person, Pill } from "@/components/admin/ui";
import { RelativeTime } from "@/components/time";
import { formatCompact, formatNumber, formatUsd, overviewQuery } from "@/lib/admin";
import { formatBytes } from "@/lib/format";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/admin/")({
  component: OverviewPage,
});

function Attention({
  to,
  search,
  icon,
  tone,
  children,
}: {
  to: "/admin/logs" | "/admin/reports" | "/admin/system" | "/admin/ai" | "/admin/storage";
  search?: { level: "error" };
  icon: ReactNode;
  tone: "danger" | "warn";
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      search={search}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${
        tone === "danger"
          ? "border-destructive/30 bg-destructive/[0.07] hover:bg-destructive/[0.12]"
          : "border-amber-300/25 bg-amber-300/[0.06] hover:bg-amber-300/[0.1]"
      }`}
    >
      <span className={tone === "danger" ? "text-destructive" : "text-amber-200"}>{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </Link>
  );
}

function OverviewPage() {
  const { data, isPending } = useQuery(overviewQuery);
  if (isPending || !data) {
    return (
      <>
        <AdminHeader title={m.admin_nav_overview()} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {["a", "b", "c", "d"].map((key) => (
            <div
              key={key}
              className="bg-card h-[104px] animate-pulse rounded-[20px] border border-white/8"
            />
          ))}
        </div>
      </>
    );
  }
  const { kpi, ai, storage, logs } = data;
  const storageRatio = storage.budgetBytes ? storage.usedBytes / storage.budgetBytes : 0;
  const attention = [
    logs.errors > 0 && (
      <Attention
        key="errors"
        to="/admin/logs"
        search={{ level: "error" }}
        tone="danger"
        icon={<ScrollTextIcon className="size-5" />}
      >
        {m.admin_attention_errors({ count: logs.errors })}
      </Attention>
    ),
    kpi.openReports > 0 && (
      <Attention
        key="reports"
        to="/admin/reports"
        tone="warn"
        icon={<FlagIcon className="size-5" />}
      >
        {m.admin_attention_reports({ count: kpi.openReports })}
      </Attention>
    ),
    kpi.outboxDead > 0 && (
      <Attention
        key="outbox"
        to="/admin/system"
        tone="danger"
        icon={<InboxIcon className="size-5" />}
      >
        {m.admin_attention_outbox({ count: kpi.outboxDead })}
      </Attention>
    ),
    ai.unpriced.length > 0 && (
      <Attention
        key="prices"
        to="/admin/ai"
        tone="warn"
        icon={<CircleDollarSignIcon className="size-5" />}
      >
        {m.admin_attention_unpriced({ models: ai.unpriced.join(", ") })}
      </Attention>
    ),
    storageRatio >= 0.8 && (
      <Attention
        key="storage"
        to="/admin/storage"
        tone={storageRatio >= 0.95 ? "danger" : "warn"}
        icon={<AlertTriangleIcon className="size-5" />}
      >
        {m.admin_attention_storage({ percent: Math.round(storageRatio * 100) })}
      </Attention>
    ),
  ].filter(Boolean);

  return (
    <>
      <AdminHeader title={m.admin_nav_overview()} description={m.admin_overview_description()} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          to="/admin/users"
          label={m.admin_kpi_users()}
          value={formatNumber(kpi.users)}
          hint={m.admin_kpi_users_hint({ count: kpi.newUsers7d })}
        />
        <Kpi
          label={m.admin_kpi_active()}
          value={formatNumber(kpi.activeUsers7d)}
          hint={m.admin_kpi_active_hint({ entries: formatCompact(kpi.entries) })}
        />
        <Kpi
          to="/admin/ai"
          label={m.admin_kpi_ai_month()}
          value={formatUsd(ai.month.cost)}
          hint={
            ai.month.projection !== null
              ? m.admin_kpi_ai_projection({ amount: formatUsd(ai.month.projection) })
              : undefined
          }
        />
        <Link
          to="/admin/storage"
          className="bg-card grid min-w-0 content-start gap-1 rounded-[20px] border border-white/8 p-4 transition-colors hover:bg-white/[0.06]"
        >
          <span className="text-foreground/60 text-[13px]">{m.admin_kpi_storage()}</span>
          <span className="text-[26px] leading-tight font-semibold">
            {Math.round(storageRatio * 100)}%
          </span>
          <Meter
            value={storage.usedBytes}
            max={storage.budgetBytes}
            label={m.admin_kpi_storage()}
          />
          <span className="text-foreground/55 text-xs">
            {formatBytes(storage.usedBytes)} / {formatBytes(storage.budgetBytes)}
          </span>
        </Link>
      </div>

      <div className="grid gap-2">
        {attention.length > 0 ? (
          attention
        ) : (
          <div className="text-foreground/70 flex items-center gap-2.5 rounded-2xl border border-white/8 px-4 py-3 text-sm">
            <CheckCircle2Icon className="text-live size-5" />
            {m.admin_attention_none()}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={m.admin_chart_signups()} description={m.admin_chart_last30()}>
          <DailyColumns
            items={data.signups.map((row) => ({ day: row.day, value: row.count }))}
            format={(value) => formatNumber(Math.round(value))}
            label={m.admin_chart_table()}
          />
        </Panel>
        <Panel
          title={m.admin_chart_ai_cost()}
          description={m.admin_chart_ai_cost_hint()}
          actions={
            <Link
              to="/admin/ai"
              className="text-foreground/65 hover:text-foreground text-xs font-semibold"
            >
              {m.admin_more()}
            </Link>
          }
        >
          <DailyColumns
            items={ai.days.map((row) => ({ day: row.day, value: row.cost }))}
            format={formatUsd}
            label={m.admin_chart_table()}
            detail={(index) =>
              m.admin_chart_tokens({ tokens: formatCompact(ai.days[index]?.tokens ?? 0) })
            }
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={m.admin_recent_users()}
          actions={
            <Link
              to="/admin/users"
              className="text-foreground/65 hover:text-foreground text-xs font-semibold"
            >
              {m.admin_more()}
            </Link>
          }
        >
          <ul className="m-0 grid list-none gap-3 p-0">
            {data.recentUsers.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3">
                <Person user={row} />
                <span className="flex shrink-0 items-center gap-2">
                  {!row.emailVerified && <Pill tone="warn">{m.admin_badge_unverified()}</Pill>}
                  <RelativeTime value={row.createdAt} className="text-foreground/55 text-xs" />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title={m.admin_recent_problems()}
          description={m.admin_recent_problems_hint({
            errors: logs.errors,
            warnings: logs.warnings,
          })}
          actions={
            <Link
              to="/admin/logs"
              className="text-foreground/65 hover:text-foreground text-xs font-semibold"
            >
              {m.admin_more()}
            </Link>
          }
        >
          {data.problems.length === 0 ? (
            <Empty>{m.admin_no_problems()}</Empty>
          ) : (
            <ul className="m-0 grid list-none gap-2.5 p-0">
              {data.problems.map((row) => (
                <li key={row.id} className="grid gap-0.5 text-sm">
                  <span className="flex items-center gap-2">
                    <Pill tone={row.level === "error" ? "danger" : "warn"}>{row.source}</Pill>
                    <code className="text-foreground/70 truncate text-xs">{row.event}</code>
                    <RelativeTime
                      value={row.createdAt}
                      className="text-foreground/50 ml-auto shrink-0 text-xs"
                    />
                  </span>
                  <span className="text-foreground/80 line-clamp-2 text-[13px]">{row.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
