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
import { useGame } from "@/hooks/useGames";
import { useDynamicGameTheme } from "@/hooks/useDynamicGameTheme";
import { useGameScreenshots } from "@/hooks/useScreenshots";
import { useDeleteMultipleScreenshots } from "@/api/screenshots.api";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
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
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute("/games/$id")({
  component: GameDetailPage,
});

function GameDetailPage() {
  const { t } = useTranslation();
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
  const screenshots = screenshotsData?.items ?? [];
  const dynamicThemeCoverUrl = game?.photo
    ? formatCoverUrl(game.photo, "hero")
    : game?.igdb?.cover?.url
      ? formatCoverUrl(game.igdb.cover.url, "hero")
      : null;

  useDynamicGameTheme(
    dynamicThemeCoverUrl,
    game ? `${game.name}-${game.platform}-${game.status}` : id,
  );

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
        toast.success(t("gameDetail.selected") + " " + t("common.buttons.delete").toLowerCase());
      },
      onError: () => {
        toast.error(t("gameDetail.deleteSelected") + " " + t("common.errors.generic").toLowerCase());
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
            ? t("gameDetail.steamSyncExclude")
            : t("gameDetail.steamSyncExcludeHint"),
        );
      })
      .catch(() => {
        toast.error(t("common.errors.generic"));
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
          style={{ color: "var(--theme-text-muted)" }}
        >
          {t("gameDetail.gameNotFound")}
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
                "linear-gradient(135deg, var(--theme-mesh-a), var(--theme-mesh-b))",
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(transparent 30%, var(--theme-bg-base) 100%)",
          }}
        />
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
          <Link
            to="/games"
            className="glass-btn p-2 rounded-xl self-start mt-4"
            aria-label={t("gameDetail.back")}
          >
            <ArrowLeft size={16} />
          </Link>
          {isOwner && (
            <div className="flex items-center gap-2">
              <WishlistButton
                igdbId={game.igdb?.id ?? game.steamAppId ?? 0}
                gameName={game.name}
                coverUrl={coverUrl ?? undefined}
                platform={game.platform}
                genres={game.igdb?.genres?.map((g) => g.name) ?? []}
                variant="detail"
                steamAppId={game.steamAppId}
              />
              <GlassButton
                size="sm"
                leftIcon={<Edit2 size={13} />}
                onClick={() => setEditOpen(true)}
              >
                {t("gameDetail.edit")}
              </GlassButton>
              <GlassButton
                size="sm"
                variant="danger"
                leftIcon={<Trash2 size={13} />}
                onClick={() => setDeleteOpen(true)}
              >
                {t("gameDetail.remove")}
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
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {t("gameDetail.igdbInfo")}
                </h3>
                {igdb.first_release_date && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--theme-text-muted)" }}>
                      {t("gameDetail.releaseDate")}
                    </span>
                    <span style={{ color: "var(--theme-text-secondary)" }}>
                      {formatUnixDate(igdb.first_release_date)}
                    </span>
                  </div>
                )}
                {igdb.aggregated_rating && (
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--theme-text-muted)" }}>
                      {t("gameDetail.igdbRating")}
                    </span>
                    <span style={{ color: "var(--theme-text-secondary)" }}>
                      {igdb.aggregated_rating.toFixed(0)}/100
                    </span>
                  </div>
                )}
                {igdb.genres && igdb.genres.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-xs"
                      style={{ color: "var(--theme-text-muted)" }}
                    >
                      {t("gameDetail.genres")}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {igdb.genres.map((g) => (
                        <span
                          key={g.id}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: "var(--theme-accent-soft)",
                            color: "var(--theme-accent)",
                            border: "1px solid var(--theme-glass-border-hover)",
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
                      style={{ color: "var(--theme-text-muted)" }}
                    >
                      {t("gameDetail.gameModes")}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {igdb.game_modes.map((m) => (
                        <span
                          key={m.id}
                          className="text-xs px-2 py-0.5 rounded-full glass-card-sm"
                          style={{ color: "var(--theme-text-secondary)" }}
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
                style={{ color: "var(--theme-text-primary)" }}
              >
                {game.name}
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <StatusBadge status={game.status} completionDate={game.completionDate} />
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
                  ⚠️ {t("gameDetail.steamSyncConflict")}
                </p>
                <p
                  className="text-xs"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {t("gameDetail.steamLogged")} {formatPlayTime(steamPlayTime)} {t("gameDetail.youEntered")} {formatPlayTime(game.playTime)}.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <GlassButton
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      steamSyncApi
                        .resolveConflict(id, "take_steam")
                        .then(() => {
                          toast.success(t("gameDetail.takeSteam"));
                          window.location.reload();
                        })
                        .catch(() => toast.error(t("common.errors.generic")));
                    }}
                  >
                    {t("gameDetail.takeSteam")}
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    onClick={() => {
                      steamSyncApi
                        .resolveConflict(id, "keep_manual")
                        .then(() => {
                          toast.success(t("gameDetail.keepMine"));
                          window.location.reload();
                        })
                        .catch(() => toast.error(t("common.errors.generic")));
                    }}
                  >
                    {t("gameDetail.keepMine")}
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      steamSyncApi
                        .resolveConflict(id, "ignore")
                        .then(() => {
                          toast.success(t("gameDetail.ignore"));
                          window.location.reload();
                        })
                        .catch(() => toast.error(t("common.errors.generic")));
                    }}
                  >
                    {t("gameDetail.ignore")}
                  </GlassButton>
                </div>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <GlassCard size="sm" className="p-3 flex flex-col gap-1">
                <span
                  className="text-xs"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {t("gameDetail.duration")}
                </span>
                <span
                  className="text-lg font-semibold"
                  style={{ color: "var(--theme-text-primary)" }}
                >
                  {formatPlayTime(game.playTime)}
                </span>
              </GlassCard>
              <GlassCard size="sm" className="p-3 flex flex-col gap-1">
                <span
                  className="text-xs"
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {t("gameDetail.score")}
                </span>
                <div className="flex items-center gap-2">
                  {game.rating !== undefined && game.rating !== null ? (
                    <RatingStars value={game.rating} readonly size="sm" />
                  ) : (
                    <span
                      className="text-sm"
                      style={{ color: "var(--theme-text-muted)" }}
                    >
                      —
                    </span>
                  )}
                </div>
              </GlassCard>
              {game.completionDate && (
                <GlassCard size="sm" className="p-3 flex flex-col gap-1">
                  <span
                    className="text-xs"
                    style={{ color: "var(--theme-text-muted)" }}
                  >
                    {t("gameDetail.completion")}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "var(--theme-text-secondary)" }}
                  >
                    {formatDate(game.completionDate)}
                  </span>
                </GlassCard>
              )}
              {game.lastPlayDate && (
                <GlassCard size="sm" className="p-3 flex flex-col gap-1">
                  <span
                    className="text-xs"
                    style={{ color: "var(--theme-text-muted)" }}
                  >
                    {t("gameDetail.lastPlay")}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "var(--theme-text-secondary)" }}
                  >
                    {formatDate(game.lastPlayDate)}
                  </span>
                </GlassCard>
              )}
            </div>

            {/* Steam sync exclusion toggle */}
            {isOwner && (
              <div
                className="flex items-center justify-between p-3 rounded-xl"
                style={{
                  background: "var(--theme-surface-subtle)",
                  border: "1px solid var(--theme-glass-border)",
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-sm"
                    style={{ color: "var(--theme-text-secondary)" }}
                  >
                    {t("gameDetail.steamSyncExclude")}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--theme-text-muted)" }}
                  >
                    {t("gameDetail.steamSyncExcludeHint")}
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
                  style={{ color: "var(--theme-text-secondary)" }}
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
                  style={{ color: "var(--theme-text-secondary)" }}
                >
                  {t("gameDetail.screenshots", { count: screenshots.length })}
                </h2>
                {isOwner && (
                  <div className="flex items-center gap-2">
                    <GlassButton
                      size="sm"
                      variant="primary"
                      onClick={() => setAddScreenshotOpen(true)}
                    >
                      + {t("gameDetail.addScreenshot")}
                    </GlassButton>
                    {screenshots.length > 0 && !deleteMode && (
                      <GlassButton
                        size="sm"
                        variant="danger"
                        leftIcon={<Trash2 size={13} />}
                        onClick={() => setDeleteMode(true)}
                      >
                        {t("gameDetail.delete")}
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
                  style={{ color: "var(--theme-text-muted)" }}
                >
                  {t("gameDetail.noScreenshots")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Delete mode bottom bar */}
        {deleteMode && (
          <div className="fixed bottom-0 left-0 right-0 z-50 glass-card border-t border-white/10 px-4 py-3 flex items-center justify-between gap-4">
            <span style={{ color: "var(--theme-text-secondary)" }}>
              {selectedScreenshots.size} {t("gameDetail.selected")}
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
                {t("gameDetail.deleteSelected")}
              </GlassButton>
              <GlassButton
                size="sm"
                leftIcon={<X size={13} />}
                onClick={handleCancelDelete}
              >
                {t("gameDetail.cancel")}
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
