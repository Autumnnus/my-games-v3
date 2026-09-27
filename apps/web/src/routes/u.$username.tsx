import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { GamepadIcon } from "lucide-react";
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
    <div>
      <div className="text-lg font-semibold">{value ?? m.unknown()}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
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
    <div className="grid gap-6">
      <section className="flex flex-wrap items-start gap-4">
        <Avatar className="size-20">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback className="text-2xl">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="text-2xl font-semibold">{user.name}</h1>
          <div className="text-muted-foreground text-sm">
            @{user.username} ·{" "}
            {m.profile_member_since({ date: formatDate(user.createdAt, "long") ?? "" })}
          </div>
          {user.bio && <p className="max-w-2xl text-sm whitespace-pre-line">{user.bio}</p>}
          {steam?.currentGameName && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <GamepadIcon className="size-4" />
              {m.profile_now_playing({ game: steam.currentGameName })}
            </div>
          )}
        </div>
        {summary && (
          <div className="flex gap-6">
            <Stat label={m.profile_games()} value={summary.games} />
            <Stat label={m.profile_completed()} value={summary.completed} />
            <Stat label={m.profile_playtime()} value={formatPlaytime(summary.playtimeMin)} />
            <Stat label={m.profile_average()} value={formatRating(summary.averageRating)} />
          </div>
        )}
      </section>

      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ username }}
            activeOptions={{ exact: tab.exact, includeSearch: false }}
            className="text-muted-foreground data-[status=active]:border-foreground data-[status=active]:text-foreground -mb-px border-b-2 border-transparent px-3 py-2 text-sm"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
