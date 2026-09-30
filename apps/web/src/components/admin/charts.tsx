import { type ReactNode, useState } from "react";
import { getLocale } from "@/paraglide/runtime";

/** Uygulamanın tek seri rengi (koyu zeminde ≥3:1, bkz. components/charts.tsx). */
const BAR = "#7ea7e6";
const BAR_ACTIVE = "#a9c4ee";

/** Eksenin üst değeri: 1 / 2 / 5 × 10ⁿ'e yuvarlanır (temiz çentikler). */
function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value) ?? 10;
  return step * power;
}

function dayLabel(day: string, style: "short" | "long") {
  const date = new Date(`${day}T12:00:00`);
  return new Intl.DateTimeFormat(
    getLocale(),
    style === "long"
      ? { weekday: "short", day: "numeric", month: "long" }
      : { day: "numeric", month: "short" },
  ).format(date);
}

/**
 * Günlük sütunlar (tek seri): 4 px yuvarlak uç, en fazla 24 px kalınlık, sütunlar arasında 2 px boşluk.
 * Her sütun kendi hover/odak hedefi (sütun yuvasının tamamı); ipucu değeri öne çıkarır. Değerlerin hepsi
 * altta tablo olarak da okunabilir.
 */
export function DailyColumns({
  items,
  format,
  label,
  detail,
  height = 150,
}: {
  items: Array<{ day: string; value: number }>;
  format: (value: number) => string;
  label: string;
  detail?: (index: number) => string | null;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...items.map((item) => item.value)));
  const ticks = [max, max / 2, 0];
  const current = active === null ? null : items[active];
  const labelEvery = Math.max(1, Math.ceil(items.length / 6));

  return (
    <figure className="m-0 grid gap-2">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
        <div className="relative" style={{ height }} aria-hidden="true">
          {/* Etiketler mutlak konumlu; sütun genişliğini en uzun etiketten alsın diye görünmez kopyalar. */}
          <div className="invisible grid h-0 overflow-hidden text-[11px] tabular-nums">
            {ticks.map((tick) => (
              <span key={tick}>{format(tick)}</span>
            ))}
          </div>
          {ticks.map((tick, index) => (
            <span
              key={tick}
              className="text-foreground/50 absolute right-0 -translate-y-1/2 text-[11px] whitespace-nowrap tabular-nums"
              style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
            >
              {format(tick)}
            </span>
          ))}
        </div>
        <div className="relative" style={{ height }}>
          {ticks.map((tick, index) => (
            <div
              key={tick}
              aria-hidden="true"
              className={`absolute inset-x-0 h-px ${index === ticks.length - 1 ? "bg-white/15" : "bg-white/6"}`}
              style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {items.map((item, index) => (
              <button
                key={item.day}
                type="button"
                aria-label={`${dayLabel(item.day, "long")}: ${format(item.value)}`}
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center rounded-t-[4px] outline-none focus-visible:bg-white/6"
              >
                <span
                  className="block w-full max-w-[24px] rounded-t-[4px] transition-colors"
                  style={{
                    height: `${(item.value / max) * 100}%`,
                    minHeight: item.value > 0 ? 2 : 0,
                    backgroundColor: active === index ? BAR_ACTIVE : BAR,
                  }}
                />
              </button>
            ))}
          </div>
          {current && active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 grid gap-0.5 rounded-xl border border-white/10 bg-[#1b1c23] px-3 py-2 text-xs whitespace-nowrap shadow-lg"
              // Balon sütunun tepesinde durur; kenardaki sütunlarda içeri doğru açılır.
              style={{
                left: `${((active + 0.5) / items.length) * 100}%`,
                top: `${(1 - current.value / max) * 100}%`,
                transform: `translate(${active > items.length * 0.7 ? "-100%" : active < items.length * 0.3 ? "0" : "-50%"}, calc(-100% - 8px))`,
              }}
            >
              <strong className="text-foreground text-[13px] tabular-nums">
                {format(current.value)}
              </strong>
              <span className="text-foreground/60">{dayLabel(current.day, "long")}</span>
              {detail?.(active) && <span className="text-foreground/60">{detail(active)}</span>}
            </div>
          )}
        </div>
        <span />
        <div className="text-foreground/50 relative mt-1 flex text-[11px]" aria-hidden="true">
          {items.map((item, index) => (
            <span key={item.day} className="min-w-0 flex-1 text-center whitespace-nowrap">
              {(index % labelEvery === 0 || index === items.length - 1) && items.length > 1
                ? dayLabel(item.day, "short")
                : ""}
            </span>
          ))}
        </div>
      </div>
      <details className="text-xs">
        <summary className="text-foreground/55 hover:text-foreground w-fit cursor-pointer select-none">
          {label}
        </summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <tbody>
            {items.map((item) => (
              <tr key={item.day} className="border-b border-white/6">
                <td className="text-foreground/65 py-1">{dayLabel(item.day, "long")}</td>
                <td className="py-1 text-right">{format(item.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Yatay çubuk listesi (model, amaç, tablo boyutu). Değer metni her zaman görünür. */
export function Bars({
  items,
  format,
  empty,
}: {
  items: Array<{ key: string; label: ReactNode; value: number; detail?: string }>;
  format: (value: number) => string;
  empty?: string;
}) {
  const max = Math.max(0, ...items.map((item) => item.value));
  if (items.length === 0) return <p className="text-foreground/55 m-0 text-sm">{empty}</p>;
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {items.map((item) => (
        <li key={item.key} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 tabular-nums">
              {format(item.value)}
              {item.detail && (
                <span className="text-foreground/50 ml-2 text-xs">{item.detail}</span>
              )}
            </span>
          </div>
          <span className="block h-1.5 overflow-hidden rounded-full bg-white/6">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${max > 0 ? Math.max(item.value > 0 ? 2 : 0, (item.value / max) * 100) : 0}%`,
                backgroundColor: BAR,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
