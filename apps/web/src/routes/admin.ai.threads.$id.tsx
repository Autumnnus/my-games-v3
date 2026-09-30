import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, EyeIcon } from "lucide-react";
import { AdminHeader } from "@/components/admin/shell";
import { ThreadView } from "@/components/admin/trace-view";
import { Empty, Panel, Person } from "@/components/admin/ui";
import { adminApi, formatCompact, formatUsd } from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { m } from "@/paraglide/messages";

/** Hiç model çağrısı kaydı olmayan (izleme öncesinden kalan) sohbetler için doğrudan görünüm. */
export const Route = createFileRoute("/admin/ai/threads/$id")({
  component: ThreadPage,
});

function ThreadPage() {
  const { id } = Route.useParams();
  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "ai", "thread", id],
    queryFn: () => unwrap(adminApi.ai.threads[":id"].$get({ param: { id } })),
    retry: false,
  });
  if (isPending)
    return <div className="bg-card h-48 animate-pulse rounded-[22px] border border-white/8" />;
  if (error || !data) {
    return (
      <Panel>
        <Empty>{m.admin_trace_not_found()}</Empty>
      </Panel>
    );
  }
  const { thread } = data;
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
        title={thread.title ?? m.ai_new_chat()}
        eyebrow={<Person user={thread.user} />}
        description={m.admin_thread_totals({
          calls: thread.totals.calls,
          tokens: formatCompact(thread.totals.tokens),
          cost: formatUsd(thread.totals.cost),
        })}
      />
      <p className="text-foreground/55 m-0 flex items-center gap-2 text-xs">
        <EyeIcon className="size-3.5" />
        {m.admin_thread_audited()}
      </p>
      <Panel>
        <ThreadView thread={thread} />
      </Panel>
    </>
  );
}
