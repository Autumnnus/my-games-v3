import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  const [showIgnored, setShowIgnored] = useState(false);

  function handleChange(col: string, value: ImportField) {
    onMappingChange({ ...mapping, [col]: value });
  }

  // Split columns into "active" (not ignored) and "ignored"
  const activeColumns = detectedColumns.filter(
    (col) => (mapping[col] ?? "ignore") !== "ignore",
  );
  const ignoredColumns = detectedColumns.filter(
    (col) => (mapping[col] ?? "ignore") === "ignore",
  );

  const hasIgnored = ignoredColumns.length > 0;
  const hasActive = activeColumns.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Preset detection banner */}
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

      {/* Info callout */}
      <div
        className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          color: "rgba(255,255,255,0.45)",
        }}
      >
        <span
          className="mt-0.5 shrink-0"
          style={{ color: "rgba(251,191,36,0.7)", fontSize: "0.9rem" }}
        >
          ⚡
        </span>
        <span>
          Yalnızca eşleştirmek istediğin sütunları seç — diğerleri otomatik olarak
          yoksayılır.{" "}
          <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>
            İsim (name)
          </span>{" "}
          alanı zorunludur.
        </span>
      </div>

      {/* Active mapping table */}
      {hasActive && (
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
            {activeColumns.map((col) => {
              const isName = mapping[col] === "name";
              return (
                <div
                  key={col}
                  className="grid grid-cols-2 items-center gap-4 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-sm truncate"
                      style={{ color: "rgba(255,255,255,0.75)" }}
                      title={col}
                    >
                      {col}
                    </span>
                    {isName && (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0"
                        style={{
                          background: "rgba(251,191,36,0.12)",
                          border: "1px solid rgba(251,191,36,0.3)",
                          color: "rgba(251,191,36,0.9)",
                        }}
                      >
                        Zorunlu
                      </span>
                    )}
                  </div>
                  <GlassSelect
                    value={mapping[col] ?? "ignore"}
                    onChange={(e) =>
                      handleChange(col, e.target.value as ImportField)
                    }
                    options={FIELD_OPTIONS}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No active columns state */}
      {!hasActive && (
        <div
          className="flex flex-col items-center gap-2 py-8 rounded-xl text-center"
          style={{
            border: "1px dashed rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.3)",
          }}
        >
          <span className="text-2xl">📋</span>
          <p className="text-sm">
            Hiçbir sütun eşleştirilmedi. Aşağıdaki toggle ile yoksayılan
            sütunları görüntüle.
          </p>
        </div>
      )}

      {/* Ignored columns toggle / section */}
      {hasIgnored && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowIgnored((v) => !v)}
            className="flex items-center gap-1.5 text-xs transition-all cursor-pointer w-fit"
            style={{
              color: "rgba(255,255,255,0.35)",
              background: "none",
              border: "none",
              padding: "2px 0",
            }}
          >
            <span
              style={{
                transform: showIgnored ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
                display: "inline-block",
              }}
            >
              ▶
            </span>
            {showIgnored
              ? "Yoksayılan sütunları gizle"
              : "Yoksayılan sütunları göster"}
            <span
              className="ml-1 px-1.5 py-0.5 rounded text-xs"
              style={{
                background: "rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {ignoredColumns.length}
            </span>
          </button>

          <AnimatePresence>
            {showIgnored && (
              <motion.div
                key="ignored-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden rounded-xl"
                style={{ border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div style={{ opacity: 0.65 }}>
                  <div
                    className="grid grid-cols-2 gap-4 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      color: "rgba(255,255,255,0.25)",
                    }}
                  >
                    <span>Kaynak Sütun</span>
                    <span>Hedef Alan</span>
                  </div>
                  <div
                    className="divide-y"
                    style={{ divideColor: "rgba(255,255,255,0.03)" }}
                  >
                    {ignoredColumns.map((col) => (
                      <div
                        key={col}
                        className="grid grid-cols-2 items-center gap-4 px-4 py-2"
                      >
                        <span
                          className="text-xs truncate"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                          title={col}
                        >
                          {col}
                        </span>
                        <GlassSelect
                          value="ignore"
                          onChange={(e) =>
                            handleChange(col, e.target.value as ImportField)
                          }
                          options={FIELD_OPTIONS}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
