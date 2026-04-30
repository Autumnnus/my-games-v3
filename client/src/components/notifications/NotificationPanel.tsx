import {
  useMarkAllAsRead,
  useMarkAsRead,
  useNotifications,
} from "@/hooks/useNotifications";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotificationItem } from "./NotificationItem";

export function NotificationPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useNotifications(1);
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="w-96 max-w-[calc(100vw-1rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">
            {t("translation:navbar.notifications")}
          </span>
          {unreadCount > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-accent text-text-inverse">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
            className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent"
          >
            <CheckCheck size={13} />
            {t("translation:notifications.markAllAsRead")}
          </button>
        )}
      </div>

      {/* List */}
      <div className="overflow-y-auto max-h-[460px] py-1">
        {isLoading ? (
          <NotificationSkeleton />
        ) : items.length === 0 ? (
          <EmptyNotifications />
        ) : (
          items.map((n) => (
            <NotificationItem
              key={n._id}
              notification={n}
              onRead={(id) => markAsRead.mutate(id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NotificationSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3 p-2">
          <div className="w-7 h-7 rounded-full glass-skeleton shrink-0" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-3 w-3/4 glass-skeleton" />
            <div className="h-3 w-1/2 glass-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyNotifications() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 py-12">
      <Inbox size={28} className="text-text-muted" />
      <p className="text-sm text-text-muted">
        {t("translation:notifications.empty")}
      </p>
    </div>
  );
}
