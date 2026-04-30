import { isApiError } from "@/api/client";
import { gamesApi } from "@/api/games.api";
import type { GameListItem } from "@/api/types";
import { GlassBadge } from "@/components/ui/GlassBadge";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { formatCoverUrl, formatPlayTime } from "@/lib/formatters";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { useAuthStore } from "@/store/auth.store";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Star } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FavoriteGamesModal } from "./FavoriteGamesModal";

interface Props {
  favoriteGames: GameListItem[];
  isLoading: boolean;
}

function FavoriteGameCard({
  game,
  onRemove,
}: {
  game: GameListItem;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const cover = game.photo ? formatCoverUrl(game.photo, "thumb") : null;

  return (
    <motion.div
      variants={fadeUp}
      className="group relative flex flex-col gap-2 p-3 rounded-xl border border-transparent hover:border-glass-border transition-all"
      style={{ background: "var(--theme-surface-subtle)" }}
    >
      <div className="absolute top-2 right-2">
        <Star size={14} fill="#f59e0b" stroke="#f59e0b" className="shrink-0" />
      </div>

      <Link to="/games/$id" params={{ id: game._id }} className="shrink-0">
        <div className="w-full aspect-[3/4] rounded-lg overflow-hidden">
          {cover ? (
            <img
              src={cover}
              alt={game.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-2xl"
              style={{ background: "var(--theme-surface-subtle)" }}
            >
              🎮
            </div>
          )}
        </div>
      </Link>

      <Link
        to="/games/$id"
        params={{ id: game._id }}
        className="text-xs font-medium text-center truncate hover:text-white transition-colors text-text-secondary"
      >
        {game.name}
      </Link>

      {game.playTime > 0 && (
        <p className="text-xs text-center text-text-muted">
          {formatPlayTime(game.playTime)}
        </p>
      )}

      <button
        onClick={() => onRemove(game._id)}
        className="mt-1 w-full py-1.5 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity border"
        style={{
          background: "rgba(239,68,68,0.1)",
          borderColor: "rgba(239,68,68,0.2)",
          color: "rgba(239,68,68,0.8)",
        }}
      >
        {t("translation:favorite.remove")}
      </button>
    </motion.div>
  );
}

export function FavoriteGamesSection({ favoriteGames, isLoading }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  async function handleRemove(entryId: string) {
    try {
      await gamesApi.editGame(entryId, { isFavorite: false });
      queryClient.invalidateQueries({
        queryKey: ["games", "favorites", user?._id],
      });
      toast.success(t("translation:favorite.removedFromFavorites"));
    } catch (err) {
      toast.error(
        isApiError(err)
          ? err.message
          : t("translation:favorite.couldNotRemove"),
      );
    }
  }

  function handleToggle(entryId: string, _isFavorite: boolean) {
    // query cache handles refresh
  }

  if (isLoading) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard className="p-6">
        <motion.div
          className="flex flex-col gap-4"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <motion.div
            variants={fadeUp}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Star size={14} style={{ color: "#f59e0b" }} fill="#f59e0b" />
              <h3 className="text-sm font-semibold text-text-secondary">
                {t("translation:favorite.sectionTitle")}
              </h3>
              <GlassBadge color="#f59e0b">{favoriteGames.length}/3</GlassBadge>
            </div>
            {favoriteGames.length < 3 && (
              <GlassButton
                size="sm"
                variant="ghost"
                onClick={() => setModalOpen(true)}
                leftIcon={<Plus size={13} />}
              >
                {t("translation:favorite.addButton")}
              </GlassButton>
            )}
          </motion.div>

          {favoriteGames.length === 0 && (
            <motion.div
              variants={fadeUp}
              className="flex flex-col items-center gap-3 py-6"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: "rgba(245,158,11,0.1)" }}
              >
                <Star size={20} style={{ color: "#f59e0b" }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text-secondary">
                  {t("translation:favorite.emptyTitle")}
                </p>
                <p className="text-xs mt-1 text-text-muted">
                  {t("translation:favorite.emptyHint")}
                </p>
              </div>
              <GlassButton
                size="sm"
                variant="primary"
                onClick={() => setModalOpen(true)}
                leftIcon={<Plus size={13} />}
              >
                {t("translation:profile.addFavorite")}
              </GlassButton>
            </motion.div>
          )}

          {favoriteGames.length > 0 && (
            <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
              <AnimatePresence mode="popLayout">
                {favoriteGames.map((game) => (
                  <FavoriteGameCard
                    key={game._id}
                    game={game}
                    onRemove={handleRemove}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </motion.div>
      </GlassCard>

      <FavoriteGamesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onToggle={handleToggle}
        queryKey={["games", "favorites", user?._id]}
      />
    </>
  );
}
