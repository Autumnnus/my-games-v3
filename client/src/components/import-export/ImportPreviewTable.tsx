import type { ImportField } from "@/api/importExport";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, Gamepad2, Star, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const STATUS_OPTIONS_KEYS = [
  { value: "completed", labelKey: "games.status.completed", color: "#22c55e" },
  {
    value: "activePlaying",
    labelKey: "games.status.activePlaying",
    color: "var(--theme-accent-2)",
  },
  {
    value: "toBeCompleted",
    labelKey: "games.status.backlog",
    color: "#f59e0b",
  },
  { value: "abandoned", labelKey: "games.status.abandoned", color: "#ef4444" },
];

interface ImportPreviewTableProps {
  rows: Record<string, unknown>[];
  mapping: Record<string, ImportField>;
  onRowEdit: (rowIndex: number, field: ImportField, value: unknown) => void;
}

function getMappedValue(
  row: Record<string, unknown>,
  mapping: Record<string, ImportField>,
): Record<ImportField, unknown> {
  const result: Partial<Record<ImportField, unknown>> = {};
  for (const [col, field] of Object.entries(mapping)) {
    if (field !== "ignore") {
      result[field] = row[col];
    }
  }
  return result as Record<ImportField, unknown>;
}

function StatusBadge({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const status = STATUS_OPTIONS_KEYS.find((o) => o.value === String(value));
  if (!status) return <span className="text-text-muted">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${status.color}18`, color: status.color }}
    >
      {t(status.labelKey)}
    </span>
  );
}

function GamePreviewCard({
  row,
  mapping,
  index,
  onEdit,
}: {
  row: Record<string, unknown>;
  mapping: Record<string, ImportField>;
  index: number;
  onEdit: (field: ImportField, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const mapped = getMappedValue(row, mapping);
  const name = String(mapped.name ?? "—");
  const status = mapped.status as string | undefined;
  const rating = mapped.rating as number | undefined;
  const playTime = mapped.playTime as number | undefined;
  const platform = (mapped.platforms as string[] | undefined)?.[0];
  const coverUrl = mapped.coverImage as string | undefined;
  const screenshots = mapped.screenshots as unknown[] | undefined;
  const genres = (mapped.genres as string[] | undefined)?.slice(0, 3);

  const [editingField, setEditingField] = useState<ImportField | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(field: ImportField, currentVal: unknown) {
    setEditingField(field);
    if (Array.isArray(currentVal)) setEditValue(currentVal.join(", "));
    else setEditValue(String(currentVal ?? ""));
  }

  function commitEdit(field: ImportField) {
    if (field === "rating") {
      onEdit(field, parseFloat(editValue) || 0);
    } else if (field === "platforms" || field === "genres") {
      onEdit(
        field,
        editValue
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else {
      onEdit(field, editValue);
    }
    setEditingField(null);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex gap-4 p-4 rounded-xl border transition-all cursor-default"
      style={{
        background: "var(--theme-surface-subtle)",
        borderColor: "var(--theme-glass-border)",
      }}
    >
      {/* Cover */}
      <div className="shrink-0 w-16 h-20 rounded-lg overflow-hidden flex items-center justify-center">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-xl"
            style={{ background: "var(--theme-surface-subtle)" }}
          >
            🎮
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {editingField === "name" ? (
          <input
            className="text-sm font-semibold bg-transparent border-b px-1 py-0.5 outline-none"
            style={{
              borderColor: "var(--theme-text-muted)",
              color: "var(--theme-text-primary)",
            }}
            value={editValue}
            autoFocus
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commitEdit("name")}
            onKeyDown={(e) => e.key === "Enter" && commitEdit("name")}
          />
        ) : (
          <p
            className="text-sm font-semibold truncate cursor-pointer hover:text-white transition-colors text-text-primary"
            onClick={() => startEdit("name", mapped.name)}
            title={name}
          >
            {name}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {editingField === "status" ? (
            <select
              className="text-xs px-2 py-1 rounded-lg outline-none"
              style={{
                background: "var(--theme-surface-strong)",
                color: "var(--theme-text-primary)",
              }}
              autoFocus
              value={String(status ?? "")}
              onChange={(e) => {
                onEdit("status", e.target.value);
                setEditingField(null);
              }}
              onBlur={() => setEditingField(null)}
            >
              <option value="">—</option>
              {STATUS_OPTIONS_KEYS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => startEdit("status", status)}
              className="flex items-center gap-1"
            >
              <StatusBadge value={status} />
            </button>
          )}

          {platform && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(124,58,237,0.15)",
                color: "var(--theme-accent)",
              }}
            >
              {platform}
            </span>
          )}

          {genres?.map((g) => (
            <span
              key={g}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "var(--theme-surface-subtle)",
                color: "var(--theme-text-muted)",
              }}
            >
              {g}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => startEdit("rating", rating)}
            className="flex items-center gap-1 text-xs text-text-muted"
          >
            <Star size={12} style={{ color: "#f59e0b" }} />
            {editingField === "rating" ? (
              <input
                className="w-10 text-xs bg-transparent border-b outline-none px-1"
                style={{
                  borderColor: "var(--theme-text-muted)",
                  color: "var(--theme-text-primary)",
                }}
                type="number"
                min={0}
                max={10}
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitEdit("rating")}
                onKeyDown={(e) => e.key === "Enter" && commitEdit("rating")}
              />
            ) : (
              <span
                style={{
                  color: rating ? "#f59e0b" : "var(--theme-text-muted)",
                }}
              >
                {rating ? `${rating}/10` : "—"}
              </span>
            )}
          </button>

          <button
            onClick={() => startEdit("playTime", playTime)}
            className="flex items-center gap-1 text-xs text-text-muted"
          >
            <Clock size={12} />
            {editingField === "playTime" ? (
              <input
                className="w-14 text-xs bg-transparent border-b outline-none px-1"
                style={{
                  borderColor: "var(--theme-text-muted)",
                  color: "var(--theme-text-primary)",
                }}
                type="number"
                min={0}
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitEdit("playTime")}
                onKeyDown={(e) => e.key === "Enter" && commitEdit("playTime")}
              />
            ) : (
              <span>
                {playTime
                  ? `${playTime} ${t("translation:import.minutes")}`
                  : "—"}
              </span>
            )}
          </button>

          {screenshots?.length ? (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Gamepad2 size={12} />
              {screenshots.length} {t("translation:import.screenshots")}
            </span>
          ) : null}
        </div>

        {(mapped.notes as string) && (
          <p className="text-xs line-clamp-1 text-text-muted">
            {(mapped.notes as string).slice(0, 100)}
            {(mapped.notes as string).length > 100 ? "..." : ""}
          </p>
        )}
      </div>

      <div className="shrink-0">
        <span
          className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
          style={{
            background: "var(--theme-surface-strong)",
            color: "var(--theme-text-muted)",
          }}
        >
          {index + 1}
        </span>
      </div>
    </motion.div>
  );
}

export function ImportPreviewTable({
  rows,
  mapping,
  onRowEdit,
}: ImportPreviewTableProps) {
  const { t } = useTranslation();
  const previewRows = rows.slice(0, 10);
  const totalRows = rows.length;
  const ignoredCount = Object.values(mapping).filter(
    (v) => v === "ignore",
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {t("translation:import.rowsPreview", {
            count: previewRows.length,
            total: totalRows,
          })}
          {ignoredCount > 0 && (
            <span>
              {" "}
              • {ignoredCount}{" "}
              {t("translation:import.ignoredColumns").toLowerCase()}
            </span>
          )}
        </p>
        <p className="text-xs text-text-muted">
          {t("translation:import.clickToEdit")}
        </p>
      </div>

      <div className="flex flex-col gap-2 max-h-[clamp(240px,48vh,520px)] overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout">
          {previewRows.map((row, idx) => (
            <GamePreviewCard
              key={idx}
              row={row}
              mapping={mapping}
              index={idx}
              onEdit={(field, value) => onRowEdit(idx, field, value)}
            />
          ))}
        </AnimatePresence>

        {previewRows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <XCircle size={32} className="text-text-muted" />
            <p className="text-sm text-text-muted">
              {t("translation:import.noMatchedRows")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
