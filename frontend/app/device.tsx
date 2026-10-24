import * as Device from "expo-device";
import * as FS from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, ScrollView, useWindowDimensions, View, PixelRatio } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Btn, Card, Header, Row, Section, T } from "@/src/components/ui";
import { dirSize } from "@/src/engine/exporter";
import { confirmAsk, toast, updateSettings } from "@/src/engine/store";
import { spacing } from "@/src/theme";

const mb = (b: number) => `${(b / 1e6).toFixed(0)} MB`; const gb = (b: number) => `${(b / 1e9).toFixed(1)} GB`;

// Device Capability Test + storage budget + cache controls.
export default function DeviceTest() {
  const router = useRouter(); const insets = useSafeAreaInsets(); const { width, height } = useWindowDimensions();
  const [info, setInfo] = useState<any>(null);
  const run = async () => {
    try {
      // Let the screen paint first; the benchmark runs right after the first frame.
      await new Promise((r) => setTimeout(r, 0));
      const t0 = Date.now(); let x = 0; for (let i = 0; i < 3e6; i++) x += Math.sqrt(i); const cpuMs = Date.now() - t0; void x;
      const free = Platform.OS === "web" ? null : await FS.getFreeDiskStorageAsync().catch(() => null);
      const total = Platform.OS === "web" ? null : await FS.getTotalDiskCapacityAsync().catch(() => null);
      const docs = await dirSize(FS.documentDirectory); const cache = await dirSize(FS.cacheDirectory);
      const ram = Device.totalMemory ?? null;
      const profile = ram === null ? (cpuMs < 60 ? "balanced" : "low") : ram < 4.2e9 ? "low" : ram < 6.5e9 ? "balanced" : "high";
      setInfo({ ram, free, total, docs, cache, cpuMs, profile });
    } catch (e: any) {
      toast(e?.message ? `Device test failed: ${e.message}` : "Device test failed", "error");
      setInfo((i: any) => i ?? { ram: Device.totalMemory ?? null, free: null, total: null, docs: 0, cache: 0, cpuMs: 0, profile: "balanced" });
    }
  };
  useEffect(() => { run(); }, []);
  const p = info?.profile as "low" | "balanced" | "high" | undefined;
  return (
    <View style={{ flex: 1 }} testID="device-screen">
      <Header title="Device capability test" subtitle="Measured on this device" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Section title="Hardware">
          <Card>
            <Row title="Device" subtitle={`${Device.manufacturer ?? "Unknown"} ${Device.modelName ?? ""} · ${Device.osName ?? Platform.OS} ${Device.osVersion ?? ""}`} />
            <Row title="Memory (RAM)" subtitle={info?.ram ? gb(info.ram) : "Not reported on this platform"} testID="device-ram" />
            <Row title="Screen" subtitle={`${Math.round(width)}×${Math.round(height)} pt @${PixelRatio.get()}x`} />
            <Row title="CPU benchmark" subtitle={info ? `${info.cpuMs} ms for 3M square roots (lower is faster)` : "Running…"} testID="device-cpu" />
            <Row title="Thermal state" subtitle="Not exposed to apps by this runtime — processing is not throttled automatically." />
            <Row title="Image formats" subtitle="Import: JPEG, PNG, WebP, HEIC (via system picker). Export: PNG, JPEG, SVG, PDF." />
            <Row title="Video" subtitle="Playback via system decoder (H.264/HEVC as supported by the device). MP4 export not available in this build." />
          </Card>
        </Section>
        <Section title="Storage">
          <Card>
            <Row title="Free space" subtitle={info?.free ? `${gb(info.free)} of ${info.total ? gb(info.total) : "?"}` : "Not available on web"} testID="device-free" />
            <Row title="RF Canvas projects & assets" subtitle={info ? mb(info.docs) : "…"} />
            <Row title="Temporary cache" subtitle={info ? mb(info.cache) : "…"} right={<Btn small kind="secondary" label="Clear" onPress={async () => {
              if (!(await confirmAsk({ title: "Clear temporary cache?", message: "Only temporary files are removed. Projects, assets and exports are not touched.", confirmLabel: "Clear" }))) return;
              const dir = FS.cacheDirectory; if (dir) for (const f of await FS.readDirectoryAsync(dir).catch(() => [] as string[])) await FS.deleteAsync(dir + f, { idempotent: true }).catch(() => {});
              toast("Cache cleared", "success"); run();
            }} testID="device-clear-cache" />} />
          </Card>
        </Section>
        {p ? (
          <Section title="Recommendation">
            <Card style={{ padding: spacing.md, gap: 6 }} testID="device-recommendation">
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><T v="h3">Profile:</T><Badge text={p === "low" ? "Entry-level" : p === "balanced" ? "Mid-range" : "High-memory"} tone={p === "low" ? "warning" : "success"} /></View>
              <T v="small">{p === "low" ? "Use Low preview quality, keep images under 12 MP, export pages one at a time and prefer 1× PNG/JPEG." : p === "balanced" ? "Balanced preview; up to 2× raster exports and multi-page PDFs are fine." : "High preview quality; 3× raster exports and large multi-page documents are fine."}</T>
              <Btn small label="Apply recommended preview quality" onPress={() => { updateSettings({ previewQuality: p }); toast("Preview quality updated", "success"); }} testID="device-apply-profile" />
            </Card>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}
