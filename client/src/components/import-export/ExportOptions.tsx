import { FileSpreadsheet, FileJson } from "lucide-react";
import { GlassSwitch } from "@/components/ui/GlassSwitch";
import { GlassSelect } from "@/components/ui/GlassSelect";
import type { Platform, GameStatus } from "@my-games/shared";
import type { ExportFilters } from "@/api/importExport";

const STATUS_OPTIONS: Array<{ value: GameStatus; label: string }> = [
  { value: "completed", label: "Tamamlandı" },
  { value: "activePlaying", label: "Oynuyor" },
  { value: "toBeCompleted", label: "Beklemede" },
  { value: "abandoned", label: "Bırakıldı" },
];

const PLATFORM_OPTIONS: Array<{ value: Platform; label: string }> = [
  { value: "steam", label: "Steam" },
  { value: "epicGames", label: "Epic Games" },
  { value: "ubisoft", label: "Ubisoft" },
  { value: "playstation", label: "PlayStation" },
  { value: "xboxSeries", label: "Xbox Series" },
  { value: "xboxPc", label: "Xbox PC" },
  { value: "nintendo", label: "Nintendo" },
  { value: "mobile", label: "Mobil" },
  { value: "otherPlatforms", label: "Diğer" },
];

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
        <span
          className="text-sm font-medium"
          style={{ color: "var(--theme-text-secondary)" }}
        >
          Format
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
          <p
            className="text-sm font-medium"
            style={{ color: "var(--theme-text-secondary)" }}
          >
            Ekran görüntüsü URL&apos;leri dahil et
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--theme-text-muted)" }}
          >
            Dışa aktarılan dosyada screenshot linkleri
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
          <span
            className="text-sm font-medium"
            style={{ color: "var(--theme-text-secondary)" }}
          >
            Duruma göre filtrele
          </span>
          {hasFilters && (
            <button
              className="text-xs transition-colors hover:underline"
              style={{ color: "var(--theme-accent)" }}
              onClick={() =>
                onFiltersChange({ ...filters, status: [], platforms: [] })
              }
            >
              Temizle
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const active = filters.status?.includes(opt.value) ?? false;
            return (
              <button
                key={opt.value}
                onClick={() => toggleStatus(opt.value)}
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
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform filter */}
      <div className="flex flex-col gap-2">
        <span
          className="text-sm font-medium"
          style={{ color: "var(--theme-text-secondary)" }}
        >
          Platforma göre filtrele
        </span>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map((opt) => {
            const active = filters.platforms?.includes(opt.value) ?? false;
            return (
              <button
                key={opt.value}
                onClick={() => togglePlatform(opt.value)}
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
                {opt.label}
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
        background: active ? "var(--theme-accent-soft)" : "var(--theme-surface-subtle)",
        border: `1.5px solid ${active ? "var(--theme-accent-soft)" : "var(--theme-glass-border)"}`,
        color: active ? "var(--theme-accent)" : "var(--theme-text-muted)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
