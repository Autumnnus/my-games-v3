import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createFileRoute } from "@tanstack/react-router";
import {
  Heart,
  Plus,
  Trash2,
  BookOpen,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassModal } from "@/components/ui/GlassModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { IGDBSearchCombobox } from "@/components/games/IGDBSearchCombobox";
import { PlatformIcon } from "@/components/games/PlatformIcon";
import { wishlistApi, type WishlistItem } from "@/api/wishlist.api";
import { gamesApi, type AddGameInput } from "@/api/games.api";
import { formatCoverUrl } from "@/lib/formatters";
import { fadeUp, staggerContainer } from "@/lib/motion";
import type { IGDBSearchResult } from "@/api/types";
import type { Platform } from "@my-games/shared";

export const Route = createFileRoute("/_authenticated/wishlist")({
  component: WishlistPage,
});

// ─── Move to Library Modal ─────────────────────────────────────────────────────
interface MoveToLibraryModalProps {
  item: WishlistItem;
  onClose: () => void;
  onMoved: () => void;
}

function MoveToLibraryModal({ item, onClose, onMoved }: MoveToLibraryModalProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<Platform>((item.platform as Platform) || "steam");
  const [status, setStatus] = useState<"activePlaying" | "toBeCompleted" | "backlog">("backlog");
  const [playTime, setPlayTime] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await gamesApi.addGame({
        name: item.name,
        platform,
        status,
        playTime,
        photo: item.coverUrl,
        steamAppId: item.steamAppId,
      } as AddGameInput);
      toast.success(t("wishlist.moveToLibrary") + " ✓");
      onMoved();
      onClose();
    } catch {
      toast.error(t("common.errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  const platforms: Platform[] = ["steam", "epicGames", "ubisoft", "xboxPc", "eaGames", "playstation", "xboxSeries", "nintendo", "mobile", "otherPlatforms"];

  return (
    <GlassModal open onClose={onClose} title={t("wishlist.moveToLibrary")} size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--theme-surface-subtle)", border: "1px solid var(--theme-glass-border)" }}>
          {item.coverUrl ? (
            <img src={formatCoverUrl(item.coverUrl, "thumb")} alt={item.name} className="w-12 h-15 rounded-lg object-cover" style={{ aspectRatio: "3/4" }} />
          ) : (
            <div className="w-12 h-15 rounded-lg flex items-center justify-center glass-card-sm">🎮</div>
          )}
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>{item.name}</p>
            <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{item.source === "steam" ? "Steam" : item.platform}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{t("common.labels.platform")}</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            className="glass-input"
          >
            {platforms.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{t("common.labels.status")}</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="glass-input"
          >
            <option value="activePlaying">{t("games.status.activePlaying")}</option>
            <option value="toBeCompleted">{t("games.status.toBeCompleted")}</option>
            <option value="backlog">{t("games.status.backlog")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--theme-text-muted)" }}>{t("common.labels.playTime")}</label>
          <input
            type="number"
            value={playTime}
            onChange={(e) => setPlayTime(parseInt(e.target.value) || 0)}
            className="glass-input"
            min={0}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <GlassButton size="sm" onClick={onClose}>{t("common.buttons.cancel")}</GlassButton>
          <GlassButton size="sm" variant="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t("common.buttons.loading") : t("wishlist.moveToLibrary")}
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
  const [result, setResult] = useState<{ imported: number; failed: number; alreadyExists: number } | null>(null);
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
    <GlassModal open onClose={onClose} title={t("wishlist.steamImport")} size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
          {t("wishlist.steamIdPlaceholder")}
        </p>
        <input
          type="text"
          value={steamId}
          onChange={(e) => setSteamId(e.target.value)}
          placeholder="76561198012345678"
          className="glass-input"
        />
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
        {result && (
          <div className="p-3 rounded-xl text-xs" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}>
            {t("wishlist.importResults", { imported: result.imported, failed: result.failed, exists: result.alreadyExists })}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <GlassButton size="sm" onClick={onClose}>{t("common.buttons.cancel")}</GlassButton>
          <GlassButton size="sm" variant="primary" onClick={handleImport} disabled={loading || !steamId.trim()}>
            {loading ? <><Loader2 size={13} className="animate-spin" /> {t("wishlist.importing")}</> : t("wishlist.import")}
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
      await wishlistApi.add({
        igdbId: selected.id,
        name: selected.name,
        coverUrl: selected.cover?.url ? formatCoverUrl(selected.cover.url, "big") : undefined,
        platform: "steam",
        genres: selected.genres?.map((g) => g.name) ?? [],
      });
      toast.success(t("wishlist.addToWishlist") + " ✓");
      onAdded();
      onClose();
    } catch {
      toast.error(t("common.errors.generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassModal open onClose={onClose} title={t("wishlist.addGame")} size="sm">
      <div className="flex flex-col gap-4">
        <IGDBSearchCombobox
          onSelect={(game) => setSelected(game)}
          placeholder={t("wishlist.addGame")}
        />
        {selected && (
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--theme-surface-subtle)", border: "1px solid var(--theme-glass-border)" }}>
            {selected.cover?.url && (
              <img src={formatCoverUrl(selected.cover.url, "thumb")} alt={selected.name} className="w-10 h-12 rounded-lg object-cover" />
            )}
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--theme-text-primary)" }}>{selected.name}</p>
              {selected.first_release_date && (
                <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
                  {new Date(selected.first_release_date * 1000).getFullYear()}
                </p>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <GlassButton size="sm" onClick={onClose}>{t("common.buttons.cancel")}</GlassButton>
          <GlassButton size="sm" variant="primary" onClick={handleAdd} disabled={loading || !selected}>
            {loading ? t("common.buttons.loading") : t("wishlist.addGame")}
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

function WishlistItemCard({ item, onRemove, onMoveToLibrary }: WishlistItemCardProps) {
  const { t } = useTranslation();

  return (
    <motion.div variants={fadeUp} className="glass-card glass-card-hover overflow-hidden group relative">
      <div className="relative" style={{ aspectRatio: "3/4" }}>
        {item.coverUrl ? (
          <img src={formatCoverUrl(item.coverUrl, "big")} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ fontSize: "2.5rem" }}>🎮</div>
        )}
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {/* Remove button */}
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg glass-btn opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "rgba(239,68,68,0.8)" }}
          aria-label={t("wishlist.remove")}
        >
          <Trash2 size={14} />
        </button>
        {/* Source badge */}
        {item.source === "steam" && (
          <div className="absolute top-2 left-2 z-10 text-xs px-2 py-0.5 rounded-full glass-card-sm">Steam</div>
        )}
        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-sm font-medium truncate" style={{ color: "#fff" }}>{item.name}</p>
          <div className="flex items-center gap-1 mt-1">
            <PlatformIcon platform={item.platform as Platform} />
          </div>
        </div>
      </div>
      {/* Action */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {item.genres?.slice(0, 2).map((g) => (
            <span key={g} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "var(--theme-accent-soft)", color: "var(--theme-accent)" }}>{g}</span>
          ))}
        </div>
        <GlassButton size="sm" variant="ghost" onClick={onMoveToLibrary}>
          <BookOpen size={12} /> {t("wishlist.moveToLibrary")}
        </GlassButton>
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

  useEffect(() => { fetchWishlist(); }, []);

  const handleRemove = async (id: string) => {
    try {
      await wishlistApi.remove(id);
      setItems((prev) => prev.filter((i) => i._id !== id));
      toast.success(t("wishlist.remove") + " ✓");
    } catch {
      toast.error(t("common.errors.generic"));
    }
  };

  const handleMoveToLibrary = (item: WishlistItem) => {
    setMoveItem(item);
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
        <motion.div variants={fadeUp} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart size={24} style={{ color: "var(--theme-accent)" }} />
            <h1 className="text-2xl font-bold" style={{ color: "var(--theme-text-primary)" }}>
              {t("wishlist.title")}
            </h1>
            {items.length > 0 && (
              <span className="text-sm px-2 py-0.5 rounded-full" style={{ background: "var(--theme-accent-soft)", color: "var(--theme-accent)" }}>
                {items.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <GlassButton size="sm" variant="ghost" leftIcon={<RotateCcw size={13} />} onClick={() => setSteamImportOpen(true)}>
              {t("wishlist.steamImport")}
            </GlassButton>
            <GlassButton size="sm" variant="primary" leftIcon={<Plus size={13} />} onClick={() => setAddGameOpen(true)}>
              {t("wishlist.addGame")}
            </GlassButton>
          </div>
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <LoadingSpinner />
          </div>
        ) : items.length === 0 ? (
          <motion.div variants={fadeUp} className="flex flex-col items-center justify-center py-24 gap-4">
            <Heart size={64} className="text-white/10" />
            <p className="text-lg font-medium" style={{ color: "var(--theme-text-primary)" }}>
              {t("wishlist.empty")}
            </p>
            <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
              {t("wishlist.emptyHint")}
            </p>
            <div className="flex gap-2 mt-2">
              <GlassButton size="sm" variant="ghost" onClick={() => setSteamImportOpen(true)}>
                {t("wishlist.steamImport")}
              </GlassButton>
              <GlassButton size="sm" variant="primary" onClick={() => setAddGameOpen(true)}>
                {t("wishlist.addGame")}
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
                onMoveToLibrary={() => handleMoveToLibrary(item)}
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