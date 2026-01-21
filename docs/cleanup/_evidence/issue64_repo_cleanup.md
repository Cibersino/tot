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

## electron/main.js

Date: `2026-01-20`
Last commit: `78731dade08caa8c0a6f749ad22ff5074ccdc97e`

### L0 — Diagnosis (no changes)

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

### L1 decision: NO CHANGE

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

### L2 decision: CHANGED

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

### L3 decision: NO CHANGE (no Level 3 justified)

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

### L4 decision: NO CHANGE

- Logger mechanism already correct for main process (`Log.get('main')`), with appropriate `log.error` in IPC handler failures.
- High-frequency/best-effort paths already use `warnOnce` with stable keys (e.g., `send.crono-state.*`, `mainWin.send.flotante-closed`, `snapWindowFullyIntoWorkArea.noWorkArea`).
- No silent fallbacks found in this file; fallbacks (language/manifest/options/workArea) already emit warn/error at appropriate levels.
- Further tuning would be marginal and risks either hiding actionable failures or adding indirection/noise.

**Risk**
- N/A (no code changes).

**Validation**
- Baseline L7 smoke checklist unchanged.

### L5 decision: CHANGED (comments-only)

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

### L6 decision: NO CHANGE

- Checked helper usage consistency (`isAliveWindow`, `warnOnce`): signatures and call sites aligned.
- Reviewed IPC handlers (`crono-*`, `flotante-*`, `open-*`, `get-app-*`): channel names + return shapes consistent with consumers.
- Verified logging API usage against `electron/log.js` for deduped warnings (warnOnce/errorOnce usage).
- Scanned for unused locals/imports introduced in Levels 1–5: none found.
- Confirmed section headers and comments still match actual blocks (constants, helpers, window factories, IPC, lifecycle).

Observable contract and timing preserved (no code changes).

### L7 — Smoke checklist (human-run; code-informed)

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

## electron/settings.js

Date: `2026-01-21`
Last commit: `ce268a09c6a269e6a7c93b982d166a79d0434660`

### L0 — Diagnosis (no changes)

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

### L1 decision: NO CHANGE

- Codex concluyó **NO CHANGE**: el archivo ya tiene un orden por bloques coherente y headers claros; los handlers IPC están agrupados; la normalización es verbosa a propósito.
- Un reordenamiento estructural sería churn con payoff bajo y potencial riesgo de secuencia (menu rebuild / broadcast / best-effort windows) sin reducción material de complejidad.
- No se identificó una simplificación local (early returns / deduplicación / naming) con ganancia clara que no agregue indirection o riesgo de timing.

**Evidence**
- Codex Level 1 report (Decision: NO CHANGE) en `tools_local/codex_reply.md` (2026-01-21).

**Risk**
- N/A (no code changes).

**Validation**
- N/A (no code changes; baseline unchanged).

### L2 decision: CHANGED

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
- Codex Level 2 report (Decision: CHANGED) en `tools_local/codex_reply.md` (2026-01-21).
- Diff: reemplazo de literales por `createDefaultSettings(...)` en `init`, `getSettings`, y fallback de `get-settings`.

**Risk**
- Low. Cambio local que reemplaza literales por un helper puro; no toca canales IPC ni orden de efectos.

**Validation**
- Grep + smoke mínimo (arriba).

### L3 decision: NO CHANGE (no Level 3 justified)

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

### L4 decision: CHANGED

- Change: `saveSettings` ahora usa un `errorOnce` con key estable (`settings.saveSettings.persist`) en vez de interpolar `_settingsFile` en la key.
  - Gain: la key explícita deja de depender de valores no-controlados; el path sigue quedando en los args del log para diagnóstico.
  - Cost: la deduplicación deja de ser “por path” (irrelevante en la práctica: un settings file por ejecución).
  - Validation: confirmación por diff; no cambia contrato/IPC/timing.

Observable contract/timing preserved: no hay cambios de IPC, payloads/returns, side effects u ordering; solo cambia el bucket de dedupe del log en un `catch`.

### L5 decision: CHANGED

- Updated the Overview responsibilities to include the existing `set-selected-preset` IPC handler.
- Updated the IPC registration comment to list `set-selected-preset` alongside the other handlers.
- No functional changes; comments-only.

**Evidence**
- Codex Level 5 report (Decision: CHANGED) in `tools_local/codex_reply.md` (2026-01-21).
- Diff confirms comment-only changes in `electron/settings.js` (Overview + IPC list).

**Risk**
- None (comments-only).

**Validation**
- Visual review: comments match the actual IPC handlers registered in `registerIpc`:
  `get-settings`, `set-language`, `set-mode-conteo`, `set-selected-preset`.

### L6 decision: CHANGED

- Change: `broadcastSettingsUpdated` ahora incluye el nombre de la ventana (`name`) en los args del `warnOnce` cuando falla `webContents.send('settings-updated', ...)`.
- Gain: el output del warning identifica la ventana objetivo sin depender de la dedupe key.
- Cost: una línea de log ligeramente más larga en caso de fallo.
- Risk: none (log-only change).
- Validation: `rg -n "settings-updated notify failed" electron/settings.js` y confirmar que el `warnOnce` incluye `name` como argumento.

Observable contract/timing preserved: no hay cambios en IPC, payloads/returns, side effects u ordering; solo cambia el contenido del log en caso de fallo.

### L7 — Smoke (human-run; minimal)

Resultado: PASS

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
- No aparecio nada relevante

---

## electron/fs_storage.js

Date: `2026-01-21`
Last commit: `dc666337e39e54416215e97d23bded5a7d27689`

### L0 — Minimal diagnosis (Codex, verified)

#### 0.1 Reading map

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

#### 0.2 Contract map

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

### L1 decision: NO CHANGE

- El archivo ya está ordenado en bloques coherentes con separadores claros (overview → imports/logger → config state → helpers → exports).
- El flujo es simple y con baja anidación; aplicar early-returns / reordenamiento no mejora lectura sin introducir churn.
- La duplicación es mínima y localizada; extraer helpers comunes (p.ej. ensure-dir / warnOnce wrappers) agregaría indirección sin reducir ramas/duplicación de forma significativa.
- El único punto “mixto” es el special-casing por basename dentro de `loadJson()` para notas de “missing file”; extraerlo a mapa/helper sería un concepto nuevo con payoff marginal, así que no se justifica en L1.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

### L2 decision: NO CHANGE

- `loadJson()` ya explicita y maneja como recoverable: missing/empty/invalid JSON → warnOnce + fallback (sin crash).
- `saveJson()` ya asegura el directorio padre antes de escribir (“callers do not depend on init ordering”).
- No hay duplicación o complejidad de ramas/anidación que justifique helpers nuevos sin añadir indirección.
- No existe IPC ni secuenciación timing-sensitive en este módulo que requiera ajustes en L2.

Risk: N/A (no code changes).
Validation: N/A (no code changes).
