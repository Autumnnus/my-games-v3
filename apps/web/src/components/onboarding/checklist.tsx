import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useAddGame } from "@/components/add-game";
import { useOptionalAssistant } from "@/components/assistant/provider";
import type { OnboardingStep } from "@/lib/onboarding";
import { m } from "@/paraglide/messages";
import { useOnboarding } from "./provider";

const copy: Record<OnboardingStep, { title: () => string; sub: () => string }> = {
  platform: { title: m.onboarding_step_platform, sub: m.onboarding_step_platform_sub },
  inbox: { title: m.onboarding_step_inbox, sub: m.onboarding_step_inbox_sub },
  game: { title: m.onboarding_step_game, sub: m.onboarding_step_game_sub },
  ai: { title: m.onboarding_step_ai, sub: m.onboarding_step_ai_sub },
  profile: { title: m.onboarding_step_profile, sub: m.onboarding_step_profile_sub },
};

/**
 * Yeni üyenin başlangıç listesi (ana sayfada). Adımlar veriden kendiliğinden tamamlanır; liste gizlenebilir,
 * hepsi bitince kendiliğinden kaybolur.
 */
export function OnboardingChecklist({ className }: { className?: string }) {
  const onboarding = useOnboarding();
  const navigate = useNavigate();
  const addGame = useAddGame();
  const assistant = useOptionalAssistant();
  const state = onboarding.state;
  if (!state?.welcomed || state.dismissed || state.steps.length === 0) return null;

  const done = state.steps.filter((step) => step.done).length;
  const total = state.steps.length;
  // Sıradaki adım öne çıkar; diğerleri sakin kalır.
  const next = state.steps.find((step) => !step.done)?.id;

  function run(step: OnboardingStep) {
    switch (step) {
      case "platform":
        return onboarding.openPlatforms();
      case "inbox":
        return navigate({ to: "/inbox" });
      case "game":
        return addGame.open();
      case "ai":
        return assistant?.setOpen(true);
      case "profile":
        return navigate({ to: "/settings", search: { focus: "profile" } });
    }
  }

  return (
    <section
      aria-label={m.onboarding_checklist_title()}
      className={cn("bg-card animate-rise grid gap-3.5 rounded-[22px] border p-[18px]", className)}
    >
      <div className="flex items-center gap-3">
        <h2 className="m-0 flex-1 text-[15px] font-bold">{m.onboarding_checklist_title()}</h2>
        <span className="text-foreground/70 text-sm font-semibold tabular-nums">
          {m.onboarding_checklist_progress({ done, total })}
        </span>
        <button
          type="button"
          aria-label={m.onboarding_hide()}
          title={m.onboarding_hide()}
          onClick={onboarding.dismiss}
          className="text-foreground/60 hover:text-foreground -mr-1.5 flex size-8 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className="h-full rounded-full bg-emerald-400 transition-[width] duration-500"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <ol className="m-0 grid list-none gap-1 p-0">
        {state.steps.map((step) => (
          <li key={step.id}>
            <button
              type="button"
              disabled={step.done}
              onClick={() => void run(step.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors",
                !step.done && "hover:bg-white/6",
                step.id === next && "bg-white/5",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  step.done
                    ? "border-emerald-400 bg-emerald-400 text-[#0b0c10]"
                    : "border-white/25",
                )}
              >
                {step.done && <CheckIcon className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="grid min-w-0 flex-1">
                <span
                  className={cn(
                    "text-sm font-bold",
                    step.done && "text-foreground/55 line-through decoration-white/30",
                  )}
                >
                  {copy[step.id].title()}
                </span>
                {!step.done && (
                  <span className="text-foreground/62 text-xs">{copy[step.id].sub()}</span>
                )}
              </span>
              {!step.done && (
                <ChevronRightIcon className="text-foreground/40 group-hover:text-foreground size-4 shrink-0" />
              )}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
