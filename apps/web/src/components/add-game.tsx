import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EntryForm, type EntryFormValues } from "@/components/entry-form";
import { GameCover } from "@/components/game-cover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/search-input";
import { api, unwrap } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { metaQuery } from "@/lib/meta";
import { m } from "@/paraglide/messages";

/** Eklenecek oyun: IGDB sonucu, katalogdaki bir oyun ya da elle girilecek bir ad. */
type Target =
  | {
      kind: "igdb";
      igdbId: number;
      name: string;
      coverUrl: string | null;
      releaseYear: number | null;
    }
  | {
      kind: "game";
      gameId: string;
      name: string;
      coverUrl: string | null;
      releaseYear: number | null;
    }
  | { kind: "custom"; name: string };

export type AddGameTarget = Target;
type AddGameContext = {
  /** Diyaloğu açar: bir oyunla (doğrudan forma) ya da arama kutusu `query` ile dolu olarak. */
  open: (target?: Target, options?: { query?: string }) => void;
};

const Context = createContext<AddGameContext>({ open: () => {} });

export function useAddGame() {
  return useContext(Context);
}

export function AddGameProvider({ children }: { children: ReactNode }) {
  const { user } = useRouteContext({ from: "__root__" });
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [initialQuery, setInitialQuery] = useState("");
  // ⌘K artık Spotlight'ın (components/spotlight.tsx); oyun ekleme oradan ve kütüphane sayfasından açılır.
  const value = useMemo<AddGameContext>(
    () => ({
      open: (next, options) => {
        setTarget(next ?? null);
        setInitialQuery(options?.query ?? "");
        setOpen(true);
      },
    }),
    [],
  );

  return (
    <Context.Provider value={value}>
      {children}
      {user && (
        <AddGameDialog
          open={open}
          onOpenChange={setOpen}
          target={target}
          onTargetChange={setTarget}
          initialQuery={initialQuery}
          username={user.displayUsername ?? user.username ?? ""}
        />
      )}
    </Context.Provider>
  );
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function AddGameDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Target | null;
  onTargetChange: (target: Target | null) => void;
  initialQuery: string;
  username: string;
}) {
  const [query, setQuery] = useState("");
  const { open, initialQuery } = props;
  // Her açılışta arama kutusu verilen sorguyla (Spotlight'ta yazılan ad) ya da boş başlar.
  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [open, initialQuery]);
  const debounced = useDebounced(query.trim(), 300);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const meta = useQuery(metaQuery);
  const igdbEnabled = meta.data?.features.igdb ?? false;

  const search = useQuery({
    queryKey: ["catalog-search", debounced],
    queryFn: () => unwrap(api.catalog.search.$get({ query: { q: debounced } })),
    enabled: props.open && debounced.length >= 2,
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: async ({ target, values }: { target: Target; values: EntryFormValues }) => {
      let reference: { gameId?: string; igdbId?: number } = {};
      if (target.kind === "igdb") reference = { igdbId: target.igdbId };
      if (target.kind === "game") reference = { gameId: target.gameId };
      if (target.kind === "custom") {
        const { game } = await unwrap(api.catalog.custom.$post({ json: { name: target.name } }));
        reference = { gameId: game.id };
      }
      return unwrap(api.library.$post({ json: { ...values, ...reference } }));
    },
    onSuccess: async ({ entry }) => {
      toast.success(m.add_game_added({ name: entry.game.name }), {
        action: {
          label: m.action_open(),
          onClick: () => navigate({ to: "/e/$id", params: { id: entry.id } }),
        },
      });
      props.onOpenChange(false);
      props.onTargetChange(null);
      setQuery("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["library"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
        queryClient.invalidateQueries({ queryKey: ["my-entry"] }),
        queryClient.invalidateQueries({ queryKey: ["game"] }),
      ]);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const target = props.target;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.add_game_title()}</DialogTitle>
          {target && <DialogDescription>{target.name}</DialogDescription>}
        </DialogHeader>

        {target ? (
          <div className="grid gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => props.onTargetChange(null)}
            >
              <ArrowLeftIcon />
              {m.add_game_back()}
            </Button>
            <EntryForm
              submitLabel={m.action_add_to_library()}
              submitting={save.isPending}
              onSubmit={(values) => save.mutate({ target, values })}
            />
          </div>
        ) : (
          <div className="grid gap-3">
            {!igdbEnabled && meta.data && (
              <Alert>
                <AlertDescription>{m.add_game_igdb_disabled()}</AlertDescription>
              </Alert>
            )}
            <SearchInput
              autoFocus
              placeholder={m.add_game_search()}
              aria-label={m.add_game_search()}
              value={query}
              loading={search.isFetching}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="grid gap-1">
              {search.data?.results.map((result) => (
                <button
                  type="button"
                  key={result.gameId ?? `igdb-${result.igdbId}`}
                  disabled={result.inLibrary}
                  onClick={() =>
                    props.onTargetChange(
                      result.gameId
                        ? {
                            kind: "game",
                            gameId: result.gameId,
                            name: result.name,
                            coverUrl: result.coverUrl,
                            releaseYear: result.releaseYear,
                          }
                        : {
                            kind: "igdb",
                            igdbId: result.igdbId ?? 0,
                            name: result.name,
                            coverUrl: result.coverUrl,
                            releaseYear: result.releaseYear,
                          },
                    )
                  }
                  className="flex items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none disabled:opacity-55"
                >
                  <GameCover
                    url={result.coverUrl}
                    name={result.name}
                    className="w-11 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{result.name}</div>
                    <div className="text-muted-foreground text-xs">{result.releaseYear ?? ""}</div>
                  </div>
                  {result.inLibrary && <Badge variant="secondary">{m.add_game_in_library()}</Badge>}
                </button>
              ))}
              {search.data && search.data.results.length === 0 && (
                <p className="text-muted-foreground px-2 py-3 text-sm">{m.add_game_no_results()}</p>
              )}
              {query.trim().length >= 1 && (
                <button
                  type="button"
                  onClick={() => props.onTargetChange({ kind: "custom", name: query.trim() })}
                  className="text-foreground/75 hover:text-foreground mt-1 flex items-center gap-3 rounded-2xl border border-dashed border-white/12 p-3 text-left text-sm font-semibold transition-colors hover:bg-white/[0.05]"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-white/8">
                    <PlusIcon className="size-4" />
                  </span>
                  {m.add_game_custom({ name: query.trim() })}
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
