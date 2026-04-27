import { apiFetch } from "./client";
import type { Platform, GameStatus } from "@my-games/shared";

export type ImportFormat = "xlsx" | "json";

export type ImportField =
  | "name"
  | "status"
  | "rating"
  | "playTime"
  | "platforms"
  | "genres"
  | "tags"
  | "notes"
  | "coverImage"
  | "screenshots"
  | "steamAppId"
  | "ignore";

export type ConflictStrategy = "skip" | "update" | "duplicate";

export type ImportPreset = "steam" | "psn" | "retroachievements" | "manual";

export interface ParseResult {
  format: ImportFormat;
  columns: string[];
  totalRows: number;
  sampleRows: Record<string, unknown>[];
  presets: ImportPreset[];
}

export interface ImportRunResult {
  summary: {
    total: number;
    added: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  errors: Array<{ row: number; message: string }>;
  newIds: string[];
}

export interface ExportFilters {
  status?: GameStatus[];
  platforms?: Platform[];
  includeScreenshots?: boolean;
}

export interface ScreenshotUploadResult {
  original: string;
  uploaded: string;
}

export interface ScreenshotsUploadResponse {
  results: ScreenshotUploadResult[];
}

const IMPORT_API = "/api/import";
const EXPORT_API = "/api/export";

export const importExportApi = {
  parseFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ParseResult>(`${IMPORT_API}/parse`, {
      method: "POST",
      body: form,
      headers: {}, // let browser set Content-Type for FormData
    });
  },

  runImport: (data: {
    fileFormat: ImportFormat;
    columnMapping: Record<string, ImportField>;
    conflictStrategy: ConflictStrategy;
    importScreenshots: boolean;
    rows: Record<string, unknown>[];
  }) =>
    apiFetch<ImportRunResult>(`${IMPORT_API}/run`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  uploadScreenshots: (urls: string[], gameName: string) =>
    apiFetch<ScreenshotsUploadResponse>(`${IMPORT_API}/screenshots`, {
      method: "POST",
      body: JSON.stringify({ urls, gameName }),
    }),
};
