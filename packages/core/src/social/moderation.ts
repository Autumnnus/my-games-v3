import { schema } from "@my-games/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { AppError, notFound } from "../errors";
import { updateEntry } from "../library";
import { deleteScreenshot, screenshotThumbs } from "../screenshots";
import { deleteComment } from "./interactions";

const { reports, comments, libraryEntries, screenshots, user, activities } = schema;

export type ReportTarget = "comment" | "entry" | "screenshot" | "user";

async function targetExists(targetType: ReportTarget, targetId: string) {
  const table = { comment: comments, entry: libraryEntries, screenshot: screenshots, user }[
    targetType
  ];
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, targetId))
    .limit(1);
  return !!row;
}

export async function createReport(
  reporterId: string,
  input: { targetType: ReportTarget; targetId: string; reason: string },
) {
  const reason = input.reason.trim().slice(0, 1000);
  if (!reason) throw new AppError("invalid", "Bir sebep yazmalısın", "report_reason_required");
  if (!(await targetExists(input.targetType, input.targetId)))
    notFound("İçerik bulunamadı", "content_not_found");
  // Aynı kişi aynı içeriği açık bir şikayet varken tekrar şikayet edemez.
  const [open] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, reporterId),
        eq(reports.targetType, input.targetType),
        eq(reports.targetId, input.targetId),
        eq(reports.status, "open"),
      ),
    );
  if (open) return open;
  const [row] = await db
    .insert(reports)
    .values({ reporterId, targetType: input.targetType, targetId: input.targetId, reason })
    .returning({ id: reports.id });
  return row;
}

/** Şikayetler + içeriğin kısa önizlemesi (admin paneli). */
export async function listReports(status: "open" | "resolved" | "dismissed" = "open") {
  const rows = await db
    .select({
      report: reports,
      reporter: { id: user.id, name: user.name, username: user.displayUsername },
    })
    .from(reports)
    .innerJoin(user, eq(user.id, reports.reporterId))
    .where(eq(reports.status, status))
    .orderBy(desc(reports.createdAt))
    .limit(200);

  return Promise.all(
    rows.map(async ({ report, reporter }) => ({
      ...report,
      reporter,
      preview: await preview(report.targetType, report.targetId),
    })),
  );
}

async function preview(targetType: ReportTarget, targetId: string) {
  if (targetType === "comment") {
    const [row] = await db
      .select({
        text: comments.body,
        ownerId: comments.authorId,
        deleted: sql<boolean>`${comments.deletedAt} is not null`,
      })
      .from(comments)
      .where(eq(comments.id, targetId));
    return row ?? null;
  }
  if (targetType === "entry") {
    const [row] = await db
      .select({ text: libraryEntries.review, ownerId: libraryEntries.userId })
      .from(libraryEntries)
      .where(eq(libraryEntries.id, targetId));
    return row ?? null;
  }
  if (targetType === "screenshot") {
    const [row] = await db
      .select({ text: screenshots.caption, ownerId: screenshots.userId, url: screenshots.url })
      .from(screenshots)
      .where(eq(screenshots.id, targetId));
    if (!row) return null;
    // Yüklenen görsellerde adres asset'ten üretilir.
    const thumbs = await screenshotThumbs([targetId]);
    return { ...row, url: row.url ?? thumbs.get(targetId) ?? null };
  }
  const [row] = await db
    .select({ text: user.name, ownerId: user.id })
    .from(user)
    .where(eq(user.id, targetId));
  return row ?? null;
}

/**
 * Şikayeti kapatır. `removeContent` ile içerik de kaldırılır: yorum silinir, screenshot silinir, inceleme
 * metni temizlenir (kütüphane kaydı kalır). Kullanıcı banlama Better Auth admin API'si ile yapılır.
 */
export async function resolveReport(
  adminId: string,
  reportId: string,
  outcome: "resolved" | "dismissed",
  removeContent = false,
) {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) notFound("Şikayet bulunamadı");

  if (removeContent && outcome === "resolved") {
    if (report.targetType === "comment")
      await deleteComment(adminId, report.targetId, true).catch(() => {});
    if (report.targetType === "screenshot")
      await deleteScreenshot(adminId, report.targetId, true).catch(() => {});
    if (report.targetType === "entry") {
      const [entry] = await db
        .select()
        .from(libraryEntries)
        .where(eq(libraryEntries.id, report.targetId));
      if (entry) {
        await db.transaction(async (tx) => {
          await updateEntry(entry.userId, entry.id, { review: null }, { source: "system", tx });
          // Akıştaki inceleme alıntısı da kalkar.
          await tx.delete(activities).where(eq(activities.groupKey, `reviewed:${entry.id}`));
        });
      }
    }
  }

  // Aynı içerik için açık tüm şikayetler birlikte kapanır.
  await db
    .update(reports)
    .set({ status: outcome, resolvedById: adminId, resolvedAt: new Date() })
    .where(
      and(
        eq(reports.targetType, report.targetType),
        eq(reports.targetId, report.targetId),
        eq(reports.status, "open"),
      ),
    );
}
