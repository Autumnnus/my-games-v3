import { apiFetch } from "./client";

// ─── Types ─────────────────────────────────────────────────────────────────

export type SyncStatus =
  | "synced"
  | "draft"
  | "conflict"
  | "resolved"
  | "excluded";

export type Resolution = "take_steam" | "keep_manual" | "ignore";

export interface UserSteamSyncSettings {
  enabled: boolean;
  intervalHours: number;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "partial" | "failed" | null;
}

export interface SteamSyncStatusResponse {
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "partial" | "failed" | null;
  pendingConflicts: number;
  lastError: string | null;
}

export interface Conflict {
  id: string;
  libraryEntryId: string;
  gameName: string;
  gameCoverUrl: string | null;
  manualValue: number;
  steamValue: number;
  diff: number;
  detectedAt: string;
  status: "pending" | "resolved";
}

export interface ResolvedConflict {
  conflictId: string;
  status: "resolved";
  resolution: Resolution;
  resolvedAt: string;
}

// ─── API client ─────────────────────────────────────────────────────────────

export const steamSyncApi = {
  getSettings: () =>
    apiFetch<UserSteamSyncSettings>("/api/users/me/steam-sync-settings"),

  updateSettings: (data: Partial<UserSteamSyncSettings>) =>
    apiFetch<UserSteamSyncSettings>("/api/users/me/steam-sync-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getStatus: () => apiFetch<SteamSyncStatusResponse>("/api/steam-sync/status"),

  triggerSync: () =>
    apiFetch<{ message: string; jobId: string }>("/api/steam-sync/trigger", {
      method: "POST",
    }),

  getConflicts: (status: "pending" | "resolved" | "all" = "pending") =>
    apiFetch<{ conflicts: Conflict[]; total: number }>(
      "/api/steam-sync/conflicts",
      { params: { status } },
    ),

  resolveConflict: (conflictId: string, resolution: Resolution) =>
    apiFetch<ResolvedConflict>("/api/steam-sync/resolve", {
      method: "POST",
      body: JSON.stringify({ conflictId, resolution }),
    }),

  setExclusion: (entryId: string, exclude: boolean) =>
    apiFetch<{
      libraryEntryId: string;
      steamSyncExclude: boolean;
      syncStatus: SyncStatus;
    }>(`/api/library/${entryId}/steam-sync-exclude`, {
      method: "PATCH",
      body: JSON.stringify({ exclude }),
    }),
};
