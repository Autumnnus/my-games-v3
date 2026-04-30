import { gamesApi, type AddGameInput } from "@/api/games.api";
import type { IGDBSearchResult } from "@/api/types";
import { wishlistApi, type WishlistItem } from "@/api/wishlist.api";
import { IGDBSearchCombobox } from "@/components/games/IGDBSearchCombobox";
import { PlatformIcon } from "@/components/games/PlatformIcon";
import { PageContainer } from "@/components/layout/PageContainer";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassTextarea } from "@/components/ui/GlassTextarea";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ALL_PLATFORMS } from "@/lib/constants";
import { formatCoverUrl } from "@/lib/formatters";
import { fadeUp, staggerContainer } from "@/lib/motion";
import type { GameStatus, Platform } from "@my-games/shared";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  BookOpen,
  Building2,
  Calendar,
  Heart,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wishlist")({
  component: WishlistPage,
});

// ─── Move to Library Modal ─────────────────────────────────────────────────────
interface MoveToLibraryModalProps {
  item: WishlistItem;
  onClose: () => void;
  onMoved: () => void;
}

function MoveToLibraryModal({
  item,
  onClose,
  onMoved,
}: MoveToLibraryModalProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<Platform>(
    (item.platform as Platform) || "steam",
  );
  const [status, setStatus] = useState<GameStatus>("toBeCompleted");
  const [playTime, setPlayTime] = useState(0);
  const [rating, setRating] = useState<number | "">("");
  const [review, setReview] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await gamesApi.addGame({
        name: item.name,
        platform,
        status,
        playTime,
        rating: rating !== "" ? Number(rating) : undefined,
        review: review.trim() || undefined,
        isFavorite,
        photo: item.coverUrl,
        steamAppId: item.steamAppId,
        igdb: item.igdbData as object | undefined,
      } as AddGameInput);
      await wishlistApi.remove(item._id);
      toast.success(t("translation:wishlist.moveToLibrary") + " ✓");
      onMoved();
      onClose();
    } catch {
      toast.error(t("translation:common.errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  const statusOptions: { value: GameStatus; label: string }[] = [
    {
      value: "activePlaying",
      label: t("translation:games.status.activePlaying"),
    },
    {
      value: "toBeCompleted",
      label: t("translation:games.status.toBeCompleted"),
    },
    { value: "completed", label: t("translation:games.status.completed") },
    { value: "abandoned", label: t("translation:games.status.abandoned") },
  ];

  return (
    <GlassModal
      open
      onClose={onClose}
      title={t("translation:wishlist.moveToLibrary")}
      size="sm"
    >
      <div className="flex flex-col gap-4">
        {/* Game preview */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-subtle border border-glass-border">
          {item.coverUrl ? (
            <img
              src={formatCoverUrl(item.coverUrl, "thumb")}
              alt={item.name}
              className="w-12 rounded-lg object-cover flex-shrink-0"
              style={{ aspectRatio: "3/4" }}
            />
          ) : (
            <div
              className="w-12 rounded-lg flex items-center justify-center glass-card-sm flex-shrink-0 text-2xl"
              style={{ aspectRatio: "3/4" }}
            >
              🎮
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate text-text-primary">
              {item.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {item.releaseYear && (
                <span className="text-xs text-text-muted">
                  {item.releaseYear}
                </span>
              )}
              {item.developer && (
                <span className="text-xs text-text-muted">
                  · {item.developer}
                </span>
              )}
            </div>
            {item.genres?.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {item.genres.slice(0, 3).map((g) => (
                  <span
                    key={g}
                    className="text-xs px-1.5 py-0.5 rounded-full bg-accent-soft text-accent"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Platform + Status */}
        <div className="grid grid-cols-2 gap-3">
          <GlassSelect
            label={t("translation:common.labels.platform")}
            value={platform}
            onChange={(v) => setPlatform(v as Platform)}
            options={ALL_PLATFORMS.map((p) => ({
              value: p,
              label: t(`games.platform.${p}`),
            }))}
          />
          <GlassSelect
            label={t("translation:common.labels.status")}
            value={status}
            onChange={(v) => setStatus(v as GameStatus)}
            options={statusOptions}
          />
        </div>

        {/* Play time + Rating */}
        <div className="grid grid-cols-2 gap-3">
          <GlassInput
            label={`${t("translation:common.labels.playTime")} (h)`}
            type="number"
            value={playTime}
            onChange={(e) => setPlayTime(parseInt(e.target.value) || 0)}
            min={0}
          />
          <GlassInput
            label={`${t("translation:common.labels.rating")} (1-10)`}
            type="number"
            value={rating}
            onChange={(e) =>
              setRating(
                e.target.value === ""
                  ? ""
                  : Math.min(10, Math.max(1, parseInt(e.target.value) || 1)),
              )
            }
            min={1}
            max={10}
            placeholder="—"
          />
        </div>

        {/* Review */}
        <GlassTextarea
          label={t("translation:common.labels.review")}
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={3}
          placeholder={t("translation:games.form.reviewPlaceholder")}
        />

        {/* Favorite toggle */}
        <button
          type="button"
          onClick={() => setIsFavorite((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-sm ${
            isFavorite
              ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
              : "bg-surface-subtle border-glass-border text-text-muted"
          }`}
        >
          <Star size={14} className={isFavorite ? "fill-current" : ""} />
          {t("translation:common.labels.favorite")}
        </button>

        <div className="flex gap-2 justify-end">
          <GlassButton size="sm" onClick={onClose}>
            {t("translation:common.buttons.cancel")}
          </GlassButton>
          <GlassButton
            size="sm"
            variant="primary"
            onClick={handleSubmit}
            loading={loading}
          >
            {t("translation:wishlist.moveToLibrary")}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Steam Import Modal ───────────────────────────────────────────────────────
interface SteamImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

function SteamImportModal({ onClose, onImported }: SteamImportModalProps) {
  const { t } = useTranslation();
  const [steamId, setSteamId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    failed: number;
    alreadyExists: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!steamId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await wishlistApi.importFromSteam(steamId.trim());
      setResult(data);
      if (data.imported > 0) onImported();
    } catch (e: any) {
      setError(e.message || "Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassModal
      open
      onClose={onClose}
      title={t("translation:wishlist.steamImport")}
      size="sm"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          {t("translation:wishlist.steamIdPlaceholder")}
        </p>
        <GlassInput
          type="text"
          value={steamId}
          onChange={(e) => setSteamId(e.target.value)}
          placeholder="76561198012345678"
          onKeyDown={(e) => e.key === "Enter" && handleImport()}
          error={error ?? undefined}
        />
        {result && (
          <div className="p-3 rounded-xl text-xs bg-success-soft border border-success/20 text-success">
            {t("translation:wishlist.importResults", {
              imported: result.imported,
              failed: result.failed,
              exists: result.alreadyExists,
            })}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <GlassButton size="sm" onClick={onClose}>
            {t("translation:common.buttons.cancel")}
          </GlassButton>
          <GlassButton
            size="sm"
            variant="primary"
            onClick={handleImport}
            disabled={!steamId.trim()}
            loading={loading}
          >
            {t("translation:wishlist.import")}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Add Game Modal ────────────────────────────────────────────────────────────
interface AddGameModalProps {
  onClose: () => void;
  onAdded: () => void;
}

function AddGameModal({ onClose, onAdded }: AddGameModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<IGDBSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const coverUrl = selected.cover?.url
        ? formatCoverUrl(selected.cover.url, "big")
        : undefined;
      const releaseYear = selected.first_release_date
        ? new Date(selected.first_release_date * 1000).getFullYear()
        : undefined;
      const developer = selected.involved_companies?.find((c) => c.developer)
        ?.company.name;

      await wishlistApi.add({
        igdbId: selected.id,
        name: selected.name,
        coverUrl,
        platform: "steam",
        genres: selected.genres?.map((g) => g.name) ?? [],
        releaseYear,
        developer,
        igdbData: {
          id: selected.id,
          name: selected.name,
          cover: selected.cover as any,
          first_release_date: selected.first_release_date,
          genres: selected.genres,
          involved_companies: selected.involved_companies as any,
        },
      });
      toast.success(t("translation:wishlist.addToWishlist") + " ✓");
      onAdded();
      onClose();
    } catch {
      toast.error(t("translation:common.errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassModal
      open
      onClose={onClose}
      title={t("translation:wishlist.addGame")}
      size="sm"
    >
      <div className="flex flex-col gap-4">
        <IGDBSearchCombobox
          onSelect={(game) => setSelected(game)}
          placeholder={t("translation:wishlist.addGame")}
        />
        {selected && (
          <div
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{
              background: "var(--theme-surface-subtle)",
              border: "1px solid var(--theme-glass-border)",
            }}
          >
            {selected.cover?.url && (
              <img
                src={formatCoverUrl(selected.cover.url, "thumb")}
                alt={selected.name}
                className="w-10 rounded-lg object-cover flex-shrink-0"
                style={{ aspectRatio: "3/4" }}
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate text-text-primary">
                {selected.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {selected.first_release_date && (
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    <Calendar size={10} />
                    {new Date(selected.first_release_date * 1000).getFullYear()}
                  </span>
                )}
                {selected.involved_companies?.find((c) => c.developer) && (
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    <Building2 size={10} />
                    {
                      selected.involved_companies.find((c) => c.developer)!
                        .company.name
                    }
                  </span>
                )}
              </div>
              {selected.genres && selected.genres.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {selected.genres.slice(0, 3).map((g) => (
                    <span
                      key={g.id}
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        background: "var(--theme-accent-soft)",
                        color: "var(--theme-accent)",
                      }}
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <GlassButton size="sm" onClick={onClose}>
            {t("translation:common.buttons.cancel")}
          </GlassButton>
          <GlassButton
            size="sm"
            variant="primary"
            onClick={handleAdd}
            disabled={loading || !selected}
          >
            {loading
              ? t("translation:common.buttons.loading")
              : t("translation:wishlist.addGame")}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

// ─── Wishlist Item Card ───────────────────────────────────────────────────────
interface WishlistItemCardProps {
  item: WishlistItem;
  onRemove: () => void;
  onMoveToLibrary: () => void;
}

function WishlistItemCard({
  item,
  onRemove,
  onMoveToLibrary,
}: WishlistItemCardProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      variants={fadeUp}
      className="glass-card glass-card-hover overflow-hidden group relative flex flex-col"
    >
      {/* Cover */}
      <div className="relative flex-shrink-0" style={{ aspectRatio: "3/4" }}>
        {item.coverUrl ? (
          <img
            src={formatCoverUrl(item.coverUrl, "big")}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              fontSize: "2.5rem",
              background: "var(--theme-surface-subtle)",
            }}
          >
            🎮
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Remove button */}
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg glass-btn opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "rgba(239,68,68,0.85)" }}
          aria-label={t("translation:wishlist.remove")}
        >
          <Trash2 size={13} />
        </button>

        {/* Source badge */}
        {item.source === "steam" && (
          <div className="absolute top-2 left-2 z-10 text-xs px-2 py-0.5 rounded-full glass-card-sm font-medium">
            Steam
          </div>
        )}

        {/* Bottom info over image */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p
            className="text-sm font-semibold leading-tight"
            style={{ color: "#fff" }}
          >
            {item.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <PlatformIcon platform={item.platform as Platform} />
            {item.releaseYear && (
              <span
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.65)" }}
              >
                {item.releaseYear}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card footer */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Developer */}
        {item.developer && (
          <p className="text-xs truncate flex items-center gap-1 text-text-muted">
            <Building2 size={10} className="flex-shrink-0" />
            {item.developer}
          </p>
        )}

        {/* Genres */}
        {item.genres?.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {item.genres.slice(0, 2).map((g) => (
              <span
                key={g}
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: "var(--theme-accent-soft)",
                  color: "var(--theme-accent)",
                }}
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Move to library button */}
        <div className="mt-auto pt-1">
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={onMoveToLibrary}
            className="w-full justify-center"
          >
            <BookOpen size={12} /> {t("translation:wishlist.moveToLibrary")}
          </GlassButton>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function WishlistPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [steamImportOpen, setSteamImportOpen] = useState(false);
  const [addGameOpen, setAddGameOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<WishlistItem | null>(null);

  const fetchWishlist = async () => {
    try {
      const data = await wishlistApi.getAll();
      setItems(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, []);

  const handleRemove = async (id: string) => {
    try {
      await wishlistApi.remove(id);
      setItems((prev) => prev.filter((i) => i._id !== id));
      toast.success(t("translation:wishlist.remove") + " ✓");
    } catch {
      toast.error(t("translation:common.errors.generic"));
    }
  };

  const handleMoved = () => {
    if (moveItem) {
      setItems((prev) => prev.filter((i) => i._id !== moveItem._id));
      setMoveItem(null);
    }
  };

  return (
    <PageContainer>
      <motion.div
        className="max-w-6xl mx-auto flex flex-col gap-6"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <motion.div
          variants={fadeUp}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Heart size={24} className="text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">
              {t("translation:wishlist.title")}
            </h1>
            {items.length > 0 && (
              <span
                className="text-sm px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--theme-accent-soft)",
                  color: "var(--theme-accent)",
                }}
              >
                {items.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <GlassButton
              size="sm"
              variant="ghost"
              leftIcon={<RotateCcw size={13} />}
              onClick={() => setSteamImportOpen(true)}
            >
              {t("translation:wishlist.steamImport")}
            </GlassButton>
            <GlassButton
              size="sm"
              variant="primary"
              leftIcon={<Plus size={13} />}
              onClick={() => setAddGameOpen(true)}
            >
              {t("translation:wishlist.addGame")}
            </GlassButton>
          </div>
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <LoadingSpinner />
          </div>
        ) : items.length === 0 ? (
          <motion.div
            variants={fadeUp}
            className="flex flex-col items-center justify-center py-24 gap-4"
          >
            <Heart size={64} className="text-white/10" />
            <p className="text-lg font-medium text-text-primary">
              {t("translation:wishlist.empty")}
            </p>
            <p className="text-sm text-text-muted">
              {t("translation:wishlist.emptyHint")}
            </p>
            <div className="flex gap-2 mt-2">
              <GlassButton
                size="sm"
                variant="ghost"
                onClick={() => setSteamImportOpen(true)}
              >
                {t("translation:wishlist.steamImport")}
              </GlassButton>
              <GlassButton
                size="sm"
                variant="primary"
                onClick={() => setAddGameOpen(true)}
              >
                {t("translation:wishlist.addGame")}
              </GlassButton>
            </div>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
          >
            {items.map((item) => (
              <WishlistItemCard
                key={item._id}
                item={item}
                onRemove={() => handleRemove(item._id)}
                onMoveToLibrary={() => setMoveItem(item)}
              />
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* Modals */}
      {steamImportOpen && (
        <SteamImportModal
          onClose={() => setSteamImportOpen(false)}
          onImported={fetchWishlist}
        />
      )}
      {addGameOpen && (
        <AddGameModal
          onClose={() => setAddGameOpen(false)}
          onAdded={fetchWishlist}
        />
      )}
      {moveItem && (
        <MoveToLibraryModal
          item={moveItem}
          onClose={() => setMoveItem(null)}
          onMoved={handleMoved}
        />
      )}
    </PageContainer>
  );
}
