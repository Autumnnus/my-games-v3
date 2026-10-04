import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { suggestionsQuery } from "@/lib/assistant";
import { m } from "@/paraglide/messages";
import { LivePati } from "./mascot";
import { useOptionalAssistant } from "./provider";

/**
 * Başlıktaki Pati düğmesi: masaüstünde adıyla ve kısayoluyla, telefonda yalnızca Pati. Panel kapalıyken de
 * sohbetin hâlini gösterir (çalışıyor, onay bekliyor, hata).
 */
export function AssistantButton({ compact }: { compact?: boolean }) {
  const assistant = useOptionalAssistant();
  // Işığın rengi sayfanın oyunundan; sorgu yalnızca panel açıkken çalışır (kapalıyken önbellekte varsa o).
  const suggestions = useQuery({
    ...suggestionsQuery(assistant?.page),
    enabled: !!assistant?.enabled && !!assistant.open,
  });
  if (!assistant?.enabled) return null;
  const glow = suggestions.data?.pageGame?.accentColor ?? null;
  const pressed = assistant.open || assistant.onPage;

  if (compact) {
    return (
      <button
        type="button"
        aria-label={m.ai_open()}
        aria-pressed={pressed}
        onClick={assistant.toggle}
        className="glass pati-host flex size-11 items-center justify-center rounded-full border border-white/12 md:hidden"
      >
        <LivePati size={27} glow={glow} />
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={assistant.toggle}
      className={cn(
        "glass pati-host hidden h-11 shrink-0 items-center gap-2.5 rounded-full border px-2 text-sm font-bold whitespace-nowrap transition-colors md:inline-flex @min-[1200px]/header:pr-3",
        pressed ? "border-white/30 bg-white/16" : "border-white/12 hover:bg-white/12",
      )}
    >
      <LivePati size={28} glow={glow} />
      {/* Başlık dar kalınca (asistan paneli sabitlenince sayfa daralır) yalnızca Pati kalır. Ekran değil
          başlığın kendi genişliği ölçülür (`@container/header`). */}
      <span className="hidden @min-[1200px]/header:inline">{m.ai_name()}</span>
      <span className="sr-only @min-[1200px]/header:hidden">{m.ai_name()}</span>
      <kbd className="text-foreground/80 hidden rounded-md bg-white/12 px-1.5 py-0.5 text-[11px] font-semibold @min-[1200px]/header:inline">
        ⌘J
      </kbd>
    </button>
  );
}
