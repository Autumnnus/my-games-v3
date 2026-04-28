import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Gamepad2,
  Trophy,
  Clock,
  Star,
  Zap,
  Settings2,
  User,
  CheckCircle2,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassBadge } from "@/components/ui/GlassBadge";
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
import { FavoriteGamesSection } from "@/components/profile/FavoriteGamesSection";
import { pageTransition, fadeUp, staggerContainer } from "@/lib/motion";
import { formatPlayTime, formatDate, formatCoverUrl } from "@/lib/formatters";
import { gamesApi } from "@/api/games.api";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/api/auth.api";
import type { GameListItem } from "@/api/types";
import { Link } from "@tanstack/react-router";

const searchSchema = z.object({
  steamLinked: z.string().optional(),
  steamError: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/profile")({
  validateSearch: searchSchema,
  component: ProfilePage,
});

// ─── Steam Icon ───────────────────────────────────────────────────────────────
function SteamIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`w-${size / 4} h-${size / 4}`} style={{ width: size, height: size }}>
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.455 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z" />
    </svg>
  );
}

// ─── Stats Grid ───────────────────────────────────────────────────────────────
interface StatItem {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}

function StatsGrid({ stats }: { stats: StatItem[] }) {
  return (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {stats.map(({ icon: Icon, label, value, color }) => (
        <motion.div key={label} variants={fadeUp}>
          <GlassCard className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: `${color}22`,
                  border: `1px solid ${color}33`,
                }}
              >
                <Icon size={15} style={{ color }} />
              </div>
              <span
                className="text-xs leading-tight"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                {label}
              </span>
            </div>
            <span
              className="text-2xl font-bold leading-none"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              {value}
            </span>
          </GlassCard>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Game Cover Thumbnail ──────────────────────────────────────────────────────
function GameThumbnail({ game }: { game: GameListItem }) {
  const cover = game.photo ? formatCoverUrl(game.photo, "thumb") : null;
  return (
    <div className="shrink-0">
      {cover ? (
        <img
          src={cover}
          alt={game.name}
          loading="lazy"
          className="w-full h-full object-cover rounded-lg"
        />
      ) : (
        <div
          className="w-full h-full rounded-lg flex items-center justify-center text-xl"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          🎮
        </div>
      )}
    </div>
  );
}

// ─── Recently Played Games ────────────────────────────────────────────────────
function RecentlyPlayedCard({ games }: { games: GameListItem[] }) {
  const statusLabel: Record<string, string> = {
    completed: "Tamamlandı",
    playing: "Oynuyor",
    paused: "Durduruldu",
    backlog: "Sırada",
    dropped: "Bırakıldı",
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={14} style={{ color: "#f59e0b" }} />
          <h3
            className="text-sm font-semibold"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            Son Oynananlar
          </h3>
        </div>
        <Link
          to="/games"
          className="text-xs hover:underline"
          style={{ color: "rgba(168,85,247,0.7)" }}
        >
          Tümü →
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        {games.map((game) => (
          <motion.div
            key={game._id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="group flex items-center gap-3 p-2 rounded-xl border border-transparent hover:border-white/10 transition-all cursor-pointer"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <Link to="/games/$id" params={{ id: game._id }} className="shrink-0 w-12 h-16">
              <GameThumbnail game={game} />
            </Link>
            <div className="flex-1 min-w-0">
              <Link
                to="/games/$id"
                params={{ id: game._id }}
                className="text-sm font-medium truncate block hover:text-white transition-colors"
                style={{ color: "rgba(255,255,255,0.9)" }}
              >
                {game.name}
              </Link>
              <div className="flex items-center gap-2 mt-1">
                <GlassBadge color={game.status === "completed" ? "#22c55e" : "#3b82f6"}>
                  {statusLabel[game.status] ?? game.status}
                </GlassBadge>
                {game.playTime > 0 && (
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    {formatPlayTime(game.playTime)}
                  </span>
                )}
              </div>
            </div>
            {game.lastPlay && (
              <span
                className="text-xs shrink-0"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                {formatDate(game.lastPlay)}
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Steam Section ────────────────────────────────────────────────────────────
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
      <div className="flex items-center justify-center py-6">
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
          <SteamIcon size={18} />
          <span className="font-semibold text-sm">Steam</span>
          {isLinked && (
            <span
              className="ml-auto text-xs flex items-center gap-1"
              style={{ color: "rgba(34,197,94,0.8)" }}
            >
              <CheckCircle2 size={12} />
              Bağlı
            </span>
          )}
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
                leftIcon={<SteamIcon size={14} />}
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
              leftIcon={<SteamIcon size={14} />}
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

// ─── Profile Edit Section ─────────────────────────────────────────────────────
function EditProfileSection({
  name,
  email,
  profileImage,
}: {
  name: string;
  email?: string;
  profileImage?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const updateUser = useAuthStore((s) => s.updateUser);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await authApi.editProfile({ name, profileImage });
      updateUser(updated);
      setEditing(false);
      toast.success("Profil güncellendi");
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex items-center gap-2"
        style={{ color: "rgba(255,255,255,0.85)" }}
      >
        <User size={15} />
        <span className="font-semibold text-sm">Profil Bilgileri</span>
      </div>

      <div className="flex items-center gap-4">
        <Avatar src={profileImage} name={name} size="xl" />
        <div className="flex-1 min-w-0">
          <p
            className="text-base font-semibold"
            style={{ color: "rgba(255,255,255,0.95)" }}
          >
            {name}
          </p>
          {email && (
            <p
              className="text-sm mt-0.5"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {email}
            </p>
          )}
        </div>
        <GlassButton
          size="sm"
          variant="ghost"
          onClick={() => setEditing(!editing)}
          leftIcon={<Settings2 size={13} />}
        >
          Düzenle
        </GlassButton>
      </div>

      {editing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="flex flex-col gap-3 pt-1"
        >
          <GlassInput
            label="Kullanıcı Adı"
            defaultValue={name}
            placeholder="Adınızı değiştirin..."
            id="profile-name"
          />
          <div className="flex justify-end gap-2">
            <GlassButton
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              İptal
            </GlassButton>
            <GlassButton
              size="sm"
              variant="primary"
              loading={saving}
              onClick={handleSave}
            >
              Kaydet
            </GlassButton>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────
function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const { steamLinked, steamError } = Route.useSearch();

  // User-level statistics (Statistics type is aggregate breakdown, not scalar)
  // statsData is disabled for now since its aggregate type doesn't fit stat cards
  // Use auth store counters directly for the profile page
  const { data: recentGamesData } = useQuery({
    queryKey: ["games", "recent", user?._id],
    queryFn: () =>
      user?._id
        ? gamesApi.getUserGames({
            userId: user._id,
            page: 1,
            limit: 6,
            sortBy: "lastPlay",
            order: "desc",
          })
        : Promise.resolve(null),
    enabled: !!user?._id,
    staleTime: 30_000,
  });

  const { data: favoriteGamesData } = useQuery({
    queryKey: ["games", "favorites", user?._id],
    queryFn: () =>
      user?._id
        ? gamesApi.getUserGames({
            userId: user._id,
            page: 1,
            limit: 3,
            sortBy: "lastPlay",
            order: "desc",
            isFavorite: true,
          })
        : Promise.resolve(null),
    enabled: !!user?._id,
    staleTime: 30_000,
  });

  const favoriteGames = favoriteGamesData?.items ?? [];

  const recentGames = recentGamesData?.items ?? [];

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

  // Build stats from auth store (Statistics API returns aggregate breakdown)
  const statItems: StatItem[] = [
    {
      icon: Gamepad2,
      label: "Toplam Oyun",
      value: user.gameSize ?? 0,
      color: "#a855f7",
    },
    {
      icon: Trophy,
      label: "Tamamlanan",
      value: user.completedGameSize ?? 0,
      color: "#22c55e",
    },
    {
      icon: Clock,
      label: "Toplam Süre",
      value: "—",
      color: "#3b82f6",
    },
    {
      icon: Star,
      label: "Ort. Puan",
      value: "—",
      color: "#f59e0b",
    },
  ];

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <PageContainer>
        <div className="max-w-2xl mx-auto flex flex-col gap-6">

          {/* Page title */}
          <div className="flex items-center gap-3">
            <h1
              className="text-2xl font-bold"
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              Profilim
            </h1>
          </div>

          {/* Stats row */}
          <StatsGrid stats={statItems} />

          {/* Profile info card */}
          <GlassCard className="p-6">
            <EditProfileSection
              name={user.name}
              email={user.email}
              profileImage={user.profileImage}
            />
          </GlassCard>

          {/* Favorite games — placed before Recently Played */}
          <FavoriteGamesSection
            favoriteGames={favoriteGames}
            isLoading={!favoriteGamesData}
          />

          {/* Recently played */}
          {recentGames.length > 0 && (
            <GlassCard className="p-6">
              <RecentlyPlayedCard games={recentGames} />
            </GlassCard>
          )}

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