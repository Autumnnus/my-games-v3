import { Search, Grid3X3, List } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GameStatus, Platform } from "@my-games/shared";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassSelect } from "@/components/ui/GlassSelect";
import {
  ALL_STATUSES,
  ALL_PLATFORMS,
} from "@/lib/constants";
import { useUIStore } from "@/store/ui.store";

interface GameFiltersBarProps {
  status?: GameStatus;
  platform?: Platform;
  sortBy?: string;
  order?: "asc" | "desc";
  search?: string;
  onStatusChange: (v?: GameStatus) => void;
  onPlatformChange: (v?: Platform) => void;
  onSortChange: (sortBy: string, order: "asc" | "desc") => void;
  onSearchChange: (v: string) => void;
}

export function GameFiltersBar({
  status,
  platform,
  sortBy,
  order,
  search,
  onStatusChange,
  onPlatformChange,
  onSortChange,
  onSearchChange,
}: GameFiltersBarProps) {
  const { t } = useTranslation();
  const { gamesViewMode, setGamesViewMode } = useUIStore();
  const currentSort = sortBy && order ? `${sortBy}:${order}` : "lastPlay:desc";

  function handleSortChange(val: string) {
    const [sb, ord] = val.split(":");
    onSortChange(sb, ord as "asc" | "desc");
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "rgba(255,255,255,0.4)" }}
        />
        <input
          type="text"
          placeholder={t("common.buttons.search")}
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          className="glass-input w-full pl-9 pr-4 py-2.5 text-sm"
        />
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status chips */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => onStatusChange(undefined)}
            className={`glass-btn text-xs px-3 py-1.5 rounded-full ${!status ? "glass-btn-primary" : ""}`}
          >
            {t("export.all")}
          </button>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(status === s ? undefined : s)}
              className={`glass-btn text-xs px-3 py-1.5 rounded-full ${status === s ? "glass-btn-primary" : ""}`}
            >
              {t(`games.status.${s}`)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Platform filter */}
          <GlassSelect
            value={platform ?? ""}
            onChange={(e) =>
              onPlatformChange((e.target.value as Platform) || undefined)
            }
            options={ALL_PLATFORMS.map((p) => ({
              value: p,
              label: t(`games.platform.${p}`),
            }))}
            placeholder={t("games.form.platform")}
            className="text-xs py-1.5 min-w-32"
          />

          {/* Sort */}
          <GlassSelect
            value={currentSort}
            onChange={(e) => handleSortChange(e.target.value)}
            options={[
              { value: "lastPlay:desc", label: t("games.sort.lastPlayed") },
              { value: "createdAt:desc", label: t("games.sort.createdAt") },
              { value: "name:asc", label: t("games.sort.name") },
              { value: "rating:desc", label: t("games.sort.highestRated") },
              { value: "playTime:desc", label: t("games.sort.mostPlayed") },
            ]}
            className="text-xs py-1.5 min-w-36"
          />

          {/* View toggle */}
          <div className="flex items-center glass-card-sm p-0.5 gap-0.5">
            <GlassButton
              variant={gamesViewMode === "grid" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setGamesViewMode("grid")}
              className="p-1.5 rounded-lg border-0"
              aria-label={t("games.view.grid")}
            >
              <Grid3X3 size={14} />
            </GlassButton>
            <GlassButton
              variant={gamesViewMode === "list" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setGamesViewMode("list")}
              className="p-1.5 rounded-lg border-0"
              aria-label={t("games.view.list")}
            >
              <List size={14} />
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
  );
}
