import { useEffect, useRef, useState } from "react";
import { m } from "@/paraglide/messages";

/**
 * Değeri değişince yalnızca değişen karakterleri döndürür (senkrondan gelen süre "rakam rakam" güncellenir).
 * İlk gösterimde hareket yok; ekran okuyucu yalnızca son değeri duyar.
 */
export function RollingText({ value, className }: { value: string; className?: string }) {
  const previous = useRef(value);
  const [state, setState] = useState({ current: value, old: value, version: 0 });

  useEffect(() => {
    if (previous.current === value) return;
    setState((last) => ({ current: value, old: previous.current, version: last.version + 1 }));
    previous.current = value;
  }, [value]);

  const { current, old, version } = state;
  const oldChars = [...old];
  // Her karakter yerine göre anahtarlanır; değişen karakterin anahtarı sürümle yenilenir ki animasyon yeniden oynasın.
  const cells = [...current].map((char, index) => {
    const was = oldChars[index];
    const changed = version > 0 && was !== char;
    return { char, was, changed, id: `${index}-${changed ? version : 0}` };
  });
  const show = (char: string) => (char === " " ? "\u00a0" : char);
  return (
    <span className={className}>
      <span className="sr-only">{current}</span>
      <span aria-hidden className="inline-flex">
        {cells.map((cell) => (
          <span key={cell.id} className="relative inline-block overflow-hidden">
            {cell.changed && cell.was !== undefined && (
              <span className="animate-roll-out absolute inset-0">{show(cell.was)}</span>
            )}
            <span className={cell.changed ? "animate-roll-in inline-block" : "inline-block"}>
              {show(cell.char)}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Oyun bitince kaydın üstüne vurulan damga. `trigger` her arttığında bir kez oynar ve kendiliğinden kaybolur.
 */
export function CompletedStamp({ trigger }: { trigger: number }) {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    setVisible(trigger);
    const timer = setTimeout(() => setVisible(0), 2000);
    return () => clearTimeout(timer);
  }, [trigger]);
  if (!visible) return null;
  return (
    <div
      key={visible}
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
    >
      <span className="animate-shock border-destructive absolute size-64 rounded-full border-4" />
      <span className="animate-stamp font-display text-destructive border-destructive rounded-2xl border-[6px] bg-black/55 px-8 py-3 text-5xl font-bold tracking-wide backdrop-blur-sm sm:text-7xl">
        {m.stamp_completed()}
      </span>
    </div>
  );
}
