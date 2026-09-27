// Hem veritabanı enum'ları hem UI seçenekleri buradan beslenir. Değer eklemek migration gerektirir.

export const entryStatuses = [
  "playing",
  "completed",
  "paused",
  "dropped",
  "backlog",
  "wishlist",
  "endless",
] as const;
export type EntryStatus = (typeof entryStatuses)[number];

export const platforms = ["pc", "playstation", "xbox", "nintendo", "mobile", "other"] as const;
export type Platform = (typeof platforms)[number];

export const stores = [
  "steam",
  "epic",
  "gog",
  "ubisoft",
  "ea",
  "battlenet",
  "xbox",
  "playstation",
  "nintendo",
  "itch",
  "physical",
  "torrent",
  "other",
] as const;
export type Store = (typeof stores)[number];

export const gameSources = ["igdb", "steam", "custom", "legacy"] as const;
export type GameSource = (typeof gameSources)[number];

export const termKinds = ["genre", "theme", "game_mode", "player_perspective", "company"] as const;
export type TermKind = (typeof termKinds)[number];

/** Onay sistemine öneri üreten kaynaklar. */
export const proposalSources = ["steam", "igdb", "migration", "ai", "system"] as const;
export type ProposalSource = (typeof proposalSources)[number];

export const proposalStatuses = [
  "pending",
  "approved",
  "rejected",
  "auto_applied",
  "superseded",
] as const;
export type ProposalStatus = (typeof proposalStatuses)[number];

/** Bir kaynaktan gelen belirli bir öneri türü için kullanıcının seçtiği davranış. */
export const syncActions = ["auto", "ask", "ignore"] as const;
export type SyncAction = (typeof syncActions)[number];

export const playSessionSources = ["steam_delta", "steam_presence", "desktop", "manual"] as const;
export type PlaySessionSource = (typeof playSessionSources)[number];

export const screenshotKinds = ["upload", "external", "steam"] as const;
export type ScreenshotKind = (typeof screenshotKinds)[number];

/** Beğeni ve yorum yapılabilen içerikler. */
export const socialTargets = ["activity", "entry", "screenshot"] as const;
export type SocialTarget = (typeof socialTargets)[number];

export const notificationTypes = [
  "reaction",
  "comment",
  "reply",
  "mention",
  "proposals",
  "system",
] as const;
export type NotificationType = (typeof notificationTypes)[number];

export const activityVerbs = [
  "entry_added",
  "status_changed",
  "rated",
  "reviewed",
  "played",
  "playtime_milestone",
  "achievements_completed",
  "screenshots_added",
] as const;
export type ActivityVerb = (typeof activityVerbs)[number];

/** Süre eşikleri (dakika). Geçildiğinde akışa "X saate ulaştı" düşer. */
export const playtimeMilestones = [10, 25, 50, 100, 250, 500, 1000].map((hours) => hours * 60);

/** 0–10 arası tek ondalıklı puanı 0–100 tam sayıya çevirir (DB'de böyle saklanır). */
export function ratingToStored(rating: number) {
  return Math.round(Math.min(10, Math.max(0, rating)) * 10);
}

export function ratingFromStored(stored: number) {
  return stored / 10;
}

export function formatPlaytime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function slugify(input: string) {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "game"
  );
}

export type CoverSize = "cover_small" | "cover_big" | "cover_big_2x" | "720p" | "1080p";
export type ImageSize =
  | CoverSize
  | "screenshot_med"
  | "screenshot_big"
  | "screenshot_huge"
  | "thumb";

export function igdbImageUrl(imageId: string, size: ImageSize = "cover_big") {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
}

/** IGDB kapağı varsa onu, yoksa kayıtlı kapak URL'ini döner. */
export function gameCoverUrl(
  game: { coverImageId?: string | null; coverUrl?: string | null },
  size: CoverSize = "cover_big",
) {
  if (game.coverImageId) return igdbImageUrl(game.coverImageId, size);
  return game.coverUrl ?? null;
}

/** Steam'in dikey kütüphane kapağı (600x900). */
export function steamCapsuleUrl(appId: number) {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}

/** Dikey kapağı olmayan uygulamalar için yedek (yatay başlık görseli). */
export function steamHeaderUrl(appId: number) {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
}
