// RF Canvas design tokens. Light + Dark; System follows the device.
import { useMemo, useSyncExternalStore } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F5F6F8",
  onSurface: "#1C1C1E",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1C1C1E",
  surfaceTertiary: "#ECEDF1",
  onSurfaceTertiary: "#3A3A3C",
  surfaceInverse: "#1C1C1E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8E8E93",

  brand: "#FF5E00",
  onBrand: "#FFFFFF",
  brandPrimary: "#FF5E00",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FF6600",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#FFF0E6",
  onBrandTertiary: "#B23F00",

  success: "#1E8E3E",
  onSuccess: "#FFFFFF",
  warning: "#B25E00",
  onWarning: "#FFFFFF",
  error: "#D32F2F",
  onError: "#FFFFFF",
  info: "#1565C0",
  onInfo: "#FFFFFF",

  border: "rgba(28,28,30,0.08)",
  borderStrong: "rgba(28,28,30,0.18)",
  divider: "rgba(28,28,30,0.06)",

  glass: "rgba(255,255,255,0.72)",
  glassStrong: "rgba(255,255,255,0.9)",
  ambientA: "#FFE3D1",
  ambientB: "#EAF0FF",
  canvasBg: "#E4E6EB",
  overlay: "rgba(0,0,0,0.35)",
};

export type ThemeColors = typeof light;

const dark: ThemeColors = {
  surface: "#0F1013",
  onSurface: "#F2F2F7",
  surfaceSecondary: "#1A1B20",
  onSurfaceSecondary: "#F2F2F7",
  surfaceTertiary: "#24262C",
  onSurfaceTertiary: "#D1D1D6",
  surfaceInverse: "#F2F2F7",
  onSurfaceInverse: "#1C1C1E",
  muted: "#98989F",

  brand: "#FF6A14",
  onBrand: "#FFFFFF",
  brandPrimary: "#FF6A14",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FF7A2E",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#3A2214",
  onBrandTertiary: "#FFC9A6",

  success: "#4CC274",
  onSuccess: "#0F1013",
  warning: "#F0A848",
  onWarning: "#0F1013",
  error: "#FF6B6B",
  onError: "#0F1013",
  info: "#6EA8FF",
  onInfo: "#0F1013",

  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.2)",
  divider: "rgba(255,255,255,0.06)",

  glass: "rgba(30,31,37,0.72)",
  glassStrong: "rgba(30,31,37,0.92)",
  ambientA: "#2A1709",
  ambientB: "#101828",
  canvasBg: "#08090B",
  overlay: "rgba(0,0,0,0.55)",
};

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// ---- Non-blocking fonts ----
// The app renders on the very first frame with the platform font, then swaps to the
// bundled brand fonts the moment they finish registering (usually a few ms). Every
// component that calls useTheme() re-renders on that swap, so nothing waits on fonts.
let fontsReady = false;
const fontListeners = new Set<() => void>();
const subscribeFonts = (l: () => void) => { fontListeners.add(l); return () => { fontListeners.delete(l); }; };
const getFontsReady = () => fontsReady;
export function setFontsReady(ready: boolean) {
  if (fontsReady === ready) return;
  fontsReady = ready; fontListeners.forEach((l) => l());
}
export const areFontsReady = () => fontsReady;

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  useSyncExternalStore(subscribeFonts, getFontsReady, getFontsReady);
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    const ready = fontsReady;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ready` re-creates styles after the font swap
    return useMemo(() => StyleSheet.create(factory(colors)), [colors, ready]);
  };
}

// Until the brand fonts are registered these return undefined (= platform default font),
// so text is readable immediately instead of the screen waiting or falling back to a serif.
export const fonts = {
  get regular(): string | undefined { return fontsReady ? "Jakarta-400" : undefined; },
  get semibold(): string | undefined { return fontsReady ? "Jakarta-600" : undefined; },
  get bold(): string | undefined { return fontsReady ? "Jakarta-800" : undefined; },
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 24, pill: 999 };
