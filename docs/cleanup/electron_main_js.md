# Code Cleanup Note — electron/main.js

> Location: `docs/cleanup/electron_main_js.md`  
> Scope: This document records all evidence and decisions needed to clean, reorder, and de-legacy a single file, in two phases:
> - **Phase 1 (Safe):** no functional changes; must preserve observable behavior.
> - **Phase 2 (Risk):** may change behavior; requires targeted tests.

---

## 0) Metadata

- Target file: `electron/main.js`  
- Date started: `2025-12-12`  
- Branch: `depuracion2`  
- Baseline commit (short SHA): `54e1147`  
- Latest commit touching this cleanup: `<latest-sha>`  
- Phase 1 status: `pending`  
- Phase 2 status: `pending`

---

## 1) Step B — Evidence Pack

### B1) Top-level inventory (AST)
> Goal: prevent losing/misplacing top-level units during reordering.
> Generated from AST. Source: `electron/main.js`

#### Top-level state (global variables)
- `L42`: let mainWin
- `L43`: let editorWin
- `L44`: let presetWin
- `L45`: let langWin
- `L46`: let floatingWin
- `L47`: let currentLanguage
- `L482`: let crono
- `L488`: let cronoInterval

#### Top-level declarations
**Functions**
- `L50`: buildAppMenu()
- `L59`: registerDevShortcuts()
- `L82`: unregisterShortcuts()
- `L90`: createMainWindow()
- `L151`: createEditorWindow()
- `L228`: createPresetWindow()
- `L321`: createLanguageWindow()
- `L377`: createFloatingWindow()
- `L491`: formatTimerMs()
- `L499`: getCronoState()
- `L504`: broadcastCronoState()
- `L511`: ensureCronoInterval()
- `L523`: startCrono()
- `L532`: stopCrono()
- `L541`: resetCrono()
- `L548`: setCronoElapsed()

**Classes**
- (none)

**Variables assigned to functions**
- (none)

#### Top-level constants (non-function)
- `L2`: const app
- `L2`: const BrowserWindow
- `L2`: const globalShortcut
- `L2`: const ipcMain
- `L2`: const screen
- `L3`: const path
- `L6`: const CONFIG_DIR
- `L7`: const ensureConfigDir
- `L8`: const loadJson
- `L9`: const saveJson
- `L12`: const settingsState
- `L13`: const textState
- `L14`: const modalState
- `L15`: const menuBuilder
- `L16`: const presetsMain
- `L17`: const updater
- `L19`: const SETTINGS_FILE
- `L20`: const CURRENT_TEXT_FILE
- `L23`: const LANGUAGE_MODAL_HTML
- `L24`: const LANGUAGE_PRELOAD
- `L30`: const MAX_TEXT_CHARS
- `L373`: const FLOATER_PRELOAD
- `L375`: const FLOATER_HTML
- `L489`: const CRONO_BROADCAST_MS

#### Other top-level statements (units / side effects)
- `L26`: [ExpressionStatement] ensureConfigDir()
  - raw: ensureConfigDir();
- `L33`: [ExpressionStatement] textState.init(<object:{loadJson, saveJson, currentTextFile, settingsFile, app, maxTextChars}>)
  - raw: textState.init({ loadJson, saveJson, currentTextFile: CURRENT_TEXT_FILE, settingsFile: SETTINGS_FILE, app, maxTextChars: MAX_TEXT_CHARS, });
- `L278`: [ExpressionStatement] textState.registerIpc(ipcMain, <function>)
  - raw: textState.registerIpc(ipcMain, () => ({ mainWin, editorWin, }));
- `L284`: [ExpressionStatement] settingsState.registerIpc(ipcMain, <object:{getWindows, buildAppMenu, getCurrentLanguage, setCurrentLanguage}>)
  - raw: settingsState.registerIpc(ipcMain, { getWindows: () => ({ mainWin, editorWin, presetWin, langWin, floatingWin, }), buildAppMenu, getCurrentLanguage: () => currentLanguage, setCurrentLanguage: (lang) …
- `L304`: [ExpressionStatement] presetsMain.registerIpc(ipcMain, <object:{getWindows}>)
  - raw: presetsMain.registerIpc(ipcMain, { getWindows: () => ({ mainWin, editorWin, presetWin, langWin, floatingWin, }), });
- `L315`: [ExpressionStatement] updater.register(ipcMain, <object:{mainWinRef, currentLanguageRef}>)
  - raw: updater.register(ipcMain, { mainWinRef: () => mainWin, currentLanguageRef: () => currentLanguage, });
- `L555`: [ExpressionStatement] ipcMain.handle("crono-get-state", <function>)
  - raw: ipcMain.handle('crono-get-state', () => { return getCronoState(); });
- `L559`: [ExpressionStatement] ipcMain.on("crono-toggle", <function>)
  - raw: ipcMain.on('crono-toggle', () => { try { if (crono.running) stopCrono(); else startCrono(); } catch (e) { console.error("Error en crono-toggle:", e); } });
- `L567`: [ExpressionStatement] ipcMain.on("crono-reset", <function>)
  - raw: ipcMain.on('crono-reset', () => { try { resetCrono(); } catch (e) { console.error("Error en crono-reset:", e); } });
- `L571`: [ExpressionStatement] ipcMain.on("crono-set-elapsed", <function>)
  - raw: ipcMain.on('crono-set-elapsed', (_ev, ms) => { try { setCronoElapsed(ms); } catch (e) { console.error("Error en crono-set-elapsed:", e); } });
- `L576`: [ExpressionStatement] ipcMain.handle("floating-open", <function>)
  - raw: ipcMain.handle('floating-open', async () => { try { await createFloatingWindow(); try { broadcastCronoState(); } catch (e) {/*noop*/ } if (crono.running) ensureCronoInterval(); return { ok: true }; }…
- `L589`: [ExpressionStatement] ipcMain.handle("floating-close", <function>)
  - raw: ipcMain.handle('floating-close', async () => { try { if (floatingWin && !floatingWin.isDestroyed()) { floatingWin.close(); floatingWin = null; } return { ok: true }; } catch (e) { console.error("Erro…
- `L603`: [ExpressionStatement] ipcMain.on("flotante-command", <function>)
  - raw: ipcMain.on('flotante-command', (_ev, cmd) => { try { if (!cmd || !cmd.cmd) return; if (cmd.cmd === 'toggle') { if (crono.running) stopCrono(); else startCrono(); } else if (cmd.cmd === 'reset') { res…
- `L620`: [ExpressionStatement] ipcMain.handle("open-editor", <function>)
  - raw: ipcMain.handle("open-editor", () => { if (!editorWin || editorWin.isDestroyed()) { createEditorWindow(); } else { editorWin.show(); try { const initialText = textState.getCurrentText(); editorWin.web…
- `L648`: [ExpressionStatement] ipcMain.handle("open-preset-modal", <function>)
  - raw: ipcMain.handle('open-preset-modal', (_event, payload) => { if (!mainWin) return; let initialData = {}; if (typeof payload === 'number') { initialData = { wpm: payload }; } else if (payload && typeof …
- `L660`: [ExpressionStatement] ipcMain.handle("get-app-config", <function>)
  - raw: ipcMain.handle("get-app-config", async () => { try { return { ok: true, maxTextChars: MAX_TEXT_CHARS }; } catch (e) { console.error("Error procesando get-app-config:", e); return { ok: false, error: …
- `L671`: [ExpressionStatement] app.whenReady().then(<function>)
  - raw: app.whenReady().then(() => { // Initial load of settings (normalized and persisted) via settingsState const settings = settingsState.init({ loadJson, saveJson, settingsFile: SETTINGS_FILE, }); curren…
- `L708`: [ExpressionStatement] app.on("window-all-closed", <function>)
  - raw: app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
- `L712`: [ExpressionStatement] app.on("will-quit", <function>)
  - raw: app.on("will-quit", () => { // Development shortcuts unregisterShortcuts(); // Clearing the stopwatch try { if (cronoInterval) { clearInterval(cronoInterval); cronoInterval = null; } } catch (e) { co…

---

### B2) Contract Lock
> Contract lock = externally observable “interfaces” that must not change in Phase 1:
> IPC channels, event names, storage keys, file paths, menu action IDs, etc.
> Generated from AST. Source: `electron/main.js`

#### IPC — ipcMain.handle
- Total calls: 6
- Unique keys: 6

- `crono-get-state` — 1 call(s): L555
- `floating-close` — 1 call(s): L589
- `floating-open` — 1 call(s): L576
- `get-app-config` — 1 call(s): L660
- `open-editor` — 1 call(s): L620
- `open-preset-modal` — 1 call(s): L648

#### IPC — ipcMain.on
- Total calls: 4
- Unique keys: 4

- `crono-reset` — 1 call(s): L567
- `crono-set-elapsed` — 1 call(s): L571
- `crono-toggle` — 1 call(s): L559
- `flotante-command` — 1 call(s): L603

#### IPC — ipcMain.once
- Total calls: 1
- Unique keys: 1

- `language-selected` — 1 call(s): L683

#### IPC — ipcRenderer.invoke
- Total calls: 0
- Unique keys: 0

- (none)

#### IPC — ipcRenderer.on
- Total calls: 0
- Unique keys: 0

- (none)

#### Renderer events — webContents.send
- Total calls: 10
- Unique keys: 5

- `crono-state` — 3 call(s): L506, L507, L508
- `flotante-closed` — 1 call(s): L472
- `manual-editor-ready` — 2 call(s): L209, L636
- `manual-init-text` — 2 call(s): L198, L627
- `preset-init` — 2 call(s): L235, L266

#### Menu action IDs / routing keys (via `webContents.send("menu-click", <id>)`)
- Total calls: 0
- Unique keys: 0

- (none)

#### Persistent storage filenames (via `path.join(CONFIG_DIR, "*.json")`)
- Total calls: 2
- Unique keys: 2

- `current_text.json` — 1 call(s): L20 (bound: CURRENT_TEXT_FILE)
- `user_settings.json` — 1 call(s): L19 (bound: SETTINGS_FILE)

#### Delegated IPC registration calls (first arg: ipcMain)
- Total calls: 4
- Unique keys: 4

- `presetsMain.registerIpc` — 1 call(s): L304 (keys: getWindows)
- `settingsState.registerIpc` — 1 call(s): L284 (keys: buildAppMenu, getCurrentLanguage, getWindows, setCurrentLanguage)  
- `textState.registerIpc` — 1 call(s): L278 (keys: editorWin, mainWin)
- `updater.register` — 1 call(s): L315 (keys: currentLanguageRef, mainWinRef)

#### Exports (module.exports / exports.*)
- Total calls: 0
- Unique keys: 0

- (none)

### B2.1) Raw match map (auto)
> Auto-generated navigation map. Paste only what you actually use for navigation.

- Pattern: `ipcMain.handle(`
  - Count: 6
  - Key matches:
    - `L555`: `ipcMain.handle('crono-get-state', () => { return getCronoState(); })`
    - `L576`: `ipcMain.handle('floating-open', async () => { try { await createFloatingWindow(); try { broadcastCronoState(); } catch (e) {/*noop*/ } if (crono.running) ensureCronoInterval(); return { ok: true }; } catch (e) { console.error("Error…`
    - `L589`: `ipcMain.handle('floating-close', async () => { try { if (floatingWin && !floatingWin.isDestroyed()) { floatingWin.close(); floatingWin = null; } return { ok: true }; } catch (e) { console.error("Error procesando floating-close:", e);…`
    - `L620`: `ipcMain.handle("open-editor", () => { if (!editorWin || editorWin.isDestroyed()) { createEditorWindow(); } else { editorWin.show(); try { const initialText = textState.getCurrentText(); editorWin.webContents.send("manual-init-text", {…`
    - `L648`: `ipcMain.handle('open-preset-modal', (_event, payload) => { if (!mainWin) return; let initialData = {}; if (typeof payload === 'number') { initialData = { wpm: payload }; } else if (payload && typeof payload === 'object') { initialData =…`
    - `L660`: `ipcMain.handle("get-app-config", async () => { try { return { ok: true, maxTextChars: MAX_TEXT_CHARS }; } catch (e) { console.error("Error procesando get-app-config:", e); return { ok: false, error: String(e), maxTextChars: 1e7 }; } })`
- Pattern: `ipcMain.on(`
  - Count: 4
  - Key matches:
    - `L559`: `ipcMain.on('crono-toggle', () => { try { if (crono.running) stopCrono(); else startCrono(); } catch (e) { console.error("Error en crono-toggle:", e); } })`
    - `L567`: `ipcMain.on('crono-reset', () => { try { resetCrono(); } catch (e) { console.error("Error en crono-reset:", e); } })`
    - `L571`: `ipcMain.on('crono-set-elapsed', (_ev, ms) => { try { setCronoElapsed(ms); } catch (e) { console.error("Error en crono-set-elapsed:", e); } })`
    - `L603`: `ipcMain.on('flotante-command', (_ev, cmd) => { try { if (!cmd || !cmd.cmd) return; if (cmd.cmd === 'toggle') { if (crono.running) stopCrono(); else startCrono(); } else if (cmd.cmd === 'reset') { resetCrono(); } else if (cmd.cmd === 'set'…`
- Pattern: `ipcMain.once(`
  - Count: 1
  - Key matches:
    - `L683`: `ipcMain.once("language-selected", (_evt, lang) => { try { if (!mainWin) createMainWindow(); } catch (e) { console.error("Error creando mainWin tras seleccionar idioma:", e); } finally { try { if (langWin && !langWin.isDestroyed())…`
- Pattern: `webContents.send(`
  - Count: 10
  - Key matches:
    - `L198`: `editorWin.webContents.send("manual-init-text", { text: initialText || "", meta: { source: "main", action: "init" } })`
    - `L209`: `mainWin.webContents.send("manual-editor-ready")`
    - `L235`: `presetWin.webContents.send('preset-init', initialData || {})`
    - `L266`: `presetWin.webContents.send('preset-init', initialData || {})`
    - `L472`: `mainWin.webContents.send('flotante-closed')`
    - `L506`: `mainWin.webContents.send('crono-state', state)`
    - `L507`: `floatingWin.webContents.send('crono-state', state)`
    - `L508`: `editorWin.webContents.send('crono-state', state)`
    - `L627`: `editorWin.webContents.send("manual-init-text", { text: initialText || "", meta: { source: "main", action: "init" }, })`
    - `L636`: `mainWin.webContents.send("manual-editor-ready")`
- Pattern: `path.join(CONFIG_DIR,`
  - Count: 2
  - Key matches:
    - `L19`: `path.join(CONFIG_DIR, 'user_settings.json')`
    - `L20`: `path.join(CONFIG_DIR, 'current_text.json')`
- Pattern: `*.registerIpc(ipcMain,`
  - Count: 3
  - Key matches:
    - `L278`: `textState.registerIpc(ipcMain, () => ({ mainWin, editorWin, }))`
    - `L284`: `settingsState.registerIpc(ipcMain, { getWindows: () => ({ mainWin, editorWin, presetWin, langWin, floatingWin, }), buildAppMenu, getCurrentLanguage: () => currentLanguage, setCurrentLanguage: (lang) => { const trimmed = lang && typeof lang…`
    - `L304`: `presetsMain.registerIpc(ipcMain, { getWindows: () => ({ mainWin, editorWin, presetWin, langWin, floatingWin, }), })`
- Pattern: `*.register(ipcMain,`
  - Count: 1
  - Key matches:
    - `L315`: `updater.register(ipcMain, { mainWinRef: () => mainWin, currentLanguageRef: () => currentLanguage, })`      

---

### B3) Candidate Ledger (triaged; label-sorted; theme-grouped; evidence-gated)
> Triaged from auto-scan of `electron/main.js`. No edits allowed until repo evidence is filled (VS Code gating).

#### P2-CONTRACT (13)

##### CONTRACT:CRONO:set-elapsed (2)
- **L549**
  - Primary Theme: `CONTRACT:CRONO:set-elapsed`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L549`: `const n = Number(ms) || 0;`
  - Why: Current fallback collapses invalid/NaN to `0`, which silently resets elapsed. Contract decision requires fail-safe ignore on invalid/negative.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (function `setCronoElapsed`)
    - Repo search (Ctrl+Shift+F): TODO (strings: `crono-set-elapsed`, `flotante-command`)
    - Suggested queries: `setCronoElapsed`, `'crono-set-elapsed'`, `'flotante-command'`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback (validate numeric + `>= 0`; on invalid/negative => early-return without mutating `crono.elapsed`)
  - Risk notes / dependencies: Affects all callers (`crono-set-elapsed`, `flotante-command` set, any internal calls). Must preserve payload/event names.

- **L611**
  - Primary Theme: `CONTRACT:CRONO:set-elapsed`
  - Type: `fallback (defaulting) + duplication (double coercion)`
  - Tags: `near_contract`
  - Local evidence: `L611`: `setCronoElapsed(Number(cmd.value) || 0);`
  - Why: Duplicates coercion/defaulting and can mask invalid payload origin; also violates fail-safe ignore by forcing 0.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`setCronoElapsed`)
    - Repo search (Ctrl+Shift+F): TODO (`'flotante-command'`)
    - Suggested queries: `'flotante-command'`, `Number(cmd.value)`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: remove double coercion and align with fail-safe rule (either pass through raw `cmd.value` to a single validator or validate here; invalid/negative => ignore)
  - Risk notes / dependencies: Tightening validation changes behavior for malformed `cmd.value` (intended).

##### CONTRACT:IPC_HANDLE:floating-open (1)
- **L579**
  - Primary Theme: `CONTRACT:IPC_HANDLE:floating-open`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Local evidence: `L579`: `try { broadcastCronoState(); } catch (e) {/*noop*/ }`
  - Why: Swallows errors and forces `{ ok: true }` path even if broadcast fails; also redundant because `broadcastCronoState()` already swallows per-window send.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`broadcastCronoState`)
    - Repo search (Ctrl+Shift+F): TODO (`'floating-open'`)
    - Suggested queries: `'floating-open'`, `broadcastCronoState`
  - Proposed action:
    - Phase 1: none
    - Phase 2: remove nested noop catch OR replace with controlled debug logging
  - Risk notes / dependencies: Removing swallow may cause `floating-open` to return `{ ok:false }` in edge failures.

##### CONTRACT:IPC_ONCE:language-selected (2)
- **L678**
  - Primary Theme: `CONTRACT:IPC_ONCE:language-selected`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L678`: `currentLanguage = settings.language || "es";`
  - Why: Defaults language; treats empty string as unset. Likely intended.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`currentLanguage` usage)
    - Repo search (Ctrl+Shift+F): TODO (`'language-selected'`, `currentLanguage =`)
    - Suggested queries: `'language-selected'`, `currentLanguage`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none (unless you want stricter normalization/trim guarantees here)
  - Risk notes / dependencies: Changing fallback can alter first-run UX and persisted language.

- **L691-693**
  - Primary Theme: `CONTRACT:IPC_ONCE:language-selected`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Local evidence: `L691-693`: `} catch (e) { /* noop */ }`
  - Why: Silent failure closing `langWin` could hide lifecycle bugs.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`createLanguageWindow`, `langWin`)
    - Repo search (Ctrl+Shift+F): TODO (`langWin.close`, `'language-selected'`)
    - Suggested queries: `langWin.close`, `'language-selected'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: replace noop with debug-level log (guarded) or remove if provably safe
  - Risk notes / dependencies: Logging policy; do not introduce noisy logs in Phase 1.

##### CONTRACT:SEND:crono-state (3)
- **L506**
  - Primary Theme: `CONTRACT:SEND:crono-state`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Local evidence: `L506`: `try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - Why: Silences send failures; might hide renderer lifecycle mismatch.
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`'crono-state'`)
    - Suggested queries: `'crono-state'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: consolidate into `safeSend(win, channel, payload)` (keeping swallow or adding guarded debug)
  - Risk notes / dependencies: Any change must preserve event name + payload shape.

- **L507**
  - Primary Theme: `CONTRACT:SEND:crono-state`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Local evidence: `L507`: `try { if (floatingWin && !floatingWin.isDestroyed()) floatingWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - Repo evidence: TODO (VS Code) — same as above
  - Proposed action: Phase 1 none; Phase 2 consolidate
  - Risk notes / dependencies: same as above

- **L508**
  - Primary Theme: `CONTRACT:SEND:crono-state`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Local evidence: `L508`: `try { if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - Repo evidence: TODO (VS Code) — same as above
  - Proposed action: Phase 1 none; Phase 2 consolidate
  - Risk notes / dependencies: same as above

##### CONTRACT:SEND:flotante-closed (1)
- **L472**
  - Primary Theme: `CONTRACT:SEND:flotante-closed`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Local evidence: `L472`: `try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }`
  - Why: Silent failure can desync renderer state cleanup after floating window close.
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`'flotante-closed'`)
    - Suggested queries: `'flotante-closed'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: consolidate to `safeSend` (optional guarded debug)
  - Risk notes / dependencies: Must preserve channel string.

##### CONTRACT:SEND:manual-init-text (2)
- **L199**
  - Primary Theme: `CONTRACT:SEND:manual-init-text`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L199`: `text: initialText || "",`
  - Why: Forces string payload; likely correct defensive behavior.
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`'manual-init-text'`)
    - Suggested queries: `'manual-init-text'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none (unless you decide empty string should be distinguishable from “unset”)
  - Risk notes / dependencies: Payload shape is part of contract.

- **L628**
  - Primary Theme: `CONTRACT:SEND:manual-init-text`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L628`: `text: initialText || "",`
  - Repo evidence: TODO (VS Code) — same as above
  - Proposed action: Phase 1 none; Phase 2 none
  - Risk notes / dependencies: same as above

##### CONTRACT:SEND:preset-init (2)
- **L235**
  - Primary Theme: `CONTRACT:SEND:preset-init`
  - Type: `fallback (defaulting)`
  - Tags: `touches_contract`
  - Local evidence: `L235`: `presetWin.webContents.send('preset-init', initialData || {});`
  - Why: Ensures object payload; may mask invalid/undefined initialData callers.
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`'preset-init'`)
    - Suggested queries: `'preset-init'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: decide whether `{}` is acceptable default or should reject invalid payload
  - Risk notes / dependencies: Renderer modal expects a stable payload shape.

- **L266**
  - Primary Theme: `CONTRACT:SEND:preset-init`
  - Type: `fallback (defaulting)`
  - Tags: `touches_contract`
  - Local evidence: `L266`: `presetWin.webContents.send('preset-init', initialData || {});`
  - Repo evidence: TODO (VS Code) — same as above
  - Proposed action: Phase 1 none; Phase 2 as above
  - Risk notes / dependencies: same as above


#### P2-SIDEFX (2)

##### MISC:FLOATING_WINDOW_BOUNDS (2)
- **L382**
  - Primary Theme: `MISC:FLOATING_WINDOW_BOUNDS`
  - Type: `fallback (error swallow) + fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L382`: `try { floatingWin.setBounds({ x: options.x || floatingWin.getBounds().x, y: options.y || floatingWin.getBounds().y }); } catch (e) { /* noop */ }`
  - Why: `||` drops valid `0` coordinates; noop catch hides geometry failures; current behavior does not guarantee “always 100% inside workArea”.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`createFloatingWindow`)
    - Repo search (Ctrl+Shift+F): TODO (`setBounds`, `createFloatingWindow(`)
    - Suggested queries: `createFloatingWindow`, `setBounds({ x: options.x`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback (do not use `||` for coords; allow 0) + enforce clamp to workArea after applying bounds.
  - Risk notes / dependencies: Placement logic must be tested under DPI/scaling and multi-monitor. Display selection: simplest; if tie, use window center.

- **L463-465**
  - Primary Theme: `MISC:FLOATING_WINDOW_BOUNDS`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Local evidence: `L463-465`: `} catch (e) { // noop }`
  - Why: Swallows exceptions in the “keep inside screen” clamp; failures become silent offscreen/partially offscreen windows, violating the workArea constraint.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`createFloatingWindow`)
    - Repo search (Ctrl+Shift+F): TODO (`getDisplayMatching`, `workArea`)
    - Suggested queries: `getDisplayMatching`, `workArea`, `offscreen`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: narrow try scope + enforce clamp deterministically (and optionally guarded debug log; avoid noisy logs)
  - Risk notes / dependencies: Geometry code is timing-sensitive (display metrics, bounds after load).


#### P2-FALLBACK (2)

##### PATTERN:DEFAULT_OR (1)
- **L51**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L51`: `const effectiveLang = lang || currentLanguage || "es";`
  - Why: Ensures a usable language code for menu building.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`buildAppMenu`)
    - Repo search (Ctrl+Shift+F): TODO (`buildAppMenu(`, `effectiveLang`)
    - Suggested queries: `buildAppMenu`, `effectiveLang`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Low; keep as defensive defaulting.

##### PATTERN:TRY_NOOP (1)
- **L323**
  - Primary Theme: `PATTERN:TRY_NOOP`
  - Type: `fallback (error swallow)`
  - Local evidence: `L323`: `try { langWin.focus(); } catch (e) { /* noop */ }`
  - Why: Silent failure can hide unexpected destroyed/invalid window state.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`createLanguageWindow`)
    - Repo search (Ctrl+Shift+F): TODO (`langWin.focus`)
    - Suggested queries: `langWin.focus`, `createLanguageWindow`
  - Proposed action:
    - Phase 1: none
    - Phase 2: optional guarded debug log (avoid noise)
  - Risk notes / dependencies: Logging policy only; functional impact minimal.

---

## 2) Phase 1 (Safe) — Plan and Patch Notes

### Phase 1 definition
- Allowed:
  - Reorder into sections (without changing execution order of side effects).
  - Deduplicate comments; translate comments to English.
  - Rename local variables ONLY if provably internal and no reflection/dynamic access.
  - Extract purely mechanical helpers ONLY if no side effects and no API changes.
- Not allowed:
  - Removing any handler, listener, or contract.
  - Changing defaults/fallback behavior.
  - Changing timing/ordering of initialization that can affect runtime.

### Phase 1 checklist (pre)
- [ ] Contract Lock reviewed and captured (B2).
- [ ] File runs / app starts from baseline commit.
- [ ] “Smoke test” defined (see below).

### Phase 1 patch log
- Commit: `<SHA>`
- Summary (bullet list):
  - `<change>`
  - `<change>`

### Phase 1 smoke tests (must be specific)
- Test 1: `<action>` → expected `<result>`
- Test 2: `<action>` → expected `<result>`

### Phase 1 checklist (post)
- [ ] Contract Lock unchanged (diff B2 / lock snapshot).
- [ ] Smoke tests pass.
- [ ] No new warnings/errors in console relevant to this file.

---

## 3) Phase 2 (Risk) — Plan and Patch Notes

### Phase 2 definition
- Allowed:
  - Remove legacy blocks (with evidence).
  - Consolidate duplicates that change structure.
  - Change fallbacks (only with explicit tests).
  - Refactor IPC handlers (only with explicit tests).

### Phase 2 test plan (targeted)
> Each Phase 2 change must have a test that would fail if the change were incorrect.

- Change A: `<candidate>`  
  - Test: `<action>` → expected `<result>`
- Change B: `<candidate>`  
  - Test: `<action>` → expected `<result>`

### Phase 2 patch log
- Commit: `<SHA>`
- Summary:
  - `<change>`
  - `<change>`

### Phase 2 checklist (post)
- [ ] All targeted tests pass.
- [ ] App behavior matches intended new behavior.
- [ ] Any removed contracts are documented (and removed everywhere).

---

## 4) Open Questions / Decisions

- Q1: `<question>`  
  - Decision: `<pending | decided>`  
  - Rationale: `<short>`
- Q2: `<question>`  
  - Decision: `<pending | decided>`  
  - Rationale: `<short>`

---

## 5) Appendix — Repro commands / tooling notes (optional)

- Task(s) used: `<VS Code task label(s)>`
- Local tooling used (must stay in /tools_local): `<tooling>`
- Notes about limitations or false positives: `<...>`
