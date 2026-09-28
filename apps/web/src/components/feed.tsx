import { type EntryStatus, steamCapsuleUrl } from "@my-games/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GamepadIcon, MessageCircleIcon } from "lucide-react";
import { useState } from "react";
import { CommentThread } from "@/components/comments";
import { GameCover } from "@/components/game-cover";
import { LikeButton } from "@/components/like-button";
import { RelativeTime } from "@/components/time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatPlaytime, formatRating } from "@/lib/format";
import { type FeedItem, type FeedScope, feedQuery, nowPlayingQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const statusPhrases: Record<EntryStatus, () => string> = {
  playing: m.activity_status_playing,
  completed: m.activity_status_completed,
  paused: m.activity_status_paused,
  dropped: m.activity_status_dropped,
  backlog: m.activity_status_backlog,
  wishlist: m.activity_status_wishlist,
  endless: m.activity_status_endless,
};

function phrase(item: FeedItem) {
  const data = item.data as Record<string, unknown>;
  switch (item.verb) {
    case "entry_added":
      return Number(data.count ?? 1) > 1
        ? m.activity_entry_added_many({ count: Number(data.count) })
        : m.activity_entry_added();
    case "status_changed":
      return (statusPhrases[data.to as EntryStatus] ?? m.activity_status_playing)();
    case "rated":
      return m.activity_rated();
    case "reviewed":
      return m.activity_reviewed();
    case "played":
      return m.activity_played({ time: formatPlaytime(Number(data.minutes ?? 0)) });
    case "playtime_milestone":
      return m.activity_milestone({ time: formatPlaytime(Number(data.minutes ?? 0)) });
    case "achievements_completed":
      return m.activity_achievements();
    case "achievements_unlocked":
      return Number(data.count ?? 1) > 1
        ? m.activity_achievements_unlocked({ count: Number(data.count) })
        : m.activity_achievement_unlocked();
    case "screenshots_added":
      return m.activity_screenshots({ count: Number(data.count ?? 1) });
    default:
      return "";
  }
}

type AchievementItem = {
  apiName: string;
  name: string;
  localized: Record<string, { name: string }> | null;
  iconUrl: string | null;
  rarity: number | null;
};

/** Akış kartında açılan başarımlar (en nadirler önce, platformun ikonlarıyla). */
function AchievementStrip({ items }: { items: AchievementItem[] }) {
  const locale = getLocale();
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((achievement) => {
        const name = achievement.localized?.[locale]?.name ?? achievement.name;
        const rarity =
          achievement.rarity !== null
            ? ` · ${m.achievements_rarity({ percent: achievement.rarity < 10 ? achievement.rarity.toFixed(1) : Math.round(achievement.rarity) })}`
            : "";
        return (
          <li
            key={achievement.apiName}
            title={`${name}${rarity}`}
            className="flex items-center gap-1.5 text-xs"
          >
            {achievement.iconUrl && (
              <img src={achievement.iconUrl} alt="" loading="lazy" className="size-7 rounded" />
            )}
            <span className="max-w-40 truncate">{name}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Oyunun sahne görseliyle büyük kart gösterilen olaylar (bitirme, puan, inceleme). */
function isHighlight(item: FeedItem) {
  const data = item.data as Record<string, unknown>;
  if (!item.game?.heroUrl) return false;
  return (
    item.verb === "rated" ||
    item.verb === "reviewed" ||
    (item.verb === "status_changed" && data.to === "completed")
  );
}

function ActorLine({ item }: { item: FeedItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-10 ring-2 ring-white/10">
        {item.actor.image && <AvatarImage src={item.actor.image} alt="" />}
        <AvatarFallback>{item.actor.name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 gap-0.5">
        <p className="truncate text-[15px]">
          <Link
            to="/u/$username"
            params={{ username: item.actor.username ?? "" }}
            className="font-bold hover:underline"
          >
            {item.actor.name}
          </Link>{" "}
          <span className="text-foreground/80">{phrase(item)}</span>
        </p>
        <RelativeTime value={item.updatedAt} className="text-muted-foreground text-xs" />
      </div>
    </div>
  );
}

export function ActivityCard({ item }: { item: FeedItem }) {
  const [showComments, setShowComments] = useState(false);
  const data = item.data as Record<string, unknown>;
  const gameLink = item.entryId
    ? ({ to: "/e/$id", params: { id: item.entryId } } as const)
    : item.game
      ? ({ to: "/g/$slug", params: { slug: item.game.slug } } as const)
      : null;
  const rating = typeof data.rating === "number" ? formatRating(data.rating) : null;
  const highlight = isHighlight(item);

  return (
    <article className="bg-card overflow-hidden rounded-[22px] border transition-colors hover:border-white/16">
      {highlight && item.game && gameLink ? (
        <Link {...gameLink} className="group relative block h-48">
          <img
            src={item.game.heroUrl ?? ""}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-(--ease-salon) group-hover:scale-[1.03]"
          />
          <div className="from-card/0 to-card/95 absolute inset-0 bg-gradient-to-b from-25%" />
          <span className="font-display absolute top-4 right-5 max-w-[60%] truncate text-right text-sm font-medium text-white/90 drop-shadow">
            {item.game.name}
          </span>
          {rating && (
            <span className="font-display absolute right-5 bottom-4 text-3xl font-semibold">
              {rating}
            </span>
          )}
        </Link>
      ) : null}
      <div className="grid gap-3 p-4">
        <ActorLine item={item} />
        {!highlight && item.game && gameLink && (
          <Link
            {...gameLink}
            className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-2 transition-colors hover:bg-white/[0.07]"
          >
            <GameCover
              url={item.game.coverUrl}
              name={item.game.name}
              color={item.game.accentColor}
              className="w-11 shrink-0 rounded-lg"
            />
            <div className="grid min-w-0 gap-1">
              <span className="truncate font-semibold">{item.game.name}</span>
              {item.verb === "rated" && rating && (
                <span className="font-display text-lg font-semibold">{rating}</span>
              )}
              {item.verb === "achievements_unlocked" && Array.isArray(data.items) && (
                <AchievementStrip items={data.items as AchievementItem[]} />
              )}
            </div>
          </Link>
        )}
        {item.previews.length > 0 && gameLink && (
          <Link {...gameLink} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {item.previews.map((url) => (
              <span key={url} className="block aspect-video overflow-hidden rounded-xl bg-white/5">
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-500 ease-(--ease-salon) hover:scale-105"
                />
              </span>
            ))}
          </Link>
        )}
        {item.verb === "reviewed" && typeof data.excerpt === "string" && (
          <p className="text-foreground/85 line-clamp-3 text-[15px] leading-relaxed">
            “{data.excerpt}”
          </p>
        )}
        <footer className="-ml-1 flex items-center gap-1">
          <LikeButton
            targetType="activity"
            targetId={item.id}
            count={item.reactionCount}
            liked={item.viewerReacted}
          />
          <Button variant="ghost" size="sm" onClick={() => setShowComments(!showComments)}>
            <MessageCircleIcon />
            {item.commentCount > 0 && item.commentCount}
          </Button>
        </footer>
        {showComments && <CommentThread targetType="activity" targetId={item.id} />}
      </div>
    </article>
  );
}

export function Feed({ scope }: { scope: FeedScope }) {
  const query = useInfiniteQuery(feedQuery(scope));
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isSuccess && items.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{m.feed_empty()}</p>;
  }
  return (
    <div className="grid gap-4">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="animate-rise"
          style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
        >
          <ActivityCard item={item} />
        </div>
      ))}
      {query.hasNextPage && (
        <Button
          variant="glass"
          className="justify-self-center"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {m.action_load_more()}
        </Button>
      )}
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative inline-flex size-2">
      <span className="bg-live absolute inset-0 animate-ping-slow rounded-full" />
      <span className="bg-live relative size-2 rounded-full" />
    </span>
  );
}

/** Steam'de şu an oyunda olanlar; cam panel, nabız gibi atan canlı durum. */
export function NowPlaying({ className }: { className?: string }) {
  const { data } = useQuery(nowPlayingQuery);
  const players = data?.players ?? [];
  return (
    <section
      aria-label={m.now_playing_title()}
      className={`glass grid gap-3.5 rounded-[22px] border border-white/10 p-[18px] ${className ?? ""}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold">{m.now_playing_title()}</h2>
        <span className="text-live flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em]">
          <LiveDot />
          {m.salon_live()}
        </span>
      </div>
      {players.length === 0 && (
        <p className="text-muted-foreground text-sm">{m.salon_now_playing_empty()}</p>
      )}
      {players.map((player) => {
        const minutes = player.since
          ? Math.max(1, Math.round((Date.now() - new Date(player.since).getTime()) / 60_000))
          : null;
        return (
          <Link
            key={player.user.id}
            to="/u/$username"
            params={{ username: player.user.username ?? "" }}
            className="flex items-center gap-3"
          >
            <span className="relative size-11 shrink-0">
              <span className="border-live absolute inset-0 animate-ping-slow rounded-full border-2" />
              <Avatar className="size-11">
                {player.user.image && <AvatarImage src={player.user.image} alt="" />}
                <AvatarFallback>{player.user.name.charAt(0)}</AvatarFallback>
              </Avatar>
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-sm font-bold">{player.user.name}</span>
              <span className="text-foreground/75 truncate text-[13px]">
                {player.gameName}
                {minutes ? ` · ${formatPlaytime(minutes)}` : ""}
              </span>
            </span>
            {player.appId ? (
              <img
                src={steamCapsuleUrl(player.appId)}
                alt=""
                loading="lazy"
                className="h-[51px] w-[34px] rounded-[5px] object-cover"
              />
            ) : (
              <GamepadIcon className="text-live size-4" />
            )}
          </Link>
        );
      })}
    </section>
  );
}
