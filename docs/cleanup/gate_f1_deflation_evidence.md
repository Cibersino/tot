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

# Gate F1.1 Addendum Evidence Report - Deflation Candidates (electron/public)

## Scope + method
- Scanned electron/** and public/** plus public/*.html for script load order evidence.
- Treated electron/** dependencies as require/import graph; treated public/** dependencies as HTML <script> order + window globals.
- Only evidence-backed candidates are listed; uncertain items are marked STOP.

## New candidates not covered (or underdeveloped) in Gate F1 redo

### F1.1-A1 - electron - Category A (Duplicated helper)
1) What: `normalizeLangTag` helper (normalize language tags to lowercase, '-' separators).
2) Where (3 occurrences, top-level helper definitions):
   - electron/settings.js: `normalizeLangTag` at lines 33-34.
   - electron/menu_builder.js: `normalizeLangTag` at line 42.
   - electron/presets_main.js: `normalizeLangTag` at lines 19-20.
3) Semantic equivalence proof:
   - All three implementations use `(lang || '').trim().toLowerCase().replace(/_/g, '-')`.
4) Host feasibility (electron runtime, require graph):
   - Proposed host: electron/settings.js (language helper owner).
   - Evidence: presets_main already requires settings.js (`const settingsState = require('./settings')`, line 13), so it can reuse exported helper without new dependency.
   - menu_builder does not currently require settings.js; adding `require('./settings')` does not create a cycle because settings.js has no dependency on menu_builder (no `require('./menu_builder')` in settings.js).
5) Deflation estimate:
   - Remove 2 helper clones across 3 files.
6) Risk notes:
   - Ensure exported helper from settings.js is side-effect-safe when required by menu_builder.

### F1.1-A2 - electron - Category A (Duplicated helper) - STOP (no safe host for all call sites)
1) What: `normalizeLangTag` logic duplicated in language preload `setLanguage` normalization.
2) Where (inline duplication):
   - electron/language_preload.js: inline normalization `String(lang || '').trim().toLowerCase().replace(/_/g, '-')` at line 8.
   - Same logic appears in electron/settings.js (lines 33-34), electron/menu_builder.js (line 42), electron/presets_main.js (lines 19-20).
3) Semantic equivalence proof:
   - The inline expression matches the exact normalizeLangTag logic used elsewhere.
4) Host feasibility (electron runtime, require graph):
   - NO SAFE HOST under rules: language_preload currently requires only Electron APIs (line 4). Importing settings.js in a preload would introduce a main-process module into a renderer-preload context.
   - Importing menu_builder in a preload would pull in Menu/app usage (menu_builder requires electron/Menu at lines 17-19), not suitable for preload.
5) Deflation estimate:
   - Would remove 1 inline duplication, but blocked by host feasibility.
6) Risk notes:
   - Consolidation would risk preload/main coupling; STOP.

### F1.1-A3 - electron - Category A (Duplicated helper pattern) - STOP (no safe host)
1) What: repeated IPC listener wrapper pattern for `onSettingsChanged` in preloads.
2) Where (4 occurrences, each defines wrapper + ipcRenderer.on + removeListener):
   - electron/preload.js: `onSettingsChanged` lines 69-75.
   - electron/editor_preload.js: `onSettingsChanged` lines 20-25.
   - electron/preset_preload.js: `onSettingsChanged` lines 68-73.
   - electron/flotante_preload.js: `onSettingsChanged` lines 26-31.
3) Semantic equivalence proof:
   - Each constructs a listener wrapper with try/catch, registers `ipcRenderer.on('settings-updated', listener)`, and returns an unsubscribe that calls `removeListener` with error handling.
4) Host feasibility (electron runtime, require graph):
   - NO SAFE HOST under rules: no existing shared module is already required by all preloads that could host a helper without introducing a new dependency.
   - Using electron/preload.js as host would create a preload-to-preload dependency (not currently present).
5) Deflation estimate:
   - Would remove 3 helper clones across 4 files, but blocked by host feasibility.
6) Risk notes:
   - Consolidation likely requires a new shared module or a cross-preload dependency; STOP.

### F1.1-B1 - public - Category B (Redundant execution) - STOP (not provably redundant)
1) What: potential duplicate initial `updatePreviewAndResults(t || '')` calls during renderer init.
2) Where:
   - public/renderer.js: after `getCurrentText()` at lines 345-347.
   - public/renderer.js: after `loadPresets()` at lines 383-387.
3) Semantic equivalence proof:
   - NOT MERGEABLE: `loadPresets()` can change `wpm` and `currentPresetName`, which affects downstream time calculations inside `updatePreviewAndResults`; therefore the second call can produce different outputs even with same `currentText`.
4) Host feasibility:
   - N/A.
5) Deflation estimate:
   - STOP; cannot prove redundancy without behavior risk.
6) Risk notes:
   - Removing either call risks stale output after preset selection initialization.

### F1.1-C1 - Category C (Listener accumulation) - STOP (no evidence)
1) What: potential multiple registrations of `onSettingsChanged` in window scripts.
2) Evidence scan (single registration per lifecycle, already in Gate F1):
   - public/renderer.js: lines 426-429.
   - public/editor.js: lines 94-105.
   - public/preset_modal.js: lines 134-145.
   - public/flotante.js: lines 102-109.
3) Result:
   - No provable re-entrant init in these files; STOP.

# Gate F1.2 Corrections (evidence-only) — Deflation Decisions

Scope: electron/** and public/** (public/*.html used for runtime dependency evidence). No code changes; this file supersedes prior conclusions for the three evaluations below.

---

## (1) PUBLIC — Host selection for DEFAULT_LANG (and shared constants)

Findings (evidence)
- public/js/i18n.js exposes a global via `window.RendererI18n = { loadRendererTranslations, tRenderer, msgRenderer }` (lines 180–184). No DEFAULT_LANG exposure yet, but i18n is the language subsystem owner.  
  Locator: public/js/i18n.js:180–184.
- public/js/constants.js exposes `window.AppConstants` (line 34) and includes a static DEFAULTS object (lines 5–16) but no language constant.  
  Locator: public/js/constants.js:5–34.
- Script load order (current):
  - public/index.html: `./js/i18n.js` (line 133) before `./js/presets.js` (134), `./js/count.js` (135), `./js/format.js` (136), and `renderer.js` (138).  
    Locator: public/index.html:129–138.
  - public/editor.html: `js/i18n.js` (line 28) before `editor.js` (line 30).  
    Locator: public/editor.html:26–30.
  - public/preset_modal.html: `js/i18n.js` (line 55) before `preset_modal.js` (line 57).  
    Locator: public/preset_modal.html:53–57.
  - public/flotante.html: `js/i18n.js` (line 20) before `flotante.js` (line 22).  
    Locator: public/flotante.html:19–22.
- constants.js is not currently loaded in public/flotante.html; to use AppConstants as host, a new `<script src="js/constants.js">` would need to be inserted between lines 20–21 (before `js/crono.js` and `flotante.js`) to ensure availability.

Host decision (evidence-based)
- **Preferred host: public/js/i18n.js** (RendererI18n).  
  Rationale: i18n.js is already loaded on all relevant entrypoints; no HTML changes are needed to make it common across all DEFAULT_LANG call sites. AppConstants would require at least one HTML insertion (flotante.html), so it is less minimal.

Deflation estimate
- Remove 7 duplicate `DEFAULT_LANG` constants across 8 public files.

Risk notes (Gate F2)
- Ensure the shared constant is exposed on `window.RendererI18n` before any dependent scripts execute (load order already satisfies this).

---

## (2) ELECTRON PRELOADS — Duplicated onSettingsChanged wrappers

Findings (evidence)
- Wrapper pattern appears in all four preloads (same semantics: create listener, `ipcRenderer.on('settings-updated', ...)`, return unsubscribe calling removeListener with try/catch):
  - electron/preload.js: onSettingsChanged wrapper lines 69–75.  
    Locator: electron/preload.js:69–75.
  - electron/editor_preload.js: onSettingsChanged wrapper lines 20–25.  
    Locator: electron/editor_preload.js:20–25.
  - electron/preset_preload.js: onSettingsChanged wrapper lines 68–73.  
    Locator: electron/preset_preload.js:68–73.
  - electron/flotante_preload.js: onSettingsChanged wrapper lines 26–31.  
    Locator: electron/flotante_preload.js:26–31.
- All four preloads already require the same logging module:
  - electron/preload.js: `const Log = require('./log');` (line 5).
  - electron/editor_preload.js: `const Log = require('./log');` (line 5).
  - electron/preset_preload.js: `const Log = require('./log');` (line 5).
  - electron/flotante_preload.js: `const Log = require('./log');` (line 5).
- Proposed host safety:
  - electron/log.js imports no BrowserWindow/app/Menu and has no side effects beyond logging setup; it reads `process.env` and defines helper functions (lines 1–120).  
    Locator: electron/log.js:1–120.

Host decision (evidence-based)
- **MERGEABLE via existing host: electron/log.js**.  
  Rationale: all preloads already depend on log.js; adding a helper export there introduces no new require edges and no cycles. Helper can accept `ipcRenderer`, `log`, and channel name as arguments to avoid importing Electron inside log.js.

Deflation estimate
- Remove 3 wrapper clones across 4 preloads (single shared helper used by all).

Risk notes (Gate F2)
- Keep helper signature explicit to avoid coupling log.js to Electron APIs; preserve per-preload error messages if required for diagnostics.

---

## (3) ELECTRON lang parsing helpers — MERGEABLE VIA HARDENING?

Findings (evidence)
- Definitions:
  - electron/settings.js: `normalizeLangTag` lines 33–34; `getLangBase` lines 36–40.  
    Locator: electron/settings.js:33–40.
  - electron/menu_builder.js: `normalizeLangTag` line 42; `getLangBase` lines 43–48.  
    Locator: electron/menu_builder.js:42–48.
  - electron/presets_main.js: `normalizeLangTag` lines 19–20; `normalizeLangBase` lines 23–26 (regex validates base with `/^[a-z0-9]+$/`).  
    Locator: electron/presets_main.js:19–26.
- Dataflow for language values:
  - language preload normalizes input before IPC: `String(lang || '').trim().toLowerCase().replace(/_/g, '-')` (line 8).  
    Locator: electron/language_preload.js:8.
  - settings IPC `set-language` normalizes again using `normalizeLangTag` (line 493).  
    Locator: electron/settings.js:490–505.
  - settings normalization of persisted settings applies `normalizeLangTag` (line 255).  
    Locator: electron/settings.js:252–256.
  - menu builder normalizes `lang` via `normalizeLangTag` before loading menu translations (line 220).  
    Locator: electron/menu_builder.js:219–221.
  - presets_main derives base for defaults via `normalizeLangBase` (line 173).  
    Locator: electron/presets_main.js:166–174.

Decision
- **NOT MERGEABLE (STOP)** for “merge via hardening” at this time.  
  Rationale: although all upstream flows normalize case and separators, there is no evidence in-scope that valid tags are restricted to bases matching `/^[a-z0-9]+$/`. Tightening `getLangBase` everywhere to the regex behavior could reject inputs that are currently accepted (e.g., tags with non-alphanumeric base segments). Without proof of tag constraints from in-scope dataflow, hardening cannot be justified.

Deflation estimate
- STOP (no safe merge).

Risk notes (Gate F2)
- If later evidence proves all runtime tags are within `[a-z0-9-]` (e.g., via manifest or enforced validation), re-evaluate for “MERGEABLE VIA HARDENING.”
nes 426-429.
   - public/editor.js: lines 94-105.
   - public/preset_modal.js: lines 134-145.
   - public/flotante.js: lines 102-109.
3) Result:
   - No provable re-entrant init in these files; STOP.
nes 426-429.
   - public/editor.js: lines 94-105.
   - public/preset_modal.js: lines 134-145.
   - public/flotante.js: lines 102-109.
3) Result:
   - No provable re-entrant init in these files; STOP.
nes 426-429.
   - public/editor.js: lines 94-105.
   - public/preset_modal.js: lines 134-145.
   - public/flotante.js: lines 102-109.
3) Result:
   - No provable re-entrant init in these files; STOP.
nes 426-429.
   - public/editor.js: lines 94-105.
   - public/preset_modal.js: lines 134-145.
   - public/flotante.js: lines 102-109.
3) Result:
   - No provable re-entrant init in these files; STOP.
nes 426-429.
   - public/editor.js: lines 94-105.
   - public/preset_modal.js: lines 134-145.
   - public/flotante.js: lines 102-109.
3) Result:
   - No provable re-entrant init in these files; STOP.
these files.
- Conclusion: no listener-accumulation candidate provable with current repo evidence.
nes 426-429.
   - public/editor.js: lines 94-105.
   - public/preset_modal.js: lines 134-145.
   - public/flotante.js: lines 102-109.
3) Result:
   - No provable re-entrant init in these files; STOP.
these files.
- Conclusion: no listener-accumulation candidate provable with current repo evidence.
nes 426-429.
   - public/editor.js: lines 94-105.
   - public/preset_modal.js: lines 134-145.
   - public/flotante.js: lines 102-109.
3) Result:
   - No provable re-entrant init in these files; STOP.
nes 426-429.
   - public/editor.js: lines 94-105.
   - public/preset_modal.js: lines 134-145.
   - public/flotante.js: lines 102-109.
3) Result:
   - No provable re-entrant init in these files; STOP.

## Gate F1.3 Corrections (evidence-only, contract-first)

### (1) PUBLIC: DEFAULT_LANG host decision (contract-first)
Findings (evidence):
- public/js/constants.js defines DEFAULTS and exposes window.AppConstants (lines 5-34).
- public/js/i18n.js exposes window.RendererI18n with loadRendererTranslations/tRenderer/msgRenderer (lines 50-183).
- HTML entrypoints script order:
  - public/index.html: log.js 129, constants.js 130, i18n.js 133, presets.js 134, count.js 135, format.js 136, renderer.js 138.
  - public/editor.html: i18n.js 28, constants.js 29, editor.js 30.
  - public/preset_modal.html: i18n.js 55, constants.js 56, preset_modal.js 57.
  - public/flotante.html: log.js 19, i18n.js 20, crono.js 21, flotante.js 22 (constants.js not loaded).
Decision (contract-first):
- Choose public/js/constants.js as DEFAULT_LANG host (constants owner). public/js/i18n.js is a translation loader, not a constants authority.
Minimal HTML insert/reorder plan (evidence-only; no edits):
- public/index.html: already loads constants.js before i18n.js (lines 129-133).
- public/editor.html: move constants.js before i18n.js (lines 28-29).
- public/preset_modal.html: move constants.js before i18n.js (lines 55-56).
- public/flotante.html: insert <script src="js/constants.js"></script> between lines 19-20 (before i18n.js).
Deflation estimate:
- Remove 7 duplicate DEFAULT_LANG constants across 8 public files (same scope as F1-A1).
Risk notes:
- Any i18n.js use of DEFAULT_LANG must read from AppConstants only after constants.js loads.

### (2) ELECTRON PRELOADS: onSettingsChanged wrapper duplication (contract-first)
Findings (evidence):
- Wrapper pattern appears in:
  - electron/preload.js: onSettingsChanged uses ipcRenderer.on('settings-updated') + removeListener (lines 69-75).
  - electron/editor_preload.js: onSettingsChanged wrapper (lines 20-25).
  - electron/preset_preload.js: onSettingsChanged wrapper (lines 68-73).
  - electron/flotante_preload.js: onSettingsChanged wrapper (lines 26-31).
- Each preload only requires electron + ./log (electron/preload.js:4-5, electron/editor_preload.js:4-5, electron/preset_preload.js:4-5, electron/flotante_preload.js:4-5).
- ipcRenderer occurs only in preloads (electron/preload.js:4, electron/editor_preload.js:4, electron/preset_preload.js:4, electron/flotante_preload.js:4, electron/language_preload.js:4).
Candidate host search (contract-first):
- electron/log.js is logging policy only (lines 1-24) -> contract mismatch.
- electron/constants_main.js exports constants (lines 1-9) -> contract mismatch.
- electron/settings.js owns persisted settings + IPC handlers (lines 7-15) -> main-only, not a preload helper.
- electron/menu_builder.js owns menus/dialogs and uses app/Menu (lines 7-18) -> main-only, not preload-safe.
Decision:
- STOP: no contract-correct existing host module for a shared preload IPC wrapper without creating a new module or crossing boundary.
Deflation estimate:
- Would remove 3 wrapper clones across 4 preloads, but blocked.
Risk notes:
- Forcing a main-process module into preloads would violate the boundary and risk side effects.

### (3) ELECTRON language helpers: merge via hardening?
Findings (evidence):
- Variants:
  - electron/settings.js: normalizeLangTag (33-34), getLangBase (36-39), deriveLangKey (44).
  - electron/menu_builder.js: normalizeLangTag (42), getLangBase (43-45).
  - electron/presets_main.js: normalizeLangTag (19-20), normalizeLangBase with regex /^[a-z0-9]+$/ (23-26).
  - electron/language_preload.js: inline normalization (8).
- Base usage:
  - electron/menu_builder.js: getLangBase for i18n paths (145-151).
  - electron/settings.js: deriveLangKey for numberFormat path (44, 65-66).
  - electron/presets_main.js: normalizeLangBase for defaults_presets_<lang>.json (66-70).
- Dataflow constraints:
  - public/language_window.html calls window.languageAPI.setLanguage(lang) (257-258).
  - electron/language_preload.js normalizes but does not validate (7-10).
  - electron/settings.js set-language normalizes but does not validate beyond empty (490-499).
  - electron/settings.js normalizeSettings uses normalizeLangTag on persisted settings (255-266).
Decision:
- STOP (NOT MERGEABLE VIA HARDENING): no repo-proof that valid language tags/bases are restricted to /^[a-z0-9]+$/; stricter normalizeLangBase could change behavior for valid-but-nonconforming tags from settings or manifest inputs.
Deflation estimate:
- If mergeable, could remove 2 helper clones (menu_builder + presets_main) by reusing settings helpers; blocked.
Risk notes:
- Hardening could change file-path selection or preset bucket selection for tags with non-alnum base, leading to different defaults/presets.

---

# Gate F1.4 Addendum (assistant audit, evidence-only, pack-based)

Este addendum consolida (a) las conclusiones de la revisión anterior (post-F1.3) y (b) la revisión actual usando evidencia directa de los archivos subidos (HTML + public/** + electron/** relevantes).

## A) Estado de la revisión anterior (post-F1.3): conclusiones registradas

1) **Mejora material en F1.3 (criterio)**: F1.3 corrigió el sesgo “dependency host” y volvió a un criterio contract-first (contrato/responsabilidad > conveniencia de dependencias).
2) **Problema objetivo persistente**: el documento quedó autocontradictorio (F1/F1.2 decían host en i18n.js; F1.3 decía host en constants.js) y además contiene “basura” repetida al final (fragmentos “nes 426-429…” duplicados muchas veces). Eso invalida al documento como “artefacto final” hasta limpieza.
3) **Dudas abiertas que había que cerrar con evidencia adicional**:
   - Si existía enumeración/manifest “source-of-truth” para idiomas (para evaluar hardening).
   - Si existía un host preload/IPC ya presente (para evaluar STOP vs MERGEABLE en wrappers de preloads).

## B) Revisión actual (con evidencia del set subido): decisiones consolidadas

### B1) PUBLIC — DEFAULT_LANG: host por contrato + prerequisitos runtime

**Evidencia (contrato y uso real)**
- `public/js/constants.js` expone `window.AppConstants` y ya opera como autoridad de constantes (no “bucket nominal”):
  - Define `AppConstants` y lo publica en `window` (constants.js:18–34).
- Los window scripts consumen activamente `AppConstants` y fallan si no existe:
  - renderer.js: `const { AppConstants } = window; if (!AppConstants) throw ...` (renderer.js:10–16) y luego extrae límites (renderer.js:18–30).
  - editor.js: mismo patrón (editor.js:10–15) y extrae límites (editor.js:17–18).
  - preset_modal.js: mismo patrón (preset_modal.js:29–35).

**Estado de load-order (HTML)**
- index.html ya carga `js/constants.js` antes de `js/i18n.js` (index.html:129–133).
- editor.html carga `js/i18n.js` antes de `js/constants.js` (editor.html:28–29) — hoy esto es suficiente para `editor.js` (porque `editor.js` viene después), pero **NO** es suficiente si `i18n.js` debe leer DEFAULT_LANG desde AppConstants (deflation total).
- preset_modal.html idem: `js/i18n.js` antes de `js/constants.js` (preset_modal.html:55–56).
- flotante.html **no** carga `js/constants.js` (flotante.html:19–22 muestra `js/log.js`, `js/i18n.js`, `js/crono.js`, `flotante.js`).

**Decisión consolidada (contract-first)**
- **Host preferido para DEFAULT_LANG: `public/js/constants.js` (AppConstants)**.
  - Motivo: ya es autoridad efectiva de constantes transversales (renderer/editor/preset_modal) y su “contrato” es exactamente constants authority. `public/js/i18n.js` es subsistema de traducciones (loader + t/msg), no autoridad de constantes.

**Implicancia Gate F2 (si el objetivo es deflation total)**
- Para que `public/js/i18n.js` también deje de declarar DEFAULT_LANG y lo lea de AppConstants:
  - editor.html: mover `js/constants.js` antes de `js/i18n.js`.
  - preset_modal.html: mover `js/constants.js` antes de `js/i18n.js`.
  - flotante.html: insertar `js/constants.js` y además asegurar que quede antes de `js/i18n.js`.

**Precedencia explícita**
- Esta decisión **supera** lo declarado en F1-A1/F1.2 que proponía host en `public/js/i18n.js`.

---

### B2) ELECTRON PRELOADS — onSettingsChanged wrapper: STOP reforzado (búsqueda exhaustiva)

**Evidencia de duplicación (preloads)**
- Cada preload define su propio wrapper `onSettingsChanged` con `ipcRenderer.on('settings-updated', ...)` y unsubscribe con `removeListener`:
  - electron/preload.js: bloque `onSettingsChanged` (preload.js:73–75).
  - electron/editor_preload.js: bloque `onSettingsChanged` (editor_preload.js:24–25).
  - electron/preset_preload.js: bloque `onSettingsChanged` (preset_preload.js:72–73).
  - electron/flotante_preload.js: bloque `onSettingsChanged` (flotante_preload.js:30–31).

**Búsqueda de host existente (evidence-based)**
- En el árbol (tree_folders_files.md) no aparece ningún módulo “boundary preload shared” existente (tipo `preload_utils.js`, `ipc_bridge.js`, etc.). Solo están los preloads por ventana.
- El único módulo común requerido por todos los preloads es el logger (`./log`), pero su contrato es logging/policy, no IPC helper (contract mismatch).

**Decisión consolidada**
- **STOP**: no hay host contract-correct existente para consolidar wrappers **sin**:
  - crear un módulo nuevo (prohibido bajo tus restricciones), o
  - introducir dependencias cruzadas entre preloads (también contract-mismatch: mezclar APIs window-specific).

**Precedencia explícita**
- Esta decisión reafirma lo que se argumentó en la revisión post-F1.3: la idea “MERGEABLE en log.js” (F1.2) queda **superada** por contract mismatch.

---

### B3) ELECTRON language helpers — “MERGEABLE VIA HARDENING” ahora SÍ (con repo-proof de enumeración)

Aquí el punto crítico era si existía evidencia de que los idiomas/tags válidos están acotados a un set controlado (para justificar endurecer `getLangBase`/`normalizeLangBase` sin cambiar inputs válidos).

**Evidencia: source enumeration controlada (end-to-end)**
- main.js expone IPC `get-available-languages` leyendo `i18n/languages.json`:
  - `ipcMain.handle('get-available-languages', ...)` (main.js:885–918).
  - Lee archivo: `path.join(__dirname, '..', 'i18n', 'languages.json')` (main.js:899).
  - Normaliza shape: requiere `tag` y `label` no vacíos (main.js:902–911) y retorna lista filtrada.
- language_preload.js entrega esa lista al renderer:
  - `getAvailableLanguages: () => ipcRenderer.invoke('get-available-languages')` (language_preload.js:18–21).
- language_window.html construye la UI desde esa lista (no input libre):
  - `const available = await window.languageAPI.getAvailableLanguages();` (language_window.html:328).
  - Renderiza botones por cada `{tag,label}` (language_window.html:345–356).
  - Al click: `await window.languageAPI.setLanguage(lang)` donde `lang` proviene de `dataset.lang` (language_window.html:256–259).

**Repo-proof del criterio de hardening**
- El manifest `i18n/languages.json` (pack subido) contiene tags:
  - `es`, `es-cl`, `en`, `en-us`, `en-gb`, `fr`, `de`, `zh`, `ja`, `ru`.
- En todos esos casos, el **base** (segmento antes del primer `-`) cumple `/^[a-z0-9]+$/`.
- Por lo tanto, endurecer “base normalization” al estilo `normalizeLangBase()` de presets_main (regex para base) **no cambia inputs válidos** del dataflow real; solo afectaría valores fuera del manifest (p.ej. settings tampered o IPC externo no legítimo).

**Decisión consolidada**
- **MERGEABLE VIA HARDENING** para unificar helpers de idioma en main-process modules:
  - settings.js (settings.js:35–43) y menu_builder.js (menu_builder.js:52–59) tienen helpers equivalentes.
  - presets_main.js agrega defensa extra `normalizeLangBase` con regex (presets_main.js:23–27), ahora justificable como comportamiento estándar porque el source-of-truth de tags lo respeta.

**Límites (se mantienen)**
- El inline normalize en `language_preload.js` sigue siendo **STOP** para deflation (barrera preload/main): consolidarlo requeriría un módulo shared preload-safe o cruzar boundary.

**Precedencia explícita**
- Esta decisión **supera** el STOP de F1.3 en “merge via hardening”, porque ahora sí hay repo-proof de enumeración/manifest para idiomas (main.js + language_preload.js + language_window.html + languages.json).

---

## C) Nota de higiene del artefacto (no cambia decisiones, pero debe registrarse)

El documento actual contiene un tramo corrupto/duplicado (“nes 426-429...” repetido múltiples veces). Eso no es evidencia; es basura de edición. Recomendación documental:
- En la próxima pasada de limpieza del artefacto, borrar esas repeticiones y agregar una regla de precedencia explícita:
  - “F1.3 + F1.4 supersede F1/F1.2 para DEFAULT_LANG host, preloads wrapper decision, y hardening decision”.

# Gate F1 — Consolidated Decisions (Authoritative) + F2 Implementation Plan

This section is AUTHORITATIVE for Gate F2. Where earlier sections (F1 / F1.1 / F1.2 / F1.3) conflict, this section supersedes them.

## 0) Consolidated decisions (what will be implemented in F2)

### D0.1 PUBLIC DEFAULT_LANG — host decision (contract-first)
Decision:
- Host DEFAULT_LANG in `public/js/constants.js` under `window.AppConstants` (constants authority).
- This supersedes F1-A1 and F1.2 where DEFAULT_LANG was proposed under `public/js/i18n.js`.

Rationale:
- `AppConstants` is already actively consumed by window scripts (renderer/editor/preset_modal) and treated as a required runtime authority (throws if missing).
- `i18n.js` remains the translation subsystem owner; it should read DEFAULT_LANG from AppConstants after load-order is correct.

F2 implication:
- Ensure `constants.js` loads BEFORE `i18n.js` on every entrypoint that loads `i18n.js`.
- Ensure `constants.js` is loaded on flotante entrypoint (currently missing per F1.3).

Deflation target:
- Remove DEFAULT_LANG duplicates across the 8 public files listed in F1-A1.

---

### D0.2 PUBLIC normalizeLangTag/getLangBase — host decision
Decision:
- Keep language parsing helpers in `public/js/i18n.js` (RendererI18n) and reuse from other public/js modules via the `window.RendererI18n` API.
- This keeps “constants authority” (AppConstants) separate from “i18n/language parsing owner” (RendererI18n).

Deflation target:
- Remove helper clones in `public/js/presets.js` and `public/js/format.js` (and any additional duplicates found in-scope, e.g. `public/js/count.js` if present as per F1-A2).

---

### D0.3 ELECTRON preload onSettingsChanged wrapper — STOP
Decision:
- STOP for consolidating the duplicated preload `onSettingsChanged` wrappers under current constraints (no new modules; no contract-mismatched host like log.js; no cross-preload coupling).

This supersedes F1.2’s “MERGEABLE via log.js” conclusion.

---

### D0.4 ELECTRON DEFAULT_LANG — implement as planned (constants_main)
Decision:
- Keep the candidate F1-A5: centralize electron DEFAULT_LANG in `electron/constants_main.js` and remove duplicates in the 5 electron files listed in F1-A5.

---

### D0.5 ELECTRON resolveDialogText(dialogTexts, key, fallback) — implement as planned (menu_builder)
Decision:
- Keep candidate F1-A3: host shared dialog-text resolution helper in `electron/menu_builder.js` (dialogs/texts owner) and reuse from `electron/presets_main.js` and `electron/updater.js`.

---

### D0.6 ELECTRON language helpers — implement merge with controlled hardening ONLY IF enumeration path is confirmed
Decision:
- Implement candidate F1-A4 (and F1.1-A1): unify `normalizeLangTag` + `getLangBase` under a single electron owner (preferred: `electron/settings.js`, which already owns language normalization for persisted settings).
- OPTIONAL hardening alignment with `presets_main.normalizeLangBase` is allowed ONLY if the runtime language selection is proven to be sourced from a controlled enumeration (manifest-driven) rather than free-form user input.

Practical rule for F2:
- If (and only if) language selection is driven by `i18n/languages.json` → IPC → language_window (manifest-controlled), then:
  - adopt the stricter base rule (alnum base) as the shared standard, because it does not affect valid tags from the manifest and only changes behavior for tampered/invalid inputs.
- If this proof is not fully present in-repo, implement ONLY the merge of identical semantics (no hardening change) and leave presets_main’s stricter behavior as-is (STOP for hardening).

Note:
- `electron/language_preload.js` inline normalization remains STOP (preload/main boundary).

---

### D0.7 PUBLIC renderer redundant execution — implement as planned
Decision:
- Implement F1-B1: remove the provably redundant duplicate `updatePreviewAndResults(currentText)` call in `public/renderer.js` when `idiomaCambio` is true (preserving correctness for `modeConteo` changes).

---

## 1) F2 implementation plan (minimal diffs, ordered)

### Step 1 — PUBLIC runtime prerequisites (HTML load-order + constants authority)
Files:
- `public/js/constants.js`
- `public/js/i18n.js`
- `public/index.html`
- `public/editor.html`
- `public/preset_modal.html`
- `public/flotante.html`

Changes:
1) Add `DEFAULT_LANG` to AppConstants (single source of truth).
2) Update `public/js/i18n.js` to read DEFAULT_LANG from `window.AppConstants.DEFAULT_LANG` (no local DEFAULT_LANG constant).
3) Enforce load-order: `constants.js` must load before `i18n.js` on entrypoints that load i18n.
4) Ensure flotante entrypoint loads `constants.js` (and before i18n.js).

Acceptance checks:
- No window throws “AppConstants no disponible” on any entrypoint.
- i18n loads without relying on a local DEFAULT_LANG.

---

### Step 2 — PUBLIC DEFAULT_LANG deduplication (remove 7 duplicates)
Files (per F1-A1):
- `public/renderer.js`
- `public/editor.js`
- `public/preset_modal.js`
- `public/flotante.js`
- `public/js/i18n.js`
- `public/js/presets.js`
- `public/js/format.js`
- `public/js/count.js` (if present)

Changes:
- Replace local `DEFAULT_LANG = 'es'` with `AppConstants.DEFAULT_LANG` (or destructure once at top).
- Remove the duplicated constant declarations.

Acceptance checks:
- Language fallback/default behavior unchanged (still defaults to same language value, now sourced from AppConstants).
- No ReferenceError for AppConstants (guarded by Step 1 load-order).

---

### Step 3 — PUBLIC helper deduplication (normalizeLangTag/getLangBase)
Files:
- `public/js/i18n.js`
- `public/js/presets.js`
- `public/js/format.js` (and any other duplicates found in-scope)

Changes:
1) Expose the helpers on `window.RendererI18n` (or equivalent existing export object).
2) Remove duplicated helper implementations from presets/format and call the shared ones.

Acceptance checks:
- No change in normalization semantics.
- Script load order already satisfies RendererI18n availability where used (confirm on index.html; other entrypoints only if those scripts load there).

---

### Step 4 — PUBLIC redundant execution (renderer)
Files:
- `public/renderer.js`

Change:
- Refactor the `settings-updated` handler so `updatePreviewAndResults(currentText)` is called exactly once per event under the `idiomaCambio` path, while preserving correctness when `modeConteo` changes.

Acceptance checks:
- Language change still triggers exactly one render/update.
- Mode change still triggers a render/update after mode is applied.

---

### Step 5 — ELECTRON DEFAULT_LANG deduplication (constants_main)
Files:
- `electron/constants_main.js`
- `electron/main.js`
- `electron/menu_builder.js`
- `electron/settings.js`
- `electron/presets_main.js`
- `electron/updater.js`

Changes:
- Add DEFAULT_LANG export to `constants_main.js`.
- Replace the 4 duplicate constants with imports from constants_main.

Acceptance checks:
- No require cycles introduced (constants_main must remain low-level).
- Default language behavior unchanged.

---

### Step 6 — ELECTRON dialog helper deduplication (resolveDialogText)
Files:
- `electron/menu_builder.js`
- `electron/presets_main.js`
- `electron/updater.js`

Changes:
- Add/export shared helper from menu_builder (dialog texts owner).
- Replace duplicated implementations in presets_main/updater with calls to the shared helper, preserving warnOnce key prefix behavior (parameterized).

Acceptance checks:
- Missing dialog text behavior unchanged (warnOnce + fallback).

---

### Step 7 — ELECTRON language helpers merge (settings as owner)
Files:
- `electron/settings.js`
- `electron/menu_builder.js`
- `electron/presets_main.js`

Changes (base merge, always allowed):
- Export `normalizeLangTag` + `getLangBase` from settings.js (or another contract-correct existing owner).
- Update menu_builder + presets_main to reuse them.
- Remove duplicates.

Optional hardening (only if enumeration is proven manifest-driven end-to-end):
- Align base handling to the stricter rule (alnum base), ensuring valid manifest tags are unaffected.
- Keep preload boundary intact (language_preload stays local).

Acceptance checks:
- i18n path selection still resolves correctly for current supported languages.
- presets defaults file selection remains correct (`defaults_presets_<base>.json` behavior preserved).

---

## 2) F2 smoke checklist (human-run; minimal)
1) Launch app (main window) → no console errors; UI renders.
2) Open Editor window → no “AppConstants missing” error; editor works.
3) Open Preset modal → no missing AppConstants; preset list renders.
4) Open Flotante window → no missing AppConstants; i18n strings render.
5) Change language via language window → all open windows receive `settings-updated` and update once; no duplicate render artifacts.
6) Restart app → persisted language respected; fallbacks behave as before.
7) Trigger any dialogs relying on dialogTexts (presets/updater flows) → texts resolved; missing keys still warnOnce + fallback.

END.
