export function formatPlayTime(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}s`;
  return `${h}s ${m}dk`;
}

export function formatDate(date: string | Date | undefined): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRating(rating: number | undefined): string {
  if (rating === undefined || rating === null) return "-";
  return rating.toFixed(1);
}

export function formatCoverUrl(
  url: string | undefined,
  size: "thumb" | "big" | "hero" = "big",
): string {
  if (!url) return "";
  const sizeMap = { thumb: "t_thumb", big: "t_cover_big", hero: "t_1080p" };
  const normalized = url.startsWith("//") ? `https:${url}` : url;
  return normalized.replace(/t_\w+/, sizeMap[size]);
}

export function formatUnixDate(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("tr-TR", { year: "numeric" }).format(
    new Date(timestamp * 1000),
  );
}

export function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dakika önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} gün önce`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400 / 7)} hafta önce`;
  if (diff < 86400 * 365) return `${Math.floor(diff / 86400 / 30)} ay önce`;
  return `${Math.floor(diff / 86400 / 365)} yıl önce`;
}
