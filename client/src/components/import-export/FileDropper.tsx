import { useCallback, useState } from "react";
import { Upload, FileText, X, AlertCircle } from "lucide-react";

interface FileDropperProps {
  onFileSelected: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
}

type DropState = "idle" | "dragover" | "selected" | "error";

export function FileDropper({
  onFileSelected,
  accept = ".xlsx,.json,.csv",
  maxSizeMB = 10,
}: FileDropperProps) {
  const [dropState, setDropState] = useState<DropState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const ACCEPTED = accept.split(",").map((t) => t.trim().toLowerCase());
  const MAX_BYTES = maxSizeMB * 1024 * 1024;

  function validateFile(file: File): string | null {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      return `Desteklenmeyen format. Kabul edilen: ${accept}`;
    }
    if (file.size > MAX_BYTES) {
      return `Dosya çok büyük. Maksimum ${maxSizeMB}MB`;
    }
    return null;
  }

  function handleFile(file: File) {
    const err = validateFile(file);
    if (err) {
      setErrorMsg(err);
      setDropState("error");
      return;
    }
    setErrorMsg(null);
    setSelectedFile(file);
    setDropState("selected");
    onFileSelected(file);
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropState("dragover");
  }, []);

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropState(selectedFile ? "selected" : "idle");
    },
    [selectedFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function removeFile() {
    setSelectedFile(null);
    setErrorMsg(null);
    setDropState("idle");
  }

  const borderColor =
    dropState === "error"
      ? "rgba(239,68,68,0.5)"
      : dropState === "dragover"
        ? "var(--theme-accent-2)"
        : dropState === "selected"
          ? "rgba(34,197,94,0.4)"
          : "var(--theme-glass-border)";

  const borderStyle =
    dropState === "dragover" || dropState === "selected" ? "dashed" : "dashed";

  return (
    <div className="flex flex-col gap-2">
      {dropState !== "selected" ? (
        <label
          className="relative flex flex-col items-center justify-center gap-3 py-10 px-6 rounded-xl cursor-pointer transition-all duration-200 select-none"
          style={{
            border: `2px ${borderStyle} ${borderColor}`,
            background:
              dropState === "dragover"
                ? "var(--theme-mesh-b)"
                : "var(--theme-surface-subtle)",
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept={accept}
            className="sr-only"
            onChange={onInputChange}
          />
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background:
                dropState === "dragover"
                  ? "var(--theme-mesh-b)"
                  : "var(--theme-glass-border)",
            }}
          >
            {dropState === "dragover" ? (
              <Upload size={22} style={{ color: "var(--theme-accent-2)" }} />
            ) : (
              <Upload size={22} style={{ color: "var(--theme-text-muted)" }} />
            )}
          </div>
          <div className="text-center">
            <p
              className="text-sm font-medium"
              style={{ color: "var(--theme-text-secondary)" }}
            >
              {dropState === "dragover"
                ? "Bırak dosyayı"
                : "Dosyayı sürükle veya tıkla"}
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--theme-text-muted)" }}
            >
              .xlsx, .json, .csv — maks. {maxSizeMB}MB
            </p>
          </div>
        </label>
      ) : (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{
            border: `1.5px solid rgba(34,197,94,0.35)`,
            background: "rgba(34,197,94,0.05)",
          }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(34,197,94,0.12)" }}
          >
            <FileText size={18} style={{ color: "rgba(34,197,94,0.8)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium truncate"
              style={{ color: "var(--theme-text-secondary)" }}
            >
              {selectedFile?.name}
            </p>
            <p className="text-xs" style={{ color: "var(--theme-text-muted)" }}>
              {(selectedFile?.size ?? 0) > 1024 * 1024
                ? `${((selectedFile?.size ?? 0) / (1024 * 1024)).toFixed(1)} MB`
                : `${Math.round((selectedFile?.size ?? 0) / 1024)} KB`}
            </p>
          </div>
          <button
            onClick={removeFile}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10 shrink-0"
            aria-label="Dosyayı kaldır"
          >
            <X size={15} style={{ color: "var(--theme-text-muted)" }} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: "rgba(239,68,68,0.85)" }}
        >
          <AlertCircle size={12} />
          {errorMsg}
        </div>
      )}
    </div>
  );
}
