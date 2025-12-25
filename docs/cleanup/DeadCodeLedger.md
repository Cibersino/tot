# Dead Code Ledger (Bootstrap)
Run:
- RUN_ID: 20251223-130514
- HEAD: 472cbf03e829fe57922be1dff6313fee9a4653ab
- Evidence folder: docs/cleanup/_evidence/deadcode/20251223-130514/
- Madge seed: electron/main.js (VERIFIED by evidence in EntryPointsInventory.md)

Additional dynamic evidence (Phase 4 — DEADCODE_AUDIT):
- RUN_ID (audit smoke / wide coverage): 20251223-130514
  - Evidence file: docs/cleanup/_evidence/deadcode/20251223-130514/runtime_contracts.log
  - Captured JSON (single object on shutdown)
- RUN_ID (audit baseline / noclick): 20251224-133600
  - Evidence file: docs/cleanup/_evidence/deadcode/20251224-133600/runtime_contracts.noclick.log
  - Captured JSON (single object on shutdown)

Additional focused static evidence (Phase 4 — targeted closure):
- RUN_ID (grep preset-deleted/restored): 20251224-141817
  - Evidence files:
    - docs/cleanup/_evidence/deadcode/20251224-141817/contracts.preset-deleted.grep.log
    - docs/cleanup/_evidence/deadcode/20251224-141817/contracts.preset-restored.grep.log
- RUN_ID (grep crono-state): 20251224-141839
  - Evidence file:
    - docs/cleanup/_evidence/deadcode/20251224-141839/contracts.crono-state.grep.log

Additional execution evidence (Phase 5 — micro-batches):
- RUN_ID (Batch-01 patch + post-grep + smoke): 20251225-085925
  - Evidence files:
    - docs/cleanup/_evidence/deadcode/20251225-085925/patch.electron_presets_main_js.diff.log
    - docs/cleanup/_evidence/deadcode/20251225-085925/post.contracts.preset-deleted.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-085925/post.contracts.preset-restored.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-085925/smoke.presets_delete_restore.log

- RUN_ID (Batch-02 patch + post-grep + smoke): 20251225-095824
  - Evidence files:
    - docs/cleanup/_evidence/deadcode/20251225-095824/patch.electron_menu_builder_js.diff.log
    - docs/cleanup/_evidence/deadcode/20251225-095824/post.export.loadMainTranslations.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-095824/post.usage.menuBuilder_loadMainTranslations.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-095824/smoke.menu_builder_exports.log

- RUN_ID (Batch-02 patch + pre/post-grep + smoke; presets_main exports): 20251225-102709
  - Evidence files:
    - docs/cleanup/_evidence/deadcode/20251225-102709/pre.usage.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/pre.usage.presetsMain_loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/pre.bracket.sq.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/pre.bracket.dq.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/patch.electron_presets_main_js.exports.diff.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/post.export.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/post.usage.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/smoke.batch02_presets_exports.log

Tool outputs ingested (Phase 3):
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

Rules recap:
- A/B: static strong evidence + smoke test before deletion.
- C: static evidence + dynamic evidence (used vs defined / sent vs listened) before deletion.
- D: failure visibility policy; do not delete “because unused”.

---

## Phase 4 — Dynamic evidence summary (DEADCODE_AUDIT=1)
Purpose:
- Close contract uncertainty by observing runtime: IPC registrations, renderer IPC usage/subscriptions, main push events executed, and menu usage.
Interpretation note:
- IPC_USED includes invoke/send AND listener subscription (ipcRenderer.on/once). It is “contract surface touched”, not “message executed”.

### 4.1 Audit baseline (noclick) — 20251224-133600
Observed (from runtime_contracts.noclick.log):
- MENU_USED = [] while MENU_DEFINED populated (sanity check OK).
- MAIN_PUSH_SENT minimal (only `crono-state` observed in this baseline).
- IPC_DEFINED is run-dependent: `language-selected` absent here, consistent with conditional registration (e.g., language window not opened).

Key takeaways:
- MENU contract instrumentation is clean (no false MENU_USED).
- Some IPC registrations are conditional and will not appear in short runs.

### 4.2 Audit smoke (wide coverage) — 20251223-130514
Observed (from runtime_contracts.log):
- MENU_DEFINED == MENU_USED (all commands clicked at least once during the run).
- MAIN_PUSH_SENT contains:
  - crono-state, current-text-updated, editor-force-clear, editor-init-text, editor-ready, editor-text-updated,
    flotante-closed, menu-click, preset-created, preset-deleted, preset-init, preset-restored, settings-updated
- IPC_USED does NOT contain `preset-deleted` nor `preset-restored`.

Derived closure signal (critical):
- Sent-but-not-listened candidates (MAIN_PUSH_SENT − IPC_USED):
  - `preset-deleted`
  - `preset-restored`

### 4.3 Focused closure for push-only channels (static repo evidence) — 20251224-141817
Evidence (repo-wide fixed-string grep; excludes docs/** and *.md):
- `preset-deleted`:
  - Found only as send/log strings in electron/presets_main.js
  - No occurrences in any preload/renderer listener code
- `preset-restored`:
  - Found only as send/log strings in electron/presets_main.js
  - No occurrences in any preload/renderer listener code

Conclusion:
- `preset-deleted` and `preset-restored` are push-only channels that are executed (MAIN_PUSH_SENT) but have no listeners anywhere (not present in IPC_USED and no static occurrences outside send sites).
- Treat as Class C candidates for removal (dead push contract / orphan event), subject to one focused smoke test on preset delete/restore flows.

---

## Phase 5 — Micro-batches execution log (minimal diffs + focused smoke tests)

### 5.1 Batch-01 — remove dead push-only channels: `preset-deleted`, `preset-restored`
Change:
- Removed all `webContents.send('preset-deleted', ...)` and `webContents.send('preset-restored', ...)` sites from `electron/presets_main.js`.

Verification:
- Focused static post-check: `git grep -n "preset-deleted" -- electron/presets_main.js` and `git grep -n "preset-restored" -- electron/presets_main.js` must return empty (see evidence logs).
- Focused smoke test: delete preset flow + restore defaults flow (see smoke log).

Evidence (Phase 5 / Batch-01):
- RUN_ID: 20251225-085925
  - docs/cleanup/_evidence/deadcode/20251225-085925/patch.electron_presets_main_js.diff.log
  - docs/cleanup/_evidence/deadcode/20251225-085925/post.contracts.preset-deleted.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-085925/post.contracts.preset-restored.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-085925/smoke.presets_delete_restore.log

### 5.2 Batch-02 — unused exports (knip LOW/MED): remove unused export surface (micro-batches)

#### 5.2.1 micro-batch — `electron/menu_builder.js`: stop exporting `loadMainTranslations` (internal helper retained)
Change:
- Removed `loadMainTranslations` from `module.exports` in `electron/menu_builder.js` (function remains and is still used internally by `getDialogTexts` and `buildAppMenu`).

Verification:
- Post-check export: `git grep -n "loadMainTranslations," -- electron/menu_builder.js` (must be empty).
- Post-check usage (property access): `git grep -n "menuBuilder\.loadMainTranslations" -- .` (must be empty).
- Smoke test: `npm start` (PASS).

Evidence (Phase 5 / Batch-02):
- RUN_ID: 20251225-095824
  - docs/cleanup/_evidence/deadcode/20251225-095824/patch.electron_menu_builder_js.diff.log
  - docs/cleanup/_evidence/deadcode/20251225-095824/post.export.loadMainTranslations.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-095824/post.usage.menuBuilder_loadMainTranslations.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-095824/smoke.menu_builder_exports.log

#### 5.2.2 micro-batch — `electron/presets_main.js`: stop exporting `loadDefaultPresetsCombined` (internal helper retained)
Change:
- Removed `loadDefaultPresetsCombined` from `module.exports` in `electron/presets_main.js` (function retained; behavior unchanged).

Verification:
- Pre-check (repo-wide): `git grep` for identifier usage + property/bracket access (see evidence).
- Post-check export: `git grep -n "loadDefaultPresetsCombined," -- electron/presets_main.js` (must be empty).
- Post-check repo-wide: `git grep -n -- "loadDefaultPresetsCombined" -- .` (usage should remain internal-only).
- Smoke test: `npm start` (PASS).

Evidence (Phase 5 / Batch-02):
- RUN_ID: 20251225-102709
  - docs/cleanup/_evidence/deadcode/20251225-102709/pre.usage.loadDefaultPresetsCombined.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-102709/pre.usage.presetsMain_loadDefaultPresetsCombined.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-102709/pre.bracket.sq.loadDefaultPresetsCombined.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-102709/pre.bracket.dq.loadDefaultPresetsCombined.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-102709/patch.electron_presets_main_js.exports.diff.log
  - docs/cleanup/_evidence/deadcode/20251225-102709/post.export.loadDefaultPresetsCombined.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-102709/post.usage.loadDefaultPresetsCombined.grep.log
  - docs/cleanup/_evidence/deadcode/20251225-102709/smoke.batch02_presets_exports.log

---

## Class A — Local / lexical (ESLint `no-unused-vars` candidates)
Status: candidates only (no code change in Phase 3). Closure: inspect context, decide (remove/rename/_prefix/eslint-disable) and confirm behavior via smoke test.

### A1 — electron/main.js:L821
- Evidence: ESLint warns `_evt` and `lang` are defined but never used (no-unused-vars).
- Risk: typically benign (handler signature), but can hide future needed params.
- Closure plan:
  - Decide: rename to `_evt`, `_lang` (or `_`) if intentionally unused; or use the variables; or add a narrow eslint disable on the line.
  - Smoke test after change.

### A2 — electron/settings.js:L202
- Evidence: ESLint warns `getCurrentLanguage` defined but never used.
- Closure plan: verify if kept for API symmetry/exports; if unused, delete or move behind explicit export surface; smoke test.

### A3 — public/editor.js:L107 (`showNotice`) — NO DEAD (contrato global/window usado dinámicamente)
- Evidence (static):
  - Definición: `function showNotice(msg, { duration = 4500, type = 'info' } = {}) { ... }` en `public/editor.js`.
  - Consumo dinámico: `public/js/notify.js` llama `window.showNotice(msg, { type, duration })` si existe.
- Diagnóstico: **NO ES CÓDIGO MUERTO**. Es un contrato “cross-script” (global/window). La señal “unused” en el archivo es un **falso positivo** si se analiza solo por referencias dentro del mismo archivo.
- Closure plan:
  - Mantener.
  - (Opcional) Endurecer el contrato documentando/asegurando el orden de carga de scripts (p.ej. `editor.js` antes que `notify.js`) o exponiendo explícitamente `window.showNotice = showNotice`.
  - Cualquier cambio aquí requiere smoke test de notificaciones en el editor.

### A4 — public/js/count.js:L5 and L16
- Evidence: ESLint warns `language` is defined but never used (two sites).
- Closure plan: decide whether to remove param or use it (e.g., formatting/i18n); smoke test count.

### A5 — public/renderer.js unused vars/assigned functions
- Evidence (ESLint no-unused-vars):
  - L297 `mostrarVelocidadReal`
  - L733 `payload`
  - L1052 `formatCrono` assigned but never used
  - L1054 `actualizarVelocidadRealFromElapsed` assigned but never used
  - L1111 `ev`
  - L1133 `parseCronoInput` assigned but never used
- Closure plan:
  - For each: confirm whether referenced dynamically (DOM events, window globals).
  - If truly unused: remove; smoke test renderer + crono flows.

---

## Class B — Export/File disconnected (graph/tool signals; requires verification)
Important: CommonJS/property access and dynamic path loading create false positives. Treat as candidates with gates.

### B1 — `electron/presets/defaults_presets*.js` — CLOSED: NO DEAD (dynamic require / fs scan)
- Evidence (static):
  - `electron/presets_main.js` construye paths y **requiere dinámicamente** presets por defecto:
    - `path.join(__dirname, 'presets', 'defaults_presets.js')`
    - `defaults_presets_${langCode}.js` y filtrado por regex `^defaults_presets.*\\.js$` (vía `fs.readdirSync`).
- Diagnóstico: herramientas tipo knip/madge/depcheck pueden marcar estos archivos como “unused/orphan” por la combinación de `require()` dinámico + selección por filesystem. Esto es un **falso positivo** de análisis estático.
- Clasificación: **NO DEAD** (mantener).
- Closure plan:
  - Mantener estos archivos.
  - (Opcional) Ajustar configuración de herramientas (knip/depcheck) para excluir/whitelist estos presets por defecto y reducir ruido futuro.

### B2 — Unused exports (knip “Unused exports (21)”)
- Evidence: knip lists multiple exports in:
  - electron/settings.js (init/registerIpc/getSettings/saveSettings/normalizeSettings/loadNumberFormatDefaults/applyFallbackLanguageIfUnset/broadcastSettingsUpdated)
  - electron/text_state.js (init/registerIpc/getCurrentText)
  - electron/editor_state.js (loadInitialState/attachTo)
  - electron/menu_builder.js (loadMainTranslations/getDialogTexts/buildAppMenu)
  - electron/presets_main.js (registerIpc/loadDefaultPresetsCombined)
  - electron/updater.js (registerIpc/checkForUpdates/scheduleInitialCheck)
- Reliability note (hard): at least some are **used via property access**, e.g. `buildAppMenu(currentLanguage)` is called in electron/main.js, and `settingsState.applyFallbackLanguageIfUnset('es')` is called in electron/main.js; therefore knip “unused exports” is not sufficient proof here.
- Classification: **B-candidate (signal only)**; cannot delete based on knip alone.
- Closure plan:
  - For each export: perform repo-wide reference check (static) and (if needed) dynamic trace (Phase 4) before deletion.

Phase 5 closures (Batch-02 micro-batches):
- B2.1 — `electron/menu_builder.js`: `loadMainTranslations` export — REMOVED (export surface only; internal helper retained)
  - Evidence (RUN_ID 20251225-095824):
    - docs/cleanup/_evidence/deadcode/20251225-095824/patch.electron_menu_builder_js.diff.log
    - docs/cleanup/_evidence/deadcode/20251225-095824/post.export.loadMainTranslations.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-095824/post.usage.menuBuilder_loadMainTranslations.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-095824/smoke.menu_builder_exports.log

- B2.2 — `electron/presets_main.js`: `loadDefaultPresetsCombined` export — REMOVED (export surface only; internal helper retained)
  - Evidence (RUN_ID 20251225-102709):
    - docs/cleanup/_evidence/deadcode/20251225-102709/pre.usage.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/pre.usage.presetsMain_loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/pre.bracket.sq.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/pre.bracket.dq.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/patch.electron_presets_main_js.exports.diff.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/post.export.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/post.usage.loadDefaultPresetsCombined.grep.log
    - docs/cleanup/_evidence/deadcode/20251225-102709/smoke.batch02_presets_exports.log

---

## Class C — Contracts (IPC / preload bridges / renderer events / DOM / i18n / persistence)
Status: PARTIAL (static inventory captured; dynamic “used vs defined / sent vs listened” still required before deletion).

### C0 — contextBridge exposed globals (renderer contract surface)
Evidence: `contextBridge.exposeInMainWorld(...)` (3.4.C)

- electron/editor_preload.js:4 — exposes `editorAPI`
- electron/flotante_preload.js:4 — exposes `flotanteAPI`
- electron/language_preload.js:4 — exposes `languageAPI`
- electron/preload.js:104 — exposes `electronAPI`
- electron/preset_preload.js:4 — exposes `presetAPI`

Risk note:
- These names are hard contracts with renderer code (window.*). Any rename requires Phase 4 dynamic confirmation + coordinated change.

---

### C1 — IPC request/response channels (invoke/handle) — CLOSED (static: defined + referenced)
Evidence: ipcMain.handle(.) + ipcRenderer.invoke(.)

Crono / flotante / app:
- `crono-get-state`
  - Defined: electron/main.js:691 (ipcMain.handle)
  - Referenced: electron/preload.js:74 (ipcRenderer.invoke)
- `flotante-open`
  - Defined: electron/main.js:712 (ipcMain.handle)
  - Referenced: electron/preload.js:83 (ipcRenderer.invoke)
- `flotante-close`
  - Defined: electron/main.js:724 (ipcMain.handle)
  - Referenced: electron/preload.js:86 (ipcRenderer.invoke)
- `open-editor`
  - Defined: electron/main.js:758 (ipcMain.handle)
  - Referenced: electron/preload.js:7 (ipcRenderer.invoke)
- `open-preset-modal`
  - Defined: electron/main.js:786 (ipcMain.handle)
  - Referenced: electron/preload.js:10 (ipcRenderer.invoke)
- `get-app-config`
  - Defined: electron/main.js:798 (ipcMain.handle)
  - Referenced: electron/preload.js:14 AND electron/editor_preload.js:7 (ipcRenderer.invoke)

Settings:
- `get-settings`
  - Defined: electron/settings.js:211 (ipcMain.handle)
  - Referenced: electron/preload.js:20 AND electron/editor_preload.js:8 AND electron/flotante_preload.js:27 AND electron/preset_preload.js:12 (ipcRenderer.invoke)
- `set-language`
  - Defined: electron/settings.js:221 (ipcMain.handle)
  - Referenced: electron/language_preload.js:7 (ipcRenderer.invoke)
- `set-mode-conteo`
  - Defined: electron/settings.js:299 (ipcMain.handle)
  - Referenced: electron/preload.js:59 (ipcRenderer.invoke)

Text state:
- `get-current-text`
  - Defined: electron/text_state.js:109 (ipcMain.handle)
  - Referenced: electron/preload.js:12 AND electron/editor_preload.js:5 (ipcRenderer.invoke)
- `set-current-text`
  - Defined: electron/text_state.js:114 (ipcMain.handle)
  - Referenced: electron/preload.js:13 AND electron/editor_preload.js:6 (ipcRenderer.invoke)
- `force-clear-editor`
  - Defined: electron/text_state.js:180 (ipcMain.handle)
  - Referenced: electron/preload.js:40 (ipcRenderer.invoke)

Presets:
- `get-default-presets`
  - Defined: electron/presets_main.js:170 (ipcMain.handle)
  - Referenced: electron/preload.js:28 (ipcRenderer.invoke)
- `open-default-presets-folder`
  - Defined: electron/presets_main.js:256 (ipcMain.handle)
  - Referenced: electron/preload.js:11 (ipcRenderer.invoke)
- `create-preset`
  - Defined: electron/presets_main.js:279 (ipcMain.handle)
  - Referenced: electron/preset_preload.js:5 (ipcRenderer.invoke)
- `edit-preset`
  - Defined: electron/presets_main.js:580 (ipcMain.handle)
  - Referenced: electron/preset_preload.js:11 (ipcRenderer.invoke)
- `request-delete-preset`
  - Defined: electron/presets_main.js:313 (ipcMain.handle)
  - Referenced: electron/preload.js:31 (ipcRenderer.invoke)
- `request-restore-defaults`
  - Defined: electron/presets_main.js:455 (ipcMain.handle)
  - Referenced: electron/preload.js:34 (ipcRenderer.invoke)
- `notify-no-selection-edit`
  - Defined: electron/presets_main.js:554 (ipcMain.handle)
  - Referenced: electron/preload.js:37 (ipcRenderer.invoke)

Updater:
- `check-for-updates`
  - Defined: electron/updater.js:150 (ipcMain.handle)
  - Referenced: electron/preload.js:8 (ipcRenderer.invoke)

---

### C2 — IPC fire-and-forget channels (send/on + main push events)
Status:
- Static inventory: grounded (listeners + senders via `contracts.webContents.send.log`)
- Dynamic closure: improved by Phase 4 audit + targeted greps

Renderer -> main (send/on):
- `crono-toggle`
  - Defined: electron/main.js:695 (ipcMain.on)
  - Referenced: electron/preload.js:71 (ipcRenderer.send)
- `crono-reset`
  - Defined: electron/main.js:703 (ipcMain.on)
  - Referenced: electron/preload.js:72 (ipcRenderer.send)
- `crono-set-elapsed`
  - Defined: electron/main.js:707 (ipcMain.on)
  - Referenced: electron/preload.js:73 (ipcRenderer.send)
- `flotante-command`
  - Defined: electron/main.js:741 (ipcMain.on)
  - Referenced: electron/flotante_preload.js:16 (ipcRenderer.send)
- `language-selected`
  - Defined: electron/main.js:821 (ipcMain.once)
  - Referenced: electron/language_preload.js:9 (ipcRenderer.send)

Main -> renderer (push events)

Closed (static: listener observed + sender observed):
- `crono-state`
  - Listener (ipcRenderer.on): electron/preload.js AND electron/flotante_preload.js
  - Sender (webContents.send): electron/main.js (multiple sites)
  - Targeted grep evidence: docs/cleanup/_evidence/deadcode/20251224-141839/contracts.crono-state.grep.log
- `editor-init-text`
  - Listener: electron/editor_preload.js:10 (ipcRenderer.on)
  - Sender: electron/main.js:198 AND electron/main.js:765 (webContents.send)
- `editor-ready`
  - Listener: electron/preload.js:99 (ipcRenderer.on)
  - Sender: electron/main.js:209 AND electron/main.js:774 (webContents.send)
- `preset-init`
  - Listener: electron/preset_preload.js:8 (ipcRenderer.on)
  - Sender: electron/main.js:235 AND electron/main.js:266 (webContents.send)
- `flotante-closed`
  - Listener: electron/preload.js:92 AND electron/flotante_preload.js:22
  - Sender: electron/main.js:578 (webContents.send)
- `menu-click`
  - Listener: electron/preload.js:47
  - Sender: electron/menu_builder.js:57 (webContents.send)
- `settings-updated`
  - Listener: electron/preload.js:65
  - Sender: electron/presets_main.js:131, 134, 137, 140 AND electron/settings.js:175, 178, 181, 184 (webContents.send)
- `current-text-updated`
  - Listener: electron/preload.js:16
  - Sender: electron/text_state.js:146 AND electron/text_state.js:190 (webContents.send)
- `editor-text-updated`
  - Listener: electron/editor_preload.js:13
  - Sender: electron/text_state.js:155 (webContents.send)
- `editor-force-clear`
  - Listener: electron/editor_preload.js:17
  - Sender: electron/text_state.js:199 (webContents.send)
- `preset-created`
  - Listener: electron/preload.js:24
  - Sender: electron/presets_main.js:299 AND electron/presets_main.js:668 (webContents.send)

REMOVED (Phase 5 / Batch-01; sender-only; no listeners anywhere):
- `preset-deleted`
  - Pre-removal sender sites (Phase 4 evidence): electron/presets_main.js:386, 406, 431, 663 (webContents.send)
  - Dynamic closure (Phase 4): present in MAIN_PUSH_SENT (audit smoke) but absent from IPC_USED
  - Static closure (Phase 4):
    - docs/cleanup/_evidence/deadcode/20251224-141817/contracts.preset-deleted.grep.log
  - Removal (Phase 5 / Batch-01): send sites deleted from `electron/presets_main.js` (no remaining occurrences)
  - Verification: see Phase 5 / Batch-01 evidence + focused smoke log
- `preset-restored`
  - Pre-removal sender site (Phase 4 evidence): electron/presets_main.js:530 (webContents.send)
  - Dynamic closure (Phase 4): present in MAIN_PUSH_SENT (audit smoke) but absent from IPC_USED
  - Static closure (Phase 4):
    - docs/cleanup/_evidence/deadcode/20251224-141817/contracts.preset-restored.grep.log
  - Removal (Phase 5 / Batch-01): send site deleted from `electron/presets_main.js` (no remaining occurrences)
  - Verification: see Phase 5 / Batch-01 evidence + focused smoke log

---

### C3 — DOM hook surfaces — COLLECTED (static)
Evidence: `contracts.dom.getElementById.log` + `contracts.dom.querySelector.log`

getElementById:
- public/editor.js:
  - L37 `editorArea`
  - L38 `btnTrash`
  - L39 `calcWhileTyping`
  - L40 `btnCalc`
  - L42 `bottomBar`
  - L87 `__editor_notice_container`
- public/flotante.js:
  - L2 `crono`
  - L3 `toggle`
  - L4 `reset`
- public/language_window.html:
  - L30 `btnEs`
  - L31 `btnEn`
- public/preset_modal.js:
  - L8 `presetName`
  - L9 `presetWpm`
  - L10 `presetDesc`
  - L11 `btnSave`
  - L12 `btnCancel`
  - L13 `charCount`
- public/renderer.js:
  - L17 `textPreview`
  - L18 `btnCountClipboard`
  - L19 `btnAppendClipboardNewLine`
  - L20 `btnEdit`
  - L21 `btnEmptyMain`
  - L22 `btnHelp`
  - L24 `resChars`
  - L25 `resCharsNoSpace`
  - L26 `resWords`
  - L27 `resTime`
  - L29 `toggleModoPreciso`
  - L31 `wpmSlider`
  - L32 `wpmInput`
  - L42 `realWpmDisplay`
  - L43 `selector-title`
  - L44 `vel-title`
  - L45 `results-title`
  - L46 `cron-title`
  - L48 `toggleVF`
  - L49 `editorLoader`
  - L52 `presets`
  - L53 `btnNewPreset`
  - L54 `btnEditPreset`
  - L55 `btnDeletePreset`
  - L56 `btnResetDefaultPresets`
  - L57 `presetDescription`
  - L497 `infoModal`
  - L498 `infoModalBackdrop`
  - L499 `infoModalClose`
  - L500 `infoModalTitle`
  - L501 `infoModalContent`
  - L1006 `cronoDisplay`
  - L1019 `cronoToggle`
  - L1020 `cronoReset`

querySelector:
- public/editor.js:
  - L41 `.calc-label`
  - L72 `input` (scoped under calcLabel)
- public/preset_modal.js:
  - L7 `h3`
  - L14 `.hint`
- public/renderer.js:
  - L94 `.vf-switch-wrapper label.switch`
  - L102 `.wpm-row span`
  - L105 `.toggle-wrapper .toggle-label`
  - L115 `.realwpm`
  - L119 `.crono-controls`
  - L127 `.vf-label`
  - L609 `.info-modal-panel`
  - L617 ``#${sectionId}`` (dynamic selector; see C4)

---

### C4 — DYNAMIC/UNKNOWN
- Dynamic selector observed:
  - public/renderer.js:617 — `infoModalContent.querySelector(\`#${sectionId}\`)`
  - This is a contract surface that cannot be closed statically to a fixed ID set without tracing `sectionId`.
- IPC channel names and contextBridge exposure names remain literal in current evidence (no dynamic channel construction observed so far).
- Contract closure note:
  - Main->renderer push event inventory is statically grounded via `contracts.webContents.send.log`.
  - `preset-deleted` and `preset-restored` were closed as dead push-only channels in Phase 4 (see Sections 4.2–4.3 and C2) and removed in Phase 5 / Batch-01.

---

## Class D — Fallback invisibilizer (silent defaults / broad catches / swallow errors)
Status: PARTIAL (D-Gate: top-risk swallow sites collected; not a deletion class by “unused” reasoning).

D-Gate evidence sources:
- `fallback.catch.noop_only.log`
- `fallback.webContents.send.sites.log`

### D1 — Electron main process swallow sites (HIGH: hides races/window lifecycle failures)
- electron/main.js:
  - L323 `try { langWin.focus(); } catch (e) { /* noop */ }`
  - L504 `try { flotanteWin.setBounds(...) } catch (e) { /* noop */ }`
  - L578 `try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }`
  - L629–L631 `try { ...webContents.send('crono-state', ...) } catch (e) {/*noop*/ }`
  - L715 `try { broadcastCronoState(); } catch (e) {/*noop*/ }`
- Policy note:
  - These should not be removed “because unused”; they are reliability controls (even if questionable).
  - Closure path is “make failure visible” (log/guard/metric) rather than deletion.

### D2 — Renderer swallow sites around DOM/UI cleanup (LOW/MED)
- public/editor.js:
  - notice remove/focus/select protected by noop catches (multiple sites)

### D3 — Renderer swallow sites around bridge calls (MED/HIGH)
- public/editor.js:
  - editorAPI setCurrentText fallbacks wrapped in nested try/noop (multiple sites)
- Risk:
  - Can mask broken preload bridge or contract regressions during refactors.

### D4 — Swallowed i18n loader failures (LOW/MED)
- public/flotante.js:
  - translation loading wrapped in noop catch

### D5 — Swallowed renderer sync failures (LOW/MED)
- public/renderer.js:
  - settings sync / general try-noop sites (at least two observed in D-Gate output)

Closure plan (Phase 5/Batch-6 style, NOT deletion):
- Decide visibility policy: `console.warn` with minimal payload, rate-limited if needed; avoid flooding.
- Prefer guards (`if (win && !win.isDestroyed())`) over blanket try/catch where possible.
- Smoke test after each micro-change; these areas correlate with window lifecycle races.

