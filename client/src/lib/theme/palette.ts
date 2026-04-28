export type ThemeAppearance = "dark" | "light";

export interface DynamicThemePalette {
  accent: string;
  accent2: string;
  bgBase: string;
  bgElevated: string;
  bgOverlay: string;
  glassSurface: string;
  glassSurfaceHover: string;
  glassBorder: string;
  glassBorderHover: string;
  glassHighlight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  meshA: string;
  meshB: string;
  focusRing: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const DEFAULT_HUES = {
  dark: { accent: 270, accent2: 218 },
  light: { accent: 224, accent2: 168 },
} satisfies Record<ThemeAppearance, { accent: number; accent2: number }>;

export function createDefaultPalette(
  appearance: ThemeAppearance,
): DynamicThemePalette {
  const hues = DEFAULT_HUES[appearance];
  return createPaletteFromHues(hues.accent, hues.accent2, appearance);
}

export function createPaletteFromSeed(
  seed: string,
  appearance: ThemeAppearance,
): DynamicThemePalette {
  const hash = [...seed].reduce(
    (acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0,
    2166136261,
  );
  const hue = hash % 360;
  const secondaryHue = (hue + 42 + (hash % 58)) % 360;
  return createPaletteFromHues(hue, secondaryHue, appearance);
}

export async function createPaletteFromImage(
  imageUrl: string,
  seed: string,
  appearance: ThemeAppearance,
): Promise<DynamicThemePalette> {
  const colors = await extractImageColors(imageUrl);
  if (!colors.length) return createPaletteFromSeed(seed, appearance);

  const primary = colors[0];
  const secondary = colors[1] ?? rotateHue(primary, 42);
  return createPaletteFromHues(primary.h, secondary.h, appearance, {
    primarySaturation: primary.s,
    secondarySaturation: secondary.s,
  });
}

export function getThemeVariables(palette: DynamicThemePalette) {
  return {
    "--theme-bg-base": palette.bgBase,
    "--theme-bg-elevated": palette.bgElevated,
    "--theme-bg-overlay": palette.bgOverlay,
    "--theme-glass-surface": palette.glassSurface,
    "--theme-glass-surface-hover": palette.glassSurfaceHover,
    "--theme-glass-border": palette.glassBorder,
    "--theme-glass-border-hover": palette.glassBorderHover,
    "--theme-glass-highlight": palette.glassHighlight,
    "--theme-text-primary": palette.textPrimary,
    "--theme-text-secondary": palette.textSecondary,
    "--theme-text-muted": palette.textMuted,
    "--theme-accent": palette.accent,
    "--theme-accent-2": palette.accent2,
    "--theme-accent-soft": withAlpha(palette.accent, 0.16),
    "--theme-accent-strong": withAlpha(palette.accent, 0.88),
    "--theme-mesh-a": palette.meshA,
    "--theme-mesh-b": palette.meshB,
    "--theme-focus-ring": palette.focusRing,
  } satisfies Record<string, string>;
}

function createPaletteFromHues(
  accentHue: number,
  accent2Hue: number,
  appearance: ThemeAppearance,
  options?: { primarySaturation?: number; secondarySaturation?: number },
): DynamicThemePalette {
  const primarySat = clamp(options?.primarySaturation ?? 72, 48, 86);
  const secondarySat = clamp(options?.secondarySaturation ?? 78, 44, 88);

  if (appearance === "light") {
    const accent = hsl(accentHue, primarySat, 39);
    const accent2 = hsl(accent2Hue, secondarySat, 36);
    return {
      accent,
      accent2,
      bgBase: `color-mix(in srgb, ${hsl(accentHue, 48, 94)} 58%, ${hsl(
        accent2Hue,
        44,
        96,
      )})`,
      bgElevated: "rgba(255, 255, 255, 0.82)",
      bgOverlay: "rgba(255, 255, 255, 0.88)",
      glassSurface: "rgba(255, 255, 255, 0.46)",
      glassSurfaceHover: "rgba(255, 255, 255, 0.66)",
      glassBorder: hsla(accentHue, primarySat, 42, 0.2),
      glassBorderHover: hsla(accentHue, primarySat, 38, 0.36),
      glassHighlight: "rgba(255, 255, 255, 0.72)",
      textPrimary: "rgba(17, 24, 39, 0.94)",
      textSecondary: "rgba(34, 46, 68, 0.72)",
      textMuted: "rgba(64, 76, 98, 0.52)",
      meshA: hsla(accentHue, primarySat, 55, 0.26),
      meshB: hsla(accent2Hue, secondarySat, 50, 0.18),
      focusRing: accent,
    };
  }

  const accent = hsl(accentHue, primarySat, 62);
  const accent2 = hsl(accent2Hue, secondarySat, 58);
  return {
    accent,
    accent2,
    bgBase: hsl(accentHue, 32, 6),
    bgElevated: hsl(accentHue, 28, 10),
    bgOverlay: hsl(accentHue, 24, 13),
    glassSurface: "rgba(255, 255, 255, 0.055)",
    glassSurfaceHover: "rgba(255, 255, 255, 0.09)",
    glassBorder: "rgba(255, 255, 255, 0.105)",
    glassBorderHover: withAlpha(accent, 0.34),
    glassHighlight: "rgba(255, 255, 255, 0.16)",
    textPrimary: "rgba(255, 255, 255, 0.95)",
    textSecondary: "rgba(255, 255, 255, 0.62)",
    textMuted: "rgba(255, 255, 255, 0.36)",
    meshA: hsla(accentHue, primarySat, 56, 0.2),
    meshB: hsla(accent2Hue, secondarySat, 54, 0.16),
    focusRing: accent,
  };
}

function extractImageColors(imageUrl: string): Promise<Hsl[]> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve([]);
          return;
        }

        ctx.drawImage(image, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = new Map<string, { color: Hsl; score: number }>();

        for (let i = 0; i < data.length; i += 16) {
          const alpha = data[i + 3];
          if (alpha < 180) continue;

          const color = rgbToHsl({
            r: data[i],
            g: data[i + 1],
            b: data[i + 2],
          });
          if (color.s < 24 || color.l < 18 || color.l > 82) continue;

          const hueBucket = Math.round(color.h / 12) * 12;
          const key = String(hueBucket % 360);
          const saturationWeight = color.s / 100;
          const lightnessWeight = 1 - Math.abs(color.l - 52) / 52;
          const score = 1 + saturationWeight * 2 + lightnessWeight;
          const current = buckets.get(key);

          if (!current) {
            buckets.set(key, {
              color: { h: hueBucket % 360, s: color.s, l: color.l },
              score,
            });
          } else {
            current.score += score;
            current.color.s = (current.color.s + color.s) / 2;
            current.color.l = (current.color.l + color.l) / 2;
          }
        }

        resolve(
          [...buckets.values()]
            .sort((a, b) => b.score - a.score)
            .map(({ color }) => color)
            .slice(0, 3),
        );
      } catch {
        resolve([]);
      }
    };

    image.onerror = () => resolve([]);
    image.src = imageUrl;
  });
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;

  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  if (max === gn) h = (bn - rn) / d + 2;
  if (max === bn) h = (rn - gn) / d + 4;

  return { h: (h / 6) * 360, s: s * 100, l: l * 100 };
}

function rotateHue(color: Hsl, amount: number): Hsl {
  return { ...color, h: (color.h + amount) % 360 };
}

function hsl(hue: number, saturation: number, lightness: number) {
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(
    lightness,
  )}%)`;
}

function hsla(
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number,
) {
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(
    lightness,
  )}% / ${alpha})`;
}

function withAlpha(color: string, alpha: number) {
  if (color.startsWith("hsl(")) {
    return color.replace(")", ` / ${alpha})`);
  }
  return color;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
