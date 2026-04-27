import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  SkipForward,
  ArrowRight,
} from "lucide-react";
import { GlassButton } from "@/components/ui/GlassButton";
import type { ImportRunResult } from "@/api/importExport";

interface ImportResultProps {
  result: ImportRunResult;
  onClose: () => void;
  onViewLibrary: () => void;
}

export function ImportResult({
  result,
  onClose,
  onViewLibrary,
}: ImportResultProps) {
  const { summary, errors } = result;

  return (
    <div className="flex flex-col gap-5 py-2">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<CheckCircle size={15} />}
          value={summary.added}
          label="Eklendi"
          color="rgba(34,197,94,0.8)"
        />
        <StatCard
          icon={<ArrowRight size={15} />}
          value={summary.updated}
          label="Güncellendi"
          color="rgba(59,130,246,0.8)"
        />
        <StatCard
          icon={<SkipForward size={15} />}
          value={summary.skipped}
          label="Atlandı"
          color="rgba(234,179,8,0.8)"
        />
        <StatCard
          icon={<XCircle size={15} />}
          value={summary.errors}
          label="Hata"
          color="rgba(239,68,68,0.8)"
        />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div
          className="rounded-xl p-4 flex flex-col gap-2"
          style={{
            border: "1px solid rgba(239,68,68,0.25)",
            background: "rgba(239,68,68,0.04)",
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} style={{ color: "rgba(239,68,68,0.7)" }} />
            <span
              className="text-sm font-medium"
              style={{ color: "rgba(239,68,68,0.85)" }}
            >
              Hatalar ({errors.length})
            </span>
          </div>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {errors.slice(0, 10).map((err, i) => (
              <p
                key={i}
                className="text-xs"
                style={{ color: "rgba(239,68,68,0.6)" }}
              >
                • Satır {err.row}: {err.message}
              </p>
            ))}
            {errors.length > 10 && (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                ...ve {errors.length - 10} hata daha
              </p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <GlassButton variant="ghost" onClick={onClose}>
          Kapat
        </GlassButton>
        <GlassButton variant="primary" onClick={onViewLibrary}>
          Kütüphaneye Git
        </GlassButton>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 rounded-xl py-3"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div style={{ color }}>{icon}</div>
      <span
        className="text-xl font-bold"
        style={{ color: "rgba(255,255,255,0.9)" }}
      >
        {value}
      </span>
      <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
        {label}
      </span>
    </div>
  );
}
