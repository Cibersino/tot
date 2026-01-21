# Issue #64 — Repo-wide cleanup execution

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

### L1–L6 — Gate notes (only if changes were made)
**Evidence**
- (Qué evidencia concreta motivó el cambio; referencias a funciones/fragmentos)

**Risk**
- (Qué podría romperse; qué invariantes se preservan)

**Validation**
- (Qué revisamos estáticamente; qué flows cubre el smoke)

**L1 decision: NO CHANGE**

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

**L2 decision: CHANGED**

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

**L3 decision: NO CHANGE (no Level 3 justified)**

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

**L4 decision: NO CHANGE**

- Logger mechanism already correct for main process (`Log.get('main')`), with appropriate `log.error` in IPC handler failures.
- High-frequency/best-effort paths already use `warnOnce` with stable keys (e.g., `send.crono-state.*`, `mainWin.send.flotante-closed`, `snapWindowFullyIntoWorkArea.noWorkArea`).
- No silent fallbacks found in this file; fallbacks (language/manifest/options/workArea) already emit warn/error at appropriate levels.
- Further tuning would be marginal and risks either hiding actionable failures or adding indirection/noise.

**Risk**
- N/A (no code changes).

**Validation**
- Baseline L7 smoke checklist unchanged.

### L7 — Smoke checklist (human-run)
- [ ] `npm start` abre la app sin errores visibles.
- [ ] Ventana principal: carga UI y conteos básicos sin errores (texto vacío/no vacío).
- [ ] Flujo “primera ejecución” (si es posible simularlo): se muestra selector de idioma; elegir idioma abre ventana principal y cierra selector.
- [ ] Desde main: abrir **Editor manual**; verificar que llega texto inicial (si aplica) y que “Aplicar” impacta el texto vigente.
- [ ] Desde main: abrir **Presets modal**; verificar inicialización (`preset-init`) y que cerrar/reabrir no rompe el flujo.
- [ ] Abrir **Flotante**; togglear cronómetro; verificar que main y flotante reflejan estado (`crono-state`).
- [ ] Cerrar flotante; verificar que main recibe/reacciona al cierre (`flotante-closed`) según UX esperada.
- [ ] Verificar que acciones que dependan de `get-app-config`, `get-app-version`, `get-app-runtime-info` (si están expuestas en UI/menú) no producen errores.
