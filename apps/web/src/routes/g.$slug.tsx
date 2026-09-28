import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useAddGame } from "@/components/add-game";
import { Feed } from "@/components/feed";
import { GameCover } from "@/components/game-cover";
import { GameLogo } from "@/components/game-logo";
import { ScreenshotGrid } from "@/components/screenshots";
import { Stage } from "@/components/stage";
import { StatusBadge } from "@/components/status-badge";
import { RelativeTime } from "@/components/time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { orNotFound } from "@/lib/api";
import { formatPlaytime, formatRating, statusLabel } from "@/lib/format";
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
  const [logoFailed, setLogoFailed] = useState(false);
  const failLogo = useCallback(() => setLogoFailed(true), []);

  const timeToBeat = [
    [m.ttb_hastily(), hours(game.timeToBeatHastily)],
    [m.ttb_normally(), hours(game.timeToBeatNormally)],
    [m.ttb_completely(), hours(game.timeToBeatCompletely)],
  ].filter(([, value]) => value) as Array<[string, string]>;

  return (
    <div className="grid gap-10">
      <Stage
        items={[
          { key: game.id, hero: game.heroUrl, cover: game.coverUrl, color: game.accentColor },
        ]}
      />
      <section className="grid items-end gap-8 pt-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:pt-40">
        <div className="animate-rise flex items-end gap-6">
          <GameCover
            url={game.coverUrl}
            name={game.name}
            color={game.accentColor}
            className="w-28 shrink-0 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] sm:w-40"
          />
          <div className="grid min-w-0 gap-4">
            {game.logoUrl && !logoFailed ? (
              <h1 className="m-0 flex h-24 items-end sm:h-28">
                <GameLogo
                  src={game.logoUrl}
                  alt={game.name}
                  onFail={failLogo}
                  className="max-h-full max-w-full object-contain object-left-bottom"
                />
              </h1>
            ) : (
              <h1 className="font-display m-0 text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
                {game.name}
              </h1>
            )}
            <div className="flex flex-wrap gap-2">
              {[...(terms.developer ?? []).slice(0, 1), ...(terms.genre ?? []).slice(0, 2)].map(
                (term) => (
                  <span
                    key={term.slug}
                    className="glass flex h-[34px] items-center rounded-full border border-white/12 px-3.5 text-sm font-semibold"
                  >
                    {term.name}
                  </span>
                ),
              )}
              {game.releaseDate && (
                <span className="glass flex h-[34px] items-center rounded-full border border-white/12 px-3.5 text-sm font-semibold">
                  {game.releaseDate.slice(0, 4)}
                </span>
              )}
            </div>
          </div>
        </div>

        <aside
          className="glass animate-rise grid gap-5 rounded-[26px] border border-white/12 p-6"
          style={{ animationDelay: "120ms" }}
        >
          <span className="text-foreground/70 text-xs font-bold tracking-[0.16em]">
            {m.game_community_rating().toLocaleUpperCase()}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-7xl leading-none font-semibold tracking-tight">
              {formatRating(stats?.averageRating) ?? m.unknown()}
            </span>
            {stats && stats.players > 0 && (
              <span className="text-foreground/60 text-sm">
                {m.salon_votes({ count: stats.players })}
              </span>
            )}
          </div>
          {stats && stats.players > 0 && (
            <dl className="grid grid-cols-3 gap-3 border-y border-white/10 py-4">
              <div className="grid gap-0.5">
                <dt className="text-foreground/60 text-xs">{m.game_players()}</dt>
                <dd className="text-[15px] font-bold">{stats.players}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-foreground/60 text-xs">{m.game_completions()}</dt>
                <dd className="text-[15px] font-bold">{stats.completed}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-foreground/60 text-xs">{m.game_community_playtime()}</dt>
                <dd className="text-[15px] font-bold">{formatPlaytime(stats.totalPlaytimeMin)}</dd>
              </div>
            </dl>
          )}
          {user &&
            (mine.data?.entry ? (
              <Button asChild>
                <Link to="/e/$id" params={{ id: mine.data.entry.id }}>
                  {m.game_my_entry()}: {statusLabel(mine.data.entry.status)}
                </Link>
              </Button>
            ) : (
              <Button
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
        </aside>
      </section>

      {(game.summary || Object.keys(terms).length > 0 || timeToBeat.length > 0) && (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          {game.summary ? (
            <p className="text-foreground/90 max-w-3xl text-lg leading-relaxed">{game.summary}</p>
          ) : (
            <span />
          )}
          <dl className="bg-card grid content-start gap-4 rounded-[22px] border p-5">
            {Object.entries(terms).map(([kind, items]) =>
              termLabels[kind] ? (
                <div key={kind}>
                  <dt className="text-muted-foreground text-xs">{termLabels[kind]()}</dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1.5">
                    {items.map((item) => (
                      <Badge key={item.slug} variant="outline" className="rounded-full">
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
                <dd className="mt-1.5 flex flex-wrap gap-3 text-sm">
                  {timeToBeat.map(([label, value]) => (
                    <span key={label}>
                      {label}: <strong>{value}</strong>
                    </span>
                  ))}
                </dd>
              </div>
            )}
            {game.igdbId && <p className="text-muted-foreground text-xs">{m.igdb_attribution()}</p>}
          </dl>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="text-lg font-bold">{m.game_reviews()}</h2>
        {reviews.length === 0 ? (
          <p className="text-muted-foreground text-sm">{m.game_no_reviews()}</p>
        ) : (
          <div className="grid gap-4">
            {reviews.map((review) => (
              <article
                key={review.entryId}
                className="bg-card grid gap-3 rounded-[22px] border p-5"
              >
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
        <h2 className="text-lg font-bold">{m.home_feed_title()}</h2>
        <Feed scope={{ kind: "game", slug }} />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-bold">{m.game_screenshots()}</h2>
        <ScreenshotGrid
          screenshots={screenshots.data?.screenshots ?? []}
          showAuthor
          canDelete={(screenshot) => screenshot.userId === user?.id || user?.role === "admin"}
        />
      </section>
    </div>
  );
}
