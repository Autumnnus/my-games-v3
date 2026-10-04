import { schema } from "@my-games/db";
import type { EntryStatus } from "@my-games/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { AppError, notFound } from "../errors";
import { emit } from "../events";
import { type ImportReport, importLegacyRecords, normalizeLegacyRecord } from "../legacy";
import { logger } from "../log";
import { type AdminActor, audit } from "./audit";

const { legacyImports, libraryEntries, games, user } = schema;

/**
 * Eski sistemden (my-games-old, Firestore dönemi) aktarımın yönetim paneli tarafı. Admin dışa aktarım dosyasını
 * (`kadir_games.json` gibi) bir kullanıcıya yükler: önce önizleme (hızlı, IGDB'ye gitmez), onaylanınca kayıtlar
 * `legacy_imports`'a yazılır ve worker aktarır. IGDB eşleştirmesi yüzlerce kayıtta dakikalar sürdüğü için istek
 * içinde yapılmaz. Aktarım tekrar çalıştırılabilir: aktarılmış kayıtlar (`legacy_ref`) atlanır.
 */

export const MAX_LEGACY_RECORDS = 5000;

const timestampSchema = z.union([
  z.object({ seconds: z.number(), nanoseconds: z.number().optional() }).loose(),
  z.string(),
  z.null(),
]);

const legacyRecordSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(200)),
    gameName: z.string().trim().min(1).max(300),
    gameStatus: z.string().max(100),
    gamePlatform: z.string().max(100).nullish(),
    gameScore: z.union([z.number(), z.string(), z.null()]).optional(),
    gameTotalTime: z.union([z.number(), z.string(), z.null()]).optional(),
    gameDate: z.string().max(100).nullish(),
    gameReview: z.string().max(20_000).nullish(),
    gamePhoto: z.string().max(2000).nullish(),
    createdAt: timestampSchema.optional(),
    screenshots: z
      .array(
        z
          .object({
            ssUrl: z.string().max(2000).optional(),
            ssName: z.string().max(500).optional(),
          })
          .loose(),
      )
      .max(500)
      .nullish(),
  })
  .loose()
  // Eski dosyada `null` olan isteğe bağlı alanlar normalleştirmede "yok" sayılır.
  .transform((record) => ({
    ...record,
    gamePlatform: record.gamePlatform ?? undefined,
  }));

export const legacyFileSchema = z.array(legacyRecordSchema).min(1).max(MAX_LEGACY_RECORDS);
export type LegacyFileRecord = z.infer<typeof legacyRecordSchema>;

async function targetOf(userId: string) {
  const [row] = await db
    .select({ id: user.id, username: user.displayUsername, email: user.email })
    .from(user)
    .where(eq(user.id, userId));
  if (!row) notFound("Kullanıcı bulunamadı");
  return { ...row, label: row.username ? `@${row.username}` : row.email };
}

async function assertNoActiveImport(userId: string) {
  const [active] = await db
    .select({ id: legacyImports.id })
    .from(legacyImports)
    .where(
      and(eq(legacyImports.userId, userId), inArray(legacyImports.status, ["queued", "running"])),
    )
    .limit(1);
  if (active) {
    throw new AppError(
      "conflict",
      "Bu kullanıcı için süren bir aktarım var",
      "legacy_import_running",
    );
  }
}

/** Dosyanın bu kullanıcıya aktarılınca ne olacağını özetler. Veritabanına yazmaz, IGDB'ye gitmez. */
export async function previewLegacyImport(userId: string, records: LegacyFileRecord[]) {
  await targetOf(userId);
  const normalized = records.map((record) => normalizeLegacyRecord(record));

  const refs = normalized.map((record) => record.legacyRef);
  const existing = refs.length
    ? await db
        .select({ legacyRef: libraryEntries.legacyRef, userId: libraryEntries.userId })
        .from(libraryEntries)
        .where(inArray(libraryEntries.legacyRef, refs))
    : [];
  const importedHere = new Set(
    existing.filter((row) => row.userId === userId).map((row) => row.legacyRef),
  );
  const importedElsewhere = new Set(
    existing.filter((row) => row.userId !== userId).map((row) => row.legacyRef),
  );

  // Kütüphanede aynı adlı oyun varsa (Steam'den gelmiş olabilir) kayıt tekrar sayılıp atlanır.
  const libraryNames = new Set(
    (
      await db
        .select({ name: games.name })
        .from(libraryEntries)
        .innerJoin(games, eq(games.id, libraryEntries.gameId))
        .where(eq(libraryEntries.userId, userId))
    ).map((row) => row.name.toLowerCase()),
  );

  const statuses: Partial<Record<EntryStatus, number>> = {};
  const seenNames = new Map<string, number>();
  const inLibrary: string[] = [];
  let screenshots = 0;
  let toImport = 0;
  for (const record of normalized) {
    if (importedHere.has(record.legacyRef) || importedElsewhere.has(record.legacyRef)) continue;
    toImport++;
    statuses[record.status] = (statuses[record.status] ?? 0) + 1;
    screenshots += record.screenshots.length;
    const key = record.name.toLowerCase();
    seenNames.set(key, (seenNames.get(key) ?? 0) + 1);
    if (libraryNames.has(key)) inLibrary.push(record.name);
  }
  const warnings = normalized
    .filter((record) => record.warnings.length)
    .map((record) => ({ name: record.name, warnings: record.warnings }));

  return {
    total: records.length,
    toImport,
    alreadyImported: importedHere.size,
    importedElsewhere: importedElsewhere.size,
    statuses,
    screenshots,
    inLibrary: inLibrary.slice(0, 50),
    inLibraryCount: inLibrary.length,
    duplicateNames: [...seenNames].filter(([, count]) => count > 1).length,
    warningCount: warnings.length,
    warnings: warnings.slice(0, 30),
    sample: normalized.slice(0, 6).map((record) => record.name),
  };
}

/** Aktarımı kuyruğa alır; worker `runLegacyImport` ile işler. */
export async function startLegacyImport(
  actor: AdminActor,
  userId: string,
  input: { fileName: string; records: LegacyFileRecord[] },
) {
  const target = await targetOf(userId);
  await assertNoActiveImport(userId);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(legacyImports)
      .values({
        userId,
        createdBy: actor.id,
        fileName: input.fileName,
        total: input.records.length,
        records: input.records,
      })
      .returning({ id: legacyImports.id });
    if (!row) throw new Error("legacy_imports insert failed");
    await emit(tx, "legacy.import_requested", { importId: row.id });
    await audit(
      tx,
      actor,
      "user.legacy_import",
      { type: "user", id: userId, label: target.label },
      { importId: row.id, fileName: input.fileName, records: input.records.length },
    );
    return { id: row.id };
  });
}

export async function listLegacyImports(userId: string) {
  const rows = await db
    .select({
      id: legacyImports.id,
      fileName: legacyImports.fileName,
      status: legacyImports.status,
      total: legacyImports.total,
      processed: legacyImports.processed,
      report: legacyImports.report,
      error: legacyImports.error,
      createdAt: legacyImports.createdAt,
      startedAt: legacyImports.startedAt,
      finishedAt: legacyImports.finishedAt,
      createdBy: user.displayUsername,
    })
    .from(legacyImports)
    .leftJoin(user, eq(user.id, legacyImports.createdBy))
    .where(eq(legacyImports.userId, userId))
    .orderBy(desc(legacyImports.createdAt))
    .limit(10);
  return rows.map((row) => ({
    ...row,
    report: row.report as ImportReport | null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }));
}

/**
 * Worker işi. Yarıda kesilirse (yeniden başlatma, hata) pg-boss tekrar dener; aktarılmış kayıtlar atlandığı
 * için kaldığı yerden devam eder. Başarıyla bitince kayıtlar silinir, rapor kalır.
 */
export async function runLegacyImport(importId: string) {
  const [row] = await db.select().from(legacyImports).where(eq(legacyImports.id, importId));
  if (!row || row.status === "done" || !row.records) return { skipped: true };

  await db
    .update(legacyImports)
    .set({ status: "running", startedAt: new Date(), processed: 0, error: null })
    .where(eq(legacyImports.id, importId));

  try {
    const records = legacyFileSchema.parse(row.records);
    const report = await importLegacyRecords(row.userId, records, {
      onProgress: async (processed) => {
        if (processed % 5 !== 0 && processed !== records.length) return;
        await db.update(legacyImports).set({ processed }).where(eq(legacyImports.id, importId));
      },
    });
    await db
      .update(legacyImports)
      .set({
        status: "done",
        processed: records.length,
        report,
        records: null,
        finishedAt: new Date(),
      })
      .where(eq(legacyImports.id, importId));
    logger.info(
      "worker",
      "legacy_import_done",
      `eski sistem aktarımı bitti: ${report.imported}/${report.total} kayıt`,
      { userId: row.userId, context: { importId, report } },
    );
    return { imported: report.imported, total: report.total };
  } catch (error) {
    await db
      .update(legacyImports)
      .set({
        status: "failed",
        error: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
        finishedAt: new Date(),
      })
      .where(eq(legacyImports.id, importId));
    throw error;
  }
}
