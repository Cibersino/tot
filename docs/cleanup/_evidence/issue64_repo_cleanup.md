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

### L3 decision: NO CHANGE (no Level 3 justified)

- Checked module contract and guardrails in `electron/fs_storage.js` (`initStorage`, `getConfigDir`, `loadJson`, `saveJson`) for instability or ambiguity.
- Checked call site orchestration in `electron/main.js` (`initStorage(app)`, `getSettingsFile()`, `getCurrentTextFile()`, `loadJson`, `saveJson`) for timing or ordering pressure.
- Checked settings consumer expectations in `electron/settings.js` (`init({ loadJson, saveJson, settingsFile })`, `_loadJson`/`_saveJson` usage).
- Checked text persistence usage in `electron/text_state.js` (`loadJson = opts.loadJson`, `saveJson = opts.saveJson`, `loadJson(currentTextFile, ...)`).
- Checked editor state usage in `electron/editor_state.js` (`loadInitialState(loadJson)`, `attachTo(..., loadJson, saveJson)`).
- Checked presets path use in `electron/presets_main.js` (`getConfigPresetsDir`, `ensureConfigPresetsDir`).

Conclusion: no direct evidence of unstable contract, duplicated responsibility, or sync/async mismatch requiring Level 3 changes.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

### L4 decision: CHANGED (logging-only)

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

### L5 decision: NO CHANGE (comments)

- Overview already lists responsibilities and constraints (sync main process; recoverable fallbacks).
- Section dividers match the actual block order and follow `electron/main.js` style.
- Comments are intent/constraints-focused with no obvious drift.
- End-of-file marker already present and correctly styled.
- Further edits would be cosmetic and risk drift without improving clarity.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

### L6 decision: NO CHANGE (final review)

No Level 6 changes justified.
- Checked helper usage consistency (`LOAD_JSON_KNOWN_FILES`, `getLoadJsonOnceKey`, `loadJson`).
- Checked logging API usage against `electron/log.js` (`log.warnOnce`, `log.error`).
- Checked initialization invariants and guards (`initStorage`, `getConfigDir`).
- Checked fallback behavior and return shapes (`loadJson`, `saveJson`).
- Checked comments align with behavior and structure (section headers and notes).

Observable contract and timing preserved: yes (no code changes).

Risk: N/A (no code changes).
Validation: N/A (no code changes).

### L7 smoke (human-run)

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

## electron/text_state.js

Date: `2026-01-21`
Last commit: `12ba2bc6346aedee364aea3080a6ade0e502ea55`

### L0 — Diagnosis (no changes)

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

### L1 — Structural refactor (Codex)

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

### L2 — Clarity / robustness (Codex)

Decision: NO CHANGE

- Input validation and truncation logic are already explicit and localized (`sanitizeMeta`, `set-current-text`), so further helpers would add indirection.
- Error handling is already bounded by `log.warnOnce`/`log.error` and try/catch blocks without noisy logs.
- IPC handlers are already grouped in `registerIpc`, and splitting them would not reduce branching or duplication.
- The persistence path and compatibility behavior are tightly coupled in `persistCurrentTextOnQuit`, and isolating them would increase cross-references.
- Any attempts to guard non-function `loadJson`/`saveJson` or missing file paths would change current error/log behavior.

The observable contract and timing are preserved (no changes applied).

### L3 — Architecture / contract changes (Codex)

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

### L4 — Logs (Codex)

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

### L5 — Comments (Codex)

Decision: CHANGED

- Updated the top Overview responsibilities to include `clipboard-read-text` and keep the compatibility note visible.
- Added section dividers to mirror the file’s real block order (validation/normalization; best-effort send+persistence; initialization/lifecycle; IPC registration/handlers; exports).
- Clarified the `registerIpc` docblock to enumerate all IPC channels and to note main/editor broadcasts (best-effort).
- No functional changes; comments-only.

### L6 — Final review (Codex)

Decision: NO CHANGE

No Level 6 changes justified.
- Logging API usage is consistent: `safeSend` uses `warnOnce(key, ...)` with stable keys.
- Clipboard handler refusal paths are visible and deduped: `clipboard-read-text` unauthorized/too large warns.
- Error path keeps expected warn/error split: `set-current-text` warns on oversize and skips error for that case.
- IPC surface matches call sites: `registerIpc` defines get/set/force/clipboard and sends editor updates.
- Shared state and lifecycle wiring remain coherent: `init` loads, truncates, and attaches before-quit persistence.
- Comments align with code blocks and responsibilities (Overview and section dividers).

Observable contract and timing preserved (no changes applied).

### L7 — Smoke (human-run; minimal)

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

## electron/editor_state.js

Date: `2026-01-21`
Last commit: `3dc666337e39e54416215e97d23bded5a7d27689`

### L0 — Diagnosis (no changes)

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

### L1 — Structural refactor (Codex)

Decision: NO CHANGE

- File already follows imports → constants → helpers → main logic → exports order.
- The main logic is a single entrypoint (`attachTo`) with event handlers that read linearly as rules.
- Helper functions (`isValidReduced`, `normalizeState`) are already minimal and named for intent.
- Any extraction or reordering would add indirection without reducing branches or duplication.
- Early returns or merging branches risk altering the timing/side-effect cadence in event handlers.

Risk: N/A (no code changes).
Validation: N/A (no code changes).

### L2 — Clarity / robustness (Codex)

Decision: NO CHANGE

- The file is already compact and linear, with clear helper boundaries and event-handler rules.
- Duplication is minimal and tightly coupled to event timing; extracting helpers would add indirection.
- Error handling is present at each boundary (load/save/getEditorStateFile) with proportional logging.
- Any consolidation of load/normalize defaults risks obscuring distinct defaults used per event.
- Timing-sensitive event handlers are simple and readable as-is; restructuring would not add clarity.

Observable contract and timing were preserved.

### L3 — Architecture / contract (Codex)

Decision: NO CHANGE (no Level 3 justified)

Evidence checked (anchors):
- `electron/main.js` — `createEditorWindow`: only uses `editorState.loadInitialState` and `editorState.attachTo`.
- `electron/editor_state.js` — `loadInitialState`: fallback/contract remains internal; anchor: `"return { ...DEFAULT_STATE }"`.
- `electron/editor_state.js` — `attachTo`: event handlers + side effects; anchors: `'resize'`, `'move'`, `'maximize'`, `'unmaximize'`, `'close'`.
- `electron/editor_state.js` — helpers: `normalizeState`, `isValidReduced` (invariants centralized).
- `electron/fs_storage.js` — `getEditorStateFile` / `editor_state.json` path usage (single storage contract).

### L4 — Logs (Codex)

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

### L5 — Comments (Codex)

Decision: CHANGED (comments-only)

- Added an Overview block (responsibilities) in the established electron/* style.
- Inserted section dividers matching the file’s real blocks:
  Imports / logger, Constants / defaults, Helpers, API (public entrypoints), Exports.
- Replaced/removed “API:” inline comments in favor of a single API section header.
- Tweaked the fallback placement comment for clarity and ASCII consistency.
- Added an explicit end-of-file marker (“End of electron/editor_state.js”).

Risk: none (comments-only).
Validation: visual review (no code moved; comments adjacent to blocks; ASCII-only).

### L6 — Final review (Codex)

Decision: NO CHANGE

No Level 6 changes justified.

Checks performed (anchors):
- Helpers/invariants: `normalizeState`, `isValidReduced` consistent with callers.
- Logging API signatures: `log.warnOnce(...)` / `log.error(...)` argument shapes consistent.
- Event handlers: `attachTo` (`resize`, `move`, `maximize`, `unmaximize`, `close`) keep timing/side effects intact.
- Exports + call sites: `loadInitialState`, `attachTo` match `electron/main.js` usage.
- Comments vs behavior: Overview + handler comments align with current logic.

Observable contract and timing were preserved.

### L7 — Smoke (human-run; editor_state.js)

Result: PASS

**Precondition**

* App closed before touching config files.

#### L7-01 Baseline: open Editor once (creates/loads editor_state.json)

* [x] Action: Launch app → open Manual Editor (test_suite SM-08).
* [x] Expected: Editor window opens; main remains responsive; no uncaught exceptions.
* [x] Expected logs: on **clean run**, it is acceptable to see **one** warnOnce from `fs_storage.loadJson` about missing `editor_state.json` (created on first editor usage). No repeated spam.

#### L7-02 Persist reduced geometry (move/resize -> reopen)

* [x] Action: With editor **not maximized**, resize + move to a distinct position → close editor window → open editor again.
* [x] Expected: Editor reopens roughly at the same size/position (reduced bounds restored).
* [x] Expected: No new WARN/ERROR lines produced by normal move/resize activity (beyond any first-run fs_storage warning already seen).

#### L7-03 Persist maximized flag (maximize -> reopen)

* [x] Action: Maximize editor → close editor → open editor.
* [x] Expected: Editor opens **maximized** again.
* [x] Expected: No ERROR logs.

#### L7-04 Unmaximize restores last reduced bounds (non-fallback path)

* [x] Action: From maximized editor, click unmaximize (restore down).
* [x] Expected: Window returns to last reduced bounds (the one you had before maximize), not the fallback placement.
* [x] Expected logs: **no** “unmaximize: reduced bounds missing; …” warning in this healthy path.

---

### Optional L7 (covers L4 warnOnce fallbacks explicitly)

These are optional because they require editing `editor_state.json`, but they validate the *new logging* and “no silent fallback” behavior.

#### L7-05 Force unmaximize fallback when reduced is missing

* [x] Setup: Close app. Backup `editor_state.json`. Replace contents with:

  ```json
  { "maximized": true, "reduced": null }
  ```
* [x] Action: Launch app → open editor → maximize (if not already) → unmaximize.
* [x] Expected behavior: Editor uses fallback placement (upper-right half of current monitor workArea).
* [x] Expected logs (deduped): one WARN line starting with:
  * `unmaximize: reduced bounds missing; using fallback placement (ignored).`
* [x] Dedupe check: repeat maximize/unmaximize multiple times in the same session → warning should not repeat.

#### L7-06 Force normalizeState invalid-shape warnings (valid JSON, wrong shape)

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

## electron/presets_main.js

Date: `2026-01-21`
Last commit: `3dc666337e39e54416215e97d23bded5a7d27689`

### L0 — Diagnosis (no changes)

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

### L1 — Structural refactor (Codex)

Decision: **NO CHANGE**

- Existing block order already follows imports → config → helpers → registerIpc → exports; reordering would not improve scanning.
- Helpers nested inside registerIpc depend on resolveWindows/settingsState/log; lifting them would add indirection.
- IPC handlers are grouped by feature and flow; reordering could subtly affect initialization/timing expectations.
- Default preset loading has intentional fallback paths; merging helpers risks altering edge-case behavior.
- Structural edits would not reduce branching or cognitive load enough to justify change.

### L2 — Clarity / robustness refactor (Codex)

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

### L3 — Architecture / contract changes (Codex, rerun with repo-wide consumer scan)

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

### L4 — Logs (policy-driven tuning) (Codex)

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

### L5 — Comments (QA follow-up) (Codex)

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

### L6 — Final review (Codex)

Decision: **CHANGED** (comments-only)

Observed changes (diff-based):
- Fixed JSDoc drift in `registerIpc` params: `opts.getWindows` shape now lists `flotanteWin` (was `floatingWin`), aligning documentation with actual window naming used by callers.

Reviewer assessment (sufficiency & inference quality):
- The change is justified as a documentation drift fix, and it is comments-only (so contract/timing are preserved by construction).

Evidence:
- Diff: `electron/presets_main.js` (JSDoc line in `registerIpc` opts.getWindows shape).

### L7 — Smoke test (humano) — `electron/presets_main.js`

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

## electron/menu_builder.js

Date: `2026-01-21`
Last commit: `12ba2bc6346aedee364aea3080a6ade0e502ea55`

### L0 — Diagnosis (no changes) (Codex, follow-up re-run; verified)

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

### L1 — Structural refactor (Codex)

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

### L2 — Clarity / robustness refactor (Codex)

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

### L3 — Architecture / contract changes (Codex) (follow-up re-run: evidence completeness)

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

### L4 — Logs (policy-driven tuning) (Codex)

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

### L5 — Comments (reader-oriented, `electron/main.js` style) (Codex)

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

### L6 — Final review (coherence + leftover cleanup after refactors) (Codex)

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

### L7 — Smoke test (humano) — `electron/menu_builder.js` (cambio-focalizado: L4 logging/dedupe + i18n load)

Result: Pass

- [x] (1) Arranque + idle 20–30s con logs visibles: sin ERROR/uncaught; sin spam repetitivo.
- [x] (2) Menu actions x3 (rutas sanas): cada accion hace lo esperado (abre modal/ventana/seccion); NO aparece `menu-click failed (ignored): ...`.
- [x] (3) Menu -> About: abre correctamente; NO aparece `menu-click failed (ignored): ...`.
- [x] (4) Menu -> Actualizar version (si existe): aparece resultado/dialogo; sin crash.
- [x] (5) Cambio de idioma por flujo normal: UI/menu siguen correctos; NO aparecen warnings i18n tipo “Failed to load/parse main.json…” / “main.json is empty…”.
- [x] (6) Repetir 1 accion post-idioma: funciona (sin regresion).
- [c] (7) Cerrar y relanzar: menu sigue operativo; idioma persiste si aplica; repetir About o 1 accion OK.

---

## electron/updater.js

Date: `2026-01-22`
Last commit: `f29062b2ac374c073a462fb67710ff64114e8c91`

### L0 — Diagnosis (no changes)

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

### IPC contract (only what exists in this file)

A) Explicit IPC in this file:
- `ipcMain.handle('check-for-updates', async () => ...)`
  - Input shape: sin args (handler no recibe/usa parámetros).
  - Return shape: `{ ok: true }` o `{ ok: false, error: string }`.
  - Outgoing sends: none (no `webContents.send` en este módulo).

B) Delegated registration:
- None

### L1 decision: CHANGED

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

### L2 decision: NO CHANGE

- Rationale (Codex):
  - L1 ya removió la duplicación principal (diálogo de falla manual) sin introducir indirection excesiva.
  - El resto del flujo son early-returns por outcomes de SemVer/red/tag; consolidarlos arriesga ocultar puntos de decisión.
  - Manejo de errores y logging ya es explícito y proporcional; “mejorarlo” tendería a ser ruido o cambio observable.
  - IPC es minimalista; tocarlo puede afectar readiness/races.

Reviewer assessment (sufficiency & interpretation quality):
- PASS (NO CHANGE), coherente con el estado del archivo y con el riesgo/beneficio esperado de L2.
- Confirmado: diff vacío (sin cambios aplicados).
- Nota menor: el reporte resume “warn por ruta de falla” de forma algo no literal, pero sin impacto práctico.

### L3 decision: CHANGED (IPC contract drift fix)

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

### L4 decision: NO CHANGE

- Logging mechanism: main-process logger `Log.get('updater')` (consistente con política).
- Fallbacks/errores recoverables ya registran `warn` (fetch/status, parse JSON, red, SemVer inválido, tag sin prefijo `v`).
- No se justifica `warnOnce/errorOnce`: no hay eventos evidentes de alta frecuencia donde dedupe mejore señal/ruido.
- No se justifica subir a `error`: fallos de update-check son recoverables y no rompen invariantes del runtime.

Observable contract/timing preserved (no code changes).

### L5 decision: CHANGED (comments-only)

- Reemplazo de header obsoleto por "Overview" con responsabilidades (3–7 items).
- Se agregan divisores de sección que calzan con el orden real del archivo: imports/logger, constants/config, shared state, helpers, update flow, lifecycle, IPC, exports.
- Se agrega marcador explícito de fin de archivo ("End of electron/updater.js").
- No functional changes; comments-only.

### L6 — Final review (Codex)

Decision: **NO CHANGE**

No Level 6 changes justified.
- Checked helper usage in `checkForUpdates` (e.g., `shouldShowManualDialog`) for leftover duplication; no safe simplification without adding indirection.
- Checked IPC handler payload parsing (`ipcMain.handle('check-for-updates', async (_event, payload = {}) =>`) and return shapes; consistent.
- Checked manual vs auto flow (`checkForUpdates({ manual: false })`) and dialog gating (`manual && mainWin && !mainWin.isDestroyed()`); consistent.
- Checked logging calls (`log.warn('Latest release fetch failed with status:'`) against `electron/log.js` API; signatures match.
- Checked comments vs code (`// Update flow (manual vs auto)` and `// App lifecycle / bootstrapping`); no drift.

Observable contract and timing were preserved (no code changes).

### L7 — Smoke (human-run; minimal)

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

## electron/link_openers.js

Date: `2026-01-22`
Last commit: `f1e3a74aa5abc2d2cf221d8b2267b8056c8bf7b1`

### L0 — Diagnosis (no changes)

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

### L1 — Structural refactor (Codex)

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

### L2 decision: CHANGED

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

### L3 — Architecture / contract changes (Codex)

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

### L4 — Logs (Codex)

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

### L5 — Comments (Codex)

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

### L6 — Final review (Codex)

* **Decision: NO CHANGE**
* “No Level 6 changes justified.”
* Bullets (recomendado que queden anclados al código actual):

  * `getTempDir(app, log)` solo se usa vía `copyToTemp(...)`; no hay drift de firma interna. 
  * `warnOnce('link_openers.tempPath.fallback', ...)` usa key estable y respeta la firma `warnOnce(key, ...args)` de `electron/log.js`. 
  * IPC handlers presentes: `'open-external-url'` y `'open-app-doc'`; retornan `{ ok: true }` o `{ ok: false, reason }`. 
  * Apertura de paths centralizada en `openPathWithLog`. 
  * Nota explícita: “Se mantiene y acepta el *residual edge-case* ya documentado (return de Promise sin await en `openPathWithLog`); no se modifica en L6.” 

### L7 — Smoke (human-run; minimal, dev)

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

## electron/constants_main.js

Date: `2026-01-22`
Last commit: `92046dea3482a910ece96c7d10b0ddb5ce61a7f4`

### L0 — Minimal diagnosis (Codex)

- Block order: strict mode; constants/config; module.exports.
- Linear reading breaks: none observed; single responsibility constants.
- Exposes (CommonJS): `DEFAULT_LANG`, `MAX_TEXT_CHARS`, `MAX_IPC_MULTIPLIER`, `MAX_IPC_CHARS`, `MAX_PRESET_STR_CHARS`, `MAX_META_STR_CHARS`.
- Invariants: `MAX_IPC_CHARS` derived from `MAX_TEXT_CHARS` (safety cap for IPC payload size).
- IPC: none declared in this file.

Result: PASS

### L1–L7

Decision: NO CHANGE (file is constants-only; no behavior/IPC/timing surface to refactor or smoke-test at module level).

Result: PASS

---

## public/renderer.js

Date: `2026-01-23`
Last commit: `f011c4d4288c5cde9caffae0e3646f894f15e980`

### L0 — Minimal diagnosis (Codex, verified)

Source: `tools_local/codex_reply.md` (local only; do not commit)

#### 0.1 Reading map
- Block order (high-level): strict/log + globals; DOM grabs; state/cache + i18n wiring; `applyTranslations`; early async init (config/settings); counting/preset/format hookups; helpers (`contarTexto`, `normalizeText`, `setModoConteo`); `updatePreviewAndResults` + `setCurrentTextAndUpdateUI`; crono state listener; `loadPresets`; main async init IIFE (current text, subscriptions, settings handler, precise toggle, info modal, menu actions); UI event listeners; stopwatch UI + loader helpers + crono controller init.
- Linear reading obstacles (identifier + micro-quote):
  - `applyTranslations` — “const labelsCrono = getCronoLabels();”
  - `settingsChangeHandler` — “const settingsChangeHandler = async (newSettings) => {”
  - `showInfoModal` — “async function showInfoModal(key, opts = {})”
  - `window.menuActions.registerMenuAction` — “window.menuActions.registerMenuAction('guia_basica', () => {”

#### 0.2 Contract map
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

##### IPC contract (explicit ipcMain/ipcRenderer/webContents calls)
- None found in this file (direct calls).

##### Delegated IPC registration
- None observed.

Reviewer assessment (L0 protocol compliance):
- PASS. Diagnosis-only; no invented direct IPC; obstacles include identifiers + micro-quotes; invariants anchored to visible checks/fallbacks.
- Note: direct `ipcRenderer/*` absence is expected because this file uses `window.electronAPI` as IPC façade.

### L1 — Structural refactor and cleanup (Codex)

Decision: NO CHANGE

- File mixes initialization, event wiring, and UI helpers in a single, timing-sensitive flow; reordering blocks risks altering when listeners register vs. initial async setup.
- Two top-level async IIFEs interleave config/settings load with UI boot; moving them would change sequencing that affects cache and initial render.
- Several helpers depend on state initialized earlier (e.g., AppConstants-derived limits, settingsCache, idiomaActual), so regrouping would add cross-dependencies or indirection.
- Large, cohesive sections (info modal subsystem, menuActions registration, preset CRUD) are already contiguous; further extraction would add more named concepts than it removes.
- Any cleanup meaningful enough to improve linearity would likely touch behavior-sensitive ordering of DOM updates and electronAPI subscriptions.

Reviewer assessment:
- PASS for L1 gate as NO CHANGE: rationale is consistent with timing-sensitive sequencing constraints.

### L2 — Clarity / robustness refactor (Codex)

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

### L3 — Architecture / contract changes (Codex)

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

### L4 decision: CHANGED

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

#### public/js/info_modal_links.js

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

#### Meta — Actualización de política de logging (documental)

Referencia de cambios: diff desde `e1dffe38d1e428234209c22b49d0d4f6fb4637dc`.

- `electron/log.js` y `public/js/log.js`: se añade una regla explícita de “Call-site style”:
  - Ancla: “Call logger methods directly … Do NOT introduce local aliases/wrappers …”
  - Propósito: prohibir nombres/aliases tipo `warnOnceRenderer`/`warnRenderer` y estandarizar llamadas directas.

- `docs/cleanup/cleanup_file_by_file.md`: el template de Level 4 se refuerza con:
  - Regla explícita: “Call-site style (policy): use log.warn|warnOnce|error|errorOnce directly…”
  - Paso 0.1: “Enforce call-site style: remove any local log method aliases/wrappers…”

### L5 — Comments (Codex)

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

### L6 — Final review (strict leftover removal)

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

### Checklist L7

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

## public/editor.js

Date: `2026-01-23`
Last commit: `f35685b0533e33e36e1ac69f2eadcf6e32d1eedd`

### L0 — Diagnosis (no changes)

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

### L1 — Structural micro-cleanup (redo)

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

### L2 — Clarity / robustness refactor (redo)

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

### L3 — Architecture / contract changes (Codex)

  * **Decision: NO CHANGE (no Level 3 justified)**

  * **Evidence checked (anchors):**
    * `public/editor.js` — `window.editorAPI.setCurrentText(payload)` + fallback `window.editorAPI.setCurrentText(editor.value)` (doble shape). 
    * `public/editor.js` — echo suppression `incomingMeta.source === 'editor'`. 
    * `electron/editor_preload.js` — `setCurrentText: ... invoke('set-current-text', t)`. 
    * `electron/preload.js` — `setCurrentText: ... invoke('set-current-text', text)`. 
    * `public/renderer.js` — `setCurrentText({ text: currentText, meta })` + `throw ... 'set-current-text failed'`. 
  * **Reviewer gate: PASS**
  * Nota corta: No se justifica Nivel 3: shapes coexistentes ya son parte del contrato; cambiarlo sería churn de riesgo.

### L4 — Logs

* **Call-site style (sin wrappers):** eliminación de `warnOnceEditor` y reemplazo por `log.warnOnce(...)` en call sites (anclas: `editor.select`, `focus.prevActive.*`, `setCurrentText.*`). Basado en política. 
* **showNotice:**

  * key `editor.showNotice.toastEditorText.missing` como `warnOnce` (fallback recuperable)
  * key `editor.showNotice.notifyMain.missing` como `errorOnce` (notice dropeado)
    (esto también aterriza “no silent fallbacks” + dedupe estable). 
* **Fallback no-silencioso en payload:** key `editor.setCurrentText.payload_failed` (`warnOnce`) cuando no hay `onPrimaryError`. 
* **BOOTSTRAP:** logs prefijados `BOOTSTRAP:` en fallbacks de arranque (con nota explícita de la condición “debe volverse inalcanzable post-init”). 

### L5 — Comments (Codex + redo)

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

### L6 — Final review (coherence + leftover cleanup after refactors)

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

### L7 — Smoke (human-run)

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

