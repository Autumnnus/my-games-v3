import type { ReviewDraftInput } from "@my-games/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { CheckIcon, LoaderIcon, MinusIcon, PlusIcon, Undo2Icon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { GameLogo } from "@/components/game-logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, unwrap } from "@/lib/api";
import { latestHistoryId, revertHistory } from "@/lib/assistant";
import { errorMessage, formatPlaytime, formatRating } from "@/lib/format";
import { entryQuery } from "@/lib/queries";
import { m } from "@/paraglide/messages";
import { Orb } from "./orb";

type Strength = ReviewDraftInput["strengths"][number];
type Weakness = ReviewDraftInput["weaknesses"][number];

const STRENGTHS: Array<[Strength, () => string]> = [
  ["gameplay", m.ai_strength_gameplay],
  ["combat", m.ai_strength_combat],
  ["story", m.ai_strength_story],
  ["characters", m.ai_strength_characters],
  ["atmosphere", m.ai_strength_atmosphere],
  ["world", m.ai_strength_world],
  ["music", m.ai_strength_music],
  ["visuals", m.ai_strength_visuals],
  ["side_content", m.ai_strength_side_content],
];
const WEAKNESSES: Array<[Weakness, () => string]> = [
  ["choices", m.ai_weakness_choices],
  ["bugs", m.ai_weakness_bugs],
  ["performance", m.ai_weakness_performance],
  ["pacing", m.ai_weakness_pacing],
  ["repetition", m.ai_weakness_repetition],
  ["difficulty", m.ai_weakness_difficulty],
  ["length", m.ai_weakness_length],
  ["none", m.ai_weakness_none],
];
const STEP_KEYS = ["rating", "strengths", "weaknesses", "note", "draft"] as const;
const STEPS = STEP_KEYS.length;

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-11 rounded-full border px-4 text-sm font-bold transition-colors",
        pressed
          ? "border-[#d8cf48] bg-[#d8cf48] text-[#0b0c10]"
          : "border-white/16 hover:bg-white/8",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Oyun sonrası röportaj: puan, akılda kalanlar, eksikler ve kullanıcının kendi cümlesi; sonra My games AI bir
 * inceleme taslağı yazar (kullanıcının önceki incelemelerinin üslubuyla). Taslak düzenlenebilir; yayınlamak
 * normal bir düzenlemedir (akışa düşer, geri alınabilir).
 */
export function InterviewDialog({
  entryId,
  onOpenChange,
}: {
  entryId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const entry = useQuery(entryQuery(entryId));
  const data = entry.data?.entry;
  const [step, setStep] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [strengths, setStrengths] = useState<Strength[]>([]);
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [published, setPublished] = useState<{ historyId: string | null } | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const failLogo = useCallback(() => setLogoFailed(true), []);
  const value =
    rating ?? (data?.rating !== null && data?.rating !== undefined ? data.rating / 10 : 8.5);

  const write = useMutation({
    mutationFn: () =>
      unwrap(
        api.ai["review-draft"].$post({
          json: { entryId, rating: value, strengths, weaknesses, note: note.trim() || undefined },
        }),
      ),
    onSuccess: (result) => {
      setDraft(result.draft);
      setStep(4);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const invalidate = async () => {
    for (const queryKey of [
      ["entry", entryId],
      ["library"],
      ["profile"],
      ["feed"],
      ["history"],
      ["game"],
      ["ai", "suggestions"],
    ]) {
      await queryClient.invalidateQueries({ queryKey });
    }
  };
  const publish = useMutation({
    mutationFn: async () => {
      await unwrap(
        api.library[":id"].$patch({
          param: { id: entryId },
          json: { rating: value, review: draft.trim() },
        }),
      );
      return latestHistoryId(entryId);
    },
    onSuccess: async (historyId) => {
      setPublished({ historyId });
      setEditing(false);
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const undo = useMutation({
    mutationFn: (historyId: string) => revertHistory(historyId),
    onSuccess: async () => {
      setPublished(null);
      await invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggle = <T extends string>(
    list: T[],
    item: T,
    set: (next: T[]) => void,
    exclusive?: T,
  ) => {
    if (list.includes(item)) set(list.filter((value) => value !== item));
    else if (exclusive && item === exclusive) set([item]);
    else set([...list.filter((value) => value !== exclusive), item]);
  };
  const bump = (delta: number) =>
    setRating(Math.round(Math.min(10, Math.max(0, value + delta)) * 10) / 10);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-w-none flex-col gap-0 overflow-hidden rounded-none border-white/10 bg-[#0b0c10] p-0 sm:h-[min(780px,94dvh)] sm:max-w-[420px] sm:rounded-[28px]">
        <DialogTitle className="sr-only">{m.ai_review_title()}</DialogTitle>
        <DialogDescription className="sr-only">{m.ai_review_intro()}</DialogDescription>
        <div className="relative h-[250px] shrink-0 overflow-hidden">
          {data?.game.heroUrl && (
            <img
              src={data.game.heroUrl}
              alt=""
              className="absolute inset-0 size-full object-cover object-[center_30%]"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent via-35% to-[#0b0c10]" />
          <div
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEPS}
            aria-valuenow={step + 1}
            aria-label={m.ai_review_step({ step: step + 1, total: STEPS })}
            className="absolute inset-x-0 top-5 flex justify-center gap-1.5"
          >
            {STEP_KEYS.map((key, index) => (
              <span
                key={key}
                className={`h-1.5 rounded-full transition-all ${index === step ? "w-6" : "w-2"} ${index <= step ? "bg-foreground" : "bg-white/25"}`}
              />
            ))}
          </div>
          <div className="absolute inset-x-5 bottom-3 flex items-end justify-between gap-3">
            <div className="grid min-w-0 gap-2">
              {data?.game.logoUrl && !logoFailed ? (
                <GameLogo
                  src={data.game.logoUrl}
                  alt={data.game.name}
                  onFail={failLogo}
                  className="max-h-16 max-w-[220px] object-contain object-left-bottom"
                />
              ) : (
                <span className="font-display truncate text-2xl font-semibold">
                  {data?.game.name}
                </span>
              )}
              {data?.playtimeMin ? (
                <span className="text-foreground/85 text-[13px] font-bold">
                  {m.ai_review_played({ hours: formatPlaytime(data.playtimeMin) })}
                </span>
              ) : null}
            </div>
            <span className="font-display shrink-0 -rotate-12 rounded-[10px] border-[3px] border-[#7ee2a8] bg-black/50 px-3 py-1 text-base font-semibold text-[#7ee2a8]">
              {m.ai_review_finished()}
            </span>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-4 pb-5">
          {step === 0 && (
            <div className="animate-rise grid gap-4">
              <div className="flex items-center gap-2.5">
                <Orb color={data?.game.accentColor} size={26} />
                <span className="text-foreground/74 text-[13px]">{m.ai_review_intro()}</span>
              </div>
              <h2 className="m-0 text-[22px] font-bold">{m.ai_review_q_rating()}</h2>
              <div className="flex items-center justify-between rounded-[22px] border border-white/8 bg-[#15161c] p-3.5">
                <button
                  type="button"
                  aria-label={m.ai_review_rating_down()}
                  onClick={() => bump(-0.1)}
                  className="flex size-14 items-center justify-center rounded-full border border-white/18 hover:bg-white/8"
                >
                  <MinusIcon className="size-5" strokeWidth={2.6} />
                </button>
                <span
                  aria-live="polite"
                  className="font-display text-6xl font-semibold tracking-tight"
                >
                  {formatRating(Math.round(value * 10))}
                </span>
                <button
                  type="button"
                  aria-label={m.ai_review_rating_up()}
                  onClick={() => bump(0.1)}
                  className="flex size-14 items-center justify-center rounded-full border border-white/18 hover:bg-white/8"
                >
                  <PlusIcon className="size-5" strokeWidth={2.6} />
                </button>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="animate-rise grid gap-3">
              <h2 className="m-0 text-[22px] font-bold">{m.ai_review_q_strengths()}</h2>
              <span className="text-foreground/62 text-[13px]">{m.ai_review_multi()}</span>
              <div className="flex flex-wrap gap-2">
                {STRENGTHS.map(([key, label]) => (
                  <Chip
                    key={key}
                    pressed={strengths.includes(key)}
                    onClick={() => toggle(strengths, key, setStrengths)}
                  >
                    {label()}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="animate-rise grid gap-3">
              <h2 className="m-0 text-[22px] font-bold">{m.ai_review_q_weaknesses()}</h2>
              <span className="text-foreground/62 text-[13px]">{m.ai_review_multi()}</span>
              <div className="flex flex-wrap gap-2">
                {WEAKNESSES.map(([key, label]) => (
                  <Chip
                    key={key}
                    pressed={weaknesses.includes(key)}
                    onClick={() => toggle(weaknesses, key, setWeaknesses, "none")}
                  >
                    {label()}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="animate-rise grid gap-3">
              <h2 className="m-0 text-[22px] font-bold">{m.ai_review_q_note()}</h2>
              <label className="grid gap-2">
                <span className="text-foreground/62 text-[13px]">{m.ai_review_note_hint()}</span>
                <input
                  value={note}
                  maxLength={300}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={m.ai_review_note_placeholder()}
                  className="placeholder:text-foreground/50 h-14 rounded-2xl border border-white/16 bg-[#15161c] px-4 text-[15px] outline-none focus:border-[#d8cf48]/70"
                />
              </label>
            </div>
          )}
          {step === 4 && (
            <div className="animate-rise grid gap-3">
              <article
                className={`grid gap-3 rounded-[22px] border bg-[#15161c] p-4 ${published ? "border-live/30" : "border-[#d8cf48]/35"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-foreground/66 flex items-center gap-2 text-xs">
                    <Orb color={data?.game.accentColor} size={20} />
                    <span className="text-foreground font-bold">{m.ai_review_draft()}</span>
                    {m.ai_review_draft_from()}
                  </span>
                  <span className="font-display text-2xl font-semibold">
                    {formatRating(Math.round(value * 10))}
                  </span>
                </div>
                {editing ? (
                  <label>
                    <span className="sr-only">{m.ai_review_draft()}</span>
                    <textarea
                      value={draft}
                      rows={7}
                      maxLength={20_000}
                      onChange={(event) => setDraft(event.target.value)}
                      className="w-full resize-none rounded-2xl border border-[#d8cf48]/50 bg-white/4 p-3 text-[15px] leading-relaxed outline-none"
                    />
                  </label>
                ) : (
                  <p className="m-0 text-base leading-relaxed text-pretty whitespace-pre-line">
                    {draft}
                  </p>
                )}
                <span className="text-foreground/60 text-xs leading-relaxed">
                  {m.ai_review_draft_note()}
                </span>
              </article>
              {published ? (
                <div className="animate-pop border-live/30 bg-live/10 flex items-center gap-2.5 rounded-2xl border py-2 pr-2 pl-3.5">
                  <CheckIcon className="text-live size-[18px]" strokeWidth={2.8} />
                  <span className="flex-1 text-sm font-bold">{m.ai_review_published()}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={undo.isPending || !published.historyId}
                    onClick={() => published.historyId && undo.mutate(published.historyId)}
                  >
                    <Undo2Icon />
                    {m.ai_card_undo()}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    className="h-12 flex-1"
                    disabled={!draft.trim() || publish.isPending}
                    onClick={() => publish.mutate()}
                  >
                    {m.ai_review_publish()}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-12 border border-white/18 px-5"
                    onClick={() => setEditing(!editing)}
                  >
                    {editing ? m.ai_review_edit_done() : m.ai_review_edit()}
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto flex gap-2 pt-5">
            {step < 4 ? (
              <>
                <Button
                  variant="ghost"
                  className="h-13 border border-white/18 px-6"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  {m.ai_review_back()}
                </Button>
                <Button
                  className="h-13 flex-1 text-[15px]"
                  disabled={write.isPending || !data}
                  onClick={() => (step === 3 ? write.mutate() : setStep(step + 1))}
                >
                  {write.isPending && <LoaderIcon className="animate-spin" />}
                  {step === 3
                    ? write.isPending
                      ? m.ai_review_writing()
                      : m.ai_review_write()
                    : m.ai_review_next()}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                className="h-12 flex-1 border border-white/14"
                onClick={() => {
                  setStep(0);
                  setPublished(null);
                  setEditing(false);
                }}
              >
                {m.ai_review_restart()}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
