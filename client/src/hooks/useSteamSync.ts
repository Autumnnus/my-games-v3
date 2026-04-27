import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { steamSyncApi, type UserSteamSyncSettings } from "@/api/steamSync";
import { steamSyncKeys } from "@/api/queryKeys";

export function useSteamSyncSettings() {
  return useQuery({
    queryKey: steamSyncKeys.settings(),
    queryFn: steamSyncApi.getSettings,
    staleTime: 60_000,
  });
}

export function useUpdateSteamSyncSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<UserSteamSyncSettings>) =>
      steamSyncApi.updateSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: steamSyncKeys.settings() });
      qc.invalidateQueries({ queryKey: steamSyncKeys.status() });
    },
  });
}

export function useSteamSyncStatus() {
  return useQuery({
    queryKey: steamSyncKeys.status(),
    queryFn: steamSyncApi.getStatus,
    staleTime: 10_000,
    refetchInterval: (query) =>
      query.state.data?.pendingConflicts ? false : 30_000,
  });
}

export function useTriggerSteamSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: steamSyncApi.triggerSync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: steamSyncKeys.status() });
    },
  });
}
