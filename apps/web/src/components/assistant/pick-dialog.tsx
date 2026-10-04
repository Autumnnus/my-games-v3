import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { CheckIcon, ChevronRightIcon, LoaderIcon, Undo2Icon, XIcon } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { GameCover } from "@/components/game-cover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, unwrap } from "@/lib/api";
import { latestHistoryId, mentionsQuery, revertHistory } from "@/lib/assistant";
import { errorMessage, formatPlaytime, statusLabel } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { Pati } from "./mascot";

type Time = "short" | "mid" | "long";
type Mood = "relax" | "story" | "challenge" | "strategy";
type PickResult = Awaited<ReturnType<typeof requestPick>>;
type PickCard = PickResult["cards"][number];

const requestPick = (input: { time: Time; mood: Mood; with?: string }) =>
  unwrap(api.ai.pick.$post({ json: input }));

const THRESHOLD = 110;
/** Bu kadar gündür açılmayan oyunda "kaldığın yer" hatırlatması önerilir (kayıt sayfasındaki kartla aynı). */
const stale = (lastPlayedAt: string | null) =>
  !!lastPlayedAt && Date.now() - new Date(lastPlayedAt).getTime() > 14 * 24 * 60 * 60 * 1000;

function Choice({
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
          ? "bg-foreground text-background border-foreground"
          : "border-white/16 hover:bg-white/8",
      )}
    >
      {children}
    </button>
  );
}

/**
 * "Ne oynasam?": sohbet değil, üç soruluk kısa bir akış. Cevaplara göre kendi rafından üç kart gelir (her
 * birinde neden bu oyun); sağa kaydırmak/"Bunu oynayacağım" seçer, sola kaydırmak sıradakine geçer. Seçilen
 * oyun "Oynanacak" ya da "Ara verildi"deyse tek dokunuşla "Oynanıyor" yapılabilir (geri alınabilir).
 */
export function PickDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"ask" | "deck" | "picked">("ask");
  const [time, setTime] = useState<Time | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [partner, setPartner] = useState<{ username: string; name: string } | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<PickCard | null>(null);
  const [marked, setMarked] = useState<{ historyId: string | null } | null>(null);
  const [drag, setDrag] = useState({ dx: 0, active: false });
  const start = useRef(0);
  const people = useQuery({ ...mentionsQuery(""), enabled: open });

  const pick = useMutation({
    mutationFn: requestPick,
    onSuccess: () => {
      setIndex(0);
      setStep("deck");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const cards = pick.data?.cards ?? [];
  const current = cards[index];

  const refresh = async () => {
    for (const queryKey of [["library"], ["entry"], ["profile"], ["feed"], ["history"]]) {
      await queryClient.invalidateQueries({ queryKey });
    }
  };
  const markPlaying = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(api.library[":id"].$patch({ param: { id }, json: { status: "playing" } }));
      return latestHistoryId(id);
    },
    onSuccess: async (historyId) => {
      setMarked({ historyId });
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const undoMark = useMutation({
    mutationFn: (historyId: string) => revertHistory(historyId),
    onSuccess: async () => {
      setMarked(null);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function decide(take: boolean) {
    if (!current) return;
    setDrag({ dx: 0, active: false });
    if (take) {
      setPicked(current);
      setMarked(null);
      setStep("picked");
    } else setIndex((value) => value + 1);
  }

  function restart() {
    setStep("ask");
    setTime(null);
    setMood(null);
    setPartner(null);
    setPicked(null);
    setMarked(null);
    pick.reset();
  }

  const ambient = (step === "picked" ? picked : current)?.game.accentColor ?? "#3b5d8f";
  const labelOf = (value: Time) =>
    value === "short"
      ? m.ai_pick_time_short()
      : value === "mid"
        ? m.ai_pick_time_mid()
        : m.ai_pick_time_long();
  const moodLabel = (value: Mood) =>
    ({
      relax: m.ai_pick_mood_relax,
      story: m.ai_pick_mood_story,
      challenge: m.ai_pick_mood_challenge,
      strategy: m.ai_pick_mood_strategy,
    })[value]();

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    start.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ dx: 0, active: true });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.active) setDrag({ dx: event.clientX - start.current, active: true });
  };
  const onPointerUp = () => {
    if (!drag.active) return;
    if (drag.dx > THRESHOLD) decide(true);
    else if (drag.dx < -THRESHOLD) decide(false);
    else setDrag({ dx: 0, active: false });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) restart();
      }}
    >
      <DialogContent className="flex h-[100dvh] max-w-none flex-col gap-0 overflow-hidden rounded-none border-white/10 bg-[#0b0c10] p-0 sm:h-[min(780px,94dvh)] sm:max-w-[420px] sm:rounded-[28px]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-56 -left-36 h-[540px] w-[640px] rounded-full opacity-50 blur-[90px] transition-colors duration-1000"
          style={{ backgroundColor: ambient }}
        />
        <header className="relative flex h-16 shrink-0 items-center justify-center px-12">
          <DialogTitle className="font-display text-[17px] font-semibold">
            {m.ai_pick_title()}
          </DialogTitle>
          <DialogDescription className="sr-only">{m.ai_pick_intro_sub()}</DialogDescription>
        </header>

        {step === "ask" && (
          <div className="animate-rise relative flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pt-1 pb-5">
            <div className="flex items-center gap-3.5">
              <Pati size={64} mood={pick.isPending ? "working" : "idle"} glow={null} />
              <div className="grid gap-1">
                <span className="font-bold">{m.ai_pick_intro()}</span>
                <span className="text-foreground/72 text-[13px] leading-snug">
                  {m.ai_pick_intro_sub()}
                </span>
              </div>
            </div>
            <fieldset className="grid gap-2.5">
              <legend className="mb-2.5 text-[15px] font-bold">{m.ai_pick_q_time()}</legend>
              <div className="flex flex-wrap gap-2">
                {(["short", "mid", "long"] as const).map((value) => (
                  <Choice key={value} pressed={time === value} onClick={() => setTime(value)}>
                    {labelOf(value)}
                  </Choice>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2.5">
              <legend className="mb-2.5 text-[15px] font-bold">{m.ai_pick_q_mood()}</legend>
              <div className="flex flex-wrap gap-2">
                {(["relax", "story", "challenge", "strategy"] as const).map((value) => (
                  <Choice key={value} pressed={mood === value} onClick={() => setMood(value)}>
                    {moodLabel(value)}
                  </Choice>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2.5">
              <legend className="mb-2.5 text-[15px] font-bold">{m.ai_pick_q_with()}</legend>
              <div className="flex flex-wrap gap-2">
                <Choice pressed={!partner} onClick={() => setPartner(null)}>
                  {m.ai_pick_alone()}
                </Choice>
                {people.data?.people.slice(0, 3).map((person) => (
                  <Choice
                    key={person.username}
                    pressed={partner?.username === person.username}
                    onClick={() => setPartner({ username: person.username, name: person.name })}
                  >
                    {person.name}
                  </Choice>
                ))}
              </div>
            </fieldset>
            <div className="mt-auto grid gap-2 pt-2">
              <Button
                size="lg"
                className="h-14 text-base"
                disabled={!time || !mood || pick.isPending}
                onClick={() => time && mood && pick.mutate({ time, mood, with: partner?.username })}
              >
                {pick.isPending ? <LoaderIcon className="animate-spin" /> : null}
                {pick.isPending ? m.ai_pick_loading() : m.ai_pick_go()}
              </Button>
            </div>
          </div>
        )}

        {step === "deck" && (
          <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-5">
            <div className="flex items-center justify-between pb-3 text-[13px]">
              <span className="text-foreground/75">
                {[time && labelOf(time), mood && moodLabel(mood), partner?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button type="button" onClick={() => setStep("ask")} className="font-bold underline">
                {m.ai_pick_change()}
              </button>
            </div>
            {cards.length === 0 || !current ? (
              <div className="grid flex-1 content-center justify-items-center gap-3.5 rounded-3xl border border-dashed border-white/18 p-6 text-center">
                <span className="font-display text-xl font-semibold">
                  {cards.length ? m.ai_pick_none() : m.ai_pick_title()}
                </span>
                <span className="text-foreground/72 text-sm leading-relaxed">
                  {cards.length ? m.ai_pick_none_sub() : m.ai_pick_empty()}
                </span>
                <Button variant="glass" onClick={() => setStep("ask")}>
                  {m.ai_pick_retry()}
                </Button>
              </div>
            ) : (
              <>
                <div className="relative min-h-0 flex-1">
                  {cards.map((card, position) => {
                    const offset = position - index;
                    if (offset < 0 || offset > 2) return null;
                    const top = offset === 0;
                    const dx = top ? drag.dx : 0;
                    return (
                      <div
                        key={card.entryId}
                        onPointerDown={top ? onPointerDown : undefined}
                        onPointerMove={top ? onPointerMove : undefined}
                        onPointerUp={top ? onPointerUp : undefined}
                        onPointerCancel={top ? onPointerUp : undefined}
                        className="absolute inset-0 touch-none overflow-hidden rounded-[26px] border border-white/10 shadow-[0_30px_60px_-24px_rgba(0,0,0,0.85)] select-none"
                        style={{
                          zIndex: 10 - offset,
                          backgroundColor: card.game.accentColor ?? "#1b2230",
                          transform: top
                            ? `translateX(${dx}px) rotate(${dx / 18}deg)`
                            : `translateY(${offset * 16}px) scale(${1 - offset * 0.05})`,
                          transition:
                            drag.active && top ? "none" : "transform .45s cubic-bezier(.2,.8,.2,1)",
                          cursor: top ? (drag.active ? "grabbing" : "grab") : "default",
                        }}
                      >
                        <GameCover
                          url={card.game.coverUrl}
                          name={card.game.name}
                          color={card.game.accentColor}
                          className="pointer-events-none absolute inset-0 aspect-auto h-full rounded-none ring-0"
                        />
                        <span className="absolute inset-0 bg-gradient-to-b from-transparent via-black/70 via-60% to-black/95" />
                        <span className="glass absolute top-3.5 left-3.5 flex h-[30px] items-center gap-1.5 rounded-full px-3 text-xs font-bold">
                          <span className="bg-live size-[7px] rounded-full" />
                          {statusLabel(card.status)}
                        </span>
                        <span className="glass absolute top-3.5 right-3.5 flex h-[30px] items-center rounded-full px-3 text-xs font-bold">
                          {m.ai_pick_index({ index: position + 1, total: cards.length })}
                        </span>
                        <div className="absolute inset-x-5 bottom-5 grid gap-2.5">
                          <span className="font-display text-2xl leading-tight font-semibold">
                            {card.game.name}
                          </span>
                          <span className="text-foreground/78 text-[13px]">
                            {[
                              card.hoursPlayed
                                ? m.ai_pick_played({ hours: formatPlaytime(card.hoursPlayed * 60) })
                                : null,
                              card.hoursToBeat
                                ? m.ai_pick_ttb({ hours: formatPlaytime(card.hoursToBeat * 60) })
                                : null,
                              ...card.genres.slice(0, 2),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <div className="grid gap-1 rounded-2xl border border-white/10 bg-white/8 px-3.5 py-3 backdrop-blur">
                            <span className="text-foreground/62 text-[11px] font-bold tracking-[0.16em]">
                              {m.ai_pick_why()}
                            </span>
                            <span className="text-sm leading-relaxed">{card.reason}</span>
                          </div>
                        </div>
                        {top && (
                          <>
                            <span
                              className="font-display absolute top-16 left-4 -rotate-12 rounded-[10px] border-[3px] border-[#3ecf8e] bg-black/50 px-3 py-1 text-lg font-semibold text-[#3ecf8e]"
                              style={{ opacity: Math.max(0, Math.min(1, dx / THRESHOLD)) }}
                            >
                              {m.ai_pick_take()}
                            </span>
                            <span
                              className="font-display absolute top-16 right-4 rotate-12 rounded-[10px] border-[3px] border-[#f0714f] bg-black/50 px-3 py-1 text-lg font-semibold text-[#f0714f]"
                              style={{ opacity: Math.max(0, Math.min(1, -dx / THRESHOLD)) }}
                            >
                              {m.ai_pick_pass()}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-5 pt-7">
                  <button
                    type="button"
                    aria-label={m.ai_pick_pass()}
                    onClick={() => decide(false)}
                    className="glass flex size-16 items-center justify-center rounded-full border-[1.5px] border-[#f0714f]/55 text-[#f0714f] transition-transform hover:scale-105 active:scale-95"
                  >
                    <XIcon className="size-6" strokeWidth={2.6} />
                  </button>
                  <Button size="lg" className="h-16 px-7 text-[15px]" onClick={() => decide(true)}>
                    <CheckIcon className="size-5" strokeWidth={2.8} />
                    {m.ai_pick_take()}
                  </Button>
                </div>
                <p className="text-foreground/60 m-0 pt-3 text-center text-xs">
                  {m.ai_pick_drag_hint()}
                </p>
              </>
            )}
          </div>
        )}

        {step === "picked" && picked && (
          <div className="animate-rise relative flex min-h-0 flex-1 flex-col gap-5 px-5 pt-2 pb-5">
            <div className="flex items-end gap-4">
              <GameCover
                url={picked.game.coverUrl}
                name={picked.game.name}
                color={picked.game.accentColor}
                className="w-28 shrink-0 rounded-2xl shadow-[0_24px_50px_-16px_rgba(0,0,0,0.8)]"
              />
              <div className="grid gap-1.5 pb-1.5">
                <span className="text-foreground/70 text-xs font-bold tracking-[0.16em]">
                  {m.ai_pick_tonight()}
                </span>
                <Link
                  to="/e/$id"
                  params={{ id: picked.entryId }}
                  onClick={() => onOpenChange(false)}
                  className="font-display text-[22px] leading-tight font-semibold hover:underline"
                >
                  {picked.game.name}
                </Link>
                <span className="text-foreground/75 text-[13px]">{m.ai_pick_enjoy()}</span>
              </div>
            </div>
            {picked.status !== "playing" && (
              <article className="grid gap-3 rounded-[20px] border border-[#f2c77a]/35 bg-[#16171d] p-3.5">
                <div className="text-foreground/66 flex items-center gap-2 text-xs">
                  <Pati size={20} still />
                  <span className="text-foreground font-bold">{m.ai_name()}</span>
                  <span className="rounded-full bg-[#f2c77a]/16 px-2 py-0.5 text-[11px] font-bold text-[#f2c77a]">
                    {m.ai_mode_act()}
                  </span>
                </div>
                {marked ? (
                  <div className="flex items-center gap-2.5">
                    <span className="flex-1 text-sm">
                      {m.ai_pick_marked({ game: picked.game.name })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={undoMark.isPending || !marked.historyId}
                      onClick={() => marked.historyId && undoMark.mutate(marked.historyId)}
                    >
                      <Undo2Icon />
                      {m.ai_card_undo()}
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-[15px] leading-snug">{m.ai_pick_mark_playing()}</span>
                    <div className="flex gap-2">
                      <Button
                        className="h-11 flex-1"
                        disabled={markPlaying.isPending}
                        onClick={() => markPlaying.mutate(picked.entryId)}
                      >
                        {m.ai_proposal_approve()}
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-11 border border-white/16"
                        onClick={() => onOpenChange(false)}
                      >
                        {m.ai_pick_not_now()}
                      </Button>
                    </div>
                  </>
                )}
              </article>
            )}
            {picked.status !== "backlog" && (
              <Link
                to="/e/$id"
                params={{ id: picked.entryId }}
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-3 rounded-[20px] border border-white/10 bg-[#16171d] p-3.5 hover:bg-white/5"
              >
                <Pati size={32} still />
                <span className="grid flex-1 gap-0.5">
                  <span className="text-sm font-bold">
                    {stale(picked.lastPlayedAt) ? m.ai_pick_recap() : m.salon_open_entry()}
                  </span>
                  <span className="text-foreground/65 text-[13px]">
                    {statusLabel(picked.status)}
                  </span>
                </span>
                <ChevronRightIcon className="size-4" />
              </Link>
            )}
            <Button
              variant="ghost"
              className="mt-auto h-12 border border-white/16"
              onClick={restart}
            >
              {m.ai_pick_restart()}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
