import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useAddGame } from "@/components/add-game";
import { Feed } from "@/components/feed";
import { GameCover } from "@/components/game-cover";
import { ScreenshotGrid } from "@/components/screenshots";
import { StatusBadge } from "@/components/status-badge";
import { RelativeTime } from "@/components/time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { orNotFound } from "@/lib/api";
import { formatDate, formatPlaytime, formatRating } from "@/lib/format";
import { gameQuery, gameScreenshotsQuery, myEntryQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/g/$slug")({
  loader: async ({ context, params }) => {
    const data = await orNotFound(context.queryClient.ensureQueryData(gameQuery(params.slug)));
    void context.queryClient.prefetchQuery(gameScreenshotsQuery(params.slug));
    return data;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.game.name} · ${m.app_name()}` },
          ...(loaderData.game.summary
            ? [{ name: "description", content: loaderData.game.summary.slice(0, 200) }]
            : []),
          { property: "og:title", content: loaderData.game.name },
          ...(loaderData.game.coverUrl
            ? [{ property: "og:image", content: loaderData.game.coverUrl }]
            : []),
        ]
      : [],
  }),
  component: GamePage,
});

const termLabels: Record<string, () => string> = {
  developer: m.game_developer,
  publisher: m.game_publisher,
  genre: m.game_genre,
  theme: m.game_theme,
  game_mode: m.game_game_mode,
  player_perspective: m.game_player_perspective,
};

function hours(seconds: number | null) {
  return seconds ? formatPlaytime(Math.round(seconds / 60)) : null;
}

function GamePage() {
  const { slug } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(gameQuery(slug));
  const { game, terms, stats, reviews } = data;
  const screenshots = useQuery(gameScreenshotsQuery(slug));
  const mine = useQuery({ ...myEntryQuery(game.id), enabled: !!user });
  const addGame = useAddGame();

  const timeToBeat = [
    [m.ttb_hastily(), hours(game.timeToBeatHastily)],
    [m.ttb_normally(), hours(game.timeToBeatNormally)],
    [m.ttb_completely(), hours(game.timeToBeatCompletely)],
  ].filter(([, value]) => value) as Array<[string, string]>;

  return (
    <div className="grid gap-8">
      <section className="grid gap-6 sm:grid-cols-[220px_1fr]">
        <GameCover url={game.coverUrl} name={game.name} className="w-44 sm:w-full" />
        <div className="grid content-start gap-4">
          <div>
            <h1 className="text-3xl font-bold">{game.name}</h1>
            {game.releaseDate && (
              <div className="text-muted-foreground text-sm">
                {m.game_release()}: {formatDate(game.releaseDate, "long")}
              </div>
            )}
          </div>

          {user &&
            (mine.data?.entry ? (
              <Button asChild variant="outline" className="w-fit">
                <Link to="/e/$id" params={{ id: mine.data.entry.id }}>
                  {m.game_my_entry()}: <StatusBadge status={mine.data.entry.status} />
                </Link>
              </Button>
            ) : (
              <Button
                className="w-fit"
                onClick={() =>
                  addGame.open({
                    kind: "game",
                    gameId: game.id,
                    name: game.name,
                    coverUrl: game.coverUrl,
                    releaseYear: game.releaseDate ? Number(game.releaseDate.slice(0, 4)) : null,
                  })
                }
              >
                <PlusIcon />
                {m.action_add_to_library()}
              </Button>
            ))}

          {stats && stats.players > 0 && (
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <div className="text-lg font-semibold">{stats.players}</div>
                <div className="text-muted-foreground text-xs">{m.game_players()}</div>
              </div>
              <div>
                <div className="text-lg font-semibold">{stats.completed}</div>
                <div className="text-muted-foreground text-xs">{m.game_completions()}</div>
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {formatRating(stats.averageRating) ?? m.unknown()}
                </div>
                <div className="text-muted-foreground text-xs">{m.game_community_rating()}</div>
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {formatPlaytime(stats.totalPlaytimeMin)}
                </div>
                <div className="text-muted-foreground text-xs">{m.game_community_playtime()}</div>
              </div>
            </div>
          )}

          {game.summary && <p className="max-w-3xl leading-relaxed">{game.summary}</p>}

          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(terms).map(([kind, items]) =>
              termLabels[kind] ? (
                <div key={kind}>
                  <dt className="text-muted-foreground text-xs">{termLabels[kind]()}</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {items.map((item) => (
                      <Badge key={item.slug} variant="outline">
                        {item.name}
                      </Badge>
                    ))}
                  </dd>
                </div>
              ) : null,
            )}
            {timeToBeat.length > 0 && (
              <div>
                <dt className="text-muted-foreground text-xs">{m.game_time_to_beat()}</dt>
                <dd className="mt-1 flex flex-wrap gap-3 text-sm">
                  {timeToBeat.map(([label, value]) => (
                    <span key={label}>
                      {label}: <strong>{value}</strong>
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          {game.igdbId && <p className="text-muted-foreground text-xs">{m.igdb_attribution()}</p>}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">{m.game_reviews()}</h2>
        {reviews.length === 0 ? (
          <p className="text-muted-foreground text-sm">{m.game_no_reviews()}</p>
        ) : (
          <div className="grid gap-4">
            {reviews.map((review) => (
              <article key={review.entryId} className="grid gap-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Avatar className="size-6">
                    {review.user.image && <AvatarImage src={review.user.image} alt="" />}
                    <AvatarFallback>{review.user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <Link
                    to="/u/$username"
                    params={{ username: review.user.username ?? "" }}
                    className="font-medium hover:underline"
                  >
                    {review.user.name}
                  </Link>
                  <StatusBadge status={review.status} />
                  {review.rating !== null && <strong>{formatRating(review.rating)}</strong>}
                  <Link
                    to="/e/$id"
                    params={{ id: review.entryId }}
                    className="text-muted-foreground ml-auto text-xs hover:underline"
                  >
                    <RelativeTime value={review.updatedAt} />
                  </Link>
                </div>
                <p className="leading-relaxed whitespace-pre-line">{review.review}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid max-w-2xl gap-3">
        <h2 className="text-lg font-semibold">{m.home_feed_title()}</h2>
        <Feed scope={{ kind: "game", slug }} />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">{m.game_screenshots()}</h2>
        <ScreenshotGrid
          screenshots={screenshots.data?.screenshots ?? []}
          showAuthor
          canDelete={(screenshot) => screenshot.userId === user?.id || user?.role === "admin"}
        />
      </section>
    </div>
  );
}
