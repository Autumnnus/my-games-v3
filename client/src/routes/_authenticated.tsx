import { useEffect, useState } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ConflictPopup } from "@/components/steam-sync/ConflictPopup";
import { steamSyncApi } from "@/api/steamSync";
import { steamSyncKeys } from "@/api/queryKeys";
import { useSteamSyncStore } from "@/store/steamSyncStore";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated()) {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [conflicts, setConflicts] = useState<
    import("@/api/steamSync").Conflict[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const {
    conflictPopupOpen,
    setConflictPopupOpen,
    dismissedAt,
    setDismissedAt,
  } = useSteamSyncStore();
  const qc = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Fetch pending conflicts on mount
    setLoading(true);
    steamSyncApi
      .getConflicts("pending")
      .then((data) => {
        if (data.conflicts.length > 0) {
          setConflicts(data.conflicts);
          setConflictPopupOpen(true);
        }
      })
      .catch(() => {
        // Silently fail - not critical
      })
      .finally(() => setLoading(false));
  }, [mounted]);

  async function handleResolve(
    conflictId: string,
    resolution: import("@/api/steamSync").Resolution,
  ) {
    try {
      await steamSyncApi.resolveConflict(conflictId, resolution);
      setConflicts((prev) => {
        const remaining = prev.filter((c) => c.id !== conflictId);
        if (remaining.length === 0) {
          setConflictPopupOpen(false);
        }
        return remaining;
      });
      qc.invalidateQueries({ queryKey: steamSyncKeys.status() });
    } catch {
      // conflict already resolved or error
    }
  }

  function handleDismiss() {
    setConflictPopupOpen(false);
    setDismissedAt(new Date().toISOString());
  }

  return (
    <>
      <Outlet />
      {mounted && conflictPopupOpen && conflicts.length > 0 && (
        <ConflictPopup
          conflicts={conflicts}
          onResolve={handleResolve}
          onDismiss={handleDismiss}
          loading={loading}
        />
      )}
    </>
  );
}
