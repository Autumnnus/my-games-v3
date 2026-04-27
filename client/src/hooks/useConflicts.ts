import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { steamSyncApi, type Conflict, type Resolution } from "@/api/steamSync";
import { steamSyncKeys } from "@/api/queryKeys";

export function useConflicts(
  initialStatus: "pending" | "resolved" | "all" = "pending",
) {
  const [status, setStatus] = useState(initialStatus);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: steamSyncKeys.conflicts(status),
    queryFn: () => steamSyncApi.getConflicts(status),
    enabled: true,
    staleTime: 20_000,
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      conflictId,
      resolution,
    }: {
      conflictId: string;
      resolution: Resolution;
    }) => steamSyncApi.resolveConflict(conflictId, resolution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: steamSyncKeys.conflicts("pending") });
      qc.invalidateQueries({ queryKey: steamSyncKeys.conflicts("all") });
      qc.invalidateQueries({ queryKey: steamSyncKeys.status() });
    },
  });

  async function resolveConflict(conflictId: string, resolution: Resolution) {
    await resolveMutation.mutateAsync({ conflictId, resolution });
  }

  function updateStatus(newStatus: "pending" | "resolved" | "all") {
    setStatus(newStatus);
  }

  return {
    conflicts: query.data?.conflicts ?? ([] as Conflict[]),
    total: query.data?.total ?? 0,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    resolveConflict,
    resolveLoading: resolveMutation.isPending,
    updateStatus,
  };
}
