import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CanvasView } from "@/src/components/CanvasView";
import { timeAgo } from "@/src/components/ProjectThumb";
import { Btn, Card, Chip, ChipRow, Header, Input, Row, Section, Slider, T } from "@/src/components/ui";
import { confirmAsk, duplicateProject, promptText, saveProject, toast, uid, useStore } from "@/src/engine/store";
import type { Page } from "@/src/engine/types";
import { projectRoute } from "@/src/navigation";
import { radius, spacing, useTheme } from "@/src/theme";
import { withProject } from "@/src/components/ProjectGate";

// Versions, snapshots, edit-history search, safe experiments, diff and variant comparison wall.
function History() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme(); const { width } = useWindowDimensions();
  const { projects } = useStore(); const p = projects.find((x) => x.id === id);
  const [q, setQ] = useState(""); const [cmp, setCmp] = useState<string[]>([]); const [zoom, setZoom] = useState(1);
  const versions = useMemo(() => (p ? [{ id: "current", name: "Current", createdAt: p.updatedAt, pages: p.pages }, ...p.snapshots, ...p.history.map((h, i) => ({ id: "h" + i, name: `Autosave: ${h.label}`, createdAt: h.t, pages: h.pages }))] : []), [p]);
  if (!p) return null;
  const snap = async () => { const n = await promptText("Name this snapshot", `Version ${p.snapshots.length + 1}`); if (!n) return; saveProject({ ...p, snapshots: [{ id: uid(), name: n, createdAt: Date.now(), pages: p.pages, width: p.width, height: p.height }, ...p.snapshots] }, { touch: false }); toast("Snapshot saved", "success"); };
  const restore = async (v: { name: string; pages: Page[] }) => {
    if (!(await confirmAsk({ title: `Restore “${v.name}”?`, message: "The current state is saved as a snapshot first, so nothing is lost.", confirmLabel: "Restore" }))) return;
    saveProject({ ...p, pages: v.pages, snapshots: [{ id: uid(), name: `Before restoring ${v.name}`, createdAt: Date.now(), pages: p.pages, width: p.width, height: p.height }, ...p.snapshots] }, { immediate: true }); toast("Version restored", "success");
  };
  const log = p.log.filter((e) => !q || e.label.toLowerCase().includes(q.toLowerCase()) || new Date(e.t).toLocaleString().includes(q));
  const sel = versions.filter((v) => cmp.includes(v.id));
  const diff = (a: Page[], b: Page[]) => {
    const la = a.flatMap((x) => x.layers), lb = b.flatMap((x) => x.layers); const ida = new Set(la.map((l) => l.id)), idb = new Set(lb.map((l) => l.id));
    const changed = lb.filter((l) => ida.has(l.id) && JSON.stringify(l) !== JSON.stringify(la.find((x) => x.id === l.id))).length;
    return `${lb.filter((l) => !ida.has(l.id)).length} added · ${la.filter((l) => !idb.has(l.id)).length} removed · ${changed} changed · pages ${a.length}→${b.length}`;
  };
  const cw = (width - spacing.md * 3) / 2;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="history-screen">
      <Header title="History & versions" subtitle={p.name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={{ flexDirection: "row", gap: 10, padding: spacing.md }}>
          <Btn label="Save snapshot" icon="camera" onPress={snap} style={{ flex: 1 }} testID="history-snapshot-button" />
          <Btn label="Experiment" icon="flask" kind="secondary" style={{ flex: 1 }} onPress={() => { const c = duplicateProject(p, `${p.name} · experiment`, { parentId: p.id }); router.replace(projectRoute(c)); }} testID="history-experiment-button" />
        </View>
        <Section title="Versions · tap two to compare">
          <ChipRow>{versions.map((v) => <Chip key={v.id} label={`${v.name} · ${timeAgo(v.createdAt)}`} active={cmp.includes(v.id)} onPress={() => setCmp(cmp.includes(v.id) ? cmp.filter((x) => x !== v.id) : [...cmp, v.id].slice(-2))} testID={`version-chip-${v.id}`} />)}</ChipRow>
          {sel.length ? (
            <View testID="variant-wall">
              <Slider label="Synchronised zoom" value={zoom} min={1} max={3} step={0.1} onChange={setZoom} testID="variant-zoom-slider" />
              <View style={{ flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.md }}>
                {sel.map((v) => (
                  <View key={v.id} style={{ width: cw, gap: 6 }}>
                    <View style={{ height: cw * 1.1, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.canvasBg, alignItems: "center", justifyContent: "center" }}>
                      <View style={{ transform: [{ scale: zoom }] }}><CanvasView page={v.pages[0]} W={p.width} H={p.height} width={Math.min(cw - 8, ((cw * 1.1 - 8) * p.width) / p.height)} /></View>
                    </View>
                    <T v="small" numberOfLines={1}>{v.name}</T>
                    {v.id !== "current" ? <Btn small label="Restore" onPress={() => restore(v)} testID={`version-restore-${v.id}`} /> : null}
                  </View>
                ))}
              </View>
              {sel.length === 2 ? <T v="small" style={{ padding: spacing.md }} testID="version-diff">Difference: {diff(sel[0].pages, sel[1].pages)}</T> : null}
            </View>
          ) : null}
        </Section>
        <Section title={`Edit history (${p.log.length})`}>
          <View style={{ paddingHorizontal: spacing.md, marginBottom: 8 }}><Input value={q} onChangeText={setQ} placeholder="Search actions or dates" testID="history-search-input" /></View>
          <Card>
            {log.slice(0, 80).map((e, i) => {
              const h = p.history.find((x) => x.t === e.t);
              return <Row key={i} icon="time" title={e.label} subtitle={new Date(e.t).toLocaleString()} right={h ? <Btn small kind="secondary" label="Restore" onPress={() => restore({ name: e.label, pages: h.pages })} testID={`history-restore-${i}`} /> : <View />} />;
            })}
            {!log.length ? <Row title="No matching actions" /> : null}
          </Card>
          <T v="muted" style={{ padding: spacing.md }}>The last 15 states are stored on device and restorable; older entries are kept as a searchable log.</T>
        </Section>
      </ScrollView>
    </View>
  );
}

export default withProject(History);
