import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, InboxIcon, ShuffleIcon, TrophyIcon } from "lucide-react";
import { GameCover } from "@/components/game-cover";
import { RelativeTime } from "@/components/time";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ToolOutput } from "@/lib/assistant";
import { formatDate, formatPlaytime, formatRating, statusLabel } from "@/lib/format";
import { m } from "@/paraglide/messages";

const card = "grid gap-3 rounded-[18px] border border-white/8 bg-[#16171d] p-3.5";
const hours = (value: number) => formatPlaytime(value * 60);
const score = (value: number | null) => (value === null ? "—" : (formatRating(value * 10) ?? "—"));

export function StatsCard({ output }: { output: ToolOutput<"getStats"> }) {
  const tiles = [
    [output.totals.games, m.ai_card_stat_games()],
    [output.totals.completed, m.ai_card_stat_completed()],
    [Math.round(output.totals.hoursPlayed).toLocaleString(), m.ai_card_stat_hours()],
    [score(output.totals.averageRating), m.ai_card_stat_rating()],
  ] as const;
  return (
    <div className={card}>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map(([value, label]) => (
          <div key={label} className="grid gap-0.5 rounded-xl bg-white/4 px-2 py-2.5 text-center">
            <span className="font-display text-lg font-semibold">{value}</span>
            <span className="text-foreground/60 text-[11px]">{label}</span>
          </div>
        ))}
      </div>
      {output.mostPlayed.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-foreground/60 text-[11px] font-bold tracking-[0.16em]">
            {m.ai_card_stat_most_played()}
          </span>
          {output.mostPlayed.map((game, index) => {
            const max = output.mostPlayed[0]?.hours || 1;
            return (
              <div
                key={game.name}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[13px]"
              >
                <span className="relative truncate py-1 pl-2 font-semibold">
                  <span
                    className="absolute inset-y-0 left-0 -z-0 rounded-md bg-white/8"
                    style={{
                      width: `${Math.max(8, (game.hours / max) * 100)}%`,
                      opacity: 1 - index * 0.12,
                    }}
                  />
                  <span className="relative">{game.name}</span>
                </span>
                <span className="text-foreground/75 text-xs">{hours(game.hours)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GameCard({ output }: { output: ToolOutput<"getGame"> }) {
  return (
    <div className={card}>
      <div className="flex gap-3">
        <GameCover
          url={output.coverUrl}
          name={output.name}
          color={output.accentColor}
          className="w-16 shrink-0 rounded-lg"
        />
        <div className="grid min-w-0 content-start gap-1">
          <Link
            to="/g/$slug"
            params={{ slug: output.slug }}
            className="truncate text-[15px] font-bold hover:underline"
          >
            {output.name}
          </Link>
          <span className="text-foreground/65 text-xs">
            {[output.releaseYear, ...output.genres.slice(0, 2)].filter(Boolean).join(" · ")}
          </span>
          {output.timeToBeatHours.main !== null && (
            <span className="text-foreground/75 text-xs">
              {m.ai_card_game_ttb({
                hours: hours(output.timeToBeatHours.mainPlusExtras ?? output.timeToBeatHours.main),
              })}
            </span>
          )}
          {output.community.players > 0 && (
            <span className="text-foreground/75 text-xs">
              {m.ai_card_game_community({
                rating: score(output.community.averageRating),
                count: output.community.players,
              })}
            </span>
          )}
          {output.currentUser && (
            <Link
              to="/e/$id"
              params={{ id: output.currentUser.entryId }}
              className="text-xs font-bold hover:underline"
            >
              {m.ai_card_game_yours({ status: statusLabel(output.currentUser.status) })}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function AchievementsCard({ output }: { output: ToolOutput<"getAchievements"> }) {
  const percent = output.total ? Math.round((output.unlocked / output.total) * 100) : 0;
  const shown = output.remaining.slice(0, 5);
  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <span className="relative flex size-11 shrink-0 items-center justify-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="rgb(255 255 255 / 10%)"
              strokeWidth="4"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(percent / 100) * 94.2} 94.2`}
            />
          </svg>
          <TrophyIcon className="size-4" />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm font-bold">
            {m.ai_card_achievements_title({ game: output.game?.name ?? "" })}
          </span>
          <span className="font-display text-sm">
            {output.unlocked} / {output.total}
          </span>
        </span>
      </div>
      {output.remaining.length === 0 ? (
        <p className="text-foreground/70 text-sm">{m.ai_card_achievements_done()}</p>
      ) : (
        <ul className="grid gap-1.5">
          {shown.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 rounded-xl bg-white/4 p-2">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt=""
                  className="size-8 shrink-0 rounded-md opacity-80"
                  loading="lazy"
                />
              ) : (
                <span className="size-8 shrink-0 rounded-md bg-white/8" />
              )}
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-[13px] font-bold">
                  {item.name ?? m.ai_card_achievements_hidden()}
                </span>
                {item.description && (
                  <span className="text-foreground/65 line-clamp-2 text-xs">
                    {item.description}
                  </span>
                )}
              </span>
              {item.rarityPercent !== null && (
                <span className="text-foreground/60 shrink-0 text-[11px]">
                  {m.ai_card_achievements_rarity({ value: item.rarityPercent.toLocaleString() })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {output.remaining.length > shown.length && (
        <Link
          to="/e/$id"
          params={{ id: output.entryId }}
          className="text-foreground/70 w-fit text-xs font-semibold hover:underline"
        >
          {m.ai_card_achievements_more({ count: output.remaining.length - shown.length })}
        </Link>
      )}
    </div>
  );
}

export function PlayHistoryCard({ output }: { output: ToolOutput<"getPlayHistory"> }) {
  const max = Math.max(1, ...output.weeks.map((week) => week.hours));
  return (
    <div className={card}>
      <span className="text-sm font-bold">
        {output.game ? `${output.game} · ` : ""}
        {m.ai_card_history_total({ days: output.days, hours: hours(output.totalHours) })}
      </span>
      {output.weeks.length === 0 ? (
        <p className="text-foreground/65 text-sm">{m.ai_card_history_empty()}</p>
      ) : (
        <div
          className="flex h-20 items-end gap-1.5"
          role="img"
          aria-label={m.ai_card_history_total({
            days: output.days,
            hours: hours(output.totalHours),
          })}
        >
          {output.weeks.map((week, index) => (
            <span
              key={week.weekStart}
              className="grid flex-1 content-end gap-1 text-center"
              title={`${formatDate(week.weekStart)}: ${hours(week.hours)}`}
            >
              <span
                className="block rounded-md"
                style={{
                  height: `${Math.max(6, (week.hours / max) * 64)}px`,
                  backgroundColor:
                    index === output.weeks.length - 1
                      ? "var(--foreground)"
                      : "rgb(126 167 230 / 55%)",
                }}
              />
            </span>
          ))}
        </div>
      )}
      {output.recentSessions.length > 0 && (
        <ul className="text-foreground/75 grid gap-1 text-xs">
          {output.recentSessions.slice(0, 3).map((session) => (
            <li key={session.startedAt} className="flex justify-between gap-2">
              <span className="truncate">
                {output.game ? <RelativeTime value={session.startedAt} /> : session.game}
              </span>
              <span className="shrink-0">{formatPlaytime(session.minutes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BacklogCard({
  output,
  onOpenDeck,
}: {
  output: ToolOutput<"suggestFromBacklog">;
  onOpenDeck: () => void;
}) {
  return (
    <div className={card}>
      <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {output.slice(0, 8).map((game) => (
          <Link
            key={game.entryId}
            to="/e/$id"
            params={{ id: game.entryId }}
            className="grid w-20 shrink-0 content-start gap-1.5"
          >
            <GameCover
              url={game.coverUrl}
              name={game.name}
              color={game.accentColor}
              className="rounded-[10px]"
            />
            <span className="truncate text-xs font-bold">{game.name}</span>
            {game.hoursToBeat !== null && (
              <span className="text-foreground/60 text-[11px]">
                {m.ai_pick_ttb({ hours: hours(game.hoursToBeat) })}
              </span>
            )}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={onOpenDeck}
        className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white/6 text-sm font-bold transition-colors hover:bg-white/10"
      >
        <ShuffleIcon className="size-4" />
        {m.ai_card_backlog_open_deck()}
      </button>
    </div>
  );
}

export function InboxCard({ output }: { output: ToolOutput<"listInbox"> }) {
  return (
    <div className={card}>
      <span className="flex items-center gap-2 text-sm font-bold">
        <InboxIcon className="size-4" />
        {output.count ? m.ai_card_inbox_title({ count: output.count }) : m.ai_card_inbox_empty()}
      </span>
      {output.items.slice(0, 3).map((item) => (
        <div key={item.id} className="flex items-center gap-2.5 text-[13px]">
          {item.game ? (
            <GameCover
              url={item.game.coverUrl}
              name={item.game.name}
              color={item.game.accentColor}
              className="w-6 shrink-0 rounded"
            />
          ) : (
            <span className="h-9 w-6 shrink-0 rounded bg-white/8" />
          )}
          <span className="truncate font-semibold">{item.game?.name ?? item.kind}</span>
          <span className="text-foreground/55 ml-auto shrink-0 text-xs">{item.source}</span>
        </div>
      ))}
      {output.count > 0 && (
        <Link
          to="/inbox"
          className="flex w-fit items-center gap-1.5 text-xs font-bold hover:underline"
        >
          {m.ai_card_inbox_open()}
          <ArrowRightIcon className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

export function PlayersCard({ output }: { output: ToolOutput<"listPlayers"> }) {
  return (
    <div className={`${card} grid-cols-2 sm:grid-cols-3`}>
      {output.map((player) =>
        player.username ? (
          <Link
            key={player.username}
            to="/u/$username"
            params={{ username: player.username }}
            className="flex min-w-0 items-center gap-2 rounded-xl p-1.5 hover:bg-white/5"
          >
            <Avatar className="size-8">
              <AvatarFallback>{player.name.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="grid min-w-0">
              <span className="truncate text-[13px] font-bold">{player.name}</span>
              <span className="text-foreground/60 text-[11px]">
                {m.ai_mention_person_sub({ count: player.games })}
              </span>
            </span>
          </Link>
        ) : null,
      )}
    </div>
  );
}

export function CatalogCard({ output }: { output: ToolOutput<"searchCatalog"> }) {
  return (
    <div className={`${card} gap-2`}>
      {output.map((game) => (
        <div
          key={`${game.igdbId ?? game.gameId}`}
          className="flex items-center gap-2.5 text-[13px]"
        >
          <GameCover url={game.coverUrl} name={game.name} className="w-7 shrink-0 rounded" />
          <span className="truncate font-semibold">{game.name}</span>
          {game.releaseYear && (
            <span className="text-foreground/55 shrink-0 text-xs">{game.releaseYear}</span>
          )}
        </div>
      ))}
    </div>
  );
}
