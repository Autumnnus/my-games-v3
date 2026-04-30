import type { ImportField, ImportPreset } from "@/api/importExport";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const FIELD_OPTIONS_KEYS: Array<{ value: ImportField; labelKey: string }> = [
  { value: "name", labelKey: "import.nameField" },
  { value: "status", labelKey: "import.statusField" },
  { value: "rating", labelKey: "import.ratingField" },
  { value: "playTime", labelKey: "import.playTimeField" },
  { value: "platforms", labelKey: "import.platformsField" },
  { value: "genres", labelKey: "import.genresField" },
  { value: "tags", labelKey: "import.tagsField" },
  { value: "notes", labelKey: "import.notesField" },
  { value: "coverImage", labelKey: "import.coverImageField" },
  { value: "screenshots", labelKey: "import.screenshotsField" },
  { value: "steamAppId", labelKey: "import.steamAppIdField" },
  { value: "ignore", labelKey: "import.ignoreField" },
];

const PRESET_LABELS_KEYS: Record<ImportPreset, string> = {
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
  const { t } = useTranslation();
  const [showIgnored, setShowIgnored] = useState(false);

  function handleChange(col: string, value: ImportField) {
    onMappingChange({ ...mapping, [col]: value });
  }

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
          {t("translation:import.presetDetected", {
            preset: t(PRESET_LABELS_KEYS[detectedPreset]),
          })}
        </div>
      )}

      <div
        className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
        style={{
          background: "var(--theme-surface-subtle)",
          border: "1px solid var(--theme-glass-border)",
          color: "var(--theme-text-muted)",
        }}
      >
        <span
          className="mt-0.5 shrink-0"
          style={{ color: "rgba(251,191,36,0.7)", fontSize: "0.9rem" }}
        >
          ⚡
        </span>
        <span>
          {t("translation:import.columnMappingHint")}{" "}
          <span
            style={{ color: "var(--theme-text-secondary)", fontWeight: 600 }}
          >
            {t("translation:import.nameRequired")}
          </span>
        </span>
      </div>

      {hasActive && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--theme-glass-border)" }}
        >
          <div
            className="grid grid-cols-2 gap-4 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
            style={{
              background: "var(--theme-surface-subtle)",
              color: "var(--theme-text-muted)",
            }}
          >
            <span>{t("translation:import.sourceColumn")}</span>
            <span>{t("translation:import.targetField")}</span>
          </div>

          <div
            className="divide-y"
            style={{ borderTop: "1px solid var(--theme-surface-subtle)" }}
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
                      className="text-sm truncate text-text-secondary"
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
                        {t("translation:import.required")}
                      </span>
                    )}
                  </div>
                  <GlassSelect
                    value={mapping[col] ?? "ignore"}
                    onChange={(v) => handleChange(col, v as ImportField)}
                    options={FIELD_OPTIONS_KEYS.map((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasActive && (
        <div
          className="flex flex-col items-center gap-2 py-8 rounded-xl text-center"
          style={{
            border: "1px dashed var(--theme-glass-border)",
            color: "var(--theme-text-muted)",
          }}
        >
          <span className="text-2xl">📋</span>
          <p className="text-sm">{t("translation:import.noMatchedRowsHint")}</p>
        </div>
      )}

      {hasIgnored && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowIgnored((v) => !v)}
            className="flex items-center gap-1.5 text-xs transition-all cursor-pointer w-fit"
            style={{
              color: "var(--theme-text-muted)",
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
              ? t("translation:import.hideIgnored")
              : t("translation:import.showIgnored")}
            <span
              className="ml-1 px-1.5 py-0.5 rounded text-xs"
              style={{
                background: "var(--theme-surface-strong)",
                color: "var(--theme-text-muted)",
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
                style={{ border: "1px solid var(--theme-surface-subtle)" }}
              >
                <div style={{ opacity: 0.65 }}>
                  <div
                    className="grid grid-cols-2 gap-4 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                    style={{
                      background: "var(--theme-surface-subtle)",
                      color: "var(--theme-text-muted)",
                    }}
                  >
                    <span>{t("translation:import.sourceColumn")}</span>
                    <span>{t("translation:import.targetField")}</span>
                  </div>
                  <div
                    className="divide-y"
                    style={{
                      borderTop: "1px solid var(--theme-surface-subtle)",
                    }}
                  >
                    {ignoredColumns.map((col) => (
                      <div
                        key={col}
                        className="grid grid-cols-2 items-center gap-4 px-4 py-2"
                      >
                        <span
                          className="text-xs truncate text-text-muted"
                          title={col}
                        >
                          {col}
                        </span>
                        <GlassSelect
                          value="ignore"
                          onChange={(v) => handleChange(col, v as ImportField)}
                          options={FIELD_OPTIONS_KEYS.map((opt) => ({
                            value: opt.value,
                            label: t(opt.labelKey),
                          }))}
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
