import { AwsClient } from "aws4fetch";
import { storageConfig } from "./config";
import { AppError } from "./errors";

/**
 * Dosyaların durduğu depo. Dosyalar tarayıcıdan doğrudan yüklenir; sunucu yalnızca imzalar, doğrular ve siler,
 * görsel byte'ları sunucudan hiç geçmez. Şimdilik tek sürücü S3 uyumlu depo (R2, MinIO, AWS S3, B2…); kullanıcının
 * kendi deposu ya da Imgur gibi servisler aynı arayüzle eklenecek (bkz. docs/notes/storage.md).
 */
export type UploadInstruction = { method: "PUT"; url: string; headers: Record<string, string> };

export interface StorageDriver {
  prepareUpload(object: {
    key: string;
    contentType: string;
    bytes: number;
  }): Promise<UploadInstruction>;
  stat(key: string): Promise<{ bytes: number; contentType: string } | null>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
}

/** Anahtarlar hiç değişmediği için CDN ve tarayıcı bir yıl önbellekler. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Sunucunun ürettiği anahtar biçimi: `users/{userId}/{avatar|screenshots}/{assetId}/{varyant}.{uzantı}`. */
const KEY_PATTERN =
  /^users\/[A-Za-z0-9_-]{1,64}\/(avatar|screenshots)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(full|display|thumb)\.(avif|webp|png|jpg)$/;

export function isValidObjectKey(key: string) {
  return KEY_PATTERN.test(key);
}

const extensionOf: Record<string, string> = {
  "image/avif": "avif",
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export function extensionFor(contentType: string) {
  const extension = extensionOf[contentType];
  if (!extension) throw new AppError("invalid", "Desteklenmeyen dosya türü", "upload_unsupported");
  return extension;
}

function s3Driver(config: NonNullable<ReturnType<typeof storageConfig>>): StorageDriver {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
  });
  // URL normalizasyonu `..` parçalarını çözer; başka bir nesneye işaret eden anahtar asla imzalanmaz.
  const objectUrl = (key: string) => {
    if (!isValidObjectKey(key)) throw new AppError("invalid", "Geçersiz nesne anahtarı");
    return `${config.endpoint}/${config.bucket}/${key}`;
  };

  return {
    /**
     * 10 dakika geçerli PUT URL'i. Content-Type, Content-Length ve Cache-Control imzaya dahildir: istemci başka
     * türde (ör. text/html) ya da bildirdiğinden farklı boyutta dosya yükleyemez.
     */
    async prepareUpload({ key, contentType, bytes }) {
      if (!Number.isInteger(bytes) || bytes <= 0) throw new AppError("invalid", "Geçersiz boyut");
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", "600");
      const headers = { "Content-Type": contentType, "Cache-Control": CACHE_CONTROL };
      const signed = await aws.sign(url.toString(), {
        method: "PUT",
        headers: { ...headers, "Content-Length": String(bytes) },
        aws: { signQuery: true, allHeaders: true },
      });
      // Content-Length'i tarayıcı gövdeden kendisi koyar (elle ayarlanamaz); imzadaki değerle aynı olmalı.
      return { method: "PUT", url: signed.url, headers };
    },
    async stat(key) {
      const response = await aws.fetch(objectUrl(key), { method: "HEAD" });
      if (response.status === 404) return null;
      if (!response.ok) throw new AppError("unavailable", `Depolama HEAD ${response.status}`);
      return {
        bytes: Number(response.headers.get("content-length") ?? 0),
        contentType: response.headers.get("content-type") ?? "",
      };
    },
    async remove(key) {
      const response = await aws.fetch(objectUrl(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new AppError("unavailable", `Depolama DELETE ${response.status}`);
      }
    },
    publicUrl: (key) => `${config.publicUrl}/${key}`,
  };
}

/** Sistemin deposu (env'deki S3/R2). Yapılandırılmamışsa `null`: yükleme kapalıdır. */
export function systemStorage() {
  const config = storageConfig();
  return config ? s3Driver(config) : null;
}

/** Bir görselin deposu. `targetId` = `null` sistem deposu; kullanıcı depoları sonraki fazda. */
export function storageFor(targetId: string | null): StorageDriver {
  if (targetId !== null)
    throw new AppError("unavailable", "Harici depolar henüz desteklenmiyor", "uploads_disabled");
  const driver = systemStorage();
  if (!driver)
    throw new AppError("unavailable", "Dosya yükleme yapılandırılmamış", "uploads_disabled");
  return driver;
}

/** Worker'daki `storage.delete` işi; 404 başarı sayılır. */
export async function deleteObject(key: string, targetId: string | null = null) {
  await storageFor(targetId).remove(key);
}
