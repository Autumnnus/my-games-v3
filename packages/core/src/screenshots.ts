import { schema } from "@my-games/db";
import type { UploadQuality } from "@my-games/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "./db";
import { AppError, forbidden, notFound } from "./errors";
import { emit } from "./events";
import {
  assetUrls,
  discardAssets,
  type MediaAsset,
  markReady,
  reserveUploads,
  type VariantInput,
  verifyPendingAssets,
} from "./media";

const { screenshots, libraryEntries, mediaAssets, user } = schema;

/** Link ile eklenen screenshot'lar kotaya sayılmaz; yine de sınırsız olmasınlar. */
const MAX_LINKED_SCREENSHOTS = 2000;

async function assertLinkLimit(userId: string, adding: number) {
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(screenshots)
    .where(and(eq(screenshots.userId, userId), sql`${screenshots.kind} <> 'upload'`));
  if (count + adding > MAX_LINKED_SCREENSHOTS) {
    throw new AppError("quota_exceeded", "Link ile eklenebilecek screenshot sınırına ulaştın");
  }
}

async function ownedEntry(userId: string, entryId: string) {
  const [entry] = await db.select().from(libraryEntries).where(eq(libraryEntries.id, entryId));
  if (!entry) notFound("Kayıt bulunamadı");
  if (entry.userId !== userId) forbidden();
  return entry;
}

/**
 * Screenshot yüklemesinin ilk adımı: kota ayrılır, her varyant için imzalı URL döner. Görseller tarayıcıda
 * hazırlanır (optimize: AVIF + küçük görsel; orijinal: dosyanın kendisi + gösterim kopyası + küçük görsel).
 */
export async function createScreenshotUploads(
  userId: string,
  entryId: string,
  input: { quality: UploadQuality; files: Array<{ variants: VariantInput[] }> },
) {
  await ownedEntry(userId, entryId);
  return reserveUploads(userId, { purpose: "screenshot", ...input });
}

/** Yüklenen dosyaları doğrular ve screenshot kayıtlarını oluşturur. */
export async function confirmScreenshotUploads(
  userId: string,
  entryId: string,
  items: Array<{ assetId: string; caption?: string }>,
) {
  const entry = await ownedEntry(userId, entryId);
  const assets = await verifyPendingAssets(
    userId,
    "screenshot",
    items.map((item) => item.assetId),
  );

  return db.transaction(async (tx) => {
    await markReady(
      tx,
      assets.map((asset) => asset.id),
    );
    const rows = await tx
      .insert(screenshots)
      .values(
        assets.map((asset) => {
          const full = asset.variants.find((variant) => variant.name === "full");
          const caption = items.find((item) => item.assetId === asset.id)?.caption;
          return {
            entryId,
            userId,
            gameId: entry.gameId,
            kind: "upload" as const,
            assetId: asset.id,
            width: full?.width ?? null,
            height: full?.height ?? null,
            caption: caption?.trim() || null,
          };
        }),
      )
      .returning();
    await emit(tx, "screenshots.added", {
      userId,
      gameId: entry.gameId,
      entryId,
      screenshotIds: rows.map((row) => row.id),
    });
    return rows.map((row) =>
      present(
        row,
        assets.find((asset) => asset.id === row.assetId),
      ),
    );
  });
}

/** Başka bir yerde barınan görseli (ör. Steam topluluk linki) kaydeder. */
export async function addExternalScreenshot(
  userId: string,
  entryId: string,
  input: { url: string; caption?: string | null },
  kind: "external" | "steam" = "external",
) {
  const entry = await ownedEntry(userId, entryId);
  await assertLinkLimit(userId, 1);
  const url = new URL(input.url);
  if (url.protocol !== "https:") throw new AppError("invalid", "Sadece https bağlantılar");
  const [row] = await db
    .insert(screenshots)
    .values({
      entryId,
      userId,
      gameId: entry.gameId,
      kind,
      url: url.toString(),
      caption: input.caption?.trim() || null,
    })
    .returning();
  if (!row) throw new AppError("conflict");
  return present(row);
}

export type PlatformScreenshot = {
  externalId: string;
  url: string;
  thumbUrl: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  takenAt: string | null;
};

/**
 * Platformdan (Steam) gelen ekran görüntülerini kayda ekler; daha önce eklenenler atlanır. `announce`:
 * akışa "ekran görüntüsü ekledi" düşsün mü (ilk toplu içe aktarımda düşmez).
 */
export async function insertPlatformScreenshots(
  tx: Tx,
  input: {
    userId: string;
    entryId: string;
    gameId: string | null;
    items: PlatformScreenshot[];
    announce: boolean;
  },
) {
  if (input.items.length === 0) return [];
  const [entry] = await tx
    .select({ gameId: libraryEntries.gameId, userId: libraryEntries.userId })
    .from(libraryEntries)
    .where(eq(libraryEntries.id, input.entryId));
  if (!entry || entry.userId !== input.userId) return [];
  const rows = await tx
    .insert(screenshots)
    .values(
      input.items.map((item) => ({
        entryId: input.entryId,
        userId: input.userId,
        gameId: entry.gameId,
        kind: "steam" as const,
        url: item.url,
        thumbUrl: item.thumbUrl,
        externalId: item.externalId,
        width: item.width,
        height: item.height,
        caption: item.caption,
        takenAt: item.takenAt ? new Date(item.takenAt) : null,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: screenshots.id });
  if (input.announce && rows.length > 0) {
    await emit(tx, "screenshots.added", {
      userId: input.userId,
      gameId: entry.gameId,
      entryId: input.entryId,
      screenshotIds: rows.map((row) => row.id),
    });
  }
  return rows;
}

export async function deleteScreenshot(userId: string, screenshotId: string, asAdmin = false) {
  const [row] = await db
    .select({ screenshot: screenshots, asset: mediaAssets })
    .from(screenshots)
    .leftJoin(mediaAssets, eq(mediaAssets.id, screenshots.assetId))
    .where(eq(screenshots.id, screenshotId));
  if (!row) notFound();
  if (row.screenshot.userId !== userId && !asAdmin) forbidden();
  await db.transaction(async (tx) => {
    // Yüklenen görselde asset silinince screenshot cascade ile gider; dosyalar worker'da kaldırılır.
    if (row.asset) await discardAssets(tx, [row.asset]);
    else await tx.delete(screenshots).where(eq(screenshots.id, screenshotId));
  });
}

export async function updateCaption(userId: string, screenshotId: string, caption: string | null) {
  const [row] = await db
    .update(screenshots)
    .set({ caption: caption?.trim() || null })
    .where(and(eq(screenshots.id, screenshotId), eq(screenshots.userId, userId)))
    .returning();
  if (!row) notFound();
  const [asset] = row.assetId
    ? await db.select().from(mediaAssets).where(eq(mediaAssets.id, row.assetId))
    : [];
  return present(row, asset);
}

type ScreenshotRow = typeof screenshots.$inferSelect;

/** Adresler okuma anında üretilir; CDN adresi değişse de kayıtlara dokunmak gerekmez. */
function present(row: ScreenshotRow, asset?: MediaAsset | null) {
  const urls = asset
    ? assetUrls(asset)
    : { url: row.url, thumbUrl: row.thumbUrl ?? row.url, originalUrl: null };
  return {
    id: row.id,
    entryId: row.entryId,
    gameId: row.gameId,
    userId: row.userId,
    kind: row.kind,
    url: urls.url,
    thumbUrl: urls.thumbUrl,
    /** Sadece "orijinal" modda yüklenenlerde: dosyanın kendisi (lightbox'ta "Orijinali aç"). */
    originalUrl: urls.originalUrl,
    sizeBytes: asset?.totalBytes ?? null,
    width: row.width,
    height: row.height,
    caption: row.caption,
    takenAt: row.takenAt,
    createdAt: row.createdAt,
  };
}

/** Kimlikleri verilen ekran görüntülerinin küçük görsel adresleri (akış kartlarındaki önizlemeler). */
export async function screenshotThumbs(ids: string[]) {
  const thumbs = new Map<string, string>();
  if (ids.length === 0) return thumbs;
  const rows = await db
    .select({ screenshot: screenshots, asset: mediaAssets })
    .from(screenshots)
    .leftJoin(mediaAssets, eq(mediaAssets.id, screenshots.assetId))
    .where(inArray(screenshots.id, ids));
  for (const row of rows) {
    const { thumbUrl } = present(row.screenshot, row.asset);
    if (thumbUrl) thumbs.set(row.screenshot.id, thumbUrl);
  }
  return thumbs;
}

export async function listScreenshots(
  filter: { entryId?: string; gameId?: string; userId?: string },
  limit = 60,
) {
  const conditions = [];
  if (filter.entryId) conditions.push(eq(screenshots.entryId, filter.entryId));
  if (filter.gameId) conditions.push(eq(screenshots.gameId, filter.gameId));
  if (filter.userId) conditions.push(eq(screenshots.userId, filter.userId));
  const rows = await db
    .select({
      screenshot: screenshots,
      asset: mediaAssets,
      author: { name: user.name, username: user.displayUsername },
    })
    .from(screenshots)
    .innerJoin(user, eq(user.id, screenshots.userId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, screenshots.assetId))
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${screenshots.takenAt}, ${screenshots.createdAt})`))
    .limit(Math.min(limit, 200));
  return rows.map((row) => ({ ...present(row.screenshot, row.asset), author: row.author }));
}

/** Ana sayfa için rastgele birkaç görsel (eski uygulamadaki "rastgele screenshot" bölümü). */
export async function randomScreenshots(count = 6) {
  const rows = await db
    .select({
      screenshot: screenshots,
      asset: mediaAssets,
      author: { name: user.name, username: user.displayUsername },
    })
    .from(screenshots)
    .innerJoin(user, eq(user.id, screenshots.userId))
    .leftJoin(mediaAssets, eq(mediaAssets.id, screenshots.assetId))
    .orderBy(sql`random()`)
    .limit(Math.min(count, 24));
  return rows.map((row) => ({ ...present(row.screenshot, row.asset), author: row.author }));
}
