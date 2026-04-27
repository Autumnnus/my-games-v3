import { apiFetch } from "./client";
import type { Statistics } from "@my-games/shared";

export const statisticsApi = {
  getGlobal: () => apiFetch<{ statistics: Statistics }>("/api/statistics"),

  getByUser: (userId: string) =>
    apiFetch<{ statistics: Statistics }>(`/api/statistics/${userId}`),
};
