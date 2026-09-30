import { type EntryStatus, entryStatuses } from "@my-games/shared";
import { useInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRightIcon, PlusIcon, SparklesIcon, StarIcon } from "lucide-react";
import type { ReactNode } from "react";
import * as z from "zod/mini";
import { useAddGame } from "@/components/add-game";
import { ActivityCard } from "@/components/feed";
import { GameCover } from "@/components/game-cover";
import { ScreenshotGrid } from "@/components/screenshots";
import { Button } from "@/components/ui/button";
import { formatDate, formatPlaytime, formatRating, platformLabel, statusLabel } from "@/lib/format";
import { feedQuery, type LibraryItem, profileOverviewQuery, profileQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

/** Eski kütüphane adresleri (`/u/ad?status=…`, kütüphane eskiden buradaydı) kütüphane sekmesine gider. */
const legacySearch = z.object({
  status: z.optional(z.unknown()),
  q: z.optional(z.unknown()),
  sort: z.optional(z.unknown()),
  view: z.optional(z.unknown()),
  fav: z.optional(z.unknown()),
  list: z.optional(z.unknown()),
});

export const Route = createFileRoute("/u/$username/")({
  validateSearch: legacySearch,
  beforeLoad: ({ search, params }) => {
    if (Object.values(search).some((value) => value !== undefined)) {
      throw redirect({ to: "/u/$username/library", params, search: search as never });
    }
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(profileOverviewQuery(params.username)),
      context.queryClient.prefetchInfiniteQuery(
        feedQuery({ kind: "user", username: params.username }),
      ),
    ]),
  component: ProfileOverview,
});

const statusColor: Record<EntryStatus, string> = {
  playing: "var(--live)",
  completed: "#f4f5f7",
  paused: "#fcd34d",
  backlog: "#7dd3fc",
  wishlist: "#c4b5fd",
  dropped: "var(--destructive)",
  endless: "#e0a94a",
};

function ProfileOverview() {
  const { username } = Route.useParams();
  const { user: viewer } = Route.useRouteContext();
  const { data: profile } = useSuspenseQuery(profileQuery(username));
  const { data } = useSuspenseQuery(profileOverviewQuery(username));
  const feed = useInfiniteQuery(feedQuery({ kind: "user", username }));
  const addGame = useAddGame();
  const isOwner = !!viewer && viewer.id === profile.user.id;
  const total = Object.values(data.statusCounts).reduce((sum, value) => sum + value, 0);
  const activity = feed.data?.pages[0]?.items.slice(0, 4) ?? [];

  if (total === 0) {
    return isOwner ? (
      <div className="grid justify-items-center gap-4 rounded-[26px] border border-dashed border-white/12 px-6 py-16 text-center">
        <span className="glass flex size-14 items-center justify-center rounded-full border border-white/12">
          <PlusIcon className="size-6" />
        </span>
        <div className="grid gap-1.5">
          <h2 className="font-display text-xl font-semibold">{m.library_empty_title()}</h2>
          <p className="text-foreground/70 max-w-md text-[15px]">{m.library_empty_body()}</p>
        </div>
        <Button size="lg" onClick={() => addGame.open()}>
          <PlusIcon />
          {m.action_add_game()}
        </Button>
      </div>
    ) : (
      <p className="text-muted-foreground py-12 text-center">
        {m.overview_empty_visitor({ name: profile.user.name })}
      </p>
    );
  }

  return (
    <div className="grid gap-10">
      {data.nowPlaying.length > 0 && (
        <Section title={m.overview_playing()}>
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {data.nowPlaying.map((item, index) => (
              <PlayingCard key={item.id} item={item} index={index} />
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <YearCard
          username={username}
          year={data.thisYear.year}
          completed={data.thisYear.completed}
          playtimeMin={data.thisYear.playtimeMin}
        />
        <MixCard counts={data.statusCounts} total={total} username={username} />
        {data.platforms.length > 0 && (
          <Panel title={m.overview_platforms()}>
            <div className="flex flex-wrap gap-2">
              {data.platforms.map((row) => (
                <span
                  key={row.platform}
                  className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-sm font-semibold"
                >
                  {platformLabel(row.platform)}
                  <span className="text-foreground/55 font-medium">{row.count}</span>
                </span>
              ))}
            </div>
          </Panel>
        )}
      </div>

      {data.favorites.length > 0 && (
        <Section
          title={m.overview_favorites()}
          action={<SeeAll to="/u/$username/library" params={{ username }} search={{ fav: true }} />}
        >
          <Shelf items={data.favorites} />
        </Section>
      )}

      {(data.recentlyCompleted.length > 0 || data.topRated.length > 0) && (
        <div className="grid items-start gap-10 lg:grid-cols-2">
          {data.recentlyCompleted.length > 0 && (
            <Section
              title={m.overview_recently_completed()}
              action={
                <SeeAll
                  to="/u/$username/library"
                  params={{ username }}
                  search={{ status: "completed", sort: "finished" }}
                />
              }
            >
              <div className="grid gap-1">
                {data.recentlyCompleted.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    detail={
                      item.finishedAt ? formatDate(item.finishedAt, "long") : m.overview_no_date()
                    }
                  />
                ))}
              </div>
            </Section>
          )}
          {data.topRated.length > 0 && (
            <Section
              title={m.overview_top_rated()}
              action={
                <SeeAll
                  to="/u/$username/library"
                  params={{ username }}
                  search={{ sort: "rating" }}
                />
              }
            >
              <div className="grid gap-1">
                {data.topRated.map((item, index) => (
                  <Row
                    key={item.id}
                    item={item}
                    rank={index + 1}
                    detail={statusLabel(item.status)}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {activity.length > 0 && (
        <Section
          title={m.overview_recent_activity()}
          action={<SeeAll to="/u/$username/activity" params={{ username }} />}
        >
          <div className="grid max-w-2xl gap-4">
            {activity.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))}
          </div>
        </Section>
      )}

      {data.screenshots.length > 0 && (
        <Section
          title={m.tab_screenshots()}
          action={<SeeAll to="/u/$username/screenshots" params={{ username }} />}
        >
          <ScreenshotGrid
            screenshots={data.screenshots}
            canDelete={(shot) => shot.userId === viewer?.id || viewer?.role === "admin"}
          />
        </Section>
      )}
    </div>
  );
}

function Section(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-medium">{props.title}</h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

function Panel(props: { title: string; children: ReactNode; className?: string }) {
  return (
    <section
      className={`bg-card/70 grid content-start gap-4 rounded-[22px] border border-white/8 p-5 ${props.className ?? ""}`}
    >
      <h2 className="text-foreground/60 text-xs font-bold tracking-[0.14em] uppercase">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function SeeAll(props: {
  to: "/u/$username/library" | "/u/$username/activity" | "/u/$username/screenshots";
  params: { username: string };
  search?: Record<string, string | boolean>;
}) {
  return (
    <Link
      to={props.to}
      params={props.params}
      search={props.search as never}
      className="text-foreground/65 hover:text-foreground flex items-center gap-1 text-sm font-semibold transition-colors"
    >
      {m.overview_see_all()}
      <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

/** Şu an oynananlar: oyunun geniş görseliyle kart, süre ve son oynama. */
function PlayingCard({ item, index }: { item: LibraryItem; index: number }) {
  const image = item.game.heroUrl ?? item.game.coverUrl;
  return (
    <Link
      to="/e/$id"
      params={{ id: item.id }}
      className="group animate-rise relative flex h-44 w-[300px] shrink-0 snap-start items-end overflow-hidden rounded-[22px] border border-white/10 sm:w-[340px]"
      style={{
        animationDelay: `${index * 60}ms`,
        backgroundColor: item.game.accentColor ?? undefined,
      }}
    >
      {image && (
        <img
          src={image}
          alt=""
          loading="lazy"
          className={`absolute inset-0 size-full object-cover transition-transform duration-700 ease-(--ease-salon) group-hover:scale-105 ${
            item.game.heroUrl ? "" : "scale-125 blur-2xl"
          }`}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="relative grid w-full gap-1 p-4">
        <span className="text-live flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] uppercase">
          <span className="bg-live size-1.5 rounded-full" />
          {statusLabel(item.status)}
        </span>
        <span className="truncate text-lg font-bold">{item.game.name}</span>
        <span className="text-foreground/75 text-[13px]">
          {item.playtimeMin > 0 ? formatPlaytime(item.playtimeMin) : m.unknown()}
        </span>
      </div>
    </Link>
  );
}

function YearCard(props: {
  username: string;
  year: number;
  completed: number;
  playtimeMin: number;
}) {
  return (
    <Panel title={m.overview_this_year({ year: String(props.year) })}>
      <div className="flex items-end gap-8">
        <div className="grid gap-1">
          <span className="font-display text-4xl font-medium">{props.completed}</span>
          <span className="text-muted-foreground text-[13px]">{m.overview_finished_count()}</span>
        </div>
        {/* Süre oturum kayıtlarından gelir; hiç oturum yoksa "0 dk" yazmak yanıltıcı olurdu. */}
        {props.playtimeMin > 0 && (
          <div className="grid gap-1">
            <span className="font-display text-4xl font-medium">
              {formatPlaytime(props.playtimeMin)}
            </span>
            <span className="text-muted-foreground text-[13px]">{m.overview_played_time()}</span>
          </div>
        )}
      </div>
      <Link
        to="/u/$username/wrapped/$year"
        params={{ username: props.username, year: String(props.year) }}
        className="text-foreground/75 hover:text-foreground flex w-fit items-center gap-2 text-sm font-semibold transition-colors"
      >
        <SparklesIcon className="size-4" />
        {m.overview_wrapped({ year: String(props.year) })}
      </Link>
    </Panel>
  );
}

/** Durumlara göre dağılım: tek yatay çubuk ve tıklanınca kütüphaneyi o duruma süzen etiketler. */
function MixCard(props: { counts: Record<EntryStatus, number>; total: number; username: string }) {
  const present = entryStatuses.filter((status) => props.counts[status] > 0);
  return (
    <Panel title={m.overview_mix()}>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/6">
        {present.map((status) => (
          <span
            key={status}
            title={`${statusLabel(status)}: ${props.counts[status]}`}
            style={{
              width: `${(props.counts[status] / props.total) * 100}%`,
              backgroundColor: statusColor[status],
            }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {present.map((status) => (
          <Link
            key={status}
            to="/u/$username/library"
            params={{ username: props.username }}
            search={{ status }}
            className="text-foreground/80 hover:text-foreground flex items-center gap-2 text-[13px] font-semibold"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: statusColor[status] }}
            />
            {statusLabel(status)}
            <span className="text-foreground/50 font-medium">{props.counts[status]}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function Shelf({ items }: { items: LibraryItem[] }) {
  return (
    <div className="-mx-4 flex gap-3.5 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {items.map((item, index) => (
        <Link
          key={item.id}
          to="/e/$id"
          params={{ id: item.id }}
          title={item.game.name}
          className="group animate-rise relative w-[128px] shrink-0 sm:w-[140px]"
          style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
        >
          <div className="transition-transform duration-400 ease-(--ease-salon) group-hover:-translate-y-1.5">
            <GameCover
              url={item.game.coverUrl}
              name={item.game.name}
              color={item.game.accentColor}
            />
          </div>
          <StarIcon className="absolute top-2.5 right-2.5 size-4 fill-yellow-400 text-yellow-400 drop-shadow" />
          {item.rating !== null && (
            <span className="font-display absolute right-2 bottom-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/70 px-2 text-[11px] font-semibold backdrop-blur">
              {formatRating(item.rating)}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

function Row({ item, detail, rank }: { item: LibraryItem; detail: string | null; rank?: number }) {
  const rating = formatRating(item.rating);
  return (
    <Link
      to="/e/$id"
      params={{ id: item.id }}
      className="flex items-center gap-3.5 rounded-2xl p-2 transition-colors hover:bg-white/[0.05]"
    >
      {rank !== undefined && (
        <span className="font-display text-foreground/40 w-6 shrink-0 text-center text-lg font-medium">
          {rank}
        </span>
      )}
      <GameCover
        url={item.game.coverUrl}
        name={item.game.name}
        color={item.game.accentColor}
        className="w-11 shrink-0 rounded-lg"
      />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate font-semibold">{item.game.name}</span>
        <span className="text-foreground/55 truncate text-[13px]">{detail}</span>
      </span>
      {rating && (
        <span className="font-display flex h-8 min-w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-2.5 text-sm font-semibold">
          {rating}
        </span>
      )}
    </Link>
  );
}
