// Wraps every /<screen>/[id] route. Screens mount instantly; while saved projects are
// still streaming in (a few ms after launch) a static skeleton is shown instead of a
// spinner or a blank page, and a missing/deleted project gets a clear way out.
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Empty } from "@/src/components/ui";
import { useStore } from "@/src/engine/store";
import { radius, spacing, useTheme } from "@/src/theme";

export function ScreenSkeleton({ testID = "screen-skeleton" }: { testID?: string }) {
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  const bar = (w: number | `${number}%`, h = 14) => <View style={{ width: w, height: h, borderRadius: 7, backgroundColor: colors.surfaceTertiary }} />;
  return (
    <View testID={testID} accessibilityLabel="Opening" style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: spacing.md, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceTertiary }} />
        <View style={{ gap: 6, flex: 1 }}>{bar("45%", 18)}{bar("30%", 12)}</View>
      </View>
      <View style={{ flex: 1, padding: spacing.md, gap: spacing.md }}>
        <View style={{ flex: 1, borderRadius: radius.lg, backgroundColor: colors.canvasBg }} />
        <View style={{ flexDirection: "row", gap: 12 }}>{[0, 1, 2, 3].map((i) => <View key={i} style={{ flex: 1, height: 48, borderRadius: 16, backgroundColor: colors.surfaceTertiary }} />)}</View>
      </View>
    </View>
  );
}

export function ProjectMissing() {
  const router = useRouter(); const { colors } = useTheme(); const insets = useSafeAreaInsets();
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <View testID="project-missing" style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + 40 }}>
      <Empty icon="alert-circle" title="Project not found" text="It may have been deleted or moved to another device." action={<View style={{ gap: 10, marginTop: 8 }}><Btn label="Go back" onPress={leave} testID="project-missing-back" /><Btn label="Open projects" kind="ghost" onPress={() => router.replace("/(tabs)/projects")} testID="project-missing-projects" /></View>} />
    </View>
  );
}

/** HOC: mounts the screen only once its project is available, so screen state initialisers always see real data. */
export function withProject<P extends object>(Screen: React.ComponentType<P>) {
  function Gated(props: P) {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { ready, projects } = useStore();
    const exists = projects.some((p) => p.id === id);
    if (exists) return <Screen {...props} />;
    if (!ready) return <ScreenSkeleton />;
    return <ProjectMissing />;
  }
  Gated.displayName = `withProject(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return Gated;
}
