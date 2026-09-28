import { gameCoverUrl } from "@my-games/shared";
import { cn } from "cn";
import { CheckIcon, ClockIcon, XIcon } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import {
  ProposalDetails,
  platformName,
  proposalKindLabel,
  sourceLabels,
} from "@/components/proposal-card";
import { Stage } from "@/components/stage";
import { RelativeTime } from "@/components/time";
import { Button } from "@/components/ui/button";
import type { Proposal } from "@/lib/queries";
import { m } from "@/paraglide/messages";

type Resolve = (
  proposal: Proposal,
  action: "approve" | "reject",
  options?: { choice?: string; ignore?: boolean },
) => Promise<unknown>;

/** Bu kadar piksel sürüklenince kart karar verilmiş sayılır. */
const THRESHOLD = 110;
/** Kartın ekrandan çıkış süresi (CSS geçişiyle aynı). */
const EXIT_MS = 420;

type Op = "update" | "create" | "screenshots" | "match" | "conflict";
const opOf = (proposal: Proposal) => (proposal.payload as { op: Op }).op;
/** Eşleşme ve süre çakışmasında karar bir seçim ister; sağa kaydırmak tek başına onay olamaz. */
const needsChoice = (proposal: Proposal) => {
  const op = opOf(proposal);
  return op === "match" || op === "conflict";
};

/**
 * Onay kutusunun deste görünümü: en üstteki öneri sağa sürüklenince onaylanır, sola sürüklenince
 * reddedilir. Aynı kararlar düğmelerle de verilir (klavye ve ekran okuyucu için). "Sonra" kartı destenin
 * sonuna atar. Karar anında kart uçar; sunucu hata verirse kart desteye geri döner.
 */
export function ProposalDeck({
  proposals,
  onResolve,
}: {
  proposals: Proposal[];
  onResolve: Resolve;
}) {
  const [order, setOrder] = useState<string[]>(() => proposals.map((item) => item.id));
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [leaving, setLeaving] = useState<{ id: string; dir: "left" | "right" } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; active: boolean }>({ dx: 0, active: false });
  const start = useRef(0);

  // Sunucudan yeni öneri gelirse sıranın sonuna eklenir; çözülenler zaten listeden düşer.
  useEffect(() => {
    setOrder((previous) => {
      const ids = new Set(proposals.map((item) => item.id));
      const kept = previous.filter((id) => ids.has(id));
      const added = proposals.map((item) => item.id).filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [proposals]);

  const byId = new Map(proposals.map((item) => [item.id, item]));
  const visible = order.filter((id) => !done.has(id) && byId.has(id));
  const top = visible[0] ? byId.get(visible[0]) : undefined;

  const decide = (dir: "left" | "right", options?: { choice?: string; ignore?: boolean }) => {
    if (!top || leaving) return;
    if (dir === "right" && needsChoice(top) && !options?.choice) {
      setDrag({ dx: 0, active: false });
      return;
    }
    const proposal = top;
    setLeaving({ id: proposal.id, dir });
    setDrag({ dx: 0, active: false });
    const hide = setTimeout(() => {
      setDone((previous) => new Set(previous).add(proposal.id));
      setLeaving(null);
    }, EXIT_MS);
    onResolve(proposal, dir === "right" ? "approve" : "reject", options).catch(() => {
      clearTimeout(hide);
      setLeaving(null);
      setDone((previous) => {
        const next = new Set(previous);
        next.delete(proposal.id);
        return next;
      });
    });
  };

  const skip = () => {
    if (!top || leaving) return;
    setOrder((previous) => [...previous.filter((id) => id !== top.id), top.id]);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (leaving || (event.target as HTMLElement).closest("button, a, input")) return;
    start.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ dx: 0, active: true });
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (drag.active) setDrag({ dx: event.clientX - start.current, active: true });
  };
  const onPointerUp = () => {
    if (!drag.active) return;
    if (drag.dx > THRESHOLD) decide("right");
    else if (drag.dx < -THRESHOLD) decide("left");
    else setDrag({ dx: 0, active: false });
  };

  if (!top) {
    return (
      <div className="animate-rise mx-auto grid w-full max-w-md justify-items-center gap-4 rounded-[26px] border border-dashed border-white/15 px-6 py-16 text-center">
        <span className="bg-live/15 text-live flex size-16 items-center justify-center rounded-full">
          <CheckIcon className="size-8" strokeWidth={2.4} />
        </span>
        <h2 className="font-display text-2xl font-semibold">{m.inbox_deck_done()}</h2>
        <p className="text-foreground/75">{m.inbox_empty()}</p>
      </div>
    );
  }

  const topOp = opOf(top);
  const stack = visible.slice(0, 3);

  return (
    <div className="grid justify-items-center gap-6">
      <Stage
        items={stack.flatMap((id) => {
          const item = byId.get(id);
          return item?.game
            ? [
                {
                  key: item.id,
                  hero: item.game.heroUrl,
                  cover: gameCoverUrl(item.game, "cover_big"),
                  color: item.game.accentColor,
                },
              ]
            : [];
        })}
        className="h-[620px] opacity-70"
      />
      <p className="text-foreground/70 text-sm">{m.inbox_remaining({ count: visible.length })}</p>

      <div className="grid w-full max-w-[440px] [grid-template-areas:'stack'] *:[grid-area:stack]">
        {[...stack].reverse().map((id) => {
          const proposal = byId.get(id);
          if (!proposal) return null;
          const position = stack.indexOf(id);
          const isTop = position === 0;
          const exit = leaving?.id === id ? leaving.dir : null;
          const dx = isTop && !exit ? drag.dx : 0;
          const transform = exit
            ? `translateX(${exit === "right" ? 640 : -640}px) rotate(${exit === "right" ? 24 : -24}deg)`
            : isTop
              ? `translateX(${dx}px) rotate(${dx / 18}deg)`
              : `translateY(${position * 18}px) scale(${1 - position * 0.05})`;
          const approveOpacity = exit === "right" ? 1 : Math.max(0, Math.min(1, dx / THRESHOLD));
          const rejectOpacity = exit === "left" ? 1 : Math.max(0, Math.min(1, -dx / THRESHOLD));
          return (
            <article
              key={id}
              aria-hidden={!isTop}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? onPointerUp : undefined}
              className={cn(
                "bg-card relative self-start overflow-hidden rounded-[24px] border shadow-[0_30px_60px_-24px_rgba(0,0,0,0.85)] select-none",
                isTop ? "cursor-grab touch-pan-y active:cursor-grabbing" : "pointer-events-none",
                drag.active && isTop
                  ? "transition-none"
                  : "transition-[transform,opacity] duration-[420ms] ease-(--ease-salon)",
              )}
              style={{ transform, opacity: exit ? 0 : position > 2 ? 0 : 1 }}
            >
              <DeckCardHead proposal={proposal} />
              <div className="grid gap-3 p-5">
                <ProposalDetails
                  proposal={proposal}
                  onResolve={(action, options) =>
                    decide(action === "approve" ? "right" : "left", options)
                  }
                />
                <RelativeTime
                  value={proposal.createdAt}
                  className="text-muted-foreground text-xs"
                />
              </div>
              <span
                aria-hidden
                className="font-display text-live border-live absolute top-16 left-5 -rotate-12 rounded-xl border-[3px] bg-black/50 px-3 py-1 text-xl font-semibold"
                style={{ opacity: approveOpacity }}
              >
                {m.stamp_approve()}
              </span>
              <span
                aria-hidden
                className="font-display text-destructive border-destructive absolute top-16 right-5 rotate-12 rounded-xl border-[3px] bg-black/50 px-3 py-1 text-xl font-semibold"
                style={{ opacity: rejectOpacity }}
              >
                {m.stamp_reject()}
              </span>
            </article>
          );
        })}
      </div>

      <div className="flex items-center gap-5 pt-6">
        <Button
          variant="glass"
          aria-label={topOp === "match" ? m.proposal_match_none() : m.inbox_reject()}
          className="text-destructive size-16 border-[1.5px] border-[rgb(240_113_79/55%)]"
          disabled={!!leaving}
          onClick={() => decide("left")}
        >
          <XIcon className="size-6" strokeWidth={2.6} />
        </Button>
        <Button
          variant="glass"
          aria-label={m.inbox_skip()}
          className="size-13"
          disabled={!!leaving || visible.length < 2}
          onClick={skip}
        >
          <ClockIcon className="size-5" />
        </Button>
        {topOp === "conflict" ? (
          <div className="flex gap-2">
            <Button
              size="lg"
              disabled={!!leaving}
              onClick={() => decide("right", { choice: "use_platform" })}
            >
              {m.proposal_conflict_use_platform({
                platform: platformName((top.payload as { provider?: string }).provider),
              })}
            </Button>
            <Button
              size="lg"
              variant="glass"
              disabled={!!leaving}
              onClick={() => decide("right", { choice: "keep_both" })}
            >
              {m.proposal_conflict_keep_both()}
            </Button>
          </div>
        ) : topOp === "match" ? null : (
          <Button
            aria-label={m.inbox_approve()}
            className="size-[72px] shadow-[0_16px_40px_-12px_rgba(244,245,247,0.35)]"
            disabled={!!leaving}
            onClick={() => decide("right")}
          >
            <CheckIcon className="size-7" strokeWidth={2.8} />
          </Button>
        )}
      </div>
      {topOp === "create" && (
        <Button
          variant="link"
          className="text-foreground/70 -mt-3"
          disabled={!!leaving}
          onClick={() => decide("left", { ignore: true })}
        >
          {m.inbox_never()}
        </Button>
      )}
      <p className="text-foreground/60 hidden text-xs sm:block">{m.inbox_swipe_hint()}</p>
    </div>
  );
}

function DeckCardHead({ proposal }: { proposal: Proposal }) {
  const game = proposal.game;
  const image = game?.heroUrl ?? (game ? gameCoverUrl(game, "cover_big") : null);
  return (
    <div
      className="relative h-40 overflow-hidden"
      style={{ backgroundColor: game?.accentColor ?? "#1c1d24" }}
    >
      {image && (
        <img
          src={image}
          alt=""
          draggable={false}
          className={cn(
            "absolute inset-0 size-full object-cover",
            !game?.heroUrl && "scale-125 blur-2xl",
          )}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/75" />
      <div className="absolute top-3.5 left-3.5 flex gap-1.5">
        <span className="glass flex h-7 items-center rounded-full px-2.5 text-[11px] font-bold tracking-[0.12em] uppercase">
          {(sourceLabels[proposal.source] ?? m.proposal_source_system)()}
        </span>
        <span className="glass flex h-7 items-center rounded-full px-2.5 text-xs font-semibold">
          {proposalKindLabel(proposal.source, proposal.kind)}
        </span>
      </div>
      {game && (
        <h3 className="font-display absolute right-5 bottom-4 left-5 text-xl leading-tight font-semibold">
          {game.name}
        </h3>
      )}
    </div>
  );
}
