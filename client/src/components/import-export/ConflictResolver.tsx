import { AlertTriangle } from "lucide-react";
import { GlassSelect } from "@/components/ui/GlassSelect";
import type { ConflictStrategy } from "@/api/importExport";
import type { Conflict, ConflictResolution } from "@/hooks/useImportExport";

interface ConflictResolverProps {
  conflicts: Conflict[];
  defaultStrategy: ConflictStrategy;
  onResolve: (resolutions: ConflictResolution[]) => void;
}

const STRATEGY_OPTIONS = [
  { value: "skip", label: "Atla" },
  { value: "update", label: "Güncelle" },
  { value: "duplicate", label: "Her İkini Tut" },
];

export function ConflictResolver({
  conflicts,
  defaultStrategy,
  onResolve,
}: ConflictResolverProps) {
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
          <span
            className="text-sm font-medium"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            {conflicts.length} oyun zaten kütüphanende var
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            Tümüne uygula:
          </span>
          <GlassSelect
            value={defaultStrategy}
            onChange={(e) => applyAll(e.target.value as ConflictStrategy)}
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
  onChange,
}: {
  conflict: Conflict;
  defaultStrategy: ConflictStrategy;
  onChange: (action: ConflictStrategy) => void;
}) {
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
          <p
            className="text-sm font-semibold truncate"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            "{conflict.importedName}"
          </p>
          <p
            className="text-xs mt-0.5"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            Mevcut:{" "}
            <span style={{ color: "rgba(255,255,255,0.5)" }}>
              {existing.name || "—"}
            </span>
          </p>
        </div>
        <GlassSelect
          value={defaultStrategy}
          onChange={(e) => onChange(e.target.value as ConflictStrategy)}
          options={STRATEGY_OPTIONS}
          className="w-36 shrink-0"
        />
      </div>

      {/* Visual diff */}
      <div className="grid grid-cols-2 gap-2">
        <div
          className="rounded-lg p-2.5"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            Mevcut
          </p>
          <DiffRow label="Durum" value={existing.status} />
          <DiffRow
            label="Puan"
            value={
              existing.rating != null ? String(existing.rating) : undefined
            }
          />
          <DiffRow
            label="Süre"
            value={
              existing.playTime != null ? `${existing.playTime}dk` : undefined
            }
          />
          <DiffRow label="Platform" value={existing.platform} />
        </div>
        <div
          className="rounded-lg p-2.5"
          style={{
            background: "rgba(168,85,247,0.04)",
            border: "1px solid rgba(168,85,247,0.1)",
          }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-1.5"
            style={{ color: "rgba(168,85,247,0.5)" }}
          >
            İçe Aktarılacak
          </p>
          <DiffRow label="Durum" value={conflict.importedName} />
        </div>
      </div>
    </div>
  );
}

function DiffRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between items-center gap-2 text-xs py-0.5">
      <span style={{ color: "rgba(255,255,255,0.3)" }}>{label}</span>
      <span
        style={{
          color: value ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}
