import type { EntryStatus, Platform } from "@my-games/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { BarList, ChartCard, StatTile } from "@/components/charts";
import { GameCover } from "@/components/game-cover";
import { Button } from "@/components/ui/button";
import { formatPlaytime, formatRating, platformLabel, statusLabel } from "@/lib/format";
import { globalStatsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/stats")({
  loader: ({ context }) => context.queryClient.ensureQueryData(globalStatsQuery),
  head: () => ({ meta: [{ title: `${m.stats_title()} · ${m.app_name()}` }] }),
  component: GlobalStatsPage,
});

function GlobalStatsPage() {
  const { data } = useSuspenseQuery(globalStatsQuery);
  const bars = (
    items: Array<{ key: string; count: number; playtimeMin: number }>,
    label: (key: string) => string,
  ) =>
    items.map((item) => ({
      label: label(item.key),
      value: item.count,
      detail: formatPlaytime(item.playtimeMin),
    }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{m.stats_global_title()}</h1>
        <Button asChild variant="outline" size="sm">
          <Link to="/compare">
            <UsersIcon />
            {m.compare_title()}
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={m.stats_users()} value={data.totals.users} />
        <StatTile label={m.stats_games()} value={data.totals.games} />
        <StatTile label={m.stats_completed()} value={data.totals.completed} />
        <StatTile label={m.stats_playtime()} value={formatPlaytime(data.totals.playtimeMin)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title={m.stats_popular()}>
          <ul className="grid gap-2">
            {data.popular.map((game) => (
              <li key={game.slug}>
                <Link
                  to="/g/$slug"
                  params={{ slug: game.slug }}
                  className="flex items-center gap-3 text-sm hover:underline"
                >
                  <GameCover url={game.coverUrl} name={game.name} className="w-7 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{game.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {game.players} · {formatRating(game.averageRating) ?? m.unknown()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </ChartCard>
        <ChartCard title={m.stats_by_status()}>
          <BarList items={bars(data.status, (key) => statusLabel(key as EntryStatus))} />
        </ChartCard>
        <ChartCard title={m.stats_genres()}>
          <BarList items={bars(data.genres, (key) => key)} empty={m.stats_empty()} />
        </ChartCard>
        <ChartCard title={m.stats_by_platform()}>
          <BarList
            items={bars(data.platform, (key) => platformLabel(key as Platform))}
            empty={m.stats_empty()}
          />
        </ChartCard>
        <ChartCard title={m.stats_developers()}>
          <BarList items={bars(data.developers, (key) => key)} empty={m.stats_empty()} />
        </ChartCard>
      </div>
    </div>
  );
}
