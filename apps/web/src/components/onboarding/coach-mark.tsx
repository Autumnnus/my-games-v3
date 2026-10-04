import { Popover as PopoverPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { OnboardingTip } from "@/lib/onboarding";
import { m } from "@/paraglide/messages";
import { useOnboarding } from "./provider";

const copy: Record<OnboardingTip, { title: () => string; body: () => string }> = {
  inbox_deck: { title: m.onboarding_tip_inbox_deck_title, body: m.onboarding_tip_inbox_deck_body },
  ai_modes: { title: m.onboarding_tip_ai_modes_title, body: m.onboarding_tip_ai_modes_body },
  spotlight: { title: m.onboarding_tip_spotlight_title, body: m.onboarding_tip_spotlight_body },
  library_lists: {
    title: m.onboarding_tip_library_lists_title,
    body: m.onboarding_tip_library_lists_body,
  },
};

type Measurable = { getBoundingClientRect: () => DOMRect };

/** Öğe görünür ve ekranın içinde mi (gizli/kaydırılmış öğeye balon bağlanmaz). */
function visible(element: Element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

/**
 * Sayfaya ilk gelişte bir kez gösterilen ipucu balonu. `data-tour="<anchor>"` işaretli öğeye bağlanır; öğenin
 * bileşenine dokunmak gerekmez. Yalnızca etkin rehberi olan yeni üyelerde, oturum başına en fazla bir ipucu
 * çıkar ve gösterildiği anda "görüldü" yazılır (kapatılmasa da bir daha gelmez).
 */
export function CoachMark({
  tip,
  anchor,
  when = true,
  side = "bottom",
  align = "center",
}: {
  tip: OnboardingTip;
  anchor: string;
  /** Ek koşul (ör. kütüphanede oyun var). */
  when?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const onboarding = useOnboarding();
  const [open, setOpen] = useState(false);
  const target = useRef<Measurable | null>(null);
  const eligible =
    when &&
    !!onboarding.state?.welcomed &&
    !onboarding.state.dismissed &&
    !onboarding.state.seenTips.includes(tip);
  const { claimTip, markTip } = onboarding;

  useEffect(() => {
    if (!eligible || open) return;
    // Sayfa yerleşsin (geçişler, veri) diye kısa bir bekleme.
    const timer = window.setTimeout(() => {
      const element = document.querySelector(`[data-tour="${anchor}"]`);
      if (!element || !visible(element)) return;
      if (!claimTip(tip)) return;
      target.current = element;
      setOpen(true);
      markTip(tip);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [eligible, open, anchor, tip, claimTip, markTip]);

  if (!open) return null;
  return (
    <Popover open onOpenChange={setOpen} modal={false}>
      <PopoverAnchor virtualRef={target as React.RefObject<Measurable>} />
      <PopoverContent
        side={side}
        align={align}
        sideOffset={10}
        collisionPadding={16}
        // Odak sayfada kalsın: ipucu yazmayı ya da kaydırmayı bölmesin.
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="z-60 grid w-[min(300px,calc(100vw-2rem))] gap-2 border-white/15 bg-[#191b24] p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
      >
        <PopoverPrimitive.Arrow className="fill-[#191b24]" width={14} height={7} />
        <p className="m-0 text-[15px] font-bold">{copy[tip].title()}</p>
        <p className="text-foreground/75 m-0 text-sm leading-relaxed">{copy[tip].body()}</p>
        <Button size="sm" className="mt-1 justify-self-end" onClick={() => setOpen(false)}>
          {m.onboarding_tip_got_it()}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
