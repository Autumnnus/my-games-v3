import { apiFetch } from "./client";
import type { Statistics, UserAggregateStatistics } from "@my-games/shared";

export const statisticsApi = {
  getGlobal: () => apiFetch<{ statistics: Statistics }>("/api/statistics"),

  getByUser: (userId: string) =>
    apiFetch<{ statistics: Statistics }>(`/api/statistics/${userId}`),

  getUserStats: (userId: string) =>
    apiFetch<UserAggregateStatistics>(`/api/statistics/user/${userId}`),
};
