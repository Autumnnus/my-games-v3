import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ok } from "../lib/response";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middlewares/auth.middleware";
import {
  parseImportFile,
  detectPreset,
  getPresetMapping,
  applyColumnMapping,
  runImport,
  downloadAndReuploadScreenshots,
  type ImportField,
  type ConflictStrategy,
} from "../services/import-export.service";
import type { AppVariables } from "../types/context";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const runImportSchema = {
  json: {
    fileFormat: "xlsx" as const,
    columnMapping: {} as Record<string, ImportField>,
    conflictStrategy: "skip" as ConflictStrategy,
    importScreenshots: false,
    rows: [] as Record<string, unknown>[],
  },
};

const parseSchema = {
  json: {
    fileFormat: "xlsx" as const,
  },
};

const screenshotsSchema = {
  json: {
    urls: [] as string[],
    gameName: "",
  },
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const importRoutes = new Hono<{ Variables: AppVariables }>();

// POST /api/import/parse
// Accept file, parse it, return detected schema and sample rows
importRoutes.post("/parse", authMiddleware, async (c) => {
  const userId = c.get("userId");
  if (!userId) throw new AppError("UNAUTHORIZED", "Not authenticated", 401);

  // Get the raw body as FormData
  let fileBuffer: ArrayBuffer | null = null;
  let fileFormat: "xlsx" | "json" = "xlsx";
  let fileSize = 0;

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) throw new AppError("IMPORT_NO_FILE", "No file provided", 400);

    fileSize = file.size;
    if (fileSize > MAX_FILE_SIZE) {
      throw new AppError(
        "IMPORT_FILE_TOO_LARGE",
        "File exceeds 10MB limit",
        413,
      );
    }

    fileBuffer = await file.arrayBuffer();
    const filename = file.name.toLowerCase();
    if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      fileFormat = "xlsx";
    } else if (filename.endsWith(".json")) {
      fileFormat = "json";
    } else {
      throw new AppError(
        "IMPORT_UNSUPPORTED_FORMAT",
        "Only .xlsx and .json files are supported",
        400,
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "IMPORT_PARSE_ERROR",
      "Failed to read uploaded file",
      400,
    );
  }

  if (!fileBuffer)
    throw new AppError("IMPORT_PARSE_ERROR", "File buffer is empty", 400);

  const buffer = Buffer.from(fileBuffer);
  if (buffer.length === 0)
    throw new AppError("IMPORT_EMPTY_FILE", "Uploaded file is empty", 400);

  let columns: string[] = [];
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = parseImportFile(buffer, fileFormat);
    columns = parsed.columns;
    rows = parsed.rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "IMPORT_PARSE_ERROR",
      `Could not parse file: ${err instanceof Error ? err.message : "Unknown error"}`,
      400,
    );
  }

  const presets = detectPreset(rows);

  // Auto-map columns based on best preset
  const bestPreset = presets[0];
  const presetMapping = getPresetMapping(bestPreset);

  // Build auto-mapping by matching column names (case-insensitive)
  const autoMapping: Record<string, ImportField> = {};
  for (const col of columns) {
    const normalized = col.toLowerCase().trim();
    if (presetMapping[col] !== undefined) {
      autoMapping[col] = presetMapping[col];
    } else if (presetMapping[normalized] !== undefined) {
      autoMapping[col] = presetMapping[normalized];
    }
  }

  // Default unmapped columns to 'ignore'
  for (const col of columns) {
    if (!autoMapping[col]) {
      autoMapping[col] = "ignore";
    }
  }

  const sampleRows = rows.slice(0, 20);

  return c.json(
    ok({
      format: fileFormat,
      columns,
      totalRows: rows.length,
      sampleRows,
      presets,
      autoMapping,
    }),
  );
});

// POST /api/import/run
// Execute the import with the provided mapping config
importRoutes.post("/run", authMiddleware, async (c) => {
  const userId = c.get("userId");
  if (!userId) throw new AppError("UNAUTHORIZED", "Not authenticated", 401);

  const body = await c.req.json<{
    fileFormat: "xlsx" | "json";
    columnMapping: Record<string, ImportField>;
    conflictStrategy: ConflictStrategy;
    importScreenshots: boolean;
    rows: Record<string, unknown>[];
  }>();

  if (!body.rows || !Array.isArray(body.rows)) {
    throw new AppError("IMPORT_INVALID_ROWS", "rows must be an array", 400);
  }

  // Validate that 'name' is mapped
  const nameMapped = Object.values(body.columnMapping).includes("name");
  if (!nameMapped) {
    throw new AppError(
      "IMPORT_MISSING_MAPPING",
      "Column 'name' must be mapped",
      400,
    );
  }

  // Apply column mapping to transform rows into ParsedRow format
  const mappedRows = applyColumnMapping(body.rows, body.columnMapping);

  // Filter out rows with no name
  const validRows = mappedRows.filter((r) => r.name.trim().length > 0);

  // Run import
  const result = await runImport({
    userId,
    games: validRows,
    conflictStrategy: body.conflictStrategy ?? "skip",
  });

  // Handle screenshot re-upload if requested
  if (body.importScreenshots) {
    const allUrls = new Set<string>();
    for (const row of validRows) {
      if (row.screenshots?.length) {
        for (const url of row.screenshots) {
          allUrls.add(url);
        }
      }
    }

    if (allUrls.size > 0) {
      // Re-upload screenshots (non-blocking - errors are logged but don't fail the import)
      const screenshotResults = await downloadAndReuploadScreenshots(
        Array.from(allUrls),
        validRows[0]?.name ?? "game",
      );
      // Results are informational only; the import summary is returned regardless
      void screenshotResults;
    }
  }

  return c.json(ok(result));
});

// POST /api/import/screenshots
// Download external screenshot URLs and re-upload to R2
importRoutes.post("/screenshots", authMiddleware, async (c) => {
  const userId = c.get("userId");
  if (!userId) throw new AppError("UNAUTHORIZED", "Not authenticated", 401);

  const body = await c.req.json<{ urls: string[]; gameName: string }>();

  if (!body.urls || !Array.isArray(body.urls)) {
    throw new AppError("BAD_REQUEST", "urls must be an array", 400);
  }

  if (body.urls.length > 50) {
    throw new AppError("BAD_REQUEST", "Maximum 50 URLs per request", 400);
  }

  const results = await downloadAndReuploadScreenshots(
    body.urls,
    body.gameName ?? "game",
  );

  return c.json(ok({ results }));
});

export default importRoutes;
