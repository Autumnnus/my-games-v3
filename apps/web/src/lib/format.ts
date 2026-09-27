import type { EntryStatus, Platform, Store } from "@my-games/shared";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { ApiError } from "./api";

const statusMessages: Record<EntryStatus, () => string> = {
  playing: m.status_playing,
  completed: m.status_completed,
  paused: m.status_paused,
  dropped: m.status_dropped,
  backlog: m.status_backlog,
  wishlist: m.status_wishlist,
  endless: m.status_endless,
};

const platformMessages: Record<Platform, () => string> = {
  pc: m.platform_pc,
  playstation: m.platform_playstation,
  xbox: m.platform_xbox,
  nintendo: m.platform_nintendo,
  mobile: m.platform_mobile,
  other: m.platform_other,
};

const storeMessages: Record<Store, () => string> = {
  steam: m.store_steam,
  epic: m.store_epic,
  gog: m.store_gog,
  ubisoft: m.store_ubisoft,
  ea: m.store_ea,
  battlenet: m.store_battlenet,
  xbox: m.store_xbox,
  playstation: m.store_playstation,
  nintendo: m.store_nintendo,
  itch: m.store_itch,
  physical: m.store_physical,
  torrent: m.store_torrent,
  other: m.store_other,
};

export const statusLabel = (status: EntryStatus) => statusMessages[status]();
export const platformLabel = (platform: Platform) => platformMessages[platform]();
export const storeLabel = (store: Store) => storeMessages[store]();

/** 1234 dk → "20 sa 34 dk" / "20h 34m". */
export function formatPlaytime(minutes: number | null | undefined) {
  const total = Math.max(0, Math.round(minutes ?? 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const [h, min] = getLocale() === "tr" ? ["sa", "dk"] : ["h", "m"];
  const sep = getLocale() === "tr" ? " " : "";
  if (hours === 0) return `${rest}${sep}${min}`;
  if (rest === 0 || hours >= 100) return `${hours.toLocaleString(getLocale())}${sep}${h}`;
  return `${hours}${sep}${h} ${rest}${sep}${min}`;
}

/** 0–100 saklanan puanı "9,1" / "9.1" olarak gösterir. */
export function formatRating(stored: number | null | undefined) {
  if (stored === null || stored === undefined) return null;
  return (stored / 10).toLocaleString(getLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatDate(
  value: string | Date | null | undefined,
  style: "short" | "long" = "short",
) {
  if (!value) return null;
  const date =
    typeof value === "string" && value.length === 10
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return new Intl.DateTimeFormat(
    getLocale(),
    style === "long" ? { dateStyle: "long" } : { dateStyle: "medium" },
  ).format(date);
}

export function formatRelative(value: string | Date) {
  const diffSeconds = (new Date(value).getTime() - Date.now()) / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds)
      return format.format(Math.round(diffSeconds / seconds), unit);
  }
  return format.format(Math.round(diffSeconds), "second");
}

/** API hatasını kullanıcıya gösterilecek mesaja çevirir. */
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "conflict")
      return error.message !== "conflict" ? error.message : m.error_conflict();
    if (error.code === "rate_limited") return m.error_rate_limited();
    if (error.code === "unavailable") return m.error_unavailable();
    if (error.message && error.message !== error.code) return error.message;
  }
  return m.error_generic();
}
