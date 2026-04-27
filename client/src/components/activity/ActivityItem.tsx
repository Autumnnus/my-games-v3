import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import type { Activity } from "@my-games/shared";
import { Avatar } from "@/components/ui/Avatar";
import { timeAgo } from "@/lib/formatters";
import { ACTIVITY_CONFIG } from "./activityConfig";

interface Props {
  activity: Activity;
  index: number;
}

// Upsert yapılan tipler: updatedAt > createdAt ise "düzenlendi" göster
const UPSERT_TYPES = new Set([
  "game_rated",
  "game_reviewed",
  "status_changed",
  "steam_synced",
  "screenshot_added",
]);

export function ActivityItem({ activity, index }: Props) {
  const config = ACTIVITY_CONFIG[activity.type];
  const user = activity.user;
  const game = activity.game;
  const entryId = activity.libraryEntry;

  // updatedAt createdAt'tan en az 10 saniye sonraysa "düzenlendi" say
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
      className="group relative flex gap-3 p-4 rounded-xl border transition-all duration-200 hover:border-white/20"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(255,255,255,0.07)",
      }}
    >
      {/* Left color strip */}
      <div
        className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full opacity-60"
        style={{ background: config.rawColor }}
      />

      {/* User avatar → kullanıcı profiline gider */}
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
          {/* Kullanıcı adı */}
          <Link
            to="/users/$id"
            params={{ id: user._id }}
            className="font-semibold hover:text-white transition-colors"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {user.name}
          </Link>

          {/* Activity badge */}
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: config.bgColor,
              border: `1px solid ${config.borderColor}`,
              color: config.rawColor,
            }}
          >
            <span>{config.icon}</span>
            <span>{config.label(activity)}</span>
          </span>

          {/* Oyun adı → oyun detay sayfasına gider */}
          {game && (
            <>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
              {entryId ? (
                <Link
                  to="/games/$id"
                  params={{ id: entryId }}
                  className="font-medium truncate max-w-[200px] text-sm hover:text-white transition-colors"
                  style={{ color: "rgba(255,255,255,0.75)" }}
                  title={game.title}
                >
                  {game.title}
                </Link>
              ) : (
                <span
                  className="font-medium truncate max-w-[200px] text-sm"
                  style={{ color: "rgba(255,255,255,0.75)" }}
                  title={game.title}
                >
                  {game.title}
                </span>
              )}
            </>
          )}
        </div>

        {/* Review snippet */}
        {activity.type === "game_reviewed" && activity.metadata.review && (
          <p
            className="mt-2 text-sm italic line-clamp-2 pl-2 border-l-2"
            style={{
              color: "rgba(255,255,255,0.5)",
              borderColor: config.rawColor + "66",
            }}
          >
            "{activity.metadata.review}"
          </p>
        )}

        {/* Screenshot thumbnail — oyun sayfasına gider */}
        {activity.type === "screenshot_added" &&
          activity.metadata.firstScreenshotUrl && (
            <div className="mt-2">
              {entryId ? (
                <Link to="/games/$id" params={{ id: entryId }}>
                  <img
                    src={activity.metadata.firstScreenshotUrl}
                    alt="screenshot"
                    className="h-20 w-auto rounded-lg object-cover border border-white/10 opacity-80 group-hover:opacity-100 transition-opacity hover:border-white/30"
                    loading="lazy"
                  />
                </Link>
              ) : (
                <img
                  src={activity.metadata.firstScreenshotUrl}
                  alt="screenshot"
                  className="h-20 w-auto rounded-lg object-cover border border-white/10 opacity-80 group-hover:opacity-100 transition-opacity"
                  loading="lazy"
                />
              )}
            </div>
          )}

        {/* Rating dots */}
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
                      : "rgba(255,255,255,0.1)",
                }}
              />
            ))}
            <span className="ml-1.5 text-xs font-medium text-amber-400">
              {activity.metadata.rating}/10
            </span>
          </div>
        )}

        {/* Timestamp + düzenlendi */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
            {timeAgo(displayTime)}
          </p>
          {wasEdited && (
            <span
              className="inline-flex items-center gap-0.5 text-xs"
              style={{ color: "rgba(255,255,255,0.2)" }}
              title="Bu aktivite güncellendi"
            >
              <Pencil size={9} />
              düzenlendi
            </span>
          )}
        </div>
      </div>

      {/* Game cover → oyun sayfasına gider */}
      {game?.coverUrl && (
        <div className="shrink-0 hidden sm:block">
          {entryId ? (
            <Link to="/games/$id" params={{ id: entryId }}>
              <img
                src={game.coverUrl}
                alt={game.title}
                className="w-9 h-[52px] rounded object-cover border border-white/10 opacity-70 group-hover:opacity-100 hover:border-white/30 transition-all"
                loading="lazy"
              />
            </Link>
          ) : (
            <img
              src={game.coverUrl}
              alt={game.title}
              className="w-9 h-[52px] rounded object-cover border border-white/10 opacity-70 group-hover:opacity-100 transition-opacity"
              loading="lazy"
            />
          )}
        </div>
      )}
    </motion.div>
  );
}
