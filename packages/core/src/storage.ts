import { AwsClient } from "aws4fetch";
import { storageConfig } from "./config";
import { AppError } from "./errors";

/**
 * S3 uyumlu depolama (Cloudflare R2 / MinIO). Dosyalar tarayıcıdan presigned URL ile doğrudan yüklenir;
 * sunucu yalnızca imzalar, doğrular ve siler. Böylece görsel byte'ları sunucudan hiç geçmez.
 */

export const ALLOWED_IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png", "image/avif"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const extensionOf: Record<AllowedImageType, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
};

function client() {
  const config = storageConfig();
  if (!config) throw new AppError("unavailable", "Dosya yükleme yapılandırılmamış");
  return {
    config,
    aws: new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: config.region,
    }),
  };
}

/** Sunucunun ürettiği anahtar biçimi: `<prefix>/<userId>/<uuid>[_thumb].<ext>`. */
const KEY_PATTERN =
  /^(screenshots|avatars)\/[A-Za-z0-9_-]{1,64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_thumb)?\.(webp|jpg|png|avif)$/;

/** İstemciden gelen anahtar yalnızca bu kullanıcıya verilmiş biçimde olabilir (`..` vb. geçemez). */
export function isOwnObjectKey(key: string, prefix: "screenshots" | "avatars", userId: string) {
  return KEY_PATTERN.test(key) && key.startsWith(`${prefix}/${userId}/`);
}

function objectUrl(endpoint: string, bucket: string, key: string) {
  // URL normalizasyonu `..` parçalarını çözer; başka bir nesneye işaret eden anahtar asla imzalanmaz.
  if (!KEY_PATTERN.test(key)) throw new AppError("invalid", "Geçersiz nesne anahtarı");
  return `${endpoint}/${bucket}/${key}`;
}

export function publicUrl(key: string) {
  const config = storageConfig();
  return config ? `${config.publicUrl}/${key}` : null;
}

export function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Tek bir nesne için 10 dakika geçerli PUT URL'i üretir. Content-Type ve Content-Length imzaya dahildir:
 * istemci başka türde (ör. text/html) ya da bildirdiğinden büyük dosya yükleyemez.
 */
export async function presignPut(key: string, contentType: AllowedImageType, size: number) {
  const { config, aws } = client();
  if (!Number.isInteger(size) || size <= 0 || size > config.maxUploadBytes) {
    throw new AppError("invalid", "Dosya çok büyük");
  }
  const url = new URL(objectUrl(config.endpoint, config.bucket, key));
  url.searchParams.set("X-Amz-Expires", "600");
  const signed = await aws.sign(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(size) },
    aws: { signQuery: true, allHeaders: true },
  });
  // Content-Length'i tarayıcı gövdeden kendisi koyar (elle ayarlanamaz); imzadaki değerle aynı olmalı.
  return { url: signed.url, headers: { "Content-Type": contentType } };
}

/** Kullanıcıya ait, tahmin edilemez bir nesne anahtarı üretir. */
export function newObjectKey(
  prefix: string,
  userId: string,
  contentType: AllowedImageType,
  suffix = "",
) {
  return `${prefix}/${userId}/${crypto.randomUUID()}${suffix}.${extensionOf[contentType]}`;
}

export async function headObject(key: string) {
  const { config, aws } = client();
  const response = await aws.fetch(objectUrl(config.endpoint, config.bucket, key), {
    method: "HEAD",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new AppError("unavailable", `Depolama HEAD ${response.status}`);
  return {
    size: Number(response.headers.get("content-length") ?? 0),
    contentType: response.headers.get("content-type") ?? "",
  };
}

export async function deleteObject(key: string) {
  const { config, aws } = client();
  const response = await aws.fetch(objectUrl(config.endpoint, config.bucket, key), {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new AppError("unavailable", `Depolama DELETE ${response.status}`);
  }
}

export function maxUploadBytes() {
  return storageConfig()?.maxUploadBytes ?? 0;
}
