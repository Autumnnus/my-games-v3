import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { importExportApi } from "@/api/importExport";
import type {
  ImportFormat,
  ImportField,
  ConflictStrategy,
  ParseResult,
  ImportRunResult,
  ExportFilters,
} from "@/api/importExport";
import { useAuthStore } from "@/store/auth.store";

export interface ImportState {
  file: File | null;
  parseResult: ParseResult | null;
  columnMapping: Record<string, ImportField>;
  conflictStrategy: ConflictStrategy;
  importScreenshots: boolean;
  rows: Record<string, unknown>[];
  conflicts: Conflict[];
}

export interface Conflict {
  rowIndex: number;
  importedName: string;
  existingEntry: {
    name: string;
    status: string;
    rating?: number;
    playTime?: number;
    platform?: string;
  };
}

export interface ConflictResolution {
  rowIndex: number;
  action: "skip" | "update" | "duplicate";
}

export interface ExportState {
  format: "xlsx" | "json";
  filters: ExportFilters;
}

export type ImportStep = 1 | 2 | 3 | 4 | 5;

const DEFAULT_COLUMN_MAPPING: Record<string, ImportField> = {};

export function useImportExport() {
  const token = useAuthStore((s) => s.token);
  const [importState, setImportState] = useState<ImportState>({
    file: null,
    parseResult: null,
    columnMapping: DEFAULT_COLUMN_MAPPING,
    conflictStrategy: "skip",
    importScreenshots: false,
    rows: [],
    conflicts: [],
  });
  const [exportState, setExportState] = useState<ExportState>({
    format: "xlsx",
    filters: { includeScreenshots: true },
  });

  // Parse mutation
  const parseMutation = useMutation({
    mutationFn: (file: File) => importExportApi.parseFile(file),
    onSuccess: (data) => {
      // Auto-detect preset and build default mapping
      const mapping: Record<string, ImportField> = {};
      const preset = data.presets[0];

      for (const col of data.columns) {
        const lower = col.toLowerCase();
        if (preset === "steam") {
          if (lower === "appid" || lower === "steam_app_id")
            mapping[col] = "steamAppId";
          else if (
            lower === "hours" ||
            lower === "hours_played" ||
            lower === "play_time_hours"
          )
            mapping[col] = "playTime";
          else if (lower === "name" || lower === "game") mapping[col] = "name";
          else if (lower === "status") mapping[col] = "status";
          else mapping[col] = "ignore";
        } else if (preset === "psn") {
          if (lower === "title") mapping[col] = "name";
          else if (lower === "platform" || lower === "console")
            mapping[col] = "platforms";
          else mapping[col] = "ignore";
        } else if (preset === "retroachievements") {
          if (lower === "game" || lower === "game_title") mapping[col] = "name";
          else if (lower === "console" || lower === "system")
            mapping[col] = "platforms";
          else mapping[col] = "ignore";
        } else {
          // manual — map name-like columns automatically
          if (lower === "name" || lower === "game" || lower === "title")
            mapping[col] = "name";
          else if (lower === "status") mapping[col] = "status";
          else if (lower === "rating" || lower === "score")
            mapping[col] = "rating";
          else if (
            lower === "hours" ||
            lower === "playtime" ||
            lower === "play_time"
          )
            mapping[col] = "playTime";
          else if (lower === "platform" || lower === "platforms")
            mapping[col] = "platforms";
          else if (lower === "genre" || lower === "genres")
            mapping[col] = "genres";
          else if (lower === "tag" || lower === "tags") mapping[col] = "tags";
          else if (lower === "notes" || lower === "review" || lower === "notes")
            mapping[col] = "notes";
          else if (
            lower === "cover" ||
            lower === "coverimage" ||
            lower === "cover_image"
          )
            mapping[col] = "coverImage";
          else if (lower === "screenshots" || lower === "screenshots")
            mapping[col] = "screenshots";
          else mapping[col] = "ignore";
        }
      }

      setImportState((prev) => ({
        ...prev,
        parseResult: data,
        columnMapping: mapping,
        rows: data.sampleRows,
      }));
      toast.success(`${data.totalRows} satır bulundu`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Dosya işlenemedi";
      toast.error(msg);
    },
  });

  // Run import mutation
  const runImportMutation = useMutation({
    mutationFn: (params: {
      rows: Record<string, unknown>[];
      resolutions: ConflictResolution[];
    }) => {
      const format = importState.parseResult?.format ?? "json";
      return importExportApi.runImport({
        fileFormat: format,
        columnMapping: importState.columnMapping,
        conflictStrategy: importState.conflictStrategy,
        importScreenshots: importState.importScreenshots,
        rows: params.rows,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "İçe aktarma başarısız";
      toast.error(msg);
    },
  });

  // Screenshot upload mutation
  const uploadScreenshotsMutation = useMutation({
    mutationFn: (params: { urls: string[]; gameName: string }) =>
      importExportApi.uploadScreenshots(params.urls, params.gameName),
  });

  // Export: direct download via fetch (bypasses json response handling)
  const exportMutation = useMutation({
    mutationFn: async () => {
      const { format, filters } = exportState;
      const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3030";
      const params = new URLSearchParams();
      if (filters.status?.length)
        params.set("status", filters.status.join(","));
      if (filters.platforms?.length)
        params.set("platform", filters.platforms.join(","));
      if (filters.includeScreenshots !== undefined)
        params.set("includeScreenshots", String(filters.includeScreenshots));
      const qs = params.toString();
      const url = `${API_BASE}/api/export/${format}${qs ? `?${qs}` : ""}`;

      const res = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      return res.blob();
    },
    onSuccess: (blob) => {
      const { format } = exportState;
      const date = new Date().toISOString().split("T")[0];
      const filename = `my-games-export-${date}.${format}`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objUrl);
      toast.success("Dışa aktarma tamamlandı");
    },
    onError: () => {
      toast.error("Dışa aktarma başarısız");
    },
  });

  const parse = useCallback(
    (file: File) => parseMutation.mutate(file),
    [parseMutation],
  );

  const runImport = useCallback(
    (rows: Record<string, unknown>[], resolutions: ConflictResolution[]) =>
      runImportMutation.mutate({ rows, resolutions }),
    [runImportMutation],
  );

  const downloadScreenshots = useCallback(
    (urls: string[], gameName: string) =>
      uploadScreenshotsMutation.mutate({ urls, gameName }),
    [uploadScreenshotsMutation],
  );

  const setFile = useCallback((file: File | null) => {
    setImportState((prev) => ({ ...prev, file }));
  }, []);

  const setColumnMapping = useCallback(
    (mapping: Record<string, ImportField>) => {
      setImportState((prev) => ({ ...prev, columnMapping: mapping }));
    },
    [],
  );

  const setConflictStrategy = useCallback((strategy: ConflictStrategy) => {
    setImportState((prev) => ({ ...prev, conflictStrategy: strategy }));
  }, []);

  const setImportScreenshots = useCallback((val: boolean) => {
    setImportState((prev) => ({ ...prev, importScreenshots: val }));
  }, []);

  const setRows = useCallback((rows: Record<string, unknown>[]) => {
    setImportState((prev) => ({ ...prev, rows }));
  }, []);

  const setConflicts = useCallback((conflicts: Conflict[]) => {
    setImportState((prev) => ({ ...prev, conflicts }));
  }, []);

  const setExportFormat = useCallback((format: "xlsx" | "json") => {
    setExportState((prev) => ({ ...prev, format }));
  }, []);

  const setExportFilters = useCallback((filters: ExportFilters) => {
    setExportState((prev) => ({ ...prev, filters }));
  }, []);

  const resetImport = useCallback(() => {
    setImportState({
      file: null,
      parseResult: null,
      columnMapping: {},
      conflictStrategy: "skip",
      importScreenshots: false,
      rows: [],
      conflicts: [],
    });
  }, []);

  return {
    importState,
    exportState,
    parse,
    runImport,
    downloadScreenshots,
    setFile,
    setColumnMapping,
    setConflictStrategy,
    setImportScreenshots,
    setRows,
    setConflicts,
    setExportFormat,
    setExportFilters,
    resetImport,
    parseMutation,
    runImportMutation,
    uploadScreenshotsMutation,
    exportMutation,
  };
}
