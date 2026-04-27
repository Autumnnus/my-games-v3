import { apiFetch } from "./client";
import type { IGDBSearchResult } from "./types";

export const igdbApi = {
  search: (query: string) =>
    apiFetch<IGDBSearchResult[]>("/api/igdb", { params: { search: query } }),

  getById: (gameId: number) =>
    apiFetch<IGDBSearchResult>(`/api/igdb/${gameId}`),
};
