// Offline-first local store. Every project is persisted as its own key with a
// rolling backup copy; reads fall back to the backup if the main copy is corrupt.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { storage } from "@/src/utils/storage";
import { setColorScheme } from "@/src/theme";
import type { Asset, Brand, Project, Settings } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

interface State {
  ready: boolean;
  projects: Project[];
  assets: Asset[];
  brands: Brand[];
  settings: Settings;
  recovered: string[];
  /** Set when saved data could not be read; writes to shared indexes are paused so nothing is overwritten. */
  loadError: string | null;
}

export const defaultSettings: Settings = {
  theme: "system", autosave: true, snapping: true, showGrid: false, highContrast: false,
  previewQuality: "balanced", filenameTemplate: "{name}_{w}x{h}_{date}", recentCommands: [],
  savedChecklists: [{ name: "Social post launch", items: ["Check spelling", "Run Design Doctor", "Export PNG 1080", "Export JPEG backup"] }],
  selectionPresets: [], effectPresets: [],
};

let state: State = { ready: false, projects: [], assets: [], brands: [], settings: defaultSettings, recovered: [], loadError: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; emit(); };

export function useStore(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
export const getState = () => state;

const K = { index: "rf_index", proj: (id: string) => `rf_p_${id}`, bak: (id: string) => `rf_b_${id}`, assets: "rf_assets", brands: "rf_brands", settings: "rf_settings" };

async function readJSON<T>(key: string): Promise<T | null> {
  const raw = await storage.getItem(key, null);
  if (typeof raw !== "string") return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function validateProject(p: any): p is Project {
  return !!p && typeof p.id === "string" && Array.isArray(p.pages) && p.pages.every((pg: any) => Array.isArray(pg.layers)) && typeof p.width === "number";
}

function normalize(p: Project): Project {
  const d: any = { snapshots: [], checklist: [], log: [], history: [], tags: [], folder: "", favorite: false, archived: false, trashed: false, category: "Custom", unit: "px", dpi: 72 };
  return { ...d, ...p };
}

// ---- Hydration ----
// The UI renders immediately; saved data streams in a moment later (all keys read in
// parallel). Anything the user does before hydration finishes is kept and merged in,
// and shared index writes wait for hydration so a quick tap can never wipe saved work.
let hydration: Promise<void> | null = null;
let pendingSettings: Partial<Settings> = {};
const whenHydrated = () => hydration ?? Promise.resolve();
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

async function projectIdsFromKeys(): Promise<string[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((k) => k.startsWith("rf_p_") || k.startsWith("rf_b_")).map((k) => k.slice(5));
  } catch { return []; }
}

async function loadProject(id: string): Promise<{ p: Project | null; recoveredName?: string }> {
  const p = await readJSON<Project>(K.proj(id));
  if (validateProject(p)) return { p: normalize(p) };
  const b = await readJSON<Project>(K.bak(id));
  if (validateProject(b)) return { p: normalize({ ...b, recovered: true }), recoveredName: b.name };
  return { p: null };
}

async function hydrate() {
  // Index + key scan together: projects missing from a damaged/stale index are still found.
  const [index, keyIds, assetsRaw, brandsRaw, settingsRaw] = await Promise.all([
    readJSON<string[]>(K.index), projectIdsFromKeys(), readJSON<Asset[]>(K.assets), readJSON<Brand[]>(K.brands), readJSON<Settings>(K.settings),
  ]);
  const ids = Array.from(new Set([...arr<string>(index), ...keyIds].filter((x) => typeof x === "string" && x)));
  const loaded = await Promise.all(ids.map((id) => loadProject(id).catch(() => ({ p: null } as { p: Project | null; recoveredName?: string }))));
  const recovered = loaded.map((l) => l.recoveredName).filter(Boolean) as string[];
  const fromDisk = loaded.map((l) => l.p).filter(Boolean) as Project[];
  // Merge with anything created/edited during the first moments (in-memory copy wins).
  const live = new Map(state.projects.map((p) => [p.id, p]));
  const projects = [...state.projects, ...fromDisk.filter((p) => !live.has(p.id))];
  const assets = [...state.assets, ...arr<Asset>(assetsRaw).filter((a) => !state.assets.some((x) => x.id === a.id))];
  const brands = [...state.brands, ...arr<Brand>(brandsRaw).filter((b) => !state.brands.some((x) => x.id === b.id))];
  const settings: Settings = { ...defaultSettings, ...(settingsRaw && typeof settingsRaw === "object" ? settingsRaw : {}), ...pendingSettings };
  pendingSettings = {};
  setColorScheme(settings.theme === "system" ? null : settings.theme);
  set({ ready: true, loadError: null, projects: projects.sort((a, b) => b.updatedAt - a.updatedAt), assets, brands, settings, recovered });
  // Repair the index if it was missing, damaged or stale.
  const indexIds = arr<string>(index);
  if (indexIds.length !== projects.length || projects.some((p) => !indexIds.includes(p.id))) await writeIndexNow();
}

export function initStore(): Promise<void> {
  if (state.ready && !state.loadError) return Promise.resolve();
  hydration = hydrate().catch((e: any) => {
    // Keep the app usable; pause shared writes so the unreadable data is not overwritten.
    set({ ready: true, loadError: e?.message ? String(e.message) : "Saved data could not be read" });
  });
  return hydration;
}

/** Re-attempt reading saved data after a failure (used by the Home recovery banner). */
export async function retryLoad() {
  if (!state.loadError) return;
  set({ ready: false });
  await initStore();
  if (state.loadError) toast("Still can't read saved projects. Your files are untouched.", "error");
  else toast("Projects loaded", "success");
}

const canWriteShared = () => state.ready && !state.loadError;

// One error toast per burst so a failing disk does not spam the screen.
let lastSaveError = 0;
function reportSaveError(what: string) {
  const now = Date.now(); if (now - lastSaveError < 4000) return; lastSaveError = now;
  toast(`Couldn't save ${what}. Free up some storage and try again.`, "error");
}

const timers: Record<string, ReturnType<typeof setTimeout>> = {};
async function writeProject(p: Project) {
  const prev = await storage.getItem(K.proj(p.id), null);
  if (typeof prev === "string") await storage.setItem(K.bak(p.id), prev);
  const ok = await storage.setItem(K.proj(p.id), JSON.stringify(p));
  if (!ok) throw new Error("Storage write failed");
}
async function writeIndexNow() {
  if (!canWriteShared()) return;
  const ok = await storage.setItem(K.index, JSON.stringify(state.projects.map((p) => p.id)));
  if (!ok) reportSaveError("your project list");
}
async function writeIndex() { await whenHydrated(); await writeIndexNow(); }
async function writeShared(key: string, value: unknown, what: string) {
  await whenHydrated(); if (!canWriteShared()) return;
  const ok = await storage.setItem(key, JSON.stringify(value));
  if (!ok) reportSaveError(what);
}

export function saveProject(p: Project, opts: { immediate?: boolean; touch?: boolean } = {}) {
  const next = { ...p, updatedAt: opts.touch === false ? p.updatedAt : Date.now() };
  const exists = state.projects.some((x) => x.id === p.id);
  const projects = exists ? state.projects.map((x) => (x.id === p.id ? next : x)) : [next, ...state.projects];
  set({ projects });
  if (!exists) writeIndex();
  clearTimeout(timers[p.id]);
  const run = () => writeProject(getProject(p.id) ?? next).catch(() => reportSaveError(`“${p.name}”`));
  if (opts.immediate) return run();
  timers[p.id] = setTimeout(run, 700);
}

export async function flushProject(id: string) {
  clearTimeout(timers[id]);
  const p = getProject(id);
  if (p) await writeProject(p);
}

export const getProject = (id: string) => state.projects.find((p) => p.id === id);

export async function deleteProjectForever(id: string) {
  set({ projects: state.projects.filter((p) => p.id !== id) });
  await storage.removeItem(K.proj(id)); await storage.removeItem(K.bak(id)); await writeIndex();
}

export function duplicateProject(p: Project, name?: string, extra: Partial<Project> = {}): Project {
  const copy: Project = JSON.parse(JSON.stringify(p));
  copy.id = uid(); copy.name = name ?? `${p.name} copy`; copy.createdAt = Date.now(); copy.favorite = false; copy.recovered = false;
  Object.assign(copy, extra);
  saveProject(copy, { immediate: true });
  return copy;
}

export function saveAssets(assets: Asset[]) { set({ assets }); writeShared(K.assets, state.assets, "your asset library"); }
export function saveBrands(brands: Brand[]) { set({ brands }); writeShared(K.brands, state.brands, "your brand kits"); }
export function updateSettings(patch: Partial<Settings>) {
  if (!state.ready) pendingSettings = { ...pendingSettings, ...patch };
  const settings = { ...state.settings, ...patch }; set({ settings });
  writeShared(K.settings, settings, "your settings").then(() => undefined);
  if (patch.theme) setColorScheme(patch.theme === "system" ? null : patch.theme);
}
export function pushRecentCommand(cmd: string) {
  updateSettings({ recentCommands: [cmd, ...state.settings.recentCommands.filter((c) => c !== cmd)].slice(0, 8) });
}

// Full backup: every project, asset index, brand and settings in one JSON document.
export function buildBackup() {
  return JSON.stringify({ app: "RF Canvas", version: 1, createdAt: Date.now(), projects: state.projects, assets: state.assets, brands: state.brands, settings: state.settings });
}
export async function restoreBackup(json: string): Promise<{ added: number; skipped: number }> {
  const data = JSON.parse(json);
  if (data?.app !== "RF Canvas" || !Array.isArray(data.projects)) throw new Error("Not an RF Canvas backup file");
  let added = 0, skipped = 0;
  for (const p of data.projects) {
    if (!validateProject(p)) { skipped++; continue; }
    const exists = getProject(p.id);
    const proj = normalize(exists ? { ...p, id: uid(), name: `${p.name} (restored)` } : p);
    saveProject(proj, { immediate: true, touch: false }); added++;
  }
  if (Array.isArray(data.assets)) saveAssets([...state.assets, ...data.assets.filter((a: Asset) => !state.assets.some((x) => x.id === a.id))]);
  if (Array.isArray(data.brands)) saveBrands([...state.brands, ...data.brands.filter((b: Brand) => !state.brands.some((x) => x.id === b.id))]);
  await writeIndex();
  return { added, skipped };
}

// ---- global UI feedback (toast / confirm / prompt) ----
type Toast = { id: number; text: string; tone: "info" | "success" | "error" };
export type ConfirmReq = { title: string; message?: string; items?: string[]; confirmLabel?: string; destructive?: boolean; input?: { value: string; placeholder?: string; multiline?: boolean }; resolve: (v: any) => void };
let ui: { toast: Toast | null; confirm: ConfirmReq | null } = { toast: null, confirm: null };
const uiListeners = new Set<() => void>();
export function useUI() { return useSyncExternalStore((l) => { uiListeners.add(l); return () => uiListeners.delete(l); }, () => ui, () => ui); }
const setUI = (p: Partial<typeof ui>) => { ui = { ...ui, ...p }; uiListeners.forEach((l) => l()); };
export function toast(text: string, tone: Toast["tone"] = "info") {
  const id = Date.now(); setUI({ toast: { id, text, tone } });
  setTimeout(() => { if (ui.toast?.id === id) setUI({ toast: null }); }, 2600);
}
export function confirmAsk(req: Omit<ConfirmReq, "resolve">): Promise<boolean> {
  return new Promise((resolve) => setUI({ confirm: { ...req, resolve } }));
}
export function promptText(title: string, value = "", opts: { message?: string; placeholder?: string; multiline?: boolean } = {}): Promise<string | null> {
  return new Promise((resolve) => setUI({ confirm: { title, message: opts.message, confirmLabel: "Save", input: { value, placeholder: opts.placeholder, multiline: opts.multiline }, resolve } }));
}
export function closeConfirm(result: any) { const c = ui.confirm; setUI({ confirm: null }); c?.resolve(result); }
