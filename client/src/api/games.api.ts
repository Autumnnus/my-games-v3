import { apiFetch } from "./client";
import type { GameStatus, Platform } from "@my-games/shared";
import type { GameListItem } from "./types";

export interface GetUserGamesParams {
  userId: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
  search?: string;
  status?: GameStatus;
  platform?: Platform;
  isFavorite?: boolean;
}

export interface GamesPageResponse {
  items: GameListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AddGameInput {
  name: string;
  photo?: string;
  platform: Platform;
  status: GameStatus;
  playTime: number;
  rating?: number;
  review?: string;
  isFavorite?: boolean;
  firstFinished?: string;
  lastPlay?: string;
  igdb?: object;
  steamAppId?: number;
}

export const gamesApi = {
  getUserGames: ({
    userId,
    page = 1,
    limit = 24,
    sortBy,
    order,
    search,
    status,
    platform,
    isFavorite,
  }: GetUserGamesParams) =>
    apiFetch<GamesPageResponse>(`/api/games/user/${userId}`, {
      params: { page, limit, sortBy, order, search, status, platform, isFavorite },
    }),

  getGame: (gameId: string) =>
    apiFetch<GameListItem>(`/api/games/game/${gameId}`),

  addGame: (data: AddGameInput) =>
    apiFetch<GameListItem>("/api/games/add", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  editGame: (libraryEntryId: string, data: Partial<AddGameInput>) =>
    apiFetch<GameListItem>(`/api/games/edit/${libraryEntryId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteGame: (libraryEntryId: string) =>
    apiFetch<void>(`/api/games/delete/${libraryEntryId}`, {
      method: "DELETE",
    }),
};
