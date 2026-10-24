import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Card, Chip, ChipRow, Header, IconBtn, Input, Section, T } from "@/src/components/ui";
import { getState, promptText, saveProject, toast, uid, updateSettings, useStore } from "@/src/engine/store";
import { spacing, useTheme } from "@/src/theme";
import { withProject } from "@/src/components/ProjectGate";

// Creative Production Checklist + annotation review list for a project.
function Checklist() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme();
  const { projects, settings } = useStore(); const p = projects.find((x) => x.id === id); const [text, setText] = useState("");
  if (!p) return null;
  const set = (checklist: typeof p.checklist) => saveProject({ ...p, checklist }, { touch: false });
  const done = p.checklist.filter((t) => t.done).length; const pct = p.checklist.length ? done / p.checklist.length : 0;
  const anns = p.pages.flatMap((pg, pi) => (pg.annotations ?? []).map((a) => ({ ...a, pi, page: pg.name })));
  const setAnn = (pi: number, aid: string, patch: any) => saveProject({ ...p, pages: p.pages.map((pg, i) => (i === pi ? { ...pg, annotations: (pg.annotations ?? []).map((a) => (a.id === aid ? { ...a, ...patch } : a)).filter((a) => !patch.delete || a.id !== aid) } : pg)) });
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="checklist-screen">
      <Header title="Production checklist" subtitle={p.name} onBack={() => router.back()} />
      <KeyboardAwareScrollView bottomOffset={20} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Card style={{ marginTop: spacing.md, padding: spacing.md, gap: 8 }}>
          <T v="h3" testID="checklist-progress">{done} of {p.checklist.length} done</T>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary }}><View style={{ width: `${pct * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.success }} /></View>
        </Card>
        <View style={{ flexDirection: "row", gap: 8, padding: spacing.md, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}><Input value={text} onChangeText={setText} placeholder="Add a task" testID="checklist-input" /></View>
          <Btn label="Add" onPress={() => { if (!text.trim()) return; set([...p.checklist, { id: uid(), text: text.trim(), done: false }]); setText(""); }} testID="checklist-add-button" />
        </View>
        <Card>
          {p.checklist.map((t) => (
            <Pressable key={t.id} onPress={() => set(p.checklist.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} testID={`task-${t.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: t.done }} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md, minHeight: 52 }}>
              <Ionicons name={t.done ? "checkmark-circle" : "ellipse-outline"} size={24} color={t.done ? colors.success : colors.muted} />
              <T style={{ flex: 1, textDecorationLine: t.done ? "line-through" : "none", opacity: t.done ? 0.6 : 1 }}>{t.text}</T>
              <IconBtn icon="close" label="Remove task" size={18} onPress={() => set(p.checklist.filter((x) => x.id !== t.id))} testID={`task-remove-${t.id}`} />
            </Pressable>
          ))}
          {!p.checklist.length ? <T v="muted" style={{ padding: spacing.md }}>No tasks yet. Add one or load a reusable checklist.</T> : null}
        </Card>
        <Section title="Reusable checklists">
          <ChipRow>
            {settings.savedChecklists.map((c, i) => <Chip key={i} icon="download" label={c.name} onPress={() => { set([...p.checklist, ...c.items.map((t) => ({ id: uid(), text: t, done: false }))]); toast(`Loaded “${c.name}”`, "success"); }} testID={`checklist-template-${i}`} />)}
            <Chip icon="save" label="Save current as reusable" onPress={async () => { const n = await promptText("Checklist name", `${p.name} checklist`); if (n && p.checklist.length) updateSettings({ savedChecklists: [...getState().settings.savedChecklists, { name: n, items: p.checklist.map((t) => t.text) }] }); }} testID="checklist-save-template" />
          </ChipRow>
        </Section>
        <Section title={`Comments & revision notes (${anns.length})`}>
          <Card testID="annotation-list">
            {anns.map((a, i) => (
              <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: a.color, alignItems: "center", justifyContent: "center" }}><T style={{ color: colors.onBrandPrimary, fontSize: 12 }}>{i + 1}</T></View>
                <View style={{ flex: 1 }}><T style={{ textDecorationLine: a.resolved ? "line-through" : "none" }}>{a.text}</T><T v="muted">{a.page}{a.layerId ? " · attached to object" : ""}</T></View>
                <IconBtn icon={a.resolved ? "refresh" : "checkmark"} label={a.resolved ? "Reopen" : "Resolve"} onPress={() => setAnn(a.pi, a.id, { resolved: !a.resolved })} testID={`annotation-resolve-${a.id}`} />
                <IconBtn icon="trash" label="Delete comment" onPress={() => setAnn(a.pi, a.id, { delete: true })} testID={`annotation-delete-${a.id}`} />
              </View>
            ))}
            {!anns.length ? <T v="muted" style={{ padding: spacing.md }}>Use the comment tool in the editor to pin notes on the canvas.</T> : null}
          </Card>
        </Section>
      </KeyboardAwareScrollView>
    </View>
  );
}

export default withProject(Checklist);
