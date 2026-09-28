import jpeg from "jpeg-js";

/** Görsel indirme üst sınırı; kapaklar birkaç yüz KB, daha büyüğü beklenmez. */
const MAX_BYTES = 3 * 1024 * 1024;

type Rgb = [number, number, number];

function toHsl([r, g, b]: Rgb) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m].map((v) => Math.round(v * 255)) as Rgb;
}

const hex = (rgb: Rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/**
 * Pikselleri kaba renk kutularına toplar ve "baskın ama canlı" olanı seçer: çok görülen, doygun ve ne
 * simsiyah ne bembeyaz renkler öne çıkar. Açıklık koyu arayüzde ortam rengi olarak işe yarasın diye sınırlanır.
 */
export function dominantColor(data: Uint8Array, width: number, height: number) {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 4000)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }
  }
  let best: { score: number; rgb: Rgb } | null = null;
  for (const bucket of buckets.values()) {
    const rgb: Rgb = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n];
    const { s, l } = toHsl(rgb);
    const score = bucket.n * (0.35 + s) * (l > 0.12 && l < 0.78 ? 1 : 0.15);
    if (!best || score > best.score) best = { score, rgb };
  }
  if (!best) return null;
  const { h, s, l } = toHsl(best.rgb);
  return hex(fromHsl(h, Math.min(1, s * 1.1), Math.min(Math.max(l, 0.22), 0.5)));
}

/** Kapak görselini indirip baskın rengini döner; JPEG dışı ya da okunamayan görselde `null`. */
export async function accentFromImage(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) return null;
    // JPEG imzası (FF D8); IGDB ve Steam kapakları JPEG.
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
    const image = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 64 });
    return dominantColor(image.data, image.width, image.height);
  } catch {
    return null;
  }
}

/** Adres gerçekten görsel döndürüyor mu (Steam logosu her oyunda yok; yoksa 404 ya da boş görsel). */
export async function imageExists(url: string, minBytes = 2_000) {
  try {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    const type = response.headers.get("content-type") ?? "";
    const length = Number(response.headers.get("content-length") ?? 0);
    return response.ok && type.startsWith("image/") && (length === 0 || length >= minBytes);
  } catch {
    return false;
  }
}
