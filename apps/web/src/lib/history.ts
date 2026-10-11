import type { EntryStatus, Platform, Store } from "@my-games/shared";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
  formatDate,
  formatPlaytime,
  formatRating,
  platformLabel,
  statusLabel,
  storeLabel,
} from "./format";

const fieldLabels: Record<string, () => string> = {
  status: m.field_status,
  rating: m.sort_rating,
  review: m.field_review,
  platform: m.field_platform,
  store: m.field_store,
  playtimeManualMin: m.entry_playtime,
  playtimeSteamMin: () => `Steam ${m.entry_playtime().toLowerCase()}`,
  playtimePsnMin: () => `PlayStation ${m.entry_playtime().toLowerCase()}`,
  playtimeXboxMin: () => `Xbox ${m.entry_playtime().toLowerCase()}`,
  startedAt: m.field_started_at,
  finishedAt: m.field_finished_at,
  lastPlayedAt: m.field_last_played,
  isFavorite: m.field_favorite,
  achievementsUnlocked: m.achievements_title,
  achievementsTotal: () => `${m.achievements_title()} (${m.status_all().toLowerCase()})`,
};

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return m.unknown();
  switch (field) {
    case "status":
      return statusLabel(value as EntryStatus);
    case "platform":
      return platformLabel(value as Platform);
    case "store":
      return storeLabel(value as Store);
    case "rating":
      return formatRating(Number(value)) ?? m.unknown();
    case "playtimeManualMin":
    case "playtimeSteamMin":
    case "playtimePsnMin":
    case "playtimeXboxMin":
      return formatPlaytime(Number(value));
    case "startedAt":
    case "finishedAt":
    case "lastPlayedAt":
      return formatDate(String(value)) ?? m.unknown();
    case "isFavorite":
      return value ? "✓" : "✗";
    case "review": {
      const text = String(value);
      return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    }
    default:
      return String(value);
  }
}

const playtimeFields = new Set([
  "playtimeManualMin",
  "playtimeSteamMin",
  "playtimePsnMin",
  "playtimeXboxMin",
]);

/** Süre ve başarım sayısında farkı da yazar: "(+1 sa 20 dk)", "(+3)". */
function deltaOf(field: string, from: unknown, to: unknown) {
  if (typeof to !== "number" || to === from) return null;
  const before = typeof from === "number" ? from : 0;
  const sign = to > before ? "+" : "−";
  if (playtimeFields.has(field)) return `${sign}${formatPlaytime(Math.abs(to - before))}`;
  if (field === "achievementsUnlocked") return `${sign}${Math.abs(to - before)}`;
  return null;
}

type Change = { field: string; from: unknown; to: unknown };

export function describeChange(change: Change) {
  const label = (fieldLabels[change.field] ?? (() => change.field))();
  const text = `${label}: ${formatValue(change.field, change.from)} → ${formatValue(change.field, change.to)}`;
  const delta = deltaOf(change.field, change.from, change.to);
  return delta ? `${text} (${delta})` : text;
}

type HistoryRow = {
  id: string;
  entryId: string | null;
  action: "create" | "update" | "delete";
  day: string;
  changes: Change[];
};

/**
 * Geçmişi gün gün, gün içinde de kayıt kayıt toplar: her sync ayrı satır yazar ama aynı gün aynı oyundaki
 * güncellemeler tek grupta görünür. Ekleme/silme kendi satırında kalır. Girdi yeniden eskiye sıralıdır.
 */
export function groupHistory<T extends HistoryRow>(rows: T[]) {
  const days: Array<{ day: string; groups: Array<{ key: string; items: T[] }> }> = [];
  for (const row of rows) {
    let day = days.at(-1);
    if (day?.day !== row.day) {
      day = { day: row.day, groups: [] };
      days.push(day);
    }
    const key = row.action === "update" && row.entryId ? `update:${row.entryId}` : row.id;
    const group = day.groups.find((item) => item.key === key);
    if (group) group.items.push(row);
    else day.groups.push({ key, items: [row] });
  }
  return days;
}

/** Gruptaki güncellemelerin net etkisi: her alan için ilk değerden son değere; sonunda aynı kalanlar düşer. */
export function netChanges(rows: HistoryRow[]) {
  const net = new Map<string, Change>();
  for (const row of [...rows].reverse()) {
    for (const change of row.changes) {
      const first = net.get(change.field);
      net.set(change.field, {
        field: change.field,
        from: first ? first.from : change.from,
        to: change.to,
      });
    }
  }
  return [...net.values()].filter(
    (change) => JSON.stringify(change.from ?? null) !== JSON.stringify(change.to ?? null),
  );
}

/** "Bugün", "Dün" ya da uzun tarih. Gün `YYYY-MM-DD` (uygulama saat dilimi). */
export function dayLabel(day: string, now = new Date()) {
  const toDay = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(
      date,
    );
  const diff = Math.round(
    (Date.parse(`${toDay(now)}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000,
  );
  if (diff === 0 || diff === 1) {
    const text = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }).format(-diff, "day");
    return text.charAt(0).toLocaleUpperCase(getLocale()) + text.slice(1);
  }
  return formatDate(day, "long") ?? day;
}
