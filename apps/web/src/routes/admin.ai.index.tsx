import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CircleDollarSignIcon, ScanSearchIcon } from "lucide-react";
import * as z from "zod/mini";
import { AiKeys } from "@/components/admin/ai-keys";
import { AiModels } from "@/components/admin/ai-models";
import { AiSettings } from "@/components/admin/ai-settings";
import { Bars, DailyColumns } from "@/components/admin/charts";
import { AdminHeader } from "@/components/admin/shell";
import { Empty, Kpi, Panel, Person, Segmented } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  type CostRange,
  costsQuery,
  formatCompact,
  formatNumber,
  formatUsd,
  purposeLabels,
} from "@/lib/admin";
import { m } from "@/paraglide/messages";

const ranges = ["today", "7d", "30d", "month"] as const;

export const Route = createFileRoute("/admin/ai/")({
  validateSearch: z.object({ range: z.optional(z.enum(ranges)) }),
  component: AiPage,
});

const rangeLabels: Record<CostRange, () => string> = {
  today: m.admin_range_today,
  "7d": m.admin_range_7d,
  "30d": m.admin_range_30d,
  month: m.admin_range_month,
};

function AiPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const range = search.range ?? "30d";
  const { data, isPlaceholderData } = useQuery(costsQuery(range));

  return (
    <>
      <AdminHeader
        title={m.admin_nav_ai()}
        description={m.admin_ai_description()}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/ai/traces">
              <ScanSearchIcon />
              {m.admin_nav_traces()}
            </Link>
          </Button>
        }
      />

      <Segmented
        label={m.admin_range_label()}
        value={range}
        options={ranges.map((value) => ({ value, label: rangeLabels[value]() }))}
        onChange={(value) =>
          void navigate({ search: { range: value === "30d" ? undefined : value }, replace: true })
        }
      />

      {data && (
        <div className={`grid gap-4 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
          {data.unpriced.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-sm">
              <CircleDollarSignIcon className="mt-0.5 size-5 shrink-0 text-amber-200" />
              <span>{m.admin_unpriced_banner({ models: data.unpriced.join(", ") })}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label={m.admin_cost_total()}
              value={formatUsd(data.totals.cost)}
              hint={
                data.projection !== null
                  ? m.admin_kpi_ai_projection({ amount: formatUsd(data.projection) })
                  : m.admin_cost_list_price()
              }
            />
            <Kpi
              label={m.admin_cost_calls()}
              value={formatNumber(data.totals.calls)}
              tone={data.totals.errors > 0 ? "warn" : undefined}
              hint={m.admin_cost_errors({ count: data.totals.errors })}
            />
            <Kpi
              label={m.admin_cost_tokens()}
              value={formatCompact(data.totals.totalTokens)}
              hint={m.admin_cost_tokens_hint({
                input: formatCompact(data.totals.inputTokens),
                cached: formatCompact(data.totals.cachedInputTokens),
                output: formatCompact(data.totals.outputTokens),
              })}
            />
            <Kpi
              label={m.admin_cost_users()}
              value={formatNumber(data.totals.users)}
              hint={
                data.totals.users > 0
                  ? m.admin_cost_per_user({
                      amount: formatUsd(data.totals.cost / data.totals.users),
                    })
                  : undefined
              }
            />
          </div>

          {data.days.length > 1 && (
            <Panel title={m.admin_chart_ai_cost()} description={m.admin_chart_ai_cost_hint()}>
              <DailyColumns
                items={data.days.map((day) => ({ day: day.day, value: day.cost }))}
                format={formatUsd}
                label={m.admin_chart_table()}
                detail={(index) => {
                  const day = data.days[index];
                  return day
                    ? m.admin_chart_day_detail({
                        tokens: formatCompact(day.totalTokens),
                        calls: formatNumber(day.calls),
                      })
                    : null;
                }}
              />
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title={m.admin_cost_by_model()}>
              <Bars
                items={data.models.map((row) => ({
                  key: row.model,
                  label: (
                    <span className="font-mono text-xs">
                      {row.model}
                      {!row.priced && !row.model.startsWith("mock") && (
                        <span className="ml-1.5 text-amber-200">{m.admin_unpriced()}</span>
                      )}
                    </span>
                  ),
                  value: row.cost,
                  detail: formatCompact(row.totalTokens),
                }))}
                format={formatUsd}
                empty={m.admin_cost_empty()}
              />
            </Panel>
            <Panel title={m.admin_cost_by_purpose()}>
              <Bars
                items={data.purposes.map((row) => ({
                  key: row.purpose,
                  label: purposeLabels[row.purpose]?.() ?? row.purpose,
                  value: row.cost,
                  detail: m.admin_calls_short({ count: formatNumber(row.calls) }),
                }))}
                format={formatUsd}
                empty={m.admin_cost_empty()}
              />
            </Panel>
            <Panel title={m.admin_cost_by_user()}>
              {data.users.length === 0 ? (
                <Empty>{m.admin_cost_empty()}</Empty>
              ) : (
                <ul className="m-0 grid list-none gap-2.5 p-0">
                  {data.users.map((row) => (
                    <li key={row.userId} className="flex items-center justify-between gap-3">
                      <Person
                        user={{
                          id: row.userId,
                          name: row.name,
                          username: row.username,
                          image: row.image,
                        }}
                      />
                      <span className="shrink-0 text-right text-[13px] tabular-nums">
                        {formatUsd(row.cost)}
                        <span className="text-foreground/50 block text-xs">
                          {formatCompact(row.totalTokens)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid gap-4">
          <AiModels />
          <AiKeys />
        </div>
        <AiSettings />
      </div>
    </>
  );
}
