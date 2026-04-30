import type { ExportFilters } from "@/api/importExport";
import { GlassSwitch } from "@/components/ui/GlassSwitch";
import { ALL_PLATFORMS, ALL_STATUSES } from "@/lib/constants";
import type { GameStatus, Platform } from "@my-games/shared";
import { FileJson, FileSpreadsheet } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ExportOptionsProps {
  format: "xlsx" | "json";
  onFormatChange: (format: "xlsx" | "json") => void;
  includeScreenshots: boolean;
  onIncludeScreenshotsChange: (include: boolean) => void;
  filters: ExportFilters;
  onFiltersChange: (filters: ExportFilters) => void;
}

export function ExportOptions({
  format,
  onFormatChange,
  includeScreenshots,
  onIncludeScreenshotsChange,
  filters,
  onFiltersChange,
}: ExportOptionsProps) {
  const { t } = useTranslation();

  function toggleStatus(s: GameStatus) {
    const cur = filters.status ?? [];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    onFiltersChange({ ...filters, status: next });
  }

  function togglePlatform(p: Platform) {
    const cur = filters.platforms ?? [];
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
    onFiltersChange({ ...filters, platforms: next });
  }

  const hasFilters =
    (filters.status?.length ?? 0) > 0 || (filters.platforms?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Format selector */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text-secondary">
          {t("translation:export.formatLabel")}
        </span>
        <div className="flex gap-3">
          <FormatButton
            active={format === "xlsx"}
            onClick={() => onFormatChange("xlsx")}
            icon={<FileSpreadsheet size={18} />}
            label="Excel (.xlsx)"
          />
          <FormatButton
            active={format === "json"}
            onClick={() => onFormatChange("json")}
            icon={<FileJson size={18} />}
            label="JSON (.json)"
          />
        </div>
      </div>

      {/* Screenshots toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-secondary">
            {t("translation:export.includeScreenshots")}
          </p>
          <p className="text-xs mt-0.5 text-text-muted">
            {t("translation:export.includeScreenshotsHint")}
          </p>
        </div>
        <GlassSwitch
          checked={includeScreenshots}
          onChange={(checked) => onIncludeScreenshotsChange(checked)}
        />
      </div>

      {/* Status filter */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">
            {t("translation:export.filterByStatus")}
          </span>
          {hasFilters && (
            <button
              className="text-xs transition-colors hover:underline text-accent"
              onClick={() =>
                onFiltersChange({ ...filters, status: [], platforms: [] })
              }
            >
              {t("translation:export.clearFilters")}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((s) => {
            const active = filters.status?.includes(s) ?? false;
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: active
                    ? "var(--theme-accent-soft)"
                    : "var(--theme-surface-subtle)",
                  border: `1px solid ${active ? "var(--theme-accent-soft)" : "var(--theme-glass-border)"}`,
                  color: active
                    ? "var(--theme-accent)"
                    : "var(--theme-text-muted)",
                }}
              >
                {t(`games.status.${s}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform filter */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text-secondary">
          {t("translation:export.filterByPlatform")}
        </span>
        <div className="flex flex-wrap gap-2">
          {ALL_PLATFORMS.map((p) => {
            const active = filters.platforms?.includes(p) ?? false;
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: active
                    ? "var(--theme-mesh-b)"
                    : "var(--theme-surface-subtle)",
                  border: `1px solid ${active ? "var(--theme-mesh-b)" : "var(--theme-glass-border)"}`,
                  color: active
                    ? "var(--theme-accent-2)"
                    : "var(--theme-text-muted)",
                }}
              >
                {t(`games.platform.${p}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FormatButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all"
      style={{
        background: active
          ? "var(--theme-accent-soft)"
          : "var(--theme-surface-subtle)",
        border: `1.5px solid ${active ? "var(--theme-accent-soft)" : "var(--theme-glass-border)"}`,
        color: active ? "var(--theme-accent)" : "var(--theme-text-muted)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
