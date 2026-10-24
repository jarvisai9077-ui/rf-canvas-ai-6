import { Ionicons } from "@react-native-vector-icons/ionicons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, PanResponder, Platform, Pressable, ScrollView, StyleProp, Text, TextInput, TextStyle, View, ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { closeConfirm, toast, useUI } from "@/src/engine/store";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

// Every tappable primitive runs its handler through this guard: a thrown error or a
// rejected promise becomes a clear toast instead of a silent failure or a crash.
function reportActionError(e: any) {
  console.error("[RF Canvas] action failed:", e);
  toast(e?.message ? `That didn't work: ${e.message}` : "That didn't work. Please try again.", "error");
}
export function guard<A extends unknown[]>(fn?: (...args: A) => unknown) {
  return (...args: A) => {
    if (!fn) return;
    try {
      const r: any = fn(...args);
      if (r && typeof r.then === "function") r.then(undefined, reportActionError);
    } catch (e) { reportActionError(e); }
  };
}

export function Ambient() {
  const { colors } = useTheme();
  return <LinearGradient pointerEvents="none" colors={[colors.ambientA, colors.surface, colors.ambientB]} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />;
}

export function T({ children, style, v = "body", numberOfLines, testID }: { children: React.ReactNode; style?: StyleProp<TextStyle>; v?: "h1" | "h2" | "h3" | "body" | "small" | "label" | "muted"; numberOfLines?: number; testID?: string }) {
  const { colors } = useTheme();
  const base: TextStyle = {
    h1: { fontFamily: fonts.bold, fontSize: 30, letterSpacing: -0.6, color: colors.onSurface },
    h2: { fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.3, color: colors.onSurface },
    h3: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onSurface },
    body: { fontFamily: fonts.regular, fontSize: 15, color: colors.onSurface, lineHeight: 21 },
    small: { fontFamily: fonts.regular, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 18 },
    label: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase" as const },
    muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  }[v];
  return <Text testID={testID} numberOfLines={numberOfLines} style={[base, style]}>{children}</Text>;
}

export function Glass({ children, style, testID, intensity = 40 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string; intensity?: number }) {
  const s = useS(); const { scheme } = useTheme();
  return (
    <View testID={testID} style={[s.glass, style]}>
      {Platform.OS === "ios" ? <BlurView intensity={intensity} tint={scheme === "dark" ? "dark" : "light"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
      {children}
    </View>
  );
}

export function Btn({ label, onPress, icon, kind = "primary", testID, disabled, loading, small, style }: { label: string; onPress: () => unknown; icon?: IconName; kind?: "primary" | "secondary" | "ghost" | "danger"; testID?: string; disabled?: boolean; loading?: boolean; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const bg = { primary: colors.brandPrimary, secondary: colors.brandTertiary, ghost: "transparent", danger: colors.error }[kind];
  const fg = { primary: colors.onBrandPrimary, secondary: colors.onBrandTertiary, ghost: colors.onSurface, danger: colors.onError }[kind];
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading} onPress={guard(onPress)}
      style={({ pressed }) => [{ minHeight: small ? 38 : 48, paddingHorizontal: small ? 14 : 20, borderRadius: radius.pill, backgroundColor: bg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }], borderWidth: kind === "ghost" ? 1 : 0, borderColor: colors.borderStrong }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: small ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, testID, label, active, size = 22, disabled, tone }: { icon: IconName; onPress: () => unknown; testID?: string; label: string; active?: boolean; size?: number; disabled?: boolean; tone?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={guard(onPress)} hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.brandTertiary : pressed ? colors.surfaceTertiary : "transparent", opacity: disabled ? 0.35 : 1 })}>
      <Ionicons name={icon} size={size} color={tone ?? (active ? colors.brandPrimary : colors.onSurface)} />
    </Pressable>
  );
}

export function Tool({ icon, label, onPress, testID, active }: { icon: IconName; label: string; onPress: () => unknown; testID?: string; active?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={guard(onPress)} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 72, alignItems: "center", gap: 6, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.brandPrimary : colors.surfaceTertiary }}>
        <Ionicons name={icon} size={22} color={active ? colors.onBrandPrimary : colors.onSurface} />
      </View>
      <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 11, color: colors.onSurfaceTertiary }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, testID, icon }: { label: string; active?: boolean; onPress: () => unknown; testID?: string; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={guard(onPress)} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={{ height: 36, flexShrink: 0, paddingHorizontal: 14, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: active ? colors.surfaceInverse : colors.glassStrong, borderWidth: 1, borderColor: active ? colors.surfaceInverse : colors.border }}>
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.onSurfaceInverse : colors.onSurface} /> : null}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: active ? colors.onSurfaceInverse : colors.onSurface }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 56, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md, alignItems: "center" }}>{children}</ScrollView>;
}

export function Header({ title, subtitle, onBack, right, testID }: { title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets(); const s = useS();
  return (
    <View style={[s.header, { paddingTop: insets.top + 6 }]} testID={testID}>
      {onBack ? <IconBtn icon="chevron-back" label="Back" onPress={onBack} testID="header-back-button" /> : <View style={{ width: 8 }} />}
      <View style={{ flex: 1, paddingHorizontal: 4 }}>
        <T v="h2" numberOfLines={1}>{title}</T>
        {subtitle ? <T v="muted" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
        <T v="label">{title}</T>{right}
      </View>
      {children}
    </View>
  );
}

export function Row({ icon, title, subtitle, onPress, right, testID, tone }: { icon?: IconName; title: string; subtitle?: string; onPress?: () => unknown; right?: React.ReactNode; testID?: string; tone?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress ? guard(onPress) : undefined} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: spacing.md, minHeight: 56, backgroundColor: pressed ? colors.surfaceTertiary : "transparent" })}>
      {icon ? <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={18} color={tone ?? colors.brandPrimary} /></View> : null}
      <View style={{ flex: 1 }}>
        <T v="h3" numberOfLines={2}>{title}</T>
        {subtitle ? <T v="small">{subtitle}</T> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </Pressable>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const s = useS();
  return <View testID={testID} style={[s.card, style]}>{children}</View>;
}

export function Badge({ text, tone }: { text: string; tone: "success" | "warning" | "error" | "info" | "brand" | "muted" }) {
  const { colors } = useTheme();
  const bg = { success: colors.success, warning: colors.warning, error: colors.error, info: colors.info, brand: colors.brandPrimary, muted: colors.surfaceTertiary }[tone];
  const fg = { success: colors.onSuccess, warning: colors.onWarning, error: colors.onError, info: colors.onInfo, brand: colors.onBrandPrimary, muted: colors.onSurfaceTertiary }[tone];
  return <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: 11 }}>{text}</Text></View>;
}

export function Slider({ value, min, max, onChange, onDone, label, testID, step = 1 }: { value: number; min: number; max: number; onChange: (v: number) => void; onDone?: (v: number) => void; label: string; testID?: string; step?: number }) {
  const { colors } = useTheme(); const [w, setW] = useState(1); const wRef = useRef(1); const last = useRef(value);
  const calc = (x: number) => { const t = Math.max(0, Math.min(1, x / wRef.current)); const v = Math.round((min + t * (max - min)) / step) * step; last.current = v; return v; };
  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => onChangeRef.current(calc(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => onChangeRef.current(calc(e.nativeEvent.locationX)),
    onPanResponderRelease: () => onDoneRef.current?.(last.current),
  })).current;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange; const onDoneRef = useRef(onDone); onDoneRef.current = onDone;
  const t = (Math.max(min, Math.min(max, value)) - min) / (max - min || 1);
  return (
    <View style={{ paddingHorizontal: spacing.md, paddingVertical: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
        <T v="small">{label}</T><T v="small" testID={testID ? testID + "-value" : undefined}>{step < 1 ? value.toFixed(2) : Math.round(value)}</T>
      </View>
      <View testID={testID} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => { const d = (max - min) / 20; const v = Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === "increment" ? d : -d))); onChange(v); onDone?.(v); }}
        onLayout={(e) => { wRef.current = e.nativeEvent.layout.width; setW(e.nativeEvent.layout.width); }} {...pr.panHandlers} style={{ height: 32, justifyContent: "center" }}>
        <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary }}>
          <View style={{ width: t * w, height: 4, borderRadius: 2, backgroundColor: colors.brandPrimary }} />
        </View>
        <View pointerEvents="none" style={{ position: "absolute", left: t * w - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.brandPrimary }} />
      </View>
    </View>
  );
}

export function Input({ value, onChangeText, placeholder, testID, multiline, keyboardType, style, onEndEditing, label }: { value: string; onChangeText: (s: string) => void; placeholder?: string; testID?: string; multiline?: boolean; keyboardType?: "default" | "numeric"; style?: StyleProp<TextStyle>; onEndEditing?: () => void; label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {label ? <T v="small">{label}</T> : null}
      <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} keyboardType={keyboardType} onEndEditing={onEndEditing} onBlur={onEndEditing} accessibilityLabel={label ?? placeholder}
        style={[{ minHeight: multiline ? 88 : 46, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: 14, paddingVertical: 10, fontFamily: fonts.regular, fontSize: 15, textAlignVertical: multiline ? "top" : "center", borderWidth: 1, borderColor: colors.border }, style]} />
    </View>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", padding: spacing.xl, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={32} color={colors.brandPrimary} /></View>
      <T v="h3">{title}</T><T v="small" style={{ textAlign: "center" }}>{text}</T>{action}
    </View>
  );
}

// Root overlays: toast + confirm/prompt sheet. Mounted once in the root layout.
export function RootOverlays() {
  const ui = useUI(); const { colors } = useTheme(); const insets = useSafeAreaInsets(); const s = useS();
  const [val, setVal] = useState("");
  useEffect(() => { if (ui.confirm?.input) setVal(ui.confirm.input.value); }, [ui.confirm]);
  const c = ui.confirm;
  return (
    <>
      {ui.toast ? (
        <Animated.View entering={FadeInDown} exiting={FadeOutDown} pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 90, alignItems: "center" }}>
          <View testID="toast" style={{ backgroundColor: ui.toast.tone === "error" ? colors.error : ui.toast.tone === "success" ? colors.success : colors.surfaceInverse, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16, flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Ionicons name={ui.toast.tone === "error" ? "alert-circle" : ui.toast.tone === "success" ? "checkmark-circle" : "information-circle"} size={18} color={ui.toast.tone === "error" ? colors.onError : ui.toast.tone === "success" ? colors.onSuccess : colors.onSurfaceInverse} />
            <Text testID="toast-text" style={{ color: ui.toast.tone === "error" ? colors.onError : ui.toast.tone === "success" ? colors.onSuccess : colors.onSurfaceInverse, fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1 }}>{ui.toast.text}</Text>
          </View>
        </Animated.View>
      ) : null}
      <Modal visible={!!c} transparent animationType="fade" onRequestClose={() => closeConfirm(c?.input ? null : false)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }} onPress={() => closeConfirm(c?.input ? null : false)}>
          <Pressable onPress={() => {}} style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} testID="confirm-sheet">
            <T v="h2">{c?.title}</T>
            {c?.message ? <T v="small" style={{ marginTop: 6 }}>{c.message}</T> : null}
            {c?.items?.length ? <ScrollView style={{ maxHeight: 200, marginTop: 10 }}>{c.items.map((i, k) => <T key={k} v="small">• {i}</T>)}</ScrollView> : null}
            {c?.input ? <View style={{ marginTop: 12 }}><Input testID="prompt-input" value={val} onChangeText={setVal} placeholder={c.input.placeholder} multiline={c.input.multiline} /></View> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Btn label="Cancel" kind="ghost" style={{ flex: 1 }} onPress={() => closeConfirm(c?.input ? null : false)} testID="confirm-cancel-button" />
              <Btn label={c?.confirmLabel ?? "Confirm"} kind={c?.destructive ? "danger" : "primary"} style={{ flex: 1 }} onPress={() => closeConfirm(c?.input ? val : true)} testID="confirm-ok-button" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const useS = makeStyles((c) => ({
  glass: { backgroundColor: c.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, marginHorizontal: spacing.md, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingBottom: 8, backgroundColor: c.glassStrong, borderBottomWidth: 1, borderBottomColor: c.divider },
  sheet: { backgroundColor: c.surfaceSecondary, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg },
}));
