import { useNavigate } from "@tanstack/react-router";
import type { Notification } from "@my-games/shared";
import { Avatar } from "@/components/ui/Avatar";
import { timeAgo } from "@/lib/formatters";
import { NOTIFICATION_CONFIG } from "./notificationConfig";

interface Props {
  notification: Notification;
  onRead: (id: string) => void;
}

export function NotificationItem({ notification, onRead }: Props) {
  const navigate = useNavigate();
  const config = NOTIFICATION_CONFIG[notification.type];
  const href = config.href(notification);

  function handleClick() {
    if (!notification.isRead) onRead(notification._id);
    if (href) navigate({ to: href as never });
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left flex gap-3 px-4 py-3 transition-colors rounded-xl"
      style={{
        background: notification.isRead
          ? "transparent"
          : "var(--theme-accent-soft)",
      }}
    >
      {/* Unread dot */}
      <div className="relative shrink-0 mt-0.5">
        <Avatar
          src={notification.actor.profileImage}
          name={notification.actor.name}
          size="sm"
        />
        {!notification.isRead && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
            style={{
              background: config.rawColor,
              borderColor: "var(--theme-bg-overlay)",
            }}
          />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {/* Type icon + title */}
        <div className="flex items-start gap-1.5">
          <span
            className="mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
            style={{ background: config.bgColor, color: config.rawColor }}
          >
            {config.icon}
          </span>
          <p
            className="text-sm leading-snug"
            style={{ color: "var(--theme-text-primary)" }}
          >
            <strong style={{ fontWeight: 600 }}>
              {config.title(notification)}
            </strong>
          </p>
        </div>

        {/* Body */}
        <p
          className="mt-0.5 text-xs line-clamp-2 pl-6"
          style={{ color: "var(--theme-text-muted)" }}
        >
          {config.body(notification)}
        </p>

        {/* Screenshot thumbnail */}
        {notification.type === "screenshot_added" &&
          notification.metadata.firstScreenshotUrl && (
            <div className="mt-2 pl-6">
              <img
                src={notification.metadata.firstScreenshotUrl}
                alt=""
                className="h-14 w-auto rounded object-cover border border-white/10"
                loading="lazy"
              />
            </div>
          )}

        {/* Timestamp */}
        <p
          className="mt-1 text-xs pl-6"
          style={{ color: "var(--theme-text-muted)" }}
        >
          {timeAgo(notification.createdAt)}
        </p>
      </div>

      {/* Game cover */}
      {notification.game?.coverUrl && (
        <div className="shrink-0 hidden sm:block">
          <img
            src={notification.game.coverUrl}
            alt={notification.game.title}
            className="w-8 h-11 rounded object-cover border border-white/10 opacity-70"
            loading="lazy"
          />
        </div>
      )}
    </button>
  );
}
