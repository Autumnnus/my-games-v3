import type { ConflictStrategy } from "@/api/importExport";
import { GlassSelect } from "@/components/ui/GlassSelect";
import type { Conflict, ConflictResolution } from "@/hooks/useImportExport";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ConflictResolverProps {
  conflicts: Conflict[];
  defaultStrategy: ConflictStrategy;
  onResolve: (resolutions: ConflictResolution[]) => void;
}

export function ConflictResolver({
  conflicts,
  defaultStrategy,
  onResolve,
}: ConflictResolverProps) {
  const { t } = useTranslation();

  const STRATEGY_OPTIONS = [
    { value: "skip", label: t("translation:import.conflict.skip") },
    { value: "update", label: t("translation:import.conflict.update") },
    { value: "duplicate", label: t("translation:import.conflict.keepBoth") },
  ];

  function applyAll(strategy: ConflictStrategy) {
    onResolve(
      conflicts.map((c) => ({ rowIndex: c.rowIndex, action: strategy })),
    );
  }

  function handleSingle(rowIndex: number, action: ConflictStrategy) {
    onResolve([{ rowIndex, action }]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} style={{ color: "rgba(234,179,8,0.75)" }} />
          <span className="text-sm font-medium text-text-secondary">
            {t("translation:import.conflict.title", {
              count: conflicts.length,
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            {t("translation:import.conflict.applyToAll")}
          </span>
          <GlassSelect
            value={defaultStrategy}
            onChange={(v) => applyAll(v as ConflictStrategy)}
            options={STRATEGY_OPTIONS}
            className="w-36"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {conflicts.map((conflict) => (
          <ConflictCard
            key={conflict.rowIndex}
            conflict={conflict}
            defaultStrategy={defaultStrategy}
            strategyOptions={STRATEGY_OPTIONS}
            onChange={(action) => handleSingle(conflict.rowIndex, action)}
          />
        ))}
      </div>
    </div>
  );
}

function ConflictCard({
  conflict,
  defaultStrategy,
  strategyOptions,
  onChange,
}: {
  conflict: Conflict;
  defaultStrategy: ConflictStrategy;
  strategyOptions: { value: string; label: string }[];
  onChange: (action: ConflictStrategy) => void;
}) {
  const { t } = useTranslation();
  const existing = conflict.existingEntry;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        border: "1px solid rgba(234,179,8,0.2)",
        background: "rgba(234,179,8,0.04)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate text-text-primary">
            "{conflict.importedName}"
          </p>
          <p className="text-xs mt-0.5 text-text-muted">
            {t("translation:import.conflict.currentEntry")}{" "}
            <span className="text-text-muted">{existing.name || "—"}</span>
          </p>
        </div>
        <GlassSelect
          value={defaultStrategy}
          onChange={(v) => onChange(v as ConflictStrategy)}
          options={strategyOptions}
          className="w-36 shrink-0"
        />
      </div>

      {/* Visual diff */}
      <div className="grid grid-cols-2 gap-2">
        <div
          className="rounded-lg p-2.5"
          style={{
            background: "var(--theme-surface-subtle)",
            border: "1px solid var(--theme-glass-border)",
          }}
        >
          <p className="text-[10px] uppercase tracking-wider mb-1.5 text-text-muted">
            {t("translation:import.conflict.existing")}
          </p>
          <DiffRow
            label={t("translation:import.conflict.statusLabel")}
            value={existing.status}
          />
          <DiffRow
            label={t("translation:import.conflict.ratingLabel")}
            value={
              existing.rating != null ? String(existing.rating) : undefined
            }
          />
          <DiffRow
            label={t("translation:import.conflict.playTimeLabel")}
            value={
              existing.playTime != null ? `${existing.playTime}dk` : undefined
            }
          />
          <DiffRow
            label={t("translation:import.conflict.platformLabel")}
            value={existing.platform}
          />
        </div>
        <div
          className="rounded-lg p-2.5"
          style={{
            background: "var(--theme-accent-soft)",
            border: "1px solid var(--theme-accent-soft)",
          }}
        >
          <p className="text-[10px] uppercase tracking-wider mb-1.5 text-accent">
            {t("translation:import.conflict.incoming")}
          </p>
          <DiffRow
            label={t("translation:import.conflict.statusLabel")}
            value={conflict.importedName}
          />
        </div>
      </div>
    </div>
  );
}

function DiffRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between items-center gap-2 text-xs py-0.5">
      <span className="text-text-muted">{label}</span>
      <span className={value ? "text-text-secondary" : "text-text-muted"}>
        {value || "—"}
      </span>
    </div>
  );
}
