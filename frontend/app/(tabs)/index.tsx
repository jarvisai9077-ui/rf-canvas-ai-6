import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProjectThumb } from "@/src/components/ProjectThumb";
import { TemplatePreview } from "@/src/components/TemplatePreview";
import { Ambient, Btn, Glass, IconBtn, Section, T } from "@/src/components/ui";
import { newProject, templates } from "@/src/engine/factory";
import { retryLoad, saveProject, useStore } from "@/src/engine/store";
import { projectRoute, usesNativeTabs } from "@/src/navigation";
import { radius, spacing, useTheme } from "@/src/theme";

const quick = [
  { name: "Instagram Post", w: 1080, h: 1080, icon: "logo-instagram", kind: "design" },
  { name: "Story", w: 1080, h: 1920, icon: "phone-portrait", kind: "design" },
  { name: "Thumbnail", w: 1280, h: 720, icon: "logo-youtube", kind: "design" },
  { name: "Presentation", w: 1920, h: 1080, icon: "easel", kind: "presentation" },
  { name: "Drawing", w: 1600, h: 1600, icon: "brush", kind: "drawing" },
  { name: "Video", w: 1920, h: 1080, icon: "film", kind: "video" },
] as const;

const studios = [
  { t: "Image Lab", s: "Adjust, crop & restore", icon: "aperture", r: "/image-lab" },
  { t: "Vector", s: "Pen, nodes, SVG", icon: "git-network", r: "/create?kind=vector" },
  { t: "Brand Studio", s: "Kits & consistency", icon: "ribbon", r: "/brand" },
  { t: "Factory", s: "Batch & business", icon: "construct", r: "/factory" },
];

export default function Home() {
  const router = useRouter(); const { projects, recovered, ready, loadError } = useStore(); const { colors } = useTheme();
  const insets = useSafeAreaInsets(); const { width } = useWindowDimensions();
  const recent = projects.filter((p) => !p.trashed && !p.archived).slice(0, 8);
  const create = (q: (typeof quick)[number]) => { const p = newProject({ name: `Untitled ${q.name}`, kind: q.kind, width: q.w, height: q.h, category: q.name }); saveProject(p, { immediate: true }); router.push(projectRoute(p)); };
  const bottom = usesNativeTabs ? insets.bottom : 0;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Ambient />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: bottom + 24 }} testID="home-screen">
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: 4 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, borderRadius: 6 }} accessibilityLabel="RF Canvas logo" testID="home-logo" />
              <T v="label" style={{ color: colors.brandPrimary }}>RF Canvas</T>
            </View>
            <T v="h1">What will you make?</T>
          </View>
          <IconBtn icon="search" label="Command palette" onPress={() => router.push("/palette")} testID="home-command-palette-button" />
          <IconBtn icon="settings-outline" label="Settings" onPress={() => router.push("/settings")} testID="home-settings-button" />
        </View>
        <Pressable onPress={() => router.push("/palette")} testID="home-search-bar" style={{ marginHorizontal: spacing.md, marginTop: spacing.md }}>
          <Glass style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 50, borderRadius: radius.pill }}>
            <Ionicons name="sparkles" size={18} color={colors.brandPrimary} />
            <T v="muted" style={{ flex: 1 }}>Search tools, projects or type a command…</T>
          </Glass>
        </Pressable>
        {loadError ? (
          <View testID="load-error-banner" style={{ margin: spacing.md, marginBottom: 0, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.error, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="warning" size={20} color={colors.error} />
            <T v="small" style={{ flex: 1 }}>Saved projects couldn&apos;t be read right now. Nothing has been changed or deleted.</T>
            <Btn small label="Retry" onPress={retryLoad} testID="load-error-retry" />
          </View>
        ) : null}
        {recovered.length ? (
          <View testID="recovery-banner" style={{ margin: spacing.md, marginBottom: 0, padding: 14, borderRadius: radius.lg, backgroundColor: colors.brandTertiary, flexDirection: "row", gap: 10 }}>
            <Ionicons name="medkit" size={20} color={colors.onBrandTertiary} />
            <T v="small" style={{ flex: 1, color: colors.onBrandTertiary }}>Recovered from backup after an interrupted save: {recovered.join(", ")}</T>
          </View>
        ) : null}
        <Section title="Start creating" right={<Pressable onPress={() => router.push("/create")} testID="home-custom-size-link"><T v="small" style={{ color: colors.brandPrimary }}>Custom size</T></Pressable>}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.md }}>
            {quick.map((q, i) => (
              <View key={q.name}>
                <Pressable onPress={() => create(q)} testID={`quick-create-${q.name.toLowerCase().replace(/ /g, "-")}`} style={({ pressed }) => ({ width: 104, alignItems: "center", gap: 8, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ width: 96, height: 96, borderRadius: 24, backgroundColor: i === 0 ? colors.brandPrimary : colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={q.icon as any} size={30} color={i === 0 ? colors.onBrandPrimary : colors.brandPrimary} />
                  </View>
                  <T v="small" numberOfLines={1} style={{ color: colors.onSurface }}>{q.name}</T>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </Section>
        <Section title="Recent projects" right={<Pressable onPress={() => router.push("/(tabs)/projects")} testID="home-see-all-projects"><T v="small" style={{ color: colors.brandPrimary }}>See all</T></Pressable>}>
          {!ready && !recent.length ? (
            <View testID="recent-skeleton" style={{ flexDirection: "row", gap: 12, paddingHorizontal: spacing.md }}>
              {[0, 1].map((i) => <View key={i} style={{ width: 150, height: 196, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary }} />)}
            </View>
          ) : recent.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.md }}>
              {recent.map((p) => <ProjectThumb key={p.id} p={p} width={150} onPress={() => router.push(projectRoute(p))} testID={`recent-project-${p.id}`} />)}
            </ScrollView>
          ) : (
            <View style={{ marginHorizontal: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong }}>
              <T v="h3">No projects yet</T><T v="small">Pick a size above or start from one of {templates.length} editable templates.</T>
            </View>
          )}
        </Section>
        <Section title="Studios">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: spacing.md }}>
            {studios.map((s) => (
              <Pressable key={s.t} onPress={() => router.push(s.r as any)} testID={`home-studio-${s.t.toLowerCase().replace(/ /g, "-")}`} style={({ pressed }) => ({ width: (width - 44) / 2, opacity: pressed ? 0.8 : 1 })}>
                <Glass style={{ padding: 16, gap: 10, minHeight: 112 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}><Ionicons name={s.icon as any} size={20} color={colors.brandPrimary} /></View>
                  <View><T v="h3">{s.t}</T><T v="muted">{s.s}</T></View>
                </Glass>
              </Pressable>
            ))}
          </View>
        </Section>
        <Section title="Featured templates" right={<Pressable onPress={() => router.push("/(tabs)/templates")}><T v="small" style={{ color: colors.brandPrimary }}>Browse</T></Pressable>}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.md }}>
            {templates.slice(0, 6).map((t) => (
              <Pressable key={t.id} onPress={() => router.push(`/templates?open=${t.id}` as any)} style={{ width: 130 }} testID={`home-template-${t.id}`}>
                <View style={{ height: 130, borderRadius: radius.md, backgroundColor: colors.canvasBg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <TemplatePreview id={t.id} size={120} />
                </View>
                <T v="small" numberOfLines={1} style={{ marginTop: 6, color: colors.onSurface }}>{t.name}</T>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      </ScrollView>
    </View>
  );
}

