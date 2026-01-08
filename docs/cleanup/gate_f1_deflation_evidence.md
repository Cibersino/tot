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
