import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Plus, X, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { gamesApi, type GameListItem } from "@/api/games.api";
import { isApiError } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { formatCoverUrl } from "@/lib/formatters";

interface Props {
  open: boolean;
  onClose: () => void;
  onToggle: (entryId: string, isFavorite: boolean) => void;
  queryKey: unknown[];
}

function FavoriteGameRow({
  game,
  onRemove,
}: {
  game: GameListItem;
  onRemove: (id: string) => void;
}) {
  const cover = game.photo ? formatCoverUrl(game.photo, "thumb") : null;
  return (
    <motion.div
      key={game._id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group flex items-center gap-3 p-3 rounded-xl border border-transparent hover:border-white/10 transition-all"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      {/* Cover */}
      <div className="shrink-0 w-10 h-14 rounded-lg overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt={game.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-lg"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            🎮
          </div>
        )}
      </div>

      {/* Name + platform badge */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          {game.name}
        </p>
        <p
          className="text-xs mt-0.5 capitalize"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {game.platform}
        </p>
      </div>

      {/* Remove button */}
      <button
        onClick={() => onRemove(game._id)}
        className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: "rgba(239,68,68,0.12)",
          color: "rgba(239,68,68,0.7)",
        }}
        aria-label="Favorilerden kaldır"
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}

export function FavoriteGamesModal({ open, onClose, onToggle, queryKey }: Props) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  // Fetch all user games (non-favorite) for the add dialog
  // Use a fixed large limit to get all games for searching
  const [allGames, setAllGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadGames() {
    if (!user?._id) return;
    setLoading(true);
    try {
      const data = await gamesApi.getUserGames({
        userId: user._id,
        page: 1,
        limit: 100,
        sortBy: "lastPlay",
        order: "desc",
      });
      setAllGames(data.items.filter((g) => !g.isFavorite));
    } catch {
      toast.error("Oyunlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  // Load on open
  if (open && allGames.length === 0 && !loading) {
    loadGames();
  }

  const filtered = search.trim()
    ? allGames.filter((g) =>
        g.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : allGames;

  async function handleAddToFavorites(game: GameListItem) {
    setSaving(game._id);
    try {
      await gamesApi.editGame(game._id, { isFavorite: true });
      queryClient.invalidateQueries({ queryKey });
      setAllGames((prev) => prev.filter((g) => g._id !== game._id));
      onToggle(game._id, true);
      toast.success(`"${game.name}" favorilere eklendi`);
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Eklenemedi");
    } finally {
      setSaving(null);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Favorilere Ekle"
      size="md"
    >
      <div className="flex flex-col gap-3 min-h-0">
        {/* Search */}
        <GlassInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Oyun ara..."
          leftIcon={<Search size={13} />}
          className="shrink-0"
        />

        {/* Stats */}
        <div
          className="text-xs shrink-0"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {allGames.length} oyun favorilere eklenebilir
        </div>

        {/* Game list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ) : filtered.length === 0 ? (
          <p
            className="text-center py-8 text-sm"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            {search ? "Sonuç bulunamadı" : "Tüm oyunlar zaten favorilerde"}
          </p>
        ) : (
          <div className="flex flex-col gap-1 overflow-y-auto min-h-0 max-h-[clamp(200px,42vh,480px)] pr-1">
            {filtered.map((game) => (
              <motion.div
                key={game._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-white/10 transition-all cursor-pointer"
                style={{ background: "rgba(255,255,255,0.02)" }}
                onClick={() => saving === null && handleAddToFavorites(game)}
              >
                {/* Cover */}
                <div className="shrink-0 w-8 h-10 rounded overflow-hidden">
                  {game.photo ? (
                    <img
                      src={formatCoverUrl(game.photo, "thumb")}
                      alt={game.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-sm"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      🎮
                    </div>
                  )}
                </div>

                {/* Name */}
                <span
                  className="flex-1 text-sm truncate"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  {game.name}
                </span>

                {/* Add button */}
                {saving === game._id ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <span
                    className="shrink-0 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "#a855f7" }}
                  >
                    <Plus size={15} />
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-1 border-t border-white/8 shrink-0">
          <GlassButton variant="ghost" size="sm" onClick={onClose}>
            Kapat
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}