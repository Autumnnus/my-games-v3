import { useState } from "react";
import type { ImportField } from "@/api/importExport";

const STATUS_OPTIONS = [
  { value: "completed", label: "Tamamlandı" },
  { value: "activePlaying", label: "Oynuyor" },
  { value: "toBeCompleted", label: "Beklemede" },
  { value: "abandoned", label: "Bırakıldı" },
];

const PREVIEW_FIELDS: Array<{
  key: ImportField;
  label: string;
  type: "text" | "number" | "status" | "tags";
}> = [
  { key: "name", label: "İsim", type: "text" },
  { key: "status", label: "Durum", type: "status" },
  { key: "rating", label: "Puan", type: "number" },
  { key: "playTime", label: "Süre (dk)", type: "number" },
  { key: "platforms", label: "Platformlar", type: "tags" },
  { key: "genres", label: "Türler", type: "tags" },
  { key: "tags", label: "Etiketler", type: "tags" },
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

export function ImportPreviewTable({
  rows,
  mapping,
  onRowEdit,
}: ImportPreviewTableProps) {
  const previewRows = rows.slice(0, 10);
  const totalRows = rows.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
        İlk {previewRows.length} / {totalRows} satır önizlemesi
      </p>

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Header */}
        <div
          className="grid px-3 py-2 text-xs font-semibold uppercase tracking-wider"
          style={{
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.4)",
            gridTemplateColumns:
              "48px 1fr ".repeat(PREVIEW_FIELDS.length) + "48px",
          }}
        >
          <span className="col-span-1">#</span>
          {PREVIEW_FIELDS.map((f) => (
            <span key={f.key} className="col-span-1">
              {f.label}
            </span>
          ))}
        </div>

        {/* Rows */}
        <div
          className="divide-y"
          style={{ divideColor: "rgba(255,255,255,0.04)" }}
        >
          {previewRows.map((row, rowIdx) => {
            const mapped = getMappedValue(row, mapping);
            return (
              <div
                key={rowIdx}
                className="grid items-center px-3 py-2.5 text-sm gap-2"
                style={{
                  gridTemplateColumns:
                    "48px 1fr ".repeat(PREVIEW_FIELDS.length) + "48px",
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.3)" }}>
                  {rowIdx + 1}
                </span>
                {PREVIEW_FIELDS.map((field) => {
                  const val = mapped[field.key];
                  return (
                    <CellEditor
                      key={field.key}
                      field={field}
                      value={val}
                      onChange={(v) => onRowEdit(rowIdx, field.key, v)}
                    />
                  );
                })}
                <span />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CellEditor({
  field,
  value,
  onChange,
}: {
  field: {
    key: ImportField;
    label: string;
    type: "text" | "number" | "status" | "tags";
  };
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const display = formatCell(value, field.type);

  if (!editing) {
    return (
      <span
        className="truncate cursor-pointer px-2 py-1 rounded hover:bg-white/5 transition-colors"
        style={{
          color: value ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)",
        }}
        title={String(display)}
        onClick={() => setEditing(true)}
      >
        {display || "—"}
      </span>
    );
  }

  if (field.type === "status") {
    return (
      <select
        className="glass-input w-full px-2 py-1 text-xs"
        value={String(value ?? "")}
        autoFocus
        onChange={(e) => {
          onChange(e.target.value);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
      >
        <option value="">—</option>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        className="glass-input w-full px-2 py-1 text-xs"
        value={value ?? ""}
        autoFocus
        min={0}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={() => setEditing(false)}
      />
    );
  }

  // text or tags
  return (
    <input
      type="text"
      className="glass-input w-full px-2 py-1 text-xs"
      value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
    />
  );
}

function formatCell(
  value: unknown,
  type: "text" | "number" | "status" | "tags",
): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  if (type === "status") {
    const found = STATUS_OPTIONS.find((o) => o.value === String(value));
    return found?.label ?? String(value);
  }
  return String(value);
}
