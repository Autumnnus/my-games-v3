import type { EntryStatus } from "@my-games/shared";
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
    case "screenshots_added":
      return m.activity_screenshots({ count: Number(data.count ?? 1) });
    default:
      return "";
  }
}

export function ActivityCard({ item }: { item: FeedItem }) {
  const [showComments, setShowComments] = useState(false);
  const data = item.data as Record<string, unknown>;
  const gameLink = item.entryId
    ? ({ to: "/e/$id", params: { id: item.entryId } } as const)
    : item.game
      ? ({ to: "/g/$slug", params: { slug: item.game.slug } } as const)
      : null;

  return (
    <article className="grid gap-3 rounded-lg border p-4">
      <header className="flex items-center gap-2 text-sm">
        <Avatar className="size-8">
          {item.actor.image && <AvatarImage src={item.actor.image} alt="" />}
          <AvatarFallback>{item.actor.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Link
            to="/u/$username"
            params={{ username: item.actor.username ?? "" }}
            className="font-medium hover:underline"
          >
            {item.actor.name}
          </Link>{" "}
          <span className="text-muted-foreground">{phrase(item)}</span>
        </div>
        <RelativeTime value={item.updatedAt} className="text-muted-foreground shrink-0 text-xs" />
      </header>

      {item.game && gameLink && (
        <Link {...gameLink} className="hover:bg-accent/50 flex items-center gap-3 rounded-md p-1">
          <GameCover url={item.game.coverUrl} name={item.game.name} className="w-12 shrink-0" />
          <div className="grid min-w-0 gap-1">
            <span className="truncate font-medium">{item.game.name}</span>
            {item.verb === "rated" && typeof data.rating === "number" && (
              <span className="text-lg font-semibold">{formatRating(data.rating)}</span>
            )}
            {item.verb === "reviewed" && typeof data.excerpt === "string" && (
              <p className="text-muted-foreground line-clamp-3 text-sm">{data.excerpt}</p>
            )}
          </div>
        </Link>
      )}

      <footer className="-ml-2 flex items-center">
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
    <div className="grid gap-3">
      {items.map((item) => (
        <ActivityCard key={item.id} item={item} />
      ))}
      {query.hasNextPage && (
        <Button
          variant="outline"
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

export function NowPlaying() {
  const { data } = useQuery(nowPlayingQuery);
  if (!data?.players.length) return null;
  return (
    <section className="grid gap-2">
      <h2 className="text-muted-foreground text-sm font-medium">{m.now_playing_title()}</h2>
      <div className="flex flex-wrap gap-2">
        {data.players.map((player) => (
          <Link
            key={player.user.id}
            to="/u/$username"
            params={{ username: player.user.username ?? "" }}
            className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm hover:bg-accent"
          >
            <Avatar className="size-6">
              {player.user.image && <AvatarImage src={player.user.image} alt="" />}
              <AvatarFallback className="text-xs">{player.user.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{player.user.name}</span>
            <GamepadIcon className="size-3.5 text-emerald-400" />
            <span className="text-muted-foreground">{player.gameName}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
