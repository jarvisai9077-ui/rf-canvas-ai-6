import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, PixelRatio, Platform, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CanvasView } from "@/src/components/CanvasView";
import { Badge, Btn, Card, Chip, ChipRow, Header, Input, Row, Section, Slider, T } from "@/src/components/ui";
import { preflight } from "@/src/engine/doctor";
import { ExportResult, exportPDF, exportRaster, exportSVG, fileName, listExports, saveToPhotos, share, writeText } from "@/src/engine/exporter";
import { freeSpaceOK } from "@/src/engine/media";
import { getState, toast, updateSettings, useStore } from "@/src/engine/store";
import { radius, spacing, useTheme } from "@/src/theme";
import { withProject } from "@/src/components/ProjectGate";

type F = "png" | "jpg" | "svg" | "pdf" | "json";

function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme(); const { width } = useWindowDimensions();
  const { projects, settings } = useStore(); const p = projects.find((x) => x.id === id);
  const [fmt, setFmt] = useState<F>("png"); const [scale, setScale] = useState(1); const [quality, setQuality] = useState(90);
  const [allPages, setAllPages] = useState(false); const [bleed, setBleed] = useState(0); const [ann, setAnn] = useState(false);
  const [tpl, setTpl] = useState(settings.filenameTemplate); const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<ExportResult[]>([]); const [renderPage, setRenderPage] = useState(0); const [prev, setPrev] = useState<string | null>(null);
  const ref = useRef<View>(null); const cancel = useRef(false); const [capturing, setCapturing] = useState(false);
  useEffect(() => { listExports().catch(() => [] as Awaited<ReturnType<typeof listExports>>).then((l) => { const last = l.find((r) => r.projectId === id && r.format === fmt); setPrev(last ? `${(last.size / 1024).toFixed(1)} KB on ${new Date(last.t).toLocaleString()}` : null); }); }, [id, fmt, results]);
  if (!p) return null;
  const w = Math.round(p.width * scale), h = Math.round(p.height * scale);
  const est = fmt === "png" ? w * h * 1.2 : fmt === "jpg" ? w * h * 0.25 * (quality / 100) : fmt === "pdf" ? p.pages.length * 300000 : 50000;
  const tooBig = w * h > 8000 * 8000;
  const pages = allPages ? p.pages.map((_, i) => i) : [0];
  const run = async () => {
    if (!(await freeSpaceOK(est * pages.length))) return;
    cancel.current = false; setResults([]); updateSettings({ filenameTemplate: tpl }); const out: ExportResult[] = [];
    try {
      if (fmt === "pdf") { setBusy("Rendering PDF…"); out.push(await exportPDF(p, tpl, { bleedPx: Math.round((bleed / 25.4) * p.dpi), cropMarks: bleed > 0, annotations: ann })); }
      else if (fmt === "json") { setBusy("Packaging project…"); out.push(await writeText(p, JSON.stringify({ app: "RF Canvas", version: 1, createdAt: Date.now(), projects: [p], assets: getState().assets.filter((a) => p.pages.some((pg) => pg.layers.some((l) => l.uri === a.uri))), brands: [] }), "json", fileName(tpl, p, "rfcanvas.json"))); }
      else for (const i of pages) {
        if (cancel.current) { out.push({ uri: "", name: `Page ${i + 1}`, format: fmt, size: 0, valid: false, message: "Cancelled" }); break; }
        setBusy(`Exporting page ${i + 1} of ${pages.length}…`);
        if (fmt === "svg") out.push(await exportSVG(p, i, tpl.includes("{page}") || pages.length === 1 ? tpl : tpl + "_p{page}", { annotations: ann }));
        else { setRenderPage(i); setCapturing(true); await new Promise((r) => setTimeout(r, 600)); try { out.push(await exportRaster(p, i, ref, fmt, scale, quality / 100, tpl.includes("{page}") || pages.length === 1 ? tpl : tpl + "_p{page}")); } finally { setCapturing(false); } }
        setResults([...out]);
      }
    } catch (e: any) { out.push({ uri: "", name: "Export", format: fmt, size: 0, valid: false, message: e?.message ?? "Export failed" }); }
    setResults(out); setBusy(null);
  };
  const pf = fmt === "pdf" ? preflight(p, p.dpi, bleed) : [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="export-screen">
      {capturing && Platform.OS !== "web" ? (
        <View pointerEvents="none" style={{ position: "absolute", left: -20000, top: 0 }}>
          {/* Full-resolution render target: captured pixel-for-pixel so the shared file matches the design */}
          <CanvasView ref={ref} page={p.pages[renderPage]} W={p.width} H={p.height} width={w / PixelRatio.get()} opts={{ annotations: ann }} />
        </View>
      ) : null}
      <Header title="Export" subtitle={p.name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={{ alignItems: "center", padding: spacing.md }}>
          <View style={{ borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.canvasBg }}>
            <CanvasView page={p.pages[renderPage]} W={p.width} H={p.height} width={Math.min(width - 64, (260 * p.width) / p.height)} opts={{ annotations: ann }} testID="export-preview" />
          </View>
        </View>
        <Section title="Format"><ChipRow>{(["png", "jpg", "svg", "pdf", "json"] as F[]).map((f) => <Chip key={f} label={f === "json" ? "Project package" : f.toUpperCase()} active={fmt === f} onPress={() => setFmt(f)} testID={`export-format-${f}`} />)}</ChipRow></Section>
        {fmt === "png" || fmt === "jpg" ? (
          <Section title="Resolution">
            <ChipRow>{[0.25, 0.5, 1, 2, 3].map((s) => <Chip key={s} label={`${s}× · ${Math.round(p.width * s)}×${Math.round(p.height * s)}`} active={scale === s} onPress={() => setScale(s)} testID={`export-scale-${s}`} />)}</ChipRow>
            {fmt === "jpg" ? <Slider label="JPEG quality" value={quality} min={30} max={100} onChange={setQuality} testID="export-quality-slider" /> : null}
            {fmt === "png" ? <T v="muted" style={{ paddingHorizontal: spacing.md }}>PNG keeps transparency where the page background is transparent; JPEG is always opaque.</T> : null}
            {tooBig ? <T v="small" style={{ color: colors.error, paddingHorizontal: spacing.md }}>This size exceeds the 64-megapixel safe limit for most phones.</T> : null}
          </Section>
        ) : null}
        {fmt === "pdf" ? (
          <Section title="Print & preflight">
            <ChipRow>{[0, 3, 5].map((b) => <Chip key={b} label={b ? `${b} mm bleed + crop marks` : "No bleed"} active={bleed === b} onPress={() => setBleed(b)} testID={`export-bleed-${b}`} />)}</ChipRow>
            <Card>{pf.map((x, i) => <Row key={i} icon={x.ok ? "checkmark-circle" : "warning"} tone={x.ok ? colors.success : colors.warning} title={x.text} />)}</Card>
          </Section>
        ) : null}
        <Section title="Options">
          <ChipRow>
            {fmt !== "pdf" && fmt !== "json" ? <Chip label={allPages ? `All ${p.pages.length} pages` : "Current page"} icon="documents" active={allPages} onPress={() => setAllPages(!allPages)} testID="export-all-pages" /> : null}
            <Chip label={ann ? "Comments included" : "Comments hidden"} icon="chatbubbles" active={ann} onPress={() => setAnn(!ann)} testID="export-annotations" />
          </ChipRow>
          <View style={{ paddingHorizontal: spacing.md }}><Input label="Filename template ({name} {w} {h} {date} {page})" value={tpl} onChangeText={setTpl} testID="export-filename-input" /></View>
          <T v="muted" style={{ paddingHorizontal: spacing.md, marginTop: 6 }}>Estimated size ≈ {(est / 1e6).toFixed(2)} MB per file{prev ? ` · previous ${fmt.toUpperCase()}: ${prev}` : ""}</T>
        </Section>
        <View style={{ padding: spacing.md, gap: 10 }}>
          {busy ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID="export-progress"><ActivityIndicator color={colors.brandPrimary} /><T style={{ flex: 1 }}>{busy}</T><Btn small kind="ghost" label="Cancel" onPress={() => { cancel.current = true; }} testID="export-cancel-button" /></View>
          ) : <Btn label={`Export ${fmt === "json" ? "package" : fmt.toUpperCase()}`} icon="download" onPress={run} disabled={tooBig} testID="export-run-button" />}
        </View>
        {results.length ? (
          <Section title="Results (validated after writing)">
            <Card testID="export-results">
              {results.map((r, i) => <Row key={i} icon={r.valid ? "checkmark-circle" : "close-circle"} tone={r.valid ? colors.success : colors.error} title={r.name} subtitle={r.message} right={r.valid && r.uri.startsWith("file") ? <View style={{ flexDirection: "row", gap: 6 }}>{r.format === "png" || r.format === "jpg" ? <Btn small kind="ghost" label="Save" onPress={async () => { try { if (await saveToPhotos(r.uri)) toast("Saved to Photos", "success"); } catch (e: any) { toast(e?.message ?? "Could not save to Photos", "error"); } }} testID={`export-save-photos-${i}`} /> : null}<Btn small kind="secondary" label="Share" onPress={async () => { try { await share(r.uri); } catch (e: any) { toast(e?.message ?? "Sharing failed", "error"); } }} testID={`export-share-${i}`} /></View> : <Badge text={r.valid ? "OK" : "Failed"} tone={r.valid ? "success" : "error"} />} testID={`export-result-${i}`} />)}
            </Card>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default withProject(ExportScreen);
