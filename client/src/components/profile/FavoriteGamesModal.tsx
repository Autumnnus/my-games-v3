import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { gamesApi } from "@/api/games.api";
import { isApiError } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { formatCoverUrl } from "@/lib/formatters";

interface Props {
  open: boolean;
  onClose: () => void;
  onToggle: (entryId: string, isFavorite: boolean) => void;
  queryKey: unknown[];
}

export function FavoriteGamesModal({ open, onClose, onToggle, queryKey }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const [allGames, setAllGames] = useState<Array<{ _id: string; name: string; photo?: string; platform: string }>>([]);
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
      toast.error(t("favorite.couldNotAdd"));
    } finally {
      setLoading(false);
    }
  }

  if (open && allGames.length === 0 && !loading) {
    loadGames();
  }

  const filtered = search.trim()
    ? allGames.filter((g) =>
        g.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : allGames;

  async function handleAddToFavorites(game: { _id: string; name: string }) {
    setSaving(game._id);
    try {
      await gamesApi.editGame(game._id, { isFavorite: true });
      queryClient.invalidateQueries({ queryKey });
      setAllGames((prev) => prev.filter((g) => g._id !== game._id));
      onToggle(game._id, true);
      toast.success(t("favorite.addedToFavorites"));
    } catch (err) {
      const msg = isApiError(err) ? err.message : t("favorite.couldNotAdd");
      if (isApiError(err) && err.httpStatus === 400 && err.message.toLowerCase().includes("favorite")) {
        toast.error(t("favorite.favoriteLimitReached"));
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t("favorite.title")}
      size="md"
    >
      <div className="flex flex-col gap-3 min-h-0">
        <GlassInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("favorite.searchPlaceholder")}
          leftIcon={<Search size={13} />}
          className="shrink-0"
        />

        <div
          className="text-xs shrink-0"
          style={{ color: "var(--theme-text-muted)" }}
        >
          {t("favorite.gamesAvailable", { count: allGames.length })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ) : filtered.length === 0 ? (
          <p
            className="text-center py-8 text-sm"
            style={{ color: "var(--theme-text-muted)" }}
          >
            {search ? t("favorite.noResults") : t("favorite.allFavorited")}
          </p>
        ) : (
          <div className="flex flex-col gap-1 overflow-y-auto min-h-0 max-h-[clamp(200px,42vh,480px)] pr-1">
            {filtered.map((game) => (
              <motion.div
                key={game._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-white/10 transition-all cursor-pointer"
                style={{ background: "var(--theme-surface-subtle)" }}
                onClick={() => saving === null && handleAddToFavorites(game)}
              >
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
                      style={{ background: "var(--theme-surface-subtle)" }}
                    >
                      🎮
                    </div>
                  )}
                </div>

                <span
                  className="flex-1 text-sm truncate"
                  style={{ color: "var(--theme-text-secondary)" }}
                >
                  {game.name}
                </span>

                {saving === game._id ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <span
                    className="shrink-0 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--theme-accent)" }}
                  >
                    <Plus size={15} />
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-1 border-t border-white/8 shrink-0">
          <GlassButton variant="ghost" size="sm" onClick={onClose}>
            {t("favorite.close")}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
