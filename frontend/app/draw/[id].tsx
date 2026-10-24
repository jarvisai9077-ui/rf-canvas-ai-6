import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { CanvasView } from "@/src/components/CanvasView";
import { Chip, ChipRow, IconBtn, Slider, T } from "@/src/components/ui";
import { useEditor } from "@/src/editor/useEditor";
import { swatches } from "@/src/engine/color";
import { newLayer, newPage } from "@/src/engine/factory";
import { pathBox, pointInLayer, Pt, smoothPath, stabilize, variableStroke } from "@/src/engine/geometry";
import { toast } from "@/src/engine/store";
import { fonts, radius, spacing, useTheme } from "@/src/theme";
import { withProject } from "@/src/components/ProjectGate";

type Brush = "pen" | "pencil" | "marker" | "airbrush" | "calligraphy" | "tapered" | "eraser";
const brushes: [Brush, string][] = [["pen", "Pen"], ["pencil", "Pencil"], ["marker", "Marker"], ["airbrush", "Airbrush"], ["calligraphy", "Calligraphy"], ["tapered", "Tapered"], ["eraser", "Stroke eraser"]];

// Drawing & Calligraphy Studio: strokes become editable vector path layers on the page.
function Draw() {
  const { id, page } = useLocalSearchParams<{ id: string; page?: string }>(); const ed = useEditor(id!); const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme();
  useEffect(() => { if (page) ed.setPageIndex(Number(page)); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  const [brush, setBrush] = useState<Brush>("pen"); const [size, setSize] = useState(12); const [opacity, setOpacity] = useState(100); const [color, setColor] = useState("#1C1C1E");
  const [stab, setStab] = useState(3); const [nib, setNib] = useState(35); const [sym, setSym] = useState<"none" | "v" | "h" | "quad">("none"); const [pressure, setPressure] = useState(true);
  const [onion, setOnion] = useState(false); const [playing, setPlaying] = useState(false); const [fps, setFps] = useState(8);
  const [area, setArea] = useState({ w: 1, h: 1 }); const [live, setLive] = useState<Pt[]>([]);
  const p = ed.project; const W = p?.width ?? 1, H = p?.height ?? 1;
  const scale = Math.min((area.w - 16) / W, (area.h - 16) / H); const dw = W * scale, dh = H * scale; const left = (area.w - dw) / 2, top = (area.h - dh) / 2;
  const S = useRef<any>({}); S.current = { scale, left, top, brush, size, opacity, color, stab, nib, sym, pressure, ed, W, H };
  const pts = useRef<Pt[]>([]); const lastT = useRef(0);
  const at = (e: any) => { const s = S.current; return { x: (e.nativeEvent.locationX - s.left) / s.scale, y: (e.nativeEvent.locationY - s.top) / s.scale }; };
  const pr = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { const q = at(e); pts.current = [{ ...q, p: 0.5 }]; lastT.current = Date.now(); setLive(pts.current); },
    onPanResponderMove: (e) => {
      const q = at(e); const prev = pts.current[pts.current.length - 1]; const dt = Math.max(1, Date.now() - lastT.current); lastT.current = Date.now();
      const speed = Math.hypot(q.x - prev.x, q.y - prev.y) / dt; const force = (e.nativeEvent as any).force;
      const pr0 = force && force > 0 && force !== 1 ? force : Math.max(0.15, Math.min(1, 1 - speed / 3)); // real stylus force when the device reports it
      if (Math.hypot(q.x - prev.x, q.y - prev.y) < 1.5 / S.current.scale) return;
      pts.current = [...pts.current, { ...q, p: pr0 }]; setLive(pts.current);
    },
    onPanResponderRelease: () => { finish(pts.current); pts.current = []; setLive([]); },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  function finish(raw: Pt[]) {
    const s = S.current; if (raw.length < 2) return;
    if (s.brush === "eraser") {
      const hits = s.ed.page.layers.filter((l: any) => l.type === "path" && raw.some((q) => pointInLayer(l, q.x, q.y)));
      if (hits.length) s.ed.commit("Erase strokes", (ls: any[]) => ls.filter((l) => !hits.includes(l))); return;
    }
    const base = stabilize(raw, s.stab);
    const mirrors: ((q: Pt) => Pt)[] = [(q) => q];
    if (s.sym === "v" || s.sym === "quad") mirrors.push((q) => ({ ...q, x: s.W - q.x }));
    if (s.sym === "h" || s.sym === "quad") mirrors.push((q) => ({ ...q, y: s.H - q.y }));
    if (s.sym === "quad") mirrors.push((q) => ({ ...q, x: s.W - q.x, y: s.H - q.y }));
    const layers = mirrors.map((m) => {
      const ptsM = base.map(m); const box = pathBox(ptsM, s.size);
      const variable = s.brush === "calligraphy" || s.brush === "tapered" || (s.pressure && s.brush === "pen");
      const width = s.brush === "pencil" ? Math.max(1, s.size * 0.35) : s.brush === "marker" ? s.size * 1.6 : s.brush === "airbrush" ? s.size * 2.5 : s.size;
      const d = variable ? variableStroke(box.local, width, { nibAngle: s.brush === "calligraphy" ? s.nib : null, taper: s.brush === "tapered" ? 0.35 : 0.08, pressure: s.pressure }) : smoothPath(box.local);
      return newLayer("path", { name: `${s.brush} stroke`, x: box.x, y: box.y, w: box.w, h: box.h, pathW: box.w, pathH: box.h, d, strokeOnly: !variable, fill: s.color, stroke: s.color, strokeWidth: variable ? 0 : width, opacity: (s.opacity / 100) * (s.brush === "marker" ? 0.55 : s.brush === "airbrush" ? 0.3 : 1), glow: s.brush === "airbrush" ? width / 2 : 0 });
    });
    s.ed.commit(`Draw ${s.brush}`, (ls: any[]) => [...ls, ...layers]);
  }
  useEffect(() => {
    if (!playing) return; const t = setInterval(() => ed.setPageIndex((i: number) => (i + 1) % ed.pages.length), 1000 / fps); return () => clearInterval(t);
  }, [playing, fps, ed.pages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p || !ed.page) return null;
  const prevPage = onion && ed.pageIndex > 0 ? ed.pages[ed.pageIndex - 1] : null;
  const liveD = live.length > 1 ? smoothPath(stabilize(live, stab)) : "";
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvasBg }} testID="draw-screen">
      <View style={{ paddingTop: insets.top + 4, flexDirection: "row", alignItems: "center", paddingHorizontal: 4, backgroundColor: colors.glassStrong }}>
        <IconBtn icon="chevron-back" label="Back" onPress={() => router.back()} testID="draw-back-button" />
        <View style={{ flex: 1 }}><T v="h3" numberOfLines={1}>{p.name}</T><T v="muted" style={{ fontSize: 11 }}>Frame {ed.pageIndex + 1}/{ed.pages.length} · {ed.page.layers.length} strokes</T></View>
        <IconBtn icon="arrow-undo" label="Undo" onPress={ed.undo} disabled={!ed.canUndo} testID="draw-undo-button" />
        <IconBtn icon="arrow-redo" label="Redo" onPress={ed.redo} disabled={!ed.canRedo} testID="draw-redo-button" />
        <IconBtn icon="color-palette" label="Open in design editor" onPress={() => router.replace(`/editor/${p.id}`)} testID="draw-open-editor" />
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pr.panHandlers} testID="draw-canvas-area">
        <View pointerEvents="none" style={{ position: "absolute", left, top, width: dw, height: dh, backgroundColor: ed.page.background }}>
          {prevPage ? <View style={{ position: "absolute", opacity: 0.25 }}><CanvasView page={{ ...prevPage, background: "transparent" }} W={W} H={H} width={dw} /></View> : null}
          <View style={{ opacity: prevPage ? 0.9 : 1 }}><CanvasView page={prevPage ? { ...ed.page, background: "transparent" } : ed.page} W={W} H={H} width={dw} /></View>
          <Svg style={{ position: "absolute" }} width={dw} height={dh} viewBox={`0 0 ${W} ${H}`}>
            {sym !== "none" ? <Path d={`${sym !== "h" ? `M${W / 2},0 L${W / 2},${H}` : ""} ${sym !== "v" ? `M0,${H / 2} L${W},${H / 2}` : ""}`} stroke={colors.info} strokeOpacity={0.4} strokeDasharray="10 8" strokeWidth={2 / scale} /> : null}
            {liveD ? <Path d={liveD} stroke={brush === "eraser" ? colors.error : color} strokeOpacity={brush === "eraser" ? 0.5 : opacity / 100} strokeWidth={brush === "pencil" ? size * 0.35 : brush === "marker" ? size * 1.6 : size} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          </Svg>
        </View>
      </View>
      <View style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 4, paddingBottom: insets.bottom + 6, maxHeight: 300 }}>
        <ScrollView>
          <ChipRow>{brushes.map(([b, l]) => <Chip key={b} label={l} active={brush === b} onPress={() => setBrush(b)} testID={`brush-${b}`} />)}</ChipRow>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md }}>
            {swatches.map((c) => <View key={c} onTouchEnd={() => setColor(c)} testID={`draw-color-${c.replace("#", "")}`} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: color === c ? 3 : 1, borderColor: color === c ? colors.brandPrimary : colors.borderStrong }} />)}
          </ScrollView>
          <Slider label="Size" value={size} min={1} max={Math.round(Math.min(W, H) / 10)} onChange={setSize} testID="draw-size-slider" />
          <Slider label="Opacity" value={opacity} min={5} max={100} onChange={setOpacity} testID="draw-opacity-slider" />
          <Slider label="Stabilizer" value={stab} min={1} max={12} onChange={setStab} testID="draw-stabilizer-slider" />
          {brush === "calligraphy" ? <Slider label="Nib angle" value={nib} min={0} max={180} onChange={setNib} testID="draw-nib-slider" /> : null}
          <ChipRow>
            {(["none", "v", "h", "quad"] as const).map((m) => <Chip key={m} label={m === "none" ? "No symmetry" : m === "v" ? "Mirror ↔" : m === "h" ? "Mirror ↕" : "Quad"} active={sym === m} onPress={() => setSym(m)} testID={`draw-symmetry-${m}`} />)}
            <Chip label={pressure ? "Pressure on" : "Pressure off"} active={pressure} onPress={() => setPressure(!pressure)} testID="draw-pressure-toggle" />
          </ChipRow>
          <T v="label" style={{ paddingHorizontal: spacing.md, fontFamily: fonts.semibold }}>Frame animation</T>
          <ChipRow>
            <Chip icon="add" label="New frame" onPress={() => { ed.setAllPages("Add frame", [...ed.pages, newPage(`Frame ${ed.pages.length + 1}`, ed.page.background)]); ed.setPageIndex(ed.pages.length); }} testID="draw-add-frame" />
            <Chip icon="copy" label="Duplicate frame" onPress={() => { const c = JSON.parse(JSON.stringify(ed.page)); c.id = Date.now().toString(36); c.name = `Frame ${ed.pages.length + 1}`; const n = [...ed.pages]; n.splice(ed.pageIndex + 1, 0, c); ed.setAllPages("Duplicate frame", n); ed.setPageIndex(ed.pageIndex + 1); }} testID="draw-dup-frame" />
            <Chip icon="chevron-back" label="Prev" onPress={() => ed.setPageIndex(Math.max(0, ed.pageIndex - 1))} testID="draw-prev-frame" />
            <Chip icon="chevron-forward" label="Next" onPress={() => ed.setPageIndex(Math.min(ed.pages.length - 1, ed.pageIndex + 1))} testID="draw-next-frame" />
            <Chip icon="layers" label="Onion skin" active={onion} onPress={() => setOnion(!onion)} testID="draw-onion-toggle" />
            <Chip icon={playing ? "pause" : "play"} label={playing ? "Stop" : `Play ${fps} fps`} active={playing} onPress={() => (ed.pages.length < 2 ? toast("Add at least 2 frames") : setPlaying(!playing))} testID="draw-play-toggle" />
            <Chip label={`${fps} fps`} onPress={() => setFps(fps >= 24 ? 4 : fps + 4)} testID="draw-fps" />
          </ChipRow>
        </ScrollView>
      </View>
    </View>
  );
}

export default withProject(Draw);
