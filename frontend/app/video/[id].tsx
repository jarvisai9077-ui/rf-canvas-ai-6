import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Btn, Chip, ChipRow, Empty, Header, IconBtn, Input, Section, Slider, T } from "@/src/components/ui";
import { fileName, share, writeText } from "@/src/engine/exporter";
import { pickFiles, pickFromGallery } from "@/src/engine/media";
import { getProject, saveProject, toast, uid } from "@/src/engine/store";
import type { Clip, TextOverlay, Timeline } from "@/src/engine/types";
import { fonts, radius, spacing, useTheme } from "@/src/theme";
import { withProject } from "@/src/components/ProjectGate";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;
const clipLen = (c: Clip) => (c.out - c.in) / c.speed;

// Video Studio: non-destructive edit decision list with real playback of trims, splits, speed, volume and titles.
function VideoStudio() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme(); const { width } = useWindowDimensions();
  const [p, setP] = useState(() => getProject(id!)); const tl: Timeline = p?.timeline ?? { clips: [], audio: [], texts: [], markers: [], aspect: "16:9" };
  const [sel, setSel] = useState<string | null>(null); const [ci, setCi] = useState(0); const [t, setT] = useState(0); const [playing, setPlaying] = useState(false);
  const [past, setPast] = useState<Timeline[]>([]); const [title, setTitle] = useState("");
  const player = useVideoPlayer(null, (pl) => { pl.timeUpdateEventInterval = 0.1; });
  const tlRef = useRef(tl); tlRef.current = tl;
  const update = (next: Timeline, label: string) => { if (!p) return; setPast([...past, tl].slice(-50)); const np = { ...p, timeline: next, log: [{ t: Date.now(), label }, ...p.log] }; setP(np); saveProject(np); };
  const clips = tl.clips; const total = clips.reduce((s, c) => s + clipLen(c), 0);
  const startOf = (i: number) => clips.slice(0, i).reduce((s, c) => s + clipLen(c), 0);
  const cur = clips[ci];
  useEffect(() => { if (!cur) return; player.replace({ uri: cur.uri }); player.currentTime = cur.in; player.playbackRate = cur.speed; player.volume = cur.muted ? 0 : cur.volume; if (playing) player.play(); }, [cur?.id, cur?.uri]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cur) { player.playbackRate = cur.speed; player.volume = cur.muted ? 0 : cur.volume; } }, [cur?.speed, cur?.volume, cur?.muted]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = player.addListener("timeUpdate", ({ currentTime }) => {
      const c = tlRef.current.clips[ci]; if (!c) return;
      setT(startOf(ci) + (currentTime - c.in) / c.speed);
      if (currentTime >= c.out - 0.05) { if (ci < tlRef.current.clips.length - 1) setCi(ci + 1); else { player.pause(); setPlaying(false); } }
    });
    return () => sub.remove();
  }, [ci, clips.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const importVideos = async () => {
    const as = await pickFromGallery("video", true); if (!as.length) return;
    const nc: Clip[] = as.map((a: any) => ({ id: uid(), uri: a.uri, name: a.name, duration: a.duration ?? 10, in: 0, out: a.duration ?? 10, speed: 1, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, kind: "video" }));
    update({ ...tl, clips: [...clips, ...nc] }, "Import video"); toast(`${nc.length} clip(s) added`, "success");
  };
  const importAudio = async () => { const as = await pickFiles(["audio/*"]); if (as.length) update({ ...tl, audio: [...tl.audio, ...as.map((a) => ({ id: uid(), uri: a.uri, name: a.name, duration: 0, in: 0, out: 0, speed: 1, volume: 0.8, muted: false, fadeIn: 1, fadeOut: 1, kind: "audio" as const }))] }, "Import audio"); };
  const sc = clips.find((c) => c.id === sel); const si = clips.findIndex((c) => c.id === sel);
  const setClip = (patch: Partial<Clip>, label: string) => sc && update({ ...tl, clips: clips.map((c) => (c.id === sc.id ? { ...c, ...patch } : c)) }, label);
  const split = () => {
    const i = clips.findIndex((c, k) => t >= startOf(k) && t < startOf(k) + clipLen(c)); if (i < 0) return toast("Move the playhead over a clip");
    const c = clips[i]; const at = c.in + (t - startOf(i)) * c.speed; if (at - c.in < 0.2 || c.out - at < 0.2) return toast("Too close to the clip edge");
    const a = { ...c, out: at }, b = { ...c, id: uid(), in: at }; const n = [...clips]; n.splice(i, 1, a, b); update({ ...tl, clips: n }, "Split clip"); toast("Clip split at playhead", "success");
  };
  const move = (d: number) => { if (si < 0) return; const j = si + d; if (j < 0 || j >= clips.length) return; const n = [...clips]; [n[si], n[j]] = [n[j], n[si]]; update({ ...tl, clips: n }, "Reorder clips"); };
  const seek = (time: number) => { let i = 0; while (i < clips.length - 1 && time >= startOf(i + 1)) i++; setCi(i); const c = clips[i]; if (c) player.currentTime = c.in + (time - startOf(i)) * c.speed; setT(time); };
  const ph = (Math.min(width - 32, 600) * (tl.aspect === "9:16" ? 16 / 9 : tl.aspect === "1:1" ? 1 : 9 / 16));
  const activeTexts = tl.texts.filter((x) => t >= x.start && t <= x.end);
  const gaps = clips.filter((c) => clipLen(c) < 0.5).length;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="video-screen">
      <Header title="Video Studio" subtitle={`${p.name} · ${fmt(total)} · ${clips.length} clips`} onBack={() => router.back()}
        right={<IconBtn icon="arrow-undo" label="Undo" disabled={!past.length} onPress={() => { const l = past[past.length - 1]; setPast(past.slice(0, -1)); const np = { ...p, timeline: l }; setP(np); saveProject(np); }} testID="video-undo-button" />} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={{ margin: spacing.md, height: Math.min(ph, 420), borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000000", alignItems: "center", justifyContent: "center" }} testID="video-preview">
          {clips.length ? <VideoView player={player} style={{ width: "100%", height: "100%" }} nativeControls={false} contentFit="contain" /> : <Empty icon="film" title="No clips yet" text="Import videos from your gallery, camera roll, WhatsApp media or downloads." />}
          {activeTexts.map((x) => <T key={x.id} style={{ position: "absolute", left: `${x.x}%`, top: `${x.y}%`, color: x.color, fontSize: x.size, fontFamily: x.style === "bold" ? fonts.bold : fonts.semibold, textShadowColor: "#000000", textShadowRadius: 6 } as any}>{x.text}</T>)}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md }}>
          <IconBtn icon={playing ? "pause" : "play"} label={playing ? "Pause" : "Play"} disabled={!clips.length} onPress={() => { if (playing) player.pause(); else player.play(); setPlaying(!playing); }} testID="video-play-button" />
          <T style={{ fontFamily: fonts.semibold }} testID="video-time">{fmt(t)} / {fmt(total)}</T>
          <View style={{ flex: 1 }} />
          <IconBtn icon="cut" label="Split at playhead" onPress={split} disabled={!clips.length} testID="video-split-button" />
          <IconBtn icon="bookmark" label="Add marker" onPress={() => update({ ...tl, markers: [...tl.markers, t].sort((a, b) => a - b) }, "Add marker")} testID="video-marker-button" />
        </View>
        {total > 0 ? <Slider label="Playhead" value={t} min={0} max={total} step={0.1} onChange={seek} testID="video-playhead-slider" /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 4 }} testID="video-timeline">
          {clips.map((c, i) => (
            <Pressable key={c.id} onPress={() => { setSel(c.id === sel ? null : c.id); seek(startOf(i)); }} testID={`video-clip-${i}`} style={{ width: Math.max(64, clipLen(c) * 18), height: 56, borderRadius: 10, padding: 6, backgroundColor: c.id === sel ? colors.brandPrimary : colors.brandTertiary, borderWidth: i === ci ? 2 : 0, borderColor: colors.onSurface }}>
              <T numberOfLines={1} style={{ fontSize: 11, color: c.id === sel ? colors.onBrandPrimary : colors.onBrandTertiary, fontFamily: fonts.semibold }}>{c.name}</T>
              <T style={{ fontSize: 10, color: c.id === sel ? colors.onBrandPrimary : colors.onBrandTertiary }}>{fmt(clipLen(c))}{c.speed !== 1 ? ` · ${c.speed}×` : ""}{c.muted ? " · muted" : ""}</T>
            </Pressable>
          ))}
        </ScrollView>
        {tl.audio.length ? <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 4, paddingTop: 4 }}>{tl.audio.map((a) => <View key={a.id} style={{ height: 32, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.surfaceTertiary, justifyContent: "center" }}><T v="small" numberOfLines={1}>♪ {a.name}</T></View>)}</ScrollView> : null}
        {tl.markers.length ? <ChipRow>{tl.markers.map((m, i) => <Chip key={i} icon="bookmark" label={fmt(m)} onPress={() => seek(m)} testID={`video-marker-${i}`} />)}</ChipRow> : null}
        <View style={{ flexDirection: "row", gap: 8, padding: spacing.md, flexWrap: "wrap" }}>
          <Btn small label="Import video" icon="videocam" onPress={importVideos} testID="video-import-button" />
          <Btn small kind="secondary" label="Add audio" icon="musical-notes" onPress={importAudio} testID="video-audio-button" />
          {(["16:9", "9:16", "1:1"] as const).map((a) => <Chip key={a} label={a} active={tl.aspect === a} onPress={() => update({ ...tl, aspect: a }, "Aspect")} testID={`video-aspect-${a.replace(":", "-")}`} />)}
        </View>
        {sc ? (
          <Section title={`Clip: ${sc.name}`}>
            <Slider label={`Trim in (${fmt(sc.in)})`} value={sc.in} min={0} max={Math.max(0.1, sc.out - 0.2)} step={0.1} onChange={(v) => setClip({ in: v }, "Trim in")} testID="video-trim-in-slider" />
            <Slider label={`Trim out (${fmt(sc.out)})`} value={sc.out} min={sc.in + 0.2} max={sc.duration} step={0.1} onChange={(v) => setClip({ out: v }, "Trim out")} testID="video-trim-out-slider" />
            <Slider label="Volume" value={sc.volume * 100} min={0} max={100} onChange={(v) => setClip({ volume: v / 100 }, "Volume")} testID="video-volume-slider" />
            <ChipRow>
              {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => <Chip key={s} label={`${s}×`} active={sc.speed === s} onPress={() => setClip({ speed: s }, "Speed")} testID={`video-speed-${s}`} />)}
              <Chip icon={sc.muted ? "volume-mute" : "volume-high"} label={sc.muted ? "Muted" : "Sound on"} active={sc.muted} onPress={() => setClip({ muted: !sc.muted }, "Mute")} testID="video-mute-toggle" />
              <Chip icon="copy" label="Duplicate" onPress={() => { const n = [...clips]; n.splice(si + 1, 0, { ...sc, id: uid() }); update({ ...tl, clips: n }, "Duplicate clip"); }} testID="video-duplicate-clip" />
              <Chip icon="arrow-back" label="Move left" onPress={() => move(-1)} testID="video-move-left" />
              <Chip icon="arrow-forward" label="Move right" onPress={() => move(1)} testID="video-move-right" />
              <Chip icon="trash" label="Delete (ripple)" onPress={() => { update({ ...tl, clips: clips.filter((c) => c.id !== sc.id) }, "Delete clip"); setSel(null); setCi(0); }} testID="video-delete-clip" />
            </ChipRow>
          </Section>
        ) : null}
        <Section title="Titles & subtitles">
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: spacing.md, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}><Input value={title} onChangeText={setTitle} placeholder="Title text at playhead" testID="video-title-input" /></View>
            <Btn label="Add" onPress={() => { if (!title.trim()) return; const x: TextOverlay = { id: uid(), text: title.trim(), start: t, end: Math.min(total || t + 3, t + 3), x: 8, y: 80, size: 22, color: "#FFFFFF", style: "bold" }; update({ ...tl, texts: [...tl.texts, x] }, "Add title"); setTitle(""); }} testID="video-title-add" />
          </View>
          {tl.texts.map((x) => (
            <View key={x.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingTop: 8 }}>
              <T style={{ flex: 1 }} numberOfLines={1}>{x.text}</T><T v="muted">{fmt(x.start)}–{fmt(x.end)}</T>
              <Chip label={x.y > 50 ? "Bottom" : "Top"} onPress={() => update({ ...tl, texts: tl.texts.map((y) => (y.id === x.id ? { ...y, y: x.y > 50 ? 8 : 80 } : y)) }, "Title position")} testID={`video-title-pos-${x.id}`} />
              <IconBtn icon="trash" label="Delete title" onPress={() => update({ ...tl, texts: tl.texts.filter((y) => y.id !== x.id) }, "Delete title")} testID={`video-title-delete-${x.id}`} />
            </View>
          ))}
        </Section>
        <Section title="Continuity check">
          <View style={{ paddingHorizontal: spacing.md, gap: 4 }} testID="video-continuity">
            <T v="small">{gaps ? `${gaps} clip(s) shorter than 0.5 s (possible flash frames).` : "No flash frames under 0.5 s."}</T>
            <T v="small">{tl.texts.filter((x) => x.end > total).length ? "Some titles extend past the end of the timeline." : "All titles sit within the timeline."}</T>
          </View>
        </Section>
        <Section title="Export">
          <View style={{ paddingHorizontal: spacing.md, gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Badge text="Limitation" tone="warning" /><T v="small" style={{ flex: 1 }}>MP4 rendering needs an on-device encoder that this build does not include, so no video file is produced. You can export the edit decision list.</T></View>
            <Btn kind="secondary" label="Export edit decision list (JSON)" icon="document" onPress={async () => { const r = await writeText(p, JSON.stringify({ app: "RF Canvas", type: "edl", aspect: tl.aspect, duration: total, clips: clips.map((c) => ({ name: c.name, in: c.in, out: c.out, speed: c.speed, volume: c.muted ? 0 : c.volume })), titles: tl.texts, markers: tl.markers }, null, 2), "json", fileName("{name}_edl_{date}", p, "json")); toast(r.message, r.valid ? "success" : "error"); if (r.valid && r.uri.startsWith("file")) await share(r.uri).catch(() => toast("Sharing failed", "error")); }} testID="video-export-edl" />
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

export default withProject(VideoStudio);
