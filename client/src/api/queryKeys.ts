import type { GameStatus, Platform } from "@my-games/shared";

export const authKeys = {
  me: () => ["auth", "me"] as const,
};

export const gameKeys = {
  all: ["games"] as const,
  user: (
    userId: string,
    filters?: {
      status?: GameStatus;
      platform?: Platform;
      sortBy?: string;
      order?: string;
      search?: string;
      page?: number;
    },
  ) => [...gameKeys.all, "user", userId, filters ?? {}] as const,
  detail: (id: string) => [...gameKeys.all, "detail", id] as const,
};

export const screenshotKeys = {
  all: ["screenshots"] as const,
  game: (gameId: string, page?: number) =>
    [...screenshotKeys.all, "game", gameId, page ?? 1] as const,
  random: (count: number) => [...screenshotKeys.all, "random", count] as const,
  user: (userId: string) => [...screenshotKeys.all, "user", userId] as const,
};

export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
};

export const igdbKeys = {
  search: (query: string) => ["igdb", "search", query] as const,
  detail: (id: number) => ["igdb", "detail", id] as const,
};

export const statisticsKeys = {
  global: () => ["statistics", "global"] as const,
  user: (userId: string) => ["statistics", "user", userId] as const,
};

export const steamKeys = {
  profile: () => ["steam", "profile"] as const,
  syncStatus: () => ["steam", "syncStatus"] as const,
};

export const steamSyncKeys = {
  all: ["steamSync"] as const,
  settings: () => [...steamSyncKeys.all, "settings"] as const,
  status: () => [...steamSyncKeys.all, "status"] as const,
  conflicts: (status?: string) =>
    [...steamSyncKeys.all, "conflicts", status ?? "pending"] as const,
};

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (page: number) => [...notificationKeys.all, "list", page] as const,
  unreadCount: () => [...notificationKeys.all, "unread-count"] as const,
};

export const activityKeys = {
  all: ["activity"] as const,
  feed: (page: number) => [...activityKeys.all, "feed", page] as const,
  user: (userId: string, page: number) =>
    [...activityKeys.all, "user", userId, page] as const,
};
