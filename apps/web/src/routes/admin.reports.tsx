import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckIcon, Trash2Icon, UserCogIcon } from "lucide-react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { AdminHeader } from "@/components/admin/shell";
import { Empty, Panel, Pill, Segmented } from "@/components/admin/ui";
import { RelativeTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import { adminApi, reportsQuery } from "@/lib/admin";
import { unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { m } from "@/paraglide/messages";

const statuses = ["open", "resolved", "dismissed"] as const;

export const Route = createFileRoute("/admin/reports")({
  validateSearch: z.object({ status: z.optional(z.enum(statuses)) }),
  component: ReportsPage,
});

const targetLabels = {
  comment: m.admin_target_comment,
  entry: m.admin_target_entry,
  screenshot: m.admin_target_screenshot,
  user: m.admin_target_user,
} as const;

const statusLabels = {
  open: m.admin_reports_open,
  resolved: m.admin_reports_resolved,
  dismissed: m.admin_reports_dismissed,
} as const;

function ReportsPage() {
  const search = Route.useSearch();
  const status = search.status ?? "open";
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(reportsQuery(status));

  const resolve = useMutation({
    mutationFn: (input: {
      id: string;
      outcome: "resolved" | "dismissed";
      removeContent?: boolean;
    }) =>
      unwrap(
        adminApi.reports[":id"].resolve.$post({
          param: { id: input.id },
          json: { outcome: input.outcome, removeContent: input.removeContent },
        }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "reports"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "overview"] }),
      ]),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <AdminHeader title={m.admin_nav_reports()} description={m.admin_reports_description()} />
      <Segmented
        label={m.admin_reports_status()}
        value={status}
        options={statuses.map((value) => ({ value, label: statusLabels[value]() }))}
        onChange={(value) =>
          void navigate({ search: { status: value === "open" ? undefined : value }, replace: true })
        }
      />
      {isPending ? (
        <div className="bg-card h-32 animate-pulse rounded-[22px] border border-white/8" />
      ) : !data || data.reports.length === 0 ? (
        <Panel>
          <Empty>{status === "open" ? m.admin_empty() : m.admin_reports_none()}</Empty>
        </Panel>
      ) : (
        <div className="grid gap-3">
          {data.reports.map((report) => (
            <Panel key={report.id}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pill tone="warn">{targetLabels[report.targetType]()}</Pill>
                <span className="text-foreground/65">
                  {m.admin_reported_by({ name: report.reporter.name })}
                </span>
                <RelativeTime value={report.createdAt} className="text-foreground/50 text-xs" />
              </div>
              <p className="m-0 text-sm">{report.reason}</p>
              {report.preview?.text ? (
                <blockquote className="text-foreground/75 m-0 border-l-2 border-white/15 pl-3 text-sm whitespace-pre-line">
                  {report.preview.text}
                </blockquote>
              ) : (
                !report.preview && (
                  <p className="text-foreground/50 m-0 text-xs italic">{m.admin_reports_gone()}</p>
                )
              )}
              {status === "open" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={resolve.isPending || report.targetType === "user" || !report.preview}
                    onClick={() =>
                      resolve.mutate({ id: report.id, outcome: "resolved", removeContent: true })
                    }
                  >
                    <Trash2Icon />
                    {m.admin_remove()}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: report.id, outcome: "dismissed" })}
                  >
                    <CheckIcon />
                    {m.admin_dismiss()}
                  </Button>
                  {report.preview?.ownerId && (
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/admin/users/$id" params={{ id: report.preview.ownerId }}>
                        <UserCogIcon />
                        {m.admin_reports_owner()}
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
