import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { GamepadIcon } from "lucide-react";
import { Stage } from "@/components/stage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { orNotFound } from "@/lib/api";
import { formatDate, formatPlaytime, formatRating } from "@/lib/format";
import { profileQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/u/$username")({
  loader: ({ context, params }) =>
    orNotFound(context.queryClient.ensureQueryData(profileQuery(params.username))),
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
      <div className="font-display text-2xl font-medium sm:text-[28px]">{value ?? m.unknown()}</div>
      <div className="text-muted-foreground text-[13px]">{label}</div>
    </div>
  );
}

function ProfileLayout() {
  const { username } = Route.useParams();
  const { data } = useSuspenseQuery(profileQuery(username));
  const { user, summary, steam } = data;

  const tabs = [
    { to: "/u/$username", label: m.tab_library(), exact: true },
    { to: "/u/$username/stats", label: m.tab_stats(), exact: false },
    { to: "/u/$username/activity", label: m.tab_activity(), exact: false },
    { to: "/u/$username/screenshots", label: m.tab_screenshots(), exact: false },
  ] as const;

  return (
    <div className="grid gap-6 pt-4">
      <Stage items={[]} className="h-[520px] opacity-80" />
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 items-center gap-5">
          <Avatar className="size-20 ring-3 ring-white/20 sm:size-[84px]">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback className="font-display text-3xl">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 gap-1.5">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[38px]">
              {user.name}
            </h1>
            <div className="text-foreground/70 text-[15px]">
              @{user.username} ·{" "}
              {m.profile_member_since({ date: formatDate(user.createdAt, "long") ?? "" })}
            </div>
            {steam?.currentGameName && (
              <div className="text-live flex items-center gap-2 text-sm font-semibold">
                <GamepadIcon className="size-4" />
                {m.profile_now_playing({ game: steam.currentGameName })}
              </div>
            )}
          </div>
        </div>
        {summary && (
          <div className="flex gap-7 sm:gap-9">
            <Stat label={m.profile_games()} value={summary.games} />
            <Stat label={m.profile_completed()} value={summary.completed} />
            <Stat label={m.profile_playtime()} value={formatPlaytime(summary.playtimeMin)} />
            <Stat label={m.profile_average()} value={formatRating(summary.averageRating)} />
          </div>
        )}
      </section>
      {user.bio && <p className="text-foreground/85 max-w-2xl whitespace-pre-line">{user.bio}</p>}

      <nav className="flex gap-7 overflow-x-auto border-b [scrollbar-width:none]">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ username }}
            activeOptions={{ exact: tab.exact, includeSearch: false }}
            className="text-foreground/65 data-[status=active]:text-foreground shrink-0 pb-3.5 text-[15px] font-semibold data-[status=active]:shadow-[inset_0_-2px_0_currentColor]"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
