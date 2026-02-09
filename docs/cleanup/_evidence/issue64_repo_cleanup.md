# Issue #64 — Repo-wide cleanup execution

### [template] L1–L6 — Gate notes (only if changes were made)

**Evidence**
- (Qué evidencia concreta motivó el cambio; referencias a funciones/fragmentos)

**Risk**
- (Qué podría romperse; qué invariantes se preservan)

**Validation**
- (Qué revisamos estáticamente; qué flows cubre el smoke)

**Notas** 
- **L7:** Desde `electron/settings.js` en adelante, el Nivel 7 se registra como **smoke humano minimo** basado en `docs/test_suite.md` (Release smoke) y flujos normales. No se usa checklist generado por Codex.
- **Last commit por archivo**: generar con <git log -n 1 --format=%H -- TARGET_FILE>

---

### electron/main.js (re-audit post-startup change)

Date: `2026-02-08`
Last commit: `d68850f7f4436e43ed38ced4bedfc068ae8673ea`

#### L0 — Minimal diagnosis (Codex, verified)

- Codex complied with Level 0 constraints:
  - Diagnosis only (no changes, no recommendations).
  - No invented IPC channels/behaviors beyond what is present in `electron/main.js`.

- 0.1 Reading map (validated against file):
  - Block order (high level): overview → imports → constants (language picker + fallbacks) → helpers (validation + READY gating) → window refs + readiness flags → menu/dev utilities → window factories (main/editor/preset/lang) → readiness helpers (`maybeAuthorizeStartupReady`, `resolveLanguage`) → delegated IPC comment → flotante placement helpers → `createFlotanteWindow` → crono state/helpers → IPC handlers → app lifecycle.
  - Linear breaks (anchors/micro-quotes):
    - `createEditorWindow` — `editorWin.once('ready-to-show'`
    - `createPresetWindow` — `presetWin.webContents.send('preset-init'`
    - `createFlotanteWindow` — `installWorkAreaGuard(win`
    - `app.whenReady().then` — `textState.registerIpc(ipcMain`

- 0.2 Contract map (validated against file):
  - Exports: none (side-effect entrypoint).
  - Anchored invariants/fallbacks (examples):
    - READY/menu gating: `mainReadyState === 'READY' && menuEnabled`
    - Language fallback: `Settings language is empty; falling back to`
    - Preset modal sender restriction: `open-preset-modal unauthorized (ignored).`
    - Crono elapsed guard: `crono-set-elapsed ignored: crono is running`

- IPC contract (mechanical; present in file):
  - `ipcMain.handle`: `get-available-languages`, `crono-get-state`, `flotante-open`, `flotante-close`, `open-editor`, `open-preset-modal`, `get-app-config`, `get-app-version`, `get-app-runtime-info`
  - `ipcMain.on`: `crono-toggle`, `crono-reset`, `crono-set-elapsed`, `flotante-command`, `startup:renderer-core-ready`, `startup:splash-removed`
  - `ipcMain.once`: `language-selected`
  - `ipcRenderer.*`: none in this file.
  - `webContents.send` call sites (10): `editor-init-text`, `editor-ready`, `preset-init` (x2), `startup:ready`, `flotante-closed`, `crono-state` (main+flotante), plus re-sends on existing editor path.

- Delegated IPC registration (present as calls, channels live elsewhere):
  - `registerLinkIpc(...)`
  - `textState.registerIpc(...)`
  - `settingsState.registerIpc(...)`
  - `presetsMain.registerIpc(...)`
  - `updater.registerIpc(...)`

#### L1 — Structural refactor and cleanup (Codex)

Decision: NO CHANGE

- The file already has a coherent block structure with section headers (imports → constants → helpers → window factories → IPC → lifecycle), so reordering would be churn without clear readability gain.
- Several side-effect registrations are intentionally sequenced (IPC handlers, `app.whenReady`, `app.on` hooks), and moving these for structure risks subtle timing/ordering regressions.
- Many helpers are tightly coupled to shared state flags (`mainReadyState`, `menuEnabled`, `languageResolved`), and relocating them would not reduce cognitive load.
- Duplications (e.g., repeated `editor-init-text`/`editor-ready` sends) are short, locally readable, and extracting them would add indirection without reducing branching.
- The current layout already groups related responsibilities (window creation, readiness gating, flotante placement, crono), so a structural pass is unlikely to improve linear readability.

#### L2 — Clarity / robustness refactor (Codex)

Decision: NO CHANGE

- The file’s critical ordering (IPC registration + `app.whenReady` sequence) is timing-sensitive, and any structural changes there risk subtle race behavior.
- Most duplicated send/try-catch blocks carry distinct log messages for context, so centralizing them would reduce diagnostic clarity or add parameterized indirection.
- Existing guard/fallback paths already make edge cases explicit (`guardMainUserAction`, fallback language list, payload validation), leaving little robustness to gain without altering behavior.
- Adding helpers would increase cross-jumping in a long file and violate the “more concepts than removed” rule for only modest readability payoff.
- Any further robustness tweaks would likely change logging frequency or error surfacing, which counts as observable behavior.

Reviewer assessment (sufficiency & inference quality):
- PASS (meets Level 2 output constraints; rationale is generic but does not invent IPC/behavior).
- Note: analysis would be stronger if it named 2–3 concrete candidate edits (with anchors) and explicitly rejected them as timing/contract risks.

#### L3 — Architecture / contract changes (exceptional; evidence-driven) (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- `electron/preload.js` IPC surface:
  - `openEditor` → `ipcRenderer.invoke('open-editor')`
  - `openPresetModal` → `ipcRenderer.invoke('open-preset-modal', payload)`
  - `getAppConfig/getAppVersion/getAppRuntimeInfo` → `ipcRenderer.invoke(...)`
  - startup signals/listeners: `sendRendererCoreReady` → `startup:renderer-core-ready`; `sendStartupSplashRemoved` → `startup:splash-removed`; `onStartupReady` listener for `startup:ready`; `onCronoState` listener for `crono-state`.
- `public/renderer.js` consumes `startup:ready` via `window.electronAPI.onStartupReady(...)` and emits `startup:renderer-core-ready` via `window.electronAPI.sendRendererCoreReady()`; retains pre-READY gating paths.
- `electron/language_preload.js` emits first-run gate signal `ipcRenderer.send('language-selected', tag)` (payload is the normalized language tag).
- `electron/main.js` has explicit `ipcMain.once('language-selected', ...)` first-run gate, and `ipcMain.on('startup:renderer-core-ready', ...)` feeding `maybeAuthorizeStartupReady()`.

Reviewer assessment: PASS — Evidence reviewed shows a single, coherent IPC contract across preload/renderer/main for startup readiness + language selection; no duplicated responsibility or ambiguous contract found that would justify a Level 3 change without a repro/bug report.
Reviewer gate: PASS

Observable contract/timing preserved (no code changes).

#### L4 — Logs (policy-driven tuning after flow stabilization) (Codex)

Decision: CHANGED

- Removed local `warnOnce` wrapper alias and updated all call sites to `log.warnOnce` (policy: no local wrappers/aliases).
- Prefixed the pre-interactive guard dedupe key with `BOOTSTRAP:` in `guardMainUserAction` (from `main.preReady.<actionId>` to `BOOTSTRAP:main.preReady.<actionId>`).

Reviewer assessment: PASS
- Logging-only change; IPC surface, payloads, ordering, and timing are untouched.
- `BOOTSTRAP:` prefix is coherent with `menuEnabled` being `false` until `startup:splash-removed` sets it `true`, after which the guard becomes unreachable in normal operation.

Validation (manual/grep):
- `rg -n -F "const warnOnce" electron/main.js` → no hits
- `rg -n -F "BOOTSTRAP:main.preReady." electron/main.js` → at least 1 hit

#### L5 — Comments (Codex)

Decision: CHANGED

- Fixed drift in the "Constants / config" section note:
  - Old (drifted): `Resolved after app readiness (requires app.getPath('userData')).`
  - New: `Static file paths and fallback data used across startup.`
- No functional changes; comments-only.

Reviewer assessment: PASS
- The old note was misleading: `electron/main.js` does not call `app.getPath('userData')`; this claim existed only in that comment.
- Anchor: the comment directly above `const LANGUAGE_WINDOW_HTML = path.join(__dirname, '../public/language_window.html');`.

Validation (static):
- Search for `app.getPath('userData')` in `electron/main.js` (should be absent after the change).

#### L6 — Final review (coherence + leftover cleanup after refactors) (Codex)

Decision: NO CHANGE

No Level 6 changes justified.
- Checked logging API usage: all sites call `log.warn|warnOnce|error|info|debug` directly; no leftover aliases/wrappers after L4.
- Verified readiness gating log keys: `guardMainUserAction` uses `BOOTSTRAP:main.preReady.*` and only emits when the main UI is not interactive.
- Confirmed IPC surface consistency within the file: key handlers/listeners remain present (`open-editor`, `open-preset-modal`, `crono-*`, `flotante-command`, `startup:renderer-core-ready`).
- Confirmed delegated IPC registration remains present (`registerLinkIpc`, `textState.registerIpc`, `settingsState.registerIpc`, `presetsMain.registerIpc`, `updater.registerIpc`).
- Comment/code alignment spot-check: L5 constants note remains accurate; end-of-file marker still present.

Reviewer assessment: PASS
- The reported checks target the only plausible leftover risks after L4 (logging API/style + dedupe keys) and L5 (comment drift), without inventing IPC/contract behavior.
Reviewer gate: PASS

Observable contract and timing were preserved (no code changes).

Validation (manual/grep):
- `rg -n -F "const warnOnce" electron/main.js` -> no hits
- `rg -n -F "BOOTSTRAP:main.preReady." electron/main.js` -> at least 1 hit

#### L7 — Smoke (human-run; minimal)

**Estado:** PASS

**Checklist ejecutado:**

* [x] (1) Arranque sano: iniciar la app desde terminal (para ver logs de main). Confirmar que no hay *uncaught exceptions* / *unhandled rejections* durante el arranque y que la app llega a estado operativo (ventana principal visible e interactiva).
* [x] (2) READY/interactividad: esperar a que se remueva el splash (o se habilite la interactividad) y verificar que las acciones normales no generan warnings de “ignored (pre-READY)” en el camino sano.
* [x] (3) Guard pre-READY (stress): relanzar e intentar disparar 5–10 veces una accion mientras aun no hay interactividad (por ejemplo: abrir editor, abrir preset modal, abrir flotante, o acciones del crono). Esperado: no crash; si aparece un warning “... ignored (pre-READY)”, debe ser **deduplicado** (no spam) para la misma accion.
* [x] (4) Crono sanity: en la ventana principal, toggle start/stop + reset; confirmar que el estado se refleja en UI y que no aparecen errores en logs.
* [x] (5) Flotante sanity: abrir flotante, confirmar que recibe actualizaciones de `crono-state` (por ejemplo, iniciar el crono y ver que flotante se actualiza). Cerrar flotante y confirmar que la ventana principal sigue operativa.
* [x] (6) Editor sanity: abrir editor (`open-editor`), confirmar que abre y recibe el texto inicial; cerrar y reabrir (ruta “already open”) sin errores.
* [x] (7) Preset modal sanity: abrir preset modal (`open-preset-modal`) desde el flujo normal de UI; confirmar que abre y se inicializa (sin warnings de “unauthorized” en el camino sano). Cerrar y reabrir.
* [x] (8) Logs: revisar que no hay spam nuevo de warnings tipo “failed (ignored):” durante uso normal; cualquier warning repetible debe estar razonablemente deduplicado (una sola vez por evento repetido sin nueva informacion).

---

### electron/main.js

Date: `2026-01-20`
Last commit: `78731dade08caa8c0a6f749ad22ff5074ccdc97e`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order:
    - Overview comment header.
    - Imports (electron, fs/path, local modules).
    - File locations and language fallback constants.
    - Helper utilities (`warnOnce`, `isPlainObject`).
    - Global window refs.
    - Menu/dev utilities (`getSelectedLanguage`, `buildAppMenu`, shortcuts).
    - Window factories (main/editor/preset/language).
    - Floating placement helpers + flotante window creation.
    - Stopwatch (crono) state + helpers.
    - IPC handlers (language, crono, flotante, editor, preset, config/version/runtime).
    - Delegated IPC registration calls.
    - App lifecycle (whenReady init + window creation, activate, window-all-closed, will-quit).
  - Where linear reading breaks:
    - `createLanguageWindow` mixes window creation and startup control: `"if (!mainWin) createMainWindow()"`.
    - `createFlotanteWindow` bundles window creation with positioning + guard wiring: `"installWorkAreaGuard(win"`.
    - `app.whenReady` contains both bootstrapping and IPC wiring: `"textState.registerIpc(ipcMain"`.

- Contract map (exports / side effects / IPC):
  - Module exposure:
    - No exports; side-effect module that initializes Electron main process, windows, IPC, and lifecycle listeners.
  - Invariants and fallbacks (anchored):
    - Menu language defaults when empty: `getSelectedLanguage` uses `"falling back to \"${DEFAULT_LANG}\""`.
    - Flotante options must be an object: `createFlotanteWindow` logs `"invalid options; using defaults (ignored)."`.
    - Crono elapsed cannot be set while running: `setCronoElapsed` checks `"crono-set-elapsed ignored: crono is running"`.
    - Language manifest must be valid array of entries or fallback: `get-available-languages` returns `"Using fallback"`.
    - Main window required for preset modal: `open-preset-modal` guards `"main window not ready"` and `"unauthorized"`.
    - Work area required for snapping: `snapWindowFullyIntoWorkArea` warns `"workArea unavailable; snap skipped"`.
  - IPC contract (only what exists in this file):
    - `ipcMain.handle(...)`:
      - `get-available-languages` → returns `Array<{tag,label}>` (fallback to `FALLBACK_LANGUAGES`).
      - `crono-get-state` → returns `{elapsed:number,running:boolean,display:string}`.
      - `flotante-open` → returns `{ok:boolean,error?:string}`; triggers outbound `'crono-state'` via broadcast.
      - `flotante-close` → returns `{ok:boolean,error?:string}`.
      - `open-editor` → returns `{ok:boolean,error?:string}`; sends `'editor-init-text'` and `'editor-ready'`.
      - `open-preset-modal` → input `(payload:number|object|other)`; returns `{ok:boolean,error?:string}`; sends `'preset-init'`.
      - `get-app-config` → returns `{ok:boolean,maxTextChars:number,maxIpcChars:number,error?:string}`.
      - `get-app-version` → returns `string`.
      - `get-app-runtime-info` → returns `{platform:string,arch:string}`.
    - `ipcMain.on(...)`:
      - `crono-toggle` / `crono-reset` / `crono-set-elapsed` / `flotante-command` → trigger outbound `'crono-state'` (via start/stop/reset/set).
    - `ipcMain.once(...)`:
      - `language-selected` (one-shot listener).
    - `ipcRenderer.*`: none in this file.
    - `webContents.send(...)` occurrences:
      - `'editor-init-text'` payload `{text:string,meta:{source,action}}`
      - `'editor-ready'` payload none
      - `'preset-init'` payload object (initialData)
      - `'flotante-closed'` payload none
      - `'crono-state'` payload `{elapsed:number,running:boolean,display:string}`
    - Delegated IPC registration (contract expansion points; channels live in other modules):
      - `textState.registerIpc(...)`
      - `settingsState.registerIpc(...)`
      - `presetsMain.registerIpc(...)`
      - `updater.registerIpc(...)`
      - `registerLinkIpc(...)`

#### L1 decision: NO CHANGE

- El archivo ya tiene un layout por bloques claro (imports → constants → helpers → window factories → IPC → lifecycle) con encabezados de sección que facilitan navegación.
- Reordenar bloques de creación de ventanas / wiring IPC / lifecycle en un entrypoint puede introducir cambios sutiles de secuencia (IPC readiness/startup), lo cual está fuera de alcance.
- La duplicación existente es baja y localizada; extraer helpers añadiría indirection sin reducir ramas/duplicación materialmente.
- Varias helpers están acopladas a referencias de ventanas/Electron objects; separar/regroupar aumentaría cross-references y no mejoraría lectura.

**Evidence**
- L1 review concluded no change has clear payoff without timing risk.

**Risk**
- N/A (no code changes).

**Validation**
- Covered by L7 smoke checklist (no code changes to validate beyond baseline).

#### L2 decision: CHANGED

- Change: Added `isAliveWindow(win)` and replaced repeated `win && !win.isDestroyed()` checks across window guards and sends.
  - Gain: Consistent, scan-friendly liveness checks without altering behavior.
  - Cost: Adds a tiny helper indirection.
  - Validation: Run L7 smoke; specifically open/close editor/presets/flotante and confirm no new errors; verify `flotante-closed` and `crono-state` still propagate.

- Change: Added `toggleCrono()` and used it for both crono toggle entrypoints (`crono-toggle` and `flotante-command` toggle).
  - Gain: Removes duplicated toggle logic and keeps semantics aligned.
  - Cost: Minimal helper indirection.
  - Validation: From main UI and flotante UI, toggle stopwatch and verify state changes + broadcasts.

**Evidence**
- Repeated window-liveness checks and duplicated toggle logic were present in multiple call sites in `electron/main.js`.

**Risk**
- Low. Helpers are pure wrappers around existing conditions/calls; IPC surface and sequencing unchanged.

**Validation**
- L7 smoke checklist (focus on crono toggle paths and editor-ready/main notification).

#### L3 decision: NO CHANGE (no Level 3 justified)

**Evidence checked**
- IPC consumers in `electron/preload.js`: openEditor/getAppConfig/getAppVersion/getAppRuntimeInfo; sendCronoToggle/sendCronoReset/setCronoElapsed; openFlotanteWindow/closeFlotanteWindow/onFlotanteClosed — aligned with `ipcMain.handle`/`ipcMain.on` in `electron/main.js`.
- Flotante IPC in `electron/flotante_preload.js`: `crono-state`, `flotante-command` — matches main send/receive paths.
- Language selection IPC in `electron/language_preload.js`: `ipcRenderer.send('language-selected')` — matches `ipcMain.once('language-selected')`.
- Entrypoint: `package.json` `"main": "electron/main.js"`; no alternate main entry.
- No explicit TODO/FIXME/BUG markers in `electron/main.js` indicating architectural/contract instability.

**Risk**
- N/A (no code changes).

**Validation**
- Baseline L7 smoke checklist unchanged.

#### L4 decision: NO CHANGE

- Logger mechanism already correct for main process (`Log.get('main')`), with appropriate `log.error` in IPC handler failures.
- High-frequency/best-effort paths already use `warnOnce` with stable keys (e.g., `send.crono-state.*`, `mainWin.send.flotante-closed`, `snapWindowFullyIntoWorkArea.noWorkArea`).
- No silent fallbacks found in this file; fallbacks (language/manifest/options/workArea) already emit warn/error at appropriate levels.
- Further tuning would be marginal and risks either hiding actionable failures or adding indirection/noise.

**Risk**
- N/A (no code changes).

**Validation**
- Baseline L7 smoke checklist unchanged.

#### L5 decision: CHANGED (comments-only)

- Updated the top Overview responsibilities:
  - Clarified IPC ownership: main-owned handlers + delegated feature IPC registration.
  - Clarified lifecycle ownership (ready/activate/quit).
- Adjusted section divider naming to better match contents:
  - Renamed "File locations" → "Constants / config (paths, defaults, limits)".
- Added a "Helpers (logging + validation)" section divider to separate utilities from constants and improve scanability.
- (Manual follow-up) Removed a confusing/stale comment about "Maximum allowed characters" that was not anchored to a nearby definition and risked misleading readers.

**Evidence**
- Comment structure improvements were warranted to match the file’s actual responsibilities and sectioning (entrypoint-scale file).

**Risk**
- None (comments-only).

**Validation**
- Visual review: file remains readable; section headers adjacent to the blocks they describe; no non-ASCII characters introduced.
- Baseline L7 smoke checklist unchanged (no functional changes).

#### L6 decision: NO CHANGE

- Checked helper usage consistency (`isAliveWindow`, `warnOnce`): signatures and call sites aligned.
- Reviewed IPC handlers (`crono-*`, `flotante-*`, `open-*`, `get-app-*`): channel names + return shapes consistent with consumers.
- Verified logging API usage against `electron/log.js` for deduped warnings (warnOnce/errorOnce usage).
- Scanned for unused locals/imports introduced in Levels 1–5: none found.
- Confirmed section headers and comments still match actual blocks (constants, helpers, window factories, IPC, lifecycle).

Observable contract and timing preserved (no code changes).

#### L7 — Smoke checklist (human-run; code-informed)

Preconditions
- App runs normally with logs visible (terminal or DevTools console).
- For the language picker step, run with a fresh profile so the language window appears on startup.

1) Log sanity (existing logs)
- Action: Launch the app, click the crono toggle once while watching logs.
- Expected: No unexpected ERROR/uncaught exception lines; no continuous repeated spam from the same message/key.
- Evidence:
  - Target anchor (electron/main.js `broadcastCronoState`): "send crono-state to mainWin failed (ignored)".
  - Trigger chain anchors: `public/js/crono.js` "tToggle.addEventListener('click'"; `electron/preload.js` "sendCronoToggle: () => ipcRenderer.send('crono-toggle')".
  - Stable UI reference: `public/renderer.js` "getElementById('cronoToggle')".

2) Crono toggle start/stop
- Action: Click crono toggle, wait ~1s, click again.
- Expected: Crono starts counting, then pauses.
- Evidence:
  - Target: `electron/main.js` "ipcMain.on('crono-toggle'".
  - Chain: `public/js/crono.js` "tToggle.addEventListener('click'"; `electron/preload.js` "sendCronoToggle: () => ipcRenderer.send('crono-toggle')".
  - UI: `public/renderer.js` "getElementById('cronoToggle')".

3) Crono reset
- Action: Click crono reset.
- Expected: Crono display resets to 00:00:00.
- Evidence:
  - Target: `electron/main.js` "ipcMain.on('crono-reset'".
  - Chain: `public/js/crono.js` "tReset.addEventListener('click'"; `electron/preload.js` "sendCronoReset: () => ipcRenderer.send('crono-reset')".
  - UI: `public/renderer.js` "getElementById('cronoReset')".

4) Open editor window
- Action: Click edit to open editor window.
- Expected: Editor opens; main remains responsive.
- Evidence:
  - Target: `electron/main.js` "ipcMain.handle('open-editor'".
  - Chain: `public/renderer.js` "btnEdit.addEventListener('click'"; `electron/preload.js` "openEditor: () => ipcRenderer.invoke('open-editor')".
  - UI: `public/renderer.js` "getElementById('btnEdit')".

5) Open new preset modal
- Action: Click new preset.
- Expected: Preset modal opens.
- Evidence:
  - Target: `electron/main.js` "ipcMain.handle('open-preset-modal'".
  - Chain: `public/renderer.js` "btnNewPreset.addEventListener('click'"; `electron/preload.js` "openPresetModal: (payload) => ipcRenderer.invoke('open-preset-modal'".
  - UI: `public/renderer.js` "getElementById('btnNewPreset')".

6) Flotante window open/close via switch
- Action: Toggle flotante switch on, then off.
- Expected: Flotante appears then closes; main switch reflects state.
- Evidence:
  - Target: `electron/main.js` "ipcMain.handle('flotante-open'" / "ipcMain.handle('flotante-close'".
  - Chain: `public/js/crono.js` "toggleVF.addEventListener('change'"; `electron/preload.js` "openFlotanteWindow: async () =>" / "closeFlotanteWindow: async () =>".
  - UI: `public/renderer.js` "getElementById('toggleVF')".

7) Flotante controls update main crono
- Action: In flotante window, click toggle and reset.
- Expected: Main crono reflects same running/reset state.
- Evidence:
  - Target: `electron/main.js` "ipcMain.on('flotante-command'".
  - Chain: `public/flotante.js` "sendCommand({ cmd: 'toggle' })" / "sendCommand({ cmd: 'reset' })"; `electron/flotante_preload.js` "ipcRenderer.send('flotante-command', cmd)".
  - UI: `public/flotante.js` "getElementById('toggle')" / "getElementById('reset')".

8) Language picker selection (first run only)
- Action: In language window, click a language in the list.
- Expected: Language window closes and main window opens.
- Evidence:
  - Target: `electron/main.js` "ipcMain.once('language-selected'".
  - Chain: `public/language_window.js` "langList.addEventListener('click'"; `electron/language_preload.js` "ipcRenderer.send('language-selected', tag)".
  - UI: `public/language_window.js` "getElementById('langList')".

Not smoke-testable (optional)
- None.

**CONCLUSION**: Smoke test **PASSED**

---

### electron/settings.js

Date: `2026-01-21`
Last commit: `ce268a09c6a269e6a7c93b982d166a79d0434660`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order:
    - Overview (responsibilities).
    - Imports / logger (`Log.get('settings')`).
    - Language helpers (`normalizeLangTag`, `normalizeLangBase`, `getLangBase`, `deriveLangKey`).
    - Injected dependencies + cache (`_loadJson`, `_saveJson`, `_settingsFile`, `_currentSettings`).
    - Number format defaults loader (`loadNumberFormatDefaults` → `i18n/<langBase>/numberFormat.json`).
    - Number formatting normalization (`ensureNumberFormattingForBase`).
    - Settings normalization (`normalizeSettings`).
    - State API (`init`, `getSettings`, `saveSettings`).
    - Broadcast (`broadcastSettingsUpdated`).
    - Fallback language (`applyFallbackLanguageIfUnset`).
    - IPC registration (`registerIpc`).
    - Exports.
  - Where linear reading breaks:
    - `normalizeSettings` mezcla normalización de schema + buckets dependientes de idioma: `"language-dependent buckets will use fallback"`.
    - `registerIpc` agrupa persistencia + rebuild de menú + UI de ventanas secundarias + broadcast: `"Hide the toolbar/menu in secondary windows (best-effort)."`.
    - `set-language` contradice parcialmente su comentario (“saves language”) porque el persist es condicional: `"if (chosen) {"`.
    - `getSettings` rompe la expectativa de cache-only porque relee de disco cada vez: `"This reflects external edits to the settings file."`.

- Contract map (exports / side effects / IPC):
  - Module exposure:
    - Exports: `normalizeLangTag`, `normalizeLangBase`, `getLangBase`, `deriveLangKey`, `init`, `registerIpc`, `getSettings`, `saveSettings`, `applyFallbackLanguageIfUnset`, `broadcastSettingsUpdated`.
    - Side effects: inicializa logger en load (`Log.get('settings')`); `registerIpc` instala handlers en `ipcMain`; `broadcastSettingsUpdated` emite mensajes a ventanas.
  - Invariants and fallbacks (anchored):
    - Base lang inválido → `DEFAULT_LANG`: `normalizeLangBase` `"return DEFAULT_LANG"`.
    - Root inválido → `{}`: `normalizeSettings` `"Settings root is invalid; using empty object:"`.
    - `language` inválido → `''`: `normalizeSettings` `"Invalid settings.language; forcing empty string:"`.
    - Buckets inválidos → `{}`: `normalizeSettings` `"resetting to empty object:"` para:
      - `presets_by_language`
      - `selected_preset_by_language`
      - `numberFormatting`
      - `disabled_default_presets`
    - `modeConteo` inválido → `'preciso'`: `normalizeSettings` `"Invalid modeConteo; forcing default:"`.
    - number formatting default (si i18n missing/invalid): `ensureNumberFormattingForBase` `"Using default number formatting (fallback):"`.
    - `getSettings` requiere `init`: lanza `"[settings] getSettings called before init"`.
    - Fallback language no-silencioso: `applyFallbackLanguageIfUnset` `"Language was unset; applying fallback language:"` y persiste.
  - IPC contract (only what exists in this file):
    - `ipcMain.handle(...)`:
      - `get-settings` → args `()`; returns `settings` (obj normalizado). En error, retorna `normalizeSettings(createDefaultSettings(DEFAULT_LANG))`.
      - `set-language` → args `(_event, lang)`; returns `{ ok: true, language: chosen }` o `{ ok: false, error }`.
        - Side effects (best-effort): `buildAppMenu(menuLang)`, ocultar menú en ventanas secundarias, y broadcast.
      - `set-mode-conteo` → args `(_event, mode)`; returns `{ ok: true, mode }` o `{ ok: false, error }`; broadcast.
      - `set-selected-preset` → args `(_event, presetName)`; returns `{ ok: true, langKey, name }` o `{ ok: false, error }`; **sin** broadcast.
    - `ipcMain.on(...)`: none in this file.
    - `ipcMain.once(...)`: none in this file.
    - `ipcRenderer.*`: none in this file.
    - `webContents.send(...)` occurrences:
      - `'settings-updated'` payload `settings` (object) via `broadcastSettingsUpdated` (best-effort a ventanas abiertas).
    - Delegated IPC registration: none in this file.

#### L1 decision: NO CHANGE

- Codex concluyó **NO CHANGE**: el archivo ya tiene un orden por bloques coherente y headers claros; los handlers IPC están agrupados; la normalización es verbosa a propósito.
- Un reordenamiento estructural sería churn con payoff bajo y potencial riesgo de secuencia (menu rebuild / broadcast / best-effort windows) sin reducción material de complejidad.
- No se identificó una simplificación local (early returns / deduplicación / naming) con ganancia clara que no agregue indirection o riesgo de timing.

**Risk**
- N/A (no code changes).

**Validation**
- N/A (no code changes; baseline unchanged).

#### L2 decision: CHANGED

- Change: Se centraliza el “default settings shape” introduciendo `createDefaultSettings(language = '')` y usándolo en:
  - `init()` (default para `_loadJson`)
  - `getSettings()` (default para `_loadJson`)
  - IPC `get-settings` fallback (default para `normalizeSettings(...)`)
  - Gain: elimina duplicación literal y reduce riesgo de drift (defaults en un solo lugar).
  - Cost: agrega un helper pequeño que hay que leer para ver los defaults.
  - Validation:
    - `rg -n -F "createDefaultSettings" electron/settings.js`
    - Revisar que el objeto coincide con los literales previos (`language`, `presets_by_language`, `selected_preset_by_language`, `disabled_default_presets`).
    - Smoke mínimo: abrir app → `get-settings` → cambiar idioma (`set-language`) → cambiar modo conteo (`set-mode-conteo`) y verificar que no hay errores y que el broadcast `settings-updated` sigue ocurriendo.

Observable contract/timing preserved: mismos canales IPC, payload/return shapes, side effects y ordering.

**Evidence**
- Diff: reemplazo de literales por `createDefaultSettings(...)` en `init`, `getSettings`, y fallback de `get-settings`.

**Risk**
- Low. Cambio local que reemplaza literales por un helper puro; no toca canales IPC ni orden de efectos.

**Validation**
- Grep + smoke mínimo (arriba).

#### L3 decision: NO CHANGE (no Level 3 justified)

**Evidence checked (anchors)**
- `electron/settings.js`: IPC surface already explicit and stable:
  - `ipcMain.handle('get-settings')` + safe fallback path; emits `settings-updated` only via `broadcastSettingsUpdated`.
  - `ipcMain.handle('set-language' | 'set-mode-conteo' | 'set-selected-preset')` returns `{ ok: ... }` shapes.
- `electron/language_preload.js`: direct consumer of `set-language` via `setLanguage()` → `ipcRenderer.invoke('set-language', langTag)`.
- `electron/main.js`: stable sequencing uses `settingsState.init(...)`, `settingsState.registerIpc(...)`, then `settingsState.applyFallbackLanguageIfUnset(...)`.
- `electron/presets_main.js`: uses `settingsState.getSettings()` / `settingsState.saveSettings()` and relies on settings broadcast semantics.

**Risk**
- None (no changes applied).

**Validation**
- Grep for: `get-settings`, `set-language`, `set-mode-conteo`, `set-selected-preset`, `settings-updated`.
- Manual smoke: change language; change counting mode; select preset; verify UI updates after `settings-updated`.

#### L4 decision: CHANGED

- Change: `saveSettings` ahora usa un `errorOnce` con key estable (`settings.saveSettings.persist`) en vez de interpolar `_settingsFile` en la key.
  - Gain: la key explícita deja de depender de valores no-controlados; el path sigue quedando en los args del log para diagnóstico.
  - Cost: la deduplicación deja de ser “por path” (irrelevante en la práctica: un settings file por ejecución).
  - Validation: confirmación por diff; no cambia contrato/IPC/timing.

Observable contract/timing preserved: no hay cambios de IPC, payloads/returns, side effects u ordering; solo cambia el bucket de dedupe del log en un `catch`.

#### L5 decision: CHANGED

- Updated the Overview responsibilities to include the existing `set-selected-preset` IPC handler.
- Updated the IPC registration comment to list `set-selected-preset` alongside the other handlers.
- No functional changes; comments-only.

**Evidence**
- Diff confirms comment-only changes in `electron/settings.js` (Overview + IPC list).

**Risk**
- None (comments-only).

**Validation**
- Visual review: comments match the actual IPC handlers registered in `registerIpc`:
  `get-settings`, `set-language`, `set-mode-conteo`, `set-selected-preset`.

#### L6 decision: CHANGED

- Change: `broadcastSettingsUpdated` ahora incluye el nombre de la ventana (`name`) en los args del `warnOnce` cuando falla `webContents.send('settings-updated', ...)`.
- Gain: el output del warning identifica la ventana objetivo sin depender de la dedupe key.
- Cost: una línea de log ligeramente más larga en caso de fallo.
- Risk: none (log-only change).
- Validation: `rg -n "settings-updated notify failed" electron/settings.js` y confirmar que el `warnOnce` incluye `name` como argumento.

Observable contract/timing preserved: no hay cambios en IPC, payloads/returns, side effects u ordering; solo cambia el contenido del log en caso de fallo.

#### L7 — Smoke (human-run; minimal)

Result: PASS

Checklist ejecutado:
- [x] Log sanity ~30s idle (sin ERROR/uncaught; sin repeticion continua del mismo warning en idle).
- [x] Lectura inicial de settings en main (UI estable; estado definido).
- [x] Cambiar idioma (persist + UI se refleja; sin errores).
- [x] Toggle modo conteo (persist; refresh sin errores).
- [x] Cambiar preset seleccionado (persist; WPM/controles cambian).
- [x] Abrir Editor (estable).
- [x] Abrir Flotante (estable).
- [x] Con Editor+Flotante abiertos: cambiar idioma (broadcast estable).
- [x] Reinicio de app: idioma/modo/preset persistidos.

Notas:
- No apareció nada relevante

---

### electron/fs_storage.js

Date: `2026-01-21`
Last commit: `dc666337e39e54416215e97d23bded5a7d27689`

#### L0 — Minimal diagnosis (Codex, verified)

##### 0.1 Reading map

- Block order (as-is):
  1) Overview + notes (explicitly “intentionally synchronous”)
  2) Imports / logger (`fs`, `path`, `Log.get('fs-storage')`)
  3) Config paths (`let CONFIG_DIR = null`)
  4) Directory helpers (`initStorage`, getters, ensure*Dir)
  5) JSON helpers (`loadJson`, `saveJson`)
  6) Exports

- Linear-reading breaks / obstacles:
  - `loadJson()` mixes generic JSON loading with file-specific “missing file” notes keyed by basename:
    - anchor: `if (baseName === 'current_text.json') ... else if ...`
  - warnOnce keys embed `String(filePath)` (key cardinality scales with path variety):
    - anchor: `` `fs_storage.loadJson:missing:${String(filePath)}` `` (similar for `:empty:` and `:failed:`)

##### 0.2 Contract map

- Exposes (module.exports):
  - init: `initStorage(app)` (sets CONFIG_DIR)
  - path getters: `getConfigDir`, `getConfigPresetsDir`, `getSettingsFile`, `getCurrentTextFile`, `getEditorStateFile`
  - directory ensure: `ensureConfigDir`, `ensureConfigPresetsDir`
  - JSON IO: `loadJson(filePath, fallback = {})`, `saveJson(filePath, obj)`

- Side effects at load:
  - logger instance created on require: `Log.get('fs-storage')`

- Invariants / tolerated errors (anchored):
  - `initStorage(app)` hard-requires a valid Electron app (`getPath`) and, if present, readiness:
    - throws on invalid app: `[fs_storage] initStorage requires Electron app`
    - throws if called before ready: `[fs_storage] initStorage called before app is ready`
  - config root is derived from userData:
    - `CONFIG_DIR = path.join(app.getPath('userData'), 'config')`
  - `getConfigDir()` requires prior init:
    - throws: `[fs_storage] CONFIG_DIR is not initialized`
  - `ensureConfigDir()` / `ensureConfigPresetsDir()` are best-effort:
    - they catch and log error (including `(uninitialized)` path marker).
  - `loadJson()` is recoverable-by-design:
    - missing file → warnOnce + returns fallback (adds “note:” depending on basename)
    - empty/whitespace-only file → warnOnce + returns fallback
    - invalid JSON/other read error → warnOnce + returns fallback
    - removes UTF-8 BOM before parse
  - `saveJson()` ensures the parent folder exists before write; write failures are logged.

- IPC contract: none (no ipcMain/ipcRenderer/webContents usage).
- Delegated IPC registration: none.

#### L1 decision: NO CHANGE

- El archivo ya está ordenado en bloques coherentes con separadores claros (overview → imports/logger → config state → helpers → exports).
- El flujo es simple y con baja anidación; aplicar early-returns / reordenamiento no mejora lectura sin introducir churn.
- La duplicación es mínima y localizada; extraer helpers comunes (p.ej. ensure-dir / warnOnce wrappers) agregaría indirección sin reducir ramas/duplicación de forma significativa.
- El único punto “mixto” es el special-casing por basename dentro de `loadJson()` para notas de “missing file”; extraerlo a mapa/helper sería un concepto nuevo con payoff marginal, así que no se justifica en L1.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

#### L2 decision: NO CHANGE

- `loadJson()` ya explicita y maneja como recoverable: missing/empty/invalid JSON → warnOnce + fallback (sin crash).
- `saveJson()` ya asegura el directorio padre antes de escribir (“callers do not depend on init ordering”).
- No hay duplicación o complejidad de ramas/anidación que justifique helpers nuevos sin añadir indirección.
- No existe IPC ni secuenciación timing-sensitive en este módulo que requiera ajustes en L2.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

#### L3 decision: NO CHANGE (no Level 3 justified)

- Checked module contract and guardrails in `electron/fs_storage.js` (`initStorage`, `getConfigDir`, `loadJson`, `saveJson`) for instability or ambiguity.
- Checked call site orchestration in `electron/main.js` (`initStorage(app)`, `getSettingsFile()`, `getCurrentTextFile()`, `loadJson`, `saveJson`) for timing or ordering pressure.
- Checked settings consumer expectations in `electron/settings.js` (`init({ loadJson, saveJson, settingsFile })`, `_loadJson`/`_saveJson` usage).
- Checked text persistence usage in `electron/text_state.js` (`loadJson = opts.loadJson`, `saveJson = opts.saveJson`, `loadJson(currentTextFile, ...)`).
- Checked editor state usage in `electron/editor_state.js` (`loadInitialState(loadJson)`, `attachTo(..., loadJson, saveJson)`).
- Checked presets path use in `electron/presets_main.js` (`getConfigPresetsDir`, `ensureConfigPresetsDir`).

Conclusion: no direct evidence of unstable contract, duplicated responsibility, or sync/async mismatch requiring Level 3 changes.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

#### L4 decision: CHANGED (logging-only)

Change: Stabilized `loadJson` warnOnce dedupe keys to comply with “controlled variant” policy (no unbounded/dynamic data in keys).

- What changed (structural/logging):
  - Added `LOAD_JSON_KNOWN_FILES` (Set) and `getLoadJsonOnceKey(kind, filePath)`.
  - Replaced warnOnce explicit keys for `loadJson` fallbacks:
    - from: `fs_storage.loadJson:missing|empty|failed:<String(filePath)>`
    - to: `fs_storage.loadJson.<kind>.<variant>` where:
      - kind ∈ { `missing`, `empty`, `failed` }
      - variant ∈ { `current_text.json`, `user_settings.json`, `editor_state.json`, `other` }
  - Kept `filePath` (and `err` where applicable) in log args to preserve diagnostic context.

Gain: Deduplication buckets are now stable/controlled and comply with logging policy while keeping fallback warnings non-silent.
Cost: “other” bucket may hide repeated occurrences for different non-known files (only first occurrence per kind is logged).
Validation:
- `rg -F "getLoadJsonOnceKey" electron/fs_storage.js`
- `rg -F "fs_storage.loadJson." electron/fs_storage.js`
- Runtime: trigger missing/empty/invalid JSON for a known file and verify only one warnOnce per (kind, variant) while the message still prints the `filePath` (and `err` for failed).

Observable contract and timing preserved: yes (logging-only; no functional changes).

#### L5 decision: NO CHANGE (comments)

- Overview already lists responsibilities and constraints (sync main process; recoverable fallbacks).
- Section dividers match the actual block order and follow `electron/main.js` style.
- Comments are intent/constraints-focused with no obvious drift.
- End-of-file marker already present and correctly styled.
- Further edits would be cosmetic and risk drift without improving clarity.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

#### L6 decision: NO CHANGE (final review)

No Level 6 changes justified.
- Checked helper usage consistency (`LOAD_JSON_KNOWN_FILES`, `getLoadJsonOnceKey`, `loadJson`).
- Checked logging API usage against `electron/log.js` (`log.warnOnce`, `log.error`).
- Checked initialization invariants and guards (`initStorage`, `getConfigDir`).
- Checked fallback behavior and return shapes (`loadJson`, `saveJson`).
- Checked comments align with behavior and structure (section headers and notes).

Observable contract and timing preserved: yes (no code changes).

Risk: N/A (no code changes).
Validation: N/A (no code changes).

#### L7 smoke (human-run)

Result: PASS

Steps executed:
- Launch the app with logs visible (terminal / DevTools). Expected: no uncaught exceptions; no continuous warning spam in idle.
- Clean run: fully close the app, rename/delete `%APPDATA%\tot-readingmeter\config\` (or the platform-equivalent `app.getPath('userData')/config`), then relaunch.
- Observe logs on clean run: recoverable `loadJson missing (using fallback)` warnings are acceptable, but should appear at most once per known file (e.g., `user_settings.json`, `current_text.json`, `editor_state.json`) and should not repeat continuously while idle.
- Reach main window (complete first-run language selection if it appears). Expected: app remains usable; no crashes.
- Clipboard overwrite: copy the “Small text” from `docs/test_suite.md`, click `📋↺`. Expected: preview + counts + time update immediately.
- Toggle counting mode (precise/simple) once. Expected: toggle works; results remain coherent (no NaN/blank).
- Manual editor: open editor, modify text, apply/close. Expected: main preview/results reflect the change.
- Presets: select an existing preset (time estimate changes), then create/edit a preset if available in UI. Expected: no errors; time recalculates.
- Fully close the app. Relaunch (existing state). Expected: persisted state loads (last text/settings/preset as applicable); no startup errors.
- Repeat one key action again (e.g., `📋+` append or re-select preset). Expected: behavior consistent; no new log spam.

Optional (only if executed):
- Force an “empty or invalid JSON” case for `current_text.json` (e.g., empty file) and relaunch once. Expected: a single recoverable fallback warning (`loadJson empty file (using fallback)` or `loadJson failed (using fallback)`), app still starts and uses fallback.

Notes (only if relevant):
- Ninguna

---

### electron/text_state.js

Date: `2026-01-21`
Last commit: `12ba2bc6346aedee364aea3080a6ade0e502ea55`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order:
    - Overview (responsibilities + IPC list).
    - Imports / logger (`Log.get('text-state')`).
    - Helpers: `isPlainObject`, `sanitizeMeta`.
    - Shared state + injected deps (caps, `currentText`, `loadJson`/`saveJson`, paths, `appRef`, `getWindows`).
    - Helpers: `safeSend`, `persistCurrentTextOnQuit`.
    - Entrypoints: `init`, `registerIpc`, `getCurrentText`.
    - Exports.
  - Where linear reading breaks:
    - `persistCurrentTextOnQuit` mezcla persistencia de texto con compatibilidad de settings:
      - anchor: `// Maintain previous behavior: ensure settings file exists.`
    - `init` mezcla normalización del input de disco (obj `{text}` vs string) con warnings + truncado/persist:
      - anchor: `Current text file has unexpected shape; using empty string.`
    - Comentario de `registerIpc` lista IPC incompleto (no menciona `clipboard-read-text`):
      - anchor: `Register the IPC handlers... get-current-text...`
    - `set-current-text` agrupa: normalización payload + cap IPC + truncado hard cap + broadcasts:
      - anchors: `set-current-text payload too large` / `entry truncated to effective hard cap`
    - `safeSend` agrega indirección (guard + try/catch + warnOnce) a `webContents.send`:
      - anchor: `webContents.send('${channel}') failed (ignored):`

- Contract map (exports / side effects / IPC):
  - Module exposure:
    - Exports: `init(options)`, `registerIpc(ipcMain, windowsResolver)`, `getCurrentText()`.
    - Side effects: `init` carga `currentText` desde disco y registra `appRef.on('before-quit', ...)`; `registerIpc` instala handlers.
  - Invariants and fallbacks (anchored):
    - `sanitizeMeta` acepta solo “plain object” y rechaza meta vacía o strings > `MAX_META_STR_CHARS`:
      - `if (!isPlainObject(raw)) return null`
    - `maxTextChars` puede inyectarse si `opts.maxTextChars > 0`; `maxIpcChars = maxTextChars * MAX_IPC_MULTIPLIER`.
    - `init`: shape inesperado en archivo de texto vigente → `warnOnce` + `''`:
      - `text_state.init.unexpectedShape`
    - `init`: si texto inicial excede hard cap → truncado + persist inmediato:
      - `Initial text exceeds effective hard cap ... truncated and saved.`
    - `set-current-text`: si `text.length > maxIpcChars` → rechazo (warnOnce + `{ ok:false, error:string }`):
      - `text_state.setCurrentText.payload_too_large`
    - `set-current-text`: si `text.length > maxTextChars` → truncado + `truncated:true`.
    - `clipboard-read-text`: restringido a invocación desde `mainWin` (sender autorizado):
      - `{ ok:false, error:'unauthorized', ... }`
    - `safeSend`: no envía si la ventana no existe o está destruida:
      - `if (!win || win.isDestroyed()) return`

  - IPC contract (only what exists in this file):
    - `ipcMain.handle('get-current-text')`
      - args: `()`
      - returns: `string`
      - outbound sends: none
    - `ipcMain.handle('clipboard-read-text')`
      - args: `(event)`
      - returns:
        - `{ ok:true, length:number, text:string }`, o
        - `{ ok:false, error:'unauthorized', text:'', length:0 }`, o
        - `{ ok:false, tooLarge:true, length:number, text:'' }`
      - outbound sends: none
    - `ipcMain.handle('set-current-text')`
      - args: `(_event, payload)` donde `payload` es `string` o `{ text, meta }`
      - returns: `{ ok:true, truncated:boolean, length:number, text:string }` o `{ ok:false, error:string }`
      - outbound sends (best-effort via `safeSend`):
        - `current-text-updated` payload `string`
        - `editor-text-updated` payload `{ text:string, meta:object }`
    - `ipcMain.handle('force-clear-editor')`
      - args: `()`
      - returns: `{ ok:true }` o `{ ok:false, error:string }`
      - outbound sends (best-effort via `safeSend`):
        - `current-text-updated` payload `''`
        - `editor-force-clear` payload `''`
    - `ipcMain.on(...)`: none
    - `ipcMain.once(...)`: none
    - `ipcRenderer.*`: none
    - `webContents.send(...)` strings used (via `safeSend`):
      - `current-text-updated`, `editor-text-updated`, `editor-force-clear`
    - Delegated IPC registration: none.

#### L1 — Structural refactor (Codex)

Decision: NO CHANGE

- Anchors (why “no change”):
  - `init`: "Initial load from disk + truncated"
  - `registerIpc`: "Register the IPC handlers related to currentText"
  - `persistCurrentTextOnQuit`: "ensure settings file exists"
  - `safeSend`: "webContents.send('...') failed (ignored)"
  - `sanitizeMeta`: "if (!isPlainObject(raw)) return null"
- Structure is already linear: imports → helpers → state → helpers → entrypoints → exports.
- Further reordering would mostly shuffle comments without reducing branches or responsibilities.

Considered and rejected:
- Move `isPlainObject`/`sanitizeMeta` into the later Helpers block: only cosmetic, no clearer flow.
- Extract each IPC handler into separate functions: adds indirection without reducing complexity.
- Split `registerIpc` into multiple registrars: expands concepts without eliminating logic.

#### L2 — Clarity / robustness (Codex)

Decision: NO CHANGE

- Input validation and truncation logic are already explicit and localized (`sanitizeMeta`, `set-current-text`), so further helpers would add indirection.
- Error handling is already bounded by `log.warnOnce`/`log.error` and try/catch blocks without noisy logs.
- IPC handlers are already grouped in `registerIpc`, and splitting them would not reduce branching or duplication.
- The persistence path and compatibility behavior are tightly coupled in `persistCurrentTextOnQuit`, and isolating them would increase cross-references.
- Any attempts to guard non-function `loadJson`/`saveJson` or missing file paths would change current error/log behavior.

The observable contract and timing are preserved (no changes applied).

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (repo anchors):
- `electron/text_state.js`: IPC handler present:
  - "ipcMain.handle('set-current-text', (_event, payload) =>"
- `electron/text_state.js`: clipboard IPC present:
  - "ipcMain.handle('clipboard-read-text', (event) =>"
- `electron/text_state.js`: notifications centralized via `safeSend`:
  - "safeSend(mainWin, 'current-text-updated', currentText);"
- `electron/editor_preload.js`: consumer invokes `set-current-text` with string payload:
  - "setCurrentText: (t) => ipcRenderer.invoke('set-current-text', t),"
- `electron/editor_preload.js`: editor subscribes to update event:
  - "ipcRenderer.on('editor-text-updated', (_e, text) => cb(text));"
- `electron/preload.js`: main renderer uses same invoke channel:
  - "setCurrentText: (text) => ipcRenderer.invoke('set-current-text', text),"
- `public/renderer.js`: caller expects `resp.error` on failure:
  - "throw new Error(resp.error || 'set-current-text failed');"

#### L4 — Logs (Codex)

Decision: CHANGED

- Change 1: `clipboard-read-text` refusal paths now emit `warnOnce` (deduped), eliminating silent fallbacks.
  - Gain: Visibility for unauthorized sender and oversize clipboard rejection, aligned with no-silent-fallback policy.
  - Cost: Two new deduped warn lines can appear on failure paths.
  - Validation: Trigger each path; confirm logs include:
    - key: `text_state.clipboardRead.unauthorized`
    - key: `text_state.clipboardRead.tooLarge`

- Change 2: Avoid `log.error` for the expected validation failure “payload too large” in `set-current-text` (keeps existing warnOnce path; suppresses error noise).
  - Gain: Reduces error-level noise for an expected, recoverable validation failure.
  - Cost: That specific failure no longer produces an error log line.
  - Validation: Send an oversized payload; confirm no `log.error('Error in set-current-text:', ...)` is emitted for that case, while the existing warnOnce still fires.

Observable contract and timing preserved; logging-only changes.

#### L5 — Comments (Codex)

Decision: CHANGED

- Updated the top Overview responsibilities to include `clipboard-read-text` and keep the compatibility note visible.
- Added section dividers to mirror the file’s real block order (validation/normalization; best-effort send+persistence; initialization/lifecycle; IPC registration/handlers; exports).
- Clarified the `registerIpc` docblock to enumerate all IPC channels and to note main/editor broadcasts (best-effort).
- No functional changes; comments-only.

#### L6 — Final review (Codex)

Decision: NO CHANGE

No Level 6 changes justified.
- Logging API usage is consistent: `safeSend` uses `warnOnce(key, ...)` with stable keys.
- Clipboard handler refusal paths are visible and deduped: `clipboard-read-text` unauthorized/too large warns.
- Error path keeps expected warn/error split: `set-current-text` warns on oversize and skips error for that case.
- IPC surface matches call sites: `registerIpc` defines get/set/force/clipboard and sends editor updates.
- Shared state and lifecycle wiring remain coherent: `init` loads, truncates, and attaches before-quit persistence.
- Comments align with code blocks and responsibilities (Overview and section dividers).

Observable contract and timing preserved (no changes applied).

#### L7 — Smoke (human-run; minimal)

Result: PASS

Checklist:
- [x] Log sanity ~30s idle (sin ERROR/uncaught; sin repeticion continua del mismo warning en idle).
- [x] Clipboard overwrite (📋↺): copiar un texto corto al portapapeles, ejecutar overwrite.
      Esperado: el texto vigente cambia y el UI (preview/conteos/tiempo) se actualiza.
- [x] Clipboard append (📋+): copiar un texto corto, ejecutar append.
      Esperado: se agrega en nueva linea (segun joiner), y el UI se actualiza.
- [x] Abrir Editor manual desde main.
      Esperado: ventana abre estable; sin errores.
- [x] Con el Editor abierto: ejecutar 📋↺ en main.
      Esperado: el Editor refleja el update (broadcast `editor-text-updated`), sin errores.
- [x] Vaciar texto desde main (Clear).
      Esperado: texto queda vacio en main y el Editor se limpia (via `force-clear-editor` / `editor-force-clear`).
- [x] Cerrar completamente la app y relanzar.
      Esperado: `init` carga el ultimo texto persistido (o vacio si se vacio); sin errores en startup.

---

### electron/editor_state.js

Date: `2026-01-21`
Last commit: `3dc666337e39e54416215e97d23bded5a7d27689`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order (as-is):
    - Imports (`screen`, `fs_storage`, `Log`) + logger (`Log.get('editor-state')`).
    - Default state (`DEFAULT_STATE`).
    - Helpers: `isValidReduced`, `normalizeState`.
    - API: `loadInitialState`.
    - API: `attachTo` (listener wiring + persistence rules A/B/C/D).
    - Exports (`module.exports`).
  - Where linear reading breaks:
    - `attachTo` — nested event handlers/rules inside the function:
      - anchor: `"editorWin.on('unmaximize', () => {"`
    - `saveReducedState` (inner function) — persistence side effects embedded in `attachTo`:
      - anchor: `"const saveReducedState = () => {"`
      - anchor: `"const current = loader(editorStateFile, { maximized: false, reduced: null });"`

- Contract map (exports / side effects / invariants / IPC):
  - Module exposure:
    - Exports: `loadInitialState(customLoadJson)`, `attachTo(editorWin, customLoadJson, customSaveJson)`.
  - Side effects:
    - Reads/writes persisted editor window state via `loadJson`/`saveJson` to the path from `getEditorStateFile()`.
    - Installs `BrowserWindow` listeners: `'resize'`, `'move'`, `'maximize'`, `'unmaximize'`, `'close'`.
    - Logs errors on read/write failures (`log.error(...)`).
  - Invariants and fallbacks (anchored):
    - Reduced bounds must be an object with finite numbers:
      - `isValidReduced`: `"typeof width === 'number'"` + `"Number.isFinite(width)"`
    - Invalid/missing state falls back to defaults:
      - `normalizeState`: `"return { ...base }"`
      - `loadInitialState`: `"return { ...DEFAULT_STATE }"`
    - `attachTo` is a no-op without a window:
      - `"if (!editorWin) return;"`
    - If `getEditorStateFile()` fails, `attachTo` aborts (no listeners registered):
      - `"[editor_state] getEditorStateFile failed:"`
    - Unmaximize fallback uses current display workArea or hardcoded defaults:
      - `"display && display.workArea"`
      - `": { x: 0, y: 0, width: 1200, height: 800 }"`
  - IPC contract:
    - None in this file (no `ipcMain.*`, `ipcRenderer.*`, `webContents.send(...)`).
  - Delegated IPC registration:
    - None found.

#### L1 — Structural refactor (Codex)

Decision: NO CHANGE

- File already follows imports → constants → helpers → main logic → exports order.
- The main logic is a single entrypoint (`attachTo`) with event handlers that read linearly as rules.
- Helper functions (`isValidReduced`, `normalizeState`) are already minimal and named for intent.
- Any extraction or reordering would add indirection without reducing branches or duplication.
- Early returns or merging branches risk altering the timing/side-effect cadence in event handlers.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

#### L2 — Clarity / robustness (Codex)

Decision: NO CHANGE

- The file is already compact and linear, with clear helper boundaries and event-handler rules.
- Duplication is minimal and tightly coupled to event timing; extracting helpers would add indirection.
- Error handling is present at each boundary (load/save/getEditorStateFile) with proportional logging.
- Any consolidation of load/normalize defaults risks obscuring distinct defaults used per event.
- Timing-sensitive event handlers are simple and readable as-is; restructuring would not add clarity.

Observable contract and timing were preserved.

#### L3 — Architecture / contract (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- `electron/main.js` — `createEditorWindow`: only uses `editorState.loadInitialState` and `editorState.attachTo`.
- `electron/editor_state.js` — `loadInitialState`: fallback/contract remains internal; anchor: `"return { ...DEFAULT_STATE }"`.
- `electron/editor_state.js` — `attachTo`: event handlers + side effects; anchors: `'resize'`, `'move'`, `'maximize'`, `'unmaximize'`, `'close'`.
- `electron/editor_state.js` — helpers: `normalizeState`, `isValidReduced` (invariants centralized).
- `electron/fs_storage.js` — `getEditorStateFile` / `editor_state.json` path usage (single storage contract).

#### L4 — Logs (Codex)

Decision: CHANGED

Cambios aplicados (logging-only):
- Se agregan `log.warnOnce(...)` al normalizar estado inválido en `normalizeState` (root no-objeto / `maximized` inválido si está presente / `reduced` inválido si está presente), para que los fallbacks no sean silenciosos.
- En `attachTo` (handler de `'unmaximize'`), se agregan `log.warnOnce(...)` cuando falta `state.reduced` y se usa el fallback de colocación, y cuando no hay `display.workArea` y se usan bounds hardcodeados.

Gain: Los fallbacks dejan de ser silenciosos y se deduplican con keys explícitas/estables, alineadas con la política de logging.
Cost: Aparecen warnings (deduped) en sesiones donde exista estado persistido malformado o el display no exponga `workArea`.
Observable contract and timing preserved: yes (logging-only; no functional changes).

Risk: Bajo (solo logs).
Validation:
- `rg -F "editor-state.normalize." electron/editor_state.js`
- `rg -F "editor-state.unmaximize." electron/editor_state.js`
- Runtime (manual): forzar un `editor_state.json` con shape inválida y abrir Editor manual; observar 1 warn (deduped). Probar maximize → unmaximize sin `reduced` persistido; observar warn (deduped).

#### L5 — Comments (Codex)

Decision: CHANGED (comments-only)

- Added an Overview block (responsibilities) in the established electron/* style.
- Inserted section dividers matching the file’s real blocks:
  Imports / logger, Constants / defaults, Helpers, API (public entrypoints), Exports.
- Replaced/removed “API:” inline comments in favor of a single API section header.
- Tweaked the fallback placement comment for clarity and ASCII consistency.
- Added an explicit end-of-file marker (“End of electron/editor_state.js”).

Risk: none (comments-only).
Validation: visual review (no code moved; comments adjacent to blocks; ASCII-only).

#### L6 — Final review (Codex)

Decision: NO CHANGE

No Level 6 changes justified.

Checks performed (anchors):
- Helpers/invariants: `normalizeState`, `isValidReduced` consistent with callers.
- Logging API signatures: `log.warnOnce(...)` / `log.error(...)` argument shapes consistent.
- Event handlers: `attachTo` (`resize`, `move`, `maximize`, `unmaximize`, `close`) keep timing/side effects intact.
- Exports + call sites: `loadInitialState`, `attachTo` match `electron/main.js` usage.
- Comments vs behavior: Overview + handler comments align with current logic.

Observable contract and timing were preserved.

#### L7 — Smoke (human-run; editor_state.js)

Result: PASS

**Precondition**

* App closed before touching config files.

##### L7-01 Baseline: open Editor once (creates/loads editor_state.json)

* [x] Action: Launch app → open Manual Editor (test_suite SM-08).
* [x] Expected: Editor window opens; main remains responsive; no uncaught exceptions.
* [x] Expected logs: on **clean run**, it is acceptable to see **one** warnOnce from `fs_storage.loadJson` about missing `editor_state.json` (created on first editor usage). No repeated spam.

##### L7-02 Persist reduced geometry (move/resize -> reopen)

* [x] Action: With editor **not maximized**, resize + move to a distinct position → close editor window → open editor again.
* [x] Expected: Editor reopens roughly at the same size/position (reduced bounds restored).
* [x] Expected: No new WARN/ERROR lines produced by normal move/resize activity (beyond any first-run fs_storage warning already seen).

##### L7-03 Persist maximized flag (maximize -> reopen)

* [x] Action: Maximize editor → close editor → open editor.
* [x] Expected: Editor opens **maximized** again.
* [x] Expected: No ERROR logs.

##### L7-04 Unmaximize restores last reduced bounds (non-fallback path)

* [x] Action: From maximized editor, click unmaximize (restore down).
* [x] Expected: Window returns to last reduced bounds (the one you had before maximize), not the fallback placement.
* [x] Expected logs: **no** “unmaximize: reduced bounds missing; …” warning in this healthy path.

---

#### Optional L7 (covers L4 warnOnce fallbacks explicitly)

These are optional because they require editing `editor_state.json`, but they validate the *new logging* and “no silent fallback” behavior.

##### L7-05 Force unmaximize fallback when reduced is missing

* [x] Setup: Close app. Backup `editor_state.json`. Replace contents with:

  ```json
  { "maximized": true, "reduced": null }
  ```
* [x] Action: Launch app → open editor → maximize (if not already) → unmaximize.
* [x] Expected behavior: Editor uses fallback placement (upper-right half of current monitor workArea).
* [x] Expected logs (deduped): one WARN line starting with:
  * `unmaximize: reduced bounds missing; using fallback placement (ignored).`
* [x] Dedupe check: repeat maximize/unmaximize multiple times in the same session → warning should not repeat.

##### L7-06 Force normalizeState invalid-shape warnings (valid JSON, wrong shape)

* [x] Setup: Close app. Backup `editor_state.json`. Replace contents with **one** of:
  * `null`
  * `{ "maximized": "yes", "reduced": 123 }`
* [x] Action: Launch app → open editor.
* [x] Expected behavior: App does not crash; editor opens using defaults/fallbacks.
* [x] Expected logs (deduped):

  * For `null`: one WARN line starting with `normalizeState: invalid state; using defaults (ignored).`
  * For `"maximized": "yes"`: one WARN line starting with `normalizeState: invalid maximized; using default (ignored).`
  * For `"reduced": 123`: one WARN line starting with `normalizeState: invalid reduced bounds; ignoring.`
* [x] Dedupe check: reopen editor / retrigger within same session → each warning should emit at most once per session.

---

### electron/presets_main.js

Date: `2026-01-21`
Last commit: `3dc666337e39e54416215e97d23bded5a7d27689`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order (as-is):
    - Header comment + `'use strict'`.
    - Imports (fs/path/electron) + logger (`Log.get('presets-main')`).
    - Constants/config (`DEFAULT_LANG`, `MAX_PRESET_STR_CHARS`, `PRESETS_SOURCE_DIR`).
    - Helpers (top-level): `resolveDialogText`, `isPlainObject`, `sanitizePresetInput`, `loadPresetArrayFromJson`, `loadDefaultPresetsCombined`, `copyDefaultPresetsIfMissing`.
    - Main entrypoint: `registerIpc(...)` (nested helpers + IPC handlers).
    - Exports (`module.exports`).
  - Where linear reading breaks:
    - `registerIpc` concentra helpers anidados + handlers IPC:
      - anchor: `"function registerIpc(ipcMain, { getWindows } = {})"`
    - `broadcast` mezcla “delegated broadcast” y fallback directo a `webContents.send`:
      - anchor: `"mainWin.webContents.send('settings-updated', settings);"`
    - Handler `get-default-presets` mezcla scan FS + fallback a presets embebidos:
      - anchor: `"ipcMain.handle('get-default-presets', () => {"`
    - Handler `request-delete-preset` mezcla validación, diálogos nativos y persistencia:
      - anchor: `"ipcMain.handle('request-delete-preset', async (_event, name) => {"`

- Contract map (exports / side effects / invariants / IPC):
  - Module exposure:
    - Exports: `registerIpc(ipcMain, { getWindows })`, `sanitizePresetInput(raw)`.
  - Side effects:
    - `registerIpc` ejecuta `copyDefaultPresetsIfMissing()` y registra handlers IPC.
    - Los handlers usan `dialog.showMessageBox(...)`, `shell.openPath(...)` y persisten settings vía `settingsState.saveSettings(...)`.
  - Invariants and fallbacks (anchored):
    - `ipcMain` requerido:
      - anchor: `"if (!ipcMain) {"`
    - Payload de preset debe ser plain object:
      - anchor: `"if (!isPlainObject(raw)) {"`
    - `name` requerido:
      - anchor: `"if (!name) {"`
    - Strings acotados por `MAX_PRESET_STR_CHARS`:
      - anchor: `"name.length > MAX_PRESET_STR_CHARS"`
    - `wpm` debe ser finito:
      - anchor: `"if (!Number.isFinite(wpmNum)) {"`
    - Idioma efectivo con fallback a `DEFAULT_LANG`:
      - anchor: `": DEFAULT_LANG;"`
    - `settings.presets_by_language` se normaliza a objeto + array por idioma:
      - anchor: `"settings.presets_by_language = {};"` y `"settings.presets_by_language[langCode] = [];"`
    - Validación de `name` en delete:
      - anchor: `"typeof name !== 'string'"` y `"trimmed.length > MAX_PRESET_STR_CHARS"`
  - IPC contract (only what exists in this file):
    - `ipcMain.handle('get-default-presets')`
      - Input: none
      - Return: `{ general: Array, languagePresets: Object }` (catch fallback: `{ general: [], languagePresets: {} }`)
      - Outgoing sends: none
    - `ipcMain.handle('open-default-presets-folder')`
      - Input: none
      - Return: `{ ok: true }` o `{ ok: false, error: string }`
      - Outgoing sends: none
    - `ipcMain.handle('create-preset')`
      - Input: `(_event, preset)`
      - Return: `{ ok: true }` o `{ ok: false, error: string, code: string }`
      - Outgoing sends:
        - `settings-updated` (via `broadcast(settings)`)
        - `preset-created` payload `sanitizedPreset`
    - `ipcMain.handle('request-delete-preset')`
      - Input: `(_event, name)`
      - Return: `{ ok: boolean, code?: string, error?: string, action?: string }`
      - Outgoing sends: `settings-updated` (via `broadcast(settings)`) cuando hay cambios persistidos
    - `ipcMain.handle('request-restore-defaults')`
      - Input: none
      - Return: `{ ok: true, action: 'restored', removedCustom: string[], unignored: string[] }` o `{ ok: false, code?: string, error?: string }`
      - Outgoing sends: `settings-updated` (via `broadcast(settings)`)
    - `ipcMain.handle('notify-no-selection-edit')`
      - Input: none
      - Return: `{ ok: true }` o `{ ok: false, error: string }`
      - Outgoing sends: none
    - `ipcMain.handle('edit-preset')`
      - Input: `(_event, payload)`
      - Return: `{ ok: true, action: 'edited', deletedAction: string|null }` o `{ ok: false, code: string, error?: string }`
      - Outgoing sends:
        - `settings-updated` (via `broadcast(settings)`)
        - `preset-created` payload `sanitizedPreset`
    - `ipcRenderer.*`: none in this file.
    - `webContents.send(...)` occurrences:
      - `'settings-updated'` payload `settings`; anchor: `"mainWin.webContents.send('settings-updated', settings);"`
      - `'preset-created'` payload `sanitizedPreset`; anchor: `"mainWin.webContents.send('preset-created', sanitizedPreset);"` (create-preset + edit-preset)
  - Delegated IPC registration:
    - None found in this file.

#### L1 — Structural refactor (Codex)

Decision: **NO CHANGE**

- Existing block order already follows imports → config → helpers → registerIpc → exports; reordering would not improve scanning.
- Helpers nested inside registerIpc depend on resolveWindows/settingsState/log; lifting them would add indirection.
- IPC handlers are grouped by feature and flow; reordering could subtly affect initialization/timing expectations.
- Default preset loading has intentional fallback paths; merging helpers risks altering edge-case behavior.
- Structural edits would not reduce branching or cognitive load enough to justify change.

#### L2 — Clarity / robustness refactor (Codex)

Decision: **CHANGED**

Change 1: Extract dialog setup into local helpers (`getDialogContext`, `getYesNoLabels`).
- Gain: Reduce duplicación del setup de idioma/textos/labels de diálogos en handlers (delete/restore/edit/notify), manteniendo call sites más legibles.
- Cost: Agrega indirection pequeña dentro de `registerIpc`.
- Validation: Grep de `getDialogContext(` y `getYesNoLabels(` y smoke manual de flujos que abren diálogos (delete preset, restore defaults, edit preset, notify-no-selection-edit).

Change 2: Centralize `disabled_default_presets` initialization with `ensureDisabledDefaultPresets`.
- Gain: Elimina duplicación del “shape-setup” y unifica la creación/normalización del array por idioma.
- Cost: Indirection menor en los puntos que mutan `settings.disabled_default_presets`.
- Validation: Grep de `ensureDisabledDefaultPresets(` y smoke manual de delete/edit/restore que ignoran/unignoran defaults.

Observable contract, IPC surface, side effects, and timing preserved (per Codex report; diff shows handler order unchanged and only local helper extraction).

#### L3 — Architecture / contract changes (Codex, rerun with repo-wide consumer scan)

Decision: **NO CHANGE (no Level 3 justified)**

Evidence provided by Codex (repo-wide string scan + consumer interpretation):
- Handlers: repo-wide occurrences + consumer return interpretation for:
  - `get-default-presets` (consumer reads `defaults.general` / `defaults.languagePresets`)
  - `open-default-presets-folder` (consumer checks `res.ok` then `res.error`)
  - `create-preset` (consumer checks `res.ok` else error UI)
  - `request-delete-preset` (consumer checks `res.ok` and `res.code` like `NO_SELECTION`/`CANCELLED`)
  - `request-restore-defaults` (consumer checks `res.ok` and `res.code === 'CANCELLED'`)
  - `notify-no-selection-edit` (consumer awaits call; ignores return)
  - `edit-preset` (consumer checks `res.ok` and `res.code === 'CANCELLED'`)
- Events:
  - `settings-updated`: repo-wide listeners enumerated across multiple preloads.
  - `preset-created`: emitter occurrences listed; consumption traced via preload callback + renderer handler.

Reviewer assessment (sufficiency & inference quality):
- Sufficient evidence to support NO CHANGE at Level 3: no demonstrated multi-consumer divergence in handler return semantics.
- Remaining incompleteness: event payload semantics are not compared across renderer consumers (especially `settings-updated`), and `preset-created` evidence anchors include handler internals but not the subscription site; therefore “no conflicting payload assumptions” is under-supported.

#### L4 — Logs (policy-driven tuning) (Codex)

Decision: **CHANGED**

Changes (logging-only + minimal support):
- Added stable key helper for JSON-related warnOnce/errorOnce bucketing (`presetJsonKey(filePath)`; suffix uses source + basename).
- `loadPresetArrayFromJson`:
  - Non-array JSON now logs `warnOnce` and falls back to `[]` (recoverable).
  - Read/parse failure now logs `warnOnce` “load failed; using empty list (ignored)” and falls back to `[]`.
- Defaults fallbacks now non-silent:
  - General defaults missing/empty in config: `warnOnce` key `presets_main.defaults.general.fallback`.
  - Bundled general defaults missing/empty: `errorOnce` key `presets_main.defaults.general.missingBundled`.
  - Language defaults: `warnOnce` key `presets_main.defaults.lang.fallback:<lang>`, avoiding double-logging when config parse failed for that lang.
- `copyDefaultPresetsIfMissing`:
  - Missing bundled presets dir now `warnOnce` (skipped; ignored).
  - Copy failures downgraded to `warn` (ignored), and whole-function failure downgraded to `warn` (ignored), consistent with best-effort fallback policy.
- Best-effort sends and broadcast failures:
  - Missing `broadcastSettingsUpdated` export now `warnOnce` then fallback to `mainWin` send.
  - Broadcast failure now `warnOnce` “settings-updated notify failed (ignored): …”.
  - `preset-created` send failures now `warnOnce` (create/edit variants).

Reviewer assessment (sufficiency):
- Evidence supports policy alignment (no silent fallbacks; best-effort sends deduped).
- Validation plan is good for triggering paths, but incomplete: missing explicit “healthy path is not noisy” check and explicit justification that key suffixes are controlled variants (non-explosive).

Observable contract/timing preserved (report + change scope limited to logging and helper keys).

Evidence:
- Diff: `electron/presets_main.js` (keys: `presets_main.defaults.*`, `presets_main.presetsJson.*`, `presets_main.broadcast.*`, `presets_main.send.preset-created.*`).

#### L5 — Comments (QA follow-up) (Codex)

Decision: **CHANGED** (comments-only)

Observed changes (diff-based):
- Updated `loadDefaultPresetsCombined` doc/comment wording to match current fallback behavior (missing/empty/parse failure -> bundled).
- Reworded startup seeding comment for `copyDefaultPresetsIfMissing` to “seed without overwriting” intent.
- Fixed comment drift around startup seeding (best-effort language).
- Improved intent-focused comments across IPC handlers (create/delete/restore/edit) and clarified semantics (preset name uniqueness as key; best-effort window notifications; custom-vs-default delete behavior).
- Removed redundant comment that restated `NOT_FOUND` control flow.
- Adjusted section divider placement so documentation blocks remain adjacent to the symbol they document (divider moved around `registerIpc` JSDoc).

Evidence:
- Diff: `electron/presets_main.js` (comments-only).

#### L6 — Final review (Codex)

Decision: **CHANGED** (comments-only)

Observed changes (diff-based):
- Fixed JSDoc drift in `registerIpc` params: `opts.getWindows` shape now lists `flotanteWin` (was `floatingWin`), aligning documentation with actual window naming used by callers.

Reviewer assessment (sufficiency & inference quality):
- The change is justified as a documentation drift fix, and it is comments-only (so contract/timing are preserved by construction).

Evidence:
- Diff: `electron/presets_main.js` (JSDoc line in `registerIpc` opts.getWindows shape).

#### L7 — Smoke test (humano) — `electron/presets_main.js`

Result: PASS

A) Camino principal (config existente)
- [x] SM-01 Arranque normal: UI usable, sin modal bloqueante.
- [x] Log sanity (idle 20–30s con logs visibles): sin spam de WARN/ERROR repetidos, sin uncaught exceptions.
- [x] SM-07 Seleccion de preset: cambia WPM y tiempo estimado coherentemente.

CRUD presets (idioma actual)
- [x] REG-PRESETS-01 Create: crear preset `l7_smoke` (WPM 300). Aparece y aplica.
- [x] REG-PRESETS-02 Edit: editar `l7_smoke` -> WPM 275. Confirma y aplica.
- [x] REG-PRESETS-07 Persistencia: con `l7_smoke` seleccionado, cerrar app y relanzar. Sigue presente/seleccionado/aplicado.


Aislamiento por idioma base
- [x] REG-PRESETS-03 Cambiar idioma base y verificar que `l7_smoke` NO aparece en el otro idioma; volver y confirmar que SI aparece.

Delete + restore defaults
- [x] REG-PRESETS-04 Delete: borrar `l7_smoke` (confirm dialog). Desaparece y queda seleccion valida (fallback seguro).
- [x] REG-PRESETS-06 Restore defaults: restaurar defaults (R). Lista queda valida y seleccion valida (fallback seguro).

Abrir carpeta de presets_defaults (IPC `open-default-presets-folder`)
- [x] Abrir “default presets folder” desde UI/menu. Se abre el file manager en `config/presets_defaults/`.

B) (Opcional) Clean run (para cubrir seeding de defaults)
- [x] Clean first-run: renombrar/borrar `config/` y lanzar app. Arranca ok y presets defaults aparecen (sin necesidad de corrupcion manual).

---

### electron/menu_builder.js (re-audit post-startup change)

Date: `2026-02-08`
Last commit: `d68850f7f4436e43ed38ced4bedfc068ae8673ea`

#### L0 — Diagnosis (re-audit)

**0.1 Reading Map**
- Block order: overview header → external imports → internal imports → helpers (logging/utilities) → translation loading → `getDialogTexts` → `buildAppMenu` (nested helpers + menu templates + dev menu) → exports.
- Linear reading breaks / obstacles (identifier + micro-quote):
  - `buildAppMenu` — `const menuTemplate = [`
  - `sendMenuClick` (nested in `buildAppMenu`) — `mainWindow.webContents.send('menu-click', payload)`
  - `loadBundle` — `for (let i = 0; i < files.length; i++)`

**0.2 Contract Map**
- Exposes: `getDialogTexts(lang)`, `buildAppMenu(lang, opts)`, `resolveDialogText(dialogTexts, key, fallback, opts)`.
- Side effects (anchored):
  - `Menu.buildFromTemplate`, `Menu.setApplicationMenu`
  - Filesystem reads: `fs.existsSync`, `fs.readFileSync`
  - Dev menu flag: `process.env.SHOW_DEV_MENU`
  - Focused window usage: `BrowserWindow.getFocusedWindow`
- Invariants (anchored):
  - Menu dispatch gated: `if (isMenuEnabled()) return true` and `if (!canDispatchMenuAction(payload)) return;`
  - Best-effort drop if no window: `if (!mainWindow)` / `if (mainWindow.isDestroyed())`
  - Translation merge fallback: `return deepMerge(defaultBundle || {}, overlay || {})`

**IPC contract (only what exists in this file)**
- `webContents.send('menu-click', payload)`
  - Channel: `'menu-click'`
  - Input: `payload` (at send boundary)
  - Return: n/a
- No `ipcMain.*` or `ipcRenderer.*` occurrences.
- Delegated IPC registration: none found.

#### L1 — Structural refactor and cleanup

**Estado:** PASS (CHANGED)

**Cambios realizados (estructurales; sin cambio de contrato):**
- Se agregó helper local `resolveDevTarget()` dentro de `buildAppMenu` para centralizar selección “focused-or-main”.
- Se reemplazaron 3 bloques duplicados de selección de target en el menú dev (`dev.reload`, `dev.forceReload`, `dev.toggleDevTools`) por `const target = resolveDevTarget();`.
- Se mantuvieron intactos guards, logging y `try/catch` de cada acción.

**Anclas (micro-quotes):**
- Nuevo helper: `const resolveDevTarget = () => {`
- Uso en acciones dev: `const target = resolveDevTarget();`
- Guard preservado: `if (!canDispatchMenuAction('dev.reload')) return;` (análogos para las otras acciones)

**Confirmación:** contrato/behavior/timing preservados (mismas llamadas y side effects; sin cambios de exports ni IPC surface).

#### L2 — Clarity / robustness refactor (Codex)

**Estado:** PASS (NO CHANGE)

**Razones (Codex):**
- El archivo ya está seccionado y con fallbacks explícitos; reordenar no mejora materialmente.
- `loadBundle` ya cubre faltantes/invalid/empty con fallbacks; factorizar agrega indirection sin bajar ramas.
- `menuTemplate` es data larga por naturaleza; extraer builders aumentaría “saltos” y empeora lectura lineal.
- El envío `menu-click` y el logging best-effort ya son explícitos; más guards/logs arriesgan alterar superficie observable o volumen.
- No hay registro IPC (`ipcMain.*`/`ipcRenderer.*`) ni `app.whenReady` en este archivo.

**Anclas (micro-quotes):**
- Secciones explícitas: `// =============================================================================`
- Robustez i18n: `if (!fs.existsSync(file)) continue;` / `if (raw.trim() === '')` / `return JSON.parse(raw);`
- IPC outbound (send): `mainWindow.webContents.send('menu-click', payload)`

**Confirmación:** contrato/behavior/timing preservados (NO CHANGE).

**Reviewer assessment:** PASS
- La decisión “NO CHANGE” es defendible dado que el archivo ya tiene estructura por secciones, fallbacks explícitos y dedupe (`warnOnce`/`errorOnce`), y los puntos “grandes” (menuTemplate) son inherentes.
- Nota de wording: aunque no hay IPC *registration* en este módulo, sí hay IPC *sending* vía `webContents.send('menu-click', ...)`.

#### L3 — Architecture / contract changes (Codex)

**Estado:** PASS (NO CHANGE; no Level 3 justified)

**Evidencia revisada (anchors):**
- Outbound IPC único desde este módulo: `mainWindow.webContents.send('menu-click', payload)` (best-effort + guards).
- Receiver path único (preload): `ipcRenderer.on('menu-click', wrapper)` expuesto como `onMenuClick`.
- Consumo UI (router): `window.electronAPI.onMenuClick((actionId) => { ... })` y dispatch por `handleMenuClick(actionId)`.
- Rebuild del menú ante cambio de idioma (settings): `buildAppMenu(menuLang);` (misma entrypoint).
- Helpers de textos/diálogos consumidos como helpers (no contrato IPC): `getDialogTexts(...)` / `resolveDialogText(...)` (consumidores: presets_main / updater).

**Conclusión:** no se encontró dolor real reproducible, ambigüedad de contrato ni conflicto entre consumidores que justifique un cambio Level 3.

**Confirmación:** contrato/behavior/timing preservados (NO CHANGE).

**Reviewer assessment:** PASS
- La evidencia revisada es consistente con un único canal “menu-click” (send → preload wrapper → router UI).
- Sin señales de responsabilidades duplicadas ni semánticas divergentes entre consumidores.

#### L4 — Logs (policy-driven tuning after flow stabilization) (Codex)

Decision: CHANGED

Non-trivial changes (keys explícitas warnOnce/errorOnce):
- `menu_builder.loadMainTranslations.overlayMissing:${requested}` -> `menu_builder.loadMainTranslations.overlayMissing`
- `menu_builder.loadMainTranslations.empty:${langCode}:${fileVariant}` -> `menu_builder.loadMainTranslations.empty:${fileVariant}`
- `menu_builder.loadMainTranslations.failed:${langCode}:${fileVariant}` -> `menu_builder.loadMainTranslations.failed:${fileVariant}`
- `menu_builder.loadMainTranslations.requiredMissing:${langCode}` -> `menu_builder.loadMainTranslations.requiredMissing`

Gain:
- Cumple “Key rule” (keys estables; sin datos per-occurrence/arbitrary en el bucket de dedupe).
Cost:
- Dedupe más grueso: estos eventos ya no se diferencian por idioma; se dedupean por proceso (y en empty/failed, solo por `fileVariant`).
Validation:
- Forzar un idioma sin overlay y confirmar 1 solo warning del tipo overlayMissing en la sesión.
- Introducir `main.json` vacío/JSON inválido y confirmar un warning por `fileVariant` (region/root).
- Verificar por grep que ya no existen keys con `:${requested}` / `:${langCode}:` en esos eventos.

Contract/behavior/timing:
- Preservado: cambios solo en strings de dedupe key; no cambia flujo de fallback ni side effects.

Reviewer gate: PASS
- Cambio acotado, alineado a política, sin drift observable fuera de dedupe.

#### L5 — Comments (JSDoc drift fix) (Codex)

Decision reported by Codex: CHANGED (JSDoc expanded for opts.resolveMainWindow / opts.isMenuEnabled)

Reviewer check (against current file):
- JSDoc for `buildAppMenu` still documents only:
  - `@param {Electron.BrowserWindow|null} [opts.mainWindow] ...`
  - `@param {Function} [opts.onOpenLanguage] ...`
- Implementation still reads and defaults:
  - `opts.resolveMainWindow`
  - `opts.isMenuEnabled`

Conclusion:
- Codex report does not match the updated file; L5 redo must be re-run and actually applied (comments-only).

#### L6 — Final review (coherence + leftover cleanup after refactors) (Codex)

Decision: NO CHANGE

No Level 6 changes justified.
- Checked `buildAppMenu` options vs JSDoc and usage (`resolveMainWindow`, `isMenuEnabled`, `onOpenLanguage`) and found alignment.
- Verified logging API usage for `warnOnce`/`errorOnce` sites in translation loading and menu dispatch; no signature drift.
- Confirmed IPC surface remains a single outbound `webContents.send('menu-click', payload)`; no handlers added in this module.
- Scanned for leftover/unused locals introduced by prior levels (e.g., `resolveDevTarget`) and found them referenced.

Observable contract and timing were preserved.

Reviewer assessment: PASS
- The checks target the actual plausible leftover risks after L1/L4/L5 (leftovers + logging signature + comment drift) without proposing contract changes.

#### L7 — Smoke (human-run; minimal, dev)

**Estado:** PASS

**Preconditions**

* Ejecutar en dev desde terminal (para ver logs del main process): `npm start`.

* Ventana principal visible y operativa.

* Abrir DevTools en la ventana principal (Console) para observar efectos de acciones de menú si aplica.

* Para probar el **Dev menu**: correr unpackaged (`app.isPackaged === false`) y setear `SHOW_DEV_MENU=1`. 

* [x] **(1) Startup sanity: menú se construye y no hay hard-fails**

  * **Action:** Lanzar la app y esperar idle (5–10s).
  * **Expected result:** Menú visible; sin uncaught exceptions/unhandled rejections en terminal. No aparece `menu_builder.loadMainTranslations.requiredMissing` en camino sano.
  * **Evidence:** `loadMainTranslations()` carga bundle requerido y, si falta/está inválido, emite `log.errorOnce('menu_builder.loadMainTranslations.requiredMissing', ...)`. 

* [x] **(2) Dispatch sanity: acciones “Help” llegan al renderer sin warnings del main**

  * **Action:** Con la app ya lista, usar **Help** y gatillar 2–3 items distintos (por ejemplo: `FAQ`, `About`, alguna guía).
  * **Expected result:** Se ejecuta el comportamiento esperado en UI (modales/ventanas/acción equivalente), sin warnings tipo “menu-click dropped / failed (ignored)” desde main.
  * **Evidence:** `sendMenuClick(payload)` hace `webContents.send('menu-click', payload)` y solo warnOnce en anomalías (`noWindow`, `destroyed`, `failed`). 

* [x] **(3) Hook de Language: abre selector sin fallback warning**

  * **Action:** Menú **Window > Language**.
  * **Expected result:** Se abre la ventana/flujo de selector de idioma; no aparece warning `menu_builder.onOpenLanguage.missing` en el camino configurado.
  * **Evidence:** si el hook no existe, cae en `log.warnOnce('menu_builder.onOpenLanguage.missing', ...)` (degradación explícita). 

* [x] **(4) Acciones no-“Help”: crono y always-on-top no rompen dispatch**

  * **Action:** Menú **View > Toggle crono** y **Window > Always on top**.
  * **Expected result:** El renderer refleja el cambio (o el efecto esperado del toggle); sin warnings `sendMenuClick.*` en camino sano.
  * **Evidence:** ambos ítems usan `sendMenuClick('<actionId>')` (misma ruta `menu-click`). 

* [x] **(5) Dev menu (si aplica): target resolution funciona (focused-or-main)**

  * **Action:** Con `SHOW_DEV_MENU=1`, usar **Development > Reload**, **Force reload**, **Toggle DevTools**.
  * **Expected result:** Opera sobre la ventana objetivo (focused o main); sin crash. (Si no hay target válido, debe ser no-op silencioso.)
  * **Evidence:** el dev menu está condicionado por `if (!app.isPackaged && showDevMenu)` y resuelve target con foco/main antes de `reload()/reloadIgnoringCache()/toggleDevTools()`. 

* [x] **(6) (Opcional, timing) Pre-READY guard: dedupe de “ignored (pre-READY)”**

  * **Action:** Relanzar y hacer click muy temprano en 1 acción de menú repetidas veces antes de que la UI esté plenamente lista.
  * **Expected result:** A lo sumo 1 warning deduplicado “Menu action ignored (pre-READY)” para ese `actionId`; sin spam.
  * **Evidence:** `canDispatchMenuAction(actionId)` emite `log.warnOnce(\`menu_builder.inert:${actionId}`, 'Menu action ignored (pre-READY):', actionId)`. 

---

### electron/menu_builder.js

Date: `2026-01-21`
Last commit: `12ba2bc6346aedee364aea3080a6ade0e502ea55`

#### L0 — Diagnosis (no changes) (Codex, follow-up re-run; verified)

Note: Follow-up re-run because prior L0 asserted an IPC payload shape without anchoring to a call site. This L0 keeps payload shape “unknown at this boundary” when only an identifier is visible.

- Reading map (minimal)
  - Block order: header/comments; external imports; internal imports; logger + helpers; translation loading; getDialogTexts; buildAppMenu; exports.
  - Linear reading breaks:
    - `buildAppMenu` -> sendMenuClick closure; micro-quote: "const sendMenuClick = (payload) => {"
    - `buildAppMenu` -> menuTemplate literal; micro-quote: "const menuTemplate = ["
    - `buildAppMenu` -> dev menu branch; micro-quote: "if (!app.isPackaged && showDevMenu) {"
    - `loadBundle` -> file loop; micro-quote: "for (const file of files) {"

- Contract map (minimal)
  - Exposes: `getDialogTexts`, `buildAppMenu`, `resolveDialogText`; micro-quote: "module.exports = {"
  - Observable side effects (anchored):
    - Sets application menu; micro-quote: "Menu.setApplicationMenu(appMenu)"
    - Reads translation files; micro-quote: "fs.readFileSync(file, 'utf8')"
    - Sends renderer message; micro-quote: "webContents.send('menu-click', payload)"
    - Toggles DevTools in dev menu; micro-quote: "mainWindow.webContents.toggleDevTools()"
  - Suggested invariants/fallbacks (anchored):
    - Language tag falls back to default; micro-quote: "normalizeLangTag(lang) || DEFAULT_LANG"
    - Menu label falls back to provided fallback; micro-quote: "return fallback"
    - Dialog text falls back to provided fallback; micro-quote: "return fallback"
    - Empty JSON triggers fallback; micro-quote: "if (raw.trim() === '')"
    - Dialog section falls back to empty object; micro-quote: "return tMain.dialog || {}"
    - Menu click drops without window; micro-quote: "if (!mainWindow) {"

- IPC contract
  - A) Exhaustive IPC enumeration:
    - `webContents.send('menu-click', payload)`
      - Channel argument: `"menu-click"` (string literal)
      - Handler/listener boundary args: n/a (send call)
      - Return shape: n/a (send call)
      - Payload argument: identifier `payload` (shape unknown at this boundary); micro-quote: "webContents.send('menu-click', payload)"
      - Call-site micro-quote: "mainWindow.webContents.send('menu-click', payload)"
    - No `ipcMain.*` or `ipcRenderer.*` occurrences found in this file.
  - B) Delegated registration: none found.

Reviewer assessment (L0 protocol compliance):
- PASS (follow-up): no inferred payload/type shapes; contract statements are anchored with micro-quotes.
- Note: the “no ipcMain/ipcRenderer occurrences” claim is a negative scan result (not independently evidenced inside this document).

#### L1 — Structural refactor (Codex)

Decision: NO CHANGE

- File already follows a clear top-to-bottom structure (imports → helpers → translation loading → public helpers → menu build → exports).
- Existing sections are well-labeled with comments, so reordering would add churn without clarity gain.
- Helper functions are short and cohesive; splitting or renaming would not reduce cognitive load.
- Core logic in buildAppMenu is linear and menuTemplate readability would not improve via extraction.
- No obvious duplication that can be removed without adding indirection.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

Reviewer assessment (sufficiency & inference quality):
- PASS. The “NO CHANGE” decision is consistent with the file’s existing explicit sectioning and responsibilities (menu + i18n + dialog texts).
- No unanchored IPC/contract/payload-shape assertions were introduced at Level 1.

#### L2 — Clarity / robustness refactor (Codex)

Decision: NO CHANGE

- Current helpers already encapsulate edge cases (missing translations, invalid/empty JSON, missing window) with deduped logging.
- No repeated branching or error handling suitable for a new helper without adding indirection.
- Menu template structure is inherently large; extracting it would increase jumping around without reducing complexity.
- Translation loading flow is linear and explicit; making it more defensive risks altering fallback timing/logging.
- No IPC registration or timing-sensitive sequencing is present to safely optimize without risk.

Observable contract and timing preserved by making no changes.

Reviewer assessment (sufficiency & inference quality):
- PASS (NO CHANGE). Given zero code changes, the decision hinges on whether L2 changes would be low-risk and net-positive; the file already has warnOnce/errorOnce patterns and explicit fallback logic, so “do not touch” is defensible.
- Minor wording issue in Codex report: while there is no IPC *registration* (`ipcMain.*` / `ipcRenderer.*`) in this module, it does perform IPC *sending* via `mainWindow.webContents.send('menu-click', payload)`. This does not affect the NO CHANGE conclusion.

#### L3 — Architecture / contract changes (Codex) (follow-up re-run: evidence completeness)

Decision: NO CHANGE (no Level 3 justified)

Evidence (end-to-end IPC contract):
- Sender outbound IPC in `electron/menu_builder.js` `sendMenuClick`; micro-quote: "webContents.send('menu-click', payload)".
- Sender payload is a string literal at call sites in `electron/menu_builder.js` `menuTemplate`; micro-quote: "click: () => sendMenuClick('guia_basica')".
- Receiver listens in `electron/preload.js` `onMenuClick`; micro-quote: "ipcRenderer.on('menu-click', wrapper)".
- Preload forwards payload unchanged in `electron/preload.js` `onMenuClick`; micro-quote: "cb(payload)".

Contract consistency (as argued by Codex):
- Sender uses string action ids; receiver forwards unchanged; renderer consumes as action key and enforces string keys (per Codex inspection of `public/js/menu_actions.js`).

Scan evidence (repo-wide):
- Query/pattern: `rg -n "menu-click" -S .`
- Matches: 21
- Key matches (as reported by Codex):
  - `electron/menu_builder.js` (channel + send call + logs)
  - `electron/preload.js` (ipcRenderer.on/removeListener)
  - `public/js/menu_actions.js` (menu-click received log line)
  - Docs/evidence references (non-contractual mentions)

Risk: N/A (no code changes).
Validation: N/A (no code changes).

Reviewer assessment (sufficiency & inference quality):
- PASS (NO CHANGE). This follow-up addresses the prior gap by providing sender + receiver anchors and a repo-wide scan for the IPC channel literal.
- Minor evidence gap: the renderer-side micro-quotes (payload type enforcement / Map key usage) are not backed by the included `menu-click` scan excerpt (they may not contain the literal). This does not affect the Level 3 “NO CHANGE” decision.

#### L4 — Logs (policy-driven tuning) (Codex)

Decision: CHANGED

Diff evidence (what changed):
- i18n load/parse warnOnce keys stopped embedding per-occurrence file paths:
  - BEFORE (explicit key included `${String(file)}`):
    - `menu_builder.loadMainTranslations:empty:...:${String(file)}`
    - `menu_builder.loadMainTranslations:failed:...:${String(file)}`
  - AFTER (stable keys bucketed by lang + controlled variant):
    - `menu_builder.loadMainTranslations.empty:${langCode}:${fileVariant}`
    - `menu_builder.loadMainTranslations.failed:${langCode}:${fileVariant}`
  - Minimal structural support added to derive `fileVariant` (`region|root`) via indexed loop.

- menu-click best-effort drops now use stable per-reason keys and “failed (ignored)” phrasing:
  - BEFORE (keys included `${String(payload)}` and message “dropped ...”):
    - `menu_builder.sendMenuClick:noWindow:${String(payload)}`
    - `menu_builder.sendMenuClick:destroyed:${String(payload)}`
    - `menu_builder.sendMenuClick:sendFailed:${String(payload)}`
  - AFTER (stable keys by reason; payload remains in args):
    - `menu_builder.sendMenuClick.noWindow` + `menu-click failed (ignored): no mainWindow`
    - `menu_builder.sendMenuClick.destroyed` + `menu-click failed (ignored): mainWindow destroyed`
    - `menu_builder.sendMenuClick.sendFailed` (catch) + `"webContents.send('menu-click') failed (ignored):"`

Policy alignment (why this is justified):
- Logging policy forbids per-occurrence/unbounded data in explicit dedupe keys (“Forbidden: per-occurrence / unbounded data in the key”).
- warnOnce is explicitly appropriate for repeated send-to-window race conditions (“webContents.send() to a destroyed window” is canonical).

Validation plan adequacy:
- Sufficient for Level 4: grep for new stable keys; provoke empty/invalid/missing main.json to observe warnOnce; trigger menu clicks with no/destroyed window to observe the new “failed (ignored)” warnings.
- Report limitation: does not mechanically enumerate *all* logging sites in the file to prove full compliance; however, the changes directly address concrete policy issues shown in the diff.

Status: PASS (L4)

#### L5 — Comments (reader-oriented, `electron/main.js` style) (Codex)

Decision: CHANGED (comments-only)

Observed changes (diff-based):
- Added a `Helpers (logging + utilities)` section divider near the top of the file (after internal imports) to better match the real block order.
- Fixed comment drift in the translation fallback chain: replaced the hardcoded final fallback `'es'` with `DEFAULT_LANG`.
- Removed a redundant comment above the menu install call (reduced noise).

Reviewer assessment (sufficiency & inference quality):
- PASS. The diff demonstrates comments-only edits (no logic/contract/timing changes).
- The changes are justified: they improve navigability (section divider), reduce drift (DEFAULT_LANG vs hardcoded tag), and remove low-signal commentary.
- Minor incompleteness in Codex’s report: it does not explicitly evidence that the top Overview comment and the end-of-file marker requirement were verified (they may already exist, but this is not demonstrated in the report).

Evidence:
- Diff: `electron/menu_builder.js` (comment-only hunks: Helpers divider insertion; fallback chain comment edit; removal of “Apply the menu...” comment).

#### L6 — Final review (coherence + leftover cleanup after refactors) (Codex)

- Decision (Codex): NO CHANGE
- Codex report summary:
  - Claims logging API usage matches `log.js`; highlights `sendMenuClick` uses `log.warnOnce(...)` with explicit keys.
  - States translation fallback comment matches code.
  - Confirms single outbound IPC send path: `webContents.send('menu-click', payload)`.
  - Confirms export surface unchanged: `module.exports = { getDialogTexts, buildAppMenu, resolveDialogText }`.
  - Notes dev menu guard: `process.env.SHOW_DEV_MENU === '1'`.

Reviewer assessment (sufficiency & inference quality):
- PASS (NO CHANGE), but note: Codex evidence is not mechanically complete for a "hard-close" on its own.
  - What Codex checked is relevant and accurate (anchors exist in-file), but it did not provide an exhaustive scan
    (e.g., list of all logging callsites / signature checks, or an explicit leftover scan after L4/L5).
  - Manual spot-check of the current file supports NO CHANGE:
    - Outbound send: `mainWindow.webContents.send('menu-click', payload)` is still the single IPC emit.
    - `sendMenuClick` warnOnce keys are stable and explicit: `menu_builder.sendMenuClick.noWindow|destroyed|sendFailed`.
    - Translation load warnOnce keys are stable and do not embed dynamic file paths:
      `menu_builder.loadMainTranslations.empty:${langCode}:${fileVariant}` and
      `menu_builder.loadMainTranslations.failed:${langCode}:${fileVariant}`.
    - Export surface remains `getDialogTexts`, `buildAppMenu`, `resolveDialogText`.
    - Dev menu guard is still `process.env.SHOW_DEV_MENU === '1'`.

#### L7 — Smoke test (humano) — `electron/menu_builder.js` (cambio-focalizado: L4 logging/dedupe + i18n load)

Result: Pass

- [x] (1) Arranque + idle 20–30s con logs visibles: sin ERROR/uncaught; sin spam repetitivo.
- [x] (2) Menu actions x3 (rutas sanas): cada accion hace lo esperado (abre modal/ventana/seccion); NO aparece `menu-click failed (ignored): ...`.
- [x] (3) Menu -> About: abre correctamente; NO aparece `menu-click failed (ignored): ...`.
- [x] (4) Menu -> Actualizar version (si existe): aparece resultado/dialogo; sin crash.
- [x] (5) Cambio de idioma por flujo normal: UI/menu siguen correctos; NO aparecen warnings i18n tipo “Failed to load/parse main.json…” / “main.json is empty…”.
- [x] (6) Repetir 1 accion post-idioma: funciona (sin regresion).
- [x] (7) Cerrar y relanzar: menu sigue operativo; idioma persiste si aplica; repetir About o 1 accion OK.

---

### electron/updater.js

Date: `2026-01-22`
Last commit: `f29062b2ac374c073a462fb67710ff64114e8c91`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order:
    - Header comment + `'use strict'`.
    - Imports: electron (`dialog`, `shell`, `app`), `https`, `./log`, `./menu_builder`, `./constants_main`.
    - URLs: `RELEASES_API_URL`, `DOWNLOAD_URL`.
    - Lazy refs + one-shot flag: `mainWinRef`, `currentLanguageRef`, `updateCheckDone`.
    - Dialog helper wrapper: `resolveDialogText` → `menuBuilder.resolveDialogText(...)`.
    - SemVer parsing/comparison: `SEMVER_RE`, `parseSemVer`, `comparePrerelease`, `compareSemVer`.
    - Remote query: `fetchLatestReleaseTag` (https GET + JSON parse; resolves `null` on failures).
    - Main flow: `checkForUpdates` (local version parse → remote tag fetch/parse → compare → dialogs → `shell.openExternal`).
    - One-time auto check: `scheduleInitialCheck`.
    - IPC wiring: `registerIpc`.
    - `module.exports`.

  - Where linear reading breaks (identifiers + micro-quotes):
    - `checkForUpdates`: repetición de bloques de error manual (mismo texto/keys).
      - Anchor: `"update_failed_message"` / `"await dialog.showMessageBox(mainWin"`.
    - `fetchLatestReleaseTag`: callbacks/eventos + múltiples salidas defensivas.
      - Anchor: `"res.on('end', () => {"` / `"return resolve(null);"`.
    - `registerIpc`: mutación de referencias externas (state capturado por cierre).
      - Anchor: `"mainWinRef = mainRef;"`.
    - `scheduleInitialCheck`: latch one-shot de ciclo de vida.
      - Anchor: `"if (updateCheckDone) return;"` / `"updateCheckDone = true;"`.

- Contract map (exports / side effects / invariants / IPC):
  - Exposes:
    - `registerIpc(ipcMain, { mainWinRef, currentLanguageRef } = {})`
    - `scheduleInitialCheck()`
  - Side effects:
    - None on import; red/diálogos ocurren solo al ejecutar `checkForUpdates` (directo o vía `scheduleInitialCheck` / IPC).

  - Invariants and fallbacks (anchored):
    - SemVer local requerido; early-return si falla.
      - Anchor: `"const localParsed = parseSemVer(localVer);"` + `"if (!localParsed) {"`.
    - Tag remoto puede ser `null`; se tolera (silent salvo diálogo si `manual`).
      - Anchor: `"const remoteTag = await fetchLatestReleaseTag(...)"` + `"if (!remoteTag) {"`.
    - Tag remoto exige prefijo `v`; early-return si falta.
      - Anchor: `"if (!remoteTag.startsWith('v')) {"`.
    - SemVer remoto requerido; early-return si falla.
      - Anchor: `"const remoteParsed = parseSemVer(remoteVer);"` + `"if (!remoteParsed) {"`.
    - Diálogos de error “manual” solo si hay ventana viva.
      - Anchor: `"if (manual && mainWin && !mainWin.isDestroyed()) {"`.
    - Si no hay main window viva, no muestra “Update available”.
      - Anchor: `"if (!mainWin || mainWin.isDestroyed()) { ... return; }"`.
    - Auto-check solo una vez por ciclo de vida.
      - Anchor: `"if (updateCheckDone) return;"`.

#### IPC contract (only what exists in this file)

A) Explicit IPC in this file:
- `ipcMain.handle('check-for-updates', async () => ...)`
  - Input shape: sin args (handler no recibe/usa parámetros).
  - Return shape: `{ ok: true }` o `{ ok: false, error: string }`.
  - Outgoing sends: none (no `webContents.send` en este módulo).

B) Delegated registration:
- None

#### L1 decision: CHANGED

- Change: Deduplicación local dentro de `checkForUpdates` del diálogo de falla “manual” (mismo texto/keys).
  - Added predicate `shouldShowManualDialog()` para centralizar el gating:
    - Anchor: `"manual && mainWin && !mainWin.isDestroyed()"` (equivalente; ahora encapsulado).
  - Added helper `showUpdateFailureDialog()` que construye `title/message/buttons` y llama `dialog.showMessageBox(...)`:
    - Anchors: `"update_failed_title"`, `"update_failed_message"`, `"await dialog.showMessageBox(mainWin"`.
  - Reemplazados 4 bloques repetidos por `if (shouldShowManualDialog()) await showUpdateFailureDialog();` en:
    - `!localParsed`
    - `!remoteTag`
    - `!remoteTag.startsWith('v')`
    - `!remoteParsed`
- No se tocó IPC (`ipcMain.handle('check-for-updates', ...)`), ni keys de i18n, ni logs, ni el flujo general de actualización.

Observable contract/timing preserved: mismos exports, canal IPC y shapes; mismos early-returns y side effects.

**Risk**
- Low. Refactor local (in-function) que reemplaza duplicación literal por helpers; sin cambios en inputs/outputs ni en IPC.

**Validation**
- Review diffs: confirmar que el contenido del diálogo (keys + fallbacks + botones) es idéntico a los 4 bloques previos.
- Smoke focalizado: ejecutar el flujo “Buscar actualizaciones” (manual) y verificar que:
  - en falla (sin red / respuesta inválida / tag no `v`), aparece el mismo diálogo de error;
  - no hay excepciones ni logs inesperados.

#### L2 decision: NO CHANGE

- Rationale (Codex):
  - L1 ya removió la duplicación principal (diálogo de falla manual) sin introducir indirection excesiva.
  - El resto del flujo son early-returns por outcomes de SemVer/red/tag; consolidarlos arriesga ocultar puntos de decisión.
  - Manejo de errores y logging ya es explícito y proporcional; “mejorarlo” tendería a ser ruido o cambio observable.
  - IPC es minimalista; tocarlo puede afectar readiness/races.

Reviewer assessment (sufficiency & interpretation quality):
- PASS (NO CHANGE), coherente con el estado del archivo y con el riesgo/beneficio esperado de L2.
- Confirmado: diff vacío (sin cambios aplicados).
- Nota menor: el reporte resume “warn por ruta de falla” de forma algo no literal, pero sin impacto práctico.

#### L3 decision: CHANGED (IPC contract drift fix)

Evidence (problem):
- Preload expone payload `{ manual }`:
  - Anchor: `ipcRenderer.invoke('check-for-updates', { manual })` (electron/preload.js).
- Handler ignoraba args y forzaba manual:
  - Anchor: `ipcMain.handle('check-for-updates', async () =>` + `manual: true` (electron/updater.js).
- Menú invocaba sin args:
  - Anchor: `window.electronAPI.checkForUpdates()` (public/renderer.js).

Change:
- `electron/updater.js`: el handler IPC ahora acepta `(_event, payload)` y deriva `manual` desde `payload.manual` (boolean), pasándolo a `checkForUpdates(...)`.
  - Anchor: `ipcMain.handle('check-for-updates', async (_event, payload = {}) => {`
  - Anchor: `manual,` (propiedad en el objeto pasado a `checkForUpdates`).
- `public/renderer.js`: la acción de menú `actualizar_version` ahora pasa `true` explícito para preservar el comportamiento “manual”.
  - Anchor: `window.electronAPI.checkForUpdates(true);`

Contract/timing:
- Canal IPC y retorno se mantienen: `{ ok: true }` / `{ ok: false, error: String(err) }`.
- Startup y auto-check no se tocan (ruta `checkForUpdates({ manual: false })` interna sigue intacta).

Risk:
- Bajo. Potencial cambio solo para callers no-evidenciados que invocaran IPC sin payload esperando “manual siempre”.

Validation:
- Menú “Actualizar versión”: debe seguir mostrando diálogos (incluyendo en error de red).
- DevTools: `window.electronAPI.checkForUpdates(false)` en escenario up-to-date/sin red: no debe mostrar diálogo “manual failure/up-to-date”.
- DevTools: `window.electronAPI.checkForUpdates(true)` mantiene diálogos.
- `rg -n -F "electronAPI.checkForUpdates(true)" public/renderer.js`.

#### L4 decision: NO CHANGE

- Logging mechanism: main-process logger `Log.get('updater')` (consistente con política).
- Fallbacks/errores recoverables ya registran `warn` (fetch/status, parse JSON, red, SemVer inválido, tag sin prefijo `v`).
- No se justifica `warnOnce/errorOnce`: no hay eventos evidentes de alta frecuencia donde dedupe mejore señal/ruido.
- No se justifica subir a `error`: fallos de update-check son recoverables y no rompen invariantes del runtime.

Observable contract/timing preserved (no code changes).

#### L5 decision: CHANGED (comments-only)

- Reemplazo de header obsoleto por "Overview" con responsabilidades (3–7 items).
- Se agregan divisores de sección que calzan con el orden real del archivo: imports/logger, constants/config, shared state, helpers, update flow, lifecycle, IPC, exports.
- Se agrega marcador explícito de fin de archivo ("End of electron/updater.js").
- No functional changes; comments-only.

#### L6 — Final review (Codex)

Decision: **NO CHANGE**

No Level 6 changes justified.
- Checked helper usage in `checkForUpdates` (e.g., `shouldShowManualDialog`) for leftover duplication; no safe simplification without adding indirection.
- Checked IPC handler payload parsing (`ipcMain.handle('check-for-updates', async (_event, payload = {}) =>`) and return shapes; consistent.
- Checked manual vs auto flow (`checkForUpdates({ manual: false })`) and dialog gating (`manual && mainWin && !mainWin.isDestroyed()`); consistent.
- Checked logging calls (`log.warn('Latest release fetch failed with status:'`) against `electron/log.js` API; signatures match.
- Checked comments vs code (`// Update flow (manual vs auto)` and `// App lifecycle / bootstrapping`); no drift.

Observable contract and timing were preserved (no code changes).

#### L7 — Smoke (human-run; minimal)

Result: Pass

Checklist:
- [x] Log sanity ~30s idle (sin ERROR/uncaught; sin repeticion continua del mismo warning en idle).
- [x] Menu → About: abrir y cerrar.
      Esperado: modal abre estable; sin errores.
- [x] Menu → “Actualizar versión” (con red normal).
      Esperado: aparece un dialogo (up-to-date / update available / failure).
- [x] Validar "manual vs auto" (flag `manual` + silencio esperado en auto-failure):
      1) Cerrar completamente la app.
      2) Desconectar red (modo avion / cable / Wi-Fi off).
      3) Relanzar la app y esperar ~10s.
         Esperado: NO aparece dialogo automaticamente (auto-check es no-manual y ante falla no debe molestar al usuario).
         (Se aceptan warnings en log por fetch fallido, sin spam continuo.)
      4) Con la app abierta y aun sin red: Menu → “Actualizar versión”.
         Esperado: aparece dialogo de fallo (manual path nunca es silencioso).
      5) Re-conectar red (restaurar conectividad).
- [x] (Opcional, si durante el check aparece “Update available”):
      Elegir la accion de descarga.
      Esperado: se abre el browser (shell.openExternal) y la app sigue estable.

---

### electron/link_openers.js

Date: `2026-01-22`
Last commit: `f1e3a74aa5abc2d2cf221d8b2267b8056c8bf7b1`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order:
    - Strict mode + header comment.
    - Imports (`fs`, `path`, `os`).
    - Constants/config (`ALLOWED_EXTERNAL_HOSTS`, `APP_DOC_FILES`, `APP_DOC_BASKERVVILLE`).
    - Helpers (`fileExists`, `getTempDir`, `copyToTemp`).
    - Main logic: `registerLinkIpc(...)` with 2 IPC handlers.
    - Exports (`module.exports = { registerLinkIpc }`).
  - Where linear reading breaks:
    - `registerLinkIpc` nests two long async handlers: `"ipcMain.handle('open-external-url', async (_e, url) => {"`.
    - `ipcMain.handle('open-app-doc', ...)` has multi-branch policy (dev vs packaged): `"if (!app.isPackaged && (rawKey === 'license-electron'"`.
    - `APP_DOC_BASKERVVILLE` special-case path/copy: `"if (rawKey === APP_DOC_BASKERVVILLE) {"`.
    - `devCandidates` probing loop: `"for (const candidate of devCandidates) {"`.
    - `candidates` probing loop (packaged/resources): `"for (const candidate of candidates) {"`.

- Contract map (exports / side effects / IPC):
  - Module exposure:
    - Export: `registerLinkIpc`.
    - Anchor: `"module.exports = { registerLinkIpc }"`.
  - Side effects (only when called):
    - `registerLinkIpc(...)` registers handlers via `ipcMain.handle(...)`.
    - Anchor: `"ipcMain.handle('open-external-url'"` and `"ipcMain.handle('open-app-doc'"`.
  - Invariants and fallbacks (anchored):
    - External URL must be non-empty string after trim:
      - Anchor: `"const raw = typeof url === 'string' ? url.trim() : ''"` and `"if (!raw) {"`.
    - External URL must parse as URL, and be `https` + allowed host:
      - Anchor: `"parsed = new URL(raw)"` and `"parsed.protocol !== 'https:' || !ALLOWED_EXTERNAL_HOSTS.has"`.
    - docKey must be non-empty string after trim:
      - Anchor: `"const rawKey = typeof docKey === 'string' ? docKey.trim() : ''"` and `"if (!rawKey) {"`.
    - Some docs are blocked in dev when `!app.isPackaged`:
      - Anchor: `"if (!app.isPackaged && (rawKey === 'license-electron' || rawKey === 'licenses-chromium')) {"`.
    - Doc key must exist in `APP_DOC_FILES` (except special-case Baskervville):
      - Anchor: `"Object.prototype.hasOwnProperty.call(APP_DOC_FILES, rawKey)"`.
    - File existence is checked before opening; temp fallback exists for temp dir:
      - Anchor: `"if (!(await fileExists("` and `"return os.tmpdir();"`.
    - Copy-to-temp helper used before opening some files:
      - Anchor: `"const tempPath = await copyToTemp(app, srcPath"` and `"await fs.promises.writeFile(tempPath, data)"`.

  - IPC contract (only what exists in this file):
    - `ipcMain.handle('open-external-url', async (_e, url) => ...)`
      - Input boundary: `(_e, url)` (string expected; trimmed defensively).
      - Return: `{ ok: true }` or `{ ok: false, reason: 'blocked' | 'error' }`.
      - Outgoing sends: none.
    - `ipcMain.handle('open-app-doc', async (_e, docKey) => ...)`
      - Input boundary: `(_e, docKey)` (string expected; trimmed defensively).
      - Return: `{ ok: true }` or `{ ok: false, reason: 'blocked' | 'not_available_in_dev' | 'not_found' | 'open_failed' | 'error' }`.
      - Outgoing sends: none.
    - `ipcMain.on`: none
    - `ipcMain.once`: none
    - `ipcRenderer.*`: none
    - `webContents.send`: none
    - Delegated IPC registration: none

#### L1 — Structural refactor (Codex)

Decision: NO CHANGE
- File already follows a clean imports -> constants -> helpers -> handlers -> exports order; reordering would be redundant.
- Handler logic is already grouped by IPC entrypoint (`open-external-url`, `open-app-doc`) and reads linearly within each block.
- Duplication (openPath + error handling) is localized and extracting helpers would add indirection without reducing branches.
- Branching in `open-app-doc` reflects distinct packaging/dev and doc-key cases; flattening would risk readability.
- Naming is concise and unambiguous; renames would not reduce cognitive load.

**Risk**
- N/A (no code changes).

**Validation**
- N/A (no code changes; baseline unchanged).

Reviewer assessment (sufficiency & inference quality):
- PASS. The “NO CHANGE” decision is consistent with the current linear structure and the anti-indirection rule; no contract/IPC/timing claims were introduced at L1 beyond what is directly visible in-file.

#### L2 decision: CHANGED

- Change: Introduced `openPathWithLog(shell, log, rawKey, filePath)` and reused it to replace the repeated `shell.openPath` + `open_failed` handling blocks in `open-app-doc` (dev candidate open, Baskervville temp open, packaged candidate open, fallback temp open).
  - Gain: Removes duplication and centralizes a security-relevant decision point (open failure → log + `{ ok:false, reason:'open_failed' }`) while keeping log text and return shape consistent.
  - Cost: Adds one local helper (small indirection).
  - Validation:
    - Static: confirm the `'open-app-doc open failed:'` log text appears only in the helper and that all success/failure returns are unchanged.
    - Manual smoke (targeted): trigger `open-app-doc` for (a) a known docKey that exists, (b) a known docKey missing → expect `not_found`, and (c) an “open failed” scenario (if reproducible) → expect `open_failed` and the same warn log once per attempt.

**Evidence**
- The same `openResult = await shell.openPath(...)` + `if (openResult) { log.warn(...); return { ok:false, reason:'open_failed' }; } return { ok:true };` sequence was duplicated across 4 branches in `open-app-doc` prior to this change.

**Risk**
- Low. Helper mirrors prior code paths; IPC surface and handler registration order unchanged.
- Residual edge-case: the call sites now `return openPathWithLog(...)` (promise) rather than `await` inline; if `shell.openPath` were to reject unexpectedly, it could bypass the handler’s `catch` and change the observable failure shape. (Electron documents `openPath` as resolving with an error string on failure.) 

**Validation**
- Covered by L7 smoke (human-run) plus the targeted doc-open checks above.

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- IPC surface is limited to two handlers in this module:
  - "ipcMain.handle('open-external-url'"
  - "ipcMain.handle('open-app-doc'"
- Consumer wrapper exists in `electron/preload.js` and invokes exactly these channels:
  - "openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url)"
  - "openAppDoc: (docKey) => ipcRenderer.invoke('open-app-doc', docKey)"
- In-file contract remains explicit and closed:
  - URL gating: "parsed.protocol !== 'https:'" and "ALLOWED_EXTERNAL_HOSTS.has"
  - Uniform error return: "return { ok: false, reason: 'error' }"

**Risk**
- N/A (no code changes).

**Validation**
- N/A (no code changes).

#### L4 — Logs (Codex)

Decision: CHANGED

- Change: Made the temp-dir fallback non-silent by logging a deduplicated warning when `app.getPath('temp')` fails in `getTempDir` (used by `copyToTemp`).
  - Gain: Satisfies “no silent fallbacks” while keeping noise low (warnOnce).
  - Cost: Threads `log` through the temp-path helpers and updates two internal call sites.
  - Validation:
    - Static: search for the stable key `link_openers.tempPath.fallback`.
    - Manual: force `app.getPath('temp')` to throw and invoke `open-app-doc`; expect a single `warnOnce` emission and unchanged IPC return shapes.

**Evidence (anchors)**
- Prior silent fallback: `catch { return os.tmpdir(); }` in `getTempDir(app)`.
- New non-silent fallback: `catch (err) { log.warnOnce('link_openers.tempPath.fallback', 'open-app-doc temp path fallback: ... using os.tmpdir().', err); return os.tmpdir(); }`.

Reviewer assessment (sufficiency & inference quality):
- PASS. The change removes a silent fallback without affecting IPC/return shapes/timing and keeps logger semantics consistent (no optional-logger branching; no forced severity changes).

#### L5 — Comments (Codex)

Decision: CHANGED

- Change: Added a reader-oriented comment structure aligned with `electron/main.js`:
  - Overview header + responsibilities.
  - Section dividers (Imports, Constants / config, Helpers, IPC registration / handlers, Exports).
  - End-of-file marker.
- Follow-up: Fixed Overview return-shape wording to avoid drift:
  - Now states: `{ ok: true }` success and `{ ok: false, reason }` failure.
- No functional changes; comments-only.

**Evidence (anchors)**
- Overview bullet (corrected): "Register IPC handlers that return { ok: true } or { ok: false, reason }."

#### L6 — Final review (Codex)

* **Decision: NO CHANGE**
* “No Level 6 changes justified.”
* Bullets (recomendado que queden anclados al código actual):

  * `getTempDir(app, log)` solo se usa vía `copyToTemp(...)`; no hay drift de firma interna. 
  * `warnOnce('link_openers.tempPath.fallback', ...)` usa key estable y respeta la firma `warnOnce(key, ...args)` de `electron/log.js`. 
  * IPC handlers presentes: `'open-external-url'` y `'open-app-doc'`; retornan `{ ok: true }` o `{ ok: false, reason }`. 
  * Apertura de paths centralizada en `openPathWithLog`. 
  * Nota explícita: “Se mantiene y acepta el *residual edge-case* ya documentado (return de Promise sin await en `openPathWithLog`); no se modifica en L6.” 

#### L7 — Smoke (human-run; minimal, dev)

Preconditions:
- Run the app in dev from a terminal (so you can see main-process logs): `npm start`.
- Keep that terminal visible.
- Open DevTools in the main window (Console tab).

Checklist:
- [x] Startup sanity (main): after the window is visible, no uncaught exceptions / unhandled rejections in the terminal.

- [x] IPC open-external-url (allowed):
  - Action (DevTools Console):
    - `window.electronAPI.openExternalUrl('https://github.com').then(r => console.log('openExternalUrl allowed =>', r));`
  - Expected:
    - Console prints `{ ok: true }`.
    - Default browser opens `https://github.com` (or focuses an existing tab).
    - No `Error processing open-external-url:` in terminal logs.

- [x] IPC open-external-url (blocked by policy: scheme):
  - Action:
    - `window.electronAPI.openExternalUrl('http://github.com').then(r => console.log('openExternalUrl blocked(scheme) =>', r));`
  - Expected:
    - Console prints `{ ok: false, reason: 'blocked' }`.
    - Browser does NOT open.
    - Terminal shows a warn with prefix: `open-external-url blocked: disallowed URL:`.

- [x] IPC open-app-doc (packaged-only key in dev):
  - Action:
    - `window.electronAPI.openAppDoc('license-electron').then(r => console.log('openAppDoc dev-only block =>', r));`
  - Expected:
    - Console prints `{ ok: false, reason: 'not_available_in_dev' }`.
    - Terminal shows a warn with prefix: `open-app-doc not available in dev; requires packaged build:`.

- [x] IPC open-app-doc (unknown key):
  - Action:
    - `window.electronAPI.openAppDoc('does-not-exist').then(r => console.log('openAppDoc unknown =>', r));`
  - Expected:
    - Console prints `{ ok: false, reason: 'blocked' }`.
    - Terminal shows a warn with prefix: `open-app-doc blocked: unknown doc key:`.

- [x] IPC open-app-doc (Baskervville):
  - Action:
    - `window.electronAPI.openAppDoc('license-baskervville').then(r => console.log('openAppDoc baskervville =>', r));`
  - Expected (normal):
    - Console prints `{ ok: true }`.
    - OS opens a temp copy of `LICENSE_Baskervville_OFL.txt` (viewer/editor).
  - Acceptable fallback (if the font license file is missing in your dev tree):
    - `{ ok: false, reason: 'not_found' }` and a terminal warn with prefix: `open-app-doc not found:`.

Result: PASS / FAIL
Notes (optional):
- If you ever see the deduped warning key `link_openers.tempPath.fallback`, it should appear once per session (warnOnce) and not spam.

---

### electron/constants_main.js

Date: `2026-01-22`
Last commit: `92046dea3482a910ece96c7d10b0ddb5ce61a7f4`

#### L0 — Minimal diagnosis (Codex)

- Block order: strict mode; constants/config; module.exports.
- Linear reading breaks: none observed; single responsibility constants.
- Exposes (CommonJS): `DEFAULT_LANG`, `MAX_TEXT_CHARS`, `MAX_IPC_MULTIPLIER`, `MAX_IPC_CHARS`, `MAX_PRESET_STR_CHARS`, `MAX_META_STR_CHARS`.
- Invariants: `MAX_IPC_CHARS` derived from `MAX_TEXT_CHARS` (safety cap for IPC payload size).
- IPC: none declared in this file.

Result: PASS

#### L1–L7

Decision: NO CHANGE (file is constants-only; no behavior/IPC/timing surface to refactor or smoke-test at module level).

Result: PASS

---

### public/renderer.js (re-audit post-startup change)

Date: `2026-02-08`
Last commit: `858c6626806343e4198d4bff1c250568184ce261`

#### L0 — Minimal diagnosis (Codex, verified)

**0.1 Reading map**
- Block order (high-level): header/overview comment; logger + `AppConstants` check/destructure; DOM references; UI key lists; startup gating helpers; shared state; i18n wiring + `applyTranslations`; WPM/preset state + presets integration; CountUtils + text helpers; FormatUtils; preview/results logic; crono state subscription; preset loading helpers; bootstrapping + IPC subscriptions + mode toggle setup + startup orchestrator; info modal utilities; top-bar menu action registration; UI event handlers; stopwatch DOM + controller init; final startup calls.
- Linear breaks (identifier + micro-quote):
  - `applyTranslations` — "Text selector buttons".
  - `armIpcSubscriptions` — "Subscribe to updates from main".
  - `runStartupOrchestrator` — "BOOTSTRAP: getSettings failed; using defaults".
  - `showInfoModal` — "Fetch HTML (manual pages use a language fallback list)".
  - `registerMenuActionGuarded` — "menu_actions.js must be loaded before renderer.js".

**0.2 Contract map**
- Exposure: no exports. Side effects include DOM reads/writes, event listener registration, and calls into `window.electronAPI`, `window.menuActions`, and other window-provided modules.
- Invariants (anchored):
  - `AppConstants` required — "AppConstants no disponible".
  - `RendererI18n` required — "RendererI18n no disponible".
  - `CountUtils.contarTexto` required — "CountUtils no disponible".
  - User actions gated by readiness — "Renderer action ignored (pre-READY)" in `guardUserAction`.
  - READY gate depends on two flags — "if (!rendererInvariantsReady || !startupReadyReceived) return" in `maybeUnblockReady`.
- IPC contract A (direct ipcMain/ipcRenderer/webContents occurrences in this file): none found.
- IPC contract B (delegated registration helpers): none detected.

Reviewer assessment:
- PASS (L0). Diagnosis-only; no invented direct IPC; invariants anchored; identifiers + micro-quotes locate obstacles.

#### L1 — Structural refactor and cleanup (Codex)

Decision: CHANGED
- Moved `getCronoLabels` into the i18n wiring block before `applyTranslations` to eliminate a forward reference.
- Relocated `showeditorLoader`/`hideeditorLoader` directly above the editor click handler to keep helpers adjacent to first use.
- The stopwatch section now focuses on DOM refs and controller init, with label helper extracted earlier for linear reading.

Contract/behavior/timing preserved.

Reviewer assessment:
- PASS (L1). Changes are structural-only (helper relocation). No IPC surface, payload shapes, or side-effect ordering changes.
- `getCronoLabels` is a `const` arrow used by `applyTranslations` (“const labelsCrono = getCronoLabels();”); moving it earlier reduces latent ordering hazards without changing runtime behavior.

#### L2 — Clarity / robustness refactor (Codex)

Decision: CHANGED

- Presets: se introduce `resolveSettingsSnapshot(settingsSnapshot)` para centralizar la resolución `settingsSnapshot` vs `settingsCache || {}` usada por `reloadPresetsList` y `loadPresets`, evitando duplicación.
- Presets: se introduce `resetPresetsState()` para consolidar el reset de UI/estado en los `catch` (vaciar select/description; `allPresetsCache = []`; `currentPresetName = null`) y mantener el mismo return (array).
- Clipboard: se introduce `readClipboardText({ tooLargeKey })` para centralizar el patrón `readClipboard()` + rama `res.ok === false` + `tooLarge`, preservando las notificaciones específicas por handler y manteniendo los límites/truncación existentes.

Reviewer assessment:
- PASS (L2): La duplicación existe en el pre-patch tanto en presets (snapshot + reset) como en clipboard (`readClipboard` + `tooLarge`). La factorización propuesta es local, de baja indirection, y no altera el orden de handlers ni la superficie IPC. (Anclas: presets `settingsCache || {}` y reset `presetsSelect.innerHTML = ''`; clipboard `res.ok === false` + `Notify.notifyMain(...)`.):contentReference[oaicite:7]{index=7}:contentReference[oaicite:8]{index=8}
- Validación recomendada (ampliación): probar clipboard overwrite/append en 3 casos: (1) texto normal, (2) `tooLarge`, (3) fallo no-tooLarge (debe caer en `catch` y notificar error como antes). Para presets: forzar error de carga y confirmar que UI queda reseteada igual que antes (select vacío, description vacía, caches limpias).:contentReference[oaicite:9]{index=9}
- Nota de coherencia histórica: en la auditoría anterior se evitó DRY de clipboard por costo/ramificación; aquí el costo es mínimo (un helper + `tooLargeKey`) y la duplicación era literal, por lo que el tradeoff sí da.

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (in `public/renderer.js`):
- Startup gating + handshake is consistent: `guardUserAction` blocks pre-READY actions and `maybeUnblockReady` gates READY on two flags. (anchors: "Renderer action ignored (pre-READY):" and `if (!rendererInvariantsReady || !startupReadyReceived) return`). 
- Subscriptions are centralized in `armIpcSubscriptions()` via `window.electronAPI.*` with guards/dedupe (e.g., `onStartupReady` duplicate warnOnce; `onEditorReady` ignores pre-READY).
- Clipboard path keeps explicit payload semantics (`setCurrentText({ text, meta:{ source, action } })`) and centralized normalization via `readClipboardText({ tooLargeKey })`.

Reviewer assessment:
- PASS (L3). Entry criteria for contract/architecture change not met; NO CHANGE is appropriate.
- Minor: Codex did not demonstrate cross-file contract inspection (preload/main). Acceptable for NO CHANGE; require explicit cross-check if L3 is revisited.

#### L4 — Logs (policy-driven tuning) (Codex re-pass)

Decision: CHANGED

- BOOTSTRAP keys: se prefixa `BOOTSTRAP:` solo en eventos realmente pre-READY/startup-only (pre-READY action gating, pre-READY ignores, handshake/splash/invariants, bootstrap-only syncToggleFromSettings), para cumplir la regla BOOTSTRAP (key o mensaje parte con `BOOTSTRAP:`).
- Persistent mismatch warnings: se eliminan prefixes `BOOTSTRAP:` en ausencia de `electronAPI` y ausencia de hooks de suscripción; quedan como keys estables no-bootstrap (`renderer.ipc.*.unavailable`) para reflejar que el problema no “desaparece tras init”.
- Readiness stall: ausencia de `onStartupReady` se promueve a `errorOnce` con key `renderer.startup.ready.unavailable`, porque puede dejar al renderer permanentemente pre-READY (gate `if (!rendererInvariantsReady || !startupReadyReceived) return`).

Reviewer assessment:
- PASS (L4). Política BOOTSTRAP corregida; fallbacks no silenciosos; dedupe estable; severidad ajustada en stall de READY.
- Nota: cambio de buckets (keys) implica re-emisión 1 vez por sesión tras el update.

Validation:
- grep keys: `BOOTSTRAP:renderer.preReady.` y `renderer.ipc.*.unavailable` y `renderer.startup.ready.unavailable`.
- Runtime: disparar una acción pre-READY (1 warnOnce), simular hook ausente (1 warnOnce), simular falta `onStartupReady` (1 errorOnce).

#### L5 — Comments (Codex)

Decision: CHANGED

Changes (comments-only):
- Added a dedicated divider `Clipboard helpers (shared by overwrite/append)` above `readClipboardText(...)` to document it as a reusable helper block.
- Re-positioned the `Overwrite current text with clipboard content` divider to sit directly above `btnOverwriteClipboard.addEventListener('click', ...)` for correct section adjacency.
- Rewrote the preset edit no-selection inline comment in English (ASCII) to satisfy the file comment language constraint.

Reviewer assessment:
- PASS (L5). Comments-only; improves reader guidance and removes the only visible non-English comment case without touching behavior/contract/timing.

Notes:
- No functional changes; comments-only.

#### L6 — Final review (Codex)

Decision: NO CHANGE

No Level 6 changes justified.

Evidence checked (anchors):
- Helper usage: `resolveSettingsSnapshot`, `resetPresetsState`, `readClipboardText`.
- Startup/READY gating: `maybeUnblockReady` guard and READY flags (`rendererInvariantsReady`, `startupReadyReceived`).
- IPC subscription robustness: `renderer.ipc.*.unavailable` warnOnce paths; missing `onStartupReady` escalated to `errorOnce('renderer.startup.ready.unavailable', ...)`; duplicate READY guarded by `renderer.startup.ready.duplicate`.
- Logging API signature consistency: `warnOnce(key, ...args)` / `errorOnce(key, ...args)` call sites remain in explicit-key mode; no wrapper/alias reintroduced.
- Comment/code alignment: `Clipboard helpers (shared by overwrite/append)` divider and adjacent overwrite/append handlers show no drift.

Reviewer assessment:
- PASS (L6). NO CHANGE is justified: no dead code, no stale patterns, and logging signatures/keys remain consistent with `public/js/log.js`. Observable contract/timing preserved.

#### L7 — Smoke (human-run; minimal)

**Estado:** PASS

**Checklist ejecutado:**

* [x] (1) Arranque sano: iniciar la app con logs visibles (terminal + DevTools Console). Esperado: sin *uncaught exceptions* / *unhandled rejections*; la ventana principal aparece y queda operativa.
* [x] (2) Invariantes duras (no deben disparar): confirmar que **no** aparecen errores tipo “AppConstants no disponible”, “RendererI18n no disponible”, “CountUtils no disponible” (si aparecen, el renderer debe abortar y esto es FAIL).
* [x] (3) READY/interactividad (camino sano): esperar a que el renderer llegue a READY (splash removido/flujo normal). Luego ejecutar 2–3 acciones normales (p.ej. overwrite clipboard, abrir editor, togglear crono). Esperado: **no** aparece “Renderer action ignored (pre-READY)” en el camino sano.
* [x] (4) Guard pre-READY (stress + dedupe): relanzar y, apenas aparezca la ventana, intentar disparar 5–10 veces una o dos acciones **antes** de READY (p.ej. `open-editor`, `clipboard-overwrite`). Esperado: no crash; si aparece warning pre-READY debe ser **warnOnce** con key `BOOTSTRAP:renderer.preReady.<actionId>` (no spam para el mismo `actionId`).
* [x] (5) Presets sanity: verificar que el select de presets carga (no queda vacío en camino sano). Cambiar selección y confirmar que actualiza WPM/preview/resultados de forma normal (sin “Error loading presets:” en logs).
* [x] (6) Clipboard overwrite: copiar texto corto al portapapeles y hacer **overwrite**. Esperado: el texto principal cambia, se recalculan preview/resultados; sin “clipboard error:” en logs.
* [x] (7) Clipboard append: copiar texto corto y hacer **append**. Esperado: el texto se concatena (con el joiner correspondiente), se recalculan preview/resultados; sin “append_error/clipboard error” en camino sano.
* [x] (8) Editor + loader: click en **Editar**. Esperado: loader visible + botón deshabilitado; al abrir editor y volver a READY, el loader se oculta y el botón se re-habilita (no queda “pegado”).
* [x] (9) Crono sanity: usar toggle start/stop + reset. Esperado: display/estado se actualiza; en logs no aparecen `renderer.ipc.onCronoState.unavailable` ni errores del handler de crono.
* [x] (10) Logs de mismatch (no deben aparecer en camino sano): confirmar ausencia de:
  * `renderer.startup.ready.unavailable` (sería stall de READY),
  * `renderer.ipc.*.unavailable` (hooks faltantes),
  * y cualquier spam repetible (si hay repetición, debe estar deduplicada con warnOnce/errorOnce).

---

### public/renderer.js

Date: `2026-01-23`
Last commit: `f011c4d4288c5cde9caffae0e3646f894f15e980`

#### L0 — Minimal diagnosis (Codex, verified)

Source: `tools_local/codex_reply.md` (local only; do not commit)

##### 0.1 Reading map
- Block order (high-level): strict/log + globals; DOM grabs; state/cache + i18n wiring; `applyTranslations`; early async init (config/settings); counting/preset/format hookups; helpers (`contarTexto`, `normalizeText`, `setModoConteo`); `updatePreviewAndResults` + `setCurrentTextAndUpdateUI`; crono state listener; `loadPresets`; main async init IIFE (current text, subscriptions, settings handler, precise toggle, info modal, menu actions); UI event listeners; stopwatch UI + loader helpers + crono controller init.
- Linear reading obstacles (identifier + micro-quote):
  - `applyTranslations` — “const labelsCrono = getCronoLabels();”
  - `settingsChangeHandler` — “const settingsChangeHandler = async (newSettings) => {”
  - `showInfoModal` — “async function showInfoModal(key, opts = {})”
  - `window.menuActions.registerMenuAction` — “window.menuActions.registerMenuAction('guia_basica', () => {”

##### 0.2 Contract map
- Exports/public entrypoints: none (script-only; behavior via side effects).
- Side effects (observed): reads globals (`AppConstants`, `RendererI18n`, `CountUtils`, `FormatUtils`, `RendererPresets`, `RendererCrono`, `Notify`); updates DOM; registers DOM event listeners; subscribes to `window.electronAPI` events; invokes `window.electronAPI` methods; registers `window.menuActions` actions.
- Invariants / fallbacks (anchored):
  - Requires `AppConstants` or throws — “throw new Error('[renderer] AppConstants no disponible;”
  - Requires `RendererI18n` or throws — “throw new Error('[renderer] RendererI18n no disponible;”
  - Requires `CountUtils.contarTexto` or throws — “if (typeof contarTextoModulo !== 'function')”
  - IPC payload sizing heuristic — “maxIpcChars = maxTextChars * 4”
  - Settings fallback on read failure — “settingsCache = {}”
  - WPM clamp — “val = Math.min(Math.max(val, WPM_MIN), WPM_MAX);”
  - Optional electronAPI hooks guarded — “typeof window.electronAPI.onSettingsChanged === 'function'”

###### IPC contract (explicit ipcMain/ipcRenderer/webContents calls)
- None found in this file (direct calls).

###### Delegated IPC registration
- None observed.

Reviewer assessment (L0 protocol compliance):
- PASS. Diagnosis-only; no invented direct IPC; obstacles include identifiers + micro-quotes; invariants anchored to visible checks/fallbacks.
- Note: direct `ipcRenderer/*` absence is expected because this file uses `window.electronAPI` as IPC façade.

#### L1 — Structural refactor and cleanup (Codex)

Decision: NO CHANGE

- File mixes initialization, event wiring, and UI helpers in a single, timing-sensitive flow; reordering blocks risks altering when listeners register vs. initial async setup.
- Two top-level async IIFEs interleave config/settings load with UI boot; moving them would change sequencing that affects cache and initial render.
- Several helpers depend on state initialized earlier (e.g., AppConstants-derived limits, settingsCache, idiomaActual), so regrouping would add cross-dependencies or indirection.
- Large, cohesive sections (info modal subsystem, menuActions registration, preset CRUD) are already contiguous; further extraction would add more named concepts than it removes.
- Any cleanup meaningful enough to improve linearity would likely touch behavior-sensitive ordering of DOM updates and electronAPI subscriptions.

Reviewer assessment:
- PASS for L1 gate as NO CHANGE: rationale is consistent with timing-sensitive sequencing constraints.

#### L2 — Clarity / robustness refactor (Codex)

Decision: NO CHANGE

- `applyTranslations` — “const labelsCrono = getCronoLabels();” — Extracting or reordering translation updates would entangle label refresh with crono state timing and increase cross-dependency reading.
- startup config/settings IIFE — “const cfg = await window.electronAPI.getAppConfig();” — Consolidating config + settings would risk changing initialization order for maxTextChars/maxIpcChars vs translations.
- `setCurrentTextAndUpdateUI` — “if (options.applyRules)” — Centralizing text updates would blur the conditional crono rule application and risk altering when rules fire.
- `window.electronAPI.onPresetCreated` handler — “window.electronAPI.onPresetCreated(async (preset) => {” — Refactoring selection + persistence logic into helpers would add indirection while preserving complex ordering of cache reload → selection → persistence.
- `settingsChangeHandler` — “const settingsChangeHandler = async (newSettings) => {” — Tightening error handling or splitting branches would spread language/precise-mode updates across helpers, making flow harder to follow.
- clipboard overwrite handler — “const res = await window.electronAPI.readClipboard();” — DRYing clipboard logic would have to parameterize distinct notifications and truncation semantics, increasing branching.
- `showInfoModal` — “async function showInfoModal(key, opts = {})” — Extracting fetch/translate steps would require threading modal state + focus logic, risking subtle UI timing.
- `initCronoController` — “cronoController = cronoModule.createController({” — Moving creation earlier/later would alter when controller binds to elements and electronAPI, a timing-sensitive side effect.

Reviewer assessment:
- PASS for L2 gate as NO CHANGE: now demonstrates evaluation of multiple concrete candidates (identifiers + micro-quotes) across distinct areas; rationale is consistent with timing/ordering sensitivity and avoids refactors that would add indirection/branching.

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

- public/renderer.js `btnOverwriteClipboard.addEventListener('click'` + electron/preload.js `readClipboard: () => ipcRenderer.invoke('clipboard-read-text')` — contract is explicit and stable; no mismatch or multi-consumer ambiguity requiring a contract change.
- public/renderer.js `window.electronAPI.onSettingsChanged` + electron/preload.js `onSettingsChanged: (cb) => {` — subscription API is clear and single-purpose; no evidence of unstable semantics across modules.
- public/renderer.js `loadPresets()` + public/js/presets.js `loadPresetsIntoDom({` — renderer delegates preset loading to a shared module with a defined API, reducing duplication already.
- public/renderer.js `initCronoController()` + public/js/crono.js `createController(options = {})` — crono wiring is centralized in a controller; no cross-module duplication demanding an architectural change.
- public/renderer.js `window.menuActions.registerMenuAction('guia_basica'` + public/js/menu_actions.js `function registerMenuAction(payload, callback)` — menu action routing is already abstracted; no evidence of conflicting consumers or ambiguous payloads.
- public/renderer.js `async function showInfoModal(key, opts = {})` + public/js/info_modal_links.js `function bindInfoModalLinks(container, ...)` — modal link handling is delegated; no contract instability detected.
- docs/cleanup/_evidence/issue64_repo_cleanup.md `IPC contract: none (no ipcMain/ipcRenderer/webContents usage)` — confirms renderer.js uses the preload façade, not raw IPC; no evidence of unstable IPC contract within this file.

Reviewer assessment:
- PASS for L3 gate as NO CHANGE: no concrete repo-wide pain/bug/instability demonstrated that would justify a contract or architecture change here.
- Note: last bullet is documentation-derived (redundant as “evidence checked”), but does not affect the conclusion.

#### L4 decision: CHANGED

- Ajuste de severidad + clasificación BOOTSTRAP en fallbacks de arranque:
  - Anclas: `BOOTSTRAP: getAppConfig failed; using defaults:`, `BOOTSTRAP: getSettings failed; using defaults:`, `BOOTSTRAP: initial translations failed; using defaults:`
  - Cambio: se reemplazan logs `error/warn` previos por `log.warn(...)` con prefijo `BOOTSTRAP:` en paths de fallback de bootstrap (sin alterar el fallback en sí).

- Cumplimiento de “call-site style” (sin wrappers/aliases locales):
  - Ancla: eliminación de `const warnOnceRenderer = (...args) => log.warnOnce(...args);`
  - Anclas de reemplazo: `log.warnOnce('renderer.loadRendererTranslations', ...)`, `log.warnOnce('renderer.syncToggleFromSettings', ...)`, `log.warnOnce('renderer.info.acerca_de.*', ...)`, `log.warnOnce('log.debug.openPresetModal', ...)`

- About modal: fallbacks explícitos y dedupe estable (sin sobre-loggear el path sano):
  - Anclas (keys): `renderer.info.acerca_de.version.empty`, `renderer.info.acerca_de.env.missing_fields`
  - Anclas (mensajes): `getAppVersion failed; About modal shows N/A:`, `getAppRuntimeInfo failed; About modal shows N/A:`

- Ajuste de plumbing hacia links del info modal (acompaña la limpieza de contrato en el helper):
  - Ancla: `bindInfoModalLinks(infoModalContent, { electronAPI: window.electronAPI });`
  - Nota: este cambio elimina el “log plumbing” hacia `bindInfoModalLinks` para alinearlo con el patrón del resto de módulos `public/js/*` (ver sección `public/js/info_modal_links.js`).

Contract/timing: sin cambios observables; cambios limitados a logs + plumbing interno asociado al helper de links del info modal.

##### public/js/info_modal_links.js

- Alineación con el patrón estándar de módulos `public/js/*`:
  - Ancla: `const log = window.getLogger('info-modal-links');`
  - Cambio: el módulo obtiene su propio logger; deja de depender de contratos inyectados desde `public/renderer.js`.

- Eliminación completa del contrato `warnOnceRenderer` y del contrato `log` inyectado:
  - Ancla previa eliminada: `bindInfoModalLinks(container, { electronAPI, warnOnceRenderer, log } = {})`
  - Ancla nueva: `bindInfoModalLinks(container, { electronAPI } = {})`
  - Cambio: se elimina la excepcionalidad (inyección de logger/capacidades) y se estandariza el diseño del módulo.

- Logs en call sites: directos vía `log.warnOnce(...)` / `log.error(...)` (sin `console.*` y sin wrappers/aliases):
  - Anclas (keys existentes preservadas): `renderer.info.appdoc.*`, `renderer.info.external.*`
  - Ancla de error: `log.error('Error handling info modal link click:', err);`

- Call site actualizado en `public/renderer.js`:
  - Ancla: `bindInfoModalLinks(infoModalContent, { electronAPI: window.electronAPI });`

Validación mecánica sugerida (documental):
- `warnOnceRenderer` debe ser 0 ocurrencias en `public/renderer.js` y `public/js/info_modal_links.js`.
- No debe existir `console.warn`/`console.error` en `public/js/info_modal_links.js`.

##### Meta — Actualización de política de logging (documental)

Referencia de cambios: diff desde `e1dffe38d1e428234209c22b49d0d4f6fb4637dc`.

- `electron/log.js` y `public/js/log.js`: se añade una regla explícita de “Call-site style”:
  - Ancla: “Call logger methods directly … Do NOT introduce local aliases/wrappers …”
  - Propósito: prohibir nombres/aliases tipo `warnOnceRenderer`/`warnRenderer` y estandarizar llamadas directas.

- `docs/cleanup/cleanup_file_by_file.md`: el template de Level 4 se refuerza con:
  - Regla explícita: “Call-site style (policy): use log.warn|warnOnce|error|errorOnce directly…”
  - Paso 0.1: “Enforce call-site style: remove any local log method aliases/wrappers…”

#### L5 — Comments (Codex)

Decision: CHANGED

Changes (comments-only):
- Added a top-of-file Overview block describing renderer responsibilities.
- Added section dividers aligned to the file's real blocks (logger/constants, DOM refs, shared state, i18n wiring, bootstrap, info modal, menu actions, presets, clipboard actions, stopwatch).
- Reworded/trimmed inline comments to focus on intent/constraints; removed trivial or drift-prone phrasing.
- Added explicit EOF marker: `// End of public/renderer.js`.

Validation (mechanical):
- `rg -n -F "Overview" public/renderer.js`
- `rg -n -F "End of public/renderer.js" public/renderer.js`

Notes:
- No functional changes; comments-only.

#### L6 — Final review (strict leftover removal)

Decision: CHANGED

Leftovers removed (unused in this file; existed only in destructuring + existence-guards):
- `combinePresets` (RendererPresets)
- `fillPresetsSelect` (RendererPresets)
- `formatTimeFromWords` (FormatUtils)

Edits applied (all local to `public/renderer.js`):
- Change: Removed `combinePresets` and `fillPresetsSelect` from the `RendererPresets` destructuring and from the “available” guard.
  - Gain: eliminates dead locals and keeps the guard aligned to actual usage.
  - Cost: no longer validates unused capabilities.
  - Risk: low; these symbols were not referenced anywhere else in this file.
  - Validation: grep shows no remaining references; presets still load and preset selection still works.

- Change: Removed `formatTimeFromWords` from the `FormatUtils` destructuring and from the “available” guard.
  - Gain: eliminates a dead local and keeps the guard aligned to actual usage.
  - Cost: no longer validates an unused capability.
  - Risk: low; this symbol was not referenced anywhere else in this file.
  - Validation: grep shows no remaining references; counts/time formatting still render on text updates.

Post-change anchors (to make the “guard matches usage” state explicit):
- Presets integration now only requires what it actually calls:
  - `const { applyPresetSelection, loadPresetsIntoDom } = window.RendererPresets || {};`
- Time formatting now only requires what it actually calls:
  - `const { getTimeParts, obtenerSeparadoresDeNumeros, formatearNumero } = window.FormatUtils || {};`

Observable contract, side effects, and timing/order were preserved (deletions of unused locals + related guards only).

#### Checklist L7

[x] **Log sanity (idle 20–30s)** con logs visibles.
   Esperado: sin `ERROR`/uncaught; sin spam continuo del mismo warning.

[x] **Clipboard overwrite (📋↺)** con texto corto.
   Esperado: cambia texto vigente y se actualiza preview/conteos/tiempo.

[x] **Clipboard append (📋+)** con texto corto.
   Esperado: agrega en nueva línea (joiner) y UI se actualiza.

[x] **Abrir Editor manual** desde main.
   Esperado: abre estable; sin errores.

[x] Con Editor abierto: **hacer overwrite (📋↺)** en main.
   Esperado: el Editor refleja el update (broadcast correspondiente) sin errores.

[x] **Vaciar texto (Clear)** desde main.
   Esperado: main queda vacío y el Editor se limpia.

[x] **Cerrar app y relanzar**.
   Esperado: init carga último texto persistido (o vacío si se vació); sin errores en startup.

---

### public/editor.js

Date: `2026-01-23`
Last commit: `f35685b0533e33e36e1ac69f2eadcf6e32d1eedd`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order:
    - header/strict/log
    - AppConstants guard + config/i18n async IIFE
    - DOM lookups
    - state + constants
    - i18n helpers + apply
    - settings-change listener
    - showNotice + window export
    - focus/selection helpers
    - find-bar state/helpers
    - find-bar events
    - textarea style tweaks
    - insertion + main-sync helpers
    - external update handler
    - init async IIFE
    - editorAPI listeners
    - paste/drop handlers
    - input + buttons
  - Where linear reading breaks (identifier + micro-quote):
    - `applyExternalUpdate` — "if (metaSource === 'main-window' && metaAction === 'append_newline')"
    - `performFind` — "let idx = forward ? haystack.indexOf"
    - `openFindBar` / `closeFindBar` — "findBar.hidden = false" / "findBar.hidden = true"
    - `sendCurrentTextToMain` — "const res = window.editorAPI.setCurrentText(payload)"

- Contract map (exports / side effects / IPC):
  - Exposes/entrypoints/side effects:
    - assigns `window.showNotice`
    - attaches DOM event listeners (editor, document, buttons)
    - registers editorAPI callbacks
    - runs two async IIFEs
    - no module exports
  - Invariants and guards (anchored):
    - AppConstants required — "if (!AppConstants) { throw new Error"
    - RendererI18n required — "if (!loadRendererTranslations || !tRenderer)"
    - Find UI readiness — "if (!isFindReady()) return"
    - Max text size enforced — "if (newText.length > maxTextChars)"
    - Paste/drop size cap — "if (text.length > PASTE_ALLOW_LIMIT)"
    - Find mode locks editor — "editor.readOnly = true"

  - IPC contract (only what exists in this file):
    - A) Direct IPC (ipcMain/ipcRenderer/webContents): none. No direct ipcMain/ipcRenderer/webContents usage in this file.
    - B) Bridge usage via window.editorAPI.* (implementation elsewhere; channels not visible here):
      - `window.editorAPI.getAppConfig`
      - `window.editorAPI.getSettings`
      - `window.editorAPI.onSettingsChanged`
      - `window.editorAPI.getCurrentText`
      - `window.editorAPI.setCurrentText`
      - `window.editorAPI.onInitText`
      - `window.editorAPI.onExternalUpdate`
      - `window.editorAPI.onForceClear`

Reviewer gate:
- L0 protocol: PASS (diagnosis-only; no invented direct IPC; anchors/micro-quotes present; bridge wording conservative and internally consistent).

#### L1 — Structural micro-cleanup (redo)

Decision: CHANGED

Changes (micro, semantics-identical; no reordering/retiming):
- `performFind`: removed redundant empty-query guard for `needle` (relies on early `if (!query)` before `const needle = query.toLowerCase()`).
- `insertTextAtCursor`: notify main via direct `sendCurrentTextToMain('paste')`; removed passthrough wrapper.
- `applyExternalUpdate`: collapsed duplicated `if (truncated)` (kept a single guard for the truncation notify).
- EOF: removed trailing blank lines (cosmetic only).

Anchors:
- `performFind` — "if (!query) {" … "const needle = query.toLowerCase();".
- `insertTextAtCursor` — "sendCurrentTextToMain('paste');".
- `applyExternalUpdate` — "if (truncated) { Notify.notifyEditor('renderer.editor_alerts.text_truncated'".

Reviewer gate: PASS

#### L2 — Clarity / robustness refactor (redo)

Decision: CHANGED

- Change: Extracted `notifyTextTruncated()` as a pure wrapper for:
  - `Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })`
  and replaced identical truncation-warning call sites to call the helper instead (in `handleTruncationResponse` and `applyExternalUpdate`).
  - Gain: Centralizes the truncation warning behavior; easier to scan/audit repeated branches.
  - Cost: Adds one tiny helper indirection.
  - Validation:
    - Static: confirm `renderer.editor_alerts.text_truncated` appears only inside `notifyTextTruncated()`.
    - Manual: trigger any truncation path (e.g., paste/insert text that exceeds max) and verify the same warning still appears.

Observable contract and timing preserved.
Reviewer gate: PASS

#### L3 — Architecture / contract changes (Codex)

  * **Decision: NO CHANGE (no Level 3 justified)**

  * **Evidence checked (anchors):**
    * `public/editor.js` — `window.editorAPI.setCurrentText(payload)` + fallback `window.editorAPI.setCurrentText(editor.value)` (doble shape). 
    * `public/editor.js` — echo suppression `incomingMeta.source === 'editor'`. 
    * `electron/editor_preload.js` — `setCurrentText: ... invoke('set-current-text', t)`. 
    * `electron/preload.js` — `setCurrentText: ... invoke('set-current-text', text)`. 
    * `public/renderer.js` — `setCurrentText({ text: currentText, meta })` + `throw ... 'set-current-text failed'`. 
  * **Reviewer gate: PASS**
  * Nota corta: No se justifica Nivel 3: shapes coexistentes ya son parte del contrato; cambiarlo sería churn de riesgo.

#### L4 — Logs

* **Call-site style (sin wrappers):** eliminación de `warnOnceEditor` y reemplazo por `log.warnOnce(...)` en call sites (anclas: `editor.select`, `focus.prevActive.*`, `setCurrentText.*`). Basado en política. 
* **showNotice:**

  * key `editor.showNotice.toastEditorText.missing` como `warnOnce` (fallback recuperable)
  * key `editor.showNotice.notifyMain.missing` como `errorOnce` (notice dropeado)
    (esto también aterriza “no silent fallbacks” + dedupe estable). 
* **Fallback no-silencioso en payload:** key `editor.setCurrentText.payload_failed` (`warnOnce`) cuando no hay `onPrimaryError`. 
* **BOOTSTRAP:** logs prefijados `BOOTSTRAP:` en fallbacks de arranque (con nota explícita de la condición “debe volverse inalcanzable post-init”). 

#### L5 — Comments (Codex + redo)

Decision: CHANGED (comments-only)

- Initial L5 pass:
  - Added a top "Overview" with scoped responsibilities.
  - Standardized section dividers to match the file’s real block order (bootstrap, DOM refs, helpers, events, bridge listeners, paste/drop, controls).
  - Removed/replaced drift-prone or redundant comments (e.g., placeholder init note; redundant step comments in insertion helper).
  - Added an explicit end-of-file marker.

- L5 redo (drift fix):
  - Overview responsibility softened to avoid a strict ordering guarantee:
    - "Kick off config and i18n bootstrap (async, best-effort)."
  - Bootstrap header softened to reflect async, best-effort behavior:
    - "Bootstrap: config and translations (async, best-effort)"

No functional changes; comments-only.
Reviewer gate: PASS

Anchors:
- Overview bullet — "Kick off config and i18n bootstrap (async, best-effort)."
- Bootstrap header — "Bootstrap: config and translations (async, best-effort)"
- EOF marker — "End of public/editor.js"

#### L6 — Final review (coherence + leftover cleanup after refactors)

Decision: NO CHANGE
No Level 6 changes justified.

Checks performed (anchors / micro-quotes):
- Logging API signatures: showNotice uses once-variants with explicit keys:
  - "editor.showNotice.toastEditorText.missing"
  - "editor.showNotice.notifyMain.missing"
- Logging fallback coverage: sendCurrentTextToMain warns once on payload failure:
  - "setCurrentText payload failed (ignored)"
  and preserves call-site fallback logging via onFallbackError.
- Contract consistency: sendCurrentTextToMain still calls:
  - "setCurrentText(payload)" with fallback "setCurrentText(text)".
- Update handling: applyExternalUpdate still tolerates object vs string inputs:
  - "payload && typeof payload === 'object'" (normalization path).
- Comment alignment: Overview / Bootstrap headers describe async best-effort:
  - "Bootstrap: config and translations (async, best-effort)".
- No leftover aliases: warnOnceEditor removed; call sites use log.warnOnce directly:
  - "use log.warnOnce directly".

Observable contract/timing preserved.
Reviewer gate: PASS

#### L7 — Smoke (human-run)

Estado: PASS | FAIL
Entorno: (dev/packaged), OS, commit/hash, state: existing | clean

Checklist:
- [x] (1) Editor abre con texto vigente (REG-EDITOR-01).
- [x] (2) Edición en editor propaga a main (REG-EDITOR-02).
- [x] (3) Overwrite/append desde main actualiza editor (main → editor).
- [x] (4) CALCULAR respeta semántica (si aplica).
- [x] (5) Clear en editor vacía main consistentemente.
- [x] (6) Find modal: navegación + highlight + bloqueo edición + Esc restaura.
- [x] (7) Undo/redo no contaminado por Find.
- [x] (8) Truncation/limits: aviso `renderer.editor_alerts.text_truncated` y app estable.
- [x] (9) Logs: sin uncaught, sin spam, sin BOOTSTRAP inesperado.

---

### public/preset_modal.js

Date: `2026-01-23`
Last commit: `c224a636c5956cf2616bf6a1bad287438324b204`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order:
    - IIFE wrapper + logger (`window.getLogger('preset-modal')`).
    - Entrypoint `DOMContentLoaded`; queries DOM + guard de elementos: `"missing DOM elements"`.
    - Pull de `AppConstants` + configuración de límites (`WPM_MIN/WPM_MAX`, maxLength name/desc).
    - Estado local: `mode`, `originalName`, `idiomaActual`, `translationsLoadedFor`.
    - Wiring i18n: destructure `window.RendererI18n` + helpers `tr` / `mr`.
    - i18n apply: `ensurePresetTranslations` + `applyPresetTranslations` (incluye rewrite de labels).
    - Bridge preload: `window.presetAPI.onInit(...)` (bootstrap modal) + `window.presetAPI.onSettingsChanged(...)` (cambio de idioma).
    - Builder: `buildPresetFromInputs()` (validaciones mínimas; retorna `{name,wpm,description}` o `null`).
    - UI listeners: contador caracteres desc, truncado name, save (edit/create), cancel, auto-fill name desde WPM.
    - Init char counter IIFE: `initCharCount()`.

  - Where linear reading breaks:
    - `window.presetAPI.onInit` anida múltiples `try/catch` y side effects: `"onInit(async (payload) =>"`.
    - `applyPresetTranslations` mezcla carga i18n + rewrite heurístico de labels: `"labels.forEach((lbl) =>"`.
    - Save handler bifurca edit/new + llamadas a presetAPI: `"if (mode === 'edit')"`.

- Contract map (exports / side effects / IPC):
  - Module exposure:
    - No exports; script de renderer con side effects: listeners DOM + listeners del bridge `window.presetAPI`.
    - Dependencias globales/bridge (observables en el archivo): `window.getLogger`, `window.AppConstants`, `window.RendererI18n`, `window.presetAPI`, `Notify`.

  - Invariants and fallbacks (anchored):
    - Guard DOM esencial (abort): `"missing DOM elements"`.
    - `AppConstants` requerido (hard-fail): `"AppConstants no disponible"`.
    - `RendererI18n` requerido (hard-fail): `"RendererI18n no disponible"`.
    - `Notify` asumido para algunas rutas (contract implícito): `/* global Notify */` y `"Notify.notifyMain('renderer.preset_alerts.wpm_invalid')"`.
    - Nombre requerido (fallback notify/alert): `"renderer.preset_alerts.name_empty"`.
    - WPM debe ser finito y en rango (fallback notify): `"renderer.preset_alerts.wpm_invalid"`.
    - `presetAPI.getSettings` es best-effort: `log.warnOnce('preset-modal.getSettings', ...)`.

  - IPC contract (only what exists in this file):
    - No `ipcMain/ipcRenderer/webContents` directo en este archivo.
    - Contrato vía preload (`window.presetAPI`), inferido por uso (sin canales):
      - `onInit(fn(payload))` usa `payload.mode`, `payload.preset.{name,description,wpm}`, `payload.wpm`.
      - `getSettings()` solo se usa por `settings.language`.
      - `onSettingsChanged(fn(settings))` usa `settings.language`.
      - `editPreset(originalName, preset)` / `createPreset(preset)` esperan respuesta con `res.ok` y en edit se observa `res.code === 'CANCELLED'`.

#### L1 — Structural refactor and cleanup (Codex)

Decision: NO CHANGE

- El archivo ya sigue un flujo lineal dentro de `DOMContentLoaded` (setup → i18n helpers → `window.presetAPI` wiring → builder → listeners → init IIFE).
- Reordenar/extractar a nivel estructural entrega ganancia marginal y puede alterar el orden relativo entre:
  - wiring de callbacks (`window.presetAPI.onInit`, `onSettingsChanged`)
  - inicialización de UI (p.ej. `initCharCount()` y traducciones iniciales)
- La duplicación más visible (actualización de contador de caracteres) ocurre en call sites con semántica no idéntica (input vs init/replay), por lo que extraerla agrega indirection sin reducir complejidad material.
- No se identificó un cambio L1 claramente “mejor” que sea inequívocamente behavior/timing-preserving.

Reviewer gate: PASS

#### L2 — Clarity / robustness refactor (Codex follow-up)

Decision: CHANGED

- Change (silent no-op removal): en el handler de Save se agregó un `else` explícito cuando falta el método esperado del bridge:
  - Edit mode: si falta `window.presetAPI.editPreset`, ahora:
    - notifica `renderer.preset_alerts.process_error`
    - loguea una sola vez: `log.warnOnce('preset-modal.editPreset.missing', ...)`
  - New mode: si falta `window.presetAPI.createPreset`, ahora:
    - notifica `renderer.preset_alerts.process_error`
    - loguea una sola vez: `log.warnOnce('preset-modal.createPreset.missing', ...)`

Gain:
- Elimina el no-op silencioso post-validación; el usuario recibe feedback inmediato y el log queda trazable sin spam.

Cost:
- Agrega un path visible (Notify + warnOnce) únicamente en entornos misconfigurados (bridge incompleto).

Validation:
- Forzar entorno misconfigurado (sin `presetAPI` o sin `editPreset/createPreset`) y presionar Save:
  - Debe aparecer `renderer.preset_alerts.process_error`.
  - Debe emitirse un único warnOnce por clave (`preset-modal.*.missing`), aunque se repita el click.
- En entorno normal, crear/editar presets debe comportarse igual que antes.

Contract/timing:
- Se preserva el contrato observable y el timing en flujos normales; solo cambia el comportamiento del caso previamente silencioso.

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

- Checked `public/preset_modal.js` save handler (`if (mode === 'edit')`) and result handling (`res.ok`, edit observes `res.code === 'CANCELLED'`); no evidence of inconsistent semantics across consumers.
- Checked `electron/preset_preload.js` bridge: `contextBridge.exposeInMainWorld('presetAPI', { ... })` defines a single, stable surface (`createPreset`, `editPreset`, reliable `onInit`, plus settings hooks).
- Checked `electron/main.js` preset window init path: `function createPresetWindow(initialData)` and `presetWin.webContents.send('preset-init', initialData || {})`, including re-send when window is already open and on `ready-to-show`.
- Cross-check: no repo-wide evidence (call sites / consumers) indicating duplicated responsibility or an unstable/ambiguous contract requiring Level 3.

Reviewer gate: PASS

#### L4 — Logs (Codex)

Decision: CHANGED

Cambios (solo logging; sin cambios de contrato/timing en flujos sanos):

- Bridge init hooks ausentes ahora dejan rastro explícito (evita degradación silenciosa del modal):
  - `log.warnOnce('preset-modal.onInit.missing', ...)`
  - `log.warnOnce('preset-modal.onSettingsChanged.missing', ...)`

- Fallback “usar idioma por defecto” por falta de settings API queda visible:
  - `log.warnOnce('preset-modal.getSettings.missing', ...)`

- Fallback `alert(...)` por ausencia de Notify queda visible:
  - `log.warnOnce('preset-modal.notify.missing', ...)`

- Ajuste de severidad al fallar Save por ausencia del método del bridge (acción del usuario no ejecutable):
  - `preset-modal.editPreset.missing`: `log.warnOnce(...)` → `log.errorOnce(...)`
  - `preset-modal.createPreset.missing`: `log.warnOnce(...)` → `log.errorOnce(...)`

Validación (manual):
- Abrir modal en entorno misconfigurado (sin preload/bridge completo) y verificar que:
  - Los warns/error aparecen una sola vez por clave.
  - El flujo sano (create/edit con bridge completo) se mantiene idéntico.

Observable contract/timing: preservados; cambios limitados a logging en paths degradados/misconfigurados.

Reviewer gate: PASS

#### L5 — Comments (Codex)

Decision: CHANGED

- Se agregó un bloque "Overview" (responsabilidades) para orientar al lector.
- Se añadieron separadores de sección que reflejan el flujo real del archivo (logger/bootstrap, DOM guards, constants/limits, state, i18n, presetAPI wiring, builder/validation, listeners, initial sync).
- Se removieron/ajustaron comentarios de bajo valor (restatements) y se reubicaron para que el “intent” viva en headers de sección.
- Se agregó marcador explícito de fin de archivo: "End of public/preset_modal.js".

No functional changes; comments-only.

Reviewer gate: PASS

#### L6 — Final review (Codex)

Decision: NO CHANGE

No Level 6 changes justified.

- Checked logging API usage for explicit-key dedupe calls (warnOnce/errorOnce) in:
  - presetAPI wiring (`preset-modal.onInit.missing`, `preset-modal.onSettingsChanged.missing`, `preset-modal.getSettings.missing`)
  - save flow missing-bridge paths (`preset-modal.editPreset.missing`, `preset-modal.createPreset.missing`)
- Checked required DOM guard and subsequent usage of guarded elements (`if (!nameEl || !wpmEl || ...) return;`).
- Checked i18n flow consistency (`ensurePresetTranslations` -> `applyPresetTranslations`) and state (`idiomaActual`, `translationsLoadedFor`).
- Checked presetAPI init/settings handlers for control flow and error handling (`onInit`, `onSettingsChanged`).
- Checked input validation + save flow invariants (`buildPresetFromInputs`, `btnSave.addEventListener`).
- Checked comments vs code structure (Overview, section dividers, end-of-file marker).

Observable contract and timing are preserved (no code changes).

Reviewer gate: PASS

#### L7 — Smoke test checklist (human-run; code-informed) — `public/preset_modal.js`

**Preconditions**

* App ejecutándose con logs visibles (DevTools Console o salida de terminal).
* Existe al menos un preset en el selector de la ventana principal.
* Identifica en la ventana principal los botones **Nuevo preset** y **Editar preset** (en `public/renderer.js` son `btnNewPreset` / `btnEditPreset`).

[x] 1) Open modal (new)

**Action:** En ventana principal, clic **Nuevo preset**.
**Expected:**

* Se abre el modal sin errores.
* WPM se inicializa con el WPM actual (redondeado).
* Si el nombre estaba vacío, se auto-rellena como `"<wpm>wpm"`.
  **Anchors (preset_modal.js):**
* `window.presetAPI.onInit(async (payload) =>`
* `if (typeof payload.wpm === 'number')`
* `nameEl.value = \`${Math.round(payload.wpm)}wpm``

[x] 2) Description length + counter stays responsive

**Action:** Pegar en “Description” un texto largo (más que el límite).
**Expected:**

* El campo queda truncado al máximo permitido (no crece indefinidamente).
* El contador se actualiza (aunque pueda quedar negativo por el orden “contador antes de truncar”, el UI no se rompe).
  **Anchors:**
* `descEl.addEventListener('input', () =>`
* `charCountEl.textContent = mr(... { remaining } ...)`
* `descEl.value = descEl.value.substring(0, descMaxLength)`

[x] 3) Name required (validation)

**Action:** Vaciar “Name” y presionar **Save**.
**Expected:**

* El modal NO se cierra.
* Se emite una notificación/alerta de “name empty”.
  **Anchors:**
* `if (!name) {`
* `window.Notify.notifyMain('renderer.preset_alerts.name_empty')`
* Fallback log (si Notify faltara): `preset-modal.notify.missing`

[x] 4) WPM bounds (validation)

**Action:** Poner un WPM fuera de rango (p. ej., 0 o > max) y presionar **Save**.
**Expected:**

* El modal NO se cierra.
* Se emite notificación `renderer.preset_alerts.wpm_invalid`.
  **Anchors:**
* `if (!Number.isFinite(wpm) || wpm < WPM_MIN || wpm > WPM_MAX)`
* `Notify.notifyMain('renderer.preset_alerts.wpm_invalid')`

[x] 5) Save new preset (happy path)

**Action:** En modo “new”, ingresar un nombre válido (único), WPM válido y presionar **Save**.
**Expected:**

* En éxito, el modal se cierra.
* En la ventana principal, el preset nuevo aparece (idealmente seleccionado) y la UI refleja el cambio (WPM/descripcion).
  **Anchors:**
* `window.presetAPI.createPreset(preset)`
* `if (res && res.ok) { window.close(); }`
* Error path: `renderer.preset_alerts.create_error`

[x] 6) Open modal (edit) + prefill + save

**Action:** En la ventana principal, seleccionar un preset existente y clic **Editar preset**.
**Expected:**

* El modal se abre con campos pre-rellenados (Name/Description/WPM).
* Editar la descripción y presionar **Save** cierra el modal en éxito.
* En la ventana principal se observa la actualización del preset.
  **Anchors:**
* `const incomingMode = (payload.mode === 'edit') ? 'edit' : 'new'`
* `originalName = payload.preset.name`
* `window.presetAPI.editPreset(originalName, preset)`
* `if (res && res.ok) { window.close(); }`
* Cancel path: `if (res && res.code === 'CANCELLED') return;`

[x] 7) Cancel closes without side effects

**Action:** Abrir el modal (new o edit) y presionar **Cancel**.
**Expected:**

* El modal se cierra.
* No se crea/edita nada.
  **Anchors:**
* `btnCancel.addEventListener('click', () => { window.close(); })`

[x] 8) Log sanity (normal environment)

**Action:** Repetir abrir/cerrar modal y realizar un save exitoso (new y edit).
**Expected (normal, con preload/bridge correcto):**

* No deben aparecer logs “missing” del bridge/Notify:

  * `preset-modal.onInit.missing`
  * `preset-modal.onSettingsChanged.missing`
  * `preset-modal.getSettings.missing`
  * `preset-modal.editPreset.missing`
  * `preset-modal.createPreset.missing`
  * `preset-modal.notify.missing`
    Si aparecen, tratar como regresión del wiring/preload (no del flujo sano del modal).

---

### public/flotante.js

Date: `2026-01-24`
Last commit: `c224a636c5956cf2616bf6a1bad287438324b204`

#### L0 — Diagnosis (no changes)

##### 0.1 Reading map
- Block order (high level):
  - strict/log startup: `const log = window.getLogger('flotante');`
  - guard AppConstants + DEFAULT_LANG: `if (!AppConstants) { throw new Error`
  - DOM lookups: `document.getElementById('crono'/'toggle'/'reset')`
  - missing-element logs
  - local state/labels (`lastState`, `playLabel`, `pauseLabel`, `translationsLoadedFor`)
  - `renderState(state)`
  - bridge registration: `window.flotanteAPI.onState((state) =>`
  - i18n helper: `applyFlotanteTranslations(lang)`
  - async bootstrap IIFE: `(async () => {`
  - settings listener: `window.flotanteAPI.onSettingsChanged((settings) =>`
  - UI listeners: `btnToggle.addEventListener('click'` / `btnReset.addEventListener('click'`
  - keydown listener: `window.addEventListener('keydown', (ev) =>`

- Linear reading breaks (identifier + micro-quote):
  - `window.getLogger` — `const log = window.getLogger('flotante');`
  - `renderState` — `lastState = Object.assign`
  - `renderState` — `window.RendererCrono && typeof window.RendererCrono.formatCrono`
  - `renderState` — `btnToggle.textContent = state.running ?`
  - `window.flotanteAPI.onState` — `window.flotanteAPI.onState((state) =>`
  - `applyFlotanteTranslations` — `await loadRendererTranslations(target);`
  - init IIFE — `(async () => {`
  - init IIFE — `const settings = await window.flotanteAPI.getSettings();`
  - settings handler — `if (!nextLang || nextLang === translationsLoadedFor) return`
  - button wiring — `btnToggle.addEventListener('click', () => {`
  - button wiring — `btnReset.addEventListener('click', () => {`
  - keydown — `if (ev.code === 'Space' || ev.key === ' ' || ev.key === 'Enter')`

##### 0.2 Contract map
- Exposes / side effects:
  - no exports; runs on load
  - registers callbacks on `window.flotanteAPI` (state + settings)
  - attaches DOM listeners to `#toggle/#reset` and `window` keydown
  - writes to DOM: `#crono.textContent`, `#toggle.textContent`
  - logs via `window.getLogger('flotante')`

- Observable public entrypoints used here (bridge-style/global APIs):
  - `window.getLogger('flotante')`
  - `window.AppConstants.DEFAULT_LANG`
  - `window.flotanteAPI.onState(fn)`
  - `window.flotanteAPI.getSettings()`
  - `window.flotanteAPI.onSettingsChanged(fn)`
  - `window.flotanteAPI.sendCommand({ cmd })`
  - `window.RendererCrono.formatCrono(elapsed)` (optional path)
  - `window.RendererI18n.loadRendererTranslations(lang)` (optional)
  - `window.RendererI18n.tRenderer(key, fallback)` (optional)

- Invariants / assumptions & tolerated errors (anchored):
  - AppConstants must exist (hard-fail): `if (!AppConstants) { throw new Error`
  - getLogger must exist (no guard): `const log = window.getLogger('flotante');`
  - buttons must exist for wiring (unguarded addEventListener): `btnToggle.addEventListener('click'`
  - renderState tolerates missing state: `if (!state) return;`
  - DOM write to crono is guarded: `if (cronoEl) {`
  - RendererCrono formatter is optional: `window.RendererCrono && typeof window.RendererCrono.formatCrono`
  - i18n helpers are optional: `if (!loadRendererTranslations || !tRenderer) return;`
  - translation load failure tolerated via warnOnce: `loadRendererTranslations(${target}) failed (ignored)`
  - getSettings failure tolerated via warnOnce: `getSettings failed (ignored)`
  - sendCommand calls are guarded by API presence: `if (window.flotanteAPI) window.flotanteAPI.sendCommand`

- IPC contract (direct): none in this file (`ipcMain/ipcRenderer/webContents` not used).

#### L1 — Structural refactor and cleanup (Codex)

Decision: NO CHANGE
- File is already short and ordered by initialization flow; reordering would not improve linear readability.
- Main complexity stems from async translation load and event wiring; moving these blocks would obscure timing intent.
- No safe local simplifications without behavior change (e.g., guarding unguarded addEventListener would alter error behavior).
- No obvious duplication or ambiguous naming that can be reduced without adding extra indirection.
- Introducing new structure (sections/helpers) would add concepts without removing branches.

Reviewer gate: PASS (NO CHANGE is justified; no code changes).

#### L2 — Clarity / robustness refactor (controlled) (Codex)

Decision: NO CHANGE
- The only clear robustness gap (unguarded addEventListener on possibly-null buttons) is behaviorally visible; guarding would change error behavior.
- Existing logging is already proportionate and deduped via warnOnce; adding more would risk noise.
- Repeated sendCommand calls are minimal; adding helpers would add indirection without real branching reduction.
- Async translation flow and settings fetch are already explicit; further refactoring would add concepts without clarity payoff.
- No safe edge-case distinctions to surface without altering timing or observable side effects.

Observable contract and timing preserved by making no changes.

Reviewer gate: PASS (NO CHANGE is justified; no code changes).

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- `public/flotante.html` — identifier: `id="crono"`; snippet: `<div id="crono" class="crono">00:00:00</div> ...`
- `public/flotante.html` — identifier: `id="toggle"` / `id="reset"`; snippet: `<button id="toggle" ...>...</button> <button id="reset" ...>...</button>`
- `electron/flotante_preload.js` — identifier: `exposeInMainWorld('flotanteAPI'`; snippet: `contextBridge.exposeInMainWorld('flotanteAPI', { onState: (cb) => {`
- `electron/flotante_preload.js` — identifier: `onState`; snippet: `ipcRenderer.on('crono-state', wrapper); ... removeListener('crono-state'`
- `electron/flotante_preload.js` — identifier: `sendCommand`; snippet: `ipcRenderer.send('flotante-command', cmd);`
- `electron/flotante_preload.js` — identifier: `getSettings/onSettingsChanged`; snippet: `invoke('get-settings') ... ipcRenderer.on('settings-updated', listener)`
- `electron/main.js` — identifier: `ipcMain.on('flotante-command'`; snippet: `ipcMain.on('flotante-command', (_ev, cmd) => {`
- `public/flotante.js` — identifier: `btnToggle.addEventListener`; snippet: `btnToggle.addEventListener('click', () => { if (window.flotanteAPI) ...`
- `public/flotante.js` — identifier: `onState` guard; snippet: `if (window.flotanteAPI && typeof window.flotanteAPI.onState === 'function')`
- `public/js/crono.js` — identifier: `openFlotanteWindow` guard; snippet: `if (!electronAPI || typeof electronAPI.openFlotanteWindow !== 'function')`

Reviewer gate: PASS (NO CHANGE justified; DOM IDs exist and bridge methods are exposed/routed consistently).

#### L4 decision: CHANGED

- Normalización de estilo de mensajes (evita duplicar scope en el texto):
  - DOM missing: `log.error('element #crono not found')` (antes incluía `flotante:`/`[flotante]` en el mensaje).
  - Bridge missing/methods: se removió `"[flotante]"` del texto (ej.: `log.error('flotanteAPI missing; IPC bridge unavailable.')`).
  - Errors genéricos: `log.error('Error loading translations:', err)` (sin sufijos de scope en el mensaje).

- Logging explícito para bridge `window.flotanteAPI` y métodos:
  - `log.error('flotanteAPI missing; IPC bridge unavailable.')`
  - `log.warn('flotanteAPI.onState missing; state updates disabled (ignored).')`
  - `log.warn('flotanteAPI.getSettings missing; using default language (ignored).')`
  - `log.warn('flotanteAPI.onSettingsChanged missing; live updates disabled (ignored).')`
  - `log.error('flotanteAPI.sendCommand missing; controls may fail.')`

- Fallback de formato de crono (alto potencial de repetición) con dedupe estable:
  - `log.warnOnce('flotante.formatCrono.missing', 'formatCrono unavailable; using simple formatter (ignored).')`

- i18n fallback explícito (sin dedupe):
  - `log.warn('RendererI18n unavailable; skipping translations (ignored).')`

- Best-effort failures con estilo “failed (ignored)” y sin dedupe (no high-frequency por contrato):
  - `log.warn(\`loadRendererTranslations(${target}) failed (ignored):\`, err)`
  - `log.warn('getSettings failed (ignored):', err)`
  - `log.warn('apply settings update failed (ignored):', err)`

**Evidence**
- `public/flotante.js`:
  - Mensajes sin prefijos redundantes: `"element #crono not found"`, `"flotanteAPI missing; IPC bridge unavailable."`.
  - Dedupe key estable: `'flotante.formatCrono.missing'`.
  - Best-effort phrasing: `"failed (ignored):"` y `"apply settings update failed (ignored):"`.

**Risk**
- Bajo (logging-only). El único impacto potencial es aumento de volumen en sesiones *misconfigured* o con fallos repetidos de i18n/settings, porque se removió `warnOnce` en esos paths (se mantiene `warnOnce` solo en el fallback de render-loop `formatCrono`).

**Validation**
- Static:
  - Verificar key estable: buscar `flotante.formatCrono.missing` en `public/flotante.js`.
  - Verificar que no quedan prefijos redundantes en mensajes (`[flotante]`, `flotante:`) dentro de llamadas `log.*` en este archivo.
- Runtime (smoke normal):
  - Abrir/cerrar flotante y usar toggle/reset: no debe aparecer spam nuevo en logs en ejecución sana; el flujo normal no debería producir warnings/errors de bridge/i18n.

#### L5 — Comments (Codex + manual follow-up)

Decision: CHANGED

- Se agregó un bloque "Overview" al inicio (responsabilidades), en inglés y ASCII, siguiendo el estilo de encabezados tipo `electron/main.js`.
- Se agregaron separadores de sección `// =============================================================================` alineados a la estructura real del archivo:
  - Overview
  - Logger / globals
  - Constants / config
  - DOM wiring
  - Shared state
  - Helpers
  - Bridge integration (flotanteAPI)
  - Bootstrapping
  - UI events
- Se corrigió el comentario de DOM wiring para reflejar comportamiento real y expectativa del layout:
  - `// Missing elements are logged; execution continues (assumes flotante.html provides these IDs).`
- Se agregó marcador explícito de fin de archivo:
  - `// End of public/flotante.js`

Notas:
- Hubo un follow-up manual para evitar drift/ruido en el comentario de DOM wiring (se evitó el tono “alarmista” del último diff de Codex).
- No hay cambios de lógica/flujo: el nivel se limitó a comentarios (y ajustes manuales de texto adyacente, sin impacto en timing/ordering).

Reviewer gate: PASS

#### L6 — Final review (Codex)

Decision: NO CHANGE
No Level 6 changes justified.

- Logging API: se revisaron llamadas `warnOnce`/`warn`/`error` y rutas best-effort (sin drift de firma).
- Coherencia: wiring DOM, bridge (`flotanteAPI`), renderState y flujo i18n sin leftovers evidentes ni comentarios desfasados.
- Contrato: comandos `sendCommand({ cmd: 'toggle'|'reset' })` y callbacks de estado/settings sin cambios.

Observable contract/timing preserved (no changes applied).

#### L7 — Smoke (human-run; minimal)

**Estado:** PASS

**Checklist ejecutado:**

* [x] (1) VF abre y muestra controles (REG-CRONO-03).
* [x] (2) Sync main↔flotante: toggle y reset desde flotante (REG-CRONO-03).
* [x] (3) Unfocused: Alt-Tab y control desde flotante mantiene consistencia (REG-CRONO-03).
* [x] (4) Teclado en flotante: Space/Enter toggle; `r` reset.
* [x] (5) i18n cross-window: cambio de idioma refleja en flotante sin crash (REG-I18N-02).
* [x] (6) Logs: sin uncaught; sin spam; sin `flotante.formatCrono.missing` en camino sano.

---

### public/language_window.js

Date: `2026-01-24`
Last commit: `93cfc1aea95f187168410b596f99fd724cf797c4`

#### L0 — Diagnosis (no changes) (Codex, verified)

##### 0.1 Reading map

- Block order (as-is):
  1) Header comment + `'use strict'`
  2) Logger selection + DOM bindings (`log`, `langFilter`, `langList`, `statusLine`)
  3) Local fallback list (`fallbackLanguages`)
  4) State (`languages`, `filteredLanguages`, `focusedIndex`, `isBusy`)
  5) Helpers (`getItems`, `setStatus`, `setBusy`, `setFocusedIndex`, `renderList`, `selectLanguage`)
  6) Event listeners (`langFilter` input/keydown; `langList` click/keydown/focusin)
  7) Async loader (`loadLanguages`)
  8) Startup IIFE (anonymous) that invokes `loadLanguages` on module load

- Linear-reading breaks / obstacles:
  - `renderList` mixes filtering + DOM rebuild + empty-state:
    - anchor: `"langList.innerHTML = ''"`
  - `selectLanguage` couples UI state + external API + window control:
    - anchor: `"await window.languageAPI.setLanguage(lang)"`
  - Startup IIFE (anonymous) triggers async flow on load:
    - anchor: `"(async () => {"`

##### 0.2 Contract map

- Exposes:
  - No exports; renderer-side side-effect module for the language selection window.

- Side effects at load:
  - Immediately binds DOM elements by id and registers event listeners:
    - anchor: `"document.getElementById('langFilter')"`
  - Immediately triggers initial async load via an anonymous IIFE:
    - anchor: `"(async () => {"`

- External dependencies (observed):
  - Optional global logger factory:
    - anchor: `"window.getLogger ?"`
  - Expects `window.languageAPI` (preload-provided) with:
    - `getAvailableLanguages()`:
      - anchor: `"typeof window.languageAPI.getAvailableLanguages"`
    - `setLanguage(tag)`:
      - anchor: `"window.languageAPI.setLanguage"`

- Invariants / fallbacks / assumptions (anchored):
  - Logger falls back to console if global missing:
    - anchor: `"window.getLogger ?"`
  - Requires DOM elements exist (no guards before use):
    - anchor: `"document.getElementById('langFilter')"`
  - Busy state blocks interactions in handlers:
    - anchor: `"if (isBusy) return"`
  - `setStatus` tolerates empty/undefined messages:
    - anchor: `"message || ''"`
  - `setBusy` sets `aria-disabled` string and toggles disabled styling:
    - anchor: `"busy ? 'true' : 'false'"`
  - `setFocusedIndex` clamps to bounds; empty list yields `focusedIndex = -1` and returns:
    - anchor: `"Math.max(0, Math.min"`
  - `renderList` placeholder on zero matches:
    - anchor: `"empty.textContent = 'No matches'"`
  - `loadLanguages` expects `languageAPI.getAvailableLanguages` or logs error:
    - anchor: `"getAvailableLanguages unavailable"`
  - `loadLanguages` falls back to local list when empty/unavailable:
    - anchor: `"languages = fallbackLanguages.slice()"`
  - Startup IIFE catch also falls back after `loadLanguages` failure:
    - anchor: `"Error loadLanguages:"`
  - `selectLanguage` guards empty selection and busy state; closes window on success:
    - anchor: `"if (!lang || isBusy) return"`

- IPC contract (only what exists in this file):
  - None (no `ipcMain.*`, `ipcRenderer.*`, `webContents.send`).

- Delegated IPC registration:
  - None.

#### L1 — Structural refactor and cleanup (Codex)

Decision: NO CHANGE

- Already grouped by setup/state, helpers, event handlers, data load, and init IIFE with clear flow.
- Helpers are short and single-purpose; reordering would not reduce branching or duplication.
- The startup IIFE is straightforward; introducing a named init would add a concept without payoff.
- Event handlers are colocated with related helpers and state, preserving locality.
- Any structural reflow risks subtle timing/readability tradeoffs without clear benefit.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

Reviewer assessment: PASS. NO CHANGE is appropriate; the module is already small/cohesive and its current layout supports linear reading.
Reviewer gate: PASS

Observable contract/timing preserved (no changes applied).

#### L2 — Clarity / robustness refactor (Codex)

Decision: NO CHANGE

- File is already small, linear, and readable; no duplication that a helper would reduce.
- Error handling is explicit and proportionate around the only async calls; adding more would be noise.
- Guarding missing DOM nodes would change failure mode (currently throws), altering observable behavior.
- Reordering or extracting startup IIFE would add indirection without reducing branches.
- Busy/selection guards and fallbacks are already explicit and localized.

Observable contract and timing preserved (no code changes).

Reviewer assessment: PASS — “NO CHANGE” is justified; the module already has explicit busy guards and try/catch, and adding DOM-null guards would alter fail-fast behavior.
Reviewer gate: PASS

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- `public/language_window.js` `loadLanguages` — "typeof window.languageAPI.getAvailableLanguages === 'function'".
- `public/language_window.js` `selectLanguage` — "await window.languageAPI.setLanguage(lang)".
- `electron/language_preload.js` `setLanguage` — "ipcRenderer.invoke('set-language', tag)".
- `electron/settings.js` `registerIpc` (`set-language`) — "ipcMain.handle('set-language', async (_event, lang) => {".
- `electron/main.js` `get-available-languages` — "ipcMain.handle('get-available-languages', async () => {".
- `electron/main.js` first-run gate — "ipcMain.once('language-selected', () => {".

Reviewer assessment: PASS — No evidence of cross-module contract instability or duplicated responsibility requiring Level 3; the language window uses a single preload API that maps cleanly to existing IPC handlers and a first-run gating signal.
Reviewer gate: PASS

Observable contract/timing preserved (no code changes).

#### L4 — Logs (policy-driven tuning after flow stabilization) (Codex)

Decision: CHANGED

Changes (logging-only):
- `loadLanguages`: when `getAvailableLanguages` throws/unavailable:
  - was: `log.error('Error getAvailableLanguages:', e)`
  - now: `log.warn('BOOTSTRAP: getAvailableLanguages failed; falling back to local list:', e)`
  - Rationale: recoverable fallback → warn (BOOTSTRAP), not error.
- `loadLanguages`: when `getAvailableLanguages` returns empty/invalid (previously silent fallback):
  - now logs once-per-call-path: `log.warn('BOOTSTRAP: getAvailableLanguages returned empty/invalid; falling back to local list.')`
  - Rationale: no silent fallbacks; this is a degraded bootstrap path.
- Startup IIFE catch:
  - was: `log.error('Error loadLanguages:', e)`
  - now: `log.error('BOOTSTRAP: loadLanguages failed; falling back to local list:', e)`
  - Rationale: explicit BOOTSTRAP safety-net fallback.

Implementation note:
- Added per-invocation flag `fallbackLogged` inside `loadLanguages` to avoid duplicate warnings when an exception leads to an empty/invalid `available`.

Contract/timing:
- Preserved. Only log levels/messages were changed; data flow and ordering remain the same.

Validation (manual / grep):
- Grep: `BOOTSTRAP: getAvailableLanguages` and `BOOTSTRAP: loadLanguages failed`.
- Manual smoke: open the language window with `window.languageAPI.getAvailableLanguages` unavailable/throwing (or returning `[]`) and confirm:
  - fallback list renders,
  - exactly one BOOTSTRAP warn for the fallback path,
  - no new logs on the healthy path.

Reviewer assessment: PASS — fixes a previously silent fallback; uses BOOTSTRAP prefix and appropriate severity.
Reviewer gate: PASS

#### L5 — Comments (Codex, retry)

Decision: CHANGED (comments-only)

- Se agregó un bloque "Overview" (3–7 bullets, English, ASCII) describiendo responsabilidades reales de la ventana de idioma.
- Se agregaron separadores de sección usando el formato del repo `// =============================================================================` (alineado a `public/renderer.js`).
- Se mantuvo la nota existente sobre el comportamiento al cerrar sin selección, y se agregó el marcador de fin:
  - `// End of public/language_window.js`
- No hay cambios funcionales; comments-only.

Validation (static):
- Grep: `End of public/language_window.js` y `Overview`.

Reviewer assessment:
- PASS. Ahora sí respeta el formato establecido (sin “dashed rulers”) y mejora legibilidad sin riesgo de drift/timing.

Reviewer gate: PASS

#### L6 — Final review (Codex)

Decision: NO CHANGE
No Level 6 changes justified.

- Logging API: reviewed `log.error('Error setLanguage:', e)` and `log.warn('BOOTSTRAP: ...', e)` call shapes (no signature drift).
- Bootstrap flow: `loadLanguages()` + startup IIFE (`await loadLanguages()`) remains coherent; fallback assignment stays local.
- Helpers/guards: `setBusy` and event handlers consistently gate via `isBusy`; aria/class toggles remain aligned.
- Comments alignment: Overview and end-marker match the observed behavior (no drift).

Observable contract/timing preserved (no code changes).

Reviewer gate: PASS

#### L7 — Smoke (human-run; minimal)

**Estado:** PASS

**Checklist ejecutado:**

* [x] (1) Abrir la ventana de idioma (primer run o vía menú) y confirmar que la lista renderiza (no queda en blanco). (First-run: click en lista cierra la ventana y permite continuar).
* [x] (2) Filtro: escribir en `langFilter` reduce resultados; limpiar restaura. Caso 0 matches muestra placeholder **“No matches”**.
* [x] (3) Teclado:
  * desde `langFilter`, `ArrowDown` enfoca el primer item (sin crash).
  * en la lista, `ArrowUp/ArrowDown` navega y `Enter` aplica selección del item enfocado.
* [x] (4) Selección (click o Enter): se ejecuta `setLanguage(tag)` y la ventana se cierra en success; la app queda operativa (sin cuelgue).
* [x] (5) i18n sanity: tras cambiar idioma, la UI (al menos labels visibles) refleja el nuevo idioma según el flujo de i18n esperado. (REG-I18N-01).
* [x] (6) Cierre sin selección: cerrar la ventana sin elegir no debe crashear ni dejar la app en estado inválido (nota del propio archivo sobre fallback condicionado a `settings.language` vacío).
* [x] (7) Logs: sin uncaught exceptions; sin spam. En camino sano, no aparecen BOOTSTRAP warnings. (Los BOOTSTRAP warnings quedan reservados para fallback real).

---

### public/js/crono.js

Date: `2026-01-24`
Last commit: `60d3a79e7f62d1c53d2578fbe6bbc2f905c24a5d`

#### L0 — Diagnosis (no changes)

- Reading map:
  - Block order:
    - Header comment.
    - `'use strict'`.
    - IIFE start.
    - Logger: `const log = window.getLogger('crono')`.
    - Helpers: `formatCrono`, `parseCronoInput`.
    - Real WPM compute: `actualizarVelocidadRealFromElapsed` + wrapper `safeRecomputeRealWpm`.
    - UI/bridge helpers: `uiResetCrono`, `openFlotante`, `closeFlotante`, `applyManualTime`.
    - State applier: `handleCronoState`.
    - Controller factory: `createController` (bind + handlers).
    - Global export: `window.RendererCrono = { ... }`.
    - IIFE end.
  - Where linear reading breaks:
    - `createController` — nested handler cluster mixes UI wiring, state, and electron bridge.
      - Micro-quote: "const handleTextChange = async (previousText, nextText) =>".
    - `applyManualTime` — inner fallback splits control flow (electron path vs local fallback).
      - Micro-quote: "const fallbackLocal = async () =>".
    - `openFlotante` — nested async state pull after opening the flotante window.
      - Micro-quote: "if (typeof electronAPI.getCronoState === 'function')".

- Contract map:
  - Exposes: assigns `window.RendererCrono` with
    `formatCrono`, `parseCronoInput`, `actualizarVelocidadRealFromElapsed`, `uiResetCrono`,
    `openFlotante`, `closeFlotante`, `applyManualTime`, `handleCronoState`, `createController`.
  - Side effects:
    - Reads logger: `window.getLogger('crono')`.
    - Creates global `window.RendererCrono`.
  - Invariants / assumptions (anchored):
    - Crono input format is `H+:MM:SS` with MM/SS in 00–59:
      `parseCronoInput` uses "match(/^(\d+):([0-5]\d):([0-5]\d)$/)".
    - Real WPM recompute only when words and elapsed seconds are positive:
      `actualizarVelocidadRealFromElapsed` checks "if (words > 0 && secondsTotal > 0)".
    - Manual edits ignored while running:
      `applyManualTime` checks "if (running) { ... return null; }".
    - electronAPI methods are optional and guarded:
      `openFlotante` checks "typeof electronAPI.openFlotanteWindow !== 'function'".
  - IPC contract (in this file only):
    - None found: no `ipcMain.*`, `ipcRenderer.*`, or `webContents.send` occurrences.
  - Delegated IPC registration:
    - None found.

Reviewer gate: PASS (Level 0 diagnosis is adequate; anchors corrected to match file).

#### L1 — Structural refactor and cleanup (Codex)

Decision: NO CHANGE

- File already follows a clear top-to-bottom progression from helpers to UI/electron handlers to controller to export.
- Functions are cohesive and locally scoped; reordering would not materially reduce reading effort.
- Large `createController` block is the core orchestrator; splitting or reshuffling would add indirection.
- Existing early returns and guards are already minimal and directly tied to behavior and timing.
- Structural edits available are mostly cosmetic (commenting/spacing), which risks noise without payoff.

Reviewer gate: PASS (Level 1): NO CHANGE is justified; diff empty; no contract/timing risk introduced.

#### L2 — Clarity / robustness refactor (controlled) (Codex)

Decision: NO CHANGE

- Current structure already isolates edge cases with guarded checks (electron API, input parsing, running state) and avoids noisy logging.
- Duplication (e.g., WPM recompute calls and toggleVF aria updates) is minimal and inlined for clarity; helper extraction would add indirection.
- Error handling is already explicit and deduped (`log.warnOnce`, guarded try/catch), and additional handling risks changing timing or visibility.
- Parsing and formatting paths are direct and readable; making edge cases more explicit would not change decisions.
- The core controller flow is timing-sensitive and cohesive; refactoring risks subtle behavioral shifts without clear robustness gain.

Observable contract and timing/ordering were preserved.

Reviewer gate: PASS (Level 2): NO CHANGE is justified; diff empty; no contract/timing risk introduced.

#### L3 — Architecture / contract changes (exceptional; evidence-driven) (Codex)

Decision: NO CHANGE (no Level 3 justified)

- Checked public/js/crono.js: exported surface (`window.RendererCrono = { ... }`) is stable; no ambiguous contract.
- Checked public/renderer.js: controller usage (`createController`, `bind`, `handleState`, `handleTextChange`) is consistent.
- Checked electron/preload.js: IPC bridge methods (`sendCronoToggle`, `sendCronoReset`, `setCronoElapsed`, `getCronoState`) are thin and consistent with renderer expectations.
- Checked electron/main.js: IPC handlers and crono state lifecycle (`ipcMain.handle('crono-get-state')`, `ipcMain.on('crono-*')`) centralize the contract; no duplicate responsibility in renderer.
- Checked public/flotante.js: uses `RendererCrono.formatCrono` and mirrors state display; no conflicting semantics.
- No repo evidence of inconsistent payloads, duplicated ownership, or sync/async mismatches requiring contract changes.

Reviewer gate: PASS (Level 3): NO CHANGE justified; evidence cross-checked in consumers/bridge/main; diff empty.

#### L4 — Logs (policy-driven tuning after flow stabilization) (Codex)

Decision: NO CHANGE

- Existing logs already use `log.warn|warnOnce|error` directly with stable keys where needed.
- Fallbacks that are genuinely anomalous are already noisy (e.g., missing flotante API, getCronoState failure, setCronoElapsed failure).
- Remaining silent branches are normal/expected user or state paths (invalid input, running state, optional electron API), so adding logs would add noise on common UI interactions.
- No high-frequency repeated warnings without dedupe are present; only `getCronoState` is deduped appropriately.
- Messages are short and consistent with repo patterns; no obvious level mismatches.

Observable contract and timing/ordering were preserved.

Reviewer gate: PASS (Level 4): NO CHANGE justified; diff empty; logging policy compliance acceptable.

#### L5 — Comments (reader-oriented, electron/main.js style) (Codex)

Decision: CHANGED

- Added an Overview block summarizing responsibilities in concise bullets.
- Inserted section dividers to match actual blocks (logger, helpers, UI/bridge, state, controller, exports).
- Kept existing inline behavior comments; only repositioned/added section headers for navigation.
- Added an explicit end-of-file marker matching repo style.
- No functional changes; comments-only.

Reviewer gate: PASS (Level 5): Comments-only change; improves navigability; no contract/timing risk introduced.

#### L6 — Final review (coherence + leftover cleanup after refactors) (Codex)

Decision: NO CHANGE

No Level 6 changes justified.

- Checked logging API usage: `log.warn`, `log.warnOnce`, `log.error` call shapes match `public/js/log.js`.
- Checked exports/contract: `window.RendererCrono` surface unchanged and matches `public/renderer.js` usage.
- Checked comment alignment: new Overview and section dividers match actual block order; end marker present.
- Checked helpers and controller flow: no unused locals or dead branches detected in `createController` and `handleCronoState`.
- Checked Electron API guards: `openFlotante`/`closeFlotante` fallbacks remain noisy and consistent.

Observable contract and timing/ordering were preserved.

Reviewer gate: PASS (Level 6): NO CHANGE justified; post-L5 coherence verified; diff empty.

#### L7 — Smoke test (human-run; minimal)

Resultado: PASS

* [x] (1) Arranque limpio (idle 5–10s): app estable.
* [x] (2) Cargar texto no vacío (ej: 📋↺): texto vigente queda no vacío.
* [x] (3) Start/Pause: tiempo aumenta y luego queda fijo al pausar.
* [x] (4) Mientras corre: no permite edición manual del campo (o no aplica cambios).
* [x] (5) Editar tiempo válido (00:00:10) con crono pausado: queda aplicado.
* [x] (6) Editar tiempo inválido (00:99:00 / abc): se rechaza y revierte a valor válido.
* [x] (7) Abrir flotante: ventana aparece.
* [x] (8) Cerrar flotante con X: UI principal refleja “cerrado”.
* [x] (9) Texto no vacío -> otro no vacío (ej: 📋+): cronómetro NO se resetea.
* [x] (10) Texto queda vacío (vaciar): cronómetro SI se resetea a 00:00:00.

---

### public/js/format.js

Date: `2026-01-24`
Last commit: `87a315f074f8d89a237583286f42f18c4f66b19a`

#### L0 — Minimal diagnosis (Codex, verified)

Source: `tools_local/codex_reply.md` (local only; do not commit)

##### 0.1 Reading map
- Block order: file comment, `'use strict'`, IIFE wrapper, constants (`log`, `DEFAULT_LANG`, `normalizeLangTag`, `getLangBase`), helper functions (`getTimeParts`, `formatTimeFromWords`, `obtenerSeparadoresDeNumeros`, `formatearNumero`), global export (`window.FormatUtils`).
- Linear breaks: none observed; helpers are declared sequentially inside a single IIFE scope.

##### 0.2 Contract map
- Exposes: assigns `window.FormatUtils` with four functions (`getTimeParts`, `formatTimeFromWords`, `obtenerSeparadoresDeNumeros`, `formatearNumero`).
- Side effects: reads from `window` globals and logs via `log.warnOnce` on fallback paths.
- Invariants / fallbacks (anchored to checks in this file):
  - `getTimeParts` treats non-positive WPM as zero time (`if (!wpm || wpm <= 0) return { hours: 0, minutes: 0, seconds: 0 };`).
  - `obtenerSeparadoresDeNumeros` returns hardcoded defaults when no settings cache (`if (settingsCache === null) { return { separadorMiles: '.', separadorDecimal: ',' }; }`).
  - `obtenerSeparadoresDeNumeros` falls back to default language when lang key missing (`if (nf && nf[defaultKey]) { ... return nf[defaultKey]; }`).
  - `obtenerSeparadoresDeNumeros` falls back to hardcoded defaults if formatting missing (`'numberFormatting missing; using hardcoded defaults.'`).
- IPC contract: none found in this file.
  - ipcMain.handle/on/once: none
  - ipcRenderer.invoke/send/on/once: none
  - webContents.send: none
- Delegated IPC registration: none found.

Reviewer gate:
- L0 protocol: PASS (diagnosis-only; no invented IPC; invariants anchored to visible checks/fallbacks).

#### L1 — Structural refactor and cleanup (Codex)

Decision: NO CHANGE

- File is already short, linear, and scoped inside a single IIFE with helpers declared sequentially.
- Existing block order (constants → helpers → export) is coherent; reshuffling would be churn-only.
- No safe renames/extractions reduce cognitive load; any new abstraction would add indirection.
- The fallback logic in `obtenerSeparadoresDeNumeros` is already flat with early returns and minimal nesting.
- Touching this utility would risk accidental behavior drift without readability payoff.

Reviewer assessment:
- PASS for L1 gate as NO CHANGE: rationale matches the current file structure (IIFE + 4 exported helpers, no IPC, minimal branching); no contract/behavior/timing surface changed.

Reviewer gate: PASS

#### L2 — Clarity / robustness refactor (Codex)

Decision: NO CHANGE

- Module is small and already readable; additional helpers or restructuring would add indirection without reducing complexity.
- The current fallback paths in `obtenerSeparadoresDeNumeros` are already explicit and minimal, with deduped logging via `log.warnOnce`:
  - `format.numberFormatting.fallback:${langKey}`
  - `format.numberFormatting.missing`
- Edge cases are already handled with early returns and hardcoded defaults:
  - `getTimeParts`: `if (!wpm || wpm <= 0) return { hours: 0, minutes: 0, seconds: 0 };`
  - `settingsCache === null` returns `{ separadorMiles: '.', separadorDecimal: ',' }`.
- There is no IPC or startup sequencing in this file, so no safe L2 timing/ordering improvements apply.
- Potential robustness changes (numeric coercion / rounding behavior) would risk observable behavior drift.

Reviewer assessment:
- PASS for L2 gate as NO CHANGE: rationale matches the current implementation (IIFE + `window.FormatUtils`, explicit fallbacks, `warnOnce` keys). No invented IPC/contracts; no behavior/timing surface changed.

Reviewer gate: PASS

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- `public/renderer.js`: destructure guard `window.FormatUtils || {}` and missing-functions log.
- `public/renderer.js`: call sites rely on current API:
  - `await obtenerSeparadoresDeNumeros(idioma, settingsCache)`
  - `formatearNumero(...)`
  - `getTimeParts(...)`
- `public/js/crono.js`: dependency injection in `createController` (`deps.obtenerSeparadoresDeNumeros`, `deps.formatearNumero`).
- `public/js/crono.js`: downstream usage via `safeRecomputeRealWpm({ ..., obtenerSeparadoresDeNumeros, formatearNumero, ... })`.
- `public/js/format.js`: export surface `window.FormatUtils = { getTimeParts, formatTimeFromWords, obtenerSeparadoresDeNumeros, formatearNumero }`.
- No evidence of inconsistent semantics, IPC contract, or cross-module instability requiring a contract change.

Reviewer assessment:
- PASS: Consumers (`renderer.js`, `crono.js`) consistently use the current surface; no repro pain or instability observed that would justify Level 3 changes.

Reviewer gate: PASS

#### L4 — Logs (Codex)

Decision: CHANGED

- Change: `obtenerSeparadoresDeNumeros` ahora emite un `log.warnOnce(...)` cuando `settingsCache === null`, antes de usar separadores hardcodeados.
  - Gain: elimina un fallback silencioso; cumple “no silent fallbacks” sin sobre-loggear (dedupe por key estable).
  - Cost: +1 sitio de log y +1 key estable a mantener.
  - Validation:
    - Grep: `format.numberFormatting.settingsCacheNull`
    - Manual: forzar/ejecutar una llamada con `settingsCache === null` y verificar que el warning aparece una sola vez por sesión.

Observable contract/timing preserved: solo cambió el output de logs en un branch de fallback.
Reviewer assessment: PASS (log-only; key estable; severidad coherente).
Reviewer gate: PASS

#### L5 — Comments (Codex)

Decision: CHANGED

- Change: Added reader-oriented comment scaffolding aligned with repo style:
  - "Overview" + responsibilities (English, ASCII).
  - Section dividers (`// =============================================================================`) matching the real block order (logger/globals, time helpers, number helpers, exports).
  - Explicit end-of-file marker ("End of public/js/format.js").
- No functional changes; comments-only.

Reviewer assessment: PASS (comments-only; improves scanability; section headers match actual structure; ASCII-only constraint satisfied).
Reviewer gate: PASS

#### L6 — Final review (Codex)

Decision: NO CHANGE
No Level 6 changes justified.
- Checked helpers for unused locals/params and duplicated checks; none found.
- Checked exports surface `window.FormatUtils` against current helper names; consistent.
- Checked logging API usage (`log.warnOnce` signature) against `public/js/log.js`; correct.
- Checked fallback paths for return shapes and invariants; all return `{ separadorMiles, separadorDecimal }`.
- Checked comments vs code sections; labels match actual blocks and behavior.
Observable contract and timing were preserved.

Reviewer assessment:
- PASS for L6: NO CHANGE es consistente con el estado del archivo.
- Nota: el reporte NO CHANGE no incluyó anchors; y “all return shapes” es una sobre-afirmación (depende de `settingsCache.numberFormatting`).
Reviewer gate: PASS

#### L7 — Smoke (human-run; minimal)

**Estado:** PASS

**Preconditions**

* App launches normally; open DevTools Console to observe renderer logs.
* Use any non-trivial sample text (enough to exceed 1,000 words once) to make thousands separators visible.
* Ensure main window (renderer) is the active UI.

* [x] **(1) Startup sanity: FormatUtils present**

  * **Action:** Launch the app and wait for the main window to fully render.
  * **Expected result:** No renderer error indicating `FormatUtils` is missing; UI remains usable.
  * **Evidence:** `public/renderer.js` destructures from `window.FormatUtils || {}` and has an explicit “missing functions” log guard. 

* [x] **(2) Results formatting: thousands separators on counts**

  * **Action:** Paste/append a large text so word count is > 1000. Observe the “chars / chars w/o space / words” fields.
  * **Expected result:** Counts render with a thousands separator (e.g., `1.234` under a `.` thousands convention); no “NaN”, no blank results.
  * **Evidence:** renderer formats `stats.*` via `formatearNumero(...)` after fetching separators via `await obtenerSeparadoresDeNumeros(idioma, settingsCache)`. 

* [x] **(3) Reading time consistency: WPM changes update time**

  * **Action:** Change WPM (slider/input in UI) and observe the “time” result update.
  * **Expected result:** Time updates deterministically; never shows NaN/undefined; if WPM is 0/invalid, time falls back to `0h 0m 0s`.
  * **Evidence:** time path uses `getTimeParts(stats.palabras, wpm)`; `getTimeParts` explicitly guards `!wpm || wpm <= 0`. 

* [x] **(4) Language switching: number formatting still works**

  * **Action:** Switch UI language (via your normal language selector flow). Re-check counts and time.
  * **Expected result:** Counts/time still render; no breakage. If your `settingsCache.numberFormatting` lacks the selected `langKey`, you may see a single warnOnce about fallback-to-default; otherwise, no warning is required on the healthy path.
  * **Evidence:** fallback warnOnce bucket: `format.numberFormatting.fallback:${langKey}` and default selection logic. 

* [x] **(5) Controlled fallback visibility: `settingsCache === null` warns once (console)**

  * **Action:** In DevTools Console, run:

    * `await window.FormatUtils.obtenerSeparadoresDeNumeros('es', null)`
    * Run it **twice**.
  * **Expected result:** First call logs **one** warning about `settingsCache null; using hardcoded defaults.`; second call does **not** repeat (dedupe). Return value is `{ separadorMiles: '.', separadorDecimal: ',' }`.
  * **Evidence:** `log.warnOnce('format.numberFormatting.settingsCacheNull', ...)` + hardcoded defaults. 

* [x] **(6) Stopwatch integration: real WPM renders and uses formatted number**

  * **Action:** Start the stopwatch, let it run briefly, then pause. Ensure there is non-empty text in the app so WPM can be computed.
  * **Expected result:** `realWpmDisplay` shows a formatted integer + “WPM” (or blank if words/time are zero); no exceptions.
  * **Evidence:** `actualizarVelocidadRealFromElapsed` computes `realWpm`, fetches separators, then `formatearNumero(realWpm, ...)` and writes `${velocidadFormateada} WPM`. 

* [x] **(7) Stopwatch manual edit path: recompute WPM after blur**

  * **Action:** With the stopwatch **not running**, focus the crono display field, type a valid time (e.g., `00:02:00`), press Enter (or blur).
  * **Expected result:** Time is accepted; real WPM recomputes and updates; invalid input restores baseline without crashing.
  * **Evidence:** `applyManualTime` routes through `safeRecomputeRealWpm(...)` on blur/fallbackLocal; controller binds blur to `applyManualTime`. 

* [x] **(8) Log sanity: no spam**

  * **Action:** Repeat steps (2)–(7) quickly (paste text, change WPM, pause/unpause once).
  * **Expected result:** No uncaught exceptions; no repeated spam. Any warnOnce-based fallbacks appear at most once per dedupe bucket.
  * **Evidence:** warnOnce keys in `obtenerSeparadoresDeNumeros` are stable (`settingsCacheNull`, `fallback:<langKey>`, `missing`). 

---

### public/js/count.js

Date: `2026-01-24`
Last commit: `c040f4a4b0270312bd58e56e3e41d2f317d0d04e`

#### L0 — Minimal diagnosis (Codex, verified)

Source: `tools_local/codex_reply.md` (local only; do not commit)

##### 0.1 Reading map
- Block order: IIFE wrapper; constants/config (`DEFAULT_LANG`, `HYPHEN_JOINERS`, `RE_ALNUM_ONLY`); helpers (`contarTextoSimple`, `hasIntlSegmenter`, `isHyphenJoinerSegment`, `isAlnumOnlySegment`, `contarTextoPrecisoFallback`, `contarTextoPreciso`); main entry (`contarTexto`); export/side effect (`window.CountUtils` assignment).
- Linear reading breaks:
  - `RE_ALNUM_ONLY` feature detection split by try/catch: `try { RE_ALNUM_ONLY = /^[\p{L}\p{N}]+$/u; }`
  - `contarTextoPreciso` stateful loop for hyphen-join logic: `let prevWasJoinableWord = false`
  - `contarTextoPreciso` conditional increment path: `if (!(pendingHyphenJoin && joinable)) { palabras += 1; }`
  - `contarTexto` mode normalization gate: `opts.modoConteo === 'simple' ? 'simple' : 'preciso'`

##### 0.2 Contract map
- Exposed API / side effects:
  - Exposes `window.CountUtils` with `{ contarTextoSimple, contarTextoPrecisoFallback, contarTextoPreciso, contarTexto, hasIntlSegmenter }`.
  - Side effect: attaches `CountUtils` on `window` inside an IIFE.
- Invariants and fallbacks (anchored to checks):
  - Mode defaults to `"preciso"` unless exactly `"simple"`: `opts.modoConteo === 'simple' ? 'simple' : 'preciso'`.
  - Language defaults to `DEFAULT_LANG` when falsy: `const idioma = opts.idioma || DEFAULT_LANG`.
  - Precise counting falls back when `Intl.Segmenter` missing: `if (!hasIntlSegmenter()) { return contarTextoPrecisoFallback(texto); }`.
  - Words are 0 for empty/whitespace-only input in simple/fallback: `texto.trim() === '' ? 0`.
  - Hyphen joining only applies when previous segment is joinable and a joiner: `isHyphenJoinerSegment(seg.segment) && prevWasJoinableWord`.
- IPC contract:
  - No `ipcMain` / `ipcRenderer` / `webContents` usage found in this file.
  - No delegated IPC registration helpers called in this file.

Reviewer gate:
- L0 protocol: PASS (diagnosis-only; no invented IPC; invariants anchored to visible checks/fallbacks).

#### L1 — Structural refactor and cleanup (Codex)

Decision: CHANGED

- Reordered top-level blocks into a clearer “constants → predicate helpers → counting strategies → main entry → export” reading flow.
- Moved `hasIntlSegmenter()` below the regex capability setup to keep feature-detection close to other capability definitions.
  - Anchor: `function hasIntlSegmenter()` (moved) + `RE_ALNUM_ONLY = /^[\p{L}\p{N}]+$/u;`
- Grouped predicate helpers immediately after the shared constants.
  - Anchors: `function isHyphenJoinerSegment(s)` / `function isAlnumOnlySegment(s)`
- Positioned the counting strategies more linearly by moving `contarTextoSimple(texto)` below the predicate helpers.
  - Anchor: `function contarTextoSimple(texto)`
- Kept the public API assignment as the explicit end-of-file side-effect boundary.
  - Anchor: `window.CountUtils = {`

Contract/behavior/timing preserved as-is (structural move only; function bodies unchanged per diff).

Reviewer assessment:
- PASS: Changes are pure reordering of function declarations within a single IIFE; `window.CountUtils` surface remains the same.

Reviewer gate: PASS

#### L2 — Clarity / robustness refactor (Codex)

Decision: NO CHANGE

Rationale (Codex):
- File already follows a clear constants → helpers → strategies → entrypoint → export flow with minimal nesting.
- Remaining duplication is small/local; extracting helpers would add indirection without meaningful clarity payoff.
- Edge cases and fallbacks are already explicit (Intl.Segmenter absence; whitespace-only input).
- Logic is straightforward and heavily commented; Level 2 edits risk adding noise without benefits.
- Adding guards/coercion for non-string inputs could alter observable behavior for callers.

Reviewer assessment:
- PASS: NO CHANGE is appropriate; the module already has explicit fallbacks and a stable `window.CountUtils` surface.

Reviewer gate: PASS

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- `public/renderer.js` requires CountUtils: `const { contarTexto: contarTextoModulo } = window.CountUtils || {};`
- `public/renderer.js` hard-fails if missing: `throw new Error('[renderer] CountUtils no disponible; no se puede continuar');`
- `public/renderer.js` call shape (module boundary): `return contarTextoModulo(texto, { modoConteo, idioma: idiomaActual });`
- `public/renderer.js` return-shape use: `formatearNumero(stats.palabras, separadorMiles, separadorDecimal)`
- `public/js/crono.js` DI consumer (`actualizarVelocidadRealFromElapsed`): `const stats = contarTexto(currentText);`
- `public/js/crono.js` return-shape dependency: `const words = stats?.palabras || 0;`
- `public/js/count.js` export surface: `window.CountUtils = {`

Reviewer notes:
- `public/js/crono.js` consumes `contarTexto` via dependency injection (parameter), not via `window.CountUtils`.

No observable contract/timing changes were made.

Reviewer assessment:
- PASS: No strong evidence of cross-module contract pain or ambiguity requiring Level 3.

Reviewer gate: PASS

#### L4 — Logs (Codex)

Decision: CHANGED

- Added renderer logger handle for this module (uses `window.getLogger('count')`) to emit policy-compliant warnings from fallback paths.
  - Anchor: `window.getLogger('count')`.
  - Validation: ensure `public/index.html` loads `./js/log.js` before `./js/count.js`.

- Made Unicode-regex capability fallback non-silent (warn) when `\p{L}/\p{N}` property escapes are unavailable.
  - Anchor: "Unicode property escapes unsupported; using ASCII alnum fallback."

- Made Intl.Segmenter fallback non-silent and deduplicated (warnOnce) to avoid spamming on repeated count calls.
  - Anchor: `warnOnce('count.intl-segmenter-missing', ...)`.

Observable contract and timing preserved (logging-only change).

Reviewer assessment:
- PASS. Change is log-only and uses `warnOnce(key, ...)` consistent with renderer logger API. Note: if `count.js` were ever loaded without `log.js`, the warnings could be silent (because `log` may be null), but `public/index.html` loads `log.js` earlier in the main window.

Reviewer gate: PASS

#### L5 — Comments (Codex)

Decision: CHANGED

- Added an "Overview" block describing the module responsibilities (renderer-side counting utilities exposed via `window.CountUtils`).
- Inserted section dividers matching the real file structure:
  - Logger and constants/config
  - Helpers (feature detection + predicates)
  - Counting strategies
  - Public entry point
  - Exports / module surface
- Added an explicit end-of-file marker: `End of public/js/count.js`.
- ASCII-only note: One deliberate exception kept for the hyphen-join example (`3–4`), accepted as an explicit project-local exception for this file.

No functional changes; comments-only. Observable contract/timing preserved.

Reviewer assessment:
- PASS: Comments improve navigability and align with the repo’s section-divider style; no behavior changes.

Reviewer gate: PASS

#### L6 — Final review (manual)

Decision: NO CHANGE

Findings:
- Rejected the proposed L6 change from Codex that prefixed a capability-degradation warning with `BOOTSTRAP:`:
  - Change proposed: `log.warn('BOOTSTRAP: Unicode property escapes unsupported; using ASCII alnum fallback.');`
  - Reason: This is not a transient pre-init fallback; it reflects a permanent engine capability limitation for the session. Using `BOOTSTRAP:` would be semantically incorrect per logging policy.
- No other Level 6 cleanup warranted (no dead code, no stale patterns introduced by Levels 1–5, and logging API usage remains consistent).

Observable contract/timing preserved (no code changes applied).

Reviewer gate: PASS

#### L7 — Smoke (human-run; minimal, dev)

**Estado:** PASS

**Preconditions**

* App launches normally; main window fully rendered.
* DevTools Console visible (renderer).
* Use the console for direct calls to `window.CountUtils` (this file’s surface).

* [x] **(1) Startup sanity: CountUtils present**

  * **Action:** Launch the app and wait for idle (5–10s).
  * **Expected result:** No renderer hard-fail about CountUtils missing; UI remains usable.
  * **Evidence:** `public/renderer.js` requires `window.CountUtils` and throws if absent.

* [x] **(2) Contract sanity: return shape + defaults**

  * **Action (DevTools Console):**
    * `window.CountUtils.contarTexto('one two three', { modoConteo: 'preciso', idioma: 'en' })`
    * `window.CountUtils.contarTexto('one two three', { modoConteo: 'simple', idioma: 'en' })`
  * **Expected result:** Both calls return an object with numeric `{ conEspacios, sinEspacios, palabras }` and `palabras === 3`.
  * **Evidence (count.js):** `contarTexto(...)` returns `{ conEspacios, sinEspacios, palabras }` and normalizes `modoConteo` / defaults `idioma`.

* [x] **(3) Hyphen join behavior (precise mode)**

  * **Action (DevTools Console):**
    * `window.CountUtils.contarTexto('test e-mail 3–4', { modoConteo: 'preciso', idioma: 'en' })`
  * **Expected result:** `palabras === 3` (treats `e-mail` as 1 and `3–4` as 1).
  * **Evidence (count.js):** hyphen joiners (`HYPHEN_JOINERS`) + join logic in `contarTextoPreciso(...)`.

* [x] **(4) Intl.Segmenter fallback warning is deduped (warnOnce)**

  * **Action (DevTools Console):**
    * Try to simulate missing Segmenter:
      - `const __oldSeg = Intl.Segmenter;`
      - `Intl.Segmenter = undefined;`
      - `window.CountUtils.contarTextoPreciso('one two', 'en');`
      - `window.CountUtils.contarTextoPreciso('one two', 'en');`
      - `Intl.Segmenter = __oldSeg;`
  * **Expected result:**
    * Both calls return a valid `{ conEspacios, sinEspacios, palabras }`.
    * Exactly one warning is emitted for the fallback (deduped) with key `count.intl-segmenter-missing`.
  * **Notes:** If `Intl.Segmenter` is read-only in your runtime, skip the simulation and only verify the key exists via in-file search.
  * **Evidence (count.js):** `log.warnOnce('count.intl-segmenter-missing', ...)` inside the `!hasIntlSegmenter()` branch.

* [x] **(5) Crono integration: real WPM path depends on `.palabras`**

  * **Action:** Ensure current text is non-empty (preferably > 20 words). Start the stopwatch, let it run ~10 seconds, then pause.
  * **Expected result:** “Real WPM” renders a numeric value (not blank), and no console errors occur during recompute.
  * **Evidence (public/js/crono.js):** `actualizarVelocidadRealFromElapsed` computes `const words = stats?.palabras || 0;`.

* [x] **(6) No noisy logging on healthy paths**

  * **Action:** Update/append text several times in normal operation (with Intl.Segmenter available).
  * **Expected result:** No repeated warnings from count.js on each update; count.js remains quiet on healthy paths (warnings only on genuine fallback/degradation).
  * **Evidence:** count.js logs only on fallback branches (Unicode-regex fallback; Intl.Segmenter missing via warnOnce).

---

### public/js/presets.js

Date: `2026-02-08`
Last commit: `cfc9580868fc95914119e9d1ef1fcc8d9f49be33`

#### L0 — Minimal diagnosis (Codex, verified)

Source: `tools_local/codex_reply.md` (local only; do not commit)

##### 0.1 Reading map
- Block order: IIFE wrapper → top-level deps (`log`, `DEFAULT_LANG`, `getLangBase`) → helpers (`combinePresets`, `fillPresetsSelect`, `applyPresetSelection`) → async loaders (`loadPresetsIntoDom`, `resolvePresetSelection`) → global export (`window.RendererPresets`).
- Linear breaks / obstacles (anchors/micro-quotes):
  - `loadPresetsIntoDom` — settings snapshot fallback: `settings && typeof settings === 'object'`
  - `resolvePresetSelection` — duplicated snapshot pattern: `settings && typeof settings === 'object'`
  - `resolvePresetSelection` — persistence side effect interleaved: `electronAPI.setSelectedPreset(selected.name)`

##### 0.2 Contract map
- Exposed API / side effects:
  - Exposes `window.RendererPresets` with `{ combinePresets, fillPresetsSelect, applyPresetSelection, loadPresetsIntoDom, resolvePresetSelection }`.
  - Side effects: creates `log` via `window.getLogger('presets')`, reads `window.AppConstants` and `window.RendererI18n`, assigns `window.RendererPresets`.
- Invariants and fallbacks (anchored to checks in this file):
  - `loadPresetsIntoDom` requires `electronAPI` (throws): `throw new Error('electronAPI requerido`
  - Language base falls back to default: `getLangBase(...) || DEFAULT_LANG`
  - Missing preset arrays tolerated: `: []` (e.g., `presets_by_language`, `disabled_default_presets`)
  - Selection fallback when missing: `p.name === 'default') || list[0]`
  - Description fallback: `preset.description || ''`
  - Empty selection clears UI: `selectEl.selectedIndex = -1`
- IPC contract: none found in this file.
  - ipcMain.handle/on/once: none
  - ipcRenderer.invoke/send/on/once: none
  - webContents.send: none
- Delegated IPC registration: none found.

Reviewer gate:
- L0 protocol: PASS (diagnosis-only; no invented IPC; invariants anchored to visible checks/fallbacks).

Reviewer assessment (sufficiency & inference quality):
- PASS (correct block order + contract; anchors valid; note: “main interaction” is via injected `electronAPI`, not direct IPC in this file).

#### L1 — Structural refactor and cleanup (Codex)

Decision: NO CHANGE

- The file already follows a clear, linear structure (deps → helpers → async flows → export) with minimal jumps.
- The only visible duplication is the `settingsSnapshot` initialization in two functions; extracting a helper would add indirection without reducing branches or improving readability.
- Control flow is already flat with early returns where appropriate; further restructuring risks obscuring the timing and persistence paths.
- The existing grouping keeps DOM updates and persistence side effects adjacent to selection logic, which aids reasoning about behavior.

Reviewer assessment:
- PASS for L1 gate as NO CHANGE: rationale aligns with the observed linear structure and minimal duplication; “timing risk” is somewhat generic here (module is mainly function declarations + a global export), but NO CHANGE remains a reasonable Level 1 outcome.

#### L2 — Clarity / robustness refactor (Codex)

Decision: CHANGED

- Change 1: Extract `normalizeSettings(settings, language)` and reuse it to replace the duplicated settings snapshot fallback in:
  - `loadPresetsIntoDom` — `settings && typeof settings === 'object'`
  - `resolvePresetSelection` — `settings && typeof settings === 'object'`
  - Gain: centralizes a repeated edge-case fallback; reduces duplication in two async entrypoints.
  - Cost: adds one small helper indirection.
  - Validation:
    - Static: confirm both previous fallback blocks are replaced by the helper and that the fallback literal preserves `{ language, presets_by_language: {}, selected_preset_by_language: {} }`.
    - Manual: open app → change preset → confirm presets list loads and selection persists as before.

- Change 2: Make current preset name trimming single-pass (`trimmedCurrent`) and make `hasCurrent` an explicit boolean.
  - Gain: clearer selection path; avoids repeated `.trim()` and implicit string-truthiness.
  - Cost: adds 1–2 local variables.
  - Validation:
    - Static: confirm `selectedName` remains `persisted || (hasCurrent ? trimmedCurrent : '')` and the “no selection” warnOnce branch is unchanged in behavior.

Observable contract, side effects, and timing/ordering are preserved.

Reviewer assessment:
- PASS for L2 gate: Change 1 removes a literal duplication that exists twice in-file, without altering fallback shape; Change 2 is truthiness-equivalent to the current `hasCurrent`/`selectedName` logic and does not alter side effects (selection + persistence remain in the same ordering).

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- `public/js/presets.js` no IPC directo; dependencia por bridge: `if (!electronAPI) throw new Error('electronAPI requerido`
- `public/js/presets.js` llamada a main para defaults: `defaults = await electronAPI.getDefaultPresets()`
- `public/js/presets.js` persistencia de selección: `await electronAPI.setSelectedPreset(selected.name)`
- `public/js/presets.js` return shape del loader: `return { list: finalList };`
- `public/renderer.js` consumo de `RendererPresets`: `const { applyPresetSelection, loadPresetsIntoDom, resolvePresetSelection } = window.RendererPresets || {};`
- `public/renderer.js` call sites: `await loadPresetsIntoDom({ ... })` y `await resolvePresetSelection({ ... })`
- `electron/preload.js` bridge: `getDefaultPresets: () => ipcRenderer.invoke('get-default-presets')`
- `electron/presets_main.js` handler: `ipcMain.handle('get-default-presets', () => {`

No observable contract/timing changes were made.

Reviewer assessment:
- PASS: No evidence of cross-module contract ambiguity or consumer mismatch requiring Level 3.

Reviewer gate: PASS

#### L4 — Logs (policy-driven tuning after flow stabilization) (Codex)

Decision: NO CHANGE

- Uses renderer logger via `window.getLogger('presets')`; no local log aliases/wrappers.
- Fallback logs exist on selection degradation paths via `log.warnOnce` with explicit stable keys and controlled `:${lang}` variant suffix.
- Caught-exception fallbacks are logged with `log.error` (getDefaultPresets failure; selected preset persistence failure), while preserving best-effort behavior.
- No window-send races (`webContents.send`) or direct IPC sites exist in this file, so “failed (ignored)” style is not applicable.
- Additional logs for frequent normalization/defaulting (e.g., `normalizeSettings`) would add noise on healthy paths and are treated as contract-tolerated inputs.

Observable contract/timing preserved (no code changes).

Reviewer assessment:
- PASS: Logging sites follow call-site style; warnOnce keys are explicit and controlled; no clear policy breach that warrants L4 changes.
Reviewer gate: PASS

#### L5 — Comments (reader-oriented, electron/main.js style) (Codex)

Decision: CHANGED (comments-only)

- Added an Overview block with a concise responsibilities list.
- Inserted section dividers aligned to the real block order (deps/logger, helpers, async flows, exports).
- Added an explicit end-of-file marker ("End of public/js/presets.js").
- English + ASCII-only comments.

No functional changes; comments-only.

Reviewer assessment:
- PASS: Comments-only change; improves navigability without changing semantics/contract/timing.

Reviewer gate: PASS

#### L6 — Final review (coherence + leftover cleanup after refactors) (Codex)

Decision: NO CHANGE

No Level 6 changes justified.

- Checked `public/js/presets.js` `normalizeSettings` usage for duplicated guards or unused locals; both call sites use it consistently.
- Checked `public/js/presets.js` `combinePresets` and return shape (`return { list: finalList };`) against `public/renderer.js` call sites (`loadPresets`, `reloadPresetsList`).
- Checked logging calls in `resolvePresetSelection` for `warnOnce` signature compliance and stable keys (`presets.selectedPreset.none:${lang}`, `presets.selectedPreset.missing:${lang}`).
- Checked error logging in `loadPresetsIntoDom` / `resolvePresetSelection` for policy-aligned usage (`log.error(...)` in caught failures; best-effort behavior preserved).
- Checked comments added in Level 5 against actual code blocks and behavior; no drift found.

Observable contract and timing were preserved (no code changes).

Reviewer assessment:
- PASS: L6 checks are consistent with the current file; no leftover refactor artifacts detected; logging signatures/keys match `public/js/log.js` policy.

Reviewer gate: PASS

#### L7 — Smoke test (humano)

Result: PASS

Checklist (source: `docs/test_suite.md`, REG-PRESETS):
- [x] REG-PRESETS-01 Create preset: selecting it updates WPM + time estimate.
- [x] REG-PRESETS-02 Edit preset: updated WPM is applied when selected.
- [x] REG-PRESETS-03 Change language: preset list reflects language base (user preset from other language not shown).
- [x] REG-PRESETS-04 Delete preset: selection falls back safely (e.g., `default` or first available) and UI remains consistent.
- [x] REG-PRESETS-06 Restore defaults: list repopulates; selection remains valid or falls back safely.
- [x] REG-PRESETS-07 Persistence across sessions: selected preset persists per language base and is reapplied on relaunch.

---

### public/js/menu_actions.js

Date: `2026-02-08`
Last commit: `ae1d04c5b86007f50afb41459f38454565b6c64f`

#### L0 — Minimal diagnosis (Codex, verified)

Source: `tools_local/codex_reply.md` (local only; do not commit)

##### 0.1 Reading map
- Block order: file comment, `'use strict'`, IIFE wrapper, logger + state (`log`, `registry`, `_unsubscribeMenuClick`), public helpers (`registerMenuAction`, `unregisterMenuAction`, `listMenuActions`), dispatcher (`handleMenuClick`), listener bootstrap (`setupListener` + conditional `DOMContentLoaded` retry), global API exposure (`window.menuActions`).
- Where linear reading breaks:
  - `setupListener`: changes from registry concerns to environment probing / error handling and early returns. Micro-quote: “`if (_unsubscribeMenuClick) {`”.
  - `window.menuActions.stopListening`: lifecycle control defined inside the exported object, separate from setup flow. Micro-quote: “`stopListening() {`”.

##### 0.2 Contract map
- Exposed module surface / side effects:
  - Side effects: calls `setupListener()` immediately; if it fails, registers a `DOMContentLoaded` retry (`if (!setupListener()) { ... }`); assigns `window.menuActions = { ... }`.
  - Public API on `window.menuActions`: `registerMenuAction`, `unregisterMenuAction`, `listMenuActions`, `stopListening`, `_internal._getUnsubscribeRef`.
- Invariants / fallbacks (anchored to checks/fallbacks in this file):
  - `registerMenuAction` requires `payload` to be a non-empty string. Anchor: “`typeof payload !== 'string' || !payload.trim()`”.
  - `registerMenuAction` requires `callback` to be a function. Anchor: “`typeof callback !== 'function'`”.
  - Listener bootstrap is idempotent only when an unsubscribe handle exists. Anchor: “`if (_unsubscribeMenuClick) {`”.
  - Missing unsubscribe is tolerated with a deduped warning. Anchor: “`onMenuClick did not return unsubscribe`”.
  - `stopListening` calls unsubscribe only when it is a function. Anchor: “`typeof _unsubscribeMenuClick === 'function'`”.
- IPC contract (only what exists in this file):
  - No explicit `ipcMain.*`, `ipcRenderer.*`, or `webContents.send` calls in this file.
- Delegated registration:
  - `window.electronAPI.onMenuClick(handleMenuClick)` delegates listener registration to the preload API (channels not present in this file).

Reviewer gate:
- L0 protocol: PASS (diagnosis-only; no invented IPC; invariants anchored to visible checks/fallbacks).

#### L1 — Structural refactor (Codex)

Decision: CHANGED

- Added small section comments to label major blocks (public API helpers / internal handler / init retry) without touching logic.
- Flattened `setupListener` by hoisting `const api = window.electronAPI` and returning early when `api.onMenuClick` is unavailable (reduced nesting; same success/failure outcomes).
- Preserved existing early-exit when `_unsubscribeMenuClick` is already set (keeps “idempotent only when unsubscribe exists” behavior).
- Preserved try/catch scope and the warnOnce path when `onMenuClick` does not return an unsubscribe function.

Risk: Very low. `electronAPI` is exposed as a stable object (`contextBridge.exposeInMainWorld('electronAPI', api)`), and `onMenuClick` returns an unsubscribe function in the preload implementation.
Validation: N/A (structural-only; contract/timing preserved).

Reviewer assessment (sufficiency & inference quality):
- PASS. Changes are local, behavior-preserving, and do not introduce or assume any IPC surface beyond the existing preload delegate.
- Minor wording mismatch in Codex summary: “section headers/grouping” is mostly limited to small inline comments in the diff shown.

Reviewer gate: PASS

#### L2 — Clarity / robustness refactor (Codex)

Decision: NO CHANGE

- File is already short and linear; additional L2 refactors would be mostly cosmetic rather than a net clarity/robustness gain.
- Validation and error handling are already explicit at the two main risk points (`registerMenuAction` input checks + `setupListener` try/catch + warnOnce fallback).
- Centralizing logging or “no-unsubscribe” handling into a helper would add indirection without reducing branches.
- Tweaking `handleMenuClick` guard paths would likely change observable logging semantics (warn/error), so it is avoided.
- The DOMContentLoaded retry path is plausibly timing-sensitive; changes there carry risk for minimal benefit.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

Reviewer assessment (sufficiency & inference quality):
- PASS. “NO CHANGE” is defensible given explicit guards, deduped warnings, and timing-sensitive init/retry behavior already being clear in-file.

#### L3 — Architecture / contract changes (exceptional; evidence-driven) (Codex)

- Decision (Codex): NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- `electron/menu_builder.js`: sender de la acción vía `mainWindow.webContents.send('menu-click', payload)`.
- `preload.js`: puente preload que registra `ipcRenderer.on('menu-click', handler)` y retorna unsubscribe que remueve el listener.
- `public/renderer.js`: consumidor que registra acciones usando `registerMenuActionGuarded` → `window.menuActions.registerMenuAction(...)`.
- `public/js/menu_actions.js`: contrato local estable (registro/listado de handlers + dispatch por `handleMenuClick`), y consumo delegado de `api.onMenuClick(handleMenuClick)` (sin IPC directo).

Reviewer assessment (sufficiency & inference quality):
- PASS (NO CHANGE). El reporte satisface el gate: buscó evidencia repo-wide de “dolor real”/contrato inestable y lo que afirma es consistente con los callsites observables.
- No hay base para cambio de arquitectura/contrato: la ruta `menu-click` es única y el módulo `menu_actions.js` mantiene una API mínima y consistente.

Reviewer gate: PASS.

#### L4 — Logs (policy-driven tuning after flow stabilization) (Codex re-pass)

Decision: CHANGED

Changes (logging-only):
- BOOTSTRAP fallback is no longer silent: when the initial `setupListener()` fails, emit:
  - `log.warn('BOOTSTRAP: menuActions: onMenuClick not available yet; retrying at DOMContentLoaded')`
- DOMContentLoaded retry fallback is no longer silent: if the retry still fails, emit:
  - `log.warn('menuActions: onMenuClick unavailable after DOMContentLoaded; menu clicks will not be handled')`
- Removed once-variants where high-frequency repeatability is not justified under the L4 rule:
  - `log.warnOnce('menu_actions:onMenuClick:no_unsubscribe', ...)` → `log.warn(...)` (key removed)
  - `log.warnOnce('menu_actions:stopListening:no_unsubscribe', ...)` → `log.warn(...)` (key removed)
- Fixed debug typo: `unscribed` → `unsubscribed`.

Risk:
- Logging-only. Potential increase in warning volume if `stopListening()` (or no-unsubscribe) repeats; accepted per strict “once-variants ONLY when high-frequency repeatable” rule.

Validation (manual/grep):
- Grep keys removed (should be 0 hits after apply):
  - `rg -n -F "menu_actions:onMenuClick:no_unsubscribe" public/js/menu_actions.js`
  - `rg -n -F "menu_actions:stopListening:no_unsubscribe" public/js/menu_actions.js`
- Grep BOOTSTRAP marker (should be 1 hit after apply):
  - `rg -n -F "BOOTSTRAP: menuActions: onMenuClick not available yet" public/js/menu_actions.js`
- Grep typo fix:
  - `rg -n -F "listener unsubscribed correctly" public/js/menu_actions.js`
- Runtime smoke:
  - Simulate missing `window.electronAPI` at first pass to see BOOTSTRAP warn, then keep it missing through DOMContentLoaded to see the second warn.

Reviewer assessment: PASS
- Addresses the only real L4 gap (silent fallback on retry) and adds BOOTSTRAP labeling without adding noise on healthy paths.
- Dedupe removal is consistent with the strict “once-variants ONLY when high-frequency repeatable” interpretation used for this file.

Reviewer gate: PASS

#### L5 — Comments (reader-oriented, electron/main.js style) (Codex)

Decision: CHANGED

- Added a concise ASCII-only "Overview" block at top with 3–7 responsibility bullets (new-reader oriented).
- Added visible section dividers aligned to the file’s real blocks (Logger/shared state, Public API helpers, handler/registration, Bootstrapping, Exports).
- Replaced/trimmed redundant inline comments in favor of intent/constraints (unsubscribe semantics, teardown purpose).
- Clarified `_internal` as debug-only exposure (constraint note to reduce misuse).
- Added an explicit end-of-file marker: "End of public/js/menu_actions.js".

No functional changes; comments-only.

Reviewer gate: PASS

#### L6 — Final review (coherence + leftover cleanup after refactors) (Codex)

Decision: NO CHANGE

No Level 6 changes justified.

- Checked logging API usage: only `log.debug|warn|error` are used; no key is passed to non-once methods (see BOOTSTRAP warn and other warn sites).
- Checked bootstrap classification: `BOOTSTRAP:` appears only on the pre-DOM retry path; post-DOM retry failure is a normal warn.
- Checked listener registration flow: `setupListener()` guard (`if (_unsubscribeMenuClick)`) + early return when `electronAPI.onMenuClick` is unavailable + try/catch remain consistent.
- Checked module surface: `window.menuActions` still exposes `registerMenuAction`, `unregisterMenuAction`, `listMenuActions`, `stopListening`, and `_internal._getUnsubscribeRef` with the same shapes.
- Checked comment alignment: Overview, section dividers, and end-of-file marker match actual block order and behavior.

Observable contract and timing/ordering were preserved (no changes made).

Reviewer gate: PASS (Level 6): NO CHANGE justified; post-L5 coherence verified; diff empty.

#### L7 — Smoke test (humano) — `public/js/menu_actions.js` (menu-click routing)

Result: PASS

Checklist (source: `docs/test_suite.md`, REG-MENU + file-specific sanity):
- [x] (1) Startup sanity: `window.menuActions` existe y expone funciones esperadas (DevTools):
      - `typeof window.menuActions.registerMenuAction === 'function'`
      - `Array.isArray(window.menuActions.listMenuActions()) === true`
- [x] (2) Menu routing sanity (happy path): Menu -> Guia basica (`guia_basica`) abre el modal de info y muestra contenido (REG-MENU-01).
- [x] (3) Menu routing sanity (happy path): Menu -> Instrucciones (`instrucciones_completas`) y luego FAQ (`faq`) abren el modal y navegan a la seccion correcta (REG-MENU-01).
- [x] (4) About: Menu -> Acerca de (`acerca_de`) abre modal; version/entorno hidratan o muestran N/A sin crash (REG-MENU-02).
- [x] (5) Logs sanity (DevTools Console): sin uncaught; y en uso normal NO aparece:
      - `BOOTSTRAP: menuActions: onMenuClick not available yet; ...`
      - `menuActions: onMenuClick unavailable after DOMContentLoaded; ...`
      - `menuActions: payload without registered action -> ...`

---

### public/js/i18n.js

Date: `2026-02-08`
Last commit: `c224a636c5956cf2616bf6a1bad287438324b204`

#### L0 — Minimal diagnosis (Codex)

Source: `tools_local/codex_reply.md` (local only; do not commit)

##### 0.1 Reading map
- Block order (as written):
  1. IIFE wrapper and logger state (`(() => {`, `const log = window.getLogger('i18n');`)
  2. Module state and constants (`rendererTranslations*`, `AppConstants`, `DEFAULT_LANG`)
  3. Helpers (normalization, base extraction, object checks, merge, path lookup)
  4. Async load pipeline (`loadRendererTranslations`, `loadOverlay`, `loadBundle`)
  5. Translation accessors (`tRenderer`, `msgRenderer`)
  6. Public export on `window.RendererI18n`
- Where linear reading breaks (jumps/obstacles):
  - `loadRendererTranslations` relies on later-defined helper `loadBundle` (micro-quote: `const paths = [];`).
  - `loadOverlay` relies on later-defined helper `loadBundle` (micro-quote: `const paths = [];`).

##### 0.2 Contract map
- Module exposure / public entrypoints / side effects:
  - Side effect: immediately executes an IIFE and attaches `window.RendererI18n`.
  - Public API: `loadRendererTranslations`, `tRenderer`, `msgRenderer`, `normalizeLangTag`, `getLangBase`.
- Invariants / fallbacks (anchored to checks in this file):
  - Normalization: `normalizeLangTag` lowercases (micro-quote: `(lang || '').trim().toLowerCase()`).
  - Default bundle required: `loadBundle(DEFAULT_LANG, DEFAULT_LANG, true)`.
  - Defaults fallback to empty: `rendererDefaultTranslations = defaults || {};`.
  - Overlay optional merge: `deepMerge(rendererDefaultTranslations || {}, overlay || {})`.
  - Missing key fallback: `return fallback;`.
  - If translations not loaded: `if (!rendererTranslations) return fallback;`.
- IPC contract: none found in this file.
  - ipcMain.handle/on/once: none
  - ipcRenderer.invoke/send/on/once: none
  - webContents.send: none
- Delegated IPC registration: none detected.

Reviewer gate:
- L0 protocol: PASS (diagnosis-only; no fix proposals; no invented IPC).
- Note: linear-break anchors are weak (`const paths = [];` is not very locating); acceptable for L0 but could be sharper.

#### L1 — Structural refactor and cleanup (Codex)

Decision (Codex): CHANGED  
Reviewer gate: PASS (after manual revert of unintended `RegExp` edit; structural-only diff accepted)

Accepted changes (verified in diff):
- Hoisted constants closer to the top: `AppConstants` / `DEFAULT_LANG` moved above mutable module state.
- Reordered loader function declarations to read low-level → high-level: `loadBundle` now appears before `loadOverlay` and `loadRendererTranslations`.
- No IPC surface changes; no public API shape changes; IIFE + `window.RendererI18n` attachment preserved.
- No behavior/contract/timing changes detected in the remaining diff (pure reordering).

#### L2 — Clarity / robustness refactor (Codex)

Decision (Codex): NO CHANGE  
Reviewer gate: PASS

Rationale (Codex):
- File already in a clean, linear layout; further reordering would be cosmetic.
- `loadBundle` warning/error paths are coupled to fallback behavior; consolidation would add indirection.
- `msgRenderer` regex replacement behavior is observable; “robust” changes would alter semantics.
- Logging is already deduped (`warnOnce`/`errorOnce`); more explicit edge cases risk extra logs/timing changes.
- No IPC or startup sequencing exists here; no safe L2 rework with material payoff.

#### L3 — Architecture / contract changes (Codex)

Decision (Codex): NO CHANGE (no Level 3 justified)  
Reviewer gate: PASS

Evidence checked (anchors):
- public/renderer.js: destructures `window.RendererI18n || {}` and hard-fails if missing.
- public/editor.js: same pattern (hard-fail on missing RendererI18n).
- public/preset_modal.js: same pattern (hard-fail on missing RendererI18n).
- public/flotante.js: optional i18n usage; logs warning and returns if unavailable.
- public/js/notify.js: optional path; returns if `RendererI18n.msgRenderer` is not a function.
- public/js/format.js: consumes helper utilities from `window.RendererI18n || {}`.

Conclusion:
- No concrete repo-wide pain (bug/repro), contract mismatch, or duplicated responsibility that would justify a Level 3 architecture/contract change in `public/js/i18n.js`.

#### L4 — Logs (policy-driven tuning after flow stabilization) (Codex)

Decision: CHANGED
Reviewer gate: PASS

Accepted changes (logging-only; verified in diff):
- `loadBundle`: warnOnce keys for empty/parse/fetch were made policy-compliant (stable buckets):
  - from keys embedding `requested` + `path`
  - to `i18n.renderer.bundle.{empty|parse|fetch}:${langCode||'unknown'}:${variant}`
  - dynamic details stay in args: `{ requested, langCode, path: p }` (+ `err` where applicable)
- `tRenderer`: missing translation key logging no longer uses warnOnce (signal preserved):
  - from `warnOnce(key includes lang+path)` to `warn(...)` with `{ path, lang: rendererTranslationsLang }`

Validation (manual/grep):
- Grep: `i18n.renderer.bundle.` in `public/js/i18n.js`.
- Force empty/invalid renderer.json for a lang and confirm warnOnce triggers once per `{lang,variant}` bucket.
- Call `tRenderer` with multiple missing keys and confirm each occurrence logs a warn (no dedupe).

#### L5 — Comments (Codex)

Decision: CHANGED
Reviewer gate: PASS

Accepted changes (comments-only; per diff):
- Added an "Overview" block (responsibilities) for new contributors.
- Added section dividers matching the file’s real blocks:
  - Logger / constants
  - Shared state
  - Helpers (pure utilities)
  - Bundle loading (renderer.json)
  - Translation helpers
  - Exports / module surface
- Added an explicit EOF marker: "End of public/js/i18n.js".

No functional changes; comments-only.

#### L6 — Final review (Codex)

Decision (Codex): NO CHANGE  
Reviewer gate: PASS

No Level 6 changes justified.

Checked (anchors):
- Logging call signatures match `public/js/log.js`: `warnOnce(key, ...args)` / `errorOnce(key, ...args)` used as intended in `loadBundle` and `loadRendererTranslations`.
- Dedupe key buckets are stable where applied in `loadBundle`: `i18n.renderer.bundle.{empty|parse|fetch}:${langCode||'unknown'}:${variant}`.
- `requiredMissing` uses `errorOnce` with key bucket `i18n.loadRendererTranslations.requiredMissing:${langCode}`.
- Missing translation key path in `tRenderer` logs a plain `warn(...)` with `{ path, lang: rendererTranslationsLang }` and returns fallback.
- Helpers and naming remain consistent (`normalizeLangTag`, `getLangBase`, `deepMerge`, `getPath`).
- Comments still match code structure (Overview + section dividers + EOF marker).

Observable contract and timing preserved.

#### L7 — Smoke (human-run; minimal)

**Estado:** PASS

**Preconditions**

* App launches normally; open DevTools Console to observe renderer logs.

* Use main window first (renderer). Optionally repeat in Editor and Presets modal windows (each window is its own renderer context).

* [x] **(1) Startup sanity: no uncaught errors; `RendererI18n` present**
  * **Action:** Launch the app and wait for the main window to fully render.
  * **Expected result:** No uncaught exceptions; UI usable; `window.RendererI18n` is present.
  * **Evidence:** `public/js/i18n.js` attaches `window.RendererI18n = { ... }`; `public/renderer.js` hard-fails if missing.

* [x] **(2) Surface check: expected methods exist**

  * **Action (DevTools):**
    * `typeof window.RendererI18n?.loadRendererTranslations`
    * `typeof window.RendererI18n?.tRenderer`
    * `typeof window.RendererI18n?.msgRenderer`
    * `typeof window.RendererI18n?.normalizeLangTag`
    * `typeof window.RendererI18n?.getLangBase`
  * **Expected result:** All are `"function"`.

* [x] **(3) Constants dependency: `AppConstants.DEFAULT_LANG` is usable**

  * **Action (DevTools):**
    * `window.AppConstants?.DEFAULT_LANG`
  * **Expected result:** A non-empty string (the default language tag used by i18n loader).

* [x] **(4) Load default bundle: resolves to an object; no fatal logs**

  * **Action (DevTools):**
    * `const dl = window.AppConstants.DEFAULT_LANG;`
    * `const a = await window.RendererI18n.loadRendererTranslations(dl);`
  * **Expected result:** `a` is a plain object; no errors; app remains usable.
  * **Evidence:** `loadRendererTranslations` always sets `rendererDefaultTranslations = defaults || {}` and merges overlay best-effort.

* [x] **(5) Cache behavior: second call returns cached object**

  * **Action (DevTools):**
    * `const dl = window.AppConstants.DEFAULT_LANG;`
    * `const a1 = await window.RendererI18n.loadRendererTranslations(dl);`
    * `const a2 = await window.RendererI18n.loadRendererTranslations(dl);`
    * `a1 === a2`
  * **Expected result:** `true` (same reference); no new warnings required on the healthy path.
  * **Evidence:** early return guard: `if (rendererTranslations && rendererTranslationsLang === selected) return rendererTranslations;`.

* [x] **(6) Helpers correctness: normalize + base derivation**

  * **Action (DevTools):**
    * `window.RendererI18n.normalizeLangTag('ES_CL')`
    * `window.RendererI18n.getLangBase('es-cl')`
  * **Expected result:** first returns `'es-cl'`; second returns `'es'`.

* [x] **(7) Missing-key fallback: returns fallback + emits warn (signal)**

  * **Action (DevTools):**
    * `window.RendererI18n.tRenderer('__missing.key', 'FALLBACK_OK')`
  * **Expected result:** returns `'FALLBACK_OK'`; emits one `warn` log: `"Missing translation key (using fallback):"` with `{ path, lang }`.
  * **Evidence:** `tRenderer` uses `log.warn(...)` (not `warnOnce`) then `return fallback;`.

* [x] **(8) `msgRenderer` substitution works even on fallback**

  * **Action (DevTools):**
    * `window.RendererI18n.msgRenderer('__missing.key', { name: 'X' }, 'Hello {name}')`
  * **Expected result:** returns `'Hello X'` (placeholder replaced). A warn is acceptable here because the key is intentionally missing.

* [x] **(9) UI integration: language switch does not break and does not spam logs**

  * **Action:** Switch UI language via your normal language selector flow (pick any non-default shipped language), then switch back.
  * **Expected result:** No crashes; UI remains usable. If an overlay is missing for the chosen language, you may see at most one `warnOnce` for `i18n.loadRendererTranslations.overlayMissing:<lang>`; no continuous repeats while idle.

* [x] **(10) Multi-window integration: Editor + Presets modal still open (RendererI18n present in those contexts)**

  * **Action:** Open the Editor window, then open the Presets modal (and optionally the Flotante window).
  * **Expected result:** Windows open normally; no hard-fail errors about missing `RendererI18n`. No repeated log spam in idle.

**Notes (only if needed)**

* If you see repeated `"Missing translation key (using fallback)"` during *normal* UI usage (not DevTools tests), that indicates a real missing-key problem in the UI call sites or bundles (not a logging issue).

---

### public/js/notify.js

Date: `2026-02-09`
Last commit: `fd615a53318bf259a3094233be4261e7f88d2ebd`

#### L0 — Minimal diagnosis (Codex, verified)

##### 0.1 Reading map

Block order (actual):
1. Header + strict + IIFE (`// public/js/notify.js`, `'use strict';`, `(() => { ... })();`)
2. Helpers:
   - `resolveText`
   - `notifyMain`
   - `toastText`
   - `ensureToastContainer`
   - `applyToastPosition`
   - `toastMain`
   - `toastEditorText`
   - `notifyEditor`
3. Public attachment:
   - `window.Notify = { notifyMain, notifyEditor, toastMain, toastEditorText }`

Where linear reading breaks (jumps, mixed responsibilities, duplication, nesting):
- `toastText`: mezcla guard de DOM, creación DOM, styling, animación, timing y removal. Micro-quote: `if (!document || !document.body)`.
- `ensureToastContainer`: crea DOM + aplica estilos, luego delega posicionamiento. Micro-quote: `container = document.createElement('div');`.
- `toastMain`: try/catch anidado con fallback a `notifyMain`. Micro-quote: `toastText(msg, { containerId:`.
- `toastEditorText`: try/catch anidado con fallback condicional a `notifyMain`. Micro-quote: `if (typeof notifyMain === 'function')`.
- `notifyEditor`: try/catch anidado con fallback a `notifyMain`. Micro-quote: `console.error('[notify] notifyEditor failed:'`.

##### 0.2 Contract map

Module exposure (exports / public entrypoints / side effects):
- Side effect: adjunta `window.Notify` con 4 entrypoints: `notifyMain`, `notifyEditor`, `toastMain`, `toastEditorText`.
- Side effects de uso: DOM mutation (containers/toasts), `alert`, `console.error`, `setTimeout` / `requestAnimationFrame`.

Invariants suggested (expected inputs, tolerated errors, fallbacks):
- `resolveText`: requiere `window.RendererI18n.msgRenderer` como función; si falta, retorna la key. Anchor: `typeof RendererI18n.msgRenderer !== 'function'`.
- `toastText`: requiere `document` y `document.body`; si falta, hace throw. Anchor: `toastText unavailable: document/body not ready`.
- `toastText`: fuerza texto a string. Anchor: `String(text)`.
- Duración: sanitiza a número finito ≥ 0; default 4500. Anchor: `Number.isFinite(duration) ? Math.max(0, duration) : 4500`.
- Fallbacks:
  - `toastMain`: on error → `notifyMain(key)`.
  - `toastEditorText`: on error → `notifyMain(text)` si existe; si no, log de fallback ausente.
  - `notifyEditor`: on error → `notifyMain(key)`.

IPC contract:
- No IPC usage in this file (no `ipcMain.*`, `ipcRenderer.*`, ni `webContents.send`).
- Delegated registration: none.

Reviewer gate:
- PASS (Level 0: diagnosis-only; anchors presentes; sin IPC inventado).

#### L1 — Structural refactor and cleanup (Codex)

Decision: CHANGED

- Reordered helper definitions so positioning and container setup (`applyToastPosition`, `ensureToastContainer`) appear before `toastText` uses them.
- Moved `toastText` to sit directly after its container/position helpers to make the toast flow linear.
- Moved `notifyMain` down to group the public-facing entrypoints together with `toastMain`, `toastEditorText`, and `notifyEditor`.
- No logic changes inside any function bodies; only rearranged function order for readability.

Reviewer assessment:
- PASS: Level 1 scope respected (structural-only reorder). Readability payoff is concrete because `toastText` currently calls `ensureToastContainer(...)` before its definition appears later in-file (jump in linear reading). Contract/behavior/timing preserved: only function declaration order changes within the same IIFE.

Reviewer gate: PASS

#### L2 — Clarity / robustness refactor (controlled) (Codex)

Decision: NO CHANGE

- The file is already short and linear; adding helpers would introduce extra concepts without reducing branching or reading effort.
- The nested try/catch fallback patterns are the observable behavior (including log prefixes/order); deduping them risks changing those surfaces.
- Hardening `window`/`document` access (e.g., `typeof` guards) would change error behavior in non-DOM contexts, which is observable.
- The timing flow (RAF vs `setTimeout`, duration handling, removal delay) is already minimal; refactoring risks timing changes without clarity payoff.
- Extracting constants for durations/styles would be largely cosmetic and does not materially improve clarity or robustness.

Reviewer assessment:
- PASS: A NO CHANGE decision is justified at Level 2 because the current code’s nested error/fallback paths and log surfaces are part of the observable behavior, and the toast timing path (RAF vs setTimeout + delayed removal) is timing-sensitive.

Reviewer gate: PASS

#### L3 — Architecture / contract changes (exceptional; evidence-driven) (Codex)

Decision: NO CHANGE (no Level 3 justified)

- Checked `public/js/notify.js` public contract surface (`window.Notify = { notifyMain, notifyEditor, toastMain, toastEditorText }`) and saw a stable, narrow API with no IPC surface to re-architect.
- Checked `public/editor.js` usage of `Notify.toastEditorText(...)` and `Notify.notifyMain(...)` (via `showNotice(...)`), plus `Notify.notifyEditor(...)` for editor alerts; no conflicting semantics observed.
- Checked `public/renderer.js` usage of `Notify.notifyMain(...)` and `Notify.toastMain(...)` (help tip + alert paths); call sites pass string keys and rely on current alert/toast timing.
- Checked `public/preset_modal.js` usage of `Notify.notifyMain(...)` with a warnOnce-based alert fallback when missing (`preset-modal.notify.missing`); no evidence of contract mismatch or race issues.
- Confirmed no IPC usage exists in `public/js/notify.js` (no `ipcMain.*`, `ipcRenderer.*`, or `webContents.send`) and no delegated IPC registration.

Reviewer assessment:
- PASS: No evidence-backed pain point requiring an architecture/contract change. The module remains a narrow in-window Notify helper with stable call sites and no IPC surface.

Reviewer gate: PASS

#### L4 — Logs (Codex)

Decision (Codex): CHANGED

Changes (Codex):
- Introduce `const log = window.getLogger('notify')` y reemplaza `console.error(...)` en rutas de fallback por `log.warn(...)` (recuperable) y `log.error(...)` (fallback failed).
  - Gain: niveles alineados a recuperabilidad; mensajes más consistentes con policy.
  - Cost: si el log level está en `error`, los `warn` se suprimen (degradación silenciosa solo bajo configuración).
  - Validation: buscar strings tipo `failed; falling back` y verificar que las rutas siguen intentando `notifyMain(...)` igual que antes.
- Agrega `log.warnOnce('notify.resolveText.i18n.missing', ...)` cuando falta `RendererI18n.msgRenderer`.
  - Gain: elimina fallback silencioso; dedupe evita spam.
  - Cost: puede emitir 1 warning si Notify se usa antes de init i18n.
  - Validation: grep de key `notify.resolveText.i18n.missing`.
- Agrega `log.errorOnce('notify.toastEditorText.notifyMain.missing', ...)` cuando no existe `notifyMain` para fallback en `toastEditorText`.
  - Gain: señal deduplicada y accionable ante misconfig persistente; conserva el flujo best-effort.
  - Cost: ocurrencias posteriores suprimidas (por diseño once).
  - Validation: grep de key `notify.toastEditorText.notifyMain.missing`.

Reviewer assessment:
- PASS (L4): cambios limitados a logging + soporte mínimo; keys estables; niveles coherentes; no introduce IPC.
- Nota/riesgo controlado: `window.getLogger` debe existir antes de cargar `notify.js` (orden de scripts debe garantizarlo).

Reviewer gate: PASS

#### L5 — Comments (Codex)

Decision: CHANGED
Reviewer gate: PASS

Accepted changes (comments-only; per diff):
- Added a top-level "Overview" section (responsibilities) for new contributors.
- Added section dividers (`// =============================================================================`) matching the real block order:
  - Logger
  - Helpers (i18n + toast rendering)
  - Entry points (public API)
- Added an explicit EOF marker: "End of public/js/notify.js".

No functional changes; comments-only.

#### L6 — Final review (coherence + leftover cleanup after refactors) (Codex)

Decision: NO CHANGE

No Level 6 changes justified.

Checks (Codex):
- Checked logging API usage in `resolveText` (`log.warnOnce`) and `toastEditorText` (`log.errorOnce`) against `public/js/log.js` signature; no drift.
- Checked fallback logs in `toastMain`, `toastEditorText`, and `notifyEditor` for recoverable severity (`log.warn`) and failure severity (`log.error`); consistent and non-noisy.
- Checked helper flow for duplication/leftovers: `applyToastPosition`, `ensureToastContainer`, `toastText` are used once each and consistent.
- Checked public surface `window.Notify = { notifyMain, notifyEditor, toastMain, toastEditorText }`; matches call sites and prior contract.
- Checked comment/code alignment around Overview and section dividers; matches current block order and responsibilities.
- Checked DOM guard behavior in `toastText` and string coercion paths; no redundant checks introduced.

Observable contract and timing were preserved.

Reviewer assessment:
- PASS (L6): NO CHANGE is justified; no evidence of leftover drift after L1–L5, and logging usage remains consistent with the logger API and policy.

Reviewer gate: PASS
`
According to a document from **2026-02-09**, el siguiente bloque es el **Checklist L7** para agregar en `docs/cleanup/_evidence/issue64_repo_cleanup.md`, **dentro de la sección** `### public/js/notify.js`, **inmediatamente después de** `Reviewer gate: PASS` de L6. 

No corresponde actualizar `docs/tree_folders_files.md` solo por L7 (no hay info nueva de estructura/archivos). 


#### L7 — Smoke (human-run; minimal)

**Estado:** PASS

**Preconditions**

* App launches normally; open DevTools Console to observe renderer logs.

* Run in **Main window** first. Then repeat in **Editor window** (separate renderer context).

* [x] **(1) Startup sanity: no uncaught errors; logger + Notify surface present**
  * **Action:** Launch the app and wait for the main window to fully render.
  * **Expected result:** No uncaught exceptions; UI usable; `typeof window.getLogger === "function"`; `window.Notify` is present.
  * **Evidence:** module reads `const log = window.getLogger('notify')` and attaches `window.Notify = { ... }`.

* [x] **(2) Surface check: expected methods exist**
  * **Action (DevTools):**
    * `typeof window.Notify?.notifyMain`
    * `typeof window.Notify?.toastMain`
    * `typeof window.Notify?.toastEditorText`
    * `typeof window.Notify?.notifyEditor`
  * **Expected result:** All are `"function"`.
  * **Evidence:** `window.Notify = { notifyMain, notifyEditor, toastMain, toastEditorText }`.

* [x] **(3) Main toast path works (DOM toast)**
  * **Action (DevTools, main window):** `Notify.toastMain('SMOKE:toastMain')`
  * **Expected result:** A toast appears top-right and disappears after ~9s; container exists:
    * `document.getElementById('totMainToastContainer')` is non-null after the call.
  * **Evidence:** `toastMain(... { containerId: 'totMainToastContainer', ... duration = 9000 })`.

* [x] **(4) Main alert path works (blocking)**
  * **Action (DevTools, main window):** `Notify.notifyMain('SMOKE:notifyMain')`
  * **Expected result:** A blocking `alert(...)` appears with either translated text or the key itself.
  * **Evidence:** `notifyMain -> alert(resolveText(key))`.

* [x] **(5) i18n fallback warning is visible and deduped (warnOnce)**
  * **Action (DevTools, main window):**
    1. `const saved = window.RendererI18n; window.RendererI18n = null;`
    2. `Notify.toastMain('SMOKE:i18nMissing')`
    3. Repeat once: `Notify.toastMain('SMOKE:i18nMissing2')`
    4. Restore: `window.RendererI18n = saved;`
  * **Expected result:**
    * First call emits a **single** warning (deduped by key) about missing `RendererI18n.msgRenderer`, and the toast still shows using key fallback.
    * Second call does **not** repeat the warnOnce output.
  * **Evidence:** `log.warnOnce('notify.resolveText.i18n.missing', ...)` + `return key;` on missing `msgRenderer`.

* [x] **(6) Editor toast path works (text toast)**
  * **Action:** Open the **Editor** window, open its DevTools Console, run:
    * `Notify.toastEditorText('SMOKE:editorToast')`
  * **Expected result:** A toast appears top-right and disappears after ~4.5s; container exists:
    * `document.getElementById('totEditorToastContainer')` is non-null after the call.
  * **Evidence:** `toastEditorText(... { containerId: 'totEditorToastContainer', ... duration = 4500 })`.

* [x] **(7) Editor key-based notify path works**
  * **Action (DevTools, editor window):** `Notify.notifyEditor('SMOKE:notifyEditor')`
  * **Expected result:** A toast appears (translated or key fallback). No uncaught exceptions.
  * **Evidence:** `notifyEditor -> resolveText(key) -> toastEditorText(msg, ...)` with fallback to `notifyMain` on errors.

* [x] **(8) Log sanity: no spam on healthy paths**
  * **Action:** Repeat (3), (6), (7) several times.
  * **Expected result:** No continuous/repeating warnings/errors on healthy paths; only the intentional warnOnce in (5) when i18n is forced missing.

---

### public/js/info_modal_links.js

Date: `2026-02-09`
Last commit: `b0aed051f81ed786831f27449e3ad2f943f7ce42`

#### L0 — Minimal diagnosis (Codex, verified)

Source: Codex response pasted in chat (2026-02-09).

##### 0.1 Reading map
- Block order: header comment → `'use strict'` → IIFE wrapper → `log` init (`window.getLogger('info-modal-links')`) → `bindInfoModalLinks` → inner helper `escapeSelector` → `container.addEventListener('click', ...)` handler → global export `window.InfoModalLinks = { bindInfoModalLinks }`.
- Linear breaks / obstacles (anchors/micro-quotes):
  - `bindInfoModalLinks` mezcla guard de “bind once”, selección de API y wiring DOM. Anchor: `container.dataset.externalLinksBound === '1'`
  - Helper definido *dentro* del binder (salto local de abstracción). Anchor: `const escapeSelector = (value) => {`
  - Handler con múltiples rutas y returns tempranos (`#`/`appdoc:`/externo). Anchor: `container.addEventListener('click', (ev) => {`

##### 0.2 Contract map
- Exposed API / side effects:
  - Exposes `window.InfoModalLinks.bindInfoModalLinks(container, { electronAPI } = {})`.
  - Side effects: setea `container.dataset.externalLinksBound = '1'` y registra un listener `'click'` sobre `container`.
- Invariants and fallbacks (anchored to checks in this file):
  - Bind idempotente por dataset flag: `container.dataset.externalLinksBound === '1'`
  - Requiere `href` no vacío tras trim: `if (!rawHref) return;`
  - Ruta hash (`#...`):
    - `hash` vacío → scroll top (panel o container): `if (!hash) {`
    - Elemento destino puede no existir (se ignora): `if (!targetEl) return;`
    - Fallback de scroll manual solo si hay panel: `catch {` + `if (!panel) return;`
  - Ruta `appdoc:` requiere `api.openAppDoc` o bloquea con warnOnce: `typeof api.openAppDoc !== 'function'`
  - Ruta externa requiere `api.openExternalUrl` o bloquea con warnOnce: `typeof api.openExternalUrl !== 'function'`
  - Resolución de URL prioriza `link.href` (absoluta) y cae a raw: `const resolvedHref = link.href || rawHref;`
- IPC contract: none found in this file.
  - ipcMain.handle/on/once: none
  - ipcRenderer.invoke/send/on/once: none
  - webContents.send: none
- Delegated IPC registration: none found.

Reviewer gate:
- L0 protocol: PASS (diagnosis-only; no invented IPC; invariants anchored to visible checks/fallbacks).
- Note: corrected one Codex micro-quote to be verbatim (removed ellipsis).

#### L1 — Structural refactor and cleanup (Codex)

Decision: CHANGED

- Extrajo `escapeSelector` desde el interior de `bindInfoModalLinks` a un helper top-level dentro del IIFE (reduce nesting local).
- Eliminó la definición inline del helper dentro del binder, mejorando lectura lineal (guard → api → event listener).
- No cambia rutas del click handler (`#` / `appdoc:` / externo), ni el guard idempotente por `dataset`, ni el export global.

Contract/behavior/timing preserved.

Reviewer assessment:
- PASS (L1). Cambio puramente estructural (relocación de helper sin estado); no hay drift de contrato observable (`window.InfoModalLinks.bindInfoModalLinks(...)`), ni IPC en este módulo.

Reviewer gate: PASS

#### L2 — Clarity / robustness refactor (controlled) (Codex)

Decision: NO CHANGE

- El click handler ya es relativamente lineal (guards + returns); extraer helpers añadiría indirection sin reducir ramas.
- Las rutas `appdoc:` y externo son pocas y directas; un helper compartido metería parámetros y “saltos” de lectura sin payoff claro.
- Los casos límite relevantes ya están explicitados por guards (href vacío, target inexistente, API faltante), sin dejar comportamiento inseguro implícito.
- La política de logs ya evita spam en paths repetidos mediante `warnOnce`; endurecer más puede inducir sobre-logging o drift de superficie observable.
- Reordenar/reestructurar por “robustez” arriesga cambios sutiles de timing (flag dataset + listener) sin una ganancia concreta.

Observable contract and timing are preserved (no changes applied).

Reviewer assessment:
- PASS (L2). NO CHANGE está justificado: el módulo ya tiene guards explícitos y `warnOnce` en paths de bloqueo/error; no hay una mejora clara de robustez/claridad que no introduzca indirection o riesgo de drift observable.

Reviewer gate: PASS

#### L3 — Architecture / contract changes (Codex)

Decision: NO CHANGE (no Level 3 justified)

- Checked `public/js/info_modal_links.js` `bindInfoModalLinks` and the click handler route split (`#` / `appdoc:` / external); no ambiguous contract or competing responsibilities found.
- Checked `public/renderer.js` call site `bindInfoModalLinks(infoModalContent, { electronAPI: window.electronAPI });` — single visible consumer and stable call signature in the current snapshot.
- Snapshot scan shows no additional consumers of `bindInfoModalLinks` beyond `renderer.js` + the module definition.
- No direct IPC surface in this module (no `ipcMain.*`, `ipcRenderer.*`, `webContents.send`); it relies on `electronAPI` / `window.electronAPI`.

Reviewer assessment:
- PASS (L3). No evidence of repo-wide pain (multi-consumer instability, mismatched semantics, or reproducible bug) that would justify a contract/architecture change here.
- Note: Codex mentioned checking `docs/changelog_detailed.md` / `public/info/acerca_de.html`; those files are not present in the current `mnt/data` snapshot, so they are not used as reviewer evidence here.

Reviewer gate: PASS
