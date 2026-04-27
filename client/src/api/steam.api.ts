import { apiFetch } from "./client";
import { useAuthStore } from "@/store/auth.store";

export interface SteamProfile {
  steamId: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl?: string;
  syncStatus?: "idle" | "syncing" | "failed";
  lastSyncAt?: string;
}

export interface SteamScreenshotItem {
  id: string;
  title: string;
  fileUrl: string;
  previewUrl: string;
  appName?: string;
  appId?: number;
}

export interface SteamLibraryItem {
  appId: number;
  title: string;
  playtimeMinutes: number;
  coverUrl: string;
  existingPlaytimeMinutes?: number;
}

export type ConflictResolution = "higher" | "steam" | "keep";

export const steamApi = {
  getProfile: () => apiFetch<SteamProfile>("/api/steam/profile"),

  getLibrary: () => apiFetch<SteamLibraryItem[]>("/api/steam/library"),

  sync: (appIds: number[], conflictResolution: ConflictResolution) =>
    apiFetch<{ message: string; syncStatus: string }>("/api/steam/sync", {
      method: "POST",
      body: JSON.stringify({ appIds, conflictResolution }),
    }),

  getScreenshots: (appId?: number) =>
    apiFetch<SteamScreenshotItem[]>(
      `/api/steam/screenshots${appId ? `?appId=${appId}` : ""}`,
    ),

  getSyncStatus: () =>
    apiFetch<{
      syncStatus: string;
      lastSyncAt?: string;
      linkedAt?: string;
      displayName?: string;
    }>("/api/steam/sync/status"),

  getLoginUrl: () =>
    `${import.meta.env.VITE_API_URL ?? "http://localhost:3030"}/api/auth/steam`,

  getLinkInitUrl: () => {
    const token = useAuthStore.getState().token ?? "";
    const base = import.meta.env.VITE_API_URL ?? "http://localhost:3030";
    return `${base}/api/auth/steam/link/init?token=${encodeURIComponent(token)}`;
  },

  linkSteam: () =>
    apiFetch<{ message: string }>("/api/auth/steam/link", { method: "POST" }),

  unlinkSteam: () =>
    apiFetch<{ message: string }>("/api/auth/steam/unlink", {
      method: "DELETE",
    }),
};
