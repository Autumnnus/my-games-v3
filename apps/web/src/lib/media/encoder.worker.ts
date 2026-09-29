/// <reference lib="webworker" />
import encodeAvif from "@jsquash/avif/encode.js";
import resize from "@jsquash/resize";
import encodeWebp from "@jsquash/webp/encode.js";
import { type MediaPurpose, mediaRules, type UploadQuality } from "@my-games/shared";
import type { EncodedVariant, EncodeRequest, EncodeResponse } from "./encoder";

/**
 * Görselleri tarayıcıda hazırlar: çöz → Lanczos3 ile küçült → AVIF (4:4:4). Ayarlar oyun screenshot'larıyla
 * ölçüldü (docs/notes/storage.md): q80 her test görselinde SSIMULACRA2 ≥ 80, PNG'ye göre ~%94 küçük.
 * AVIF kodlanamazsa WebP'ye düşülür (jSquash; Safari canvas'la WebP üretemez).
 */
const AVIF_FULL = { quality: 80, subsample: 3, speed: 7 };
const AVIF_THUMB = { quality: 60, subsample: 3, speed: 7 };
const WEBP_FULL = { quality: 90, use_sharp_yuv: 1 };
const WEBP_THUMB = { quality: 80, use_sharp_yuv: 1 };

async function decode(file: Blob) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas desteklenmiyor");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function fit(image: ImageData, maxSide: number | null) {
  const scale = maxSide ? Math.min(1, maxSide / Math.max(image.width, image.height)) : 1;
  if (scale === 1) return image;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  return resize(image, { width, height, method: "lanczos3" });
}

type Format = "avif" | "webp";

async function encode(image: ImageData, thumb: boolean, format: Format) {
  const buffer =
    format === "avif"
      ? await encodeAvif(image, thumb ? AVIF_THUMB : AVIF_FULL)
      : await encodeWebp(image, thumb ? WEBP_THUMB : WEBP_FULL);
  return { blob: new Blob([buffer], { type: `image/${format}` }), contentType: `image/${format}` };
}

async function build(
  file: Blob,
  source: ImageData,
  purpose: MediaPurpose,
  quality: UploadQuality,
  format: Format,
) {
  const rules = mediaRules[purpose][quality];
  if (!rules) throw new Error("unsupported");
  const variants: EncodedVariant[] = [];
  // Büyükten küçüğe: küçük görsel, zaten küçültülmüş kopyadan üretilir (daha hızlı).
  let base = source;
  for (const name of ["full", "display", "thumb"] as const) {
    const rule = rules[name];
    if (!rule) continue;
    if (name === "full" && quality === "original") {
      // Orijinal: dosyanın kendisi, hiç dokunulmadan.
      variants.push({
        name,
        blob: file,
        contentType: file.type,
        width: source.width,
        height: source.height,
      });
      continue;
    }
    base = await fit(base, rule.maxSide);
    const encoded = await encode(base, name === "thumb", format);
    variants.push({ name, ...encoded, width: base.width, height: base.height });
  }
  return { variants, width: source.width, height: source.height };
}

/** Bir görselin tüm kopyaları aynı formatta olur (avatarın küçük kopyası adresten türetilir). */
async function prepare(file: Blob, purpose: MediaPurpose, quality: UploadQuality) {
  const source = await decode(file);
  try {
    return await build(file, source, purpose, quality, "avif");
  } catch {
    return build(file, source, purpose, quality, "webp");
  }
}

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  const { id, file, purpose, quality } = event.data;
  let response: EncodeResponse;
  try {
    response = { id, ok: true, ...(await prepare(file, purpose, quality)) };
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
