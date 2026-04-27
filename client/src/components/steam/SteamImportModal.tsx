import { useState, useMemo, useEffect } from "react";
import { Search, CheckSquare, Square, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useSteamLibrary, useSyncSteam } from "@/hooks/useSteam";
import { isApiError } from "@/api/client";
import type { ConflictResolution, SteamLibraryItem } from "@/api/steam.api";
import { formatPlayTime } from "@/lib/formatters";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CONFLICT_OPTIONS: {
  value: ConflictResolution;
  label: string;
  desc: string;
}[] = [
  {
    value: "higher",
    label: "En yükseği al",
    desc: "Mevcut ve Steam süresinden büyük olanı kullan",
  },
  {
    value: "steam",
    label: "Steam'i üzerine yaz",
    desc: "Her zaman Steam'deki süreyi kullan",
  },
  { value: "keep", label: "Mevcut koru", desc: "Zaten ekli oyunlara dokunma" },
];

function GameRow({
  item,
  selected,
  onToggle,
}: {
  item: SteamLibraryItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const hasConflict =
    item.existingPlaytimeMinutes !== undefined &&
    item.existingPlaytimeMinutes !== item.playtimeMinutes;
  const diffMinutes = hasConflict
    ? Math.abs((item.existingPlaytimeMinutes ?? 0) - item.playtimeMinutes)
    : 0;

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-start gap-3 px-3 py-2 rounded-lg transition-colors text-left"
      style={{
        background: selected ? "rgba(168,85,247,0.08)" : "transparent",
        border: `1px solid ${selected ? "rgba(168,85,247,0.25)" : "transparent"}`,
      }}
    >
      {/* Checkbox */}
      <span
        style={{
          color: selected ? "#a855f7" : "rgba(255,255,255,0.3)",
          flexShrink: 0,
        }}
      >
        {selected ? <CheckSquare size={16} /> : <Square size={16} />}
      </span>

      {/* Cover */}
      <img
        src={item.coverUrl}
        alt={item.title}
        className="w-8 h-10 object-cover rounded"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />

      {/* Title + conflict details */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm truncate"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {item.title}
        </p>
        {hasConflict && (
          <div
            className="mt-1.5 text-xs flex flex-wrap items-center gap-x-2 gap-y-1"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <span>
              Mevcut: {formatPlayTime(item.existingPlaytimeMinutes ?? 0)}
            </span>
            <span>Steam: {formatPlayTime(item.playtimeMinutes)}</span>
            <span style={{ color: "rgba(251,146,60,0.92)" }}>
              Fark: {formatPlayTime(diffMinutes)}
            </span>
          </div>
        )}
      </div>

      {/* Playtime + conflict */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
          {item.playtimeMinutes > 0
            ? formatPlayTime(item.playtimeMinutes)
            : "0 dk"}
        </span>
        {hasConflict && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              background: "rgba(251,146,60,0.15)",
              color: "rgba(251,146,60,0.9)",
            }}
          >
            Çakışma
          </span>
        )}
        {item.existingPlaytimeMinutes !== undefined && !hasConflict && (
          <span className="text-xs" style={{ color: "rgba(134,239,172,0.7)" }}>
            Eklendi
          </span>
        )}
      </div>
    </button>
  );
}

export function SteamImportModal({ open, onClose }: Props) {
  const { data: library, isLoading, error, refetch } = useSteamLibrary(open);
  const syncMutation = useSyncSteam();

  const [search, setSearch] = useState("");
  const [conflictResolution, setConflictResolution] =
    useState<ConflictResolution>("higher");
  const [showConflictPicker, setShowConflictPicker] = useState(false);
  const [showViewFilters, setShowViewFilters] = useState(false);
  const [showNotAdded, setShowNotAdded] = useState(true);
  const [showConflicts, setShowConflicts] = useState(true);
  const [showAlreadyAdded, setShowAlreadyAdded] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  function isConflict(item: SteamLibraryItem) {
    return (
      item.existingPlaytimeMinutes !== undefined &&
      item.existingPlaytimeMinutes !== item.playtimeMinutes
    );
  }

  function isAlreadyAdded(item: SteamLibraryItem) {
    return item.existingPlaytimeMinutes !== undefined;
  }

  function isAlreadyAddedSamePlaytime(item: SteamLibraryItem) {
    return (
      item.existingPlaytimeMinutes !== undefined &&
      item.existingPlaytimeMinutes === item.playtimeMinutes
    );
  }

  // Initialize selection once library loads: only select non-imported games with >0 min playtime
  useEffect(() => {
    if (library) {
      setSelected(
        new Set(
          library
            .filter((g) => g.playtimeMinutes > 0 && !isAlreadyAdded(g))
            .map((g) => g.appId),
        ),
      );
    }
  }, [library]);

  // Refetch when modal opens (in case data is stale)
  useEffect(() => {
    if (open) refetch();
  }, [open]);

  const filtered = useMemo(() => {
    if (!library) return [];
    const q = search.trim().toLowerCase();
    const byText = q
      ? library.filter((g) => g.title.toLowerCase().includes(q))
      : library;

    return byText.filter((g) => {
      if (isConflict(g)) return showConflicts;
      if (!isAlreadyAdded(g)) return showNotAdded;
      return showAlreadyAdded;
    });
  }, [library, search, showNotAdded, showConflicts, showAlreadyAdded]);

  const conflictCount =
    library?.filter(
      (g) =>
        g.existingPlaytimeMinutes !== undefined &&
        g.existingPlaytimeMinutes !== g.playtimeMinutes,
    ).length ?? 0;
  const notAddedCount = library?.filter((g) => !isAlreadyAdded(g)).length ?? 0;
  const alreadyAddedCount =
    library?.filter((g) => isAlreadyAddedSamePlaytime(g)).length ?? 0;

  function toggleAll() {
    if (filtered.every((g) => selected.has(g.appId))) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((g) => next.delete(g.appId));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((g) => next.add(g.appId));
        return next;
      });
    }
  }

  async function handleImport() {
    if (!selected.size) return;
    try {
      await syncMutation.mutateAsync({
        appIds: [...selected],
        conflictResolution,
      });
      toast.info(
        `${selected.size} oyun için tarama başlatıldı, arka planda devam ediyor...`,
      );
      onClose();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Senkronizasyon başarısız");
    }
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((g) => selected.has(g.appId));
  const selectedConflictOption = CONFLICT_OPTIONS.find(
    (o) => o.value === conflictResolution,
  )!;

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Steam Kütüphanesini İçe Aktar"
      size="xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <p className="text-sm" style={{ color: "rgba(239,68,68,0.85)" }}>
            {isApiError(error)
              ? error.message
              : "Steam kütüphanesi yüklenemedi"}
          </p>
          <GlassButton size="sm" onClick={() => refetch()}>
            Tekrar Dene
          </GlassButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3 min-h-0">
          {/* Search + select-all */}
          <div className="flex gap-2 shrink-0">
            <GlassInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Oyun ara..."
              leftIcon={<Search size={13} />}
              className="flex-1"
            />
            <GlassButton size="sm" onClick={toggleAll} variant="ghost">
              {allFilteredSelected ? "Hepsini Kaldır" : "Hepsini Seç"}
            </GlassButton>
          </div>

          {/* Stats */}
          <div
            className="flex items-center gap-3 text-sm shrink-0"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <span>{library?.length ?? 0} oyun</span>
            <span>·</span>
            <span style={{ color: "#a855f7" }}>{selected.size} seçili</span>
            <span>·</span>
            <span>{notAddedCount} eklenmemiş</span>
            {conflictCount > 0 && (
              <>
                <span>·</span>
                <span style={{ color: "rgba(251,146,60,0.9)" }}>
                  {conflictCount} çakışma var
                </span>
              </>
            )}
          </div>

          {/* View filters */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowViewFilters((p) => !p)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm glass-btn"
            >
              <div className="flex flex-col items-start">
                <span
                  className="text-xs mb-0.5"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  Görünüm filtreleri
                </span>
                <span style={{ color: "rgba(255,255,255,0.85)" }}>
                  {showNotAdded ? "Eklenmemişler" : ""}
                  {showNotAdded && showConflicts ? " + " : ""}
                  {showConflicts ? "Çakışanlar" : ""}
                  {(showNotAdded || showConflicts) && showAlreadyAdded
                    ? " + "
                    : ""}
                  {showAlreadyAdded ? "Ekli olanlar" : ""}
                </span>
              </div>
              <ChevronDown
                size={14}
                style={{
                  color: "rgba(255,255,255,0.4)",
                  transform: showViewFilters ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
            </button>
            {showViewFilters && (
              <div className="absolute top-full mt-1 left-0 right-0 glass-card glass-dropdown-menu p-1 z-20">
                <button
                  onClick={() => setShowNotAdded((p) => !p)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors border"
                  style={{
                    background: showNotAdded
                      ? "rgba(168,85,247,0.16)"
                      : "transparent",
                    borderColor: showNotAdded
                      ? "rgba(168,85,247,0.45)"
                      : "transparent",
                  }}
                >
                  <span
                    className="text-sm"
                    style={{
                      color: showNotAdded
                        ? "rgba(255,255,255,0.97)"
                        : "rgba(255,255,255,0.85)",
                    }}
                  >
                    Eklenmemişler
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: showNotAdded
                        ? "#c084fc"
                        : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {notAddedCount}
                  </span>
                </button>
                <button
                  onClick={() => setShowConflicts((p) => !p)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors border"
                  style={{
                    background: showConflicts
                      ? "rgba(251,146,60,0.16)"
                      : "transparent",
                    borderColor: showConflicts
                      ? "rgba(251,146,60,0.48)"
                      : "transparent",
                  }}
                >
                  <span
                    className="text-sm"
                    style={{
                      color: showConflicts
                        ? "rgba(255,255,255,0.97)"
                        : "rgba(255,255,255,0.85)",
                    }}
                  >
                    Çakışanlar
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: showConflicts
                        ? "rgba(251,146,60,0.96)"
                        : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {conflictCount}
                  </span>
                </button>
                <button
                  onClick={() => setShowAlreadyAdded((p) => !p)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors border"
                  style={{
                    background: showAlreadyAdded
                      ? "rgba(74,222,128,0.14)"
                      : "transparent",
                    borderColor: showAlreadyAdded
                      ? "rgba(74,222,128,0.42)"
                      : "transparent",
                  }}
                >
                  <span
                    className="text-sm"
                    style={{
                      color: showAlreadyAdded
                        ? "rgba(255,255,255,0.97)"
                        : "rgba(255,255,255,0.85)",
                    }}
                  >
                    Ekli olanlar (gizle/göster)
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: showAlreadyAdded
                        ? "rgba(74,222,128,0.95)"
                        : "rgba(255,255,255,0.45)",
                    }}
                  >
                    {alreadyAddedCount}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Conflict resolution — only show when there are conflicts */}
          {conflictCount > 0 && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowConflictPicker((p) => !p)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm glass-btn"
              >
                <div className="flex flex-col items-start">
                  <span
                    className="text-xs mb-0.5"
                    style={{ color: "rgba(255,255,255,0.4)" }}
                  >
                    Çakışma çözümü
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.85)" }}>
                    {selectedConflictOption.label}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    transform: showConflictPicker ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s",
                  }}
                />
              </button>
              {showConflictPicker && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowConflictPicker(false)}
                  />
                  <div className="absolute top-full mt-1 left-0 right-0 glass-card glass-dropdown-menu p-1 z-20">
                    {CONFLICT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setConflictResolution(opt.value);
                          setShowConflictPicker(false);
                        }}
                        className="w-full flex flex-col items-start px-3 py-2 rounded-lg text-left hover:bg-white/5 transition-colors"
                      >
                        <span
                          className="text-sm font-medium"
                          style={{
                            color:
                              conflictResolution === opt.value
                                ? "#a855f7"
                                : "rgba(255,255,255,0.85)",
                          }}
                        >
                          {opt.label}
                        </span>
                        <span
                          className="text-xs mt-0.5"
                          style={{ color: "rgba(255,255,255,0.4)" }}
                        >
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Game list — takes remaining space and scrolls */}
          <div className="flex flex-col gap-0.5 overflow-y-auto min-h-0 pr-1 max-h-[clamp(280px,52vh,620px)]">
            {filtered.map((item) => (
              <GameRow
                key={item.appId}
                item={item}
                selected={selected.has(item.appId)}
                onToggle={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    next.has(item.appId)
                      ? next.delete(item.appId)
                      : next.add(item.appId);
                    return next;
                  })
                }
              />
            ))}
            {filtered.length === 0 && (
              <p
                className="text-center py-8 text-sm"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                Oyun bulunamadı
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/8 shrink-0">
            <GlassButton variant="ghost" size="sm" onClick={onClose}>
              İptal
            </GlassButton>
            <GlassButton
              variant="primary"
              size="sm"
              disabled={selected.size === 0}
              loading={syncMutation.isPending}
              onClick={handleImport}
            >
              {selected.size} Oyunu İçe Aktar
            </GlassButton>
          </div>
        </div>
      )}
    </GlassModal>
  );
}
