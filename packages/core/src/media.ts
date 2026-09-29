import { schema } from "@my-games/db";
import {
  MAX_UPLOAD_BATCH,
  type MediaPurpose,
  type MediaVariantName,
  mediaRules,
  type UploadQuality,
} from "@my-games/shared";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { storageLimits } from "./config";
import { type DbOrTx, db, type Tx } from "./db";
import { AppError, notFound } from "./errors";
import { emit } from "./events";
import { notify } from "./social/notifications";
import { extensionFor, storageFor, systemStorage } from "./storage";

/**
 * Kullanıcı yüklemeleri: kota, iki adımlı yükleme (ayır → tarayıcı PUT eder → onayla) ve temizlik.
 * Kota byte bazlıdır ve yalnızca sistem deposunda (R2) geçerlidir; kullanım her seferinde SQL ile hesaplanır.
 */

const { mediaAssets, userStorage, appConfig, user } = schema;

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type MediaVariant = schema.MediaVariant;

const DEFAULT_QUOTA_KEY = "storage.default_quota_bytes";
const BUDGET_ALERT_KEY = "storage.budget_alert_level";
/** Onaylanmayan yüklemeler bu süreden sonra silinir (imzalı URL'ler 10 dakikada düşer). */
const PENDING_TTL_MINUTES = 60;

const purposeDir: Record<MediaPurpose, string> = { screenshot: "screenshots", avatar: "avatar" };

export type VariantInput = {
  name: MediaVariantName;
  contentType: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
};

// --- Kota ---

async function readConfig<T>(tx: DbOrTx, key: string) {
  const [row] = await tx.select().from(appConfig).where(eq(appConfig.key, key));
  return (row?.value ?? null) as T | null;
}

async function writeConfig(tx: DbOrTx, key: string, value: unknown) {
  await tx
    .insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } });
}

export async function defaultQuotaBytes(tx: DbOrTx = db) {
  const stored = await readConfig<number>(tx, DEFAULT_QUOTA_KEY);
  return typeof stored === "number" && stored >= 0 ? stored : storageLimits().defaultQuotaBytes;
}

async function settingsOf(tx: DbOrTx, userId: string) {
  const [row] = await tx.select().from(userStorage).where(eq(userStorage.userId, userId));
  return row ?? null;
}

async function quotaOf(tx: DbOrTx, userId: string) {
  const settings = await settingsOf(tx, userId);
  return settings?.quotaBytes ?? (await defaultQuotaBytes(tx));
}

/**
 * Kotaya sayılan kullanım (bekleyen yüklemeler dahil). `replacingAvatar`: yeni avatar eskisinin yerine
 * geçeceği için mevcut avatar sayılmaz (bekleyen avatar denemeleri sayılmaya devam eder).
 */
async function usedBytes(tx: DbOrTx, userId: string, options: { replacingAvatar?: boolean } = {}) {
  const [row] = await tx
    .select({ bytes: sql<string>`coalesce(sum(${mediaAssets.totalBytes}), 0)` })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.userId, userId),
        isNull(mediaAssets.targetId),
        options.replacingAvatar
          ? sql`not (${mediaAssets.purpose} = 'avatar' and ${mediaAssets.status} = 'ready')`
          : undefined,
      ),
    );
  return Number(row?.bytes ?? 0);
}

async function systemUsedBytes(tx: DbOrTx) {
  const [row] = await tx
    .select({ bytes: sql<string>`coalesce(sum(${mediaAssets.totalBytes}), 0)` })
    .from(mediaAssets)
    .where(isNull(mediaAssets.targetId));
  return Number(row?.bytes ?? 0);
}

/** Ayarlar sayfası ve yükleme penceresi için: kullanım, kota, dağılım, tercih. */
export async function storageUsage(userId: string) {
  const [settings, quota, rows, systemUsed] = await Promise.all([
    settingsOf(db, userId),
    quotaOf(db, userId),
    db
      .select({
        purpose: mediaAssets.purpose,
        status: mediaAssets.status,
        count: sql<number>`count(*)::int`,
        bytes: sql<string>`coalesce(sum(${mediaAssets.totalBytes}), 0)`,
      })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.userId, userId), isNull(mediaAssets.targetId)))
      .groupBy(mediaAssets.purpose, mediaAssets.status),
    systemUsedBytes(db),
  ]);
  const breakdown = { screenshot: { count: 0, bytes: 0 }, avatar: { count: 0, bytes: 0 } };
  let pendingBytes = 0;
  for (const row of rows) {
    const bytes = Number(row.bytes);
    if (row.status === "pending") {
      pendingBytes += bytes;
      continue;
    }
    breakdown[row.purpose].count += row.count;
    breakdown[row.purpose].bytes += bytes;
  }
  const readyBytes = breakdown.screenshot.bytes + breakdown.avatar.bytes;
  return {
    usedBytes: readyBytes + pendingBytes,
    pendingBytes,
    quotaBytes: quota,
    breakdown,
    uploadQuality: settings?.uploadQuality ?? ("optimized" as UploadQuality),
    /** Sistem bütçesi doldu mu (dolunca herkes için yükleme kapanır). */
    systemFull: systemUsed >= storageLimits().budgetBytes,
  };
}

export async function setUploadQuality(userId: string, quality: UploadQuality) {
  await db
    .insert(userStorage)
    .values({ userId, uploadQuality: quality })
    .onConflictDoUpdate({ target: userStorage.userId, set: { uploadQuality: quality } });
}

// --- Yükleme: ayır ---

function validateVariants(purpose: MediaPurpose, quality: UploadQuality, variants: VariantInput[]) {
  const rules = mediaRules[purpose][quality];
  if (!rules) throw new AppError("invalid", "Bu görsel türü için bu kalite seçilemez");
  const expected = Object.keys(rules).sort();
  const names = variants.map((variant) => variant.name).sort();
  if (expected.join() !== names.join()) {
    throw new AppError("invalid", `Beklenen varyantlar: ${expected.join(", ")}`);
  }
  for (const variant of variants) {
    const rule = rules[variant.name];
    if (!rule) throw new AppError("invalid", "Geçersiz varyant");
    if (!rule.types.includes(variant.contentType)) {
      throw new AppError("invalid", "Desteklenmeyen dosya türü");
    }
    if (!Number.isInteger(variant.bytes) || variant.bytes <= 0) {
      throw new AppError("invalid", "Geçersiz dosya boyutu");
    }
    if (variant.bytes > rule.maxBytes) throw new AppError("invalid", "Dosya çok büyük");
    // Boyutları istemci bildirir; sınır aşılıyorsa istemci küçültmemiş demektir.
    const side = Math.max(variant.width ?? 0, variant.height ?? 0);
    if (rule.maxSide !== null && side > rule.maxSide) {
      throw new AppError("invalid", "Görsel boyutu sınırı aşıyor");
    }
  }
}

/**
 * Yüklenecek görseller için kota ayırır ve varyant başına imzalı URL verir. Satırlar `pending` doğar;
 * `confirmAssets` ile onaylanmazsa temizlik işi siler. Kullanıcı başına kilit, eşzamanlı iki isteğin aynı
 * boş alanı iki kez harcamasını engeller.
 */
export async function reserveUploads(
  userId: string,
  input: {
    purpose: MediaPurpose;
    quality: UploadQuality;
    files: Array<{ variants: VariantInput[] }>;
  },
) {
  const storage = storageFor(null);
  if (input.files.length === 0 || input.files.length > MAX_UPLOAD_BATCH) {
    throw new AppError("invalid", `Tek seferde 1–${MAX_UPLOAD_BATCH} görsel yüklenebilir`);
  }
  if (input.purpose === "avatar" && input.files.length !== 1) {
    throw new AppError("invalid", "Tek avatar yüklenebilir");
  }
  for (const file of input.files) validateVariants(input.purpose, input.quality, file.variants);
  const requested = input.files
    .flatMap((file) => file.variants)
    .reduce((sum, variant) => sum + variant.bytes, 0);

  const assets = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`media:${userId}`}))`);
    const used = await usedBytes(tx, userId, { replacingAvatar: input.purpose === "avatar" });
    const quota = await quotaOf(tx, userId);
    if (used + requested > quota) {
      throw new AppError(
        "storage_quota",
        `Depolama alanın yetmiyor (${formatMb(quota - used)} boş, ${formatMb(requested)} gerekli)`,
      );
    }
    // Bütçe tüm kullanıcıların toplamı; eşzamanlı yüklemelerde birkaç MB aşılabilir, kabul edilebilir.
    const budget = storageLimits().budgetBytes;
    const systemUsed = await systemUsedBytes(tx);
    if (systemUsed + requested > budget) {
      throw new AppError(
        "storage_full",
        "Sistemin depolama alanı doldu; yükleme geçici olarak kapalı",
      );
    }

    const ids = await tx.execute<{ id: string }>(
      sql`select uuidv7()::text as id from generate_series(1, ${input.files.length})`,
    );
    const values = input.files.map((file, index) => {
      const id = ids.rows[index]?.id;
      if (!id) throw new Error("uuid üretilemedi");
      const variants: MediaVariant[] = file.variants.map((variant) => ({
        name: variant.name,
        key: `users/${userId}/${purposeDir[input.purpose]}/${id}/${variant.name}.${extensionFor(variant.contentType)}`,
        bytes: variant.bytes,
        contentType: variant.contentType,
        width: variant.width ?? null,
        height: variant.height ?? null,
      }));
      return {
        id,
        userId,
        purpose: input.purpose,
        quality: input.quality,
        status: "pending" as const,
        variants,
        totalBytes: variants.reduce((sum, variant) => sum + variant.bytes, 0),
      };
    });
    const rows = await tx.insert(mediaAssets).values(values).returning();
    await checkBudgetAlert(tx, systemUsed + requested, budget);
    return rows;
  });

  return Promise.all(
    assets.map(async (asset) => ({
      id: asset.id,
      variants: await Promise.all(
        asset.variants.map(async (variant) => ({
          name: variant.name,
          upload: await storage.prepareUpload(variant),
        })),
      ),
    })),
  );
}

function formatMb(bytes: number) {
  return `${(Math.max(0, bytes) / 1024 / 1024).toFixed(1)} MB`;
}

/** Sistem doluluğu %80 ve %95'i geçince adminlere bir kez haber verir. */
async function checkBudgetAlert(tx: Tx, used: number, budget: number) {
  const ratio = budget > 0 ? used / budget : 1;
  const level = ratio >= 0.95 ? 95 : ratio >= 0.8 ? 80 : 0;
  const alerted = (await readConfig<number>(tx, BUDGET_ALERT_KEY)) ?? 0;
  if (level === alerted) return;
  // Kullanım düştüyse seviye geri çekilir; tekrar yükselirse yeniden haber verilir.
  await writeConfig(tx, BUDGET_ALERT_KEY, level);
  if (level < alerted) return;
  const admins = await tx.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
  for (const admin of admins) {
    await notify(tx, {
      recipientId: admin.id,
      type: "system",
      groupKey: `storage-budget-${level}`,
      data: { kind: "storage_budget", percent: Math.round(ratio * 100) },
    });
  }
}

// --- Yükleme: onayla ---

/**
 * Bekleyen görsellerin tüm varyantlarının depoya gerçekten yüklendiğini (bildirilen tür ve boyutta)
 * doğrular. Eksik ya da farklı olan görsel silinir ve hata döner. Ağ işi olduğu için transaction dışında
 * çağrılır; ardından `markReady` aynı görselleri tek transaction'da onaylar.
 */
export async function verifyPendingAssets(userId: string, purpose: MediaPurpose, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > MAX_UPLOAD_BATCH) {
    throw new AppError("invalid", "Geçersiz görsel listesi");
  }
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.id, unique),
        eq(mediaAssets.userId, userId),
        eq(mediaAssets.purpose, purpose),
        eq(mediaAssets.status, "pending"),
      ),
    );
  if (rows.length !== unique.length) notFound("Yükleme bulunamadı ya da süresi doldu");

  await Promise.all(
    rows.map(async (asset) => {
      const storage = storageFor(asset.targetId);
      const stats = await Promise.all(asset.variants.map((variant) => storage.stat(variant.key)));
      const valid = asset.variants.every((variant, index) => {
        const stat = stats[index];
        return stat && stat.bytes === variant.bytes && stat.contentType === variant.contentType;
      });
      if (!valid) {
        await db.transaction((tx) => discardAssets(tx, [asset]));
        throw new AppError("invalid", "Yüklenen dosya bulunamadı ya da bildirilenden farklı");
      }
    }),
  );
  return unique.map((id) => rows.find((row) => row.id === id) as MediaAsset);
}

/** Doğrulanmış görselleri onaylar. Aynı görsel iki kez onaylanamaz. */
export async function markReady(tx: Tx, ids: string[]) {
  const rows = await tx
    .update(mediaAssets)
    .set({ status: "ready", confirmedAt: new Date() })
    .where(and(inArray(mediaAssets.id, ids), eq(mediaAssets.status, "pending")))
    .returning({ id: mediaAssets.id });
  if (rows.length !== ids.length) throw new AppError("conflict", "Yükleme zaten onaylandı");
}

// --- Silme ve temizlik ---

/** Görselleri siler (bağlı screenshot'lar cascade ile gider); dosyalar worker'da depodan kaldırılır. */
export async function discardAssets(
  tx: Tx,
  assets: Pick<MediaAsset, "id" | "targetId" | "variants">[],
) {
  if (assets.length === 0) return;
  await tx.delete(mediaAssets).where(
    inArray(
      mediaAssets.id,
      assets.map((asset) => asset.id),
    ),
  );
  const byTarget = new Map<string | null, string[]>();
  for (const asset of assets) {
    const keys = byTarget.get(asset.targetId) ?? [];
    keys.push(...asset.variants.map((variant) => variant.key));
    byTarget.set(asset.targetId, keys);
  }
  for (const [targetId, keys] of byTarget) {
    await emit(tx, "storage.objects_orphaned", { keys, targetId });
  }
}

/** Tarayıcıda başarısız olan yüklemeyi hemen bırakır; kota temizlik işini beklemeden geri gelir. */
export async function cancelPendingAssets(userId: string, ids: string[]) {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(mediaAssets)
      .where(
        and(
          inArray(mediaAssets.id, ids),
          eq(mediaAssets.userId, userId),
          eq(mediaAssets.status, "pending"),
        ),
      );
    await discardAssets(tx, rows);
  });
}

/** Süresi dolan (tarayıcıda yarım kalmış) yüklemeleri siler; kota geri gelir. */
export async function cleanupPendingAssets(olderThanMinutes = PENDING_TTL_MINUTES) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.status, "pending"), lt(mediaAssets.createdAt, cutoff)))
      .limit(500);
    await discardAssets(tx, rows);
    return { removed: rows.length };
  });
}

/** Hesap silinirken tüm dosyaları temizlik kuyruğuna atar (satırlar cascade ile gider). */
export async function queueUserMediaCleanup(userId: string) {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(mediaAssets).where(eq(mediaAssets.userId, userId));
    await discardAssets(tx, rows);
  });
}

// --- Sunum ---

/** Görselin herkese açık adresleri. `original`: orijinal modda yüklenen dosyanın kendisi. */
export function assetUrls(asset: Pick<MediaAsset, "targetId" | "quality" | "variants">) {
  const storage = asset.targetId === null ? systemStorage() : storageFor(asset.targetId);
  const url = (name: MediaVariantName) => {
    const variant = asset.variants.find((item) => item.name === name);
    return variant && storage ? storage.publicUrl(variant.key) : null;
  };
  return {
    url: url("display") ?? url("full"),
    thumbUrl: url("thumb"),
    originalUrl: asset.quality === "original" ? url("full") : null,
  };
}

// --- Admin ---

/** Genel doluluk ve en çok yer kaplayan kullanıcılar. */
export async function adminStorageOverview(limit = 20) {
  const [systemUsed, defaultQuota, top] = await Promise.all([
    systemUsedBytes(db),
    defaultQuotaBytes(),
    db
      .select({
        userId: mediaAssets.userId,
        name: user.name,
        username: user.displayUsername,
        count: sql<number>`count(*)::int`,
        bytes: sql<string>`sum(${mediaAssets.totalBytes})`,
        quotaBytes: userStorage.quotaBytes,
      })
      .from(mediaAssets)
      .innerJoin(user, eq(user.id, mediaAssets.userId))
      .leftJoin(userStorage, eq(userStorage.userId, mediaAssets.userId))
      .where(isNull(mediaAssets.targetId))
      .groupBy(mediaAssets.userId, user.name, user.displayUsername, userStorage.quotaBytes)
      .orderBy(desc(sql`sum(${mediaAssets.totalBytes})`))
      .limit(Math.min(limit, 100)),
  ]);
  return {
    usedBytes: systemUsed,
    budgetBytes: storageLimits().budgetBytes,
    defaultQuotaBytes: defaultQuota,
    users: top.map((row) => ({
      userId: row.userId,
      name: row.name,
      username: row.username,
      count: row.count,
      usedBytes: Number(row.bytes),
      quotaBytes: row.quotaBytes ?? defaultQuota,
      customQuota: row.quotaBytes !== null,
    })),
  };
}

export async function adminUserStorage(userId: string) {
  const [found] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
  if (!found) notFound("Kullanıcı bulunamadı");
  const [usage, settings] = await Promise.all([storageUsage(userId), settingsOf(db, userId)]);
  return {
    ...usage,
    customQuota: settings?.quotaBytes != null,
    quotaNote: settings?.quotaNote ?? null,
    quotaSetBy: settings?.quotaSetBy ?? null,
    quotaUpdatedAt: settings?.quotaUpdatedAt ?? null,
  };
}

/** Kullanıcının kotasını değiştirir; `null` varsayılana döndürür. Mevcut dosyalar silinmez. */
export async function setUserQuota(
  adminId: string,
  userId: string,
  quotaBytes: number | null,
  note?: string | null,
) {
  const [found] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
  if (!found) notFound("Kullanıcı bulunamadı");
  const values = {
    quotaBytes,
    quotaNote: note?.trim() || null,
    quotaSetBy: adminId,
    quotaUpdatedAt: new Date(),
  };
  await db
    .insert(userStorage)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userStorage.userId, set: values });
  return adminUserStorage(userId);
}

/** Varsayılan kota (özel kotası olmayan herkes). Deploy gerektirmez. */
export async function setDefaultQuota(quotaBytes: number) {
  await writeConfig(db, DEFAULT_QUOTA_KEY, quotaBytes);
  return { defaultQuotaBytes: quotaBytes };
}
