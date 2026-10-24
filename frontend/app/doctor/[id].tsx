import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Btn, Card, Header, Row, Section, T } from "@/src/components/ui";
import { analyzeDesign, complexity, integrityScan, repairProject } from "@/src/engine/doctor";
import { confirmAsk, duplicateProject, saveProject, toast, useStore } from "@/src/engine/store";
import { spacing, useTheme } from "@/src/theme";
import { withProject } from "@/src/components/ProjectGate";

function Doctor() {
  const { id, page } = useLocalSearchParams<{ id: string; page?: string }>(); const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme();
  const { projects, brands } = useStore(); const p = projects.find((x) => x.id === id); const pi = Math.min(Number(page ?? 0), (p?.pages.length ?? 1) - 1);
  const brand = brands.find((b) => b.id === p?.brandId) ?? null;
  const res = useMemo(() => (p ? analyzeDesign(p, pi, brand) : null), [p, pi, brand]);
  const cx = useMemo(() => (p ? complexity(p) : null), [p]);
  const [integrity, setIntegrity] = useState<{ title: string; detail: string; repairable: boolean }[] | null>(null);
  useEffect(() => { if (p) integrityScan(p).then(setIntegrity); }, [p]);
  if (!p || !res || !cx) return null;
  const apply = async (fixes: { label: string; apply: any }[], titles: string[]) => {
    if (!(await confirmAsk({ title: `Apply ${fixes.length} fix${fixes.length > 1 ? "es" : ""}?`, message: "These objects will change. A snapshot is saved first so you can restore.", items: titles, confirmLabel: "Apply" }))) return;
    let pg = p.pages[pi]; for (const f of fixes) pg = f.apply(pg);
    saveProject({ ...p, pages: p.pages.map((x, i) => (i === pi ? pg : x)), snapshots: [{ id: Date.now().toString(36), name: "Before Design Doctor fixes", createdAt: Date.now(), pages: p.pages, width: p.width, height: p.height }, ...p.snapshots] });
    toast("Fixes applied · snapshot saved", "success");
  };
  const fixable = res.issues.filter((i) => i.fix);
  const tone = res.score >= 85 ? colors.success : res.score >= 65 ? colors.warning : colors.error;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="doctor-screen">
      <Header title="Design Doctor" subtitle={`${p.name} · ${p.pages[pi].name}`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Card style={{ marginTop: spacing.md, padding: spacing.lg, flexDirection: "row", gap: 16, alignItems: "center" }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 6, borderColor: tone, alignItems: "center", justifyContent: "center" }}><T v="h1" testID="design-score">{res.score}</T></View>
          <View style={{ flex: 1, gap: 4 }}><T v="h3">Design score</T>{res.explain.map((e, i) => <T key={i} v="small">{e}</T>)}</View>
        </Card>
        {fixable.length ? <View style={{ padding: spacing.md }}><Btn label={`Preview & apply ${fixable.length} suggested fixes`} icon="medkit" onPress={() => apply(fixable.map((i) => i.fix!), fixable.map((i) => `${i.title} → ${i.fix!.label}`))} testID="doctor-fix-all-button" /></View> : null}
        <Section title={`Findings (${res.issues.length})`}>
          <Card testID="doctor-issues">
            {res.issues.length ? res.issues.map((i) => (
              <Row key={i.id} icon={i.severity === "error" ? "close-circle" : i.severity === "warn" ? "warning" : "information-circle"} tone={i.severity === "error" ? colors.error : i.severity === "warn" ? colors.warning : colors.info}
                title={i.title} subtitle={`${i.category} · ${i.detail}`} right={i.fix ? <Btn small kind="secondary" label={i.fix.label} onPress={() => apply([i.fix!], [i.title])} testID={`doctor-fix-${i.id}`} /> : <Badge text={i.severity} tone="muted" />} />
            )) : <Row icon="checkmark-circle" tone={colors.success} title="No problems found" subtitle="Contrast, overflow, bounds, resolution, alignment and typography checks passed." />}
          </Card>
        </Section>
        <Section title="Composition analyzer">
          <Card style={{ padding: spacing.md, gap: 4 }}>
            <T v="small">Visual centre of mass: {Math.round(res.comp.cx)}, {Math.round(res.comp.cy)} (canvas centre {p.width / 2}, {p.height / 2})</T>
            <T v="small">Balance {(res.comp.balance * 100).toFixed(0)}% · Whitespace {(res.comp.whitespace * 100).toFixed(0)}% · Rule of thirds: {res.comp.thirds ? "yes" : "no"}</T>
          </Card>
        </Section>
        <Section title="Project complexity meter">
          <Card style={{ padding: spacing.md, gap: 4 }} testID="complexity-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><T v="h3">{cx.level}</T><Badge text={`${cx.score}/100`} tone={cx.level === "Light" ? "success" : cx.level === "Moderate" ? "warning" : "error"} /></View>
            <T v="small">{cx.layers} layers · {cx.images} images ({cx.megapixels} MP) · {cx.effects} effects · {cx.pages} pages · {cx.clips} media clips</T>
            <T v="small">{cx.rec}</T>
          </Card>
        </Section>
        <Section title="Project integrity scanner">
          <Card testID="integrity-card">
            {integrity === null ? <Row title="Scanning…" /> : integrity.length ? integrity.map((x, i) => <Row key={i} icon="alert-circle" tone={colors.error} title={x.title} subtitle={x.detail} />) : <Row icon="shield-checkmark" tone={colors.success} title="Project is healthy" subtitle="IDs, numbers and file references verified." />}
          </Card>
          {integrity?.some((x) => x.repairable) ? <View style={{ padding: spacing.md }}><Btn label="Repair into a copy" icon="construct" onPress={() => { const c = duplicateProject(repairProject(p), `${p.name} (repaired)`); toast(`Created “${c.name}” · original untouched`, "success"); }} testID="integrity-repair-button" /></View> : null}
        </Section>
      </ScrollView>
    </View>
  );
}

export default withProject(Doctor);
