import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDownIcon, Undo2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { dayLabel, describeChange, groupHistory, netChanges } from "@/lib/history";
import { historyQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

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

type HistoryItem = ReturnType<typeof useHistory>["history"][number];

const useHistory = () => useSuspenseQuery(historyQuery()).data;

function useRevert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.history[":id"].revert.$post({ param: { id } })),
    onSuccess: async () => {
      toast.success(m.history_revert_done());
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function HistoryPage() {
  const data = useHistory();
  const days = groupHistory(data.history);

  return (
    <div className="grid gap-4 pt-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {m.history_title()}
        </h1>
        <p className="text-muted-foreground text-sm">{m.history_description()}</p>
      </div>
      {data.history.length === 0 && <p className="text-muted-foreground">{m.history_empty()}</p>}
      {days.map(({ day, groups }) => (
        <section key={day} className="grid gap-2">
          <h2 className="text-muted-foreground px-1 text-xs font-bold tracking-[0.14em] uppercase">
            <time dateTime={day} suppressHydrationWarning>
              {dayLabel(day)}
            </time>
          </h2>
          <ul className="bg-card divide-y overflow-hidden rounded-[22px] border">
            {groups.map((group) =>
              group.items.length === 1 ? (
                <li key={group.key} className="p-3">
                  <HistoryRow item={group.items[0] as HistoryItem} />
                </li>
              ) : (
                <HistoryGroup key={group.key} items={group.items} />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function GameName({ item }: { item: HistoryItem }) {
  if (!item.game) return <span className="font-medium">{m.unknown()}</span>;
  return item.entryId ? (
    <Link to="/e/$id" params={{ id: item.entryId }} className="font-medium hover:underline">
      {item.game.name}
    </Link>
  ) : (
    <Link to="/g/$slug" params={{ slug: item.game.slug }} className="font-medium hover:underline">
      {item.game.name}
    </Link>
  );
}

const sourceLabel = (source: string) => (sourceLabels[source] ?? m.history_source_system)();

const clock = (value: string | Date) =>
  new Intl.DateTimeFormat(getLocale(), { timeStyle: "short" }).format(new Date(value));

/** Tek kayıt. `nested` iken grubun içinde: oyun adı yerine saat yazılır. */
function HistoryRow({ item, nested }: { item: HistoryItem; nested?: boolean }) {
  const revert = useRevert();
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {nested ? (
            <time
              dateTime={new Date(item.createdAt).toISOString()}
              className="text-muted-foreground font-medium tabular-nums"
              suppressHydrationWarning
            >
              {clock(item.createdAt)}
            </time>
          ) : (
            <>
              <GameName item={item} />
              <span className="text-muted-foreground">{actionLabels[item.action]()}</span>
            </>
          )}
          <Badge variant="outline">{sourceLabel(item.source)}</Badge>
          {!nested && (
            <RelativeTime value={item.createdAt} className="text-muted-foreground text-xs" />
          )}
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
    </div>
  );
}

/**
 * Aynı gün aynı oyundaki güncellemeler (ör. ardı ardına Steam sync'leri): kapalıyken net etki (toplam süre,
 * açılan başarım), açılınca kayıt kayıt döküm ve her birini geri alma.
 */
function HistoryGroup({ items }: { items: HistoryItem[] }) {
  const [open, setOpen] = useState(false);
  const latest = items[0] as HistoryItem;
  const sources = [...new Set(items.map((item) => item.source))];
  const summary = netChanges(items);
  return (
    <li className="grid gap-3 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <GameName item={latest} />
            <span className="text-muted-foreground">{actionLabels.update()}</span>
            {sources.map((source) => (
              <Badge key={source} variant="outline">
                {sourceLabel(source)}
              </Badge>
            ))}
            <RelativeTime value={latest.createdAt} className="text-muted-foreground text-xs" />
          </div>
          {summary.length > 0 && (
            <ul className="text-muted-foreground grid gap-0.5 text-xs">
              {summary.map((change) => (
                <li key={change.field}>{describeChange(change)}</li>
              ))}
            </ul>
          )}
        </div>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {m.history_group_count({ count: items.length })}
          <ChevronDownIcon
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </div>
      {open && (
        <ul className="ml-1 grid gap-3 border-l border-white/10 pl-4">
          {items.map((item) => (
            <li key={item.id}>
              <HistoryRow item={item} nested />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
