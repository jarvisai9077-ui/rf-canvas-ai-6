// Real file exports with post-write validation. Nothing is reported as done until the file is read back.
import * as FS from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { captureRef } from "react-native-view-shot";
import { storage } from "@/src/utils/storage";
import * as MediaLibrary from "expo-media-library";
import { Linking } from "react-native";
import { fontCSS, toDataURL } from "./fonts";
import { pageToSVG, RenderOpts } from "./render";
import { confirmAsk } from "./store";
import type { Page, Project } from "./types";

export type Format = "png" | "jpg" | "svg" | "pdf" | "json" | "csv" | "txt";
export interface ExportResult { uri: string; name: string; format: Format; size: number; valid: boolean; message: string; width?: number; height?: number }
export interface ExportRecord extends ExportResult { projectId: string; t: number }

const isWeb = Platform.OS === "web";
export const exportDir = () => (FS.documentDirectory ?? "") + "exports/";

export function fileName(tpl: string, p: Project, ext: string, extra: Record<string, string | number> = {}) {
  const d = new Date(); const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  let s = tpl.replace("{name}", p.name).replace("{w}", String(extra.w ?? p.width)).replace("{h}", String(extra.h ?? p.height)).replace("{date}", date).replace("{page}", String(extra.page ?? 1)).replace("{n}", String(extra.n ?? 1));
  s = s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return `${s}.${ext}`;
}

async function ensureDir() { if (!isWeb) await FS.makeDirectoryAsync(exportDir(), { intermediates: true }).catch(() => {}); }

const MAGIC: Partial<Record<Format, string>> = { png: "iVBORw0KGgo", jpg: "/9j/", pdf: "JVBER" };

export async function validateFile(uri: string, format: Format): Promise<{ valid: boolean; size: number; message: string }> {
  if (isWeb) {
    const ok = uri.startsWith("data:") || uri.startsWith("blob:");
    return { valid: ok, size: uri.length, message: ok ? "Generated in browser and downloaded" : "Invalid output" };
  }
  const info = await FS.getInfoAsync(uri);
  if (!info.exists) return { valid: false, size: 0, message: "File was not written" };
  const size = (info as any).size ?? 0;
  if (size <= 0) return { valid: false, size, message: "File is empty" };
  if (MAGIC[format]) {
    const head = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64, position: 0, length: 12 });
    if (!head.startsWith(MAGIC[format]!)) return { valid: false, size, message: `Header does not match ${format.toUpperCase()}` };
  } else if (format === "svg") {
    const t = await FS.readAsStringAsync(uri); if (!t.includes("<svg") || !t.trim().endsWith("</svg>")) return { valid: false, size, message: "SVG markup incomplete" };
  } else if (format === "json") {
    try { JSON.parse(await FS.readAsStringAsync(uri)); } catch { return { valid: false, size, message: "JSON does not parse" }; }
  }
  return { valid: true, size, message: `Verified ${format.toUpperCase()} · ${(size / 1024).toFixed(1)} KB` };
}

function webDownload(data: string, name: string, mime: string) {
  const blob = data.startsWith("data:") ? null : new Blob([data], { type: mime });
  const href = blob ? URL.createObjectURL(blob) : data;
  const a = (globalThis as any).document.createElement("a"); a.href = href; a.download = name; a.click();
  return href;
}

export async function writeText(p: Project, content: string, format: Format, name: string): Promise<ExportResult> {
  await ensureDir();
  if (isWeb) { const uri = webDownload(content, name, format === "svg" ? "image/svg+xml" : "application/json"); return finish(p, { uri, name, format, ...(await validateFile(uri, format)) }); }
  const uri = exportDir() + name; await FS.writeAsStringAsync(uri, content);
  return finish(p, { uri, name, format, ...(await validateFile(uri, format)) });
}

// Embed local images as data URIs so SVG/PDF files are self-contained.
export async function imageMapFor(pages: Page[]) {
  const map: Record<string, string> = {};
  for (const pg of pages) for (const l of pg.layers) if (l.type === "image" && l.uri && !map[l.uri]) {
    const d = await toDataURL(l.uri); if (d) map[l.uri] = d; // missing assets are reported by Design Doctor
  }
  return map;
}

export async function exportSVG(p: Project, pageIndex: number, tpl: string, opts: RenderOpts = {}) {
  const pg = p.pages[pageIndex]; const imageMap = await imageMapFor([pg]);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` + pageToSVG(pg, p.width, p.height, { ...opts, imageMap, fontCSS: await fontCSS([pg]) });
  return writeText(p, svg, "svg", fileName(tpl, p, "svg", { page: pageIndex + 1 }));
}

export async function exportRaster(p: Project, pageIndex: number, viewRef: any, format: "png" | "jpg", scale: number, quality: number, tpl: string): Promise<ExportResult> {
  const w = Math.round(p.width * scale), h = Math.round(p.height * scale); const name = fileName(tpl, p, format, { w, h, page: pageIndex + 1 });
  if (isWeb) {
    const pg = p.pages[pageIndex];
    const svg = pageToSVG(pg, p.width, p.height, { imageMap: await imageMapFor([pg]), fontCSS: await fontCSS([pg]) });
    const data: string = await new Promise((res, rej) => {
      const img = new (globalThis as any).Image(); img.onload = () => {
        const c = (globalThis as any).document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d");
        if (format === "jpg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h); res(c.toDataURL(format === "png" ? "image/png" : "image/jpeg", quality));
      }; img.onerror = () => rej(new Error("Browser could not rasterise this design"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    webDownload(data, name, ""); return finish(p, { uri: data, name, format, width: w, height: h, ...(await validateFile(data, format)) });
  }
  await ensureDir();
  if (!viewRef?.current) throw new Error("Renderer not ready, try again");
  const tmp = await captureRef(viewRef, { format, quality, width: w, height: h, result: "tmpfile" });
  const uri = exportDir() + name; await FS.moveAsync({ from: tmp, to: uri });
  return finish(p, { uri, name, format, width: w, height: h, ...(await validateFile(uri, format)) });
}

export async function exportPDF(p: Project, tpl: string, o: { bleedPx?: number; cropMarks?: boolean; pages?: number[]; nUp?: number; annotations?: boolean } = {}): Promise<ExportResult> {
  const pages = (o.pages ?? p.pages.map((_, i) => i)).map((i) => p.pages[i]);
  const imageMap = await imageMapFor(pages); const b = o.bleedPx ?? 0; const css = await fontCSS(pages);
  const ptW = ((p.width + 2 * b) / (p.dpi || 72)) * 72, ptH = ((p.height + 2 * b) / (p.dpi || 72)) * 72;
  const body = pages.map((pg) => `<div class="pg">${pageToSVG(pg, p.width, p.height, { imageMap, bleed: b, cropMarks: o.cropMarks, annotations: o.annotations }).replace("<svg ", '<svg style="width:100%;height:100%" ')}</div>`).join("");
  const html = `<html><head><style>${css}@page{size:${ptW}pt ${ptH}pt;margin:0}body{margin:0}.pg{width:${ptW}pt;height:${ptH}pt;page-break-after:always;overflow:hidden}</style></head><body>${body}</body></html>`;
  const name = fileName(tpl, p, "pdf");
  if (isWeb) { await Print.printAsync({ html }); return finish(p, { uri: "print-dialog", name, format: "pdf", size: html.length, valid: true, message: "Sent to the browser print dialog (choose “Save as PDF”)" }); }
  await ensureDir();
  const { uri: tmp } = await Print.printToFileAsync({ html, width: Math.round(ptW), height: Math.round(ptH) });
  const uri = exportDir() + name; await FS.moveAsync({ from: tmp, to: uri });
  return finish(p, { uri, name, format: "pdf", ...(await validateFile(uri, "pdf")) });
}

// Recording export history must never turn a successful export into a failure.
async function finish(p: Project, r: ExportResult) {
  try {
    const list = await listExports();
    // Web data-URI results can be megabytes; keep history light.
    const rec = { ...r, uri: r.uri.startsWith("data:") ? "downloaded" : r.uri, projectId: p.id, t: Date.now() };
    await storage.setItem("rf_exports", JSON.stringify([rec, ...list].slice(0, 200)));
  } catch { /* history is best-effort */ }
  return r;
}
export async function listExports(): Promise<ExportRecord[]> {
  const raw = await storage.getItem("rf_exports", null); if (typeof raw !== "string") return [];
  try { return JSON.parse(raw); } catch { return []; }
}
export async function share(uri: string) {
  if (isWeb || !(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri); return true;
}
export async function dirSize(dir: string | null) {
  if (!dir || isWeb) return 0; let total = 0;
  try {
    for (const f of await FS.readDirectoryAsync(dir)) {
      const info: any = await FS.getInfoAsync(dir + f);
      total += info.isDirectory ? await dirSize(dir + f + "/") : info.size ?? 0;
    }
  } catch { /* unreadable dir */ }
  return total;
}

// Save a validated PNG/JPEG into the phone's Photos/Gallery (asks permission in context).
export async function saveToPhotos(uri: string): Promise<boolean> {
  if (isWeb) return false;
  let perm = await MediaLibrary.getPermissionsAsync(true);
  if (!perm.granted && perm.canAskAgain) {
    if (!(await confirmAsk({ title: "Save to your gallery", message: "Allow RF Canvas to add exported images to your Photos so you can share them anywhere.", confirmLabel: "Continue" }))) return false;
    perm = await MediaLibrary.requestPermissionsAsync(true);
  }
  if (!perm.granted) {
    if (await confirmAsk({ title: "Gallery access is off", message: "You can still share the file. To save to Photos, enable access in Settings.", confirmLabel: "Open Settings" })) Linking.openSettings();
    return false;
  }
  await MediaLibrary.saveToLibraryAsync(uri); return true;
}
