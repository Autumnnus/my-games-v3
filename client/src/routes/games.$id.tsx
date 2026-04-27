import { DeleteGameConfirm } from "@/components/games/DeleteGameConfirm";
import { EditGameModal } from "@/components/games/EditGameModal";
import { PlatformIcon } from "@/components/games/PlatformIcon";
import { StatusBadge } from "@/components/games/StatusBadge";
import { PageContainer } from "@/components/layout/PageContainer";
import { AddScreenshotModal } from "@/components/screenshots/AddScreenshotModal";
import { ScreenshotCard } from "@/components/screenshots/ScreenshotCard";
import { ScreenshotLightbox } from "@/components/screenshots/ScreenshotLightbox";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassSwitch } from "@/components/ui/GlassSwitch";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { RatingStars } from "@/components/ui/RatingStars";
import { useGame, useEditGame } from "@/hooks/useGames";
import { useGameScreenshots } from "@/hooks/useScreenshots";
import { useDeleteMultipleScreenshots } from "@/api/screenshots.api";
import { steamSyncApi } from "@/api/steamSync";
import {
  formatCoverUrl,
  formatDate,
  formatPlayTime,
  formatUnixDate,
} from "@/lib/formatters";
import { pageTransition } from "@/lib/motion";
import { useAuthStore } from "@/store/auth.store";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Edit2, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/games/$id")({
  component: GameDetailPage,
});

function GameDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: game, isLoading } = useGame(id);
  const { data: screenshotsData } = useGameScreenshots(id);
  const { user, isAuthenticated } = useAuthStore();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addScreenshotOpen, setAddScreenshotOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedScreenshots, setSelectedScreenshots] = useState<Set<string>>(
    new Set(),
  );

  const deleteMutation = useDeleteMultipleScreenshots(id);
  const editGame = useEditGame();

  const screenshots = screenshotsData?.items ?? [];

  const authed = isAuthenticated();
  const isOwner = authed && game?.userId === user?._id;

  const handleSelectScreenshot = (screenshotId: string) => {
    setSelectedScreenshots((prev) => {
      const next = new Set(prev);
      if (next.has(screenshotId)) {
        next.delete(screenshotId);
      } else {
        next.add(screenshotId);
      }
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedScreenshots.size === 0) return;
    deleteMutation.mutate(Array.from(selectedScreenshots), {
      onSuccess: () => {
        setSelectedScreenshots(new Set());
        setDeleteMode(false);
        toast.success("Seçilen görseller silindi");
      },
      onError: () => {
        toast.error("Silme işlemi başarısız");
      },
    });
  };

  const handleCancelDelete = () => {
    setDeleteMode(false);
    setSelectedScreenshots(new Set());
  };

  const handleToggleExclude = (exclude: boolean) => {
    if (!game) return;
    steamSyncApi
      .setExclusion(game._id, exclude)
      .then(() => {
        toast.success(
          exclude
            ? "Steam senkronizasyonundan çıkarıldı"
            : "Steam senkronizasyonuna eklendi",
        );
      })
      .catch(() => {
        toast.error("Ayarlar güncellenemedi");
      });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-56px)]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!game) {
    return (
      <PageContainer>
        <div
          className="text-center py-20"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          Oyun bulunamadı.
        </div>
      </PageContainer>
    );
  }

  const coverUrl = game.photo ? formatCoverUrl(game.photo, "hero") : null;
  const igdb = game.igdb;
  const syncStatus = (game as any).syncStatus;
  const steamSyncExclude = (game as any).steamSyncExclude ?? false;
  const steamPlayTime = (game as any).steamPlayTime ?? null;
  const hasConflict = syncStatus === "conflict" || syncStatus === "draft";

  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Hero */}
      <div className="relative h-64 sm:h-80 overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={game.name}
            fetchPriority="high"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(59,130,246,0.2))",
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(transparent 30%, var(--color-bg-base) 100%)",
          }}
        />
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
          <Link
            to="/games"
            className="glass-btn p-2 rounded-xl self-start mt-4"
            aria-label="Geri"
          >
            <ArrowLeft size={16} />
          </Link>
          {isOwner && (
            <div className="flex items-center gap-2">
              <GlassButton
                size="sm"
                leftIcon={<Edit2 size={13} />}
                onClick={() => setEditOpen(true)}
              >
                Düzenle
              </GlassButton>
              <GlassButton
                size="sm"
                variant="danger"
                leftIcon={<Trash2 size={13} />}
                onClick={() => setDeleteOpen(true)}
              >
                Kaldır
              </GlassButton>
            </div>
          )}
        </div>
      </div>

      <PageContainer>
        <div className="grid gap-6 lg:grid-cols-[300px_1fr] mt-4">
          {/* Left: Cover + IGDB meta */}
          <div className="flex flex-col gap-4">
            {coverUrl && (
              <div className="hidden lg:block">
                <img
                  src={formatCoverUrl(game.photo!, "big")}
                  alt={game.name}
                  className="w-full rounded-2xl object-cover"
                  style={{ aspectRatio: "3/4" }}
                />
              </div>
            )}
            {igdb && (
              <GlassCard className="p-4 flex flex-col gap-3">
                <h3
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  IGDB Bilgisi
                </h3>
                {igdb.first_release_date && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>
                      Çıkış Tarihi
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.8)" }}>
                      {formatUnixDate(igdb.first_release_date)}
                    </span>
                  </div>
                )}
                {igdb.aggregated_rating && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>
                      IGDB Puanı
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.8)" }}>
                      {igdb.aggregated_rating.toFixed(0)}/100
                    </span>
                  </div>
                )}
                {igdb.genres && igdb.genres.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-xs"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                    >
                      Türler
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {igdb.genres.map((g) => (
                        <span
                          key={g.id}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: "rgba(168,85,247,0.15)",
                            color: "rgba(168,85,247,0.9)",
                            border: "1px solid rgba(168,85,247,0.3)",
                          }}
                        >
                          {g.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {igdb.game_modes && igdb.game_modes.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-xs"
                      style={{ color: "rgba(255,255,255,0.4)" }}
                    >
                      Oyun Modu
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {igdb.game_modes.map((m) => (
                        <span
                          key={m.id}
                          className="text-xs px-2 py-0.5 rounded-full glass-card-sm"
                          style={{ color: "rgba(255,255,255,0.6)" }}
                        >
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </GlassCard>
            )}
          </div>

          {/* Right: User entry */}
          <div className="flex flex-col gap-5">
            <div>
              <h1
                className="text-3xl font-bold"
                style={{ color: "rgba(255,255,255,0.95)" }}
              >
                {game.name}
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <StatusBadge status={game.status} />
                <PlatformIcon platform={game.platform} showLabel />
                {game.isFavorite && (
                  <Star size={14} className="fill-yellow-400 text-yellow-400" />
                )}
              </div>
            </div>

            {/* Conflict banner */}
            {hasConflict && steamPlayTime != null && (
              <div
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{
                  background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.25)",
                }}
              >
                <p
                  className="text-sm font-medium"
                  style={{ color: "rgba(251,191,36,0.95)" }}
                >
                  ⚠️ Steam senkronizasyon çakışması var
                </p>
                <p
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  Steam {formatPlayTime(steamPlayTime)} kaydetmiş, sen{" "}
                  {formatPlayTime(game.playTime)} girdin.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <GlassButton
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      steamSyncApi
                        .resolveConflict(id, "take_steam")
                        .then(() => {
                          toast.success("Steam değeri alındı");
                          window.location.reload();
                        })
                        .catch(() => toast.error("Uygulanamadı"));
                    }}
                  >
                    Steam'i Al
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    onClick={() => {
                      steamSyncApi
                        .resolveConflict(id, "keep_manual")
                        .then(() => {
                          toast.success("Senin değerin korundu");
                          window.location.reload();
                        })
                        .catch(() => toast.error("Uygulanamadı"));
                    }}
                  >
                    Benimki Kalsın
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      steamSyncApi
                        .resolveConflict(id, "ignore")
                        .then(() => {
                          toast.success("Yoksayıldı");
                          window.location.reload();
                        })
                        .catch(() => toast.error("Uygulanamadı"));
                    }}
                  >
                    Yoksay
                  </GlassButton>
                </div>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <GlassCard size="sm" className="p-3 flex flex-col gap-1">
                <span
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  Süre
                </span>
                <span
                  className="text-lg font-semibold"
                  style={{ color: "rgba(255,255,255,0.9)" }}
                >
                  {formatPlayTime(game.playTime)}
                </span>
              </GlassCard>
              <GlassCard size="sm" className="p-3 flex flex-col gap-1">
                <span
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  Puan
                </span>
                <div className="flex items-center gap-2">
                  {game.rating !== undefined && game.rating !== null ? (
                    <RatingStars value={game.rating} readonly size="sm" />
                  ) : (
                    <span
                      className="text-sm"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                      —
                    </span>
                  )}
                </div>
              </GlassCard>
              {game.firstFinished && (
                <GlassCard size="sm" className="p-3 flex flex-col gap-1">
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    İlk Bitiş
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "rgba(255,255,255,0.7)" }}
                  >
                    {formatDate(game.firstFinished)}
                  </span>
                </GlassCard>
              )}
            </div>

            {/* Steam sync exclusion toggle */}
            {isOwner && (
              <div
                className="flex items-center justify-between p-3 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-sm"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    Steam senkronizasyonundan çıkar
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    Bu oyunun oynama süresi Steam tarafından güncellenmez
                  </span>
                </div>
                <GlassSwitch
                  checked={steamSyncExclude}
                  onChange={handleToggleExclude}
                />
              </div>
            )}

            {/* Review */}
            {game.review && (
              <GlassCard className="p-4">
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  {game.review}
                </p>
              </GlassCard>
            )}

            {/* Screenshots section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2
                  className="text-base font-semibold"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  Ekran Görüntüleri ({screenshots.length})
                </h2>
                {isOwner && (
                  <div className="flex items-center gap-2">
                    <GlassButton
                      size="sm"
                      variant="primary"
                      onClick={() => setAddScreenshotOpen(true)}
                    >
                      + Ekle
                    </GlassButton>
                    {screenshots.length > 0 && !deleteMode && (
                      <GlassButton
                        size="sm"
                        variant="danger"
                        leftIcon={<Trash2 size={13} />}
                        onClick={() => setDeleteMode(true)}
                      >
                        Sil
                      </GlassButton>
                    )}
                  </div>
                )}
              </div>

              {screenshots.length > 0 ? (
                <div className="columns-2 sm:columns-3 gap-3 space-y-3">
                  {screenshots.map((ss, i) => (
                    <div key={ss._id} className="break-inside-avoid mb-3">
                      <ScreenshotCard
                        screenshot={ss}
                        onClick={() => setLightboxIndex(i)}
                        readonly={!isOwner}
                        selectable={deleteMode}
                        selected={selectedScreenshots.has(ss._id)}
                        onSelect={handleSelectScreenshot}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="glass-card p-8 text-center"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  Henüz ekran görüntüsü yok
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Delete mode bottom bar */}
        {deleteMode && (
          <div className="fixed bottom-0 left-0 right-0 z-50 glass-card border-t border-white/10 px-4 py-3 flex items-center justify-between gap-4">
            <span style={{ color: "rgba(255,255,255,0.85)" }}>
              {selectedScreenshots.size} seçili
            </span>
            <div className="flex items-center gap-2">
              <GlassButton
                size="sm"
                variant="danger"
                leftIcon={<Trash2 size={13} />}
                onClick={handleDeleteSelected}
                disabled={
                  selectedScreenshots.size === 0 || deleteMutation.isPending
                }
              >
                Seçilenleri Sil
              </GlassButton>
              <GlassButton
                size="sm"
                leftIcon={<X size={13} />}
                onClick={handleCancelDelete}
              >
                İptal
              </GlassButton>
            </div>
          </div>
        )}
      </PageContainer>

      {isOwner && (
        <>
          <EditGameModal
            game={editOpen ? game : null}
            onClose={() => setEditOpen(false)}
          />
          <DeleteGameConfirm
            game={deleteOpen ? game : null}
            onClose={() => setDeleteOpen(false)}
            onDeleted={() => navigate({ to: "/games" })}
          />
          <AddScreenshotModal
            gameId={id}
            steamAppId={game.steamAppId}
            open={addScreenshotOpen}
            onClose={() => setAddScreenshotOpen(false)}
          />
        </>
      )}
      <ScreenshotLightbox
        screenshots={screenshots}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </motion.div>
  );
}
