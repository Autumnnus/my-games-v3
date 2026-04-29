import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
} from "@/hooks/useNotifications";
import { NotificationItem } from "./NotificationItem";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose }: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useNotifications(1);
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Panel dışına tıklanınca kapat
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          className="glass-card glass-dropdown-menu absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-1rem)] z-50 overflow-hidden"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--theme-glass-border)" }}
          >
            <div className="flex items-center gap-2">
              <Bell size={15} style={{ color: "var(--theme-text-secondary)" }} />
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--theme-text-primary)" }}
              >
                {t("navbar.notifications")}
              </span>
              {unreadCount > 0 && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "var(--theme-accent)",
                    color: "var(--theme-text-inverse)",
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
                className="flex items-center gap-1 text-xs transition-colors hover:text-[var(--theme-accent)]"
                style={{ color: "var(--theme-text-muted)" }}
              >
                <CheckCheck size={13} />
                {t("notifications.markAllAsRead")}
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
        </motion.div>
      )}
    </AnimatePresence>
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
      <Inbox size={28} style={{ color: "var(--theme-text-muted)" }} />
      <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
        {t("notifications.empty")}
      </p>
    </div>
  );
}
