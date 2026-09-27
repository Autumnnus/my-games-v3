import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarList, ChartCard, ColumnChart, StatTile } from "@/components/charts";
import { GameCover } from "@/components/game-cover";
import { orNotFound } from "@/lib/api";
import { formatPlaytime, formatRating } from "@/lib/format";
import { wrappedQuery, wrappedYearsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

export const Route = createFileRoute("/u/$username/wrapped/$year")({
  loader: ({ context, params }) =>
    orNotFound(
      context.queryClient.ensureQueryData(wrappedQuery(params.username, Number(params.year))),
    ),
  head: ({ params }) => ({
    meta: [{ title: `${m.wrapped_title({ year: params.year })} · ${m.app_name()}` }],
  }),
  component: WrappedPage,
});

function monthName(month: number, style: "long" | "short" = "long") {
  return new Intl.DateTimeFormat(getLocale(), { month: style, timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, month - 1, 1)),
  );
}

function WrappedPage() {
  const { username, year } = Route.useParams();
  const { data } = useSuspenseQuery(wrappedQuery(username, Number(year)));
  const years = useQuery(wrappedYearsQuery(username));
  const empty = data.finishedCount === 0 && data.playedMinutes === 0 && data.addedCount === 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold">{m.wrapped_title({ year })}</h2>
        <div className="flex flex-wrap gap-1">
          {years.data?.years.map((item) => (
            <Link
              key={item}
              to="/u/$username/wrapped/$year"
              params={{ username, year: String(item) }}
              className="text-muted-foreground data-[status=active]:bg-foreground data-[status=active]:text-background rounded-full border px-3 py-0.5 text-sm"
            >
              {item}
            </Link>
          ))}
        </div>
      </div>

      {empty ? (
        <p className="text-muted-foreground py-8">{m.wrapped_empty()}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={m.wrapped_finished()} value={data.finishedCount} />
            <StatTile
              label={m.wrapped_played()}
              value={data.playedMinutes ? formatPlaytime(data.playedMinutes) : m.unknown()}
            />
            <StatTile label={m.wrapped_days()} value={data.playedDays || m.unknown()} />
            <StatTile label={m.wrapped_added()} value={data.addedCount} />
          </div>
          {data.playedMinutes === 0 && (
            <p className="text-muted-foreground text-sm">{m.wrapped_no_sessions()}</p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {data.finished.length > 0 && (
              <ChartCard title={m.wrapped_best()}>
                <ol className="grid gap-2">
                  {data.finished.slice(0, 10).map((game, index) => (
                    <li key={game.entryId}>
                      <Link
                        to="/e/$id"
                        params={{ id: game.entryId }}
                        className="flex items-center gap-3 text-sm hover:underline"
                      >
                        <span className="text-muted-foreground w-4 text-right tabular-nums">
                          {index + 1}
                        </span>
                        <GameCover url={game.coverUrl} name={game.name} className="w-7 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{game.name}</span>
                        <span className="font-semibold tabular-nums">
                          {formatRating(game.rating) ?? m.unknown()}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </ChartCard>
            )}
            {data.topGames.length > 0 && (
              <ChartCard title={m.wrapped_top_games()}>
                <BarList
                  items={data.topGames.map((game) => ({ label: game.name, value: game.minutes }))}
                  format={formatPlaytime}
                />
              </ChartCard>
            )}
            {data.genres.length > 0 && (
              <ChartCard title={m.wrapped_genres()}>
                <BarList
                  items={data.genres.map((genre) => ({ label: genre.key, value: genre.count }))}
                />
              </ChartCard>
            )}
            {data.months.length > 0 && (
              <ChartCard
                title={m.wrapped_months()}
                hint={
                  data.busiestMonth
                    ? m.wrapped_busiest({ month: monthName(data.busiestMonth.month) })
                    : undefined
                }
              >
                <ColumnChart
                  items={Array.from({ length: 12 }, (_, index) => ({
                    label: monthName(index + 1, "short"),
                    value: data.months.find((item) => item.month === index + 1)?.minutes ?? 0,
                  }))}
                  format={formatPlaytime}
                />
              </ChartCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}
