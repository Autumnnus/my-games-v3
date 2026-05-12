import { useState, useMemo, useEffect } from "react";
import { Search, CheckSquare, Square, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
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

function GameRow({
  item,
  selected,
  onToggle,
}: {
  item: SteamLibraryItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
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
        border: `1px solid ${selected ? "var(--theme-accent-soft)" : "transparent"}`,
      }}
    >
      {/* Checkbox */}
      <span
        style={{
          color: selected ? "var(--theme-accent)" : "var(--theme-text-muted)",
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
          className="text-sm truncate text-text-secondary"
        >
          {item.title}
        </p>
        {hasConflict && (
          <div
            className="mt-1.5 text-xs flex flex-wrap items-center gap-x-2 gap-y-1 text-text-muted"
          >
            <span>
              {t("steamImport.current")}: {formatPlayTime(item.existingPlaytimeMinutes ?? 0)}
            </span>
            <span>{t("steamImport.steam")}: {formatPlayTime(item.playtimeMinutes)}</span>
            <span style={{ color: "rgba(251,146,60,0.92)" }}>
              {t("steamImport.diff")}: {formatPlayTime(diffMinutes)}
            </span>
          </div>
        )}
      </div>

      {/* Playtime + conflict */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-xs text-text-muted">
          {item.playtimeMinutes > 0
            ? formatPlayTime(item.playtimeMinutes)
            : t('steamImport.zeroPlaytime')}
        </span>
        {hasConflict && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              background: "rgba(251,146,60,0.15)",
              color: "rgba(251,146,60,0.9)",
            }}
          >
            {t("steamImport.conflict")}
          </span>
        )}
        {item.existingPlaytimeMinutes !== undefined && !hasConflict && (
          <span className="text-xs" style={{ color: "rgba(134,239,172,0.7)" }}>
            {t('steamImport.added')}
          </span>
        )}
      </div>
    </button>
  );
}

export function SteamImportModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { data: library, isLoading, error, refetch } = useSteamLibrary(open);
  const syncMutation = useSyncSteam();

  const CONFLICT_OPTIONS: {
    value: ConflictResolution;
    label: string;
    desc: string;
  }[] = [
    {
      value: "higher",
      label: t('steamImport.conflictHigher'),
      desc: t('steamImport.conflictHigherDesc'),
    },
    {
      value: "steam",
      label: t('steamImport.conflictSteam'),
      desc: t('steamImport.conflictSteamDesc'),
    },
    {
      value: "keep",
      label: t('steamImport.conflictKeep'),
      desc: t('steamImport.conflictKeepDesc'),
    },
  ];

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
        t("steamImport.syncStarted", { count: selected.size }),
      );
      onClose();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : t("steamImport.syncFailed"));
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
      title={t("steamImport.title")}
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
              : t("steamImport.loadFailed")}
          </p>
          <GlassButton size="sm" onClick={() => refetch()}>
            {t("steamImport.retry")}
          </GlassButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3 min-h-0">
          {/* Search + select-all */}
          <div className="flex gap-2 shrink-0">
            <GlassInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('steamImport.searchPlaceholder')}
              leftIcon={<Search size={13} />}
              className="flex-1"
            />
            <GlassButton size="sm" onClick={toggleAll} variant="ghost">
              {allFilteredSelected ? t('steamImport.deselectAll') : t('steamImport.selectAll')}
            </GlassButton>
          </div>

          {/* Stats */}
          <div
            className="flex items-center gap-3 text-sm shrink-0 text-text-muted"
          >
            <span>{t("steamImport.totalGames", { count: library?.length ?? 0 })}</span>
            <span>·</span>
            <span className="text-accent">{t("steamImport.selected", { count: selected.size })}</span>
            <span>·</span>
            <span>{t("steamImport.notAdded", { count: notAddedCount })}</span>
            {conflictCount > 0 && (
              <>
                <span>·</span>
                <span style={{ color: "rgba(251,146,60,0.9)" }}>
                  {t("steamImport.hasConflicts", { count: conflictCount })}
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
                  className="text-xs mb-0.5 text-text-muted"
                >
                  {t("steamImport.viewFilters")}
                </span>
                <span className="text-text-secondary">
                  {showNotAdded ? t("steamImport.notAddedGames") : ""}
                  {showNotAdded && showConflicts ? " + " : ""}
                  {showConflicts ? t("steamImport.conflictingGames") : ""}
                  {(showNotAdded || showConflicts) && showAlreadyAdded
                    ? " + "
                    : ""}
                  {showAlreadyAdded ? t("steamImport.alreadyAddedGames") : ""}
                </span>
              </div>
              <ChevronDown
                size={14}
                style={{
                  color: "var(--theme-text-muted)",
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
                      ? "var(--theme-accent-soft)"
                      : "transparent",
                    borderColor: showNotAdded
                      ? "var(--theme-accent-soft)"
                      : "transparent",
                  }}
                >
                  <span
                    className="text-sm"
                    style={{
                      color: showNotAdded
                        ? "var(--theme-text-primary)"
                        : "var(--theme-text-secondary)",
                    }}
                  >
                    t("steamImport.notAddedGames")
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: showNotAdded
                        ? "var(--theme-accent)"
                        : "var(--theme-text-muted)",
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
                        ? "var(--theme-text-primary)"
                        : "var(--theme-text-secondary)",
                    }}
                  >
                    t("steamImport.conflictingGames")
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: showConflicts
                        ? "rgba(251,146,60,0.96)"
                        : "var(--theme-text-muted)",
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
                        ? "var(--theme-text-primary)"
                        : "var(--theme-text-secondary)",
                    }}
                  >
                    t("steamImport.alreadyAddedToggle")
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{
                      color: showAlreadyAdded
                        ? "rgba(74,222,128,0.95)"
                        : "var(--theme-text-muted)",
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
                    className="text-xs mb-0.5 text-text-muted"
                  >
                    {t("steamImport.conflictResolution")}
                  </span>
                  <span className="text-text-secondary">
                    {selectedConflictOption.label}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  style={{
                    color: "var(--theme-text-muted)",
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
                        className="w-full flex flex-col items-start px-3 py-2 rounded-lg text-left hover:bg-glass-surface transition-colors"
                      >
                        <span
                          className="text-sm font-medium"
                          style={{
                            color:
                              conflictResolution === opt.value
                                ? "var(--theme-accent)"
                                : "var(--theme-text-secondary)",
                          }}
                        >
                          {opt.label}
                        </span>
                        <span
                          className="text-xs mt-0.5 text-text-muted"
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
                className="text-center py-8 text-sm text-text-muted"
              >
                {t("steamImport.noGamesFound")}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-glass-border shrink-0">
            <GlassButton variant="ghost" size="sm" onClick={onClose}>
              {t("common.buttons.cancel")}
            </GlassButton>
            <GlassButton
              variant="primary"
              size="sm"
              disabled={selected.size === 0}
              loading={syncMutation.isPending}
              onClick={handleImport}
            >
              {t("steamImport.importN", { count: selected.size })}
            </GlassButton>
          </div>
        </div>
      )}
    </GlassModal>
  );
}
