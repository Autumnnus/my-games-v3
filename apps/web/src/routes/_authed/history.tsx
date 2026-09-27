import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { describeChange } from "@/lib/history";
import { historyQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/history")({
  loader: ({ context }) => context.queryClient.ensureQueryData(historyQuery()),
  head: () => ({ meta: [{ title: `${m.history_title()} · ${m.app_name()}` }] }),
  component: HistoryPage,
});

const sourceLabels: Record<string, () => string> = {
  manual: m.history_source_manual,
  steam: m.history_source_steam,
  psn: m.history_source_psn,
  xbox: m.history_source_xbox,
  migration: m.history_source_migration,
  ai: m.history_source_ai,
  revert: m.history_source_revert,
  igdb: m.history_source_igdb,
  system: m.history_source_system,
};

const actionLabels = {
  create: m.history_action_create,
  update: m.history_action_update,
  delete: m.history_action_delete,
} as const;

function HistoryPage() {
  const { data } = useSuspenseQuery(historyQuery());
  const queryClient = useQueryClient();
  const revert = useMutation({
    mutationFn: (id: string) => unwrap(api.history[":id"].revert.$post({ param: { id } })),
    onSuccess: async () => {
      toast.success(m.history_revert_done());
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{m.history_title()}</h1>
        <p className="text-muted-foreground text-sm">{m.history_description()}</p>
      </div>
      {data.history.length === 0 && <p className="text-muted-foreground">{m.history_empty()}</p>}
      <ul className="divide-y rounded-lg border">
        {data.history.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start gap-3 p-3">
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {item.game ? (
                  item.entryId ? (
                    <Link
                      to="/e/$id"
                      params={{ id: item.entryId }}
                      className="font-medium hover:underline"
                    >
                      {item.game.name}
                    </Link>
                  ) : (
                    <Link
                      to="/g/$slug"
                      params={{ slug: item.game.slug }}
                      className="font-medium hover:underline"
                    >
                      {item.game.name}
                    </Link>
                  )
                ) : (
                  <span className="font-medium">{m.unknown()}</span>
                )}
                <span className="text-muted-foreground">{actionLabels[item.action]()}</span>
                <Badge variant="outline">
                  {(sourceLabels[item.source] ?? m.history_source_system)()}
                </Badge>
                <RelativeTime value={item.createdAt} className="text-muted-foreground text-xs" />
              </div>
              {item.action === "update" && (
                <ul className="text-muted-foreground grid gap-0.5 text-xs">
                  {item.changes.map((change) => (
                    <li key={change.field}>{describeChange(change)}</li>
                  ))}
                </ul>
              )}
            </div>
            {item.revertedAt ? (
              <Badge variant="secondary">{m.history_reverted()}</Badge>
            ) : item.source === "system" ? null : (
              <Button
                variant="ghost"
                size="sm"
                disabled={revert.isPending}
                onClick={() => revert.mutate(item.id)}
              >
                <Undo2Icon />
                {m.action_revert()}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
