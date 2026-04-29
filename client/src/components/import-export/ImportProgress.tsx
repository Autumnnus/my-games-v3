import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export type ImportStatus =
  | "parsing"
  | "mapping"
  | "uploading_screenshots"
  | "importing"
  | "done"
  | "error";

interface ImportProgressProps {
  total: number;
  current: number;
  currentItem: string;
  status: ImportStatus;
}

const STATUS_LABELS: Record<ImportStatus, string> = {
  parsing: "Dosya işleniyor...",
  mapping: "Sütunlar eşleştiriliyor...",
  uploading_screenshots: "Ekran görüntüleri yükleniyor...",
  importing: "Oyunlar içe aktarılıyor...",
  done: "Tamamlandı!",
  error: "Hata oluştu",
};

export function ImportProgress({
  total,
  current,
  currentItem,
  status,
}: ImportProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5 py-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: "var(--theme-text-secondary)" }}>
            {STATUS_LABELS[status]}
          </span>
          <span style={{ color: "var(--theme-text-muted)" }}>
            {current} / {total} ({pct}%)
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="w-full h-2 rounded-full overflow-hidden"
          style={{ background: "var(--theme-surface-strong)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${pct}%`,
              background:
                status === "error"
                  ? "rgba(239,68,68,0.7)"
                  : "linear-gradient(90deg, var(--theme-accent), var(--theme-accent-2))",
            }}
          />
        </div>
      </div>

      {/* Current item */}
      {currentItem && (
        <div className="flex items-center gap-2 text-xs">
          <LoadingSpinner size="sm" />
          <span
            className="truncate"
            style={{ color: "var(--theme-text-muted)" }}
            title={currentItem}
          >
            {currentItem}
          </span>
        </div>
      )}
    </div>
  );
}
