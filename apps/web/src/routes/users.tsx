import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GamepadIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as z from "zod/mini";
import { Stage } from "@/components/stage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPlaytime, formatRelative } from "@/lib/format";
import { useHydrated } from "@/lib/hydrated";
import { avatarThumb } from "@/lib/media/urls";
import { type DirectoryUser, type UserDirectorySort, usersQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

const sorts = ["active", "games", "new"] as const satisfies readonly UserDirectorySort[];

export const Route = createFileRoute("/users")({
  validateSearch: z.object({
    q: z.optional(z.string()),
    sort: z.optional(z.enum(sorts)),
  }),
  loaderDeps: ({ search }) => ({ q: search.q, sort: search.sort }),
  loader: ({ context, deps }) =>
    context.queryClient.prefetchInfiniteQuery(usersQuery({ q: deps.q, sort: deps.sort })),
  head: () => ({ meta: [{ title: `${m.nav_users()} · ${m.app_name()}` }] }),
  component: UsersPage,
});

const sortLabels: Record<UserDirectorySort, () => string> = {
  active: m.users_sort_active,
  games: m.users_sort_games,
  new: m.users_sort_new,
};

function UsersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user: viewer } = Route.useRouteContext();
  const query = useInfiniteQuery(usersQuery({ q: search.q, sort: search.sort }));
  const users = query.data?.pages.flatMap((page) => page.users) ?? [];

  // Arama kutusu adrese 300 ms gecikmeyle yazılır; adres dışarıdan değişirse kutu ona uyar.
  const [q, setQ] = useState(search.q ?? "");
  const pushed = useRef(search.q ?? "");
  useEffect(() => {
    const fromUrl = search.q ?? "";
    if (fromUrl !== pushed.current) {
      pushed.current = fromUrl;
      setQ(fromUrl);
    }
  }, [search.q]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = q.trim();
      if (pushed.current === next) return;
      pushed.current = next;
      void navigate({
        search: (previous) => ({ ...previous, q: next || undefined }),
        replace: true,
        viewTransition: false,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, navigate]);

  return (
    <div className="grid gap-8 pt-4">
      <Stage items={[]} className="h-[520px] opacity-80" />
      <div className="grid gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[40px]">
          {m.nav_users()}
        </h1>
        <p className="text-foreground/70 max-w-xl text-[15px]">{m.users_subtitle()}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          className="w-full sm:max-w-sm"
          placeholder={m.users_search()}
          aria-label={m.users_search()}
          value={q}
          loading={query.isFetching && !query.isFetchingNextPage}
          onChange={(event) => setQ(event.target.value)}
        />
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={m.users_sort_label()}
          value={search.sort ?? "active"}
          onValueChange={(value) =>
            value &&
            navigate({
              search: (previous) => ({
                ...previous,
                sort: value === "active" ? undefined : (value as UserDirectorySort),
              }),
              viewTransition: false,
            })
          }
        >
          {sorts.map((sort) => (
            <ToggleGroupItem key={sort} value={sort} className="px-4">
              {sortLabels[sort]()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {query.isSuccess && users.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center">{m.users_empty()}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((person, index) => (
            <UserCard
              key={person.id}
              person={person}
              index={index}
              isYou={person.id === viewer?.id}
            />
          ))}
        </div>
      )}

      {query.hasNextPage && (
        <Button
          variant="glass"
          className="justify-self-center"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {m.action_load_more()}
        </Button>
      )}
    </div>
  );
}

/** Oyuncu kartı: son oynadıklarından kapak şeridi, kim olduğu, şu an ne oynadığı ve kısa sayılar. */
function UserCard({
  person,
  index,
  isYou,
}: {
  person: DirectoryUser;
  index: number;
  isYou: boolean;
}) {
  const hydrated = useHydrated();
  return (
    <Link
      to="/u/$username"
      params={{ username: person.username }}
      className="group animate-rise bg-card/70 relative grid overflow-hidden rounded-[24px] border border-white/8 transition-[border-color,transform,box-shadow] duration-300 ease-(--ease-salon) hover:-translate-y-1 hover:border-white/16 hover:shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)]"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <div className="relative h-28 overflow-hidden bg-white/[0.03]">
        {person.covers.length > 0 ? (
          <div className="absolute inset-0 grid grid-cols-4">
            {person.covers.map((cover) => (
              <img
                key={cover.slug}
                src={cover.coverUrl}
                alt=""
                loading="lazy"
                className="size-full object-cover opacity-80 transition-transform duration-700 ease-(--ease-salon) group-hover:scale-105"
              />
            ))}
          </div>
        ) : null}
        <div className="from-card absolute inset-0 bg-gradient-to-t via-black/40 to-black/10" />
      </div>
      <div className="relative -mt-9 grid gap-3 px-5 pb-5">
        <div className="flex items-end gap-3">
          <Avatar className="ring-card size-16 ring-4">
            {person.image && <AvatarImage src={avatarThumb(person.image)} alt="" />}
            <AvatarFallback className="font-display text-xl">
              {person.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isYou && (
            <span className="mb-1 rounded-full bg-white/12 px-2.5 py-0.5 text-xs font-bold">
              {m.spotlight_you()}
            </span>
          )}
        </div>
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate text-lg font-bold">{person.name}</span>
          <span className="text-foreground/55 truncate text-sm">@{person.username}</span>
        </div>
        {person.nowPlaying ? (
          <span className="text-live flex min-w-0 items-center gap-2 text-sm font-semibold">
            <GamepadIcon className="size-4 shrink-0" />
            <span className="truncate">{person.nowPlaying.name}</span>
          </span>
        ) : person.bio ? (
          <p className="text-foreground/70 line-clamp-1 text-sm">{person.bio}</p>
        ) : null}
        <div className="text-foreground/65 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="text-foreground font-semibold">
            {m.overview_mix_total({ count: person.games })}
          </span>
          <span>{m.users_completed({ count: person.completed })}</span>
          {person.playtimeMin > 0 && <span>{formatPlaytime(person.playtimeMin)}</span>}
          {hydrated && person.lastActiveAt && (
            <span className="ml-auto">
              {m.users_active({ time: formatRelative(person.lastActiveAt) })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
