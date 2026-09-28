import { entryStatuses } from "@my-games/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGridIcon, ListIcon, StarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import * as z from "zod/mini";
import { LibraryGrid, LibraryTable } from "@/components/library-view";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { statusLabel } from "@/lib/format";
import { libraryQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";

const sorts = ["updated", "name", "rating", "playtime", "last_played", "finished"] as const;

const searchSchema = z.object({
  status: z.optional(z.enum(entryStatuses)),
  q: z.optional(z.string()),
  sort: z.optional(z.enum(sorts)),
  view: z.optional(z.enum(["grid", "table"])),
  fav: z.optional(z.boolean()),
});

export const Route = createFileRoute("/u/$username/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    status: search.status,
    q: search.q,
    sort: search.sort,
    fav: search.fav,
  }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      libraryQuery(params.username, {
        status: deps.status,
        q: deps.q,
        sort: deps.sort,
        favorites: deps.fav,
      }),
    ),
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

  const { data } = useQuery(
    libraryQuery(username, {
      status: search.status,
      q: search.q,
      sort: search.sort,
      favorites: search.fav,
    }),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((search.q ?? "") !== q) {
        void navigate({
          search: (previous) => ({ ...previous, q: q || undefined }),
          replace: true,
        });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, search.q, navigate]);

  const counts = data?.statusCounts ?? {};
  const total = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0);
  const view = search.view ?? "grid";

  return (
    <div className="grid gap-6">
      <div className="glass flex gap-1 overflow-x-auto rounded-2xl border border-white/8 p-1.5 [scrollbar-width:none]">
        <StatusChip
          active={!search.status}
          label={`${m.status_all()} ${total}`}
          onClick={() => navigate({ search: (previous) => ({ ...previous, status: undefined }) })}
        />
        {entryStatuses
          .filter((status) => counts[status])
          .map((status) => (
            <StatusChip
              key={status}
              active={search.status === status}
              label={`${statusLabel(status)} ${counts[status]}`}
              onClick={() => navigate({ search: (previous) => ({ ...previous, status }) })}
            />
          ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-11 max-w-xs rounded-xl bg-white/5"
          placeholder={m.library_search_placeholder()}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Select
          value={search.sort ?? "updated"}
          onValueChange={(value) =>
            navigate({
              search: (previous) => ({ ...previous, sort: value as (typeof sorts)[number] }),
            })
          }
        >
          <SelectTrigger className="h-11! w-48 rounded-xl bg-white/5" aria-label={m.sort_label()}>
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
          className="h-11 rounded-xl px-4"
          pressed={!!search.fav}
          onPressedChange={(pressed) =>
            navigate({ search: (previous) => ({ ...previous, fav: pressed || undefined }) })
          }
          aria-label={m.favorites_only()}
        >
          <StarIcon />
          {m.favorites_only()}
        </Toggle>
        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          onValueChange={(value) =>
            value &&
            navigate({ search: (previous) => ({ ...previous, view: value as "grid" | "table" }) })
          }
          className="ml-auto"
        >
          <ToggleGroupItem value="grid" aria-label={m.view_grid()}>
            <LayoutGridIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label={m.view_table()}>
            <ListIcon />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {data && data.items.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">{m.library_empty()}</p>
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
