import { useState } from "react";
import { CheckCircle2, XCircle, Clock, Star, Gamepad2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ImportField } from "@/api/importExport";

const STATUS_OPTIONS = [
  { value: "completed", label: "Tamamlandı", color: "#22c55e" },
  { value: "activePlaying", label: "Oynuyor", color: "#3b82f6" },
  { value: "toBeCompleted", label: "Beklemede", color: "#f59e0b" },
  { value: "abandoned", label: "Bırakıldı", color: "#ef4444" },
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
  const status = STATUS_OPTIONS.find((o) => o.value === String(value));
  if (!status) return <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${status.color}18`, color: status.color }}
    >
      {status.label}
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
  const mapped = getMappedValue(row, mapping);
  const name = String(mapped.name ?? "—");
  const status = mapped.status as string | undefined;
  const rating = mapped.rating as number | undefined;
  const playTime = mapped.playTimeMinutes as number | undefined;
  const platform = (mapped.platforms as string[] | undefined)?.[0];
  const coverUrl = mapped.coverImage as string | undefined;
  const screenshots = mapped.screenshots as unknown[] | undefined;
  const genres = (mapped.genres as string[] | undefined)?.slice(0, 3);
  const tags = (mapped.tags as string[] | undefined)?.slice(0, 3);

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
    } else if (
      field === "platforms" ||
      field === "genres" ||
      field === "tags"
    ) {
      onEdit(
        field,
        editValue.split(",").map((s) => s.trim()).filter(Boolean),
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
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(255,255,255,0.06)",
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
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            🎮
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Name */}
        {editingField === "name" ? (
          <input
            className="text-sm font-semibold bg-transparent border-b px-1 py-0.5 outline-none"
            style={{
              borderColor: "rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.9)",
            }}
            value={editValue}
            autoFocus
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commitEdit("name")}
            onKeyDown={(e) => e.key === "Enter" && commitEdit("name")}
          />
        ) : (
          <p
            className="text-sm font-semibold truncate cursor-pointer hover:text-white transition-colors"
            style={{ color: "rgba(255,255,255,0.9)" }}
            onClick={() => startEdit("name", mapped.name)}
            title={name}
          >
            {name}
          </p>
        )}

        {/* Status + Platform */}
        <div className="flex items-center gap-2 flex-wrap">
          {editingField === "status" ? (
            <select
              className="text-xs px-2 py-1 rounded-lg outline-none"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.9)",
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
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
                color: "rgba(168,85,247,0.9)",
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
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {g}
            </span>
          ))}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4">
          {/* Rating */}
          <button
            onClick={() => startEdit("rating", rating)}
            className="flex items-center gap-1 text-xs"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <Star size={12} style={{ color: "#f59e0b" }} />
            {editingField === "rating" ? (
              <input
                className="w-10 text-xs bg-transparent border-b outline-none px-1"
                style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.9)" }}
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
              <span style={{ color: rating ? "#f59e0b" : "rgba(255,255,255,0.3)" }}>
                {rating ? `${rating}/10` : "—"}
              </span>
            )}
          </button>

          {/* Play time */}
          <button
            onClick={() => startEdit("playTimeMinutes", playTime)}
            className="flex items-center gap-1 text-xs"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            <Clock size={12} />
            {editingField === "playTimeMinutes" ? (
              <input
                className="w-14 text-xs bg-transparent border-b outline-none px-1"
                style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.9)" }}
                type="number"
                min={0}
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitEdit("playTimeMinutes")}
                onKeyDown={(e) => e.key === "Enter" && commitEdit("playTimeMinutes")}
              />
            ) : (
              <span>{playTime ? `${playTime} dk` : "—"}</span>
            )}
          </button>

          {/* Screenshots count */}
          {screenshots?.length ? (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              <Gamepad2 size={12} />
              {screenshots.length} ekran görüntüsü
            </span>
          ) : null}
        </div>

        {/* Notes preview */}
        {(mapped.notes as string) && (
          <p
            className="text-xs line-clamp-1"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            {(mapped.notes as string).slice(0, 100)}
            {(mapped.notes as string).length > 100 ? "..." : ""}
          </p>
        )}
      </div>

      {/* Index badge */}
      <div className="shrink-0">
        <span
          className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.3)",
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
  const previewRows = rows.slice(0, 10);
  const totalRows = rows.length;
  const ignoredCount = Object.values(mapping).filter(
    (v) => v === "ignore",
  ).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
          {previewRows.length} / {totalRows} satır önizlemesi
          {ignoredCount > 0 && (
            <span> • {ignoredCount} sütun yoksayıldı</span>
          )}
        </p>
        <p
          className="text-xs"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          Tıklaarak düzenle
        </p>
      </div>

      {/* Card list */}
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
            <XCircle size={32} style={{ color: "rgba(255,255,255,0.2)" }} />
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
              Eşleştirilen satır yok
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
