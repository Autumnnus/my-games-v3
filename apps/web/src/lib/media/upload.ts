import { api } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { m } from "@/paraglide/messages";
import type { EncodedVariant } from "./encoder";

type UploadInstruction = { method: "PUT"; url: string; headers: Record<string, string> };

/** Dosya depoya (R2) gönderilemedi: bağlantı, CORS ya da süresi dolan imza. */
export class StorageUploadError extends Error {}

/**
 * Varyantı imzalı URL'e yükler. `fetch` yükleme ilerlemesi vermediği için XHR (orijinaller 40 MB'a kadar).
 * Tür ve boyut imzaya dahil; başlıklar sunucunun verdiğiyle birebir aynı gönderilmeli.
 */
export function putObject(
  instruction: UploadInstruction,
  blob: Blob,
  onProgress?: (loaded: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(instruction.method, instruction.url);
    for (const [name, value] of Object.entries(instruction.headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => onProgress?.(event.loaded);
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new StorageUploadError(`upload ${request.status}`));
    request.onerror = () => reject(new StorageUploadError("upload network error"));
    request.send(blob);
  });
}

export function uploadErrorMessage(error: unknown) {
  return error instanceof StorageUploadError ? m.upload_failed_network() : errorMessage(error);
}

/**
 * Yükleme yarıda kalırsa ayrılan kota hemen geri verilir (yoksa sunucu bir saat sonra temizler). Hata
 * yutulur: asıl hata kullanıcıya gösterilir.
 */
export async function releaseUploads(assetIds: string[]) {
  if (assetIds.length === 0) return;
  await api.me.uploads.cancel.$post({ json: { assetIds } }).catch(() => {});
}

/** Sunucuya bildirilen varyant bilgisi (dosyanın kendisi hariç). */
export function describeVariants(variants: EncodedVariant[]) {
  return variants.map(({ name, contentType, blob, width, height }) => ({
    name,
    contentType,
    bytes: blob.size,
    width,
    height,
  }));
}

/** Sınırlı eşzamanlılıkla sırayla çalıştırır (çok sayıda paralel PUT bağlantıyı tıkamasın). */
export async function runLimited<T>(tasks: Array<() => Promise<T>>, limit = 4) {
  const results: T[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (index < tasks.length) {
      const current = index++;
      const task = tasks[current];
      if (task) results[current] = await task();
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * JPEG'in EXIF'inde GPS konumu var mı? (Telefon fotoğrafları.) "Orijinal" modda dosyaya dokunulmadığı için
 * kullanıcı uyarılır. Sadece EXIF IFD0'daki GPS işaretçisine bakılır.
 */
export async function hasGpsLocation(file: Blob) {
  if (file.type !== "image/jpeg") return false;
  const view = new DataView(await file.slice(0, 128 * 1024).arrayBuffer());
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return false;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    if ((marker & 0xff00) !== 0xff00 || length < 2) return false;
    // APP1 + "Exif\0\0"
    if (
      marker === 0xffe1 &&
      offset + 10 <= view.byteLength &&
      view.getUint32(offset + 4) === 0x45786966
    ) {
      const tiff = offset + 10;
      if (tiff + 8 > view.byteLength) return false;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > view.byteLength) return false;
      const count = view.getUint16(ifd, little);
      for (let entry = 0; entry < count; entry++) {
        const at = ifd + 2 + entry * 12;
        if (at + 2 > view.byteLength) return false;
        if (view.getUint16(at, little) === 0x8825) return true;
      }
      return false;
    }
    if (marker === 0xffda) return false; // görüntü verisi başladı
    offset += 2 + length;
  }
  return false;
}
