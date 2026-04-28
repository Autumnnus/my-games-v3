import type { Platform, GameStatus } from "@my-games/shared";

export const STATUS_COLORS: Record<GameStatus, string> = {
  completed: "#22c55e",
  abandoned: "#6b7280",
  toBeCompleted: "#f59e0b",
  activePlaying: "#3b82f6",
};

// These are used as fallback display names; prefer t('games.status.X') in components
export const STATUS_LABELS: Record<GameStatus, string> = {
  activePlaying: "Oynuyor",
  completed: "Tamamlandı",
  abandoned: "Bırakıldı",
  toBeCompleted: "Tamamlanacak",
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  steam: "Steam",
  epicGames: "Epic Games",
  ubisoft: "Ubisoft Connect",
  xboxPc: "Xbox PC",
  eaGames: "EA Games",
  torrent: "Torrent",
  playstation: "PlayStation",
  xboxSeries: "Xbox Series",
  nintendo: "Nintendo",
  mobile: "Mobil",
  otherPlatforms: "Diğer",
};

export const PLATFORM_ICONS: Record<Platform, string> = {
  steam: "🎮",
  epicGames: "⚡",
  ubisoft: "🔷",
  xboxPc: "🟩",
  eaGames: "🟡",
  torrent: "🏴‍☠️",
  playstation: "🎮",
  xboxSeries: "🟩",
  nintendo: "🔴",
  mobile: "📱",
  otherPlatforms: "🖥️",
};

export const ALL_PLATFORMS: Platform[] = [
  "steam",
  "epicGames",
  "ubisoft",
  "xboxPc",
  "eaGames",
  "torrent",
  "playstation",
  "xboxSeries",
  "nintendo",
  "mobile",
  "otherPlatforms",
];

export const ALL_STATUSES: GameStatus[] = [
  "completed",
  "activePlaying",
  "toBeCompleted",
  "abandoned",
];
