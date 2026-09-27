import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { unreadQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

/**
 * Okunmamış bildirim sayısı. Sunucu, sayı değiştikçe SSE ile bildirir; bağlantı koparsa tarayıcı
 * EventSource'u kendisi yeniden bağlar.
 */
export function NotificationBell() {
  const queryClient = useQueryClient();
  const { data } = useQuery(unreadQuery);

  useEffect(() => {
    const source = new EventSource("/api/v1/notifications/stream", { withCredentials: true });
    source.addEventListener("unread", (event) => {
      const { count } = JSON.parse((event as MessageEvent<string>).data) as { count: number };
      const previous = queryClient.getQueryData(unreadQuery.queryKey)?.count;
      queryClient.setQueryData(unreadQuery.queryKey, { count });
      if (previous !== undefined && count > previous) {
        void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
        void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      }
    });
    return () => source.close();
  }, [queryClient]);

  const count = data?.count ?? 0;
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={m.notifications_title()}
    >
      <Link to="/notifications">
        <BellIcon />
        {count > 0 && (
          <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-[10px] leading-4">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
