import type {
  IGDBData,
  GameStatus,
  Platform,
  ScreenshotType,
} from "@my-games/shared";
import type { SyncStatus } from "./steamSync";

export interface GameListItem {
  _id: string;
  name: string;
  photo?: string;
  lastPlay?: string;
  platform: Platform;
  review?: string;
  rating?: number;
  status: GameStatus;
  playTime: number;
  screenshotSize: number;
  userId?: string;
  isFavorite: boolean;
  firstFinished?: string;
  slug?: string;
  igdb?: IGDBData;
  steamAppId?: number;
  createdAt?: string;
  updatedAt?: string;
  syncStatus?: SyncStatus;
  steamSyncExclude?: boolean;
  steamPlayTime?: number | null;
}

export interface GameInfo {
  _id: string;
  name: string;
  slug?: string;
  steamAppId?: number;
  coverImage?: string;
}

export interface LibraryEntryInfo {
  _id: string;
  game: GameInfo;
  status?: string;
  rating?: number;
  playTime?: number;
}

export interface Screenshot {
  _id: string;
  name?: string;
  url: string;
  thumbnail?: string;
  key?: string;
  user: string;
  libraryEntry: string | LibraryEntryInfo;
  game?: GameInfo;
  type: ScreenshotType;
  createdAt: string;
  updatedAt: string;
}

export interface ScreenshotListResponse {
  items: Screenshot[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  sorting: {
    sortBy: string;
    order: "asc" | "desc";
  };
}

export interface UserProfile {
  _id: string;
  name: string;
  email?: string;
  role: string;
  isVerified: boolean;
  profileImage?: string;
  gameSize: number;
  completedGameSize: number;
  screenshotSize: number;
  createdAt?: string;
}

export interface IGDBSearchResult {
  id: number;
  name: string;
  cover?: { url: string };
  first_release_date?: number;
  genres?: Array<{ id: number; name: string }>;
  involved_companies?: Array<{
    company: { name: string };
    developer: boolean;
    publisher: boolean;
  }>;
}
