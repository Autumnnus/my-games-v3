import type { IGDBData, GameStatus, Platform } from "@my-games/shared";

export interface GameListItem {
  _id: string;
  name: string;
  photo?: string;
  lastPlay?: Date;
  platform: Platform;
  review?: string;
  rating?: number;
  status: GameStatus;
  playTime: number;
  screenshotSize: number;
  userId?: string;
  isFavorite: boolean;
  firstFinished?: Date;
  lastPlayDate?: Date;
  completionDate?: Date | null;
  slug?: string;
  igdb?: IGDBData;
  steamAppId?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
