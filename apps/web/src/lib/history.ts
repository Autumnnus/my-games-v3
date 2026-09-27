import type { EntryStatus, Platform, Store } from "@my-games/shared";
import { m } from "@/paraglide/messages";
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

export function describeChange(change: { field: string; from: unknown; to: unknown }) {
  const label = (fieldLabels[change.field] ?? (() => change.field))();
  return `${label}: ${formatValue(change.field, change.from)} → ${formatValue(change.field, change.to)}`;
}
