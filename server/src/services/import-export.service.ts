import * as XLSX from "xlsx";
import Papa from "papaparse";
import axios from "axios";
import Game from "../models/Game";
import LibraryEntry from "../models/LibraryEntry";
import { AppError } from "../lib/errors";
import { uploadToR2Structured } from "../lib/upload";
import { env } from "../config/env";
import type { GameStatus, Platform } from "@my-games/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export type PresetType = "steam" | "psn" | "retroachievements" | "manual";

export interface ParsedRow {
  name: string;
  status?: GameStatus;
  rating?: number;
  playTimeMinutes?: number;
  platforms?: string[];
  genres?: string[];
  tags?: string[];
  notes?: string;
  coverImage?: string;
  screenshots?: string[];
  steamAppId?: number;
}

export interface ImportResult {
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

// ---------------------------------------------------------------------------
// File Parsing
// ---------------------------------------------------------------------------

export function parseImportFile(
  buffer: Buffer,
  format: "xlsx" | "json",
): { columns: string[]; rows: Record<string, unknown>[] } {
  if (format === "xlsx") {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
    });
    if (!raw.length)
      throw new AppError("IMPORT_EMPTY_FILE", "Uploaded file is empty", 400);
    const columns = Object.keys(raw[0]);
    return { columns, rows: raw };
  } else {
    const text = buffer.toString("utf-8");
    // Parse as JSON array of objects
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AppError("IMPORT_PARSE_ERROR", "Invalid JSON format", 400);
    }
    if (!Array.isArray(parsed) || !parsed.length) {
      throw new AppError("IMPORT_EMPTY_FILE", "Uploaded file is empty", 400);
    }
    const rows = parsed as Record<string, unknown>[];
    const columns = Object.keys(rows[0]);
    return { columns, rows };
  }
}

// ---------------------------------------------------------------------------
// Preset Detection
// ---------------------------------------------------------------------------

export function detectPreset(rows: Record<string, unknown>[]): PresetType[] {
  if (!rows.length) return ["manual"];
  const cols = new Set(Object.keys(rows[0]).map((c) => c.toLowerCase().trim()));

  const presets: PresetType[] = [];

  // Steam
  const hasSteamId = cols.has("appid") || cols.has("steam_app_id");
  const hasSteamHours =
    cols.has("hours") ||
    cols.has("hours_played") ||
    cols.has("play_time_hours");
  if (hasSteamId && hasSteamHours) presets.push("steam");

  // PSN
  const hasTitle = cols.has("title");
  const hasTrophies =
    cols.has("trophy_count") || cols.has("progress") || cols.has("completion");
  if (hasTitle && hasTrophies) presets.push("psn");

  // RetroAchievements
  const hasRA =
    cols.has("game_id") ||
    cols.has("achievements") ||
    cols.has("achieve_count");
  if (hasRA) presets.push("retroachievements");

  presets.push("manual");
  return presets;
}

// ---------------------------------------------------------------------------
// Preset Auto-Mapping
// ---------------------------------------------------------------------------

export function getPresetMapping(
  preset: PresetType,
): Record<string, ImportField> {
  switch (preset) {
    case "steam":
      return {
        name: "name",
        hours: "playTime",
        hours_played: "playTime",
        play_time_hours: "playTime",
        appid: "steamAppId",
        steam_app_id: "steamAppId",
        status: "status",
        rating: "rating",
      };
    case "psn":
      return {
        title: "name",
        platform: "platforms",
        console: "platforms",
        progress: "status",
        status: "status",
        rating: "rating",
      };
    case "retroachievements":
      return {
        game: "name",
        game_title: "name",
        console: "platforms",
        system: "platforms",
        achievements: "notes",
        achieve_count: "notes",
      };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Column Mapping
// ---------------------------------------------------------------------------

export function applyColumnMapping(
  rows: Record<string, unknown>[],
  columnMapping: Record<string, ImportField>,
): ParsedRow[] {
  return rows.map((row) => {
    const mapped: ParsedRow = { name: "" };

    for (const [sourceCol, targetField] of Object.entries(columnMapping)) {
      if (targetField === "ignore") continue;

      const rawValue = row[sourceCol];
      if (rawValue === undefined || rawValue === null || rawValue === "")
        continue;

      switch (targetField) {
        case "name":
          mapped.name = String(rawValue).trim();
          break;
        case "status":
          mapped.status = parseStatus(String(rawValue));
          break;
        case "rating":
          mapped.rating = parseRating(rawValue);
          break;
        case "playTime":
          mapped.playTimeMinutes = parsePlayTime(rawValue, sourceCol);
          break;
        case "platforms":
          mapped.platforms = parseStringArray(rawValue);
          break;
        case "genres":
          mapped.genres = parseStringArray(rawValue);
          break;
        case "tags":
          mapped.tags = parseStringArray(rawValue);
          break;
        case "notes":
          mapped.notes = String(rawValue);
          break;
        case "coverImage":
          mapped.coverImage = String(rawValue);
          break;
        case "screenshots":
          mapped.screenshots = parseStringArray(rawValue);
          break;
        case "steamAppId":
          mapped.steamAppId = parseInt(String(rawValue), 10) || undefined;
          break;
      }
    }

    return mapped;
  });
}

// ---------------------------------------------------------------------------
// Value Parsers
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, GameStatus> = {
  completed: "completed",
  completed_: "completed",
  abandon: "abandoned",
  abandoned: "abandoned",
  "to be completed": "toBeCompleted",
  tobecompleted: "toBeCompleted",
  "to be completed_": "toBeCompleted",
  backlog: "toBeCompleted",
  playing: "activePlaying",
  "active playing": "activePlaying",
  activeplaying: "activePlaying",
  active_playing: "activePlaying",
  paused: "abandoned",
  dropped: "abandoned",
  // PSN progress-based
  "100%": "completed",
  complete: "completed",
};

function parseStatus(value: string): GameStatus | undefined {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
  return STATUS_MAP[normalized];
}

function parseRating(value: unknown): number | undefined {
  const num = Number(value);
  if (isNaN(num)) return undefined;
  return Math.min(10, Math.max(0, Math.round(num * 2) / 2));
}

function parsePlayTime(value: unknown, sourceCol: string): number | undefined {
  const str = String(value).trim();
  const num = parseFloat(str);
  if (isNaN(num)) return undefined;
  // If column name suggests hours, convert to minutes
  const isHours = sourceCol.toLowerCase().includes("hour");
  return isHours ? Math.round(num * 60) : Math.round(num);
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

// ---------------------------------------------------------------------------
// Conflict Resolution
// ---------------------------------------------------------------------------

export async function resolveConflicts(
  games: ParsedRow[],
  strategy: ConflictStrategy,
  userId: string,
): Promise<{
  toAdd: ParsedRow[];
  toUpdate: Array<{ existing: (typeof games)[0]; incoming: (typeof games)[0] }>;
  skipped: number;
}> {
  const toAdd: ParsedRow[] = [];
  const toUpdate: Array<{ existing: ParsedRow; incoming: ParsedRow }> = [];
  let skipped = 0;

  for (const game of games) {
    if (!game.name) continue;

    const normalized = game.name.toLowerCase().trim();

    // Find existing game by name
    const existingGame = await Game.findOne({
      title: { $regex: `^${normalized}$`, $options: "i" },
    });
    let existingEntry: typeof LibraryEntry.prototype | null = null;

    if (existingGame) {
      existingEntry = await LibraryEntry.findOne({
        user: userId,
        game: existingGame._id,
      });
    }

    if (existingEntry) {
      if (strategy === "skip") {
        skipped++;
      } else if (strategy === "update") {
        toUpdate.push({ existing: game, incoming: game });
      } else if (strategy === "duplicate") {
        toAdd.push(game);
      }
    } else {
      toAdd.push(game);
    }
  }

  return { toAdd, toUpdate, skipped };
}

// ---------------------------------------------------------------------------
// Run Import (batch processing with chunking)
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

export async function runImport(params: {
  userId: string;
  games: ParsedRow[];
  conflictStrategy: ConflictStrategy;
}): Promise<ImportResult> {
  const { userId, games, conflictStrategy } = params;

  const summary = {
    total: games.length,
    added: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };
  const errors: Array<{ row: number; message: string }> = [];
  const newIds: string[] = [];

  // Resolve conflicts
  const { toAdd, toUpdate, skipped } = await resolveConflicts(
    games,
    conflictStrategy,
    userId,
  );
  summary.skipped += skipped;

  // Process additions in batches
  for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
    const batch = toAdd.slice(i, i + BATCH_SIZE);
    const result = await processBatch(batch, userId, "add", errors);
    summary.added += result.added;
    summary.updated += result.updated;
    summary.errors += result.errors;
    newIds.push(...result.newIds);
  }

  // Process updates in batches
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);
    const result = await processBatch(
      batch.map((b) => b.incoming),
      userId,
      "update",
      errors,
    );
    summary.added += result.added;
    summary.updated += result.updated;
    summary.errors += result.errors;
    newIds.push(...result.newIds);
  }

  summary.errors = errors.length;

  return { summary, errors, newIds };
}

async function processBatch(
  games: ParsedRow[],
  userId: string,
  mode: "add" | "update",
  errors: Array<{ row: number; message: string }>,
): Promise<{
  added: number;
  updated: number;
  errors: number;
  newIds: string[];
}> {
  let added = 0;
  let updated = 0;
  let errorCount = 0;
  const newIds: string[] = [];

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const rowIndex = i;

    try {
      if (!game.name) {
        errors.push({ row: rowIndex, message: "Game name is required" });
        errorCount++;
        continue;
      }

      if (mode === "add" || mode === "update") {
        // Find or create Game
        const gameDoc = await findOrCreateGame({
          name: game.name,
          coverUrl: game.coverImage,
          steamAppId: game.steamAppId,
        });

        // Find or create LibraryEntry
        const existingEntry = await LibraryEntry.findOne({
          user: userId,
          game: gameDoc._id,
        });

        if (existingEntry && mode === "add") {
          // Should not happen due to conflict resolution, but guard anyway
        } else if (existingEntry && mode === "update") {
          // Merge update
          const updateFields: Record<string, unknown> = {};
          if (game.status) updateFields.status = game.status;
          if (game.rating !== undefined) updateFields.rating = game.rating;
          if (game.playTimeMinutes !== undefined)
            updateFields.playTimeMinutes = game.playTimeMinutes;
          if (game.platforms?.length)
            updateFields.platform = mapPlatform(game.platforms[0]);
          if (game.notes) updateFields.review = game.notes;

          Object.assign(existingEntry, updateFields);
          await existingEntry.save();
          updated++;
          newIds.push(existingEntry._id.toString());
        } else {
          // Create new entry
          const platform = game.platforms?.length
            ? mapPlatform(game.platforms[0])
            : "otherPlatforms";
          const entry = await LibraryEntry.create({
            user: userId,
            game: gameDoc._id,
            platform: platform as Platform,
            status: game.status ?? "toBeCompleted",
            rating: game.rating,
            review: game.notes,
            playTimeMinutes: game.playTimeMinutes ?? 0,
            lastPlayedAt: new Date(),
          });
          added++;
          newIds.push(entry._id.toString());
        }
      }
    } catch (err) {
      errors.push({
        row: rowIndex,
        message: err instanceof Error ? err.message : "Unknown error",
      });
      errorCount++;
    }
  }

  return { added, updated, errors: errorCount, newIds };
}

async function findOrCreateGame(data: {
  name: string;
  coverUrl?: string;
  steamAppId?: number;
}): Promise<InstanceType<typeof Game>> {
  const normalized = data.name.toLowerCase().trim();

  // Try to find by steamAppId first
  if (data.steamAppId) {
    const bySteam = await Game.findOne({
      "sourceIds.steamAppId": data.steamAppId,
    });
    if (bySteam) return bySteam;
  }

  // Try to find by name (case-insensitive)
  const byName = await Game.findOne({
    title: { $regex: `^${normalized}$`, $options: "i" },
  });
  if (byName) {
    // Update cover if we have a new one
    if (data.coverUrl && !byName.coverUrl) {
      byName.coverUrl = data.coverUrl;
      await byName.save();
    }
    return byName;
  }

  // Create new
  const slug = data.name
    .toLowerCase()
    .replace(/[*+~.()'"!:@]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

  const game = new Game({
    title: data.name,
    slug,
    coverUrl: data.coverUrl,
    sourceIds: data.steamAppId ? { steamAppId: data.steamAppId } : undefined,
  });

  // Check for slug collision
  const existingSlug = await Game.findOne({ slug: game.slug });
  if (existingSlug) {
    game.slug = `${game.slug}-${Date.now()}`;
  }

  return await game.save();
}

// ---------------------------------------------------------------------------
// Screenshot Download & Re-upload
// ---------------------------------------------------------------------------

const MAX_SCREENSHOT_URLS = 50;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export async function downloadAndReuploadScreenshots(
  urls: string[],
  gameName: string,
): Promise<Array<{ original: string; uploaded: string }>> {
  const results: Array<{ original: string; uploaded: string }> = [];
  const limitedUrls = urls.slice(0, MAX_SCREENSHOT_URLS);

  for (const url of limitedUrls) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: MAX_IMAGE_SIZE,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MyGamesImport/1.0)",
        },
      });

      const rawContentType = response.headers["content-type"];
      const contentType: string = Array.isArray(rawContentType)
        ? rawContentType[0]
        : typeof rawContentType === "string"
          ? rawContentType
          : "application/octet-stream";
      if (!SUPPORTED_FORMATS.includes(contentType)) {
        console.warn(`Unsupported image format: ${contentType} from ${url}`);
        continue;
      }

      // Determine extension
      const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const fileName = `${gameName.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}`;
      const mimeType = contentType;

      // Create a minimal File-like object for upload
      const buffer = Buffer.from(response.data);
      const file = {
        name: `${fileName}.${ext}`,
        type: mimeType,
        arrayBuffer: () => Promise.resolve(new Uint8Array(buffer).buffer),
      } as unknown as File;

      // We need a userId/gameId for structured upload; use a temp placeholder
      // The R2 upload needs real IDs — we'll use a generic approach
      const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `imported/${sanitized}.${ext}`;

      const { url: uploadedUrl } = await uploadToR2Direct(
        buffer,
        mimeType,
        key,
      );
      results.push({ original: url, uploaded: String(uploadedUrl) });
    } catch (err) {
      console.warn(`Failed to download screenshot from ${url}:`, err);
      // Non-fatal: skip this URL
    }
  }

  return results;
}

async function uploadToR2Direct(
  buffer: Buffer,
  contentType: string,
  key: string,
): Promise<{ url: string; key: string }> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { r2 } = await import("../config/r2");

  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return { url: `${env.R2_PUBLIC_URL}/${key}`, key };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportGames(params: {
  userId: string;
  format: "xlsx" | "json";
  status?: string;
  platform?: string;
  includeScreenshots?: boolean;
}): Promise<{ data: Buffer | string; filename: string; contentType: string }> {
  const {
    userId,
    format,
    status,
    platform,
    includeScreenshots = true,
  } = params;

  const matchCriteria: Record<string, unknown> = { user: userId };
  if (status) matchCriteria.status = status;
  if (platform) matchCriteria.platform = platform;

  const entries = await LibraryEntry.find(matchCriteria)
    .populate("game")
    .sort({ updatedAt: -1 });

  const data = entries.map((entry) => {
    const game = entry.game as unknown as {
      title?: string;
      slug?: string;
      coverUrl?: string;
      sourceIds?: { steamAppId?: number };
    };
    return {
      name: game?.title ?? "",
      slug: game?.slug ?? "",
      status: entry.status,
      rating: entry.rating ?? "",
      playTime: entry.playTimeMinutes ?? 0,
      platforms: entry.platform ?? "",
      genres: "",
      tags: "",
      notes: entry.review ?? "",
      coverImage: game?.coverUrl ?? "",
      screenshots: includeScreenshots ? "" : "",
      steamAppId: game?.sourceIds?.steamAppId ?? "",
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  });

  const date = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Games");
    const xlsxBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });
    return {
      data: xlsxBuffer,
      filename: `my-games-export-${date}.xlsx`,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  } else {
    const jsonData = data.map((d) => ({
      ...d,
      exportedAt: new Date().toISOString(),
    }));
    return {
      data: JSON.stringify(jsonData, null, 2),
      filename: `my-games-export-${date}.json`,
      contentType: "application/json",
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapPlatform(value: string): string {
  const normalized = value.toLowerCase().trim();
  const platformMap: Record<string, string> = {
    pc: "otherPlatforms",
    steam: "steam",
    epic: "epicGames",
    "epic games": "epicGames",
    ubisoft: "ubisoft",
    uplay: "ubisoft",
    xbox: "xboxPc",
    "xbox pc": "xboxPc",
    ea: "eaGames",
    playstation: "playstation",
    ps5: "playstation",
    ps4: "playstation",
    psn: "playstation",
    xboxseries: "xboxSeries",
    "xbox series": "xboxSeries",
    nintendo: "nintendo",
    switch: "nintendo",
    mobile: "mobile",
  };
  return platformMap[normalized] ?? "otherPlatforms";
}

export default {
  parseImportFile,
  detectPreset,
  getPresetMapping,
  applyColumnMapping,
  resolveConflicts,
  runImport,
  downloadAndReuploadScreenshots,
  exportGames,
};
