import { useEffect, useMemo, useState } from "react";
import { useUIStore, type ThemeMode } from "@/store/ui.store";
import {
  createDefaultPalette,
  createPaletteFromSeed,
  getThemeVariables,
  type DynamicThemePalette,
  type ThemeAppearance,
} from "@/lib/theme/palette";

interface ThemeProviderProps {
  children: React.ReactNode;
}

let activeDynamicPalette: DynamicThemePalette | null = null;
let activeRouteThemeSeed = "home";
const listeners = new Set<() => void>();

export function setPageDynamicPalette(palette: DynamicThemePalette | null) {
  activeDynamicPalette = palette;
  listeners.forEach((listener) => listener());
}

export function setRouteThemeSeed(seed: string) {
  activeRouteThemeSeed = seed || "home";
  listeners.forEach((listener) => listener());
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const themeMode = useUIStore((s) => s.themeMode);
  const dynamicThemeEnabled = useUIStore((s) => s.dynamicThemeEnabled);
  const appearance = useSystemAwareAppearance(themeMode);
  const [dynamicPalette, setDynamicPalette] =
    useState<DynamicThemePalette | null>(activeDynamicPalette);
  const [routeThemeSeed, setRouteThemeSeedState] =
    useState(activeRouteThemeSeed);

  useEffect(() => {
    const listener = () => {
      setDynamicPalette(activeDynamicPalette);
      setRouteThemeSeedState(activeRouteThemeSeed);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const palette = useMemo(() => {
    if (dynamicThemeEnabled && dynamicPalette) return dynamicPalette;
    if (dynamicThemeEnabled && appearance === "light") {
      return createPaletteFromSeed(`route-${routeThemeSeed}`, appearance);
    }
    return createDefaultPalette(appearance);
  }, [appearance, dynamicPalette, dynamicThemeEnabled, routeThemeSeed]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = appearance;
    root.dataset.dynamicTheme =
      dynamicThemeEnabled && dynamicPalette ? "true" : "false";

    const variables = getThemeVariables(palette);
    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [appearance, dynamicPalette, dynamicThemeEnabled, palette]);

  return children;
}

function useSystemAwareAppearance(mode: ThemeMode): ThemeAppearance {
  const [systemAppearance, setSystemAppearance] = useState<ThemeAppearance>(
    getSystemAppearance,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => setSystemAppearance(getSystemAppearance());
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  if (mode === "system") return systemAppearance;
  return mode;
}

function getSystemAppearance(): ThemeAppearance {
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}
