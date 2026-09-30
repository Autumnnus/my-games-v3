import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRoundIcon, XIcon } from "lucide-react";
import * as z from "zod/mini";
import { AdminHeader } from "@/components/admin/shell";
import { StatusPill } from "@/components/admin/trace-view";
import { Empty, Panel, Person, Pill, Segmented } from "@/components/admin/ui";
import { RelativeTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatCompact,
  formatDuration,
  formatUsd,
  purposeLabels,
  type TraceRow,
  tracesQuery,
} from "@/lib/admin";
import { m } from "@/paraglide/messages";

const statuses = ["ok", "error", "aborted"] as const;
const purposes = ["chat", "title", "pick", "review", "recap"] as const;

export const Route = createFileRoute("/admin/ai/traces/")({
  validateSearch: z.object({
    status: z.optional(z.enum(statuses)),
    purpose: z.optional(z.enum(purposes)),
    userId: z.optional(z.string()),
  }),
  component: TracesPage,
});

function TraceItem({ trace }: { trace: TraceRow }) {
  return (
    <li className="relative grid gap-2 rounded-2xl px-3 py-3 transition-colors hover:bg-white/[0.04] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_auto] sm:items-center sm:gap-4">
      {/* Satırın tamamı ize bağlanır; kişi bağlantısı onun üstünde kalır. */}
      <div className="relative z-10 flex min-w-0 items-center gap-2">
        <Person user={trace.user} />
      </div>
      <Link
        to="/admin/ai/traces/$id"
        params={{ id: trace.id }}
        className="grid min-w-0 gap-1 after:absolute after:inset-0 after:content-['']"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Pill tone="muted">{purposeLabels[trace.purpose]?.() ?? trace.purpose}</Pill>
          {trace.status !== "ok" && <StatusPill status={trace.status} />}
          <span className="min-w-0 truncate text-sm font-semibold">
            {trace.threadTitle ?? (trace.purpose === "chat" ? m.ai_new_chat() : trace.model)}
          </span>
        </span>
        <span className="text-foreground/55 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <code className="truncate">{trace.model}</code>
          {trace.tools.slice(0, 3).map((tool) => (
            <span key={tool} className="rounded bg-white/6 px-1.5 font-mono">
              {tool}
            </span>
          ))}
          {trace.tools.length > 3 && <span>+{trace.tools.length - 3}</span>}
          {trace.failovers > 0 && (
            <span className="flex items-center gap-1 text-amber-200">
              <KeyRoundIcon className="size-3" />
              {m.admin_failovers({ count: trace.failovers })}
            </span>
          )}
          {trace.error && <span className="text-destructive truncate">{trace.error}</span>}
        </span>
      </Link>
      <div className="text-foreground/70 flex items-center gap-4 text-xs tabular-nums sm:justify-end">
        <span title={m.admin_metric_tokens()}>{formatCompact(trace.totalTokens)}</span>
        <span className="text-foreground w-[76px] text-right font-semibold">
          {trace.priced ? formatUsd(trace.cost) : "—"}
        </span>
        <span className="w-[56px] text-right">{formatDuration(trace.durationMs)}</span>
        <RelativeTime value={trace.createdAt} className="text-foreground/50 w-[88px] text-right" />
      </div>
    </li>
  );
}

function TracesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useInfiniteQuery(tracesQuery(search));
  const traces = query.data?.pages.flatMap((page) => page.traces) ?? [];
  const person = search.userId
    ? traces.find((trace) => trace.user?.id === search.userId)?.user
    : null;

  return (
    <>
      <AdminHeader title={m.admin_nav_traces()} description={m.admin_traces_description()} />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label={m.admin_traces_status()}
          value={search.status ?? "all"}
          options={[
            { value: "all", label: m.admin_filter_all() },
            { value: "error", label: m.admin_status_error() },
            { value: "aborted", label: m.admin_status_aborted() },
            { value: "ok", label: m.admin_status_ok() },
          ]}
          onChange={(value) =>
            void navigate({
              search: (prev) => ({ ...prev, status: value === "all" ? undefined : value }),
              replace: true,
            })
          }
        />
        <Select
          value={search.purpose ?? "all"}
          onValueChange={(value) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                purpose: value === "all" ? undefined : (value as (typeof purposes)[number]),
              }),
              replace: true,
            })
          }
        >
          <SelectTrigger
            className="h-10 w-[170px] rounded-full"
            aria-label={m.admin_traces_purpose()}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{m.admin_traces_all_purposes()}</SelectItem>
            {purposes.map((value) => (
              <SelectItem key={value} value={value}>
                {purposeLabels[value]?.()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {search.userId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void navigate({ search: (prev) => ({ ...prev, userId: undefined }), replace: true })
            }
          >
            {m.admin_traces_user_filter({
              name: person?.username ? `@${person.username}` : m.admin_filter_one_user(),
            })}
            <XIcon />
          </Button>
        )}
      </div>

      <Panel
        className={query.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}
      >
        {query.isPending ? (
          <div className="grid gap-2">
            {["a", "b", "c", "d"].map((key) => (
              <div key={key} className="h-14 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : traces.length === 0 ? (
          <Empty>{m.admin_traces_empty()}</Empty>
        ) : (
          <>
            <ul className="-mx-3 m-0 grid list-none gap-0.5 p-0">
              {traces.map((trace) => (
                <TraceItem key={trace.id} trace={trace} />
              ))}
            </ul>
            {query.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                className="w-fit justify-self-center"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {m.admin_load_more()}
              </Button>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
