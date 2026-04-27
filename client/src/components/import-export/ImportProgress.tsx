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
          <span style={{ color: "rgba(255,255,255,0.6)" }}>
            {STATUS_LABELS[status]}
          </span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>
            {current} / {total} ({pct}%)
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="w-full h-2 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${pct}%`,
              background:
                status === "error"
                  ? "rgba(239,68,68,0.7)"
                  : "linear-gradient(90deg, rgba(168,85,247,0.8), rgba(59,130,246,0.8))",
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
            style={{ color: "rgba(255,255,255,0.4)" }}
            title={currentItem}
          >
            {currentItem}
          </span>
        </div>
      )}
    </div>
  );
}
