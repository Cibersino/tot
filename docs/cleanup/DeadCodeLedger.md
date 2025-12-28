# Dead Code Ledger (single-source ledger; de-duplicated)
> Goal: keep ONE ledger for dead code candidates + contract surfaces + fallback risks.
> Anti-noise rule: evidence file lists live ONLY in the RUN index (§1). The rest of the ledger references RUN_IDs.

---

## 0) Bootstrap metadata
- HEAD: 738e9e0ac1641bfebe90e0fb184823b3dcabeb97
- Madge seed: electron/main.js (VERIFIED by evidence in EntryPointsInventory.md)
- Evidence root: docs/cleanup/_evidence/deadcode/

---

## 1) Evidence index (RUN_ID → folder → files)
> Convention: each run folder is `docs/cleanup/_evidence/deadcode/<RUN_ID>/`.
> The rest of the ledger references RUN_IDs; do NOT repeat file lists elsewhere.

### 1.1 Phase 4 — dynamic evidence (DEADCODE_AUDIT=1)
- RUN_ID: 20251223-130514 (audit smoke / wide coverage)
  - runtime_contracts.log
- RUN_ID: 20251224-133600 (audit baseline / noclick)
  - runtime_contracts.noclick.log

### 1.2 Phase 4 — focused static closure (targeted greps)
- RUN_ID: 20251224-141817 (grep preset-deleted/restored)
  - contracts.preset-deleted.grep.log
  - contracts.preset-restored.grep.log
- RUN_ID: 20251224-141839 (grep crono-state)
  - contracts.crono-state.grep.log

### 1.3 Phase 5 — execution evidence (micro-batches)
- RUN_ID: 20251225-085925 (Batch-01 patch + post-grep + smoke)
  - patch.electron_presets_main_js.diff.log
  - post.contracts.preset-deleted.grep.log
  - post.contracts.preset-restored.grep.log
  - smoke.presets_delete_restore.log

- RUN_ID: 20251225-095824 (Batch-02 micro-batch: menu_builder exports)
  - patch.electron_menu_builder_js.diff.log
  - post.export.loadMainTranslations.grep.log
  - post.usage.menuBuilder_loadMainTranslations.grep.log
  - smoke.menu_builder_exports.log

- RUN_ID: 20251225-102709 (Batch-02 micro-batch: presets_main exports)
  - pre.usage.loadDefaultPresetsCombined.grep.log
  - pre.usage.presetsMain_loadDefaultPresetsCombined.grep.log
  - pre.bracket.sq.loadDefaultPresetsCombined.grep.log
  - pre.bracket.dq.loadDefaultPresetsCombined.grep.log
  - patch.electron_presets_main_js.exports.diff.log
  - post.export.loadDefaultPresetsCombined.grep.log
  - post.usage.loadDefaultPresetsCombined.grep.log
  - smoke.batch02_presets_exports.log

- RUN_ID: 20251225-121246 (Batch-02 micro-batch: updater exports)
  - pre.usage.checkForUpdates.grep.log
  - pre.usage.updater_checkForUpdates.grep.log
  - pre.bracket.sq.checkForUpdates.grep.log
  - pre.bracket.dq.checkForUpdates.grep.log
  - patch.electron_updater_js.exports.diff.log
  - post.export.checkForUpdates.grep.log
  - post.usage.updater_checkForUpdates.grep.log
  - smoke.batch02_updater_exports.log

- RUN_ID: 20251226-074013 (Batch-02.4 micro-batch: settings exports)
  - pre.usage.loadNumberFormatDefaults.grep.log
  - pre.usage.normalizeSettings.grep.log
  - pre.usage.settingsState_loadNumberFormatDefaults.grep.log
  - pre.usage.settingsState_normalizeSettings.grep.log
  - pre.bracket.sq.loadNumberFormatDefaults.grep.log
  - pre.bracket.dq.loadNumberFormatDefaults.grep.log
  - pre.bracket.sq.normalizeSettings.grep.log
  - pre.bracket.dq.normalizeSettings.grep.log
  - patch.electron_settings_js.exports.diff.log
  - post.export.loadNumberFormatDefaults.grep.log
  - post.export.normalizeSettings.grep.log
  - post.usage.settingsState_loadNumberFormatDefaults.grep.log
  - post.usage.settingsState_normalizeSettings.grep.log
  - smoke.batch02_settings_exports.log

- RUN_ID: 20251226-083027 (Batch-02.5 attempted removal: text_state export getCurrentText — FAILED)
  - pre.usage.getCurrentText.grep.log
  - pre.require.text_state.grep.log
  - pre.usage.anyobj_getCurrentText.grep.log
  - pre.bracket.sq.getCurrentText.grep.log
  - pre.bracket.dq.getCurrentText.grep.log
  - patch.electron_text_state_js.exports.diff.log
  - post.export.getCurrentText.grep.log
  - post.usage.anyobj_getCurrentText.grep.log
  - post.bracket.sq.getCurrentText.grep.log
  - post.bracket.dq.getCurrentText.grep.log
  - smoke.batch02_text_state_exports.log

- RUN_ID: 20251226-093413 (Phase 5 retro-audit validation of prior export-surface removals; RetroAuditCorrections.md; PASS)
  - retro.loadMainTranslations.importers.grep.log
  - retro.loadMainTranslations.all_importer_refs.grep.log
  - retro.loadMainTranslations.external_refs.grep.log
  - retro.loadMainTranslations.prop_anyobj.importers.grep.log
  - retro.loadMainTranslations.bracket.sq.importers.grep.log
  - retro.loadMainTranslations.bracket.dq.importers.grep.log
  - retro.loadMainTranslations.post.export_item.grep.log
  - retro.loadDefaultPresetsCombined.importers.grep.log
  - retro.loadDefaultPresetsCombined.all_importer_refs.grep.log
  - retro.loadDefaultPresetsCombined.external_refs.grep.log
  - retro.loadDefaultPresetsCombined.prop_anyobj.importers.grep.log
  - retro.loadDefaultPresetsCombined.bracket.sq.importers.grep.log
  - retro.loadDefaultPresetsCombined.bracket.dq.importers.grep.log
  - retro.loadDefaultPresetsCombined.post.export_item.grep.log
  - retro.checkForUpdates.importers.grep.log
  - retro.checkForUpdates.all_importer_refs.grep.log
  - retro.checkForUpdates.external_refs.grep.log
  - retro.checkForUpdates.prop_anyobj.importers.grep.log
  - retro.checkForUpdates.bracket.sq.importers.grep.log
  - retro.checkForUpdates.bracket.dq.importers.grep.log
  - retro.checkForUpdates.post.export_item.grep.log
  - retro.loadNumberFormatDefaults.importers.grep.log
  - retro.loadNumberFormatDefaults.all_importer_refs.grep.log
  - retro.loadNumberFormatDefaults.external_refs.grep.log
  - retro.loadNumberFormatDefaults.prop_anyobj.importers.grep.log
  - retro.loadNumberFormatDefaults.bracket.sq.importers.grep.log
  - retro.loadNumberFormatDefaults.bracket.dq.importers.grep.log
  - retro.loadNumberFormatDefaults.post.export_item.grep.log
  - retro.normalizeSettings.importers.grep.log
  - retro.normalizeSettings.all_importer_refs.grep.log
  - retro.normalizeSettings.external_refs.grep.log
  - retro.normalizeSettings.prop_anyobj.importers.grep.log
  - retro.normalizeSettings.bracket.sq.importers.grep.log
  - retro.normalizeSettings.bracket.dq.importers.grep.log
  - retro.normalizeSettings.post.export_item.grep.log
  - retro.regression.smoke.log
  - retro.regression.errors.extract.log

- RUN_ID: 20251226-201750 (A2 micro-batch: remove unused getCurrentLanguage wire)
  - run_id.txt
  - evidence_path.txt
  - git_status.pre.log
  - rg.getCurrentLanguage.pre.log
  - eslint.pre.log
  - patch.A2.diff.log
  - rg.getCurrentLanguage.post.log
  - eslint.post.log
  - smoke.A2.log
  - smoke.A2.errors.grep.log

- RUN_ID: 20251226-210621 (A1 micro-batch: remove unused language-selected handler params)
  - run_id.txt
  - evidence_path.txt
  - git_status.pre.log
  - rg.language-selected.pre.log
  - eslint.pre.log
  - patch.A1.diff.log
  - rg.language-selected.post.log
  - eslint.post.log
  - git_status.post.log
  - smoke.A1.log
  - smoke.A1.errors.grep.log

- RUN_ID: 20251226-213650 (A3 micro-batch: harden showNotice global contract)
  - run_id.txt
  - evidence_path.txt
  - git_status.pre.log
  - rg.showNotice.editor.pre.log
  - rg.showNotice.notify.pre.log
  - eslint.pre.log
  - patch.A3.diff.log
  - rg.showNotice.editor.post.log
  - eslint.post.log
  - git_status.post.log
  - smoke.A3.log
  - smoke.A3.errors.grep.log

- RUN_ID: 20251226-234329 (A4 micro-batch: remove unused `language` params in count.js)
  - run_id.txt
  - evidence_path.txt
  - git_status.pre.log
  - rg.count.A4.pre.log
  - eslint.pre.log
  - patch.A4.diff.log
  - rg.count.A4.post.log
  - eslint.post.log
  - smoke.A4.log
  - smoke.A4.errors.grep.log

- RUN_ID: 20251227-111217 (A5 micro-batch: renderer.js no-unused-vars cleanup)
  - run_id.txt
  - evidence_path.txt
  - git_status.pre.log
  - rg.A5.renderer.sites.pre.log
  - rg.A5.RendererCrono.contract.pre.log
  - rg.A5.menuClick.wiring.pre.log
  - eslint.pre.log
  - patch.A5.diff.log
  - rg.A5.renderer.sites.post.log
  - rg.A5.RendererCrono.contract.post.log
  - rg.A5.menuClick.wiring.post.log
  - eslint.post.log
  - smoke.A5.log
  - smoke.A5.errors.grep.log
  - git_status.post.log

- RUN_ID: 20251227-170712 (B2 PRE gate FAIL: editor_state export `loadInitialState` is USED_EXTERNALLY)
  - head.pre.log
  - pre.importers.editor_state.grep.log
  - pre.external_refs.loadInitialState.grep.log

- RUN_ID: 20251227-172132 (B2 PRE gate FAIL: editor_state export `attachTo` is USED_EXTERNALLY)
  - head.pre.log
  - pre.importers.editor_state.grep.log
  - pre.external_refs.attachTo.grep.log

- RUN_ID: 20251227-183903 (B2 PRE gate pack: remaining unused-export signals — ALL FAIL => USED_EXTERNALLY)
  - git_status.pre.log
  - head.pre.log
  - pre.importers.*.grep.log
  - pre.external_refs.*.grep.log
  - result.*.txt
  - (supporting) pre.all_importer_refs.*.grep.log
  - (supporting) pre.prop_anyobj.*.grep.log
  - (supporting) pre.bracket.*.grep.log

- RUN_ID: 20251227-192943 (D1.1 micro-batch: main swallow visibility — replace noop markers with warnOnce + guards)
  - git_status.pre.log
  - head.pre.log
  - rg.D1.noop_catches.main.pre.log
  - rg.D1.webContents_send.main.pre.log
  - rg.D1.setBounds.main.pre.log
  - rg.D1.noop_markers.main.pre.log
  - rg.D1.noop_markers.main.pre.context.log
  - patch.D1_1.diff.log
  - eslint.post.log
  - rg.D1.noop_markers.main.post.log
  - smoke.D1_1.log
  - git_status.post.log
  - run_id.txt
  - evidence_path.txt

- RUN_ID: 20251227-235800 (D2–D5 PRE inventory + D4.1 micro-batch: flotante swallow visibility)
  - git_status.pre.log
  - head.pre.log
  - rg.D2D3.noop_markers.editor.pre.log
  - rg.D2D3.noop_markers.editor.context.log
  - rg.D4.noop_markers.flotante.pre.log
  - rg.D4.noop_markers.flotante.context.log
  - rg.D5.noop_markers.renderer.pre.log
  - rg.D5.noop_markers.renderer.context.log
  - rg.D2D5.empty_catch.public.pre.log
  - patch.D4_1.diff.log
  - eslint.post.log
  - rg.D4.noop_markers.flotante.post.log
  - smoke.D4_1.log
  - git_status.post.log
  - run_id.txt
  - evidence_path.txt

### 1.4 Phase 3 — tool outputs ingested (static scan)
- RUN_ID: 20251227-184005 (Phase 3 sweep: eslint + knip + madge + depcheck; reproducible)
  - git_status.pre.log
  - head.pre.log
  - eslint.log
  - knip.log
  - madge.circular.log
  - madge.orphans.log
  - depcheck.log
  - run_id.txt
  - evidence_path.txt

---

## 2) Rules / gates (short)
- Class A/B: delete only with strong static evidence + focused smoke.
- Class C: delete only with static + dynamic evidence (used vs defined / sent vs listened).
- Class D: do not delete “because unused”; enforce failure visibility policy instead.

---

## 3) Evidence matrix (micro-batches standard)
> Use this exact matrix for any “unused export” removal (knip LOW/MED signals).
> Rationale: repo-wide identifier greps can be polluted by symbol collisions; the hard gate must be importer-scoped.

1) PRE: discover importers of the owner module (CommonJS `require(...)`, scoped to `electron/`)
2) PRE: identifier grep for `sym` scoped to importer files (catches destructuring/direct refs)
3) PRE: property access grep `.$sym` scoped to importer files
4) PRE: bracket access grep (sq + dq) scoped to importer files: `['sym']` / `["sym"]`
5) PATCH: minimal diff (export surface only; keep internal helper)
6) POST: export grep in owner (must be empty): `^\s*sym\s*,?\s*$`
7) SMOKE: focused scenario (depends on module); treat any runtime console error as FAIL

---

## 4) Phase 4 — Dynamic evidence summary (DEADCODE_AUDIT=1)
Purpose:
- Close contract uncertainty by observing runtime: IPC registrations, renderer IPC usage/subscriptions, main push events executed, and menu usage.
Interpretation note:
- IPC_USED includes invoke/send AND listener subscription (ipcRenderer.on/once). It is “contract surface touched”, not “message executed”.

### 4.1 Baseline (noclick) — RUN_ID 20251224-133600
Observed:
- MENU_USED = [] while MENU_DEFINED populated (sanity check OK).
- MAIN_PUSH_SENT minimal (only `crono-state` observed in this baseline).
- IPC_DEFINED is run-dependent: `language-selected` absent here (consistent with conditional registration).

Takeaways:
- MENU_USED instrumentation is clean (no false positives).
- Some IPC registrations are conditional; absence in short runs is not proof of absence.

### 4.2 Smoke (wide coverage) — RUN_ID 20251223-130514
Observed:
- MENU_DEFINED == MENU_USED (all commands clicked at least once).
- MAIN_PUSH_SENT contains (among others): `preset-deleted`, `preset-restored`.
- IPC_USED does NOT contain `preset-deleted` nor `preset-restored`.

Derived closure signal (critical):
- Sent-but-not-listened candidates (MAIN_PUSH_SENT − IPC_USED):
  - `preset-deleted`
  - `preset-restored`

### 4.3 Focused static closure for push-only channels — RUN_ID 20251224-141817
Repo-wide fixed-string grep (excluding docs/** and *.md):
- `preset-deleted`: only present as send/log strings in electron/presets_main.js; no listeners in preload/renderer.
- `preset-restored`: only present as send/log strings in electron/presets_main.js; no listeners in preload/renderer.

Conclusion:
- `preset-deleted` and `preset-restored` are executed push events with no listeners anywhere.
- Treat as dead push contracts (Class C) and remove via one focused micro-batch + smoke.

---

## 5) Phase 5 — Micro-batches execution log (minimal diffs + focused smoke)

### 5.1 Batch-01 — remove dead push-only channels: `preset-deleted`, `preset-restored`
Change:
- Removed all `webContents.send('preset-deleted', ...)` and `webContents.send('preset-restored', ...)` sites from `electron/presets_main.js`.

Verification:
- Post-check: grep must return empty for both strings inside electron/presets_main.js.
- Smoke: delete preset flow + restore defaults flow.

Evidence:
- RUN_ID: 20251225-085925 (see §1.3)

### 5.2 Batch-02 — unused exports (knip LOW/MED): remove unused export surface (micro-batches)

#### 5.2.1 micro-batch — electron/menu_builder.js: stop exporting `loadMainTranslations` (internal helper retained)
Change:
- Removed `loadMainTranslations` from `module.exports` in electron/menu_builder.js (function remains; still used internally by getDialogTexts/buildAppMenu).

Verification:
- Post export grep must be empty.
- Post usage grep for `menuBuilder.loadMainTranslations` must be empty.
- Smoke: `npm start`.

Evidence:
- RUN_ID: 20251225-095824 (see §1.3)

#### 5.2.2 micro-batch — electron/presets_main.js: stop exporting `loadDefaultPresetsCombined` (internal helper retained)
Change:
- Removed `loadDefaultPresetsCombined` from `module.exports` in electron/presets_main.js (function retained; behavior unchanged).

Verification:
- Pre: identifier/property/bracket checks.
- Post: export grep empty; repo-wide occurrences must remain internal-only.
- Smoke: `npm start`.

Evidence:
- RUN_ID: 20251225-102709 (see §1.3)

#### 5.2.3 micro-batch — electron/updater.js: stop exporting `checkForUpdates` (internal helper retained)
Change:
- Removed `checkForUpdates` from `module.exports` in electron/updater.js (function retained; behavior unchanged).

Verification:
- Pre: identifier/property/bracket checks.
- Post: export grep empty; `updater.checkForUpdates` must be absent.
- Smoke: `npm start` + menu action “actualizar version”.

Evidence:
- RUN_ID: 20251225-121246 (see §1.3)

#### 5.2.4 micro-batch — electron/settings.js: stop exporting `normalizeSettings` and `loadNumberFormatDefaults` (internal helpers retained)
Change:
- Removed `normalizeSettings` and `loadNumberFormatDefaults` from `module.exports` in electron/settings.js (functions retained; behavior unchanged).

Verification:
- Pre: identifier/property/bracket checks (per §3).
- Post: export grep empty for both symbols in electron/settings.js.
- Post: usage grep for `settingsState.normalizeSettings` and `settingsState.loadNumberFormatDefaults` must be empty.
- Smoke: `npm start` + settings read/write + language set + mode conteo set.

Evidence:
- RUN_ID: 20251226-074013 (see §1.3)

#### 5.2.5 micro-batch — `electron/text_state.js`: attempted removal of `getCurrentText` export — FAILED (external consumer)

Change (attempt):
- Removed `getCurrentText` from `module.exports` in `electron/text_state.js`.

Gate rule:
- If pre-check shows **any external consumers** (outside `electron/text_state.js`) for `.getCurrentText`, STOP (do not remove the export surface).

Observed (pre-check; external usage exists):
- `electron/main.js:203` — `textState.getCurrentText()`
- `electron/main.js:770` — `textState.getCurrentText()`
- (Renderer contract still exists via preload bridges)
  - `public/editor.js:427` — `window.editorAPI.getCurrentText()`
  - `public/renderer.js:339,821` — `window.electronAPI.getCurrentText()`

Result (smoke):
- Runtime error on app start:
  - `TypeError: textState.getCurrentText is not a function`
  - Logged at `electron/main.js:203` (editor init path).

Conclusion:
- **NO DEAD / FALSE POSITIVE** for “unused export”.
- `getCurrentText` is a required export consumed by main process via property access (`textState.getCurrentText`).
- Action: **revert** export removal (keep `getCurrentText` in `module.exports`) before proceeding with further batches.

Evidence:
- RUN_ID: 20251226-083027 (see §1.3)

#### 5.2.6 Retro-audit validation (Phase 5 export removals) — PASS (closed)
Purpose:
- Retro-validate Batch-02.1–02.4 export-surface removals using importer-scoped gates (to avoid repo-wide symbol-collision false positives).
- Run one control-negative to prove the gate detects real usage (e.g., `text_state:getCurrentText`).

Status:
- PASS (importer-scoped gates + post-checks clean; control-negative + smoke clean).
- Control-negative: `retro.getCurrentText.external_refs.grep.log` is non-empty (gate detects real usage).
- Batch-02.1–02.4 targets: all `retro.<sym>.external_refs.grep.log` are empty; all `retro.<sym>.post.export_item.grep.log` are empty.
- Regression: `retro.regression.errors.extract.log` is empty.

Evidence:
- RUN_ID: 20251226-093413 (see §1.3)

#### 5.2.7 micro-batch — `electron/editor_state.js`: attempted removal of `loadInitialState` export — ABORTED (external consumer)
Gate rule:
- If pre-check shows any external consumer for `editorState.loadInitialState`, STOP (do not remove export).

Observed (pre-check; external usage exists):
- `electron/main.js:159` — `editorState.loadInitialState(loadJson);`

Conclusion:
- **NO DEAD / USED_EXTERNALLY** for “unused export”.
- Keep `loadInitialState` in `module.exports`.

Evidence:
- RUN_ID: 20251227-170712 (see §1.3)

#### 5.2.8 micro-batch — `electron/editor_state.js`: attempted removal of `attachTo` export — ABORTED (external consumer)
Observed (pre-check; external usage exists):
- `electron/main.js:226` — `editorState.attachTo(editorWin, loadJson, saveJson);`

Conclusion:
- **NO DEAD / USED_EXTERNALLY** for “unused export”.
- Keep `attachTo` in `module.exports`.

Evidence:
- RUN_ID: 20251227-172132 (see §1.3)

---

## 6) Class A — Local / lexical (ESLint no-unused-vars candidates)
Status: CLOSED (A1–A5 closed in Phase 5).

### A1 — electron/main.js:L826 — CLOSED: removed unused `language-selected` handler params
- Change: removed unused handler params from the `ipcMain.once('language-selected', ...)` registration (`(_evt, lang)` → `()`).
- Verification:
  - Post: `rg -n "ipcMain\.once\('language-selected'" electron/main.js` shows `ipcMain.once('language-selected', () => {`.
  - Post: ESLint no-unused-vars warnings removed for `_evt` and `lang` in electron/main.js (per logs).
  - Smoke: PASS (no error matches in `smoke.A1.log`; `smoke.A1.errors.grep.log` is whitespace-only).
- Evidence: RUN_ID 20251226-210621 (see §1.3)

### A2 — electron/settings.js:L202 — CLOSED: REMOVED (unused getCurrentLanguage wire)
- Change: removed unused `getCurrentLanguage` wiring between `electron/main.js` and `electron/settings.js` (`registerIpc` destructuring + call-site object).
- Verification:
  - Post: `rg -n "getCurrentLanguage" electron/main.js electron/settings.js` => empty (per logs).
  - Post: ESLint no-unused-vars warning removed for `getCurrentLanguage` (per logs).
  - Smoke: PASS (no error matches; `smoke.A2.errors.grep.log` is whitespace-only).
- Evidence: RUN_ID 20251226-201750 (see §1.3)

### A3 — public/editor.js:L107 (`showNotice`) — NO DEAD (global/window dynamic contract) — CLOSED: HARDENED (explicit global export)
- Evidence (static):
  - Definition: `function showNotice(...) { ... }` in public/editor.js.
  - Dynamic consumption: public/js/notify.js calls `window.showNotice(...)` if present.
- Change:
  - Added explicit assignment: `window.showNotice = showNotice;` (make the cross-script/global contract intentional and visible to static tools).
- Verification:
  - Post: `rg -n "window\.showNotice\s*=\s*showNotice" public/editor.js` is non-empty (per logs).
  - Post: ESLint no-unused-vars warning removed for `showNotice` in public/editor.js (per logs).
  - Smoke: PASS (no error matches in `smoke.A3.log`; `smoke.A3.errors.grep.log` is whitespace-only).
- Evidence: RUN_ID 20251226-213650 (see §1.3)

### A4 — public/js/count.js:L5 and L16 — CLOSED: removed unused `language` params
- Evidence (PRE): ESLint warns `language` defined but unused in both `contarTextoSimple` and `contarTextoPrecisoFallback`.
- Change:
  - Removed unused `language` parameters from:
    - `contarTextoSimple(texto, language)` → `contarTextoSimple(texto)`
    - `contarTextoPrecisoFallback(texto, language)` → `contarTextoPrecisoFallback(texto)`
  - Updated internal call sites accordingly.
- Verification:
  - Post: `rg` shows updated function signatures + call sites (per logs).
  - Post: ESLint no-unused-vars warnings removed for `language` in public/js/count.js (per logs).
  - Smoke: PASS (no error matches in `smoke.A4.log`; `smoke.A4.errors.grep.log` is whitespace-only).
- Evidence: RUN_ID 20251226-234329 (see §1.3)

### A5 — public/renderer.js — CLOSED: removed unused/local dead code paths (no-unused-vars)
- Evidence (PRE): ESLint no-unused-vars warnings for:
  - `mostrarVelocidadReal` (defined but never used)
  - `payload` (empty onMenuClick handler param)
  - `formatCrono` / `actualizarVelocidadRealFromElapsed` / `parseCronoInput` (assigned but never used)
  - `ev` (unused event param)
- Change:
  - Removed the unused `mostrarVelocidadReal` function.
  - Removed the renderer-side fallback `window.electronAPI.onMenuClick((payload) => { })` stub (no-op subscription); menu wiring remains owned by `public/js/menu_actions.js`.
  - Removed unused wrapper bindings to `window.RendererCrono` (`formatCrono`, `actualizarVelocidadRealFromElapsed`, `parseCronoInput`) that were never consumed by renderer.js.
  - Removed (or rewired) the unused event param that triggered `ev` warning.
- Verification:
  - Post: `rg.A5.renderer.sites.post.log` contains no matches for the removed sites (per logs).
  - Post: renderer still references `window.RendererCrono` via `cronoModule` and flotante still uses `window.RendererCrono.formatCrono` (contract preserved).
  - Post: menu wiring still present via `public/index.html` script include + `public/js/menu_actions.js` listener registration (contract preserved).
  - Post: `npm run lint` outputs no warnings (clean).
  - Smoke: PASS (no error matches in `smoke.A5.log`; `smoke.A5.errors.grep.log` is whitespace-only).
- Evidence: RUN_ID 20251227-111217 (see §1.3)

---

## 7) Class B — Export/File disconnected (graph/tool signals; requires verification)
Important: CommonJS property access + dynamic path loading create false positives. Treat as candidates with gates.

### B1 — electron/presets/defaults_presets*.js — CLOSED: NO DEAD (dynamic require / fs scan)
- Evidence (static):
  - electron/presets_main.js builds paths and requires defaults dynamically:
    - `path.join(__dirname, 'presets', 'defaults_presets.js')`
    - `defaults_presets_${langCode}.js` with fs.readdirSync + regex `^defaults_presets.*\.js$`
- Diagnosis: knip/madge/depcheck may mark as orphan due to dynamic require + fs selection → false positive.
- Action: keep. Optional: whitelist/exclude in tooling config.

### B2 — Unused exports (knip) — CLOSED (by gates/closures)
- Signal: knip reports “Unused exports” in RUN_ID 20251227-184005, including exports in:
  - electron/settings.js (init/registerIpc/getSettings/saveSettings/applyFallbackLanguageIfUnset/broadcastSettingsUpdated)
  - electron/text_state.js (init/registerIpc/getCurrentText)
  - electron/editor_state.js (loadInitialState/attachTo)
  - electron/menu_builder.js (getDialogTexts/buildAppMenu)
  - electron/presets_main.js (registerIpc)
  - electron/updater.js (registerIpc/scheduleInitialCheck)
  - deadcode_audit_preload.js (DEADCODE_AUDIT_CHANNEL/DEADCODE_AUDIT_ENABLED)
- Reliability note: some exports are used via property access; knip alone is not sufficient proof.
- Closure rule: apply §3 evidence matrix + focused smoke before removing export surface.

Phase 5 closures (Batch-02):
- B2.1 menu_builder.js: `loadMainTranslations` export REMOVED — RUN_ID 20251225-095824
- B2.2 presets_main.js: `loadDefaultPresetsCombined` export REMOVED — RUN_ID 20251225-102709
- B2.3 updater.js: `checkForUpdates` export REMOVED — RUN_ID 20251225-121246
- B2.4 settings.js: `normalizeSettings` + `loadNumberFormatDefaults` exports REMOVED — RUN_ID 20251226-074013
- B2.5 text_state.js: `getCurrentText` export NO DEAD (USED_EXTERNALLY) — RUN_ID 20251226-083027
- B2.6 editor_state.js: `loadInitialState` export NO DEAD (USED_EXTERNALLY) — RUN_ID 20251227-170712
- B2.7 editor_state.js: `attachTo` export NO DEAD (USED_EXTERNALLY) — RUN_ID 20251227-172132

- B2.8 settings.js: `init`, `registerIpc`, `getSettings`, `saveSettings`, `applyFallbackLanguageIfUnset`, `broadcastSettingsUpdated`
  - Status: NO DEAD / USED_EXTERNALLY
  - Evidence: RUN_ID 20251227-183903

- B2.9 text_state.js: `init`, `registerIpc`
  - Status: NO DEAD / USED_EXTERNALLY
  - Evidence: RUN_ID 20251227-183903

- B2.10 menu_builder.js: `getDialogTexts`, `buildAppMenu`
  - Status: NO DEAD / USED_EXTERNALLY
  - Evidence: RUN_ID 20251227-183903

- B2.11 presets_main.js: `registerIpc`
  - Status: NO DEAD / USED_EXTERNALLY
  - Evidence: RUN_ID 20251227-183903

- B2.12 updater.js: `registerIpc`, `scheduleInitialCheck`
  - Status: NO DEAD / USED_EXTERNALLY
  - Evidence: RUN_ID 20251227-183903

- B2.13 deadcode_audit_preload.js: `DEADCODE_AUDIT_CHANNEL`, `DEADCODE_AUDIT_ENABLED`
  - Status: DEFERRED (audit scaffolding; remove in Phase 6)
  - Evidence: knip signal in RUN_ID 20251227-184005

### B3 — Unused files (knip) — NO DEAD (known dynamic require/fs-scan false positives)
- Signal: knip reports “Unused files” in RUN_ID 20251227-184005 for:
  - electron/presets/defaults_presets.js
  - electron/presets/defaults_presets_en.js
  - electron/presets/defaults_presets_es.js
- Status: NO DEAD (already closed as dynamic require/fs scan; see B1)
- Evidence: RUN_ID 20251227-184005 + prior B1 rationale

### B4 — Toolchain devDependencies flagged unused by depcheck/knip (do not remove)
- Signal (RUN_ID 20251227-184005):
  - depcheck reports unused devDependencies: depcheck, knip, madge
  - knip reports unused devDependencies: depcheck, madge
- Interpretation: tooling invoked via CLI/npx/scripts; absence of runtime require() is expected
- Status: NO ACTION / KEEP (toolchain reproducibility)
- Evidence: RUN_ID 20251227-184005

---

## 8) Class C — Contracts (IPC / preload bridges / renderer events / DOM / i18n / persistence)
Status: PARTIAL (static inventory captured; dynamic closure required before deletions in contract space).

### C0 — contextBridge exposed globals (renderer contract surface)
Evidence: contextBridge.exposeInMainWorld(...)
- electron/editor_preload.js: exposes `editorAPI`
- electron/flotante_preload.js: exposes `flotanteAPI`
- electron/language_preload.js: exposes `languageAPI`
- electron/preload.js: exposes `electronAPI`
- electron/preset_preload.js: exposes `presetAPI`

Risk:
- Hard contract with renderer code (window.*). Any rename requires dynamic confirmation + coordinated change.

### C1 — IPC request/response channels (invoke/handle) — CLOSED (static: defined + referenced)
Evidence: ipcMain.handle(.) + ipcRenderer.invoke(.)

Crono / flotante / app:
- `crono-get-state` — Defined: electron/main.js:691; Used: electron/preload.js:74
- `flotante-open` — Defined: electron/main.js:712; Used: electron/preload.js:83
- `flotante-close` — Defined: electron/main.js:724; Used: electron/preload.js:86
- `open-editor` — Defined: electron/main.js:758; Used: electron/preload.js:7
- `open-preset-modal` — Defined: electron/main.js:786; Used: electron/preload.js:10
- `get-app-config` — Defined: electron/main.js:798; Used: electron/preload.js:14 AND electron/editor_preload.js:7

Settings:
- `get-settings` — Defined: electron/settings.js:211; Used: electron/preload.js:20 AND editor_preload.js:8 AND flotante_preload.js:27 AND preset_preload.js:12
- `set-language` — Defined: electron/settings.js:221; Used: electron/language_preload.js:7
- `set-mode-conteo` — Defined: electron/settings.js:299; Used: electron/preload.js:59

Text state:
- `get-current-text` — Defined: electron/text_state.js:109; Used: electron/preload.js:12 AND editor_preload.js:5
- `set-current-text` — Defined: electron/text_state.js:114; Used: electron/preload.js:13 AND editor_preload.js:6
- `force-clear-editor` — Defined: electron/text_state.js:180; Used: electron/preload.js:40

Presets:
- `get-default-presets` — Defined: electron/presets_main.js:170; Used: electron/preload.js:28
- `open-default-presets-folder` — Defined: electron/presets_main.js:256; Used: electron/preload.js:11
- `create-preset` — Defined: electron/presets_main.js:279; Used: electron/preset_preload.js:5
- `edit-preset` — Defined: electron/presets_main.js:580; Used: electron/preset_preload.js:11
- `request-delete-preset` — Defined: electron/presets_main.js:313; Used: electron/preload.js:31
- `request-restore-defaults` — Defined: electron/presets_main.js:455; Used: electron/preload.js:34
- `notify-no-selection-edit` — Defined: electron/presets_main.js:554; Used: electron/preload.js:37

Updater:
- `check-for-updates` — Defined: electron/updater.js:150; Used: electron/preload.js:8

### C2 — IPC fire-and-forget (send/on) + main→renderer push events
Status:
- Static inventory grounded via contracts.webContents.send.log
- Dynamic closure improved via Phase 4 audit + targeted greps

Renderer → main:
- `crono-toggle` — Defined: electron/main.js:695; Used: electron/preload.js:71
- `crono-reset` — Defined: electron/main.js:703; Used: electron/preload.js:72
- `crono-set-elapsed` — Defined: electron/main.js:707; Used: electron/preload.js:73
- `flotante-command` — Defined: electron/main.js:741; Used: electron/flotante_preload.js:16
- `language-selected` — Defined: electron/main.js:821 (once); Used: electron/language_preload.js:9

Main → renderer (closed: listener + sender observed):
- `crono-state` — listener: preload.js + flotante_preload.js; sender: main.js; targeted grep RUN_ID 20251224-141839
- `editor-init-text` — listener: editor_preload.js; sender: main.js
- `editor-ready` — listener: preload.js; sender: main.js
- `preset-init` — listener: preset_preload.js; sender: main.js
- `flotante-closed` — listener: preload.js + flotante_preload.js; sender: main.js
- `menu-click` — listener: preload.js; sender: menu_builder.js
- `settings-updated` — listener: preload.js; sender: presets_main.js + settings.js
- `current-text-updated` — listener: preload.js; sender: text_state.js
- `editor-text-updated` — listener: editor_preload.js; sender: text_state.js
- `editor-force-clear` — listener: editor_preload.js; sender: text_state.js
- `preset-created` — listener: preload.js; sender: presets_main.js

REMOVED (Phase 5 / Batch-01; sender-only; no listeners anywhere):
- `preset-deleted` — closed via Phase 4 (RUN_ID 20251223-130514 + 20251224-141817) then removed in Phase 5 (RUN_ID 20251225-085925)
- `preset-restored` — closed via Phase 4 (RUN_ID 20251223-130514 + 20251224-141817) then removed in Phase 5 (RUN_ID 20251225-085925)

### C3 — DOM hook surfaces — COLLECTED (static)
Evidence sources:
- contracts.dom.getElementById.log
- contracts.dom.querySelector.log

(getElementById and querySelector inventories preserved as in tool output; do not delete/rename IDs without targeted UI smoke.)

### C4 — DYNAMIC/UNKNOWN
- public/renderer.js: dynamic selector: `infoModalContent.querySelector(\`#${sectionId}\`)`
- Rule: do not attempt static closure; treat as HIGH and close with dynamic evidence before contract deletion/rename.

---

## 9) Class D — Fallback invisibilizer (silent defaults / broad catches / swallow errors)
Status: PARTIAL (not a deletion class by “unused” reasoning).

Evidence sources:
- fallback.catch.noop_only.log
- fallback.webContents.send.sites.log

### D1 — Electron main swallow sites (HIGH: hides lifecycle/race failures)
- Status: MITIGATED (visibility) — D1.1 replaced silent noop catches with warnOnce + added guards where applicable.

- PRE (noop markers inventory; 9 sites; captured):
  - L328 `try { langWin.focus(); } catch (e) { /* noop */ }`
  - L509 `try { flotanteWin.setBounds(...); } catch (e) { /* noop */ }`
  - L583 `try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }`
  - L599–L601 `try { snapWindowFullyIntoWorkArea(win); } catch (e) { /* noop */ }` (marker at L601)
  - L634 `try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - L635 `try { if (flotanteWin && !flotanteWin.isDestroyed()) flotanteWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - L636 `try { if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - L720 `try { broadcastCronoState(); } catch (e) {/*noop*/ }`
  - L833–L835 `try { if (langWin && !langWin.isDestroyed()) langWin.close(); } catch (e) { /* noop */ }` (marker at L835)

- PATCH (D1.1):
  - Introduced `warnOnce(...)` helper (rate-limited console.warn).
  - Replaced the noop catches at the swallow sites with `warnOnce(...)` (visibility instead of silence).
  - Hardened `webContents.send('flotante-closed')` with `!isDestroyed()` checks (window + webContents) prior to send.
  - Evidence: see `patch.D1_1.diff.log` in RUN_ID 20251227-192943.

- POST:
  - `rg.D1.noop_markers.main.post.log` (post-marker inventory)
  - `eslint.post.log`
  - `smoke.D1_1.log`
  - Evidence: RUN_ID 20251227-192943 (§1.3)

Policy:
- Do not remove “because unused”. Closure path is visibility (log/guard/metric), not deletion.

### D2 — Renderer swallow sites around DOM/UI cleanup (LOW/MED)
- public/editor.js: notice remove/focus/select protected by noop catches (multiple sites)

### D3 — Renderer swallow sites around bridge calls (MED/HIGH)
- public/editor.js: editorAPI setCurrentText fallbacks wrapped in nested try/noop
Risk:
- Can mask broken preload bridge or contract regressions during refactors.

### D4 — Swallowed i18n loader failures (LOW/MED)
- Status: MITIGATED (visibility) — D4.1 replaced silent noop catches with warnOnce in flotante renderer.

- PRE (noop markers; captured):
  - public/flotante.js:
    - L62 `} catch (e) { /* noop */ }` (settings read: `window.flotanteAPI.getSettings()`)
    - L65 `} catch (_) { /* noop */ }` (i18n load: `loadRendererTranslations(lang)`)

- PATCH (D4.1):
  - Introduced local `warnOnce(...)` helper (rate-limited console.warn).
  - Replaced both noop catches with `warnOnce(...)` (visibility instead of silence).

- POST:
  - `rg.D4.noop_markers.flotante.post.log` must be empty.
  - Smoke: PASS.

- Evidence: RUN_ID 20251227-235800 (§1.3)

### D5 — Swallowed renderer sync failures (LOW/MED)
- public/renderer.js: settings sync / general try-noop sites (at least two)

Closure plan (visibility, not deletion):
- Prefer guards (`if (win && !win.isDestroyed())`) over blanket try/catch.
- Add minimal, rate-limited `console.warn` (or equivalent) where appropriate.
- Smoke test after each micro-change (these correlate with window lifecycle races).

---
