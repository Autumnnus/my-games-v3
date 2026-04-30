import { Avatar } from "@/components/ui/Avatar";
import { timeAgo } from "@/lib/formatters";
import type { Activity } from "@my-games/shared";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVITY_CONFIG } from "./activityConfig";

interface Props {
  activity: Activity;
  index: number;
}

const UPSERT_TYPES = new Set([
  "game_rated",
  "game_reviewed",
  "status_changed",
  "steam_synced",
  "screenshot_added",
]);

export function ActivityItem({ activity, index }: Props) {
  const { t } = useTranslation();
  const config = ACTIVITY_CONFIG[activity.type];
  const user = activity.user;
  const game = activity.game;
  const entryId = activity.libraryEntry;

  const wasEdited =
    UPSERT_TYPES.has(activity.type) &&
    new Date(activity.updatedAt).getTime() -
      new Date(activity.createdAt).getTime() >
      10_000;

  const displayTime = activity.updatedAt ?? activity.createdAt;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.3 }}
      className="group relative flex gap-3 p-4 rounded-xl border transition-all duration-200 hover:border-glass-border-hover"
      style={{
        background: "var(--theme-surface-subtle)",
        borderColor: "var(--theme-glass-border)",
      }}
    >
      {/* Left color strip */}
      <div
        className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full opacity-60"
        style={{ background: config?.rawColor ?? "#888" }}
      />

      {/* User avatar */}
      <Link
        to="/users/$id"
        params={{ id: user._id }}
        className="shrink-0 mt-0.5"
      >
        <Avatar src={user.profileImage} name={user.name} size="sm" />
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Action line */}
        <div className="flex flex-wrap items-center gap-1.5 text-sm leading-snug">
          <Link
            to="/users/$id"
            params={{ id: user._id }}
            className="font-semibold hover:text-white transition-colors text-text-primary"
          >
            {user.name}
          </Link>

          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: config?.bgColor ?? "var(--theme-surface-subtle)",
              border: `1px solid ${config?.borderColor ?? "var(--theme-glass-border)"}`,
              color: config?.rawColor ?? "var(--theme-text-secondary)",
            }}
          >
            <span>{config?.icon}</span>
            <span>{t(config?.labelKey ?? "activity.all")}</span>
          </span>

          {game && (
            <>
              <span className="text-text-muted">·</span>
              {entryId ? (
                <Link
                  to="/games/$id"
                  params={{ id: entryId }}
                  className="font-medium truncate max-w-[200px] text-sm hover:text-white transition-colors text-text-secondary"
                  title={game.title}
                >
                  {game.title}
                </Link>
              ) : (
                <span
                  className="font-medium truncate max-w-[200px] text-sm text-text-secondary"
                  title={game.title}
                >
                  {game.title}
                </span>
              )}
            </>
          )}
        </div>

        {activity.type === "game_reviewed" && activity.metadata.review && (
          <p
            className="mt-2 text-sm italic line-clamp-2 pl-2 border-l-2"
            style={{
              color: "var(--theme-text-muted)",
              borderColor: (config?.rawColor ?? "#888") + "66",
            }}
          >
            "{activity.metadata.review}"
          </p>
        )}

        {activity.type === "screenshot_added" &&
          activity.metadata.firstScreenshotUrl && (
            <div className="mt-2">
              {entryId ? (
                <Link to="/games/$id" params={{ id: entryId }}>
                  <img
                    src={activity.metadata.firstScreenshotUrl}
                    alt="screenshot"
                    className="h-20 w-auto rounded-lg object-cover border border-glass-border opacity-80 group-hover:opacity-100 transition-opacity hover:border-glass-border-hover"
                    loading="lazy"
                  />
                </Link>
              ) : (
                <img
                  src={activity.metadata.firstScreenshotUrl}
                  alt="screenshot"
                  className="h-20 w-auto rounded-lg object-cover border border-glass-border opacity-80 group-hover:opacity-100 transition-opacity"
                  loading="lazy"
                />
              )}
            </div>
          )}

        {activity.type === "game_rated" && activity.metadata.rating && (
          <div className="mt-1.5 flex items-center gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    i < activity.metadata.rating!
                      ? "#f59e0b"
                      : "var(--theme-glass-border)",
                }}
              />
            ))}
            <span className="ml-1.5 text-xs font-medium text-amber-400">
              {activity.metadata.rating}/10
            </span>
          </div>
        )}

        {activity.type === "milestone_playtime" && activity.metadata.hours && (
          <p
            className="mt-1.5 text-xs font-medium"
            style={{ color: config?.rawColor ?? "var(--theme-text-secondary)" }}
          >
            {activity.metadata.hours >= 1000
              ? `${(activity.metadata.hours / 1000).toFixed(1)}k`
              : activity.metadata.hours}{" "}
            {t("translation:activity.hoursAbbrev")}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-1.5">
          <p className="text-xs text-text-muted">{timeAgo(displayTime)}</p>
          {wasEdited && (
            <span
              className="inline-flex items-center gap-0.5 text-xs text-text-muted"
              title="Bu aktivite güncellendi"
            >
              <Pencil size={9} />
              {t("translation:activity.edited")}
            </span>
          )}
        </div>
      </div>

      {game?.coverUrl && (
        <div className="shrink-0 hidden sm:block">
          {entryId ? (
            <Link to="/games/$id" params={{ id: entryId }}>
              <img
                src={game.coverUrl}
                alt={game.title}
                className="w-9 h-[52px] rounded object-cover border border-glass-border opacity-70 group-hover:opacity-100 hover:border-glass-border-hover transition-all"
                loading="lazy"
              />
            </Link>
          ) : (
            <img
              src={game.coverUrl}
              alt={game.title}
              className="w-9 h-[52px] rounded object-cover border border-glass-border opacity-70 group-hover:opacity-100 transition-opacity"
              loading="lazy"
            />
          )}
        </div>
      )}
    </motion.div>
  );
}
