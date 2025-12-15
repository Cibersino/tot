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

### B2.2) Repo contract cache sync (mandatory)

- Repo cache file: `docs/cleanup/_repo_contract_usage.md`
- Repo search method: VS Code Ctrl+Shift+F
  - Scope rule: restrict search to code folders (e.g. `electron/**,public/**`) and exclude `docs/cleanup/**` to avoid cache self-matches.

Per-key verification (B2 Contract Lock → repo cache):

#### IPC — ipcMain.handle
- `crono-get-state`
  - Cache: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified-at: `1d06c2a`
- `floating-open`
  - Cache: `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes one non-contract match in error log string (main.js)
- `floating-close`
  - Cache: `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes one non-contract match in error log string (main.js)
- `open-editor`
  - Cache: `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes one non-contract match in error log string (main.js)
- `open-preset-modal`
  - Cache: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified-at: `1d06c2a`
- `get-app-config`
  - Cache: `4` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes one non-contract match in error log string (main.js)

#### IPC — ipcMain.on
- `crono-toggle`
  - Cache: `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes one non-contract match in error log string (main.js)
- `crono-reset`
  - Cache: `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes one non-contract match in error log string (main.js)
- `crono-set-elapsed`
  - Cache: `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes one non-contract match in error log string (main.js)
- `flotante-command`
  - Cache: `3` matches in `2` files (top: `electron/main.js`, `electron/flotante_preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes one non-contract match in error log string (main.js)

#### IPC — ipcMain.once
- `language-selected`
  - Cache: `2` matches in `2` files (top: `electron/main.js`, `electron/language_preload.js`)
  - Verified-at: `1d06c2a`

#### Renderer events — webContents.send / equivalents
- `crono-state`
  - Cache: `12` matches in `5` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`, `public/renderer.js`, `public/flotante.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes non-contract matches in logs/comments (preloads/renderer/flotante)
- `flotante-closed`
  - Cache: `8` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes non-contract matches in comments/logs (preloads)
- `manual-editor-ready`
  - Cache: `7` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes non-contract matches in warn/error logs (main/preload)
- `manual-init-text`
  - Cache: `5` matches in `2` files (top: `electron/main.js`, `electron/manual_preload.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes non-contract matches in error logs (main)
- `preset-init`
  - Cache: `7` matches in `3` files (top: `electron/main.js`, `electron/preset_preload.js`, `public/preset_modal.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes non-contract matches in logs/comments (preset preload/preset modal)

#### Persistent storage filenames
- `current_text.json`
  - Cache: `2` matches in `2` files (top: `electron/main.js`, `electron/text_state.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes non-contract match in error log (text_state)
- `user_settings.json`
  - Cache: `3` matches in `2` files (top: `electron/main.js`, `electron/settings.js`)
  - Verified-at: `1d06c2a`
  - Notes: includes non-contract matches in comments (settings.js)

Pass condition: satisfied (all B2 keys present in repo cache and verified-at = `1d06c2a`).

---

### B3) Candidate Ledger (triaged; label-sorted; theme-grouped; evidence-gated)
> Triaged from auto-scan of `electron/main.js` (anchors v1.10). No edits allowed until repo evidence is filled (VS Code gating).

#### P2-CONTRACT (13)

##### CONTRACT:IPC_HANDLE:floating-open (1)
- **L576#1hed**
  - Primary Theme: `CONTRACT:IPC_HANDLE:floating-open`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Anchor evidence: `L576`: `ipcMain.handle('floating-open', async () => {`
  - Local evidence (inner): `L579`: `try { broadcastCronoState(); } catch (e) {/*noop*/ }`
  - Why: Noop catch can hide failures on a contract path; also likely redundant if downstream sends already swallow. If intentional, document why.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: `broadcastCronoState`)
    - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`) (from B2.2)
    - Suggested queries (optional): `'floating-open'`, `ipcMain.handle(`
  - Proposed action:
    - Phase 1: none
    - Phase 2: remove nested noop catch OR replace with guarded debug logging (policy-driven)
  - Risk notes / dependencies: Any change must preserve IPC key and return shape.

##### CONTRACT:IPC_ON:flotante-command (1)
- **L603#5oho**
  - Primary Theme: `CONTRACT:IPC_ON:flotante-command`
  - Type: `fallback (defaulting) + duplication (double coercion)`
  - Tags: `near_contract`
  - Anchor evidence: `L603`: `ipcMain.on('flotante-command', (_ev, cmd) => {`
  - Local evidence (inner): `L611`: `setCronoElapsed(Number(cmd.value) || 0);`
  - Why: Defaulting to `0` at the contract boundary can turn invalid payloads into a silent reset; also duplicates coercion/defaulting already present in `setCronoElapsed`.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: `setCronoElapsed`)
    - Repo search (Ctrl+Shift+F): `3` matches in `2` files (top: `electron/main.js`, `electron/flotante_preload.js`) (from B2.2)
    - Suggested queries (optional): `'flotante-command'`, `ipcMain.on(`
  - Proposed action:
    - Phase 1: none
    - Phase 2: remove double coercion; align with Q1 decision (invalid/negative handling)
  - Risk notes / dependencies: Must preserve channel name and payload schema.

##### CONTRACT:IPC_ONCE:language-selected (1)
- **L683#16ut**
  - Primary Theme: `CONTRACT:IPC_ONCE:language-selected`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Anchor evidence: `L683`: `ipcMain.once("language-selected", (_evt, lang) => {`
  - Local evidence (inner): `L691-693`: `} catch (e) { /* noop */ }`
  - Why: Noop catch can hide lifecycle failures (e.g., invalid/destroyed window) on a contract path.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: `createLanguageWindow`)
    - Repo search (Ctrl+Shift+F): `2` matches in `2` files (top: `electron/main.js`, `electron/language_preload.js`) (from B2.2)
    - Suggested queries (optional): `'language-selected'`, `ipcMain.once(`
  - Proposed action:
    - Phase 1: none
    - Phase 2: replace noop with guarded debug OR remove swallow if proven safe
  - Risk notes / dependencies: Logging policy; avoid noisy logs.

##### CONTRACT:SEND:crono-state (3)
- **L506#1nhq**
  - Primary Theme: `CONTRACT:SEND:crono-state`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Anchor evidence: `L506`: `try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - Why: Noop catch can hide failures near contract/lifecycle code. One-line catch form.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: renderer listeners for `'crono-state'`)
    - Repo search (Ctrl+Shift+F): `12` matches in `5` files (top: `electron/main.js`, `...lotante_preload.js`, `public/renderer.js`, `public/flotante.js`) (from B2.2)
    - Suggested queries (optional): `'crono-state'`, `webContents.send(`
  - Proposed action:
    - Phase 1: none
    - Phase 2: consolidate into `safeSend(win, channel, payload)` (preserve semantics)
  - Risk notes / dependencies: Must preserve event name and payload shape.

- **L507#1oz5**
  - Primary Theme: `CONTRACT:SEND:crono-state`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Anchor evidence: `L507`: `try { if (floatingWin && !floatingWin.isDestroyed()) floatingWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - Why / Repo evidence / Proposed action / Risk notes: same as L506.

- **L508#1704**
  - Primary Theme: `CONTRACT:SEND:crono-state`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Anchor evidence: `L508`: `try { if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - Why / Repo evidence / Proposed action / Risk notes: same as L506.

##### CONTRACT:SEND:flotante-closed (1)
- **L472#18y8**
  - Primary Theme: `CONTRACT:SEND:flotante-closed`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Anchor evidence: `L472`: `try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }`
  - Why: Silent failure can desync renderer state cleanup after floating window close.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: listeners for `'flotante-closed'`)
    - Repo search (Ctrl+Shift+F): `8` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`) (from B2.2)
    - Suggested queries (optional): `'flotante-closed'`, `webContents.send(`
  - Proposed action:
    - Phase 1: none
    - Phase 2: consolidate into `safeSend` (policy decision required for logging/swallow changes)
  - Risk notes / dependencies: Must preserve channel string.

##### CONTRACT:SEND:manual-init-text (2)
- **L198#15fw**
  - Primary Theme: `CONTRACT:SEND:manual-init-text`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Anchor evidence: `L198`: `editorWin.webContents.send("manual-init-text", {`
  - Local evidence (inner): `L199`: `text: initialText || "",`
  - Why: Forces a string payload; likely correct defensive behavior, but it is a contract decision (unset vs empty-string semantics).
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: receiver handling for `"manual-init-text"`)
    - Repo search (Ctrl+Shift+F): `5` matches in `2` files (top: `electron/main.js`, `electron/manual_preload.js`) (from B2.2)
    - Suggested queries (optional): `'manual-init-text'`, `webContents.send(`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none (unless decision is made to distinguish unset vs empty)
  - Risk notes / dependencies: Payload shape is contractual.

- **L627#15fw**
  - Primary Theme: `CONTRACT:SEND:manual-init-text`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Anchor evidence: `L627`: `editorWin.webContents.send("manual-init-text", {`
  - Local evidence (inner): `L628`: `text: initialText || "",`
  - Why / Repo evidence / Proposed action / Risk notes: same as L198.

##### CONTRACT:SEND:preset-init (2)
- **L235#1gi8**
  - Primary Theme: `CONTRACT:SEND:preset-init`
  - Type: `fallback (defaulting)`
  - Tags: `touches_contract`
  - Anchor evidence: `L235`: `presetWin.webContents.send('preset-init', initialData || {});`
  - Why: Ensures object payload; can mask upstream bugs if `initialData` is unexpectedly falsy or wrong type (contract decision per Q2).
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: receiver handling for `'preset-init'`)
    - Repo search (Ctrl+Shift+F): `7` matches in `3` files (top: `electron/main.js`, `electron/preset_preload.js`, `public/preset_modal.js`) (from B2.2)
    - Suggested queries (optional): `'preset-init'`, `webContents.send(`
  - Proposed action:
    - Phase 1: none
    - Phase 2: decide per Q2 (keep `{}` default vs strict validation/normalization)
  - Risk notes / dependencies: Must preserve channel name; renderer expects stable shape.

- **L266#1gi8**
  - Primary Theme: `CONTRACT:SEND:preset-init`
  - Type: `fallback (defaulting)`
  - Tags: `touches_contract`
  - Anchor evidence: `L266`: `presetWin.webContents.send('preset-init', initialData || {});`
  - Why / Repo evidence / Proposed action / Risk notes: same as L235.

##### PATTERN:DEFAULT_OR (1)
- **L678#1s0p**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L678`: `currentLanguage = settings.language || "es";`
  - Why: Defaulting via `||` treats empty string as unset; likely intended for language selection, but it is a policy choice.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: `currentLanguage`)
    - Repo search (Ctrl+Shift+F): <N> matches in <files>
    - Suggested queries (optional): `||`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Changing fallback alters first-run UX and persisted language behavior.

##### PATTERN:NUM_COERCE (1)
- **L549#pd4w**
  - Primary Theme: `PATTERN:NUM_COERCE`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L549`: `const n = Number(ms) || 0;`
  - Why: Invalid/NaN collapses to `0`, mutating state; contract-level decision required (Q1).
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: `setCronoElapsed` + callers)
    - Repo search (Ctrl+Shift+F): <N> matches in <files>
    - Suggested queries (optional): `Number(`, `|| 0`
  - Proposed action:
    - Phase 1: none
    - Phase 2: align invalid/negative handling per Q1 (single validation point; avoid silent reset if policy is fail-safe)
  - Risk notes / dependencies: Affects all callers, including IPC origins.

---

#### P2-SIDEFX (2)

##### MISC:FLOATING_WINDOW_BOUNDS (2)
- **L382#sjpk**
  - Primary Theme: `MISC:FLOATING_WINDOW_BOUNDS`
  - Type: `fallback (error swallow) + fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L382`: `try { floatingWin.setBounds({ x: options.x || floatingWin.getBounds().x, y: options.y || floatingWin.getBounds().y }); } catch (e) { /* noop */ }`
  - Why: `||` drops valid `0` coordinates; noop catch hides geometry failures; can violate “keep inside workArea” expectations.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: `createFloatingWindow`)
    - Repo search (Ctrl+Shift+F): <N> matches in <files>
    - Suggested queries (optional): `catch (`, `noop`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: replace `||` for coords with typed/nullish policy; narrow try/catch; enforce clamp deterministically
  - Risk notes / dependencies: Requires testing under DPI/scaling and multi-monitor.

- **L463#1hm2**
  - Primary Theme: `MISC:FLOATING_WINDOW_BOUNDS`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Local evidence: `L463-465`: `} catch (e) { // noop }`
  - Why: Swallows exceptions in clamp logic; failures can leave window offscreen silently.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: `createFloatingWindow`)
    - Repo search (Ctrl+Shift+F): <N> matches in <files>
    - Suggested queries (optional): `catch (`, `noop`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: narrow try scope + deterministic clamp (optional guarded debug)
  - Risk notes / dependencies: Geometry timing is fragile; must test with display changes.

---

#### P2-FALLBACK (2)

##### PATTERN:DEFAULT_OR (1)
- **L51#1f80**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L51`: `const effectiveLang = lang || currentLanguage || "es";`
  - Why: Ensures a usable language code for menu building.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: `buildAppMenu`)
    - Repo search (Ctrl+Shift+F): <N> matches in <files>
    - Suggested queries (optional): `||`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Low risk.

##### PATTERN:TRY_NOOP (1)
- **L323#1oxv**
  - Primary Theme: `PATTERN:TRY_NOOP`
  - Type: `fallback (error swallow)`
  - Local evidence: `L323`: `try { langWin.focus(); } catch (e) { /* noop */ }`
  - Why: Silent failure can hide unexpected destroyed/invalid window state; impact is usually low (focus-only), but still worth evidencing.
  - Repo evidence: <fill>
    - References (Shift+F12): <N> hits in <files> (suggest: `createLanguageWindow`)
    - Repo search (Ctrl+Shift+F): <N> matches in <files>
    - Suggested queries (optional): `catch (`, `noop`
  - Proposed action:
    - Phase 1: none
    - Phase 2: optional guarded debug log (policy-driven)
  - Risk notes / dependencies: Logging policy only.

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

- Q1: En `setCronoElapsed(ms)` y entradas relacionadas (`crono-set-elapsed`, `flotante-command`), ¿qué semántica debe regir cuando el input es inválido (`NaN`, no-numérico) o negativo?
  - Decision: `pending`
  - Rationale: Hoy `Number(x) || 0` convierte inválidos en `0` y muta estado (`crono.elapsed`), lo que puede producir “reset silencioso”. La alternativa fail-safe es **ignorar** (no mutar) ante inválidos/negativos. Esta es una decisión contractual porque afecta IPC/payloads existentes.

- Q2: En `preset-init`, cuando `initialData` es falsy/undefined o no cumple shape esperado, ¿es aceptable el default `{}` o se debe validar/normalizar estrictamente (y eventualmente rechazar/registrar)?
  - Decision: `pending`
  - Rationale: `{}` estabiliza el renderer pero puede ocultar bugs de origen. Cambiar la política puede alterar comportamiento observable del modal preset; debe quedar decidido explícitamente antes de Phase 2.

---

## 5) Appendix — Repro commands / tooling notes (optional)

- Task(s) used: `<VS Code task label(s)>`
- Local tooling used (must stay in /tools_local): `<tooling>`
- Notes about limitations or false positives: `<...>`
