import { describe, expect, it } from "vitest";
import { dominantColor } from "../src/art";

/** width×height RGBA görsel; `paint(x, y)` her pikselin rengini verir. */
function image(width: number, height: number, paint: (x: number, y: number) => number[]) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r = 0, g = 0, b = 0] = paint(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return data;
}

const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

describe("dominantColor", () => {
  it("siyah zemindeki canlı rengi seçer", () => {
    // Görselin %60'ı siyah, %40'ı kırmızı: siyah baskın ama ortam rengi olarak kırmızı seçilmeli.
    const data = image(50, 50, (x) => (x < 30 ? [5, 5, 5] : [200, 30, 30]));
    const [r = 0, g = 0, b = 0] = channels(dominantColor(data, 50, 50) ?? "#000000");
    expect(r).toBeGreaterThan(g * 2);
    expect(r).toBeGreaterThan(b * 2);
  });

  it("açıklığı koyu arayüze uygun aralıkta tutar", () => {
    const data = image(40, 40, () => [250, 250, 120]);
    const [r = 0, g = 0, b = 0] = channels(dominantColor(data, 40, 40) ?? "#ffffff");
    const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    expect(lightness).toBeLessThanOrEqual(0.51);
    expect(lightness).toBeGreaterThanOrEqual(0.21);
  });
});
