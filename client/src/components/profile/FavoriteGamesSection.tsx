import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Star, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassBadge } from "@/components/ui/GlassBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { gamesApi } from "@/api/games.api";
import { isApiError } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { formatCoverUrl, formatPlayTime } from "@/lib/formatters";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { FavoriteGamesModal } from "./FavoriteGamesModal";
import type { GameListItem } from "@/api/games.api";

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
  const cover = game.photo ? formatCoverUrl(game.photo, "thumb") : null;

  return (
    <motion.div
      variants={fadeUp}
      className="group relative flex flex-col gap-2 p-3 rounded-xl border border-transparent hover:border-white/10 transition-all"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      {/* Star badge */}
      <div className="absolute top-2 right-2">
        <Star
          size={14}
          fill="#f59e0b"
          stroke="#f59e0b"
          className="shrink-0"
        />
      </div>

      {/* Cover */}
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
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              🎮
            </div>
          )}
        </div>
      </Link>

      {/* Name */}
      <Link
        to="/games/$id"
        params={{ id: game._id }}
        className="text-xs font-medium text-center truncate hover:text-white transition-colors"
        style={{ color: "rgba(255,255,255,0.85)" }}
      >
        {game.name}
      </Link>

      {/* Meta */}
      {game.playTime > 0 && (
        <p
          className="text-xs text-center"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {formatPlayTime(game.playTime)}
        </p>
      )}

      {/* Remove button */}
      <button
        onClick={() => onRemove(game._id)}
        className="mt-1 w-full py-1.5 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity border"
        style={{
          background: "rgba(239,68,68,0.1)",
          borderColor: "rgba(239,68,68,0.2)",
          color: "rgba(239,68,68,0.8)",
        }}
      >
        Kaldır
      </button>
    </motion.div>
  );
}

export function FavoriteGamesSection({ favoriteGames, isLoading }: Props) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function handleRemove(entryId: string) {
    setRemoving(entryId);
    try {
      await gamesApi.editGame(entryId, { isFavorite: false });
      queryClient.invalidateQueries({ queryKey: ["games", "favorites", user?._id] });
      toast.success("Favorilerden kaldırıldı");
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Kaldırılamadı");
    } finally {
      setRemoving(null);
    }
  }

  function handleToggle(entryId: string, isFavorite: boolean) {
    // Called after modal adds a game — the query cache will handle refresh
    // but we can optimistically signal if needed
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
          {/* Header */}
          <motion.div
            variants={fadeUp}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Star size={14} style={{ color: "#f59e0b" }} fill="#f59e0b" />
              <h3
                className="text-sm font-semibold"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                Favori Oyunlar
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
                Ekle
              </GlassButton>
            )}
          </motion.div>

          {/* Empty state */}
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
                <p
                  className="text-sm font-medium"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  Henüz favori oyun yok
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  En fazla 3 oyun favorine ekleyebilirsin
                </p>
              </div>
              <GlassButton
                size="sm"
                variant="primary"
                onClick={() => setModalOpen(true)}
                leftIcon={<Plus size={13} />}
              >
                Favori Ekle
              </GlassButton>
            </motion.div>
          )}

          {/* Favorite game grid */}
          {favoriteGames.length > 0 && (
            <motion.div
              variants={fadeUp}
              className="grid grid-cols-3 gap-3"
            >
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