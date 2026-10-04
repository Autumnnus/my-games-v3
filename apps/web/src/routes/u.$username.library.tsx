import { entryStatuses } from "@my-games/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGridIcon, ListFilterIcon, ListIcon, PlusIcon, StarIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";
import { useAddGame } from "@/components/add-game";
import { LibraryGrid, LibraryTable } from "@/components/library-view";
import { CoachMark } from "@/components/onboarding/coach-mark";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, unwrap } from "@/lib/api";
import { smartListsQuery } from "@/lib/assistant";
import { errorMessage, statusLabel } from "@/lib/format";
import { libraryQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

const sorts = ["updated", "name", "rating", "playtime", "last_played", "finished"] as const;

const searchSchema = z.object({
  status: z.optional(z.enum(entryStatuses)),
  q: z.optional(z.string()),
  sort: z.optional(z.enum(sorts)),
  view: z.optional(z.enum(["grid", "table"])),
  fav: z.optional(z.boolean()),
  list: z.optional(z.string()),
});

export const Route = createFileRoute("/u/$username/library")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    status: search.status,
    q: search.q,
    sort: search.sort,
    fav: search.fav,
    list: search.list,
  }),
  loader: async ({ context, params, deps }) => {
    // Akıllı listeler de SSR'da gelsin; yoksa çip satırı sonradan belirip ızgarayı aşağı iter.
    const [library] = await Promise.all([
      context.queryClient.ensureQueryData(
        libraryQuery(params.username, {
          status: deps.status,
          q: deps.q,
          sort: deps.sort,
          favorites: deps.fav,
          list: deps.list,
        }),
      ),
      context.queryClient.prefetchQuery(smartListsQuery(params.username)),
    ]);
    return library;
  },
  component: LibraryPage,
});

const sortLabels: Record<(typeof sorts)[number], () => string> = {
  updated: m.sort_updated,
  name: m.sort_name,
  rating: m.sort_rating,
  playtime: m.sort_playtime,
  last_played: m.sort_last_played,
  finished: m.sort_finished,
};

function LibraryPage() {
  const { username } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [q, setQ] = useState(search.q ?? "");
  const addGame = useAddGame();

  const { user } = Route.useRouteContext();
  const { data } = useQuery(
    libraryQuery(username, {
      status: search.status,
      q: search.q,
      sort: search.sort,
      favorites: search.fav,
      list: search.list,
    }),
  );
  const lists = useQuery(smartListsQuery(username));
  const activeList = lists.data?.lists.find((list) => list.id === search.list);
  const isOwner =
    !!user && (user.displayUsername ?? user.username)?.toLowerCase() === username.toLowerCase();
  const queryClient = useQueryClient();
  const removeList = useMutation({
    mutationFn: (id: string) => unwrap(api.lists[":id"].$delete({ param: { id } })),
    onSuccess: async (_, id) => {
      if (search.list === id)
        await navigate({
          search: (previous) => ({ ...previous, list: undefined }),
          viewTransition: false,
        });
      await queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Adres çubuğundaki arama dışarıdan değişirse (menüden "Kütüphanem"e tıklamak, akıllı liste linki) kutu da
  // ona uyar; yoksa kutuda eski metin kalır ve 300 ms sonra adrese geri yazılırdı.
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
      if (pushed.current === q) return;
      pushed.current = q;
      void navigate({
        search: (previous) => ({ ...previous, q: q || undefined }),
        replace: true,
        viewTransition: false,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, navigate]);

  const counts = data?.statusCounts ?? {};
  const total = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
  const view = search.view ?? "grid";
  const filtered = !!(search.status || search.q || search.fav || search.list);
  // Filtre ve görünüm değişimleri yalnızca sorgu parametresi: sayfa geçiş animasyonu oynamaz.
  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }), viewTransition: false });

  return (
    <div className="grid gap-5">
      {!!lists.data?.lists.length && (
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          <span className="text-foreground/60 flex shrink-0 items-center gap-1.5 text-xs font-bold tracking-[0.14em] uppercase">
            <ListFilterIcon className="size-3.5" />
            {m.library_lists()}
          </span>
          {lists.data.lists.map((list) => {
            const active = search.list === list.id;
            return (
              <span
                key={list.id}
                className={`flex h-9 shrink-0 items-center rounded-full border text-sm font-bold transition-colors ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "border-white/14 hover:bg-white/8"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  title={list.source === "ai" ? m.library_list_ai() : undefined}
                  onClick={() => setSearch({ list: active ? undefined : list.id })}
                  className="flex h-full items-center gap-2 pr-2 pl-3.5"
                >
                  {list.name}
                  <span className="opacity-65">{list.count}</span>
                </button>
                {isOwner && (
                  <button
                    type="button"
                    aria-label={m.library_list_delete({ name: list.name })}
                    onClick={() => {
                      if (window.confirm(m.library_list_delete_confirm({ name: list.name })))
                        removeList.mutate(list.id);
                    }}
                    className="mr-1 flex size-7 items-center justify-center rounded-full opacity-70 hover:bg-white/15 hover:opacity-100"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
      <CoachMark tip="library_lists" anchor="library-filters" when={isOwner && total > 0} />
      <div
        data-tour="library-filters"
        className="glass flex gap-1 overflow-x-auto rounded-2xl border border-white/8 p-1.5 [scrollbar-width:none]"
      >
        <StatusChip
          active={!search.status}
          label={`${m.status_all()} ${total}`}
          onClick={() => setSearch({ status: undefined })}
        />
        {entryStatuses
          .filter((status) => counts[status])
          .map((status) => (
            <StatusChip
              key={status}
              active={search.status === status}
              label={`${statusLabel(status)} ${counts[status]}`}
              onClick={() => setSearch({ status })}
            />
          ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="w-full sm:max-w-xs"
          placeholder={m.library_search_placeholder()}
          aria-label={m.library_search_placeholder()}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Select
          value={search.sort ?? activeList?.sort ?? "updated"}
          onValueChange={(value) => setSearch({ sort: value as (typeof sorts)[number] })}
        >
          <SelectTrigger className="w-48" aria-label={m.sort_label()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sorts.map((sort) => (
              <SelectItem key={sort} value={sort}>
                {sortLabels[sort]()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Toggle
          variant="outline"
          pressed={!!search.fav}
          onPressedChange={(pressed) => setSearch({ fav: pressed || undefined })}
          aria-label={m.favorites_only()}
        >
          <StarIcon />
          {m.favorites_only()}
        </Toggle>
        {/* Oyun ekleme düğmesi profil başlığında (her sekmede görünür); burada tekrarlanmaz. */}
        <div className="ml-auto flex items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={view}
            onValueChange={(value) => value && setSearch({ view: value as "grid" | "table" })}
          >
            <ToggleGroupItem value="grid" aria-label={m.view_grid()}>
              <LayoutGridIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label={m.view_table()}>
              <ListIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {data && data.items.length === 0 ? (
        <EmptyLibrary owner={isOwner} filtered={filtered} onAdd={() => addGame.open()} />
      ) : data ? (
        view === "grid" ? (
          <LibraryGrid items={data.items} />
        ) : (
          <LibraryTable items={data.items} />
        )
      ) : null}
    </div>
  );
}

/** Boş kütüphane: sahibine ilk oyunu eklemeyi önerir; filtre sonucu boşsa yalnızca bunu söyler. */
function EmptyLibrary(props: { owner: boolean; filtered: boolean; onAdd: () => void }) {
  if (props.filtered || !props.owner) {
    return <p className="text-muted-foreground py-12 text-center">{m.library_empty()}</p>;
  }
  return (
    <div className="grid justify-items-center gap-4 rounded-[26px] border border-dashed border-white/12 px-6 py-16 text-center">
      <span className="glass flex size-14 items-center justify-center rounded-full border border-white/12">
        <PlusIcon className="size-6" />
      </span>
      <div className="grid gap-1.5">
        <h2 className="font-display text-xl font-semibold">{m.library_empty_title()}</h2>
        <p className="text-foreground/70 max-w-md text-[15px]">{m.library_empty_body()}</p>
      </div>
      <Button size="lg" onClick={props.onAdd}>
        <PlusIcon />
        {m.action_add_game()}
      </Button>
    </div>
  );
}

function StatusChip(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={`h-10 shrink-0 rounded-xl px-4 text-sm font-bold transition-colors ${
        props.active ? "bg-foreground text-background" : "text-foreground/85 hover:bg-white/10"
      }`}
    >
      {props.label}
    </button>
  );
}
