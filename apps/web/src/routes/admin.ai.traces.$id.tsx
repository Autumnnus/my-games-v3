import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, EyeIcon } from "lucide-react";
import { useEffect } from "react";
import { AdminHeader } from "@/components/admin/shell";
import { RunSummary, ThreadView } from "@/components/admin/trace-view";
import { Empty, Panel, Person } from "@/components/admin/ui";
import { formatCompact, formatUsd, purposeLabels, traceQuery } from "@/lib/admin";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/admin/ai/traces/$id")({
  component: TracePage,
});

function TracePage() {
  const { id } = Route.useParams();
  const { data, isPending, error } = useQuery(traceQuery(id));

  // Sohbette seçilen çağrıya kaydır.
  useEffect(() => {
    if (!data?.thread) return;
    document.getElementById(`run-${id}`)?.scrollIntoView({ block: "center" });
  }, [data?.thread, id]);

  if (isPending)
    return <div className="bg-card h-48 animate-pulse rounded-[22px] border border-white/8" />;
  if (error || !data) {
    return (
      <Panel>
        <Empty>{m.admin_trace_not_found()}</Empty>
      </Panel>
    );
  }
  const { run, thread } = data;

  return (
    <>
      <Link
        to="/admin/ai/traces"
        className="text-foreground/60 hover:text-foreground flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeftIcon className="size-4" />
        {m.admin_nav_traces()}
      </Link>
      <AdminHeader
        title={
          thread
            ? (thread.title ?? m.ai_new_chat())
            : (purposeLabels[run.purpose]?.() ?? run.purpose)
        }
        eyebrow={<Person user={data.user} />}
        description={
          thread
            ? m.admin_thread_totals({
                calls: thread.totals.calls,
                tokens: formatCompact(thread.totals.tokens),
                cost: formatUsd(thread.totals.cost),
              })
            : undefined
        }
      />
      {thread ? (
        <>
          <p className="text-foreground/55 m-0 flex items-center gap-2 text-xs">
            <EyeIcon className="size-3.5" />
            {m.admin_thread_audited()}
          </p>
          <Panel>
            <ThreadView thread={thread} activeRunId={run.id} />
          </Panel>
        </>
      ) : (
        <RunSummary run={run} active />
      )}
    </>
  );
}
