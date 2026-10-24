import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, SlideInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CanvasView } from "@/src/components/CanvasView";
import { IconBtn, T } from "@/src/components/ui";
import { useStore } from "@/src/engine/store";
import { spacing } from "@/src/theme";
import { withProject } from "@/src/components/ProjectGate";

// Presenter mode: full screen slides, transitions and speaker notes.
function Present() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const insets = useSafeAreaInsets(); const { width, height } = useWindowDimensions();
  const p = useStore().projects.find((x) => x.id === id); const [i, setI] = useState(0); const [notes, setNotes] = useState(true);
  if (!p) return null;
  const pg = p.pages[i]; const w = Math.min(width - 16, ((height * 0.62) * p.width) / p.height);
  const Enter = pg.transition === "slide" ? SlideInRight : pg.transition === "fade" ? FadeIn : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: "#000000", paddingTop: insets.top, paddingBottom: insets.bottom }} testID="present-screen">
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8 }}>
        <IconBtn icon="close" label="Exit presentation" tone="#FFFFFF" onPress={() => router.back()} testID="present-close" />
        <T style={{ flex: 1, color: "#FFFFFF" }}>{i + 1} / {p.pages.length} · {pg.name}</T>
        <IconBtn icon="reader" label="Toggle notes" tone="#FFFFFF" onPress={() => setNotes(!notes)} testID="present-notes-toggle" />
      </View>
      <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center" }} onPress={() => setI(Math.min(p.pages.length - 1, i + 1))} testID="present-next-area">
        <Animated.View key={pg.id} entering={Enter}><CanvasView page={pg} W={p.width} H={p.height} width={w} /></Animated.View>
      </Pressable>
      {notes && pg.notes ? <View style={{ padding: spacing.md, backgroundColor: "#1C1C1E" }}><T style={{ color: "#F2F2F7" }} testID="present-notes">{pg.notes}</T></View> : null}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 24, paddingVertical: 8 }}>
        <IconBtn icon="chevron-back" label="Previous slide" tone="#FFFFFF" disabled={i === 0} onPress={() => setI(i - 1)} testID="present-prev" />
        <IconBtn icon="chevron-forward" label="Next slide" tone="#FFFFFF" disabled={i >= p.pages.length - 1} onPress={() => setI(i + 1)} testID="present-next" />
      </View>
    </View>
  );
}

export default withProject(Present);
