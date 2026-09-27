import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { RelativeTime } from "@/components/time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";
import { type NotificationItem, notificationsQuery, unreadQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_authed/notifications")({
  loader: ({ context }) => context.queryClient.ensureQueryData(notificationsQuery),
  head: () => ({ meta: [{ title: `${m.notifications_title()} · ${m.app_name()}` }] }),
  component: NotificationsPage,
});

function text(item: NotificationItem) {
  const actor = item.actors[0]?.name ?? "";
  const others = item.count > 1 ? m.notification_others({ count: item.count - 1 }) : "";
  switch (item.type) {
    case "reaction":
      return m.notification_reaction({ actor, others });
    case "comment":
      return m.notification_comment({ actor, others });
    case "reply":
      return m.notification_reply({ actor });
    case "mention":
      return m.notification_mention({ actor });
    case "proposals":
      return m.notification_proposals({ count: item.count });
    default:
      return m.notification_system();
  }
}

function link(item: NotificationItem) {
  if (item.type === "proposals") return { to: "/inbox" } as const;
  const entryId = item.data.entryId;
  if (typeof entryId === "string") return { to: "/e/$id", params: { id: entryId } } as const;
  return { to: "/" } as const;
}

function NotificationsPage() {
  const { data } = useSuspenseQuery(notificationsQuery);
  const queryClient = useQueryClient();
  const markAll = useMutation({
    mutationFn: () => unwrap(api.notifications.read.$post({ json: {} })),
    onSuccess: (result) => {
      queryClient.setQueryData(unreadQuery.queryKey, result);
      void queryClient.invalidateQueries({ queryKey: notificationsQuery.queryKey });
    },
  });

  // Sayfa açıkken bildirimler okunmuş sayılır (liste bir sonraki ziyarette soluk görünür).
  const hasUnread = data.notifications.some((item) => !item.readAt);
  // biome-ignore lint/correctness/useExhaustiveDependencies: sadece açılışta
  useEffect(() => {
    if (hasUnread) markAll.mutate();
  }, []);

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{m.notifications_title()}</h1>
        {hasUnread && (
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate()}>
            {m.notifications_mark_all()}
          </Button>
        )}
      </div>
      {data.notifications.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">{m.notifications_empty()}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.notifications.map((item) => (
            <li key={item.id}>
              <Link
                {...link(item)}
                className={`hover:bg-accent/50 flex items-center gap-3 p-3 ${item.readAt ? "opacity-70" : ""}`}
              >
                <Avatar className="size-8">
                  {item.actors[0]?.image && <AvatarImage src={item.actors[0].image} alt="" />}
                  <AvatarFallback>{(item.actors[0]?.name ?? "•").charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                  <span>{text(item)}</span>
                  {typeof item.data.gameName === "string" && (
                    <span className="text-muted-foreground truncate text-xs">
                      {item.data.gameName}
                    </span>
                  )}
                </div>
                <RelativeTime
                  value={item.updatedAt}
                  className="text-muted-foreground shrink-0 text-xs"
                />
                {!item.readAt && <span className="bg-primary size-2 shrink-0 rounded-full" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
