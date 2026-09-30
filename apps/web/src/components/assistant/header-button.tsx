import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { suggestionsQuery } from "@/lib/assistant";
import { m } from "@/paraglide/messages";
import { Orb } from "./orb";
import { useOptionalAssistant } from "./provider";

/** Başlıktaki My games AI düğmesi: masaüstünde adıyla ve kısayoluyla, telefonda yalnızca küre. */
export function AssistantButton({ compact }: { compact?: boolean }) {
  const assistant = useOptionalAssistant();
  const suggestions = useQuery({
    ...suggestionsQuery(assistant?.page),
    enabled: !!assistant?.enabled && !!assistant.open,
  });
  if (!assistant?.enabled) return null;
  const accent = suggestions.data?.pageGame?.accentColor;
  const pressed = assistant.open || assistant.onPage;

  if (compact) {
    return (
      <button
        type="button"
        aria-label={m.ai_open()}
        aria-pressed={pressed}
        onClick={assistant.toggle}
        className="glass flex size-11 items-center justify-center rounded-full border border-white/12 md:hidden"
      >
        <Orb color={accent} size={24} />
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={assistant.toggle}
      className={cn(
        "glass hidden h-11 shrink-0 items-center gap-2.5 rounded-full border px-2 text-sm font-bold whitespace-nowrap transition-colors md:inline-flex @min-[1200px]/header:pr-3",
        pressed ? "border-white/30 bg-white/16" : "border-white/12 hover:bg-white/12",
      )}
    >
      <Orb color={accent} size={26} />
      {/* Başlık dar kalınca (asistan paneli sabitlenince sayfa daralır) yalnızca küre kalır. Ekran değil
          başlığın kendi genişliği ölçülür (`@container/header`). */}
      <span className="hidden @min-[1200px]/header:inline">{m.ai_name()}</span>
      <span className="sr-only @min-[1200px]/header:hidden">{m.ai_name()}</span>
      <kbd className="text-foreground/80 hidden rounded-md bg-white/12 px-1.5 py-0.5 text-[11px] font-semibold @min-[1200px]/header:inline">
        ⌘J
      </kbd>
    </button>
  );
}
