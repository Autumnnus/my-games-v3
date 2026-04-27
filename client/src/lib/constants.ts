import type { Platform, GameStatus } from "@my-games/shared";

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
  mobile: "Mobile",
  otherPlatforms: "Diğer",
};

export const STATUS_LABELS: Record<GameStatus, string> = {
  completed: "Tamamlandı",
  abandoned: "Bırakıldı",
  toBeCompleted: "Tamamlanacak",
  activePlaying: "Oynuyor",
};

export const STATUS_COLORS: Record<GameStatus, string> = {
  completed: "#22c55e",
  abandoned: "#6b7280",
  toBeCompleted: "#f59e0b",
  activePlaying: "#3b82f6",
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
