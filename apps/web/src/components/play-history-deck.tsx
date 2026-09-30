import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { GameCover } from "@/components/game-cover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, unwrap } from "@/lib/api";
import { errorMessage, formatPlaytime } from "@/lib/format";
import { estimateQuestionsQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type Answer =
  | { kind: "once"; year: number; month: number | null }
  | { kind: "years"; years: number[] }
  | { kind: "tool" }
  | { kind: "confirm" };

/**
 * "Geçmişini netleştir": takip öncesi süresi çok ama kanıtı az oyunları birer birer sorar. Cevaplar kaydın
 * düzeltmesi olarak kilitlenir; dönem geometrisini yine sunucu kurar ("2012 Temmuz, bir kerede" → o ayın
 * çevresinde süreyi taşıyacak kadar yoğun bir dönem).
 */
export function PlayHistoryDeck(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  // Deste açıkken liste yenilenmez (sıra kaymasın); kapanınca geçersiz kılınır.
  const questions = useQuery({
    ...estimateQuestionsQuery,
    enabled: props.open,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  // Deste açıldığı andaki liste üzerinden ilerlenir (cevaplandıkça sunucudaki liste kısalır).
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"choose" | "once" | "years">("choose");
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [years, setYears] = useState<string[]>([]);
  const [answered, setAnswered] = useState(0);
  const list = questions.data?.questions ?? [];
  const current = list[index];

  const next = () => {
    setIndex((value) => value + 1);
    setMode("choose");
    setYear(null);
    setMonth(null);
    setYears([]);
  };
  const answer = useMutation({
    mutationFn: (input: { entryId: string; answer: Answer }) =>
      unwrap(
        api.library[":id"]["play-history"].answer.$post({
          param: { id: input.entryId },
          json: input.answer,
        }),
      ),
    onSuccess: (data, input) => {
      queryClient.setQueryData(["play-history", input.entryId], data);
      setAnswered((value) => value + 1);
      next();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const close = (open: boolean) => {
    props.onOpenChange(open);
    if (open) return;
    if (answered > 0) {
      // Isı haritası, yıl özeti ve soru listesi aynı günlerden beslenir.
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      void queryClient.invalidateQueries({ queryKey: ["wrapped"] });
      void queryClient.invalidateQueries({ queryKey: estimateQuestionsQuery.queryKey });
      toast.success(m.play_history_saved());
    }
    setIndex(0);
    setAnswered(0);
    setMode("choose");
  };
  const send = (value: Answer) => {
    if (current) answer.mutate({ entryId: current.entryId, answer: value });
  };

  const yearOptions = current
    ? Array.from(
        { length: current.years.to - current.years.from + 1 },
        (_, offset) => current.years.to - offset,
      )
    : [];
  const monthFormat = new Intl.DateTimeFormat(getLocale(), { month: "short", timeZone: "UTC" });
  const yearOf = (iso: string) => iso.slice(0, 4);

  return (
    <Dialog open={props.open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{m.play_history_deck_title()}</DialogTitle>
          <DialogDescription>{m.play_history_deck_hint()}</DialogDescription>
        </DialogHeader>

        {questions.isPending ? null : !current ? (
          <div className="grid justify-items-center gap-4 py-6 text-center">
            <CheckIcon className="text-primary size-8" />
            <p className="text-sm">
              {list.length === 0 ? m.play_history_deck_empty() : m.play_history_deck_done()}
            </p>
            <Button onClick={() => close(false)}>{m.play_history_deck_close()}</Button>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="flex items-center gap-4">
              <GameCover
                url={current.game.coverUrl}
                name={current.game.name}
                className="w-14 shrink-0"
              />
              <div className="grid min-w-0 gap-1">
                <span className="text-muted-foreground text-xs tabular-nums">
                  {m.play_history_deck_progress({ current: index + 1, total: list.length })}
                </span>
                <span className="truncate text-lg font-bold">{current.game.name}</span>
                <span className="text-muted-foreground text-sm">
                  {m.play_history_deck_hours({ time: formatPlaytime(current.budgetMin) })}
                  {" · "}
                  {current.pattern === "excluded"
                    ? m.play_history_deck_guess_excluded()
                    : current.guess
                      ? m.play_history_deck_guess({
                          from: yearOf(current.guess.from),
                          to: yearOf(current.guess.to),
                        })
                      : null}
                </span>
              </div>
            </div>

            {mode === "choose" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="glass" disabled={answer.isPending} onClick={() => setMode("once")}>
                  {m.play_history_deck_once()}
                </Button>
                <Button
                  variant="glass"
                  disabled={answer.isPending}
                  onClick={() => setMode("years")}
                >
                  {m.play_history_deck_years()}
                </Button>
                <Button
                  variant="glass"
                  disabled={answer.isPending}
                  onClick={() => send({ kind: "confirm" })}
                >
                  {m.play_history_deck_confirm()}
                </Button>
                <Button
                  variant="glass"
                  disabled={answer.isPending}
                  onClick={() => send({ kind: "tool" })}
                >
                  {m.play_history_deck_tool()}
                </Button>
                <Button variant="ghost" className="sm:col-span-2" onClick={next}>
                  {m.play_history_deck_skip()}
                </Button>
              </div>
            )}

            {mode === "once" && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <span className="text-sm font-semibold">{m.play_history_deck_which_year()}</span>
                  <ToggleGroup
                    type="single"
                    variant="chips"
                    size="sm"
                    value={year ? String(year) : ""}
                    onValueChange={(value) => setYear(value ? Number(value) : null)}
                  >
                    {yearOptions.map((option) => (
                      <ToggleGroupItem key={option} value={String(option)} className="tabular-nums">
                        {option}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div className="grid gap-2">
                  <span className="text-sm font-semibold">{m.play_history_deck_which_month()}</span>
                  <ToggleGroup
                    type="single"
                    variant="chips"
                    size="sm"
                    value={month ? String(month) : "0"}
                    onValueChange={(value) =>
                      setMonth(value && value !== "0" ? Number(value) : null)
                    }
                  >
                    <ToggleGroupItem value="0">{m.play_history_deck_any_month()}</ToggleGroupItem>
                    {MONTHS.map((value) => (
                      <ToggleGroupItem key={value} value={String(value)}>
                        {monthFormat.format(new Date(Date.UTC(2000, value - 1, 1)))}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <DeckFooter
                  onBack={() => setMode("choose")}
                  disabled={!year || answer.isPending}
                  onSave={() => year && send({ kind: "once", year, month })}
                />
              </div>
            )}

            {mode === "years" && (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <span className="text-sm font-semibold">{m.play_history_deck_which_years()}</span>
                  <ToggleGroup
                    type="multiple"
                    variant="chips"
                    size="sm"
                    value={years}
                    onValueChange={setYears}
                  >
                    {yearOptions.map((option) => (
                      <ToggleGroupItem key={option} value={String(option)} className="tabular-nums">
                        {option}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <DeckFooter
                  onBack={() => setMode("choose")}
                  disabled={years.length === 0 || answer.isPending}
                  onSave={() => send({ kind: "years", years: years.map(Number) })}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeckFooter(props: { onBack: () => void; onSave: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" onClick={props.onBack}>
        <ArrowLeftIcon />
        {m.play_history_deck_back()}
      </Button>
      <Button disabled={props.disabled} onClick={props.onSave}>
        {m.action_save()}
      </Button>
    </div>
  );
}
