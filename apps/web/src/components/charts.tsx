import type { ReactNode } from "react";
import { getLocale } from "@/paraglide/runtime";

/**
 * Hafif grafikler (kütüphane yok). Tek seri → tek renk; renkler koyu zemin (#0a0a0a) için doğrulandı:
 * çubuk `#3987e5` (≥3:1), ısı haritası 5 adımlı mavi skala (monoton, açık uç ≥2:1).
 */
const BAR = "#3987e5";
const HEAT = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

export function ChartCard({
  title,
  children,
  hint,
}: {
  title: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <section className="grid content-start gap-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Yatay çubuk listesi: etiket + çubuk + değer satırları. Değer metni her zaman görünür (renk tek başına
 * bilgi taşımaz), satırın tamamı hover alanıdır.
 */
export function BarList(props: {
  items: Array<{ label: string; value: number; detail?: string }>;
  format?: (value: number) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...props.items.map((item) => item.value));
  const format = props.format ?? ((value: number) => value.toLocaleString(getLocale()));
  if (props.items.length === 0)
    return <p className="text-muted-foreground text-sm">{props.empty}</p>;
  return (
    <ul className="grid gap-1.5">
      {props.items.map((item) => (
        <li
          key={item.label}
          title={`${item.label}: ${format(item.value)}${item.detail ? ` · ${item.detail}` : ""}`}
          className="hover:bg-accent/40 grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded px-1 text-sm"
        >
          <span className="truncate">{item.label}</span>
          <span className="bg-muted/40 h-2 overflow-hidden rounded-full">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, backgroundColor: BAR }}
            />
          </span>
          <span className="text-muted-foreground tabular-nums">{format(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Dikey sütunlar (yıllar, puan dağılımı, aylar). Her sütunun değeri hover'da ve altında etiketle. */
export function ColumnChart(props: {
  items: Array<{ label: string; value: number }>;
  format?: (value: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...props.items.map((item) => item.value));
  const format = props.format ?? ((value: number) => value.toLocaleString(getLocale()));
  const height = props.height ?? 120;
  return (
    <div className="flex items-end gap-0.5" style={{ height: height + 20 }}>
      {props.items.map((item) => (
        <div
          key={item.label}
          className="group flex min-w-0 flex-1 flex-col items-center gap-1"
          title={`${item.label}: ${format(item.value)}`}
        >
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
              style={{
                height: `${(item.value / max) * height}px`,
                minHeight: item.value ? 2 : 0,
                backgroundColor: BAR,
              }}
            />
          </div>
          <span className="text-muted-foreground w-full truncate text-center text-[10px] tabular-nums">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** GitHub tarzı yıllık aktivite takvimi. Boş günler zemine yakın, yoğun günler parlak. */
export function Heatmap(props: {
  days: Array<{ day: string; minutes: number }>;
  format: (minutes: number) => string;
  lessLabel: string;
  moreLabel: string;
}) {
  const byDay = new Map(props.days.map((item) => [item.day, item.minutes]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 52 * 7 - today.getUTCDay());
  const values = props.days.map((item) => item.minutes).sort((a, b) => a - b);
  // Seviyeler dörttebirliklere göre (uç değerler skalayı ezmesin).
  const quantile = (q: number) =>
    values[Math.min(values.length - 1, Math.floor(q * values.length))] ?? 0;
  const thresholds = [quantile(0.25), quantile(0.5), quantile(0.75), quantile(0.9)];
  const level = (minutes: number) => thresholds.filter((threshold) => minutes > threshold).length;

  const cells: Array<{ x: number; y: number; day: string; minutes: number }> = [];
  for (
    let cursor = new Date(start), index = 0;
    cursor <= today;
    cursor.setUTCDate(cursor.getUTCDate() + 1), index++
  ) {
    const day = cursor.toISOString().slice(0, 10);
    cells.push({ x: Math.floor(index / 7), y: index % 7, day, minutes: byDay.get(day) ?? 0 });
  }
  const size = 11;
  const gap = 2;
  const width = (Math.max(...cells.map((cell) => cell.x)) + 1) * (size + gap);
  const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto">
        <svg width={width} height={7 * (size + gap)} role="img" aria-label={props.moreLabel}>
          {cells.map((cell) => (
            <rect
              key={cell.day}
              x={cell.x * (size + gap)}
              y={cell.y * (size + gap)}
              width={size}
              height={size}
              rx={2}
              fill={cell.minutes ? HEAT[level(cell.minutes)] : "var(--muted)"}
            >
              <title>{`${dateFormat.format(new Date(`${cell.day}T00:00:00Z`))}: ${props.format(cell.minutes)}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div className="text-muted-foreground flex items-center gap-1 self-end text-[10px]">
        {props.lessLabel}
        <span className="bg-muted inline-block size-2.5 rounded-[2px]" />
        {HEAT.map((color) => (
          <span
            key={color}
            className="inline-block size-2.5 rounded-[2px]"
            style={{ backgroundColor: color }}
          />
        ))}
        {props.moreLabel}
      </div>
    </div>
  );
}
