import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { RootOverlays } from "@/src/components/ui";
import { initStore, toast } from "@/src/engine/store";
import { queryClient } from "@/src/query-client";
import { setFontsReady, useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

// Launch screen: no fade, no hold. It disappears on the first rendered frame.
try { SplashScreen.setOptions({ duration: 0, fade: false }); } catch { /* not supported on this platform */ }

// Start reading saved data at import time, in parallel with the first render.
initStore();

// Non-fatal JS errors become a friendly toast instead of a crash; fatal ones go to the ErrorBoundary/default handler.
const EU = (globalThis as any).ErrorUtils;
if (EU?.setGlobalHandler) {
  const prev = EU.getGlobalHandler?.();
  EU.setGlobalHandler((e: any, fatal?: boolean) => {
    console.error("[RF Canvas] uncaught error:", e);
    if (!fatal) { toast(e?.message ? `Something went wrong: ${e.message}` : "Something went wrong", "error"); return; }
    prev?.(e, fatal);
  });
}
// Unhandled promise rejections (web + Hermes) surface as a toast instead of failing silently.
const onRejection = (reason: any) => { console.error("[RF Canvas] unhandled rejection:", reason); toast(reason?.message ? `Action failed: ${reason.message}` : "An action failed. Please try again.", "error"); };
if (typeof window !== "undefined" && (window as any).addEventListener) {
  (window as any).addEventListener("unhandledrejection", (ev: any) => { onRejection(ev?.reason); ev?.preventDefault?.(); });
}
const HermesInternal = (globalThis as any).HermesInternal;
if (HermesInternal?.enablePromiseRejectionTracker) {
  try { HermesInternal.enablePromiseRejectionTracker({ allRejections: true, onUnhandled: (_id: number, reason: any) => onRejection(reason) }); } catch { /* tracker unavailable */ }
}

export default function RootLayout() {
  // Fonts load in the background; the UI never waits for them (see setFontsReady in theme.ts).
  const [fontsLoaded, fontError] = useFonts({
    "Jakarta-400": require("../assets/fonts/Jakarta-400.ttf"),
    "Jakarta-600": require("../assets/fonts/Jakarta-600.ttf"),
    "Jakarta-800": require("../assets/fonts/Jakarta-800.ttf"),
    "Playfair-700": require("../assets/fonts/Playfair-700.ttf"),
    "Bebas-400": require("../assets/fonts/Bebas-400.ttf"),
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const { colors } = useTheme();
  useEffect(() => { if (fontsLoaded) setFontsReady(true); }, [fontsLoaded]);
  useEffect(() => { if (fontError) console.warn("[RF Canvas] fonts unavailable, using system font:", fontError.message); }, [fontError]);
  useEffect(() => { try { SplashScreen.hide(); } catch { /* already hidden */ } }, []);
  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.surface }]}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <View style={[styles.root, { backgroundColor: colors.surface }]}>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
              <RootOverlays />
            </View>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
