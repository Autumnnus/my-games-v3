import { GlassSelect } from "@/components/ui/GlassSelect";
import type { ImportField, ImportPreset } from "@/api/importExport";

const FIELD_OPTIONS: Array<{ value: ImportField; label: string }> = [
  { value: "name", label: "İsim (name) *" },
  { value: "status", label: "Durum (status)" },
  { value: "rating", label: "Puan (rating)" },
  { value: "playTime", label: "Oynama Süresi (playTime)" },
  { value: "platforms", label: "Platformlar (platforms)" },
  { value: "genres", label: "Türler (genres)" },
  { value: "tags", label: "Etiketler (tags)" },
  { value: "notes", label: "Notlar (notes)" },
  { value: "coverImage", label: "Kapak Görseli (coverImage)" },
  { value: "screenshots", label: "Ekran Görüntüleri (screenshots)" },
  { value: "steamAppId", label: "Steam App ID (steamAppId)" },
  { value: "ignore", label: "Yoksay (ignore)" },
];

const PRESET_LABELS: Record<ImportPreset, string> = {
  steam: "Steam",
  psn: "PlayStation",
  retroachievements: "RetroAchievements",
  manual: "Manuel",
};

interface ColumnMappingTableProps {
  detectedColumns: string[];
  mapping: Record<string, ImportField>;
  onMappingChange: (mapping: Record<string, ImportField>) => void;
  detectedPreset?: ImportPreset | null;
}

export function ColumnMappingTable({
  detectedColumns,
  mapping,
  onMappingChange,
  detectedPreset,
}: ColumnMappingTableProps) {
  function handleChange(col: string, value: ImportField) {
    onMappingChange({ ...mapping, [col]: value });
  }

  return (
    <div className="flex flex-col gap-3">
      {detectedPreset && (
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium self-start"
          style={{
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.3)",
            color: "rgba(34,197,94,0.85)",
          }}
        >
          <span>●</span>
          {PRESET_LABELS[detectedPreset]} hazır ayarı otomatik eşleştirildi
        </div>
      )}

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <div
          className="grid grid-cols-2 gap-4 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
          style={{
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <span>Kaynak Sütun</span>
          <span>Hedef Alan</span>
        </div>

        {/* Rows */}
        <div
          className="divide-y"
          style={{ divideColor: "rgba(255,255,255,0.05)" }}
        >
          {detectedColumns.map((col) => (
            <div
              key={col}
              className="grid grid-cols-2 items-center gap-4 px-4 py-2.5"
            >
              <span
                className="text-sm truncate"
                style={{ color: "rgba(255,255,255,0.75)" }}
                title={col}
              >
                {col}
              </span>
              <GlassSelect
                value={mapping[col] ?? "ignore"}
                onChange={(e) =>
                  handleChange(col, e.target.value as ImportField)
                }
                options={FIELD_OPTIONS}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
