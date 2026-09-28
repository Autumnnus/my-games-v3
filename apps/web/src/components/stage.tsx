import { cn } from "cn";
import { useEffect, useState } from "react";

/** Kapak rengi yoksa kullanılan nötr ortam rengi. */
export const DEFAULT_ACCENT = "#2b4f7e";

export type StageItem = {
  key: string;
  /** Geniş sahne görseli (Steam hero). Yoksa kapak bulanıklaştırılarak kullanılır. */
  hero?: string | null;
  cover?: string | null;
  color?: string | null;
  /** `object-position` (hero'nun odak noktası). */
  position?: string;
};

/**
 * Sayfanın arkasındaki sahne: oyunun geniş görseli, kapaktan gelen ortam rengi ve okunabilirlik için
 * karartma. Uygulama kabuğunun (relative, isolate) en üstüne yerleşir; içerik üstünde akar. Birden fazla öğe
 * verilirse aktif olan yumuşakça öne geçer; görseller yalnızca gösterildiklerinde yüklenir.
 */
export function Stage({
  items,
  active = 0,
  className,
}: {
  items: StageItem[];
  active?: number;
  className?: string;
}) {
  const current = items[active];
  const [seen, setSeen] = useState(() => new Set(current ? [current.key] : []));
  useEffect(() => {
    if (!current || seen.has(current.key)) return;
    setSeen((previous) => new Set(previous).add(current.key));
  }, [current, seen]);
  const color = current?.color ?? DEFAULT_ACCENT;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px] overflow-hidden",
        className,
      )}
    >
      <div
        className="absolute -top-96 -left-80 size-[1200px] rounded-full opacity-45 blur-[150px] transition-colors duration-1000"
        style={{ backgroundColor: color }}
      />
      <div className="absolute inset-y-0 right-0 w-full [mask-image:linear-gradient(to_right,transparent,black_45%)] lg:w-[84%] max-lg:[mask-image:none]">
        {items.map((item, index) => {
          if (!seen.has(item.key) && index !== active) return null;
          const on = index === active;
          if (item.hero) {
            return (
              <img
                key={item.key}
                src={item.hero}
                alt=""
                decoding="async"
                className={cn(
                  // Dar ekranda hero'nun ortası genelde boş; karakterler çoğunlukla sağda durur.
                  "absolute inset-0 size-full object-cover object-[72%_30%] transition-opacity duration-1000 ease-(--ease-salon) lg:object-[center_30%]",
                  on ? "opacity-100" : "opacity-0",
                )}
                style={item.position ? { objectPosition: item.position } : undefined}
              />
            );
          }
          if (item.cover) {
            return (
              <img
                key={item.key}
                src={item.cover}
                alt=""
                decoding="async"
                className={cn(
                  "absolute inset-0 size-full scale-125 object-cover blur-3xl transition-opacity duration-1000",
                  on ? "opacity-55" : "opacity-0",
                )}
              />
            );
          }
          return null;
        })}
      </div>
      <div className="from-background/70 absolute inset-0 hidden bg-gradient-to-r via-background/15 via-45% to-transparent lg:block" />
      <div className="from-background/60 to-background absolute inset-0 bg-gradient-to-b via-transparent via-40%" />
      <div className="bg-background/40 absolute inset-0 lg:hidden" />
    </div>
  );
}
