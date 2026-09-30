import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RefreshCwIcon, RotateCcwIcon } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import { Bars } from "@/components/admin/charts";
import { AdminHeader } from "@/components/admin/shell";
import { Empty, Fact, Meter, Panel, Pill } from "@/components/admin/ui";
import { RelativeTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  adminApi,
  formatDateTime,
  formatNumber,
  formatUptime,
  type SystemStatus,
  settingsQuery,
  systemQuery,
} from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { errorMessage, formatBytes } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

export const Route = createFileRoute("/admin/system")({
  component: SystemPage,
});

/** Worker dakikada bir yaşam belirtisi yazar; 3 dakikadan eskiyse durmuş sayılır. */
const WORKER_STALE_MS = 3 * 60_000;

function Processes({ status }: { status: SystemStatus }) {
  const { app, worker } = status;
  const workerAge = worker ? Date.now() - new Date(worker.at).getTime() : null;
  const workerOk = workerAge !== null && workerAge < WORKER_STALE_MS;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel
        title={m.admin_process_app()}
        actions={<Pill tone="ok">{m.admin_process_running()}</Pill>}
      >
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-foreground/65">{m.admin_process_memory()}</span>
            <span className="font-semibold tabular-nums">
              {formatBytes(app.rss)}
              {app.memoryLimit && (
                <span className="text-foreground/50 font-normal">
                  {" "}
                  / {formatBytes(app.memoryLimit)}
                </span>
              )}
            </span>
          </div>
          {app.memoryLimit && (
            <Meter value={app.rss} max={app.memoryLimit} label={m.admin_process_memory()} />
          )}
        </div>
        <dl className="m-0">
          <Fact label={m.admin_process_uptime()}>{formatUptime(app.uptimeSec)}</Fact>
          <Fact label={m.admin_process_heap()}>
            {formatBytes(app.heapUsed)} / {formatBytes(app.heapTotal)}
          </Fact>
          <Fact label={m.admin_process_load()}>
            {app.loadavg.map((value) => value.toFixed(2)).join(" · ")} (
            {m.admin_process_cpus({ count: app.cpus })})
          </Fact>
          <Fact label="Node">{app.node}</Fact>
        </dl>
      </Panel>
      <Panel
        title={m.admin_process_worker()}
        actions={
          <Pill tone={workerOk ? "ok" : "danger"}>
            {workerOk
              ? m.admin_process_running()
              : worker
                ? m.admin_process_stale()
                : m.admin_process_never()}
          </Pill>
        }
      >
        {worker ? (
          <dl className="m-0">
            <Fact label={m.admin_process_heartbeat()}>
              <RelativeTime value={worker.at} />
            </Fact>
            <Fact label={m.admin_process_memory()}>{formatBytes(worker.rss)}</Fact>
            <Fact label={m.admin_process_heap()}>{formatBytes(worker.heapUsed)}</Fact>
            <Fact label={m.admin_process_started()}>{formatDateTime(worker.startedAt)}</Fact>
            <Fact label="Node">{worker.node}</Fact>
          </dl>
        ) : (
          <Empty>{m.admin_process_worker_missing()}</Empty>
        )}
      </Panel>
    </div>
  );
}

function Database({ status }: { status: SystemStatus }) {
  const { database } = status;
  const total = database.connections.reduce((sum, row) => sum + row.count, 0);
  const active = database.connections.find((row) => row.state === "active")?.count ?? 0;
  return (
    <Panel
      title={m.admin_db_title()}
      description={database.version ? `PostgreSQL ${database.version}` : undefined}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <dl className="m-0">
          <Fact label={m.admin_db_size()}>{formatBytes(database.size ?? 0)}</Fact>
          <Fact label={m.admin_db_queue_size()}>{formatBytes(database.queueBytes ?? 0)}</Fact>
          <Fact label={m.admin_db_connections()}>
            {m.admin_db_connections_value({ total, active, max: database.maxConnections ?? 0 })}
          </Fact>
          <Fact label={m.admin_db_cache()}>
            {database.cacheHit != null
              ? new Intl.NumberFormat(getLocale(), {
                  style: "percent",
                  maximumFractionDigits: 1,
                }).format(database.cacheHit / 100)
              : "—"}
          </Fact>
          <Fact label={m.admin_db_started()}>
            {database.startedAt ? <RelativeTime value={database.startedAt} /> : "—"}
          </Fact>
        </dl>
        <div className="grid content-start gap-2">
          <p className="text-foreground/55 m-0 text-xs font-semibold">{m.admin_db_tables()}</p>
          <Bars
            items={database.tables.map((table) => ({
              key: table.name,
              label: <code className="text-xs">{table.name}</code>,
              value: table.bytes,
              detail: m.admin_db_rows({ count: formatNumber(Math.round(table.rows)) }),
            }))}
            format={formatBytes}
          />
        </div>
      </div>
    </Panel>
  );
}

const jobStateTone = (state: string) =>
  state === "completed"
    ? "ok"
    : state === "failed"
      ? "danger"
      : state === "active"
        ? "info"
        : "muted";

function Queues({ status }: { status: SystemStatus }) {
  const { queues } = status;
  if (!queues.available) {
    return (
      <Panel title={m.admin_jobs_title()}>
        <Empty>{m.admin_jobs_unavailable()}</Empty>
      </Panel>
    );
  }
  return (
    <Panel title={m.admin_jobs_title()} description={m.admin_jobs_hint()}>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-foreground/55 text-xs">
            <tr className="border-b border-white/8">
              <th className="py-2 pr-3 font-semibold">{m.admin_jobs_name()}</th>
              <th className="py-2 pr-3 font-semibold">{m.admin_jobs_schedule()}</th>
              <th className="py-2 pr-3 font-semibold">{m.admin_jobs_last()}</th>
              <th className="py-2 text-right font-semibold">{m.admin_jobs_day()}</th>
            </tr>
          </thead>
          <tbody>
            {queues.queues.map((queue) => (
              <tr key={queue.name} className="border-b border-white/6 last:border-0">
                <td className="py-2 pr-3">
                  <code className="text-[13px]">{queue.name}</code>
                </td>
                <td className="text-foreground/60 py-2 pr-3 font-mono text-xs">
                  {queue.cron ?? "—"}
                </td>
                <td className="py-2 pr-3">
                  {queue.last ? (
                    <span className="flex items-center gap-2">
                      <Pill tone={jobStateTone(queue.last.state)}>{queue.last.state}</Pill>
                      <RelativeTime
                        value={queue.last.completedOn ?? queue.last.createdOn}
                        className="text-foreground/55 text-xs"
                      />
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 text-right text-xs tabular-nums">
                  <span className="text-live">{queue.counts.completed ?? 0}</span>
                  {(queue.counts.failed ?? 0) > 0 && (
                    <span className="text-destructive ml-2">
                      {m.admin_jobs_failed({ count: queue.counts.failed ?? 0 })}
                    </span>
                  )}
                  {(queue.counts.active ?? 0) +
                    (queue.counts.created ?? 0) +
                    (queue.counts.retry ?? 0) >
                    0 && (
                    <span className="text-foreground/55 ml-2">
                      {m.admin_jobs_waiting({
                        count:
                          (queue.counts.active ?? 0) +
                          (queue.counts.created ?? 0) +
                          (queue.counts.retry ?? 0),
                      })}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {queues.failed.length > 0 && (
        <div className="grid gap-2 border-t border-white/8 pt-3">
          <p className="text-foreground/55 m-0 text-xs font-semibold">
            {m.admin_jobs_recent_failures()}
          </p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {queues.failed.map((job) => (
              <li key={job.id} className="grid gap-0.5 text-sm">
                <span className="flex items-center gap-2">
                  <code className="text-[13px]">{job.name}</code>
                  <span className="text-foreground/50 text-xs">
                    {m.admin_jobs_retries({ count: job.retryCount })}
                  </span>
                  <RelativeTime
                    value={job.completedOn ?? job.createdOn}
                    className="text-foreground/50 ml-auto text-xs"
                  />
                </span>
                {job.error && (
                  <span className="text-destructive/90 font-mono text-xs break-words">
                    {job.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function Outbox({ status }: { status: SystemStatus }) {
  const queryClient = useQueryClient();
  const { outbox } = status;
  const retry = useMutation({
    mutationFn: (id: number) =>
      unwrap(adminApi.system.outbox[":id"].retry.$post({ param: { id: String(id) } })),
    onSuccess: async () => {
      toast.success(m.admin_outbox_requeued());
      await queryClient.invalidateQueries({ queryKey: ["admin", "system"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Panel
      title={m.admin_outbox_title()}
      description={m.admin_outbox_hint({ pending: outbox.pending, retrying: outbox.retrying })}
    >
      {outbox.oldest && (
        <p className="text-foreground/65 m-0 text-sm">
          {m.admin_outbox_oldest()} <RelativeTime value={outbox.oldest} />
        </p>
      )}
      {outbox.dead.length === 0 ? (
        <Empty>{m.admin_outbox_no_dead()}</Empty>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {outbox.dead.map((event) => (
            <li
              key={event.id}
              className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5"
            >
              <span className="grid min-w-0 gap-0.5 text-sm">
                <span className="flex items-center gap-2">
                  <code className="text-[13px]">{event.type}</code>
                  <span className="text-foreground/50 text-xs">#{event.id}</span>
                  <span className="text-foreground/50 text-xs">
                    {m.admin_jobs_retries({ count: event.attempts })}
                  </span>
                </span>
                <span className="text-destructive/90 font-mono text-xs break-words">
                  {event.lastError}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={retry.isPending}
                onClick={() => retry.mutate(event.id)}
              >
                <RotateCcwIcon />
                {m.admin_retry()}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {outbox.syncFailures.length > 0 && (
        <div className="grid gap-2 border-t border-white/8 pt-3">
          <p className="text-foreground/55 m-0 text-xs font-semibold">{m.admin_sync_failures()}</p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {outbox.syncFailures.map((run) => (
              <li key={run.id} className="grid gap-0.5 text-sm">
                <span className="flex items-center gap-2">
                  <Pill tone="muted">{run.source}</Pill>
                  <span className="text-foreground/70 text-xs">
                    {run.username ? `@${run.username}` : "—"}
                  </span>
                  <RelativeTime
                    value={run.startedAt}
                    className="text-foreground/50 ml-auto text-xs"
                  />
                </span>
                {run.error && (
                  <span className="text-foreground/70 font-mono text-xs break-words">
                    {run.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function Settings() {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const { data } = useQuery(settingsQuery);
  const save = useMutation({
    mutationFn: (signupsOpen: boolean) => unwrap(adminApi.settings.$put({ json: { signupsOpen } })),
    onSuccess: (next) => {
      queryClient.setQueryData(settingsQuery.queryKey, next);
      toast.success(next.signupsOpen ? m.admin_signups_opened() : m.admin_signups_closed());
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (!data) return null;
  return (
    <Panel title={m.admin_settings_title()}>
      <label
        className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.04] px-4 py-3"
        htmlFor={`${fieldId}-1`}
      >
        <span className="grid gap-0.5">
          <span className="text-sm font-semibold">{m.admin_signups()}</span>
          <span className="text-foreground/55 text-xs">{m.admin_signups_hint()}</span>
        </span>
        <Switch
          id={`${fieldId}-1`}
          checked={data.signupsOpen}
          disabled={save.isPending}
          onCheckedChange={(value) => {
            if (!value || window.confirm(m.admin_signups_confirm_open())) save.mutate(value);
          }}
        />
      </label>
    </Panel>
  );
}

function SystemPage() {
  const { data, dataUpdatedAt, refetch, isFetching } = useQuery(systemQuery);
  return (
    <>
      <AdminHeader
        title={m.admin_nav_system()}
        description={m.admin_system_description()}
        actions={
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            <RefreshCwIcon className={isFetching ? "animate-spin" : ""} />
            {dataUpdatedAt
              ? m.admin_refreshed({ time: new Date(dataUpdatedAt).toLocaleTimeString(getLocale()) })
              : m.admin_refresh()}
          </Button>
        }
      />
      {data ? (
        <>
          <Processes status={data} />
          <Queues status={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Outbox status={data} />
            <Settings />
          </div>
          <Database status={data} />
        </>
      ) : (
        <div className="bg-card h-48 animate-pulse rounded-[22px] border border-white/8" />
      )}
    </>
  );
}
