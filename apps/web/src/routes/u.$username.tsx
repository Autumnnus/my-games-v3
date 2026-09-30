import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { GamepadIcon, GitCompareArrowsIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useAddGame } from "@/components/add-game";
import { Stage, type StageItem } from "@/components/stage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { orNotFound } from "@/lib/api";
import { formatMonthYear, formatPlaytime, formatRating } from "@/lib/format";
import { type LibraryItem, profileOverviewQuery, profileQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/u/$username")({
  loader: async ({ context, params }) => {
    // Genel bakış verisi sahnenin görselini de verir; başlıkla birlikte gelsin, sonradan belirmesin.
    const [profile] = await Promise.all([
      orNotFound(context.queryClient.ensureQueryData(profileQuery(params.username))),
      context.queryClient.prefetchQuery(profileOverviewQuery(params.username)),
    ]);
    return profile;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.user.name} (@${loaderData.user.username}) · ${m.app_name()}` },
          { name: "description", content: loaderData.user.bio ?? m.home_subtitle() },
          { property: "og:title", content: `${loaderData.user.name} · ${m.app_name()}` },
          ...(loaderData.user.image
            ? [{ property: "og:image", content: loaderData.user.image }]
            : []),
        ]
      : [],
  }),
  component: ProfileLayout,
});

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="grid gap-1">
      <div className="font-display text-xl font-medium whitespace-nowrap sm:text-[28px]">
        {value ?? m.unknown()}
      </div>
      <div className="text-muted-foreground text-[13px]">{label}</div>
    </div>
  );
}

/** Profilin sahnesi: oynadığı, sonra favori, sonra en son dokunduğu oyunun geniş görseli. */
function stageOf(sections: LibraryItem[][]): StageItem[] {
  for (const items of sections) {
    const item = items.find((entry) => entry.game.heroUrl) ?? items[0];
    if (item) {
      return [
        {
          key: item.id,
          hero: item.game.heroUrl,
          cover: item.game.coverUrl,
          color: item.game.accentColor,
        },
      ];
    }
  }
  return [];
}

function ProfileLayout() {
  const { username } = Route.useParams();
  const { user: viewer } = Route.useRouteContext();
  const { data } = useSuspenseQuery(profileQuery(username));
  const overview = useQuery(profileOverviewQuery(username));
  const addGame = useAddGame();
  const { user, summary, steam } = data;
  const isOwner = !!viewer && viewer.id === user.id;
  const viewerName = viewer?.displayUsername ?? viewer?.username;
  const stage = overview.data
    ? stageOf([overview.data.nowPlaying, overview.data.favorites, overview.data.recent])
    : [];

  const tabs = [
    { to: "/u/$username", label: m.tab_overview(), exact: true },
    { to: "/u/$username/library", label: m.tab_library(), exact: false, count: summary?.games },
    { to: "/u/$username/stats", label: m.tab_stats(), exact: false },
    { to: "/u/$username/activity", label: m.tab_activity(), exact: false },
    { to: "/u/$username/screenshots", label: m.tab_screenshots(), exact: false },
  ] as const;

  return (
    <div className="grid gap-6 pt-4">
      <Stage items={stage} className="h-[560px] opacity-80" />
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 items-center gap-5">
          <Avatar className="size-20 ring-3 ring-white/20 sm:size-[92px]">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback className="font-display text-3xl">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 gap-1.5">
            <h1 className="font-display truncate text-3xl font-semibold tracking-tight sm:text-[40px]">
              {user.name}
            </h1>
            <div className="text-foreground/70 text-[15px]">
              @{user.username} · {m.profile_member_since({ date: formatMonthYear(user.createdAt) })}
            </div>
            {steam?.currentGameName && (
              <div className="text-live flex items-center gap-2 text-sm font-semibold">
                <GamepadIcon className="size-4" />
                {m.profile_now_playing({ game: steam.currentGameName })}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner ? (
            <>
              <Button onClick={() => addGame.open()}>
                <PlusIcon />
                {m.action_add_game()}
              </Button>
              <Button asChild variant="glass">
                <Link to="/settings">
                  <PencilIcon />
                  {m.profile_edit()}
                </Link>
              </Button>
            </>
          ) : (
            viewerName && (
              <Button asChild variant="glass">
                <Link to="/compare" search={{ a: viewerName, b: user.username ?? username }}>
                  <GitCompareArrowsIcon />
                  {m.profile_compare()}
                </Link>
              </Button>
            )
          )}
        </div>
      </section>
      {(user.bio || summary) && (
        <div className="flex flex-wrap items-end justify-between gap-6">
          {user.bio ? (
            <p className="text-foreground/85 max-w-2xl whitespace-pre-line">{user.bio}</p>
          ) : (
            <span />
          )}
          {summary && (
            // Sahne görseli parlak olabilir; sayılar cam zeminde her zaman okunur kalır.
            <div className="glass flex w-full justify-between gap-5 rounded-[22px] border border-white/10 px-5 py-3.5 sm:w-auto sm:justify-start sm:gap-9 sm:px-6">
              <Stat label={m.profile_games()} value={summary.games} />
              <Stat label={m.profile_completed()} value={summary.completed} />
              <Stat label={m.profile_playtime()} value={formatPlaytime(summary.playtimeMin)} />
              <Stat label={m.profile_average()} value={formatRating(summary.averageRating)} />
            </div>
          )}
        </div>
      )}

      <nav className="flex gap-7 overflow-x-auto border-b [scrollbar-width:none]">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ username }}
            activeOptions={{ exact: tab.exact, includeSearch: false }}
            className="text-foreground/65 data-[status=active]:text-foreground flex shrink-0 items-center gap-2 pb-3.5 text-[15px] font-semibold data-[status=active]:shadow-[inset_0_-2px_0_currentColor]"
          >
            {tab.label}
            {"count" in tab && tab.count ? (
              <span className="text-foreground/50 text-[13px] font-medium">{tab.count}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
