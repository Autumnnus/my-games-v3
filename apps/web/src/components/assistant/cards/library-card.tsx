import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckIcon, PinIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { GameCover } from "@/components/game-cover";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";
import { smartListsQuery, type ToolOutput } from "@/lib/assistant";
import { errorMessage, formatRating } from "@/lib/format";
import { m } from "@/paraglide/messages";

type Output = ToolOutput<"queryLibrary">;

/** Filtreleri anahtar sırasından bağımsız karşılaştırmak için. */
function signature(filter: Record<string, unknown>) {
  return JSON.stringify(
    Object.keys(filter)
      .sort()
      .map((key) => [key, filter[key]]),
  );
}

function SaveList({ output }: { output: Output }) {
  const queryClient = useQueryClient();
  const username = output.owner.username;
  const lists = useQuery(smartListsQuery(username));
  const name = output.title?.trim() || m.ai_card_list_default_name();
  const existing = lists.data?.lists.find(
    (list) => signature(list.filter) === signature(output.filter),
  );

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.lists.$post({ json: { name, filter: output.filter, sort: output.sort, source: "ai" } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.lists[":id"].$delete({ param: { id } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lists"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (existing) {
    return (
      <div className="animate-pop border-live/30 bg-live/10 flex items-center gap-3 rounded-2xl border py-2 pr-2 pl-3">
        <span className="bg-live/15 text-live flex size-8 shrink-0 items-center justify-center rounded-full">
          <CheckIcon className="size-4" strokeWidth={2.8} />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-bold">{m.ai_card_list_saved()}</span>
          <Link
            to="/u/$username/library"
            params={{ username }}
            search={{ list: existing.id }}
            className="text-foreground/75 truncate text-xs hover:underline"
          >
            {m.ai_card_list_open({ name: existing.name })}
          </Link>
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={remove.isPending}
          onClick={() => remove.mutate(existing.id)}
        >
          <Undo2Icon />
          {m.ai_card_undo()}
        </Button>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={save.isPending || lists.isPending}
      onClick={() => save.mutate()}
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-white/22 bg-white/3 px-3 py-2 text-left transition-colors hover:bg-white/7 disabled:opacity-60"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/8">
        <PinIcon className="size-4" />
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm font-bold">{m.ai_card_save_list({ name })}</span>
        <span className="text-foreground/65 text-xs">{m.ai_card_save_list_sub()}</span>
      </span>
    </button>
  );
}

/** `queryLibrary`: kapak ızgarası; kullanıcının kendi sorgusuysa akıllı liste olarak kaydedilebilir. */
export function LibraryCard({ output, wide }: { output: Output; wide?: boolean }) {
  const shown = output.games.slice(0, wide ? 12 : 8);
  const more = output.total - shown.length;
  const canSave = output.owner.self && Object.keys(output.filter).length > 0 && output.total > 0;

  return (
    <div className="grid gap-3 rounded-[18px] border border-white/8 bg-[#16171d] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-bold">
          {output.title ?? m.ai_card_library_count({ count: output.total })}
        </span>
        {output.title && (
          <span className="text-foreground/60 shrink-0 text-xs">
            {m.ai_card_library_count({ count: output.total })}
          </span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="text-foreground/65 text-sm">{m.ai_card_library_empty()}</p>
      ) : (
        <div className={`grid gap-2.5 ${wide ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-4"}`}>
          {shown.map((game) => (
            <Link
              key={game.entryId}
              to="/e/$id"
              params={{ id: game.entryId }}
              className="group grid min-w-0 content-start gap-1.5"
            >
              <span className="relative block transition-transform duration-300 group-hover:-translate-y-0.5">
                <GameCover
                  url={game.coverUrl}
                  name={game.name}
                  color={game.accentColor}
                  className="rounded-[10px]"
                />
                {game.rating !== null && (
                  <span className="font-display absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/75 px-1.5 text-[10px] font-semibold">
                    {formatRating(game.rating * 10)}
                  </span>
                )}
              </span>
              <span className="truncate text-xs font-bold">{game.name}</span>
            </Link>
          ))}
        </div>
      )}
      {more > 0 && (
        <Link
          to="/u/$username/library"
          params={{ username: output.owner.username }}
          className="text-foreground/70 w-fit text-xs font-semibold hover:underline"
        >
          {m.ai_card_library_more({ count: more })}
        </Link>
      )}
      {canSave && <SaveList output={output} />}
    </div>
  );
}
