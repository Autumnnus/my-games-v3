import { schema } from "@my-games/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Tx } from "./db";
import { AppError, forbidden, notFound } from "./errors";
import { emit } from "./events";
import {
  type AllowedImageType,
  deleteObject,
  headObject,
  isAllowedImageType,
  isOwnObjectKey,
  maxUploadBytes,
  newObjectKey,
  presignPut,
  publicUrl,
} from "./storage";

const { screenshots, libraryEntries, user } = schema;

const MAX_SCREENSHOTS_PER_USER = 2000;
const MAX_BATCH = 20;

async function assertQuota(userId: string, adding: number) {
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(screenshots)
    .where(eq(screenshots.userId, userId));
  if (count + adding > MAX_SCREENSHOTS_PER_USER) {
    throw new AppError("quota_exceeded", "Screenshot sınırına ulaştın");
  }
}

async function ownedEntry(userId: string, entryId: string) {
  const [entry] = await db.select().from(libraryEntries).where(eq(libraryEntries.id, entryId));
  if (!entry) notFound("Kayıt bulunamadı");
  if (entry.userId !== userId) forbidden();
  return entry;
}

/**
 * Tarayıcının yükleyeceği her görsel için iki imzalı URL verir: orijinal (istemcide küçültülmüş) ve küçük
 * önizleme. Kayıt, yükleme bitip `confirmUploads` çağrılınca oluşur.
 */
export async function createUploadTargets(
  userId: string,
  entryId: string,
  files: Array<{ contentType: string; size: number; thumbSize: number }>,
) {
  await ownedEntry(userId, entryId);
  if (files.length === 0 || files.length > MAX_BATCH) {
    throw new AppError("invalid", `Tek seferde 1–${MAX_BATCH} görsel yüklenebilir`);
  }
  await assertQuota(userId, files.length);

  return Promise.all(
    files.map(async (file) => {
      if (!isAllowedImageType(file.contentType))
        throw new AppError("invalid", "Desteklenmeyen dosya türü");
      const type = file.contentType as AllowedImageType;
      const key = newObjectKey("screenshots", userId, type);
      const thumbKey = key.replace(/\.(\w+)$/, "_thumb.$1");
      const [original, thumb] = await Promise.all([
        presignPut(key, type, file.size),
        presignPut(thumbKey, type, file.thumbSize),
      ]);
      return { key, thumbKey, upload: original, thumbUpload: thumb, maxBytes: maxUploadBytes() };
    }),
  );
}

export async function confirmUploads(
  userId: string,
  entryId: string,
  items: Array<{
    key: string;
    thumbKey: string;
    width?: number;
    height?: number;
    caption?: string;
  }>,
) {
  const entry = await ownedEntry(userId, entryId);
  const limit = maxUploadBytes();

  const verified = await Promise.all(
    items.slice(0, MAX_BATCH).map(async (item) => {
      // Yalnızca bu kullanıcıya `createUploadTargets` ile verilmiş biçimdeki anahtarlar kabul edilir.
      if (
        !isOwnObjectKey(item.key, "screenshots", userId) ||
        item.key.includes("_thumb.") ||
        item.thumbKey !== item.key.replace(/\.(\w+)$/, "_thumb.$1")
      ) {
        forbidden();
      }
      const [original, thumb] = await Promise.all([
        headObject(item.key),
        headObject(item.thumbKey),
      ]);
      if (!original || !thumb) throw new AppError("invalid", "Yüklenen dosya bulunamadı");
      const valid = [original, thumb].every(
        (object) => object.size <= limit && isAllowedImageType(object.contentType),
      );
      if (!valid) {
        await Promise.all([deleteObject(item.key), deleteObject(item.thumbKey)]);
        throw new AppError("invalid", "Geçersiz dosya");
      }
      return { ...item, sizeBytes: original.size };
    }),
  );
  if (verified.length === 0) return [];

  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(screenshots)
      .values(
        verified.map((item) => ({
          entryId,
          userId,
          gameId: entry.gameId,
          kind: "upload" as const,
          storageKey: item.key,
          thumbKey: item.thumbKey,
          width: item.width ?? null,
          height: item.height ?? null,
          sizeBytes: item.sizeBytes,
          caption: item.caption?.trim() || null,
        })),
      )
      .returning();
    await emit(tx, "screenshots.added", {
      userId,
      gameId: entry.gameId,
      entryId,
      screenshotIds: rows.map((row) => row.id),
    });
    return rows.map(present);
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
  await assertQuota(userId, 1);
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

/**
 * Hesap silinirken kullanıcının yüklediği dosyaları (screenshot'lar + avatar) silinmek üzere kuyruğa atar.
 * Satırlar cascade ile silinir; dosyalar worker'da `storage.delete` işiyle kaldırılır.
 */
export async function queueUserUploadsCleanup(userId: string, image?: string | null) {
  const rows = await db
    .select({ key: screenshots.storageKey, thumbKey: screenshots.thumbKey })
    .from(screenshots)
    .where(and(eq(screenshots.userId, userId), eq(screenshots.kind, "upload")));
  const keys = rows.flatMap((row) => [row.key, row.thumbKey]).filter((key) => key !== null);
  const avatarPrefix = publicUrl(`avatars/${userId}/`);
  if (image && avatarPrefix && image.startsWith(avatarPrefix)) {
    keys.push(image.slice(image.indexOf(`avatars/${userId}/`)));
  }
  if (keys.length === 0) return;
  await db.transaction((tx) => emit(tx, "storage.objects_orphaned", { keys }));
}

export async function deleteScreenshot(userId: string, screenshotId: string, asAdmin = false) {
  const [row] = await db.select().from(screenshots).where(eq(screenshots.id, screenshotId));
  if (!row) notFound();
  if (row.userId !== userId && !asAdmin) forbidden();
  await db.delete(screenshots).where(eq(screenshots.id, screenshotId));
  const keys = [row.storageKey, row.thumbKey].filter((key): key is string => !!key);
  await Promise.all(keys.map((key) => deleteObject(key).catch(() => {})));
}

export async function updateCaption(userId: string, screenshotId: string, caption: string | null) {
  const [row] = await db
    .update(screenshots)
    .set({ caption: caption?.trim() || null })
    .where(and(eq(screenshots.id, screenshotId), eq(screenshots.userId, userId)))
    .returning();
  if (!row) notFound();
  return present(row);
}

type ScreenshotRow = typeof screenshots.$inferSelect;

function present(row: ScreenshotRow) {
  const url = row.kind === "upload" && row.storageKey ? publicUrl(row.storageKey) : row.url;
  const thumbUrl =
    row.kind === "upload" && row.thumbKey ? publicUrl(row.thumbKey) : (row.thumbUrl ?? row.url);
  return {
    id: row.id,
    entryId: row.entryId,
    gameId: row.gameId,
    userId: row.userId,
    kind: row.kind,
    url,
    thumbUrl,
    width: row.width,
    height: row.height,
    caption: row.caption,
    takenAt: row.takenAt,
    createdAt: row.createdAt,
  };
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
      author: { name: user.name, username: user.displayUsername },
    })
    .from(screenshots)
    .innerJoin(user, eq(user.id, screenshots.userId))
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${screenshots.takenAt}, ${screenshots.createdAt})`))
    .limit(Math.min(limit, 200));
  return rows.map((row) => ({ ...present(row.screenshot), author: row.author }));
}

/** Ana sayfa için rastgele birkaç görsel (eski uygulamadaki "rastgele screenshot" bölümü). */
export async function randomScreenshots(count = 6) {
  const rows = await db
    .select({
      screenshot: screenshots,
      author: { name: user.name, username: user.displayUsername },
    })
    .from(screenshots)
    .innerJoin(user, eq(user.id, screenshots.userId))
    .orderBy(sql`random()`)
    .limit(Math.min(count, 24));
  return rows.map((row) => ({ ...present(row.screenshot), author: row.author }));
}
