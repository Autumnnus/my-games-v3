import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/store/auth.store";
import { steamApi } from "@/api/steam.api";
import { isApiError } from "@/api/client";
import {
  useSteamProfile,
  useSteamSyncStatus,
  useUnlinkSteam,
} from "@/hooks/useSteam";
import { SteamImportModal } from "@/components/steam/SteamImportModal";
import { SteamSyncSettings } from "@/components/steam-sync/SteamSyncSettings";
import { pageTransition } from "@/lib/motion";

const searchSchema = z.object({
  steamLinked: z.string().optional(),
  steamError: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/profile")({
  validateSearch: searchSchema,
  component: ProfilePage,
});

function SteamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.455 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z" />
    </svg>
  );
}

function SteamSection() {
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useSteamProfile();
  const { data: syncStatus } = useSteamSyncStatus();
  const unlinkMutation = useUnlinkSteam();
  const [importOpen, setImportOpen] = useState(false);

  const isLinked =
    !!profile && !(isApiError(profileError) && profileError.httpStatus === 404);
  const isSyncing = syncStatus?.syncStatus === "syncing";

  // Toast when background sync completes
  const prevSyncStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      prevSyncStatus.current === "syncing" &&
      syncStatus?.syncStatus === "idle"
    ) {
      toast.success("Steam kütüphanesi tarandı!");
    }
    prevSyncStatus.current = syncStatus?.syncStatus;
  }, [syncStatus?.syncStatus]);

  function handleLinkSteam() {
    window.location.href = steamApi.getLinkInitUrl();
  }

  async function handleUnlink() {
    try {
      await unlinkMutation.mutateAsync();
      toast.success("Steam hesabı bağlantısı kaldırıldı");
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Bağlantı kaldırılamadı");
    }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div
          className="flex items-center gap-2"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          <SteamIcon />
          <span className="font-semibold">Steam</span>
        </div>

        {isLinked && profile ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
            <div className="flex items-center gap-3">
              {profile.avatarUrl && (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  className="w-10 h-10 rounded-lg"
                />
              )}
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "rgba(255,255,255,0.9)" }}
                >
                  {profile.displayName}
                </p>
                {syncStatus?.lastSyncAt && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    Son tarama:{" "}
                    {new Date(syncStatus.lastSyncAt).toLocaleDateString(
                      "tr-TR",
                    )}
                  </p>
                )}
                {isSyncing && (
                  <p
                    className="text-xs mt-0.5 flex items-center gap-1"
                    style={{ color: "rgba(168,85,247,0.8)" }}
                  >
                    <LoadingSpinner size="sm" /> Taranıyor...
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <GlassButton
                size="sm"
                variant="primary"
                disabled={isSyncing}
                onClick={() => setImportOpen(true)}
                leftIcon={<SteamIcon />}
              >
                Kütüphaneyi Tara
              </GlassButton>
              <GlassButton
                size="sm"
                variant="danger"
                loading={unlinkMutation.isPending}
                onClick={handleUnlink}
              >
                Bağlantıyı Kaldır
              </GlassButton>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              Steam hesabınız bağlı değil
            </p>
            <GlassButton
              size="sm"
              onClick={handleLinkSteam}
              leftIcon={<SteamIcon />}
            >
              Steam Hesabı Bağla
            </GlassButton>
          </div>
        )}
      </div>

      <SteamImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </>
  );
}

function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const { steamLinked, steamError } = Route.useSearch();

  useEffect(() => {
    if (steamLinked === "true") {
      toast.success("Steam hesabı başarıyla bağlandı!");
    }
    if (steamError) {
      toast.error(
        `Steam bağlantısı başarısız: ${decodeURIComponent(steamError)}`,
      );
    }
  }, [steamLinked, steamError]);

  if (!user) return null;

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <PageContainer>
        <div className="max-w-2xl mx-auto flex flex-col gap-6">
          <h1
            className="text-2xl font-bold"
            style={{ color: "rgba(255,255,255,0.95)" }}
          >
            Profilim
          </h1>

          {/* User info card */}
          <GlassCard className="p-6">
            <div className="flex items-center gap-4">
              <Avatar src={user.profileImage} name={user.name} size="xl" />
              <div>
                <p
                  className="text-lg font-semibold"
                  style={{ color: "rgba(255,255,255,0.95)" }}
                >
                  {user.name}
                </p>
                {user.email && (
                  <p
                    className="text-sm mt-0.5"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {user.email}
                  </p>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Connected accounts */}
          <GlassCard className="p-6">
            <h2
              className="text-base font-semibold mb-4"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              Bağlı Hesaplar
            </h2>
            <SteamSection />
          </GlassCard>
          {/* Steam Auto-Sync settings */}
          <GlassCard className="p-6">
            <h2
              className="text-base font-semibold mb-4"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              Steam Otomatik Senkronizasyonu
            </h2>
            <SteamSyncSettings />
          </GlassCard>
        </div>
      </PageContainer>
    </motion.div>
  );
}
