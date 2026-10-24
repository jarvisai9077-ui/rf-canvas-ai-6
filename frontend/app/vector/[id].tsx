import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { CanvasView } from "@/src/components/CanvasView";
import { Chip, ChipRow, IconBtn, Slider, T } from "@/src/components/ui";
import { useEditor } from "@/src/editor/useEditor";
import { newLayer } from "@/src/engine/factory";
import { offsetPolygon, pathBox, polyLength, Pt, simplify, splinePath } from "@/src/engine/geometry";
import { pickTextFile } from "@/src/engine/media";
import { toast } from "@/src/engine/store";
import type { Layer } from "@/src/engine/types";
import { radius, spacing, useTheme } from "@/src/theme";
import { withProject } from "@/src/components/ProjectGate";

type Mode = "pen" | "edit" | "measure";

// Vector Studio: node-based pen tool, spline smoothing, offset, simplify, procedural shapes, measurement, SVG import.
function Vector() {
  const { id, page } = useLocalSearchParams<{ id: string; page?: string }>(); const ed = useEditor(id!); const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme();
  useEffect(() => { if (page) ed.setPageIndex(Number(page)); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<Mode>("pen"); const [nodes, setNodes] = useState<Pt[]>([]); const [smooth, setSmooth] = useState(true); const [closed, setClosed] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); const [measure, setMeasure] = useState<Pt[]>([]); const [iso, setIso] = useState(false); const [offset, setOffset] = useState(20);
  const [stroke, setStroke] = useState(6); const [fill, setFill] = useState(false);
  const [area, setArea] = useState({ w: 1, h: 1 });
  const p = ed.project; const W = p?.width ?? 1, H = p?.height ?? 1;
  const scale = Math.min((area.w - 16) / W, (area.h - 16) / H); const dw = W * scale, dh = H * scale; const left = (area.w - dw) / 2, top = (area.h - dh) / 2;
  const S = useRef<any>({}); S.current = { scale, left, top, mode, nodes };
  const drag = useRef<number | null>(null);
  const at = (e: any) => { const s = S.current; return { x: (e.nativeEvent.locationX - s.left) / s.scale, y: (e.nativeEvent.locationY - s.top) / s.scale }; };
  const pr = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const q = at(e); const s = S.current;
      if (s.mode === "measure") { setMeasure((m) => (m.length >= 2 ? [q] : [...m, q])); return; }
      const hit = s.nodes.findIndex((n: Pt) => Math.hypot(n.x - q.x, n.y - q.y) < 24 / s.scale);
      if (hit >= 0) { drag.current = hit; return; }
      if (s.mode === "pen") { setNodes((n) => [...n, q]); drag.current = s.nodes.length; }
    },
    onPanResponderMove: (e) => { if (drag.current === null) return; const q = at(e); const i = drag.current; setNodes((n) => n.map((x, k) => (k === i ? q : x))); },
    onPanResponderRelease: () => { drag.current = null; },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p || !ed.page) return null;

  const toLayer = (pts: Pt[], name: string, extra: Partial<Layer> = {}): Layer => {
    const box = pathBox(pts, 0);
    return newLayer("path", { name, x: box.x, y: box.y, w: box.w, h: box.h, pathW: box.w, pathH: box.h, nodes: box.local, smooth, closed, d: splinePath(box.local, closed, smooth), strokeOnly: !fill, fill: "#FF5E00", stroke: "#1C1C1E", strokeWidth: stroke, ...extra });
  };
  const finish = () => {
    if (nodes.length < 2) return toast("Place at least two nodes");
    if (editId) { const l = toLayer(nodes, "Path"); ed.commit("Edit nodes", (ls) => ls.map((x) => (x.id === editId ? { ...x, ...l, id: x.id, name: x.name } : x))); }
    else ed.commit("Pen path", (ls) => [...ls, toLayer(nodes, "Path")]);
    setNodes([]); setEditId(null); toast("Path saved as editable vector", "success");
  };
  const paths = ed.page.layers.filter((l) => l.type === "path" && l.nodes?.length);
  const editPath = (l: Layer) => { const sx = l.w / (l.pathW || l.w), sy = l.h / (l.pathH || l.h); setNodes(l.nodes!.map((n) => ({ x: l.x + n.x * sx, y: l.y + n.y * sy }))); setSmooth(!!l.smooth); setClosed(!!l.closed); setEditId(l.id); setMode("edit"); };
  const proc = (kind: string) => {
    const c = { x: W / 2, y: H / 2 }; const r = Math.min(W, H) * 0.3; const pts: Pt[] = [];
    if (kind === "spiral") for (let i = 0; i < 60; i++) { const a = i * 0.35; pts.push({ x: c.x + (r * i * Math.cos(a)) / 60, y: c.y + (r * i * Math.sin(a)) / 60 }); }
    if (kind === "rose") for (let i = 0; i < 120; i++) { const a = (i / 120) * Math.PI * 2; const k = r * Math.cos(4 * a); pts.push({ x: c.x + k * Math.cos(a), y: c.y + k * Math.sin(a) }); }
    if (kind === "wave") for (let i = 0; i <= 40; i++) pts.push({ x: W * 0.1 + (W * 0.8 * i) / 40, y: c.y + Math.sin(i / 3) * r * 0.4 });
    if (kind === "gear") for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; const rr = i % 4 < 2 ? r : r * 0.82; pts.push({ x: c.x + rr * Math.cos(a), y: c.y + rr * Math.sin(a) }); }
    const isClosed = kind !== "wave" && kind !== "spiral";
    const box = pathBox(pts, 0);
    ed.commit(`Generate ${kind}`, (ls) => [...ls, newLayer("path", { name: kind, x: box.x, y: box.y, w: box.w, h: box.h, pathW: box.w, pathH: box.h, nodes: box.local, smooth: kind !== "gear", closed: isClosed, d: splinePath(box.local, isClosed, kind !== "gear"), strokeOnly: !isClosed, fill: "#FF5E00", stroke: "#1C1C1E", strokeWidth: stroke })]);
  };
  const offsetSel = (sign: number) => {
    const l = paths.find((x) => x.id === editId) ?? paths[paths.length - 1]; if (!l || !l.closed) return toast("Select a closed path first (tap a path chip)");
    const sx = l.w / (l.pathW || l.w), sy = l.h / (l.pathH || l.h); const abs = l.nodes!.map((n) => ({ x: l.x + n.x * sx, y: l.y + n.y * sy }));
    const o = offsetPolygon(abs, sign * offset); const box = pathBox(o, 0);
    ed.commit(sign > 0 ? "Outer offset" : "Inner offset", (ls) => [...ls, { ...newLayer("path", {}), ...l, id: Math.random().toString(36).slice(2), name: `${l.name} offset ${sign > 0 ? "+" : "-"}${offset}`, x: box.x, y: box.y, w: box.w, h: box.h, pathW: box.w, pathH: box.h, nodes: box.local, d: splinePath(box.local, true, !!l.smooth), strokeOnly: true, stroke: "#FF00FF" }]);
  };
  const importSVG = async () => {
    const f = await pickTextFile(["image/svg+xml", "text/xml", "*/*"]); if (!f) return;
    const ds = [...f.text.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    if (!ds.length || !f.text.includes("<svg")) return toast("No <path> elements found in this SVG", "error");
    const vb = f.text.match(/viewBox="([\d.\-\s]+)"/)?.[1].split(/\s+/).map(Number) ?? [0, 0, W, H];
    const s = Math.min(W / vb[2], H / vb[3]) * 0.8;
    ed.commit("Import SVG", (ls) => [...ls, ...ds.map((d, i) => newLayer("path", { name: `${f.name} #${i + 1}`, x: W * 0.1, y: H * 0.1, w: vb[2] * s, h: vb[3] * s, pathW: vb[2], pathH: vb[3], d, fill: "#1C1C1E", strokeOnly: false }))]);
    toast(`Imported ${ds.length} path(s). Gradients, text and filters in the SVG are not imported.`, "success");
  };
  const mLen = measure.length === 2 ? Math.hypot(measure[1].x - measure[0].x, measure[1].y - measure[0].y) : 0;
  const mAng = measure.length === 2 ? (Math.atan2(measure[1].y - measure[0].y, measure[1].x - measure[0].x) * 180) / Math.PI : 0;
  const pathLen = nodes.length > 1 ? polyLength(nodes) : 0;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvasBg }} testID="vector-screen">
      <View style={{ paddingTop: insets.top + 4, flexDirection: "row", alignItems: "center", paddingHorizontal: 4, backgroundColor: colors.glassStrong }}>
        <IconBtn icon="chevron-back" label="Back" onPress={() => router.back()} testID="vector-back-button" />
        <View style={{ flex: 1 }}><T v="h3" numberOfLines={1}>Vector · {p.name}</T><T v="muted" style={{ fontSize: 11 }} testID="vector-status">{mode === "measure" ? (mLen ? `${mLen.toFixed(1)} px · ${mAng.toFixed(1)}°` : "Tap two points to measure") : `${nodes.length} nodes${pathLen ? ` · length ${pathLen.toFixed(0)} px` : ""}`}</T></View>
        <IconBtn icon="arrow-undo" label="Undo" onPress={ed.undo} disabled={!ed.canUndo} testID="vector-undo-button" />
        <IconBtn icon="checkmark-done" label="Finish path" onPress={finish} disabled={nodes.length < 2} testID="vector-finish-button" />
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pr.panHandlers} testID="vector-canvas-area">
        <View pointerEvents="none" style={{ position: "absolute", left, top }}>
          <CanvasView page={editId ? { ...ed.page, layers: ed.page.layers.filter((l) => l.id !== editId) } : ed.page} W={W} H={H} width={dw} />
          <Svg style={{ position: "absolute" }} width={dw} height={dh} viewBox={`0 0 ${W} ${H}`}>
            {iso ? Array.from({ length: 30 }).map((_, i) => <G key={i}><Line x1={(i - 10) * (W / 10)} y1={0} x2={(i - 10) * (W / 10) + H * 1.732} y2={H} stroke={colors.info} strokeOpacity={0.2} strokeWidth={1 / scale} /><Line x1={(i - 10) * (W / 10)} y1={H} x2={(i - 10) * (W / 10) + H * 1.732} y2={0} stroke={colors.info} strokeOpacity={0.2} strokeWidth={1 / scale} /></G>) : null}
            {nodes.length > 1 ? <Path d={splinePath(nodes, closed, smooth)} stroke={colors.brandPrimary} strokeWidth={stroke} fill={fill && closed ? "#FF5E00" : "none"} fillOpacity={0.4} /> : null}
            {nodes.map((n, i) => <Circle key={i} cx={n.x} cy={n.y} r={9 / scale} fill={i === 0 ? colors.brandPrimary : "#FFFFFF"} stroke={colors.brandPrimary} strokeWidth={2.5 / scale} />)}
            {measure.length ? <G>{measure.map((m, i) => <Circle key={i} cx={m.x} cy={m.y} r={7 / scale} fill={colors.error} />)}{measure.length === 2 ? <><Line x1={measure[0].x} y1={measure[0].y} x2={measure[1].x} y2={measure[1].y} stroke={colors.error} strokeWidth={2 / scale} /><SvgText x={(measure[0].x + measure[1].x) / 2} y={(measure[0].y + measure[1].y) / 2 - 10 / scale} fontSize={16 / scale} fill={colors.error} textAnchor="middle">{`${mLen.toFixed(0)}px ${mAng.toFixed(0)}°`}</SvgText></> : null}</G> : null}
          </Svg>
        </View>
      </View>
      <View style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: insets.bottom + 6, maxHeight: 280 }}>
        <ScrollView>
          <ChipRow>
            {(["pen", "edit", "measure"] as Mode[]).map((m) => <Chip key={m} label={m === "pen" ? "Pen" : m === "edit" ? "Edit nodes" : "Measure"} active={mode === m} onPress={() => setMode(m)} testID={`vector-mode-${m}`} />)}
            <Chip label={smooth ? "Curves" : "Corners"} active={smooth} onPress={() => setSmooth(!smooth)} testID="vector-smooth-toggle" />
            <Chip label={closed ? "Closed" : "Open"} active={closed} onPress={() => setClosed(!closed)} testID="vector-closed-toggle" />
            <Chip label="Fill" active={fill} onPress={() => setFill(!fill)} testID="vector-fill-toggle" />
            <Chip label="Remove last node" onPress={() => setNodes(nodes.slice(0, -1))} testID="vector-remove-node" />
            <Chip label="Simplify" onPress={() => setNodes(simplify(nodes, 6))} testID="vector-simplify" />
            <Chip label="Clear" onPress={() => { setNodes([]); setEditId(null); }} testID="vector-clear" />
            {mode === "measure" && mLen ? <Chip icon="add" label="Keep measurement" onPress={() => { ed.commit("Measure", (ls) => [...ls, newLayer("measure", { x: measure[0].x, y: measure[0].y - 15, w: mLen, h: 30, rotation: mAng })]); setMeasure([]); }} testID="vector-keep-measure" /> : null}
          </ChipRow>
          <Slider label="Stroke width" value={stroke} min={1} max={60} onChange={setStroke} testID="vector-stroke-slider" />
          {paths.length ? <><T v="label" style={{ paddingHorizontal: spacing.md }}>Paths on this page (tap to edit nodes)</T><ChipRow>{paths.map((l) => <Chip key={l.id} label={l.name} active={editId === l.id} onPress={() => editPath(l)} testID={`vector-path-${l.id}`} />)}</ChipRow></> : null}
          <Slider label="Offset distance" value={offset} min={2} max={200} onChange={setOffset} testID="vector-offset-slider" />
          <ChipRow>
            <Chip icon="expand" label="Outer offset" onPress={() => offsetSel(1)} testID="vector-offset-outer" />
            <Chip icon="contract" label="Inner offset" onPress={() => offsetSel(-1)} testID="vector-offset-inner" />
            {["spiral", "rose", "wave", "gear"].map((k) => <Chip key={k} icon="flower" label={k} onPress={() => proc(k)} testID={`vector-generate-${k}`} />)}
            <Chip icon="grid" label="Isometric grid" active={iso} onPress={() => setIso(!iso)} testID="vector-iso-toggle" />
            <Chip icon="download" label="Import SVG" onPress={importSVG} testID="vector-import-svg" />
            <Chip icon="share" label="Export SVG" onPress={() => router.push(`/export/${p.id}`)} testID="vector-export-svg" />
          </ChipRow>
        </ScrollView>
      </View>
    </View>
  );
}

export default withProject(Vector);
