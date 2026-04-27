import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { steamApi, type ConflictResolution } from "@/api/steam.api";
import { steamKeys } from "@/api/queryKeys";
import { isApiError } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";

export function useSteamProfile() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: steamKeys.profile(),
    queryFn: steamApi.getProfile,
    enabled: !!token,
    retry: (_, err) => isApiError(err) && err.httpStatus !== 404,
    staleTime: 2 * 60_000,
  });
}

export function useSteamSyncStatus() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: steamKeys.syncStatus(),
    queryFn: steamApi.getSyncStatus,
    enabled: !!token,
    retry: (_, err) => isApiError(err) && err.httpStatus !== 404,
    staleTime: 5_000,
    // Poll every 3s while syncing so UI updates when background job completes
    refetchInterval: (query) =>
      query.state.data?.syncStatus === "syncing" ? 3_000 : false,
  });
}

export function useSteamLibrary(enabled = true) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["steam", "library"],
    queryFn: steamApi.getLibrary,
    enabled: !!token && enabled,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useSyncSteam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      appIds,
      conflictResolution,
    }: {
      appIds: number[];
      conflictResolution: ConflictResolution;
    }) => steamApi.sync(appIds, conflictResolution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: steamKeys.syncStatus() });
    },
  });
}

export function useUnlinkSteam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: steamApi.unlinkSteam,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: steamKeys.profile() });
      qc.invalidateQueries({ queryKey: steamKeys.syncStatus() });
    },
  });
}
