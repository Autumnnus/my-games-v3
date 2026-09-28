import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BanIcon, CheckIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { reportsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: ({ context }) => {
    if (context.user?.role !== "admin") throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: `${m.admin_title()} · ${m.app_name()}` }] }),
  component: AdminPage,
});

const targetLabels = {
  comment: m.admin_target_comment,
  entry: m.admin_target_entry,
  screenshot: m.admin_target_screenshot,
  user: m.admin_target_user,
} as const;

function AdminPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery(reportsQuery("open"));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });

  const resolve = useMutation({
    mutationFn: (input: {
      id: string;
      outcome: "resolved" | "dismissed";
      removeContent?: boolean;
    }) =>
      unwrap(
        api.admin.reports[":id"].resolve.$post({
          param: { id: input.id },
          json: { outcome: input.outcome, removeContent: input.removeContent },
        }),
      ),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const ban = useMutation({
    mutationFn: (userId: string) =>
      unwrap(api.admin.users[":id"].ban.$post({ param: { id: userId }, json: {} })),
    onSuccess: () => toast.success(m.admin_banned()),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="grid max-w-3xl gap-4 pt-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {m.admin_title()}
      </h1>
      {data && data.reports.length === 0 && (
        <p className="text-muted-foreground">{m.admin_empty()}</p>
      )}
      {data?.reports.map((report) => (
        <article key={report.id} className="bg-card grid gap-3 rounded-[22px] border p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{targetLabels[report.targetType]()}</Badge>
            <span className="text-muted-foreground">
              {m.admin_reported_by({ name: report.reporter.name })}
            </span>
            <RelativeTime value={report.createdAt} className="text-muted-foreground text-xs" />
          </div>
          <p className="text-sm">{report.reason}</p>
          {report.preview?.text && (
            <blockquote className="text-muted-foreground border-l-2 pl-3 text-sm whitespace-pre-line">
              {report.preview.text}
            </blockquote>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={resolve.isPending || report.targetType === "user"}
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
              <Button
                size="sm"
                variant="ghost"
                disabled={ban.isPending}
                onClick={() => {
                  if (window.confirm(m.admin_ban_confirm()))
                    ban.mutate(report.preview?.ownerId ?? "");
                }}
              >
                <BanIcon />
                {m.admin_ban()}
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
