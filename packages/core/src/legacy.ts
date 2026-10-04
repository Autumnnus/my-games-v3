import { schema } from "@my-games/db";
import type { EntryStatus, Platform, Store } from "@my-games/shared";
import { slugify } from "@my-games/shared";
import { eq, sql } from "drizzle-orm";
import { importIgdbGame } from "./catalog";
import { igdbConfig } from "./config";
import { db } from "./db";
import { addEntry, findEntryByGame } from "./library";
import { findIgdbCandidates, type MatchCandidate, pickAutoMatch } from "./matching";
import { notifyPending, propose } from "./proposals";
import { normalizeTitle } from "./text";

/** Eski sistemin (Firestore dönemi) dışa aktarım biçimi: `kadir_games.json`, `mustafa_games.json`. */
export type LegacyRecord = {
  id: string;
  gameName: string;
  gameStatus: string;
  gamePlatform?: string;
  gameScore?: number | string | null;
  gameTotalTime?: number | string | null;
  gameDate?: string | null;
  gameReview?: string | null;
  gamePhoto?: string | null;
  createdAt?: { seconds: number; nanoseconds?: number } | string | null;
  screenshots?: Array<{ ssUrl?: string; ssName?: string }> | null;
};

const STATUS: Record<string, EntryStatus> = {
  Bitirildi: "completed",
  Bırakıldı: "dropped",
  "Aktif Oynanılıyor": "playing",
  Bitirilecek: "backlog",
};

const PLATFORM: Record<string, { platform: Platform; store: Store | null }> = {
  Steam: { platform: "pc", store: "steam" },
  "Epic Games": { platform: "pc", store: "epic" },
  Torrent: { platform: "pc", store: "torrent" },
  "Xbox(Pc)": { platform: "pc", store: "xbox" },
  Ubisoft: { platform: "pc", store: "ubisoft" },
  "EA Games": { platform: "pc", store: "ea" },
  Playstation: { platform: "playstation", store: "playstation" },
  "Diğer Platformlar": { platform: "other", store: null },
};

export type NormalizedRecord = {
  legacyRef: string;
  name: string;
  status: EntryStatus;
  platform: Platform | null;
  store: Store | null;
  rating: number | null;
  playtimeMin: number;
  lastPlayedAt: Date | null;
  finishedAt: string | null;
  review: string | null;
  coverUrl: string | null;
  createdAt: Date | null;
  screenshots: Array<{ url: string; caption: string | null }>;
  warnings: string[];
};

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function validDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? null : value;
}

/** Eski kaydı yeni modele çevirir; düzeltilen kirli değerleri `warnings`'e yazar. */
export function normalizeLegacyRecord(record: LegacyRecord): NormalizedRecord {
  const warnings: string[] = [];

  const status = STATUS[record.gameStatus] ?? "backlog";
  if (!STATUS[record.gameStatus])
    warnings.push(`bilinmeyen durum "${record.gameStatus}" → backlog`);

  const mapping = record.gamePlatform ? PLATFORM[record.gamePlatform] : undefined;
  if (record.gamePlatform && !mapping)
    warnings.push(`bilinmeyen platform "${record.gamePlatform}"`);

  const score = toNumber(record.gameScore);
  const rating = score === null ? null : Math.round(Math.min(10, Math.max(0, score)) * 10);

  const hours = toNumber(record.gameTotalTime);
  if (record.gameTotalTime !== undefined && typeof record.gameTotalTime !== "number") {
    warnings.push(`süre "${record.gameTotalTime}" → ${hours ?? 0} sa`);
  }
  const playtimeMin = Math.max(0, Math.round((hours ?? 0) * 60));

  const date = validDate(record.gameDate);
  const createdAt =
    record.createdAt && typeof record.createdAt === "object"
      ? new Date(record.createdAt.seconds * 1000)
      : typeof record.createdAt === "string"
        ? new Date(record.createdAt)
        : null;

  const photo = record.gamePhoto?.trim();
  const screenshots = (record.screenshots ?? [])
    .map((screenshot) => ({
      url: screenshot.ssUrl?.trim() ?? "",
      caption: screenshot.ssName?.trim() || null,
    }))
    .filter((screenshot) => screenshot.url.startsWith("https://"));

  return {
    legacyRef: `legacy:${record.id}`,
    name: record.gameName.trim(),
    status,
    platform: mapping?.platform ?? (record.gamePlatform ? "other" : null),
    store: mapping?.store ?? null,
    rating,
    playtimeMin,
    // Eski "oyun tarihi" son oynama tarihidir; bitirilen oyunlarda bitirme tarihi olarak da kullanılır.
    lastPlayedAt: date ? new Date(`${date}T12:00:00Z`) : null,
    finishedAt: status === "completed" ? date : null,
    review: record.gameReview?.trim() || null,
    coverUrl: photo?.startsWith("https://") ? photo : null,
    createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
    screenshots,
    warnings,
  };
}

export type ImportReport = {
  total: number;
  imported: number;
  skippedExisting: number;
  duplicates: string[];
  autoMatched: number;
  pendingMatches: number;
  unmatched: number;
  screenshots: number;
  warnings: Array<{ name: string; warnings: string[] }>;
};

type GameChoice = { gameId: string; candidates: MatchCandidate[]; autoMatched: boolean };

/**
 * Oyunu katalogda bulur ya da oluşturur. IGDB açıksa: yüksek güvenli eşleşme doğrudan kullanılır,
 * belirsizse eski adla geçici bir oyun açılır ve adaylar onay kutusuna gider. IGDB kapalıysa geçici oyun
 * açılır; worker'ın eşleştirme işi IGDB açıldığında onları işler.
 */
async function chooseGame(record: NormalizedRecord, dryRun: boolean): Promise<GameChoice | null> {
  const normalized = normalizeTitle(record.name);
  const [local] = await db
    .select({ id: schema.games.id, igdbId: schema.games.igdbId })
    .from(schema.games)
    .where(sql`lower(${schema.games.name}) = lower(${record.name})`)
    .limit(1);
  // Katalogda IGDB'ye bağlı aynı adlı oyun varsa eşleşmiş sayılır (rapor "eşleşmesiz" demesin).
  if (local) return { gameId: local.id, candidates: [], autoMatched: local.igdbId !== null };

  const candidates = igdbConfig() ? await findIgdbCandidates(record.name).catch(() => []) : [];
  const best = pickAutoMatch(candidates);
  if (dryRun) return null;

  if (best) {
    const game = await importIgdbGame(best.igdbId);
    return { gameId: game.id, candidates, autoMatched: true };
  }

  const baseSlug = slugify(record.name);
  const [created] = await db
    .insert(schema.games)
    .values({
      source: "legacy",
      name: record.name,
      slug: `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`,
      coverUrl: record.coverUrl,
    })
    .returning({ id: schema.games.id });
  if (!created) throw new Error(`oyun oluşturulamadı: ${record.name} (${normalized})`);
  return { gameId: created.id, candidates, autoMatched: false };
}

export async function importLegacyRecords(
  userId: string,
  records: LegacyRecord[],
  options: {
    dryRun?: boolean;
    log?: (line: string) => void;
    /** Her kayıttan sonra (atlananlar dahil) işlenen kayıt sayısıyla çağrılır. */
    onProgress?: (processed: number) => Promise<void> | void;
  } = {},
): Promise<ImportReport> {
  const log = options.log ?? (() => {});
  const report: ImportReport = {
    total: records.length,
    imported: 0,
    skippedExisting: 0,
    duplicates: [],
    autoMatched: 0,
    pendingMatches: 0,
    unmatched: 0,
    screenshots: 0,
    warnings: [],
  };
  const seenGames = new Set<string>();
  let pending = 0;

  let processed = 0;
  for (const raw of records) {
    if (processed > 0) await options.onProgress?.(processed);
    processed++;
    const record = normalizeLegacyRecord(raw);
    if (record.warnings.length)
      report.warnings.push({ name: record.name, warnings: record.warnings });

    const [existing] = await db
      .select({ id: schema.libraryEntries.id })
      .from(schema.libraryEntries)
      .where(eq(schema.libraryEntries.legacyRef, record.legacyRef));
    if (existing) {
      report.skippedExisting++;
      continue;
    }

    const choice = await chooseGame(record, options.dryRun ?? false);
    if (options.dryRun) {
      report.imported++;
      continue;
    }
    if (!choice) continue;

    if (seenGames.has(choice.gameId) || (await findEntryByGame(userId, choice.gameId))) {
      report.duplicates.push(record.name);
      log(`  ! tekrar eden kayıt atlandı: ${record.name}`);
      continue;
    }
    seenGames.add(choice.gameId);

    await db.transaction(async (tx) => {
      const entry = await addEntry(
        userId,
        {
          gameId: choice.gameId,
          legacyRef: record.legacyRef,
          status: record.status,
          rating: record.rating,
          review: record.review,
          platform: record.platform,
          store: record.store,
          playtimeManualMin: record.playtimeMin,
          lastPlayedAt: record.lastPlayedAt,
          finishedAt: record.finishedAt,
        },
        { source: "migration", tx },
      );
      if (record.createdAt) {
        await tx
          .update(schema.libraryEntries)
          .set({ createdAt: record.createdAt, updatedAt: record.lastPlayedAt ?? record.createdAt })
          .where(eq(schema.libraryEntries.id, entry.id));
      }
      if (record.screenshots.length) {
        await tx.insert(schema.screenshots).values(
          record.screenshots.map((screenshot) => ({
            entryId: entry.id,
            userId,
            gameId: choice.gameId,
            kind: "steam" as const,
            url: screenshot.url,
            caption: screenshot.caption,
          })),
        );
        report.screenshots += record.screenshots.length;
      }

      if (choice.autoMatched) {
        report.autoMatched++;
      } else if (choice.candidates.length) {
        const result = await propose(tx, {
          userId,
          source: "migration",
          kind: "match",
          gameId: choice.gameId,
          entryId: entry.id,
          dedupeKey: `migration:match:${choice.gameId}`,
          confidence: choice.candidates[0]?.score ?? null,
          payload: { op: "match", gameName: record.name, candidates: choice.candidates },
        });
        if (result.created) {
          report.pendingMatches++;
          pending++;
        }
      } else {
        report.unmatched++;
      }
    });
    report.imported++;
    log(`  ✓ ${record.name}${choice.autoMatched ? " (IGDB)" : ""}`);
  }

  if (pending > 0) await db.transaction((tx) => notifyPending(tx, userId, pending));
  await options.onProgress?.(processed);
  return report;
}
