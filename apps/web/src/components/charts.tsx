import { type ReactNode, useId } from "react";
import { getLocale } from "@/paraglide/runtime";

/**
 * Hafif grafikler (kütüphane yok). Tek seri → tek renk; renkler koyu zemin (#0a0a0a) için doğrulandı:
 * çubuk `#3987e5` (≥3:1), ısı haritası 5 adımlı mavi skala (monoton, açık uç ≥2:1).
 */
export const BAR = "#7ea7e6";
const HEAT = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];

export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-card grid gap-1 rounded-[20px] border p-4">
      <div className="font-display text-[26px] leading-tight font-medium tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[13px]">{label}</div>
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
    <section className="bg-card grid content-start gap-4 rounded-[22px] border p-5">
      <div className="grid gap-0.5">
        <h3 className="text-[15px] font-bold">{title}</h3>
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

export type HeatmapDay = { day: string; minutes: number; estimatedMinutes?: number };

/**
 * GitHub tarzı aktivite takvimi. Boş günler zemine yakın, yoğun günler parlak. Takip başlamadan önceki
 * tahmini günler aynı renk skalasıyla ama taralı çizilir: yoğunluk karşılaştırılabilir, tahmin olduğu da
 * görünür (ayrıca açıklamada ve göstergede yazar). `year` verilirse o takvim yılı, yoksa son 53 hafta.
 */
export function Heatmap(props: {
  days: HeatmapDay[];
  year?: number | null;
  format: (minutes: number) => string;
  lessLabel: string;
  moreLabel: string;
  estimatedLabel?: string;
  /** Hücre açıklaması; verilmezse `tarih: süre`. */
  describe?: (cell: { date: string; minutes: number; estimatedMinutes: number }) => string;
}) {
  // SVG `url(#…)` içinde güvenli olsun diye `useId`'nin özel karakterleri atılır (SSR'da `CSS.escape` yok).
  const patternId = `heat-estimated-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const byDay = new Map(props.days.map((item) => [item.day, item]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const first = props.year ? new Date(Date.UTC(props.year, 0, 1)) : new Date(today);
  if (!props.year) first.setUTCDate(first.getUTCDate() - 52 * 7 - today.getUTCDay());
  const last = props.year ? new Date(Date.UTC(props.year, 11, 31)) : today;
  // Sütunlar haftadır; ilk sütun pazar gününden başlar.
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - first.getUTCDay());

  const values = props.days.map((item) => item.minutes).sort((a, b) => a - b);
  // Seviyeler dörttebirliklere göre (uç değerler skalayı ezmesin).
  const quantile = (q: number) =>
    values[Math.min(values.length - 1, Math.floor(q * values.length))] ?? 0;
  const thresholds = [quantile(0.25), quantile(0.5), quantile(0.75), quantile(0.9)];
  const level = (minutes: number) => thresholds.filter((threshold) => minutes > threshold).length;
  const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeZone: "UTC" });
  const monthFormat = new Intl.DateTimeFormat(getLocale(), { month: "short", timeZone: "UTC" });

  const cells: Array<{
    x: number;
    y: number;
    day: string;
    minutes: number;
    estimatedMinutes: number;
  }> = [];
  const months: Array<{ x: number; label: string }> = [];
  for (
    let cursor = new Date(start), index = 0;
    cursor <= last;
    cursor.setUTCDate(cursor.getUTCDate() + 1), index++
  ) {
    if (cursor < first) continue;
    const day = cursor.toISOString().slice(0, 10);
    const item = byDay.get(day);
    const x = Math.floor(index / 7);
    cells.push({
      x,
      y: index % 7,
      day,
      minutes: item?.minutes ?? 0,
      estimatedMinutes: item?.estimatedMinutes ?? 0,
    });
    // Ay adı, ayın ilk gününün haftasının üstünde (sığmayan sıkışık etiketler atlanır).
    if (cursor.getUTCDate() === 1 && (months.at(-1)?.x ?? -3) < x - 2) {
      months.push({ x, label: monthFormat.format(cursor) });
    }
  }
  const size = 11;
  const gap = 2;
  const top = 14;
  const width = (Math.max(0, ...cells.map((cell) => cell.x)) + 1) * (size + gap);
  const hasEstimates = cells.some((cell) => cell.estimatedMinutes > 0);
  const describe =
    props.describe ??
    ((cell: { date: string; minutes: number }) => `${cell.date}: ${props.format(cell.minutes)}`);

  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto">
        <svg width={width} height={top + 7 * (size + gap)} role="img" aria-label={props.moreLabel}>
          <defs>
            <pattern
              id={patternId}
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="1.6" height="4" fill="var(--card)" fillOpacity="0.75" />
            </pattern>
          </defs>
          {months.map((month) => (
            <text
              key={month.x}
              x={month.x * (size + gap)}
              y={10}
              className="fill-muted-foreground text-[10px]"
            >
              {month.label}
            </text>
          ))}
          {cells.map((cell) => {
            const estimated = cell.minutes > 0 && cell.estimatedMinutes * 2 >= cell.minutes;
            const box = {
              x: cell.x * (size + gap),
              y: top + cell.y * (size + gap),
              width: size,
              height: size,
              rx: 2,
            };
            return (
              <g key={cell.day}>
                <title>
                  {describe({
                    date: dateFormat.format(new Date(`${cell.day}T00:00:00Z`)),
                    minutes: cell.minutes,
                    estimatedMinutes: cell.estimatedMinutes,
                  })}
                </title>
                <rect {...box} fill={cell.minutes ? HEAT[level(cell.minutes)] : "var(--muted)"} />
                {estimated && <rect {...box} fill={`url(#${patternId})`} />}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="text-muted-foreground flex items-center gap-1 self-end text-[10px]">
        {hasEstimates && props.estimatedLabel && (
          <span className="mr-3 inline-flex items-center gap-1">
            <svg width="10" height="10" aria-hidden="true">
              <rect width="10" height="10" rx="2" fill={HEAT[2]} />
              <rect width="10" height="10" rx="2" fill={`url(#${patternId})`} />
            </svg>
            {props.estimatedLabel}
          </span>
        )}
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
