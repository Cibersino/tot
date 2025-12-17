# Code Cleanup Note — electron/main.js

> Location: `docs/cleanup/electron_main_js.md`  
> Scope: This document records all evidence and decisions needed to clean, reorder, and de-legacy a single file, in two phases:
> - **Phase 1 (Safe):** no functional changes; must preserve observable behavior.
> - **Phase 2 (Risk):** may change behavior; requires targeted tests.

---

## 0) Metadata

- Target file: `electron\main.js` 
- Slug: `electron_main_js` 
- Date started: `2025-12-15`  
- Branch: `depuracion2`  
- Baseline commit (short SHA): `bc16c9a`  
- Latest commit touching this cleanup: `36fe2e1`  
- Phase 1 status: `pending`  
- Phase 2 status: `pending`

---

## 1) Step B — Evidence Pack

### B1) Top-level inventory (AST)
> Generated from AST. Source: `electron/main.js`

#### Top-level state (global variables)
- `L42`: let mainWin
- `L43`: let editorWin
- `L44`: let presetWin
- `L45`: let langWin
- `L46`: let floatingWin
- `L47`: let currentLanguage
- `L592`: let crono
- `L598`: let cronoInterval

#### Top-level declarations
**Functions**
- `L50`: buildAppMenu()
- `L59`: registerDevShortcuts()
- `L82`: unregisterShortcuts()
- `L90`: createMainWindow()
- `L151`: createEditorWindow()
- `L228`: createPresetWindow()
- `L321`: createLanguageWindow()
- `L377`: clampInt()
- `L383`: pointInRect()
- `L392`: getWindowCenter()
- `L400`: getDisplayByWindowCenter()
- `L408`: snapWindowFullyIntoWorkArea()
- `L433`: installFloatingWorkAreaGuard()
- `L499`: createFloatingWindow()
- `L601`: formatTimerMs()
- `L609`: getCronoState()
- `L614`: broadcastCronoState()
- `L621`: ensureCronoInterval()
- `L633`: startCrono()
- `L642`: stopCrono()
- `L651`: resetCrono()
- `L658`: setCronoElapsed()

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
- `L599`: const CRONO_BROADCAST_MS

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
- `L678`: [ExpressionStatement] ipcMain.handle("crono-get-state", <function>)
  - raw: ipcMain.handle('crono-get-state', () => { return getCronoState(); });
- `L682`: [ExpressionStatement] ipcMain.on("crono-toggle", <function>)
  - raw: ipcMain.on('crono-toggle', () => { try { if (crono.running) stopCrono(); else startCrono(); } catch (e) { console.error('Error in crono-toggle:', e); } });
- `L690`: [ExpressionStatement] ipcMain.on("crono-reset", <function>)
  - raw: ipcMain.on('crono-reset', () => { try { resetCrono(); } catch (e) { console.error('Error in crono-reset:', e); } });
- `L694`: [ExpressionStatement] ipcMain.on("crono-set-elapsed", <function>)
  - raw: ipcMain.on('crono-set-elapsed', (_ev, ms) => { try { setCronoElapsed(ms); } catch (e) { console.error('Error in crono-set-elapsed:', e); } });
- `L699`: [ExpressionStatement] ipcMain.handle("floating-open", <function>)
  - raw: ipcMain.handle('floating-open', async () => { try { await createFloatingWindow(); try { broadcastCronoState(); } catch (e) {/*noop*/ } if (crono.running) ensureCronoInterval(); return { ok: true }; }…
- `L712`: [ExpressionStatement] ipcMain.handle("floating-close", <function>)
  - raw: ipcMain.handle('floating-close', async () => { try { if (floatingWin && !floatingWin.isDestroyed()) { floatingWin.close(); floatingWin = null; } return { ok: true }; } catch (e) { console.error('Erro…
- `L726`: [ExpressionStatement] ipcMain.on("flotante-command", <function>)
  - raw: ipcMain.on('flotante-command', (_ev, cmd) => { try { if (!cmd || !cmd.cmd) return; if (cmd.cmd === 'toggle') { if (crono.running) stopCrono(); else startCrono(); } else if (cmd.cmd === 'reset') { res…
- `L743`: [ExpressionStatement] ipcMain.handle("open-editor", <function>)
  - raw: ipcMain.handle('open-editor', () => { if (!editorWin || editorWin.isDestroyed()) { createEditorWindow(); } else { editorWin.show(); try { const initialText = textState.getCurrentText(); editorWin.web…
- `L771`: [ExpressionStatement] ipcMain.handle("open-preset-modal", <function>)
  - raw: ipcMain.handle('open-preset-modal', (_event, payload) => { if (!mainWin) return; let initialData = {}; if (typeof payload === 'number') { initialData = { wpm: payload }; } else if (payload && typeof …
- `L783`: [ExpressionStatement] ipcMain.handle("get-app-config", <function>)
  - raw: ipcMain.handle('get-app-config', async () => { try { return { ok: true, maxTextChars: MAX_TEXT_CHARS }; } catch (e) { console.error('Error processing get-app-config:', e); return { ok: false, error: …
- `L794`: [ExpressionStatement] app.whenReady().then(<function>)
  - raw: app.whenReady().then(() => { // Initial load of settings (normalized and persisted) via settingsState const settings = settingsState.init({ loadJson, saveJson, settingsFile: SETTINGS_FILE, }); curren…
- `L831`: [ExpressionStatement] app.on("window-all-closed", <function>)
  - raw: app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
- `L835`: [ExpressionStatement] app.on("will-quit", <function>)
  - raw: app.on('will-quit', () => { // Development shortcuts unregisterShortcuts(); // Clearing the stopwatch try { if (cronoInterval) { clearInterval(cronoInterval); cronoInterval = null; } } catch (e) { co…

---

### B2) Contract Lock
> Contract lock = externally observable “interfaces” that must not change in Phase 1:
> IPC channels, event names, storage keys, file paths, menu action IDs, etc.
> Generated from AST. Source: `electron/main.js`        

#### IPC — ipcMain.handle
- Total calls: 6
- Unique keys: 6

- `crono-get-state` — 1 call(s): L678
- `floating-close` — 1 call(s): L712
- `floating-open` — 1 call(s): L699
- `get-app-config` — 1 call(s): L783
- `open-editor` — 1 call(s): L743
- `open-preset-modal` — 1 call(s): L771

#### IPC — ipcMain.on
- Total calls: 4
- Unique keys: 4

- `crono-reset` — 1 call(s): L690
- `crono-set-elapsed` — 1 call(s): L694
- `crono-toggle` — 1 call(s): L682
- `flotante-command` — 1 call(s): L726

#### IPC — ipcMain.once
- Total calls: 1
- Unique keys: 1

- `language-selected` — 1 call(s): L806

#### IPC — ipcRenderer.invoke
- Total calls: 0
- Unique keys: 0

- (none)

#### IPC — ipcRenderer.send
- Total calls: 0
- Unique keys: 0

- (none)

#### IPC — ipcRenderer.on
- Total calls: 0
- Unique keys: 0

- (none)

#### IPC — ipcRenderer.once
- Total calls: 0
- Unique keys: 0

- (none)

#### Preload boundary — contextBridge.exposeInMainWorld
- Total calls: 0
- Unique keys: 0

- (none)

#### Renderer events — webContents.send
- Total calls: 10
- Unique keys: 5

- `crono-state` — 3 call(s): L616, L617, L618
- `flotante-closed` — 1 call(s): L582
- `manual-editor-ready` — 2 call(s): L209, L759
- `manual-init-text` — 2 call(s): L198, L750
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
    - `L678`: `ipcMain.handle('crono-get-state', () => { return getCronoState(); })`
    - `L699`: `ipcMain.handle('floating-open', async () => { try { await createFloatingWindow(); try { broadcastCronoState(); } catch (e) {/*noop*/ } if (crono.running) ensureCronoInterval(); return { ok: true }; } catch (e) { console.error('Error…`
    - `L712`: `ipcMain.handle('floating-close', async () => { try { if (floatingWin && !floatingWin.isDestroyed()) { floatingWin.close(); floatingWin = null; } return { ok: true }; } catch (e) { console.error('Error processing floating-close:', e);…`
    - `L743`: `ipcMain.handle('open-editor', () => { if (!editorWin || editorWin.isDestroyed()) { createEditorWindow(); } else { editorWin.show(); try { const initialText = textState.getCurrentText(); editorWin.webContents.send('manual-init-text', {…`
    - `L771`: `ipcMain.handle('open-preset-modal', (_event, payload) => { if (!mainWin) return; let initialData = {}; if (typeof payload === 'number') { initialData = { wpm: payload }; } else if (payload && typeof payload === 'object') { initialData =…`
    - `L783`: `ipcMain.handle('get-app-config', async () => { try { return { ok: true, maxTextChars: MAX_TEXT_CHARS }; } catch (e) { console.error('Error processing get-app-config:', e); return { ok: false, error: String(e), maxTextChars: 1e7 }; } })`
- Pattern: `ipcMain.on(`
  - Count: 4
  - Key matches:
    - `L682`: `ipcMain.on('crono-toggle', () => { try { if (crono.running) stopCrono(); else startCrono(); } catch (e) { console.error('Error in crono-toggle:', e); } })`
    - `L690`: `ipcMain.on('crono-reset', () => { try { resetCrono(); } catch (e) { console.error('Error in crono-reset:', e); } })`
    - `L694`: `ipcMain.on('crono-set-elapsed', (_ev, ms) => { try { setCronoElapsed(ms); } catch (e) { console.error('Error in crono-set-elapsed:', e); } })`
    - `L726`: `ipcMain.on('flotante-command', (_ev, cmd) => { try { if (!cmd || !cmd.cmd) return; if (cmd.cmd === 'toggle') { if (crono.running) stopCrono(); else startCrono(); } else if (cmd.cmd === 'reset') { resetCrono(); } else if (cmd.cmd === 'set'…`
- Pattern: `ipcMain.once(`
  - Count: 1
  - Key matches:
    - `L806`: `ipcMain.once('language-selected', (_evt, lang) => { try { if (!mainWin) createMainWindow(); } catch (e) { console.error('Error creating mainWin after selecting language:', e); } finally { try { if (langWin && !langWin.isDestroyed())…`
- Pattern: `webContents.send(`
  - Count: 10
  - Key matches:
    - `L198`: `editorWin.webContents.send('manual-init-text', { text: initialText || '', meta: { source: 'main', action: 'init' } })`
    - `L209`: `mainWin.webContents.send('manual-editor-ready')`
    - `L235`: `presetWin.webContents.send('preset-init', initialData || {})`
    - `L266`: `presetWin.webContents.send('preset-init', initialData || {})`
    - `L582`: `mainWin.webContents.send('flotante-closed')`
    - `L616`: `mainWin.webContents.send('crono-state', state)`
    - `L617`: `floatingWin.webContents.send('crono-state', state)`
    - `L618`: `editorWin.webContents.send('crono-state', state)`
    - `L750`: `editorWin.webContents.send('manual-init-text', { text: initialText || '', meta: { source: 'main', action: 'init' }, })`
    - `L759`: `mainWin.webContents.send('manual-editor-ready')`
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

### B2.2) Repo contract cache sync (mandatory; surface-only)
> This section syncs Contract Lock keys with `docs/cleanup/_repo_contract_usage.md`.
> **Official counts are surface-only**: contract surface statements only (exclude mentions in logs/comments/user-facing messages/docs).

**Per-key record (copy from `_repo_contract_usage.md`; keep per-key, no global notes)**

#### IPC — ipcMain.handle
- Key: `crono-get-state`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `bc16c9a`

- Key: `floating-open`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `bc16c9a`

- Key: `floating-close`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `bc16c9a`

- Key: `open-editor`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `bc16c9a`

- Key: `open-preset-modal`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `bc16c9a`

- Key: `get-app-config`
  - Cache (official; surface-only): 3 matches in 3 files (top: `electron/main.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at: `bc16c9a`

#### IPC — ipcMain.on
- Key: `crono-toggle`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `bc16c9a`

- Key: `crono-reset`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `bc16c9a`

- Key: `crono-set-elapsed`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `bc16c9a`

- Key: `flotante-command`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/flotante_preload.js`)
  - Verified at: `bc16c9a`

#### IPC — ipcMain.once
- Key: `language-selected`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/main.js`, `electron/language_preload.js`)
  - Verified at: `bc16c9a`

#### Renderer events — webContents.send / equivalents
- Key: `crono-state`
  - Cache (official; surface-only): 5 matches in 3 files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at: `bc16c9a`

- Key: `flotante-closed`
  - Cache (official; surface-only): 3 matches in 3 files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at: `bc16c9a`

- Key: `manual-editor-ready`
  - Cache (official; surface-only): 3 matches in 2 files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `bc16c9a`

- Key: `manual-init-text`
  - Cache (official; surface-only): 3 matches in 2 files (top: `electron/main.js`, `electron/manual_preload.js`)
  - Verified at: `bc16c9a`

- Key: `preset-init`
  - Cache (official; surface-only): 3 matches in 2 files (top: `electron/main.js`, `electron/preset_preload.js`)
  - Verified at: `bc16c9a`

#### Persistent storage filenames / keys
- Key: `current_text.json`
  - Cache (official; surface-only): 1 match in 1 file (top: electron/main.js)
  - Verified at: `bc16c9a`

- Key: `user_settings.json`
  - Cache (official; surface-only): 1 match in 1 file (top: electron/main.js)
  - Verified at: `bc16c9a`

---

### B2.3) Observability / UX Mentions (local-only)
> Script: v1.2.0
> Target: `electron/main.js`
> Realpath: `C:\Users\manue\Documents\toT-ReadingMeter\tot-readingmeter\electron\main.js`
> Format: `L<line>: <snippet>`
> Block capture: max 16 lines

#### Logs (console.*)
- L78:     console.warn('Error registering development shortcuts:', err);
- L86:     console.warn('Error unregistering global shortcuts:', err);
- L122:           console.error('Error closing editorWin from mainWin.close:', e);
- L130:           console.error('Error closing presetWin from mainWin.close:', e);
- L134:       console.error('Error in mainWin.close handler:', e);
- L146:       console.error('Error calling app.quit() in mainWin.closed:', e);
- L203:         console.error('Error sending manual-init-text to editor:', err);
- L212:         console.error('Error notifying manual-editor-ready to main window:', err);
- L215:       console.error('Error showing manual editor:', e);
- L237:       console.error('Error sending init to presetWin already open:', e);
- L268:       console.error('Error sending preset-init:', e);
- L359:       console.error('Error applying fallback language:', e);
- L366:         console.error('Error creating mainWin after closing language modal:', e);
- L550:     console.warn('Position could not be calculated from screen.getPrimaryDisplay(); using the default FW position.', e);
- L567:     console.error('Error loading floating HTML:', e);
- L686:     console.error('Error in crono-toggle:', e);
- L691:   try { resetCrono(); } catch (e) { console.error('Error in crono-reset:', e); }
- L695:   try { setCronoElapsed(ms); } catch (e) { console.error('Error in crono-set-elapsed:', e); }
- L706:     console.error('Error processing floating-open:', e);
- L720:     console.error('Error processing floating-close:', e);
- L738:     console.error('Error processing flotante-command in main:', e);
- L755:       console.error('Error sending manual-init-text from open-editor:', err);
- L762:       console.warn(
- L763:         'Unable to notify manual-editor-ready (editor already open):',
- L787:     console.error('Error processing get-app-config:', e);
- L810:         console.error('Error creating mainWin after selecting language:', e);
- L846:     console.error('Error clearing stopwatch in will-quit:', e);

#### Maintenance comments (TODO/FIXME/HACK/WIP/LEGACY/DEPRECATED)
- (none)

#### User-facing hardcoded (dialog/Notification/etc.)
- (none)

#### Fallback pivot (FALLBACK:)
- (none)

---

### B3) Candidate Ledger (auto-scan; label-sorted; theme-grouped; evidence-gated)
> Auto-generated bootstrap from `electron/main.js`. Suggested labels are heuristics; you must confirm and fill repo evidence where required.
> Theme headers are navigation only; occurrences remain the unit of decision.
> Tooling note (repo-wide): `Shift+F12` is file-local and tooling-derived (JS language service). It may return `0` or non-canonical counts for CommonJS/property access and dynamic JS. Treat `Shift+F12` counts as “semantic-ish signals”, not as proof of absence/presence. Use `Ctrl+Shift+F` for surface/textual counts.
> Pattern counting convention: “noop catches” counted via regex `\/\*\s*noop\s*\*\/` (covers `/* noop */` and `/*noop*/`; multi-line safe). Assumption: all noop markers occur inside catches.

#### P2-CONTRACT (11)

##### CONTRACT:IPC_HANDLE:floating-open (1)
- **L699#1hed**
  - Primary Theme: `CONTRACT:IPC_HANDLE:floating-open`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Anchor evidence: `L699`: `ipcMain.handle('floating-open', async () => {`
  - Local evidence (inner): `L702`: `try { broadcastCronoState(); } catch (e) {/*noop*/ }`
  - Why: Noop catch can hide failures near contract/lifecycle code. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `broadcastCronoState`]:
      - Definition trace (F12): defined at `electron/main.js`:L`614`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `8` matches in `1` file (incl. 1 comment; top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `7` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`floating-open`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'floating-open'`, `ipcMain.handle(`
    - Symbol: `broadcastCronoState`
    - Pattern: `/*noop*/`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Decide whether a broadcast failure should fail `floating-open` (propagate to outer catch) vs remain non-fatal. At minimum, avoid silent swallow; validate expected failure modes when windows are closing.

##### CONTRACT:IPC_ON:flotante-command (1)
- **L726#5oho**
  - Primary Theme: `CONTRACT:IPC_ON:flotante-command`
  - Type: `fallback (defaulting)`
  - Tags: `touches_contract`
  - Anchor evidence: `L726`: `ipcMain.on('flotante-command', (_ev, cmd) => {`
  - Local evidence (inner): `L734`: `setCronoElapsed(Number(cmd.value) || 0);`
  - Why: Defaulting `|| 0` can collapse meaningful falsy or error values (NaN/0/empty string). Must confirm contract for cmd.value.
  - Repo evidence:
    - Symbol evidence [primary: `setCronoElapsed`]:
      - Definition trace (F12): defined at `electron/main.js`:L`658`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `7` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `public/js/timer.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`flotante-command`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/flotante_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'flotante-command'`, `ipcMain.on(`, `ipcRenderer.on(`
    - Symbol: `setCronoElapsed`
    - Pattern: `Number(`, `|| 0`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies:
    - Symbol `setCronoElapsed` repo search includes 1 error log in `public/js/timer.js`.
    - Current `Number(cmd.value) || 0` coerces invalid/NaN values to 0 (potentially resetting elapsed unexpectedly). Confirm contract for `cmd.value` from the floating renderer before changing.

##### CONTRACT:IPC_ONCE:language-selected (1)
- **L806#sl1a**
  - Primary Theme: `CONTRACT:IPC_ONCE:language-selected`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Anchor evidence: `L806`: `ipcMain.once('language-selected', (_evt, lang) => {`
  - Local evidence (inner): `L814-816`: `} catch (e) { /* noop */ }`
  - Why: Silent cleanup failure can hide lifecycle errors, especially near initialization contract boundaries.
  - Repo evidence:
    - Symbol evidence [primary: `createLanguageWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L`321`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `4` matches in `2` files (top: `electron/main.js`, `electron/menu_builder.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`language-selected`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/language_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'language-selected'`, `ipcMain.once(`, `ipcRenderer.once(`
    - Symbol: `createLanguageWindow`
    - Pattern: `langWin.close(`, `/* noop */`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies:
    - Symbol `createLanguageWindow` repo search includes 1 comment in `electron/menu_builder.js`.
    - The silent close failure in `finally` is likely harmless, but it can mask unexpected window lifecycle errors. Prefer a stronger guard (isDestroyed checks already present) and/or non-silent reporting.

##### CONTRACT:SEND:crono-state (3)
- Shared:
  - Primary Theme: `CONTRACT:SEND:crono-state`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Occurrences:
    - **L616#1nhq**
      - Anchor evidence: `L616`: `try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
    - **L617#1oz5**  
      - Anchor evidence: `L617`: `try { if (floatingWin && !floatingWin.isDestroyed()) floatingWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
    - **L618#1704**
      - Anchor evidence: `L618`: `try { if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - Why: Silent send failures can mask contract breakage; but may be intentional during teardown.
  - Repo evidence:
    - Symbol evidence [primary: `broadcastCronoState`]:
      - Definition trace (F12): defined at `electron/main.js`:L`614`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `8` matches in `1` file (incl. 1 comment; top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `7` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Symbol evidence [secondary: `getCronoState`]:
      - Definition trace (F12): defined at `electron/main.js`:L`609`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `6` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `public/js/timer.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`crono-state`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 5 matches in 3 files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'crono-state'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `broadcastCronoState`
    - Pattern: `webContents.send(`, `/*noop*/`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor
  - Risk notes / dependencies: Silent swallow can hide renderer/window lifecycle defects; however `send` may throw during teardown. Consider a shared `safeSend(win, event, payload)` helper with controlled (non-spammy) reporting.
  
##### CONTRACT:SEND:flotante-closed (1)
- **L582#18y8**
  - Primary Theme: `CONTRACT:SEND:flotante-closed`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Anchor evidence: `L582`: `try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }`
  - Why: Silent send failure can hide renderer state inconsistencies (main may not clear floating state).
  - Repo evidence:
    - Symbol evidence [primary: `createFloatingWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L`499`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `2` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `2` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`flotante-closed`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 3 files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'flotante-closed'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `createFloatingWindow`
    - Pattern: `webContents.send(`, `/* noop */`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor
  - Risk notes / dependencies: If this send fails, the main renderer may not clear floating state; verify renderer-side handling. Prefer `safeSend` or at least `mainWin && !mainWin.isDestroyed()` guard plus non-silent reporting.    

##### CONTRACT:SEND:manual-init-text (2)
- Shared:
  - Primary Theme: `CONTRACT:SEND:manual-init-text`
  - Type: `fallback (defaulting)`
  - Tags: `touches_contract`
  - Occurrences:
    - **L198#o8dh**
      - Anchor evidence: `L198`: `editorWin.webContents.send('manual-init-text', {`
      - Local evidence (inner): `L199`: `text: initialText || '',`
    - **L750#o8dh**
      - Anchor evidence: `L750`: `editorWin.webContents.send('manual-init-text', {`
      - Local evidence (inner): `L751`: `text: initialText || '',`
  - Why: Defaulting `|| ''` forces a string payload. Must confirm if empty string is semantically valid vs absence.
  - Repo evidence:
    - Symbol evidence [primary: `getCurrentText`]:
      - Definition trace (F12): defined at `electron/text_state.js`:L`213`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `10` matches in `6` files (incl. 1 comment; top: `electron/main.js`, `electron/text_state.js`, `public/renderer.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `0` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Symbol evidence [secondary: `createEditorWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L`151`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `2` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `2` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`manual-init-text`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 2 files (top: `electron/main.js`, `electron/manual_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'manual-init-text'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `getCurrentText`
    - Pattern: `initialText || ''`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: `initialText || ''` forces a string payload. Need to verify if `textState.getCurrentText()` return domain and renderer expectations. Any change affects contract payload shape.    

##### CONTRACT:SEND:preset-init (2)
- Shared:
  - Primary Theme: `CONTRACT:SEND:preset-init`
  - Type: `fallback (defaulting)`
  - Tags: `touches_contract`
  - Occurrences:    
    - **L235#1gi8**
      - Anchor evidence: `L235`: `presetWin.webContents.send('preset-init', initialData || {});`
    - **L266#1gi8**
      - Anchor evidence: `L266`: `presetWin.webContents.send('preset-init', initialData || {});`
  - Why: Defaulting to `{}` may be redundant or may hide invalid payloads; affects contract payload shape.
  - Repo evidence:
    - Symbol evidence [primary: `createPresetWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L`228`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `2` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `2` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`preset-init`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 2 files (top: `electron/main.js`, `electron/preset_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'preset-init'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `createPresetWindow`
    - Pattern: `initialData || {}`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: remove
  - Risk notes / dependencies: `initialData || {}` is likely redundant given current caller initializes `initialData = {}`. Confirm there are no other call sites (repo evidence required) before removing to avoid contract payload regressions.    

#### P2-FALLBACK (4)

##### PATTERN:DEFAULT_OR (1)
- **L801#1s82**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L801`: `currentLanguage = settings.language || 'es';`
  - Why: Defaulting determines baseline app behavior. Must confirm domain and desired policy.
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `||`
      - Local matches in `electron/main.js`: `22`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `325` matches in `20` files (top: `public/renderer.js`, `electron/menu_builder.js`, `electron/presets_main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `settingsState.init`]:
      - Definition trace (F12): defined at `electron/settings.js`:L`111`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `1` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `0` hits in `electron/main.js`; Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Pattern: `||`, `settings.language ||`, `'es'`
    - Symbol: `settingsState.init`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Default language policy (`'es'`) is a product decision. Confirm whether empty string/unknown languages should fall back, and whether default should be `'es'` for all first-run scenarios.    

##### PATTERN:TRY_NOOP (3)
- **L323#1oxv**
  - Primary Theme: `PATTERN:TRY_NOOP`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Local evidence: `L323`: `try { langWin.focus(); } catch (e) { /* noop */ }`
  - Why: Silent focus failure can hide lifecycle issues; near language selection flow.
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `catch (`, `/* noop */`
      - Local matches in `electron/main.js`: `9`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `27` matches in `6` files (top: `public/manual.js`, `electron/main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `createLanguageWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L`321`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `4` matches in `2` files (top: `electron/main.js`, `electron/menu_builder.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `/* noop */`, `langWin.focus(`
    - Symbol: `createLanguageWindow`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor
  - Risk notes / dependencies: 
    - Symbol `createLanguageWindow` repo search includes 1 comment in `electron/menu_builder.js`.
    - Silent swallow on `langWin.focus()` can hide window lifecycle issues. Prefer guard + non-silent handling once evidence shows this can fail in normal flows.    

- **L504#sjpk**
  - Primary Theme: `PATTERN:TRY_NOOP`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Local evidence: `L504`: `try { floatingWin.setBounds({ x: options.x || floatingWin.getBounds().x, y: options.y || floatingWin.getBounds().y }); } catch (e) { /* noop */ }`
  - Why: Silent failure plus `||` coordinate defaulting can hide off-screen/positioning bugs; user-visible.
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `catch (`, `/* noop */`
      - Local matches in `electron/main.js`: `9`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `27` matches in `6` files (top: `public/manual.js`, `electron/main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `createFloatingWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L`499`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `2` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `2` hits in `electron/main.js`; Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `/* noop */`, `options.x ||`, `options.y ||`, `setBounds(`
    - Symbol: `createFloatingWindow`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Using `||` for numeric coordinates discards valid `0` values; confirm coordinate domain. Also, the noop catch hides setBounds failures. Prefer `??` + guard or a dedicated safe setter.    

- **L573#1hm2**
  - Primary Theme: `PATTERN:TRY_NOOP`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Local evidence: `L573-575`: `} catch (e) { /* noop */ }`
  - Why: Swallowing snap failures can allow the floating window to remain off-screen (user-visible).
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `catch (`, `/* noop */`
      - Local matches in `electron/main.js`: `9`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `27` matches in `6` files (top: `public/manual.js`, `electron/main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `snapWindowFullyIntoWorkArea`]:
      - Definition trace (F12): defined at `electron/main.js`:L`408`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `5` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `5` hits in `electron/main.js`; Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `/* noop */`, `snapWindowFullyIntoWorkArea(`
    - Symbol: `snapWindowFullyIntoWorkArea`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor
  - Risk notes / dependencies: If `snapWindowFullyIntoWorkArea` throws, swallowing may leave the floating window partially off-screen (user-visible). Prefer making the snap function robust or logging/reporting controlled failures.    

#### DEFER (1)

##### PATTERN:DEFAULT_OR (1)
- **L51#1fba**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L51`: `const effectiveLang = lang || currentLanguage || 'es';`
  - Why: Likely intentional fallback chain; low risk compared to other candidates; defer unless evidence suggests wrong domain.
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `||`
      - Local matches in `electron/main.js`: `22`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `325` matches in `20` files (top: `public/renderer.js`, `electron/menu_builder.js`, `electron/presets_main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `buildAppMenu`]:
      - Definition trace (F12): defined at `electron/main.js`:L`50`; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `9` matches in `3` files (top: `electron/main.js`, `electron/menu_builder.js`, `electron/settings.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Pattern: `||`, `lang ||`, `currentLanguage ||`, `'es'`
    - Symbol: `buildAppMenu`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Likely intentional language fallback chain. Defer unless evidence shows incorrect `lang` domain (e.g., empty string should be preserved).    

---

## 2) Phase 1 (Safe) — Plan and Patch Notes

### Phase 1 definition
Allowed:
- Reorder into sections (without changing execution order of side effects).
- Translate/refresh comments (ES→EN).
- Normalize quotes (where semantically equivalent).
- Extract purely mechanical helpers only if behavior is unchanged and evidence supports equivalence.

Not allowed:
- Changing any contract string/key/payload shape.
- Changing fallback semantics.
- Changing ordering/timing of top-level side effects.

### Phase 1 checklist (pre)
- [ ] B1 complete (inventory gating).
- [ ] B2 complete (contract lock).
- [ ] B2.2 synced to `_repo_contract_usage.md` (surface-only counts).
- [ ] B2.3 captured (logs/comments/user-facing hardcodes).
- [ ] B3 triaged + evidence-gated (no `<fill>`).
- [ ] Baseline smoke test defined.

### Phase 1 patch log
- Commit: `<SHA>`
- Summary:
  - `<change>`
  - `<change>`

### Phase 1 smoke tests (must be specific)
- Test 1: `<action>` → expected `<result>`
- Test 2: `<action>` → expected `<result>`

### Phase 1 checklist (post)
- [ ] Contract Lock unchanged (B2 strings and surfaces).
- [ ] Smoke tests pass.
- [ ] No new warnings/errors attributable to this file.

---

## 3) Phase 2 (Risk) — Plan and Patch Notes

### Phase 2 definition
Allowed:
- Remove/tighten fallbacks.
- Consolidate duplicates.
- Refactor IPC handlers (without breaking contracts unless explicitly coordinated).
- Change payload validation policy (only with tests).

### Phase 2 test plan (targeted)
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
- [ ] Targeted tests pass.
- [ ] Any behavior changes documented in Open Questions decisions.
- [ ] Contracts preserved or explicitly migrated.

---

## 4) Open Questions / Decisions
> Decisions live here (not in B3). Keep them referenced to occurrences.

- Q1 (links: `B3 L<line>#<id>` ...): `<question>`
  - Options: `<A/B/C>`
  - Decision: `<pending/decided>`
  - Evidence: `<what repo evidence supports this>`
  - Tests required (if decided): `<tests>`

- Q2: ...

---

## 5) Appendix — Commands / Tooling Notes (optional)

- Local tooling used (must remain in `/tools_local`, never pushed): `<tooling>`
- VS Code searches used (saved queries): `<...>`
- Known false positives / scanner limitations: `<...>`
