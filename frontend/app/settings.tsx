import * as FS from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, Platform, ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Chip, ChipRow, Header, Row, Section, T } from "@/src/components/ui";
import { exportDir, share } from "@/src/engine/exporter";
import { pickTextFile } from "@/src/engine/media";
import { buildBackup, restoreBackup, toast, updateSettings, useStore } from "@/src/engine/store";
import { spacing, useTheme } from "@/src/theme";

export default function Settings() {
  const router = useRouter(); const insets = useSafeAreaInsets(); const { colors } = useTheme(); const { settings, projects, assets } = useStore();
  const sw = (k: "autosave" | "snapping" | "showGrid", label: string, sub: string) => <Row title={label} subtitle={sub} right={<Switch value={settings[k]} onValueChange={(v) => updateSettings({ [k]: v })} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} testID={`settings-${k}-switch`} />} />;
  const backup = async () => {
    try {
      const json = buildBackup(); const name = `rf-canvas-backup-${Date.now()}.json`;
      if (Platform.OS === "web") { const a = (globalThis as any).document.createElement("a"); a.href = URL.createObjectURL(new Blob([json], { type: "application/json" })); a.download = name; a.click(); toast("Backup downloaded", "success"); return; }
      await FS.makeDirectoryAsync(exportDir(), { intermediates: true }).catch(() => {}); const uri = exportDir() + name; await FS.writeAsStringAsync(uri, json);
      let ok = false; try { ok = JSON.parse(await FS.readAsStringAsync(uri)).projects.length === projects.length; } catch { ok = false; }
      toast(ok ? `Backup verified · ${projects.length} projects` : "Backup verification failed. Please try again.", ok ? "success" : "error");
      if (ok) await share(uri).catch(() => toast("Backup saved, but sharing isn't available", "info"));
    } catch (e: any) { toast(e?.message ? `Backup failed: ${e.message}` : "Backup failed. Free up storage and try again.", "error"); }
  };
  const restore = async () => {
    const f = await pickTextFile(["application/json", "*/*"]); if (!f) return;
    try { const r = await restoreBackup(f.text); toast(`Restored ${r.added} project(s)${r.skipped ? `, skipped ${r.skipped} invalid` : ""}`, "success"); } catch (e: any) { toast(e?.message ?? "Invalid backup", "error"); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="settings-screen">
      <Header title="Settings" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Section title="Appearance"><ChipRow>{(["system", "light", "dark"] as const).map((t) => <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} active={settings.theme === t} onPress={() => updateSettings({ theme: t })} testID={`settings-theme-${t}`} />)}</ChipRow></Section>
        <Section title="Editor"><Card>{sw("autosave", "Autosave", "Save changes automatically on this device")}{sw("snapping", "Smart guides & snapping", "Snap to edges and centres while moving")}{sw("showGrid", "Show grid by default", "Grid and safe-zone overlay")}</Card></Section>
        <Section title="Performance"><ChipRow>{(["low", "balanced", "high"] as const).map((q) => <Chip key={q} label={`Preview: ${q}`} active={settings.previewQuality === q} onPress={() => updateSettings({ previewQuality: q })} testID={`settings-quality-${q}`} />)}</ChipRow></Section>
        <Section title="Data (stored only on this device)">
          <Card>
            <Row icon="cloud-download" title="Back up everything" subtitle={`${projects.length} projects, ${assets.length} assets index, brands, settings → JSON file`} onPress={backup} testID="settings-backup" />
            <Row icon="cloud-upload" title="Restore from backup or project package" subtitle="Adds projects; never overwrites existing ones" onPress={restore} testID="settings-restore" />
            <Row icon="speedometer" title="Device capability & storage" subtitle="Memory, free space, cache cleanup" onPress={() => router.push("/device")} testID="settings-device" />
          </Card>
        </Section>
        <Section title="About">
          <Card>
            <Row icon="list" title="Feature registry" subtitle="What works today and what is planned" onPress={() => router.push("/registry")} testID="settings-registry" />
            <Row icon="shield-checkmark" title="Privacy Policy" onPress={() => router.push("/legal/privacy")} testID="settings-privacy" />
            <Row icon="document-lock" title="Terms & Conditions" onPress={() => router.push("/legal/terms")} testID="settings-terms" />
            <Row icon="mail" title="Contact support" subtitle="jarvisai9077@gmail.com" onPress={() => Linking.openURL("mailto:jarvisai9077@gmail.com?subject=RF%20Canvas%20support").catch(() => toast("No email app found. Write to jarvisai9077@gmail.com", "error"))} testID="settings-support" />
          </Card>
          <T v="muted" style={{ padding: spacing.md }}>RF Canvas 1.0 · Works fully offline · No account, ads or tracking.</T>
        </Section>
      </ScrollView>
    </View>
  );
}
