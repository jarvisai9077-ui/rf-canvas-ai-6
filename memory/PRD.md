# RF Canvas — PRD

## Original problem statement
Build RF Canvas: a premium, Android-first, fully offline creative super app (design editor, templates, Image Lab, video, vector, drawing/calligraphy, motion, documents/presentations, brand studio, business & digital product factory, local AI, automation, export centre, reliability tools, 50 advanced features, honest feature registry). Brand colours #FF5E00 / #FF6600 / #FFF0E6 / #F5F6F8 / #1C1C1E / #8E8E93. Light/Dark/System themes. No account, no backend, no fake AI. User asked: build everything in one go, no placeholders.

## Architecture
- Expo Router (SDK 58) app only; no backend used. All data stored locally (AsyncStorage per project key + rolling backup copy; media copied into app document storage).
- One SVG renderer (`src/engine/render.ts`) drives on-screen display, SVG, PDF (expo-print) and web raster export, so what you see matches the export.
- Engines: store.ts (persistence/recovery/UI feedback), factory.ts (layers, presets, 24 templates), geometry.ts (wrap, align, smart resize, splines, variable stroke, offset, simplify), color.ts (WCAG contrast, colour matrices, CVD sim), doctor.ts (Design Doctor, composition, complexity, integrity, preflight), exporter.ts (PNG/JPEG/SVG/PDF/JSON + validation), media.ts (picker/camera/files + SHA-256), registry.ts.
- Screens: tabs (Home, Projects, Templates, Studios), editor, image-lab, draw, vector, video, export, doctor, history, checklist, present, palette, brand, factory, library (assets), ai, exports, device, registry, settings, legal.

## Implemented (June 2026)
- Project manager (rename, duplicate, favourite, folders, tags, archive, trash/restore, search, filters, grid/list).
- Design editor: text/shapes/images/QR/chart/table/note/measure layers, move/resize/rotate handles, pinch, snapping guides, marquee, groups, align/distribute, numeric fields, gradients, shadow, glow, curved/skew text, cut lines, style & selection presets, eyedropper, annotations, colour-vision sim, grid/safe zone, pages, page numbers, TOC, notes, transitions, smart resize, undo/redo, autosave, experiment mode.
- Image Lab (non-destructive adjustments, presets, crop/rotate/flip/resize, before/after), Drawing & Calligraphy (brushes, nib, pressure, symmetry, stabilizer, frames, onion skin), Vector (pen, nodes, curves, offset, simplify, procedural shapes, measure, iso grid, SVG import), Video (timeline playback, trim/split/speed/volume/titles/markers, EDL export).
- Design Doctor + score, complexity meter, integrity scanner/repair, history/snapshots/diff/variant wall, checklist, presenter mode, command palette, brand kits + master project propagation, factory (CSV variations/certificates/ID cards, multi-size, batch replace, CSV report, print sheet, event stationery, client delivery), assets (search, duplicates, dependencies, licences, cross-project replace), local AI model manager (honest: no runtime), device test, export centre with validation, backup/restore, privacy & terms, feature registry.

## Known limitations / backlog
- P0: MP4 video export (needs native encoder), boolean path ops, masks/blend modes.
- P1: curves/levels/HSL/LUT, luminosity masks, dodge & burn, keyframe motion graphics, Lottie, template pack import, glyph inspector, font import, barcodes, dielines.
- P2: on-device AI (segmentation, OCR, STT) once a runtime is added, thermal-aware processing, storage migration, RTL preview.
- Storage is AsyncStorage (not SQLite).

## Testing
- iteration_1: ~92% flows passed on web; /assets route conflict fixed (renamed to /library); native-tabs import migrated; negative SVG sizes clamped.

## Update (Sep 2026) — branding, instant start, error handling
- New RF monogram logo (white RF pen-stroke on #FF5E00): icon, adaptive icon, splash (light #F5F6F8 / dark #0F1013), favicon, in-app header logo. Emergent assets removed; bundle id com.rfcanvas.app.
- Instant start: no render gating; fonts non-blocking (theme.ts setFontsReady); parallel store hydration with pre-hydration merge + index self-repair; splash hidden on first frame (no fade); skeletons not spinners; withProject gate for [id] routes.
- Error handling: guarded tap handlers, save/load error toasts + Retry banner, Hermes/web unhandled rejection toasts, error boundary 'Back to Home'.
