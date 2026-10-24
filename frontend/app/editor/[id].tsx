import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Line, Rect } from "react-native-svg";
import { CanvasView } from "@/src/components/CanvasView";
import { Chip, Empty, IconBtn, T, Tool, Btn } from "@/src/components/ui";
import { AddPanel, ArrangePanel, EditPanel, LayersPanel, PagePanel } from "@/src/editor/Panels";
import { useEditor } from "@/src/editor/useEditor";
import { pointInLayer, textBlockHeight } from "@/src/engine/geometry";
import { confirmAsk, getProject, promptText, saveProject, toast, uid, useStore } from "@/src/engine/store";
import type { Layer } from "@/src/engine/types";
import { fonts, radius, spacing, useTheme } from "@/src/theme";
import { withProject } from "@/src/components/ProjectGate";

type Mode = "select" | "marquee" | "annotate" | "eyedrop";
type Tab = "add" | "layers" | "edit" | "arrange" | "page" | "tools" | null;

function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ed = useEditor(id!); const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme(); const { settings } = useStore();
  const [area, setArea] = useState({ w: 1, h: 1 }); const origin = useRef({ x: 0, y: 0 }); const areaRef = useRef<any>(null);
  const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>("select"); const [tab, setTab] = useState<Tab>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] }); const [marquee, setMarquee] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const [showAnn, setShowAnn] = useState(true); const [cvdMode, setCvd] = useState<string | null>(null); const [grid, setGrid] = useState(settings.showGrid);
  const p = ed.project;
  const W = p?.width ?? 1, H = p?.height ?? 1;
  const fit = Math.min((area.w - 32) / W, (area.h - 32) / H); const scale = Math.max(0.01, fit * zoom);
  const dw = W * scale, dh = H * scale; const left = (area.w - dw) / 2 + pan.x, top = (area.h - dh) / 2 + pan.y;

  const S = useRef<any>({}); S.current = { ed, scale, left, top, zoom, pan, mode, W, H, snapping: settings.snapping };
  const g = useRef<any>(null);
  const toC = (px: number, py: number) => { const s = S.current; return { x: (px - origin.current.x - s.left) / s.scale, y: (py - origin.current.y - s.top) / s.scale }; };
  const hb = (l: Layer) => (l.type === "text" && !l.curve ? Math.max(l.h, textBlockHeight(l)) : l.h);

  const pr = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const s = S.current; const ts = e.nativeEvent.touches; const layers: Layer[] = s.ed.page.layers;
      const sel = layers.filter((l) => s.ed.selected.includes(l.id));
      if (ts.length >= 2) { g.current = pinchStart(ts, sel, s); return; }
      const pt = toC(e.nativeEvent.pageX, e.nativeEvent.pageY);
      g.current = { kind: "tap", start: pt, sx: e.nativeEvent.pageX, sy: e.nativeEvent.pageY, moved: false };
      if (s.mode === "annotate" || s.mode === "eyedrop") return;
      if (sel.length === 1 && !sel[0].locked) {
        const l = sel[0]; const r = (l.rotation * Math.PI) / 180; const cx = l.x + l.w / 2, cy = l.y + hb(l) / 2;
        const rot = (dx: number, dy: number) => ({ x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) });
        const corner = rot(l.w / 2, hb(l) / 2), rh = rot(0, -hb(l) / 2 - 36 / s.scale); const tol = 26 / s.scale;
        if (Math.hypot(pt.x - corner.x, pt.y - corner.y) < tol) { g.current = { ...g.current, kind: "resize", l0: { ...l } }; return; }
        if (Math.hypot(pt.x - rh.x, pt.y - rh.y) < tol) { g.current = { ...g.current, kind: "rotate", l0: { ...l } }; return; }
      }
      if (s.mode === "marquee") { g.current = { ...g.current, kind: "marquee" }; return; }
      const hit = [...layers].reverse().find((l) => l.visible && !l.locked && pointInLayer({ ...l, h: hb(l) }, pt.x, pt.y, 6 / s.scale));
      if (hit) {
        let ids: string[] = s.ed.selected.includes(hit.id) ? s.ed.selected : [hit.id];
        if (hit.groupId) ids = Array.from(new Set([...ids, ...layers.filter((l) => l.groupId === hit.groupId).map((l) => l.id)]));
        if (ids.join() !== s.ed.selected.join()) s.ed.setSelected(ids);
        g.current = { ...g.current, kind: "move", hit: hit.id, wasSelected: s.ed.selected.includes(hit.id), ids, l0: layers.filter((l) => ids.includes(l.id)).map((l) => ({ ...l })) };
      } else g.current = { ...g.current, kind: "pan", pan0: { ...s.pan } };
    },
    onPanResponderMove: (e, gs) => {
      const s = S.current; const c = g.current; if (!c) return; const ts = e.nativeEvent.touches;
      if (ts.length >= 2 && c.kind !== "pinch") { g.current = pinchStart(ts, s.ed.page.layers.filter((l: Layer) => s.ed.selected.includes(l.id)), s); return; }
      if (Math.abs(gs.dx) + Math.abs(gs.dy) > 4) c.moved = true;
      const dx = gs.dx / s.scale, dy = gs.dy / s.scale;
      if (c.kind === "pinch") {
        if (ts.length < 2) return;
        const d = Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY); const ratio = d / c.d0;
        const ang = (Math.atan2(ts[1].pageY - ts[0].pageY, ts[1].pageX - ts[0].pageX) * 180) / Math.PI - c.a0;
        if (c.l0.length) s.ed.live((ls: Layer[]) => ls.map((l) => { const o = c.l0.find((x: Layer) => x.id === l.id); if (!o) return l; const w = o.w * ratio, h = o.h * ratio; return { ...l, w, h, x: o.x + (o.w - w) / 2, y: o.y + (o.h - h) / 2, rotation: c.l0.length === 1 ? o.rotation + ang : o.rotation, fontSize: o.fontSize ? o.fontSize * ratio : o.fontSize }; }));
        else { setZoom(Math.max(0.2, Math.min(8, c.z0 * ratio))); const mx = (ts[0].pageX + ts[1].pageX) / 2, my = (ts[0].pageY + ts[1].pageY) / 2; setPan({ x: c.pan0.x + mx - c.mx, y: c.pan0.y + my - c.my }); }
        return;
      }
      if (c.kind === "move") {
        const b0 = { x: Math.min(...c.l0.map((l: Layer) => l.x)), y: Math.min(...c.l0.map((l: Layer) => l.y)), r: Math.max(...c.l0.map((l: Layer) => l.x + l.w)), b: Math.max(...c.l0.map((l: Layer) => l.y + hb(l))) };
        let ox = dx, oy = dy; const gv: number[] = [], gh: number[] = [];
        if (s.snapping) {
          const others = s.ed.page.layers.filter((l: Layer) => !c.ids.includes(l.id) && l.visible);
          const xs = [0, s.W / 2, s.W, ...others.flatMap((l: Layer) => [l.x, l.x + l.w / 2, l.x + l.w])], ys = [0, s.H / 2, s.H, ...others.flatMap((l: Layer) => [l.y, l.y + hb(l) / 2, l.y + hb(l)])];
          const thr = 8 / s.scale;
          const snap = (vals: number[], cands: number[], out: number[]) => { for (const v of vals) for (const t of cands) if (Math.abs(v - t) < thr) { out.push(t); return t - v; } return 0; };
          const w = b0.r - b0.x, h = b0.b - b0.y;
          ox += snap([b0.x + dx, b0.x + dx + w / 2, b0.x + dx + w], xs, gv); oy += snap([b0.y + dy, b0.y + dy + h / 2, b0.y + dy + h], ys, gh);
        }
        setGuides({ v: gv, h: gh });
        s.ed.live((ls: Layer[]) => ls.map((l) => { const o = c.l0.find((x: Layer) => x.id === l.id); return o ? { ...l, x: o.x + ox, y: o.y + oy } : l; }));
      } else if (c.kind === "resize") {
        const o = c.l0; const r = (-o.rotation * Math.PI) / 180; let lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
        if (o.type === "image" || o.type === "qr") { const k = Math.max((o.w + lx) / o.w, (o.h + ly) / o.h); lx = o.w * k - o.w; ly = o.h * k - o.h; }
        const w = Math.max(8, o.w + lx), h = Math.max(8, o.h + ly); const rr = (o.rotation * Math.PI) / 180; const sx = (w - o.w) / 2, sy = (h - o.h) / 2;
        const cx = o.x + o.w / 2 + sx * Math.cos(rr) - sy * Math.sin(rr), cy = o.y + o.h / 2 + sx * Math.sin(rr) + sy * Math.cos(rr);
        s.ed.live((ls: Layer[]) => ls.map((l) => (l.id === o.id ? { ...l, w, h: o.type === "text" ? o.h : h, x: cx - w / 2, y: cy - (o.type === "text" ? o.h : h) / 2 } : l)));
      } else if (c.kind === "rotate") {
        const o = c.l0; const pt = toC(e.nativeEvent.pageX, e.nativeEvent.pageY); let a = (Math.atan2(pt.y - (o.y + hb(o) / 2), pt.x - (o.x + o.w / 2)) * 180) / Math.PI + 90;
        if (a > 180) a -= 360; const sn = Math.round(a / 15) * 15; if (Math.abs(a - sn) < 3) a = sn;
        s.ed.live((ls: Layer[]) => ls.map((l) => (l.id === o.id ? { ...l, rotation: Math.round(a) } : l)));
      } else if (c.kind === "pan") setPan({ x: c.pan0.x + gs.dx, y: c.pan0.y + gs.dy });
      else if (c.kind === "marquee") setMarquee({ x: Math.min(c.start.x, c.start.x + dx), y: Math.min(c.start.y, c.start.y + dy), w: Math.abs(dx), h: Math.abs(dy) });
    },
    onPanResponderRelease: () => {
      const s = S.current; const c = g.current; g.current = null; setGuides({ v: [], h: [] }); if (!c) return;
      if (c.kind === "pinch" && c.l0?.length) return s.ed.commit("Pinch transform");
      if (c.kind === "move" && c.moved) return s.ed.commit("Move");
      if (c.kind === "resize" && c.moved) return s.ed.commit("Resize");
      if (c.kind === "rotate" && c.moved) return s.ed.commit("Rotate");
      if (c.kind === "marquee") { setMarquee(null); const m = { x: Math.min(c.start.x, c.start.x), y: 0 }; void m; const r = marqueeRef.current; if (r) s.ed.setSelected(s.ed.page.layers.filter((l: Layer) => l.visible && !l.locked && l.x < r.x + r.w && l.x + l.w > r.x && l.y < r.y + r.h && l.y + l.h > r.y).map((l: Layer) => l.id)); return; }
      if (!c.moved) {
        if (s.mode === "annotate") return addAnnotation(c.start);
        if (s.mode === "eyedrop") { const hit = [...s.ed.page.layers].reverse().find((l: Layer) => l.visible && pointInLayer(l, c.start.x, c.start.y)); const color = hit?.fill ?? s.ed.page.background; if (!s.ed.selected.length) return toast(`Colour ${color}`); s.ed.commit("Eyedropper", (ls: Layer[]) => ls.map((l) => (s.ed.selected.includes(l.id) ? { ...l, fill: color } : l))); toast(`Applied ${color}`, "success"); setMode("select"); return; }
        if (c.kind === "pan") s.ed.setSelected([]);
        if (c.kind === "move" && c.wasSelected) setTab("edit");
      }
    },
  }), []);
  const marqueeRef = useRef(marquee); marqueeRef.current = marquee;

  function pinchStart(ts: any, sel: Layer[], s: any) {
    return { kind: "pinch", d0: Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY) || 1, a0: (Math.atan2(ts[1].pageY - ts[0].pageY, ts[1].pageX - ts[0].pageX) * 180) / Math.PI, l0: sel.filter((l) => !l.locked).map((l) => ({ ...l })), z0: s.zoom, pan0: { ...s.pan }, mx: (ts[0].pageX + ts[1].pageX) / 2, my: (ts[0].pageY + ts[1].pageY) / 2, moved: true };
  }
  async function addAnnotation(pt: { x: number; y: number }) {
    const text = await promptText("Add a comment", "", { placeholder: "Revision note…", multiline: true }); if (!text) return;
    const s = S.current; const target = [...s.ed.page.layers].reverse().find((l: Layer) => pointInLayer(l, pt.x, pt.y));
    s.ed.setAllPages("Add comment", s.ed.pages.map((pg: any, i: number) => (i === s.ed.pageIndex ? { ...pg, annotations: [...(pg.annotations ?? []), { id: uid(), x: pt.x, y: pt.y, text, color: "#FF5E00", resolved: false, layerId: target?.id }] } : pg)));
    toast("Comment pinned · hidden from exports by default", "success");
  }
  const back = async () => {
    if (ed.dirty && !(await confirmAsk({ title: "Unsaved changes", message: "Autosave is off. Save before leaving?", confirmLabel: "Save & leave" }))) return router.back();
    if (ed.dirty) await ed.saveNow(); router.back();
  };
  const parent = p?.parentId ? getProject(p.parentId) : null;
  const opts = useMemo(() => ({ annotations: showAnn, cvdMode }), [showAnn, cvdMode]);

  if (!p || !ed.page) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top + 40 }}><Empty icon="alert-circle" title="Project not found" text="It may have been deleted." action={<Btn label="Go back" onPress={() => router.back()} />} /></View>;
  const tabs: [Exclude<Tab, null>, string, any][] = [["add", "Add", "add-circle"], ["layers", "Layers", "layers"], ["edit", "Edit", "options"], ["arrange", "Arrange", "grid"], ["page", "Page", "document"], ["tools", "Tools", "construct"]];
  const s1 = ed.sel.length === 1 ? ed.sel[0] : null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvasBg }} testID="editor-screen">
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", backgroundColor: colors.glassStrong, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <IconBtn icon="chevron-back" label="Back" onPress={back} testID="editor-back-button" />
        <Pressable style={{ flex: 1 }} onPress={async () => { const n = await promptText("Rename project", p.name); if (n?.trim()) ed.setMeta({ name: n.trim() }); }} testID="editor-title">
          <T v="h3" numberOfLines={1}>{p.name}</T>
          <T v="muted" numberOfLines={1} style={{ fontSize: 11 }}>{ed.dirty ? "Unsaved" : "Saved on device"} · {W}×{H} · page {ed.pageIndex + 1}/{ed.pages.length}</T>
        </Pressable>
        <IconBtn icon="arrow-undo" label={`Undo ${ed.undoLabel ?? ""}`} onPress={ed.undo} disabled={!ed.canUndo} testID="editor-undo-button" />
        <IconBtn icon="arrow-redo" label="Redo" onPress={ed.redo} disabled={!ed.canRedo} testID="editor-redo-button" />
        {ed.dirty ? <IconBtn icon="save" label="Save" onPress={ed.saveNow} testID="editor-save-button" /> : null}
        <IconBtn icon="share-outline" label="Export" onPress={() => router.push(`/export/${p.id}`)} testID="editor-export-button" />
      </View>
      {parent ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8, paddingHorizontal: spacing.md, backgroundColor: colors.brandTertiary }} testID="experiment-banner">
          <Ionicons name="flask" size={16} color={colors.onBrandTertiary} /><T v="small" style={{ flex: 1, color: colors.onBrandTertiary }}>Experiment of “{parent.name}”. The original is untouched.</T>
          <Btn small label="Merge back" onPress={async () => { if (await confirmAsk({ title: "Replace original with this experiment?", message: `“${parent.name}” will get these pages. A snapshot of the original is saved first.`, confirmLabel: "Merge" })) { saveProject({ ...parent, snapshots: [{ id: uid(), name: "Before experiment merge", createdAt: Date.now(), pages: parent.pages, width: parent.width, height: parent.height }, ...parent.snapshots], pages: ed.pages, width: W, height: H }, { immediate: true }); toast("Merged into original", "success"); } }} testID="experiment-merge-button" />
        </View>
      ) : null}
      <View style={{ flex: 1, overflow: "hidden" }} ref={areaRef} onLayout={(e) => { setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }); areaRef.current?.measureInWindow((x: number, y: number) => { origin.current = { x, y }; }); }} {...pr.panHandlers} testID="editor-canvas-area">
        <View pointerEvents="none" style={{ position: "absolute", left, top, width: dw, height: dh, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, elevation: 6, backgroundColor: ed.page.background }}>
          <CanvasView page={ed.page} W={W} H={H} width={dw} opts={opts} testID="editor-canvas" />
        </View>
        <Svg pointerEvents="none" style={{ position: "absolute", left, top }} width={dw} height={dh} viewBox={`0 0 ${W} ${H}`}>
          {grid ? Array.from({ length: 11 }).map((_, i) => <G key={i}><Line x1={(W * i) / 10} y1={0} x2={(W * i) / 10} y2={H} stroke={colors.info} strokeOpacity={0.25} strokeWidth={1 / scale} /><Line x1={0} y1={(H * i) / 10} x2={W} y2={(H * i) / 10} stroke={colors.info} strokeOpacity={0.25} strokeWidth={1 / scale} /></G>) : null}
          {grid ? <Rect x={W * 0.05} y={H * 0.05} width={W * 0.9} height={H * 0.9} fill="none" stroke={colors.error} strokeOpacity={0.6} strokeDasharray={`${8 / scale} ${6 / scale}`} strokeWidth={1.5 / scale} /> : null}
          {guides.v.map((x, i) => <Line key={"v" + i} x1={x} y1={0} x2={x} y2={H} stroke="#FF00AA" strokeWidth={1.5 / scale} />)}
          {guides.h.map((y, i) => <Line key={"h" + i} x1={0} y1={y} x2={W} y2={y} stroke="#FF00AA" strokeWidth={1.5 / scale} />)}
          {ed.sel.map((l) => { const h = hb(l); return (
            <G key={l.id} transform={`translate(${l.x + l.w / 2} ${l.y + h / 2}) rotate(${l.rotation}) translate(${-l.w / 2} ${-h / 2})`}>
              <Rect x={0} y={0} width={l.w} height={h} fill="none" stroke={l.locked ? colors.muted : colors.brandPrimary} strokeWidth={2 / scale} strokeDasharray={l.locked ? `${6 / scale} ${4 / scale}` : undefined} />
              {s1 && !l.locked ? <><Line x1={l.w / 2} y1={0} x2={l.w / 2} y2={-36 / scale} stroke={colors.brandPrimary} strokeWidth={2 / scale} /><Circle cx={l.w / 2} cy={-36 / scale} r={10 / scale} fill="#FFFFFF" stroke={colors.brandPrimary} strokeWidth={2.5 / scale} /><Rect x={l.w - 10 / scale} y={h - 10 / scale} width={20 / scale} height={20 / scale} rx={5 / scale} fill={colors.brandPrimary} stroke="#FFFFFF" strokeWidth={2 / scale} /></> : null}
            </G>); })}
          {marquee ? <Rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill={colors.brandPrimary} fillOpacity={0.1} stroke={colors.brandPrimary} strokeWidth={1.5 / scale} /> : null}
        </Svg>
        <View style={{ position: "absolute", right: 10, top: 10, gap: 6 }}>
          <View style={{ backgroundColor: colors.glassStrong, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border }}>
            <IconBtn icon="hand-left" label="Select / move" active={mode === "select"} onPress={() => setMode("select")} testID="mode-select" />
            <IconBtn icon="scan" label="Marquee select" active={mode === "marquee"} onPress={() => setMode(mode === "marquee" ? "select" : "marquee")} testID="mode-marquee" />
            <IconBtn icon="chatbubble-ellipses" label="Annotate" active={mode === "annotate"} onPress={() => setMode(mode === "annotate" ? "select" : "annotate")} testID="mode-annotate" />
            <IconBtn icon="color-filter" label="Eyedropper" active={mode === "eyedrop"} onPress={() => setMode(mode === "eyedrop" ? "select" : "eyedrop")} testID="mode-eyedrop" />
          </View>
          <View style={{ backgroundColor: colors.glassStrong, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border }}>
            <IconBtn icon="add" label="Zoom in" onPress={() => setZoom((z) => Math.min(8, z * 1.25))} testID="zoom-in" />
            <IconBtn icon="remove" label="Zoom out" onPress={() => setZoom((z) => Math.max(0.2, z / 1.25))} testID="zoom-out" />
            <IconBtn icon="contract" label="Fit to screen" onPress={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} testID="zoom-fit" />
          </View>
        </View>
        <View style={{ position: "absolute", left: 12, bottom: 10, backgroundColor: colors.glassStrong, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}><T v="muted" style={{ fontSize: 11, fontFamily: fonts.semibold }} testID="zoom-level">{Math.round(scale * 100)}%{mode !== "select" ? ` · ${mode}` : ""}</T></View>
        {ed.pages.length > 1 ? (
          <View style={{ position: "absolute", left: 8, top: 10, flexDirection: "row", backgroundColor: colors.glassStrong, borderRadius: radius.lg }}>
            <IconBtn icon="chevron-back" label="Previous page" disabled={ed.pageIndex === 0} onPress={() => { ed.setPageIndex(ed.pageIndex - 1); ed.setSelected([]); }} testID="page-prev" />
            <IconBtn icon="chevron-forward" label="Next page" disabled={ed.pageIndex >= ed.pages.length - 1} onPress={() => { ed.setPageIndex(ed.pageIndex + 1); ed.setSelected([]); }} testID="page-next" />
          </View>
        ) : null}
      </View>
      {s1 || ed.sel.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.glassStrong }} testID="context-suggestions">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {suggestions(ed.sel).map(([label, t]) => <Chip key={label} label={label} icon="sparkles" onPress={() => (t === "lab" ? router.push(`/image-lab?project=${p.id}&page=${ed.pageIndex}&layer=${s1?.id}`) : setTab(t as Tab))} testID={`suggest-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`} />)}
          </ScrollView>
        </View>
      ) : null}
      {tab ? (
        <View style={{ maxHeight: 340, backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.border }} testID={`panel-${tab}`}>
          <View style={{ alignItems: "center", paddingTop: 6 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} /></View>
          <KeyboardAwareScrollView bottomOffset={16} contentContainerStyle={{ paddingVertical: 8 }} keyboardShouldPersistTaps="handled">
            {tab === "add" ? <AddPanel ed={ed} center={() => ({ x: W / 2, y: H / 2 })} /> : null}
            {tab === "layers" ? <LayersPanel ed={ed} /> : null}
            {tab === "edit" ? <EditPanel ed={ed} /> : null}
            {tab === "arrange" ? <ArrangePanel ed={ed} /> : null}
            {tab === "page" ? <PagePanel ed={ed} /> : null}
            {tab === "tools" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 }}>
                <Tool icon="medkit" label="Doctor" onPress={() => router.push(`/doctor/${p.id}?page=${ed.pageIndex}`)} testID="tool-doctor" />
                <Tool icon="time" label="History" onPress={() => router.push(`/history/${p.id}`)} testID="tool-history" />
                <Tool icon="checkbox" label="Checklist" onPress={() => router.push(`/checklist/${p.id}`)} testID="tool-checklist" />
                <Tool icon="play" label="Present" onPress={() => router.push(`/present/${p.id}`)} testID="tool-present" />
                <Tool icon="share" label="Export" onPress={() => router.push(`/export/${p.id}`)} testID="tool-export" />
                <Tool icon="ribbon" label="Brand" onPress={() => router.push(`/brand?project=${p.id}`)} testID="tool-brand" />
                <Tool icon={showAnn ? "chatbubbles" : "chatbubbles-outline"} label={showAnn ? "Hide notes" : "Show notes"} active={showAnn} onPress={() => setShowAnn(!showAnn)} testID="tool-toggle-annotations" />
                <Tool icon="grid-outline" label="Grid & safe" active={grid} onPress={() => setGrid(!grid)} testID="tool-grid" />
                <Tool icon="eye" label={cvdMode ? cvdMode.slice(0, 8) : "Colour vision"} active={!!cvdMode} onPress={() => { const m = [null, "protanopia", "deuteranopia", "tritanopia", "achromatopsia"]; setCvd(m[(m.indexOf(cvdMode) + 1) % m.length]); }} testID="tool-cvd" />
                <Tool icon="terminal" label="Commands" onPress={() => router.push(`/palette?project=${p.id}`)} testID="tool-commands" />
              </View>
            ) : null}
          </KeyboardAwareScrollView>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.glassStrong, paddingBottom: insets.bottom + 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.divider }}>
        {tabs.map(([k, l, i]) => (
          <Pressable key={k} onPress={() => setTab(tab === k ? null : k)} testID={`editor-tab-${k}`} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={{ alignItems: "center", minWidth: 52, paddingVertical: 4 }}>
            <Ionicons name={i} size={22} color={tab === k ? colors.brandPrimary : colors.muted} />
            <T v="muted" style={{ fontSize: 11, color: tab === k ? colors.brandPrimary : colors.muted, fontFamily: fonts.semibold }}>{l}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function suggestions(sel: Layer[]): [string, string][] {
  if (sel.length > 1) return [["Align selection", "arrange"], ["Distribute", "arrange"], ["Group", "edit"]];
  const l = sel[0];
  if (l.type === "text") return [["Font & size", "edit"], ["Curve text", "edit"], ["Add shadow", "edit"], ["Center on page", "arrange"]];
  if (l.type === "image") return [["Adjust in Image Lab", "lab"], ["Round corners", "edit"], ["Fit canvas", "edit"]];
  return [["Fill & gradient", "edit"], ["Align", "arrange"], ["Layers", "layers"]];
}

export default withProject(EditorScreen);
