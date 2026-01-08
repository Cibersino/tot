# Gate F1 Evidence Report - Deflation Candidates (electron/public)

Scope: electron/** and public/** only (code, plus public/*.html as runtime evidence). Evidence derived from current repo state (HEAD). No code changes applied.

## Candidates (ranked by expected deflation impact)

### F1-A1 - public - Category A (Duplicated constant)
1) What: repeated `DEFAULT_LANG = 'es'` constant used as fallback.
2) Where (8 occurrences, top-level module scope):
   - public/renderer.js: top-level const (line 8).
   - public/editor.js: top-level const (line 8).
   - public/preset_modal.js: top-level const inside IIFE (line 10).
   - public/flotante.js: top-level const (line 7).
   - public/js/i18n.js: top-level const inside IIFE (line 11).
   - public/js/presets.js: top-level const inside IIFE (line 6).
   - public/js/format.js: top-level const inside IIFE (line 6).
   - public/js/count.js: top-level const inside IIFE (line 5).
3) Semantic equivalence proof:
   - All are literal `'es'` used as fallback/default language.
4) Host feasibility (public runtime, HTML load order):
   - Proposed host: public/js/i18n.js via `window.RendererI18n` (already defined at lines 180-184).
   - Evidence i18n.js is loaded on all relevant entrypoints:
     - public/index.html script tags (lines 133-138) include `./js/i18n.js` before presets/count/format/renderer.
     - public/editor.html script tag line 28 includes `js/i18n.js` before `editor.js` (line 30).
     - public/preset_modal.html script tag line 55 includes `js/i18n.js` before `preset_modal.js` (line 57).
     - public/flotante.html script tag line 20 includes `js/i18n.js` before `flotante.js` (line 22).
   - Language window does not load these modules, so no requirement there.
5) Deflation estimate:
   - Remove 7 duplicate constants across 8 files (centralize in i18n.js).
6) Risk notes:
   - Ensure access to the shared constant is available before dependent scripts execute (load order already satisfies this).

### F1-A2 - public - Category A (Duplicated helpers)
1) What: identical `normalizeLangTag` + `getLangBase` helpers.
2) Where (3 occurrences, top-level helper definitions inside IIFE):
   - public/js/i18n.js: lines 13-19.
   - public/js/presets.js: lines 8-14.
   - public/js/format.js: lines 8-14.
3) Semantic equivalence proof:
   - All use `(lang || '').trim().toLowerCase().replace(/_/g, '-')` and derive base from first `-` segment.
4) Host feasibility (public runtime, HTML load order):
   - Proposed host: public/js/i18n.js (already loaded on all relevant entrypoints; see F1-A1 HTML evidence).
   - public/index.html loads i18n.js before presets.js and format.js (lines 133-136), so shared helpers can be read from `window.RendererI18n` without load-order changes.
5) Deflation estimate:
   - Remove 2 helper clones across 3 files.
6) Risk notes:
   - Ensure helper exposure from i18n.js uses the same semantics (no normalization changes).

### F1-A3 - electron - Category A (Duplicated helper)
1) What: `resolveDialogText(dialogTexts, key, fallback)` helper (warnOnce + fallback).
2) Where (2 occurrences, top-level helper definitions):
   - electron/presets_main.js: lines 29-36.
   - electron/updater.js: lines 27-34.
3) Semantic equivalence proof:
   - Both check `dialogTexts[key]` is a string, else `log.warnOnce` and return `fallback`.
   - Only difference is warnOnce key prefix (`presets_main.dialog.missing` vs `updater.dialog.missing`), which can be parameterized.
4) Host feasibility (electron runtime, require graph):
   - Proposed host: electron/menu_builder.js (already required by both).
   - Evidence: presets_main requires menu_builder at line 14; updater requires menu_builder at line 12.
   - menu_builder requires only electron/log and node modules (lines 17-28), so adding a helper export there does not introduce a cycle.
5) Deflation estimate:
   - Remove 2 helper clones across 2 files.
6) Risk notes:
   - Preserve warnOnce key prefix per caller to avoid logging key drift.

### F1-A4 - electron - Category A (Duplicated helpers)
1) What: identical `normalizeLangTag` + `getLangBase` helpers.
2) Where (2 occurrences, top-level helper definitions):
   - electron/settings.js: lines 33-41.
   - electron/menu_builder.js: lines 42-48.
3) Semantic equivalence proof:
   - Both normalize to lowercase, replace `_` with `-`, and split base on first `-`.
4) Host feasibility (electron runtime, require graph):
   - Proposed host: electron/settings.js (language helper owner).
   - Evidence: settings.js has no dependency on menu_builder (requires only fs/path/log at lines 21-25).
   - menu_builder currently has no dependency on settings; adding a require introduces no cycle with current graph.
5) Deflation estimate:
   - Remove 1 helper clone across 2 files.
6) Risk notes:
   - Adds a new dependency from menu_builder to settings; confirm no initialization side effects from requiring settings.

### F1-A5 - electron - Category A (Duplicated constant)
1) What: repeated `DEFAULT_LANG = 'es'` constants in electron runtime.
2) Where (5 occurrences, top-level module scope):
   - electron/main.js: line 40.
   - electron/menu_builder.js: line 28.
   - electron/settings.js: line 26.
   - electron/presets_main.js: line 11.
   - electron/updater.js: line 13.
3) Semantic equivalence proof:
   - All are identical literal `'es'` used as default language.
4) Host feasibility (electron runtime, require graph):
   - Proposed host: electron/constants_main.js (low-level constants module).
   - Evidence: constants_main.js defines simple exports (lines 1-9) and is already required by main.js (line 22) and text_state.js (line 19).
   - constants_main has no imports of higher-level modules, so adding a new export should not create cycles.
5) Deflation estimate:
   - Remove 4 duplicate constants across 5 files (centralize in constants_main).
6) Risk notes:
   - Requires adding a new export to constants_main and updating imports; ensure no module relies on a different default language value.

### F1-B1 - public - Category B (Redundant execution)
1) What: `updatePreviewAndResults(currentText)` called twice for a single `settings-updated` event when `idiomaCambio` is true.
2) Where:
   - public/renderer.js: settingsChangeHandler in init IIFE (lines 391-421).
   - First call inside `idiomaCambio` block at line 414.
   - Second call at the end of handler at line 420.
3) Semantic equivalence proof:
   - When `idiomaCambio` is true and `modeConteo` does not change, both calls run with the same `currentText`, `idiomaActual`, and `settingsCache` (no intervening mutations after line 414).
4) Host feasibility:
   - N/A (local deflation in the same function).
5) Deflation estimate:
   - Remove 1 redundant render per language change event.
6) Risk notes:
   - The remaining call should stay after any `modeConteo` updates to preserve output when mode changes.

### F1-C1 - Category C (Listener accumulation) - STOP (no evidence)
1) What: potential duplicate `onSettingsChanged` registrations per lifecycle.
2) Evidence scan (single registration per window script):
   - public/renderer.js: onSettingsChanged registration at lines 426-429.
   - public/editor.js: onSettingsChanged registration at lines 94-105.
   - public/preset_modal.js: onSettingsChanged registration at lines 134-145.
   - public/flotante.js: onSettingsChanged registration at lines 102-109.
3) Result:
   - No re-entrant init or repeated DOMContentLoaded usage is visible in these files. Duplicate subscription risk not provable from code. STOP.
