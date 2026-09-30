import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RadioIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import * as z from "zod/mini";
import { AdminHeader } from "@/components/admin/shell";
import { Empty, JsonView, Panel, Person, Pill, Segmented } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, type LogRow, logsQuery } from "@/lib/admin";
import { m } from "@/paraglide/messages";

const levels = ["problems", "error", "warn", "info"] as const;

export const Route = createFileRoute("/admin/logs")({
  validateSearch: z.object({
    level: z.optional(z.enum(levels)),
    source: z.optional(z.string()),
    q: z.optional(z.string()),
  }),
  component: LogsPage,
});

const levelTone = { error: "danger", warn: "warn", info: "muted" } as const;
const levelLabels = {
  problems: m.admin_logs_problems,
  error: m.admin_logs_errors,
  warn: m.admin_logs_warnings,
  info: m.admin_logs_info,
} as const;

function LogItem({ row }: { row: LogRow }) {
  return (
    <li className="grid gap-1.5 border-b border-white/6 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Pill tone={levelTone[row.level]}>{row.level}</Pill>
        <Pill tone="muted">{row.source}</Pill>
        <code className="text-foreground/75">{row.event}</code>
        {row.userId && (
          <Person
            user={{
              id: row.userId,
              name: row.username ? `@${row.username}` : row.userId,
              username: null,
              image: null,
            }}
          />
        )}
        <time
          className="text-foreground/50 ml-auto tabular-nums"
          dateTime={new Date(row.createdAt).toISOString()}
        >
          {formatDateTime(row.createdAt)}
        </time>
      </div>
      <p className="m-0 font-mono text-[13px] break-words whitespace-pre-wrap">{row.message}</p>
      {row.context && <JsonView label={m.admin_logs_context()} value={row.context} />}
    </li>
  );
}

function LogsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [live, setLive] = useState(false);
  const [q, setQ] = useState(search.q ?? "");
  const query = useInfiniteQuery(logsQuery(search, live));
  const rows = query.data?.pages.flatMap((page) => page.logs) ?? [];
  const summary = query.data?.pages[0]?.summary;

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === (search.q ?? "")) return;
    const timer = setTimeout(
      () =>
        void navigate({ search: (prev) => ({ ...prev, q: trimmed || undefined }), replace: true }),
      300,
    );
    return () => clearTimeout(timer);
  }, [q, search.q, navigate]);

  return (
    <>
      <AdminHeader
        title={m.admin_nav_logs()}
        description={m.admin_logs_description()}
        actions={
          <Button
            variant={live ? "default" : "outline"}
            size="sm"
            aria-pressed={live}
            onClick={() => setLive(!live)}
          >
            <RadioIcon className={live ? "animate-pulse" : ""} />
            {m.admin_logs_live()}
          </Button>
        }
      />

      {summary && (
        <div className="grid gap-3 lg:grid-cols-[auto_1fr]">
          <div className="flex gap-3">
            <div className="bg-card grid gap-0.5 rounded-2xl border border-white/8 px-4 py-3">
              <span className="text-foreground/60 text-xs">{m.admin_logs_errors_24h()}</span>
              <span
                className={`text-xl font-semibold ${summary.errors > 0 ? "text-destructive" : ""}`}
              >
                {summary.errors}
              </span>
            </div>
            <div className="bg-card grid gap-0.5 rounded-2xl border border-white/8 px-4 py-3">
              <span className="text-foreground/60 text-xs">{m.admin_logs_warnings_24h()}</span>
              <span
                className={`text-xl font-semibold ${summary.warnings > 0 ? "text-amber-200" : ""}`}
              >
                {summary.warnings}
              </span>
            </div>
          </div>
          {summary.top.length > 0 && (
            <div className="bg-card flex flex-wrap content-center gap-1.5 rounded-2xl border border-white/8 px-4 py-3">
              <span className="text-foreground/60 mr-1 text-xs">{m.admin_logs_top()}</span>
              {summary.top.map((item) => (
                <button
                  key={`${item.source}-${item.event}-${item.level}`}
                  type="button"
                  onClick={() => {
                    setQ(item.event);
                    void navigate({
                      search: (prev) => ({ ...prev, source: item.source, q: item.event }),
                      replace: true,
                    });
                  }}
                  className="rounded-full bg-white/6 px-2.5 py-1 text-xs transition-colors hover:bg-white/12"
                >
                  <span className={item.level === "error" ? "text-destructive" : "text-amber-200"}>
                    {item.count}×
                  </span>{" "}
                  <code>
                    {item.source}/{item.event}
                  </code>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label={m.admin_logs_level()}
          value={search.level ?? "all"}
          options={[
            { value: "all", label: m.admin_filter_all() },
            ...levels.map((value) => ({ value, label: levelLabels[value]() })),
          ]}
          onChange={(value) =>
            void navigate({
              search: (prev) => ({
                ...prev,
                level: value === "all" ? undefined : (value as (typeof levels)[number]),
              }),
              replace: true,
            })
          }
        />
        <Select
          value={search.source ?? "all"}
          onValueChange={(value) =>
            void navigate({
              search: (prev) => ({ ...prev, source: value === "all" ? undefined : value }),
              replace: true,
            })
          }
        >
          <SelectTrigger className="h-10 w-[150px] rounded-full" aria-label={m.admin_logs_source()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{m.admin_logs_all_sources()}</SelectItem>
            {(summary?.sources ?? []).map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="text-foreground/70 flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-full bg-white/6 px-4 sm:max-w-sm">
          <SearchIcon className="size-4 shrink-0" />
          <span className="sr-only">{m.admin_logs_search()}</span>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={m.admin_logs_search()}
            className="text-foreground placeholder:text-foreground/50 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      <Panel
        className={query.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}
      >
        {query.isPending ? (
          <div className="grid gap-2">
            {["a", "b", "c"].map((key) => (
              <div key={key} className="h-14 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty>{m.admin_logs_empty()}</Empty>
        ) : (
          <>
            <ul className="m-0 grid list-none p-0">
              {rows.map((row) => (
                <LogItem key={row.id} row={row} />
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
