import { useEffect } from "react";
import { setPageDynamicPalette } from "@/components/theme/ThemeProvider";
import {
  createPaletteFromImage,
  createPaletteFromSeed,
  type ThemeAppearance,
} from "@/lib/theme/palette";
import { useUIStore } from "@/store/ui.store";

export function useDynamicGameTheme(imageUrl: string | null, seed: string) {
  const themeMode = useUIStore((s) => s.themeMode);
  const dynamicThemeEnabled = useUIStore((s) => s.dynamicThemeEnabled);
  const appearance = getAppearance(themeMode);

  useEffect(() => {
    if (!dynamicThemeEnabled) {
      setPageDynamicPalette(null);
      return;
    }

    let cancelled = false;
    setPageDynamicPalette(createPaletteFromSeed(seed, appearance));

    if (imageUrl) {
      createPaletteFromImage(imageUrl, seed, appearance).then((palette) => {
        if (!cancelled) setPageDynamicPalette(palette);
      });
    }

    return () => {
      cancelled = true;
      setPageDynamicPalette(null);
    };
  }, [appearance, dynamicThemeEnabled, imageUrl, seed]);
}

function getAppearance(themeMode: "dark" | "light" | "system"): ThemeAppearance {
  if (themeMode !== "system") return themeMode;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}
