# Dead Code Ledger (single-source ledger; de-duplicated)
> Goal: keep ONE ledger for dead code candidates + contract surfaces + fallback risks.
> Anti-noise rule: evidence file lists live ONLY in the RUN index (§1). The rest of the ledger references RUN_IDs.

---

## 0) Bootstrap metadata
- HEAD: 472cbf03e829fe57922be1dff6313fee9a4653ab
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

- RUN_ID (Batch-02.4 patch + pre/post-grep + smoke; settings exports): 20251226-074013
  - Evidence files:
    - docs/cleanup/_evidence/deadcode/20251226-074013/pre.usage.loadNumberFormatDefaults.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/pre.usage.normalizeSettings.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/pre.usage.settingsState_loadNumberFormatDefaults.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/pre.usage.settingsState_normalizeSettings.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/pre.bracket.sq.loadNumberFormatDefaults.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/pre.bracket.dq.loadNumberFormatDefaults.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/pre.bracket.sq.normalizeSettings.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/pre.bracket.dq.normalizeSettings.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/patch.electron_settings_js.exports.diff.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/post.export.loadNumberFormatDefaults.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/post.export.normalizeSettings.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/post.usage.settingsState_loadNumberFormatDefaults.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/post.usage.settingsState_normalizeSettings.grep.log
    - docs/cleanup/_evidence/deadcode/20251226-074013/smoke.batch02_settings_exports.log

### 1.4 Phase 3 — tool outputs ingested (static scan)
- madge.orphans.log
- madge.circular.log
- depcheck.run.log
- eslint.run.log
- (prior calibration) knip.run.log + EntryPointsInventory.md
- contracts.webContents.send.log
- contracts.dom.getElementById.log
- contracts.dom.querySelector.log
- fallback.catch.noop_only.log
- fallback.webContents.send.sites.log

---

## 2) Rules / gates (short)
- Class A/B: delete only with strong static evidence + focused smoke.
- Class C: delete only with static + dynamic evidence (used vs defined / sent vs listened).
- Class D: do not delete “because unused”; enforce failure visibility policy instead.

---

## 3) Evidence matrix (micro-batches standard)
> Use this exact matrix for any “unused export” removal (knip LOW/MED signals):
1) PRE: identifier grep (repo-wide)
2) PRE: property access grep (e.g. `obj.ident`)
3) PRE: bracket access grep (sq + dq): `['ident']` / `["ident"]`
4) PATCH: minimal diff (export surface only; keep internal helper)
5) POST: export grep (must be empty)
6) POST: usage grep (must be empty for external access; internal uses allowed)
7) SMOKE: focused scenario (depends on module)

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

### 5.3 Batch-02 (NEXT) — electron/text_state.js unused export: `getCurrentText` (knip LOW/MED)
Signal:
- knip reports unused exports in electron/text_state.js: (init/registerIpc/getCurrentText).

Rules:
- Do NOT touch until you replicate §3 evidence matrix exactly.

Required smoke scope for text_state.js:
- Main window: paste/type text, ensure counters update.
- Editor window: open editor, ensure initial text arrives and subsequent edits sync.
- Any “clear” action that triggers editor force-clear / current-text-updated paths.

---

## 6) Class A — Local / lexical (ESLint no-unused-vars candidates)
Status: candidates only (no code change in Phase 3). Closure: decide + smoke.

### A1 — electron/main.js:L821
- Evidence: ESLint warns `_evt` and `lang` defined but unused.
- Closure: rename to `_evt`, `_lang` (or `_`) or use them; or add narrow eslint-disable; smoke.

### A2 — electron/settings.js:L202
- Evidence: ESLint warns `getCurrentLanguage` defined but unused.
- Closure: verify if kept for API symmetry/exports; if unused, delete or move behind explicit export surface; smoke.

### A3 — public/editor.js:L107 (`showNotice`) — NO DEAD (global/window dynamic contract)
- Evidence (static):
  - Definition: `function showNotice(...) { ... }` in public/editor.js.
  - Dynamic consumption: public/js/notify.js calls `window.showNotice(...)` if present.
- Diagnosis: NOT dead code; “unused in-file” is a false positive for cross-script globals.
- Closure: keep. Optional hardening: document/ensure script load order, or explicitly assign `window.showNotice = showNotice`. Smoke editor notifications if touched.

### A4 — public/js/count.js:L5 and L16
- Evidence: ESLint warns `language` defined but unused (two sites).
- Closure: remove param or use it (formatting/i18n); smoke count.

### A5 — public/renderer.js unused vars/assigned functions
- Evidence (ESLint no-unused-vars):
  - L297 `mostrarVelocidadReal`
  - L733 `payload`
  - L1052 `formatCrono` assigned but never used
  - L1054 `actualizarVelocidadRealFromElapsed` assigned but never used
  - L1111 `ev`
  - L1133 `parseCronoInput` assigned but never used
- Closure:
  - Confirm dynamic references (DOM events, window globals).
  - If truly unused: remove; smoke renderer + crono flows.

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

### B2 — Unused exports (knip “Unused exports (21)”) — PARTIAL closures in Phase 5
- Signal: knip lists multiple exports in:
  - electron/settings.js (init/registerIpc/getSettings/saveSettings/normalizeSettings/loadNumberFormatDefaults/applyFallbackLanguageIfUnset/broadcastSettingsUpdated)
  - electron/text_state.js (init/registerIpc/getCurrentText)
  - electron/editor_state.js (loadInitialState/attachTo)
  - electron/menu_builder.js (loadMainTranslations/getDialogTexts/buildAppMenu)
  - electron/presets_main.js (registerIpc/loadDefaultPresetsCombined)
  - electron/updater.js (registerIpc/checkForUpdates/scheduleInitialCheck)
- Reliability note: some exports are used via property access; knip alone is not sufficient proof.
- Closure rule: apply §3 evidence matrix + focused smoke before removing export surface.

Phase 5 closures (Batch-02):
- B2.1 menu_builder.js: `loadMainTranslations` export REMOVED — RUN_ID 20251225-095824
- B2.2 presets_main.js: `loadDefaultPresetsCombined` export REMOVED — RUN_ID 20251225-102709
- B2.3 updater.js: `checkForUpdates` export REMOVED — RUN_ID 20251225-121246
- B2.4 settings.js: `normalizeSettings` + `loadNumberFormatDefaults` exports REMOVED — RUN_ID 20251226-074013

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
- electron/main.js:
  - L323 `try { langWin.focus(); } catch (e) { /* noop */ }`
  - L504 `try { flotanteWin.setBounds(...) } catch (e) { /* noop */ }`
  - L578 `try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }`
  - L629–L631 `try { ...webContents.send('crono-state', ...) } catch (e) {/*noop*/ }`
  - L715 `try { broadcastCronoState(); } catch (e) {/*noop*/ }`

Policy:
- Do not remove “because unused”. Closure path is visibility (log/guard/metric), not deletion.

### D2 — Renderer swallow sites around DOM/UI cleanup (LOW/MED)
- public/editor.js: notice remove/focus/select protected by noop catches (multiple sites)

### D3 — Renderer swallow sites around bridge calls (MED/HIGH)
- public/editor.js: editorAPI setCurrentText fallbacks wrapped in nested try/noop
Risk:
- Can mask broken preload bridge or contract regressions during refactors.

### D4 — Swallowed i18n loader failures (LOW/MED)
- public/flotante.js: translation loading wrapped in noop catch

### D5 — Swallowed renderer sync failures (LOW/MED)
- public/renderer.js: settings sync / general try-noop sites (at least two)

Closure plan (visibility, not deletion):
- Prefer guards (`if (win && !win.isDestroyed())`) over blanket try/catch.
- Add minimal, rate-limited `console.warn` (or equivalent) where appropriate.
- Smoke test after each micro-change (these correlate with window lifecycle races).

---
