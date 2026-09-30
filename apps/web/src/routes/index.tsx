import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { useAddGame } from "@/components/add-game";
import { Feed, NowPlaying } from "@/components/feed";
import { GameCover } from "@/components/game-cover";
import { GameLogo } from "@/components/game-logo";
import { RollingText } from "@/components/motion";
import { Stage } from "@/components/stage";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatPlaytime,
  formatRating,
  formatRelative,
  statusLabel,
} from "@/lib/format";
import { useHydrated } from "@/lib/hydrated";
import {
  feedQuery,
  type LibraryItem,
  libraryQuery,
  nowPlayingQuery,
  proposalCountQuery,
} from "@/lib/queries";
import type { CurrentUser } from "@/lib/session";
import { m } from "@/paraglide/messages";

const usernameOf = (user: CurrentUser) => user.displayUsername ?? user.username ?? null;
const shelfFilters = { sort: "last_played" } as const;

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const username = context.user ? usernameOf(context.user) : null;
    await Promise.all([
      context.queryClient.prefetchInfiniteQuery(feedQuery({ kind: "global" })),
      context.queryClient.prefetchQuery(nowPlayingQuery),
      username
        ? context.queryClient.prefetchQuery(libraryQuery(username, shelfFilters))
        : Promise.resolve(),
    ]);
  },
  component: HomePage,
});

function HomePage() {
  const { user } = Route.useRouteContext();
  const username = user ? usernameOf(user) : null;
  return username ? <SignedInHome username={username} /> : <Landing />;
}

/** Sahnede gösterilecek oyunlar: önce oynananlar, sonra en son dokunulanlar (en fazla 8). */
function pickShelf(items: LibraryItem[]) {
  const playing = items.filter((item) => item.status === "playing");
  const rest = items.filter(
    (item) => item.status !== "playing" && item.status !== "wishlist" && item.status !== "backlog",
  );
  return [...playing, ...rest].slice(0, 8);
}

function SignedInHome({ username }: { username: string }) {
  const library = useQuery(libraryQuery(username, shelfFilters));
  const items = library.data?.items ?? [];
  const shelf = pickShelf(items);
  const backlog = items.filter((item) => item.status === "backlog").slice(0, 3);
  const total = Object.values(library.data?.statusCounts ?? {}).reduce(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const [active, setActive] = useState(0);
  const index = shelf.length ? Math.min(active, shelf.length - 1) : 0;
  const current = shelf[index];
  const go = (next: number) => setActive((next + shelf.length) % shelf.length);

  return (
    <div className="grid gap-12">
      <Stage
        items={shelf.map((item) => ({
          key: item.id,
          hero: item.game.heroUrl,
          cover: item.game.coverUrl,
          color: item.game.accentColor,
        }))}
        active={index}
      />

      <section className="grid min-h-[480px] items-start gap-8 pt-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:pt-14">
        {current ? <Spotlight key={current.id} item={current} /> : <EmptyStage />}
        <NowPlaying className="hidden lg:grid" />
      </section>

      {shelf.length > 1 && (
        <section aria-label={m.salon_shelf()} className="-mt-4 grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <h2 className="text-[15px] font-bold">{m.salon_shelf()}</h2>
              <Link
                to="/u/$username/library"
                params={{ username }}
                className="text-foreground/70 hover:text-foreground text-sm"
              >
                {m.salon_all_games({ count: total })}
              </Link>
            </div>
            <div className="flex gap-2">
              <Button
                variant="glass"
                size="icon-lg"
                aria-label={m.salon_prev()}
                onClick={() => go(index - 1)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="glass"
                size="icon-lg"
                aria-label={m.salon_next()}
                onClick={() => go(index + 1)}
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
          <div className="-mx-4 flex items-end gap-3.5 overflow-x-auto px-4 pt-2 pb-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {shelf.map((item, i) => {
              const on = i === index;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.game.name}
                  aria-current={on}
                  onClick={() => setActive(i)}
                  className="shrink-0 rounded-xl transition-[width,transform] duration-500 ease-(--ease-salon) hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4"
                  style={{ width: on ? 170 : 128 }}
                >
                  <GameCover
                    url={item.game.coverUrl}
                    name={item.game.name}
                    color={item.game.accentColor}
                    className="transition-shadow duration-500"
                    transitionName={on ? `cover-${item.id}` : undefined}
                  />
                  <span
                    className="mt-0 block h-1 rounded-full transition-opacity duration-500"
                    style={{
                      opacity: on ? 1 : 0,
                      backgroundColor: item.game.accentColor ?? "#f4f5f7",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-4">
          <h2 className="font-display text-2xl font-medium">{m.home_feed_title()}</h2>
          <Feed scope={{ kind: "global" }} />
        </section>
        <aside className="grid gap-4 lg:pt-12">
          <NowPlaying className="lg:hidden" />
          <InboxCard />
          {backlog.length > 0 && (
            <section className="bg-card grid gap-3.5 rounded-[22px] border p-[18px]">
              <h2 className="text-[15px] font-bold">{m.salon_backlog()}</h2>
              <div className="grid grid-cols-3 gap-2">
                {backlog.map((item) => (
                  <Link key={item.id} to="/e/$id" params={{ id: item.id }} title={item.game.name}>
                    <GameCover
                      url={item.game.coverUrl}
                      name={item.game.name}
                      color={item.game.accentColor}
                    />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Sahnenin önündeki oyun: logo (yoksa ad), durum, süre, puan ve incelemeden bir cümle. */
function Spotlight({ item }: { item: LibraryItem }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const failLogo = useCallback(() => setLogoFailed(true), []);
  const game = item.game;
  const playing = item.status === "playing";
  // "3 gün önce" saate bağlı; ilk karede (sunucu + hydration) yazılmaz ki metinler uyuşsun.
  const hydrated = useHydrated();
  const when =
    item.lastPlayedAt && hydrated
      ? m.salon_last_played({ time: formatRelative(item.lastPlayedAt) })
      : !item.lastPlayedAt && item.finishedAt
        ? formatDate(item.finishedAt, "long")
        : null;
  const rating = formatRating(item.rating);

  return (
    <div className="animate-rise grid max-w-2xl content-start gap-5">
      <span className="text-foreground/75 text-[13px] font-bold tracking-[0.18em]">
        {playing ? m.salon_continue() : m.salon_from_shelf()}
      </span>
      {game.logoUrl && !logoFailed ? (
        <h1 className="m-0 flex h-28 items-end sm:h-32">
          <GameLogo
            src={game.logoUrl}
            alt={game.name}
            onFail={failLogo}
            className="max-h-full max-w-[min(520px,90%)] object-contain object-left-bottom"
          />
        </h1>
      ) : (
        <h1 className="font-display m-0 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
          {game.name}
        </h1>
      )}
      <div className="flex flex-wrap gap-2">
        <Chip>
          <span
            className={`size-2 rounded-full ${playing ? "bg-live" : "bg-foreground"}`}
            aria-hidden
          />
          {statusLabel(item.status)}
        </Chip>
        {item.playtimeMin > 0 && (
          <Chip>
            <RollingText value={formatPlaytime(item.playtimeMin)} />
          </Chip>
        )}
        {when && <Chip>{when}</Chip>}
        {rating && <Chip>{m.salon_your_rating({ rating })}</Chip>}
      </div>
      {item.review && (
        <p className="text-foreground/85 line-clamp-3 max-w-xl text-lg leading-relaxed">
          “{item.review}”
        </p>
      )}
      <div className="mt-1 flex flex-wrap gap-2.5">
        <Button asChild size="lg">
          <Link to="/e/$id" params={{ id: item.id }}>
            {m.salon_open_entry()}
            <ArrowRightIcon />
          </Link>
        </Button>
        <Button asChild size="lg" variant="glass">
          <Link to="/g/$slug" params={{ slug: game.slug }}>
            {m.salon_game_page()}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="glass flex h-[34px] items-center gap-2 rounded-full border border-white/12 px-3.5 text-sm font-semibold">
      {children}
    </span>
  );
}

function EmptyStage() {
  const addGame = useAddGame();
  return (
    <div className="animate-rise grid max-w-xl content-start gap-5">
      <h1 className="font-display m-0 text-4xl font-semibold tracking-tight sm:text-5xl">
        {m.salon_empty_title()}
      </h1>
      <p className="text-foreground/80 text-lg">{m.salon_empty_body()}</p>
      <div className="flex gap-2.5">
        <Button size="lg" onClick={() => addGame.open()}>
          <PlusIcon />
          {m.action_add_game()}
        </Button>
        <Button asChild size="lg" variant="glass">
          <Link to="/settings">{m.nav_settings()}</Link>
        </Button>
      </div>
    </div>
  );
}

function InboxCard() {
  const { data } = useQuery(proposalCountQuery);
  const count = data?.count ?? 0;
  return (
    <section className="bg-card grid gap-3.5 rounded-[22px] border p-[18px]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold">{m.salon_inbox_title()}</h2>
        {count > 0 && <span className="font-display text-2xl font-medium">{count}</span>}
      </div>
      <p className="text-foreground/75 text-sm">
        {count > 0 ? m.salon_inbox_pending({ count }) : m.salon_inbox_empty()}
      </p>
      {count > 0 && (
        <Button asChild>
          <Link to="/inbox">{m.salon_inbox_open()}</Link>
        </Button>
      )}
    </section>
  );
}

function Landing() {
  // Ziyaretçiye sahnede topluluğun son oynadığı oyunlardan biri gösterilir.
  const feed = useInfiniteQuery(feedQuery({ kind: "global" }));
  const featured = feed.data?.pages[0]?.items.find((item) => item.game?.heroUrl)?.game;
  return (
    <div className="grid gap-12">
      <Stage
        items={
          featured
            ? [
                {
                  key: featured.id,
                  hero: featured.heroUrl,
                  cover: featured.coverUrl,
                  color: featured.accentColor,
                },
              ]
            : []
        }
      />
      <section className="grid items-start gap-8 pt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:pt-20">
        <div className="animate-rise grid max-w-2xl gap-5">
          <h1 className="font-display m-0 text-5xl leading-[1.02] font-semibold tracking-tight sm:text-7xl">
            {m.home_title()}
          </h1>
          <p className="text-foreground/80 text-lg sm:text-xl">{m.home_subtitle()}</p>
          <div className="flex gap-2.5">
            <Button asChild size="lg">
              <Link to="/register">{m.nav_sign_up()}</Link>
            </Button>
            <Button asChild size="lg" variant="glass">
              <Link to="/login">{m.nav_sign_in()}</Link>
            </Button>
          </div>
        </div>
        <NowPlaying />
      </section>
      <section className="grid max-w-3xl gap-4">
        <h2 className="font-display text-2xl font-medium">{m.home_feed_title()}</h2>
        <Feed scope={{ kind: "global" }} />
      </section>
    </div>
  );
}
