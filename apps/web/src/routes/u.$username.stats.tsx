import type { EntryStatus, Platform, Store } from "@my-games/shared";
import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarRangeIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import {
  BarList,
  ChartCard,
  ColumnChart,
  Heatmap,
  type HeatmapDay,
  StatTile,
} from "@/components/charts";
import { GameCover } from "@/components/game-cover";
import { PlayHistoryDeck } from "@/components/play-history-deck";
import { Button } from "@/components/ui/button";
import { formatPlaytime, formatRating, platformLabel, statusLabel, storeLabel } from "@/lib/format";
import { estimateQuestionsQuery, heatmapQuery, userStatsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/u/$username/stats")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(userStatsQuery(params.username)),
  component: UserStatsPage,
});

function UserStatsPage() {
  const { username } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(userStatsQuery(username));
  const { totals } = data;
  const me = user?.displayUsername ?? user?.username;
  const byCount = (
    items: Array<{ key: string; count: number; playtimeMin: number }>,
    label: (key: string) => string,
  ) =>
    items.map((item) => ({
      label: label(item.key),
      value: item.count,
      detail: formatPlaytime(item.playtimeMin),
    }));
  const byTerm = (items: Array<{ key: string; count: number; playtimeMin: number }>) =>
    items.map((item) => ({
      label: item.key,
      value: item.count,
      detail: formatPlaytime(item.playtimeMin),
    }));

  if (totals.games === 0)
    return <p className="text-muted-foreground py-12 text-center">{m.stats_empty()}</p>;

  const currentYear = new Date().getFullYear();
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/u/$username/wrapped/$year" params={{ username, year: String(currentYear) }}>
            <CalendarRangeIcon />
            {m.stats_wrapped()}
          </Link>
        </Button>
        {me && me.toLowerCase() !== username.toLowerCase() && (
          <Button asChild variant="outline" size="sm">
            <Link to="/compare" search={{ a: me, b: username }}>
              <UsersIcon />
              {m.stats_compare()}
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label={m.stats_games()} value={totals.games} />
        <StatTile label={m.stats_completed()} value={totals.completed} />
        <StatTile label={m.stats_playtime()} value={formatPlaytime(totals.playtimeMin)} />
        <StatTile
          label={m.stats_average()}
          value={formatRating(totals.averageRating) ?? m.unknown()}
        />
        <StatTile label={m.stats_reviews()} value={totals.reviews} />
        <StatTile label={m.stats_perfect()} value={totals.perfect} />
      </div>

      {(data.heatmap.length > 0 || data.heatmapYears.length > 0) && (
        <ActivityCard
          username={username}
          recent={data.heatmap}
          years={data.heatmapYears}
          isOwner={!!me && me.toLowerCase() === username.toLowerCase()}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title={m.stats_by_status()}>
          <BarList items={byCount(data.status, (key) => statusLabel(key as EntryStatus))} />
        </ChartCard>
        <ChartCard title={m.stats_top_played()}>
          <ul className="grid gap-2">
            {data.topPlayed.map((game) => (
              <li key={game.entryId}>
                <Link
                  to="/e/$id"
                  params={{ id: game.entryId }}
                  className="flex items-center gap-3 text-sm hover:underline"
                >
                  <GameCover url={game.coverUrl} name={game.name} className="w-7 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{game.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatPlaytime(game.playtimeMin)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </ChartCard>
        {data.terms.genres.length > 0 && (
          <ChartCard title={m.stats_genres()}>
            <BarList items={byTerm(data.terms.genres)} />
          </ChartCard>
        )}
        {data.terms.developers.length > 0 && (
          <ChartCard title={m.stats_developers()}>
            <BarList items={byTerm(data.terms.developers)} />
          </ChartCard>
        )}
        <ChartCard title={m.stats_by_platform()}>
          <BarList
            items={byCount(data.platform, (key) => platformLabel(key as Platform))}
            empty={m.stats_empty()}
          />
        </ChartCard>
        <ChartCard title={m.stats_by_store()}>
          <BarList
            items={byCount(data.store, (key) => storeLabel(key as Store))}
            empty={m.stats_empty()}
          />
        </ChartCard>
        {data.terms.themes.length > 0 && (
          <ChartCard title={m.stats_themes()}>
            <BarList items={byTerm(data.terms.themes)} />
          </ChartCard>
        )}
        {data.terms.publishers.length > 0 && (
          <ChartCard title={m.stats_publishers()}>
            <BarList items={byTerm(data.terms.publishers)} />
          </ChartCard>
        )}
        <ChartCard title={m.stats_ratings()}>
          <ColumnChart
            items={Array.from({ length: 11 }, (_, bucket) => ({
              label: String(bucket),
              value: data.ratings.find((item) => Number(item.key) === bucket)?.count ?? 0,
            }))}
          />
        </ChartCard>
        {data.completions.length > 0 && (
          <ChartCard title={m.stats_completions()}>
            <ColumnChart
              items={data.completions.map((item) => ({ label: item.key, value: item.count }))}
            />
          </ChartCard>
        )}
        {data.releaseYears.length > 0 && (
          <ChartCard title={m.stats_release_years()}>
            <ColumnChart
              items={data.releaseYears.map((item) => ({ label: item.key, value: item.count }))}
            />
          </ChartCard>
        )}
        <ChartCard title={m.stats_backlog()}>
          <p className="text-sm">
            {data.backlog.estimated > 0
              ? m.stats_backlog_estimate({
                  count: data.backlog.count,
                  time: formatPlaytime(data.backlog.timeToBeatMin),
                  estimated: data.backlog.estimated,
                })
              : m.stats_backlog_count({ count: data.backlog.count })}
          </p>
        </ChartCard>
      </div>
    </div>
  );
}

/** Oynama takvimi: son 12 ay ya da seçilen yıl. Takipten önceki tahmini günler işaretli gösterilir. */
function ActivityCard(props: {
  username: string;
  recent: HeatmapDay[];
  years: number[];
  isOwner: boolean;
}) {
  const [refining, setRefining] = useState(false);
  const questions = useQuery({ ...estimateQuestionsQuery, enabled: props.isOwner });
  const pending = questions.data?.total ?? 0;
  // Son 12 ayda hiç veri yoksa (yalnızca eski yıllar tahmin edildiyse) en yakın yıldan başlanır.
  const [year, setYear] = useState<number | null>(
    props.recent.length > 0 ? null : (props.years[0] ?? null),
  );
  const selected = useQuery({
    ...heatmapQuery(props.username, year),
    enabled: year !== null,
    placeholderData: keepPreviousData,
  });
  const days = year === null ? props.recent : (selected.data?.days ?? []);
  const hasEstimates = days.some((day) => (day.estimatedMinutes ?? 0) > 0);
  const chip =
    "text-foreground/75 data-[active=true]:bg-foreground data-[active=true]:text-background rounded-full border px-3 py-0.5 text-xs font-semibold tabular-nums";

  return (
    <ChartCard
      title={m.stats_heatmap()}
      hint={hasEstimates ? m.stats_heatmap_estimated_hint() : m.stats_heatmap_hint()}
    >
      {props.isOwner && pending > 0 && (
        <>
          <Button
            variant="glass"
            size="sm"
            className="justify-self-start"
            onClick={() => setRefining(true)}
          >
            <SparklesIcon />
            {m.play_history_deck_open()}
            <span className="text-muted-foreground tabular-nums">{pending}</span>
          </Button>
          <PlayHistoryDeck open={refining} onOpenChange={setRefining} />
        </>
      )}
      {props.years.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={chip}
            data-active={year === null}
            onClick={() => setYear(null)}
          >
            {m.stats_heatmap_recent()}
          </button>
          {props.years.map((item) => (
            <button
              key={item}
              type="button"
              className={chip}
              data-active={year === item}
              onClick={() => setYear(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      <Heatmap
        days={days}
        year={year}
        format={formatPlaytime}
        lessLabel={m.stats_heatmap_less()}
        moreLabel={m.stats_heatmap_more()}
        estimatedLabel={m.estimated()}
        describe={({ date, minutes, estimatedMinutes }) => {
          const time = formatPlaytime(minutes);
          if (estimatedMinutes === 0) return m.stats_heatmap_cell({ date, time });
          if (estimatedMinutes >= minutes) return m.stats_heatmap_cell_estimated({ date, time });
          return m.stats_heatmap_cell_partly({
            date,
            time,
            estimated: formatPlaytime(estimatedMinutes),
          });
        }}
      />
    </ChartCard>
  );
}
