/**
 * Görseli tarayıcıda küçültür ve WebP'ye çevirir (destek yoksa JPEG). Oyun screenshot'ları çoğu zaman
 * birkaç MB'lık PNG'lerdir; yüklemeden önce küçültmek hem R2 alanından hem bant genişliğinden tasarruf eder.
 */
export async function compressImage(file: Blob, maxSide: number, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas desteklenmiyor");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await encode("image/webp");
  if (blob?.type !== "image/webp") blob = await encode("image/jpeg");
  if (!blob) throw new Error("görsel dönüştürülemedi");
  return { blob, width, height };
}

/** İmzalı URL'e PUT eder. */
export async function uploadTo(
  target: { url: string; headers: Record<string, string> },
  blob: Blob,
) {
  const response = await fetch(target.url, { method: "PUT", headers: target.headers, body: blob });
  if (!response.ok) throw new Error(`yükleme başarısız: ${response.status}`);
}
