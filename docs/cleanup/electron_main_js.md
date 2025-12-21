# Code Cleanup Note — electron/main.js

> Location: `docs/cleanup/electron_main_js.md`  
> Scope: This document records all evidence and decisions needed to clean, reorder, and de-legacy a single file, in two phases:
> - **Phase 1 (Safe):** no functional changes; must preserve observable behavior.
> - **Phase 2 (Risk):** may change behavior; requires targeted tests.

---

## 0) Metadata

- Target file: `electron\main.js` 
- Slug: `electron_main_js` 
- Evidence snapshots (short SHAs): 
  - `bc16c9a`: 2025/12/15. Start.
  - `682c26a`: 2025/12/20. No changes in codes.
- Change log: No changes in codes between commits (no drift in results).
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
- `L315`: [ExpressionStatement] updater.registerIpc(ipcMain, <object:{mainWinRef, currentLanguageRef}>)
  - raw: updater.registerIpc(ipcMain, { mainWinRef: () => mainWin, currentLanguageRef: () => currentLanguage, });     
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
- `updater.registerIpc` — 1 call(s): L315 (keys: currentLanguageRef, mainWinRef)

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
- Pattern: `*.registerIpc(ipcMain,`
  - Count: 1
  - Key matches:
    - `L315`: `updater.registerIpc(ipcMain, { mainWinRef: () => mainWin, currentLanguageRef: () => currentLanguage, })`

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
  - Verified at: `682c26a`

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

#### P2-CONTRACT (25)

##### CONTRACT:IPC_HANDLE:crono-get-state (1)
- **L678#1h2j**
  - Primary Theme: `CONTRACT:IPC_HANDLE:crono-get-state`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L678`: `ipcMain.handle('crono-get-state', () => {`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `getCronoState`]:
      - Definition trace (F12): defined at `electron/main.js`:L609; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `6` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `public/js/timer.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`crono-get-state`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `crono-get-state`
    - Symbol: `ipcMain.handle`
    - Pattern: `ipcMain.handle('crono-get-state'`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Keep state shape stable (incl. pre-init) and define explicit defaults to avoid renderer ambiguity.
  
##### CONTRACT:IPC_ON:crono-reset (1)
- **L690#1mxc**
  - Primary Theme: `CONTRACT:IPC_ON:crono-reset`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L690`: `ipcMain.on('crono-reset', () => {`
  - Local evidence (inner): `L691`: `try { resetCrono(); } catch (e) { console.error('Error in crono-reset:', e); }`      
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `resetCrono`]:
      - Definition trace (F12): defined at `electron/main.js`:L651; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `4` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `4` hits in `1`; Verified at: `682c26a`
    - Contract [`crono-reset`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `crono-reset`
    - Symbol: `ipcMain.on`
    - Pattern: `try`, `catch`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Event IPC has no response; errors are log-only. If user-visible, consider emitting explicit status.

##### CONTRACT:IPC_ON:crono-set-elapsed (1)
- **L694#x00w**
  - Primary Theme: `CONTRACT:IPC_ON:crono-set-elapsed`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L694`: `ipcMain.on('crono-set-elapsed', (_ev, ms) => {`
  - Local evidence (inner): `L695`: `try { setCronoElapsed(ms); } catch (e) { console.error('Error in crono-set-elapsed:', e); }`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `setCronoElapsed`]:
      - Definition trace (F12): defined at `electron/main.js`:L658; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `7` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `public/js/timer.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`crono-set-elapsed`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `crono-set-elapsed`
    - Symbol: `ipcMain.on`
    - Pattern: `try`, `catch`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Event IPC has no response; errors are log-only. If user-visible, consider emitting explicit status.
  
##### CONTRACT:SEND:crono-state (3)
- Shared:
  - Primary Theme: `CONTRACT:SEND:crono-state`
  - Type: `contract surface + fallback (error swallow; noop)`
  - Tags: `touches_contract, near_contract`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Noop catch can hide failures; confirm it is intentional and scoped. Near contract/lifecycle surface. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `broadcastCronoState`]:
      - Definition trace (F12): defined at `electron/main.js`:L614; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `8` matches in `1` file (incl. 1 comment; top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `7` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Symbol evidence [secondary: `getCronoState`]:
      - Definition trace (F12): defined at `electron/main.js`:L609; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `6` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `public/js/timer.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`crono-state`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 5 matches in 3 files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'crono-state'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `broadcastCronoState`, `getCronoState`
    - Pattern: `catch (`, `/* noop */`, `webContents.send(`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor
  - Risk notes / dependencies: Silent swallow can hide renderer/window lifecycle defects; however `send` may throw during teardown. Consider a shared `safeSend(win, event, payload)` helper with controlled (non-spammy) reporting.
  - Occurrences:
    - **L616#1nhq**
      - Anchor evidence: `L616`: `try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
    - **L617#1oz5**  
      - Anchor evidence: `L617`: `try { if (floatingWin && !floatingWin.isDestroyed()) floatingWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
    - **L618#1704**
      - Anchor evidence: `L618`: `try { if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`  

##### CONTRACT:IPC_ON:crono-toggle (1)
- **L682#159r**
  - Primary Theme: `CONTRACT:IPC_ON:crono-toggle`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L682`: `ipcMain.on('crono-toggle', () => {`
  - Local evidence (inner): `L685-687`: `} catch (e) { console.error('Error in crono-toggle:', e); }`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Symbol evidence [primary: `startCrono`]:
      - Definition trace (F12): defined at `electron/main.js`:L633; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `3` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `1`; Verified at: `682c26a`
    - Symbol evidence [secondary: `stopCrono`]:
      - Definition trace (F12): defined at `electron/main.js`:L642; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `3` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `1`; Verified at: `682c26a`
    - Contract [`crono-toggle`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `crono-toggle`
    - Symbol: `ipcMain.on`
    - Pattern: `try`, `catch`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Event IPC has no response; errors are log-only. If user-visible, consider emitting explicit status.

##### CONTRACT:IPC_HANDLE:floating-close (1)
- **L712#1w0w**
  - Primary Theme: `CONTRACT:IPC_HANDLE:floating-close`
  - Type: `contract surface + fallback (error swallow; default return)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L712`: `ipcMain.handle('floating-close', async () => {`
  - Local evidence (inner): `L719-722`: `} catch (e) { console.error('Error processing floating-close:', e); return { ok: false, error: String(e) }; }`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (default return); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Symbol evidence [primary: `floatingWin`]:
      - Definition trace (F12): defined at `electron/main.js`:L46; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `34` matches in `3` files (top: `electron/main.js`, `electron/presets_main.js`, `electron/settings.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `24` hits in `electron/main.js`; Verified at: `682c26a`
    - Contract [`floating-close`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `floating-close`
    - Symbol: `ipcMain.handle`
    - Pattern: `ipcMain.handle('floating-close'`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Lifecycle-sensitive close path; decide if log-only swallow is acceptable when window is already destroyed.

##### CONTRACT:IPC_HANDLE:floating-open (1)
- **L699#1hed**
  - Primary Theme: `CONTRACT:IPC_HANDLE:floating-open`
  - Type: `contract surface + fallback (error swallow; noop) + fallback (error swallow; default return)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L699`: `ipcMain.handle('floating-open', async () => {`
  - Local evidence (inner): `L702`: `try { broadcastCronoState(); } catch (e) {/*noop*/ }`
  - Local evidence (inner): `L705-708`: `} catch (e) { console.error('Error processing floating-open:', e); return { ok: false, error: String(e) }; }`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Noop catch can hide failures; confirm it is intentional and scoped. Near contract/lifecycle surface. One-line catch form. Catch swallows error (default return); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Symbol evidence [primary: `broadcastCronoState`]:
      - Definition trace (F12): defined at `electron/main.js`:L614; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `8` matches in `1` file (incl. 1 comment; top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `7` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`floating-open`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'floating-open'`, `ipcMain.handle(`
    - Symbol: `broadcastCronoState`
    - Pattern: `catch (`, `return null`, `return;`, `/*noop*/`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Decide whether a broadcast failure should fail `floating-open` (propagate to outer catch) vs remain non-fatal. At minimum, avoid silent swallow; validate expected failure modes when windows are closing.
  
##### CONTRACT:SEND:flotante-closed (1)
- **L582#18y8**
  - Primary Theme: `CONTRACT:SEND:flotante-closed`
  - Type: `contract surface + fallback (error swallow; noop)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L582`: `try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Noop catch can hide failures; confirm it is intentional and scoped. Near contract/lifecycle surface. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `createFloatingWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L499; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `2` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `2` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`flotante-closed`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 3 files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'flotante-closed'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `createFloatingWindow`
    - Pattern: `catch (`, `/* noop */`, `webContents.send(`,
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor
  - Risk notes / dependencies: If this send fails, the main renderer may not clear floating state; verify renderer-side handling. Prefer `safeSend` or at least `mainWin && !mainWin.isDestroyed()` guard plus non-silent reporting.    
  
##### CONTRACT:IPC_ON:flotante-command (1)
- **L726#5oho**
  - Primary Theme: `CONTRACT:IPC_ON:flotante-command`
  - Type: `contract surface + fallback (error swallow; log-only) + fallback (guard return) + fallback (defaulting)`       
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L726`: `ipcMain.on('flotante-command', (_ev, cmd) => {`
  - Local evidence (inner): `L737-739`: `} catch (e) { console.error('Error processing flotante-command in main:', e); }` 
  - Local evidence (inner): `L728`: `if (!cmd || !cmd.cmd) return;`
  - Local evidence (inner): `L734`: `setCronoElapsed(Number(cmd.value) || 0);`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing). Guard return can silently skip behavior; confirm it is intentional and correctly scoped. Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Symbol evidence [primary: `setCronoElapsed`]:
      - Definition trace (F12): defined at `electron/main.js`:L658; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `7` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `public/js/timer.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`flotante-command`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/flotante_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'flotante-command'`, `ipcMain.on(`, `ipcRenderer.on(`
    - Symbol: `setCronoElapsed`
    - Pattern: `catch (`, `console.error`, `console.warn`, `Number(`, `|| 0`
  - Proposed action:    
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies:
    - Symbol `setCronoElapsed` repo search includes 1 error log in `public/js/timer.js`.
    - Current `Number(cmd.value) || 0` coerces invalid/NaN values to 0 (potentially resetting elapsed unexpectedly). Confirm contract for `cmd.value` from the floating renderer before changing.  

##### CONTRACT:IPC_HANDLE:get-app-config (1)
- **L783#17bt**
  - Primary Theme: `CONTRACT:IPC_HANDLE:get-app-config`
  - Type: `contract surface + fallback (error swallow; default return)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L783`: `ipcMain.handle('get-app-config', async () => {`
  - Local evidence (inner): `L786-789`: `} catch (e) { console.error('Error processing get-app-config:', e); return { ok: false, error: String(e), maxTextChars: 1e7 }; }`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (default return); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Symbol evidence [primary: `MAX_TEXT_CHARS`]:
      - Definition trace (F12): defined at `electron/main.js`:L30; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `40` matches in `5` files (top: `electron/main.js`, `electron/text_state.js`, `public/renderer.js`, `public/manual.js`, `public/js/constants.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `682c26a`
    - Contract [`get-app-config`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 3 files (top: `electron/main.js`, `electron/preload.js`, `electron/manual_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `get-app-config`
    - Symbol: `ipcMain.handle`
    - Pattern: `catch`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Fallback returns `{ ok: false, error: String(e), maxTextChars: 1e7 }`; keep response shape stable and ensure callers handle error payload.
  
##### CONTRACT:IPC_ONCE:language-selected (1)
- **L806#sl1a**
  - Primary Theme: `CONTRACT:IPC_ONCE:language-selected`
  - Type: `contract surface + fallback (error swallow; log-only) + fallback (error swallow; noop)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L806`: `ipcMain.once('language-selected', (_evt, lang) => {`
  - Local evidence (inner): `L809-811`: `} catch (e) { console.error('Error creating mainWin after selecting language:', e); } finally {`
  - Local evidence (inner): `L814-816`: `} catch (e) { /* noop */ }`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing). Noop catch can hide failures; confirm it is intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Symbol evidence [primary: `createLanguageWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L321; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `4` matches in `2` files (top: `electron/main.js`, `electron/menu_builder.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`language-selected`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/language_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'language-selected'`, `ipcMain.once(`, `ipcRenderer.once(`
    - Symbol: `createLanguageWindow`
    - Pattern: `catch (`, `console.error`, `console.warn`, `langWin.close(`, `/* noop */`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies:
    - Symbol `createLanguageWindow` repo search includes 1 comment in `electron/menu_builder.js`.
    - The silent close failure in `finally` is likely harmless, but it can mask unexpected window lifecycle errors. Prefer a stronger guard (isDestroyed checks already present) and/or non-silent reporting.

##### CONTRACT:SEND:manual-editor-ready (2)
- **L209#1jgk**
  - Primary Theme: `CONTRACT:SEND:manual-editor-ready`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L209`: `mainWin.webContents.send('manual-editor-ready');`
  - Local evidence (inner): `L211-213`: `} catch (err) { console.error('Error notifying manual-editor-ready to main window:', err); }`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Symbol evidence [primary: `mainWin`]:
      - Definition trace (F12): defined at `electron/main.js`:L42; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `107` matches in `5` files (top: `electron/main.js`, `electron/presets_main.js`, `electron/settings.js`, `electron/text_state.js`, `electron/updater.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `29` hits in `electron/main.js`; Verified at: `682c26a`
    - Contract [`manual-editor-ready`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `manual-editor-ready`
    - Symbol: `mainWin.webContents.send`
    - Pattern: `webContents.send('manual-editor-ready')`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Depends on `mainWin`/`webContents` lifecycle and renderer listener; consider ack/state sync if critical.
- **L759#1jgk**
  - Primary Theme: `CONTRACT:SEND:manual-editor-ready`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L759`: `mainWin.webContents.send('manual-editor-ready');`
  - Local evidence (inner): `L761-766`: `} catch (e) { console.warn( 'Unable to notify manual-editor-ready (editor already open):', e ); }`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Symbol evidence [primary: `mainWin`]:
      - Definition trace (F12): defined at `electron/main.js`:L42; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `107` matches in `5` files (top: `electron/main.js`, `electron/presets_main.js`, `electron/settings.js`, `electron/text_state.js`, `electron/updater.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `29` hits in `electron/main.js`; Verified at: `682c26a`
    - Contract [`manual-editor-ready`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'manual-editor-ready'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `mainWin.webContents.send`
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Send depends on `mainWin`/`webContents` lifecycle and a matching renderer listener; if delivery matters for UX, consider ack/state-flag or ensuring the event is emitted only once the renderer is ready.

##### CONTRACT:SEND:manual-init-text (2)
- **L198#o8dh**
  - Primary Theme: `CONTRACT:SEND:manual-init-text`
  - Type: `contract surface + fallback (error swallow; log-only) + fallback (defaulting)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L198`: `editorWin.webContents.send('manual-init-text', {`
  - Local evidence (inner): `L202-204`: `} catch (err) { console.error('Error sending manual-init-text to editor:', err); }`
  - Local evidence (inner): `L199`: `text: initialText || '',`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing). Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Symbol evidence [primary: `editorWin`]:
      - Definition trace (F12): defined at `electron/main.js`:L43; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `66` matches in `5` files (top: `electron/main.js`, `electron/modal_state.js`, `electron/presets_main.js`, `electron/settings.js`, `electron/text_state.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `26` hits in `electron/main.js`; Verified at: `682c26a`
    - Contract [`manual-init-text`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 2 files (top: `electron/main.js`, `electron/manual_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'manual-init-text'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `editorWin`, `textState.getCurrentText`
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Send depends on editorWin/webContents lifecycle (ready-to-show timing) and a matching renderer listener. If send fails, editor may open without initial text; current behavior is log-only (no status/ack). Defaulting initialText || '' can mask an unexpected empty/undefined current text; verify that an empty string is an acceptable “no content” state.
- **L750#o8dh**
  - Primary Theme: `CONTRACT:SEND:manual-init-text`
  - Type: `contract surface + fallback (error swallow; log-only) + fallback (defaulting)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L750`: `editorWin.webContents.send('manual-init-text', {`
  - Local evidence (inner): `L754-756`: `} catch (err) { console.error('Error sending manual-init-text from open-editor:', err); }`
  - Local evidence (inner): `L751`: `text: initialText || '',`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing). Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Symbol evidence [primary: `editorWin`]:
      - Definition trace (F12): defined at `electron/main.js`:L43; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `66` matches in `5` files (top: `electron/main.js`, `electron/modal_state.js`, `electron/presets_main.js`, `electron/settings.js`, `electron/text_state.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `26` hits in `electron/main.js`; Verified at: `682c26a`
    - Contract [`manual-init-text`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 2 files (top: `electron/main.js`, `electron/manual_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'manual-init-text'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `editorWin`, `textState.getCurrentText`
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Same as L198. This path is “editor already open”: send failure is still log-only, so UI may not refresh editor contents. Confirm renderer-side behavior when re-opening (does it request current text if init event is missed?). Defaulting initialText || '' again coerces empty/undefined to empty content.

##### CONTRACT:IPC_HANDLE:open-editor (1)
- **L743#1gl6**
  - Primary Theme: `CONTRACT:IPC_HANDLE:open-editor`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L743`: `ipcMain.handle('open-editor', () => {`
  - Why: Contract surface detected.
  - Repo evidence:
    - Symbol evidence [primary: `createEditorWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L151; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `2` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `2` hits in `electron/main.js`; Verified at: `682c26a`
    - Contract [`open-editor`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `open-editor`
    - Symbol: `ipcMain.handle`
    - Pattern: `ipcMain.handle('open-editor'`
  - Proposed action:
    - Phase 1: preserve
    - Phase 2: none
  - Risk notes / dependencies: Fallbacks captured in nested SEND contracts.

##### CONTRACT:IPC_HANDLE:open-preset-modal (1)
- **L771#9b7r**
  - Primary Theme: `CONTRACT:IPC_HANDLE:open-preset-modal`
  - Type: `contract surface + fallback (guard return)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L771`: `ipcMain.handle('open-preset-modal', (_event, payload) => {`
  - Local evidence (inner): `L772`: `if (!mainWin) return;`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Guard return can silently skip behavior; confirm it is intentional and correctly scoped.
  - Repo evidence:
    - Symbol evidence [primary: `createPresetWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L228; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `2` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `2` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`open-preset-modal`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 2 matches in 2 files (top: `electron/main.js`, `electron/preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `open-preset-modal`
    - Symbol: `ipcMain.handle`
    - Pattern: `if (!mainWin) return`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Guard-return yields silent no-op when `mainWin` is missing; callers must handle. Consider explicit status.

##### CONTRACT:SEND:preset-init (2)
- Shared:
  - Primary Theme: `CONTRACT:SEND:preset-init`
  - Type: `contract surface + fallback (defaulting) + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Symbol evidence [primary: `createPresetWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L228; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `2` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `2` hits in `electron/main.js`; Verified at: `bc16c9a`
    - Contract [`preset-init`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: 3 matches in 2 files (top: `electron/main.js`, `electron/preset_preload.js`); Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Contract: `'preset-init'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `createPresetWindow`
    - Pattern: `catch (`, `console.error`, `console.warn`, `initialData || {}`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor (remove redundant defaulting)
  - Risk notes / dependencies: `initialData || {}` is likely redundant given current caller initializes `initialData = {}`. Confirm there are no other call sites (repo evidence required) before removing to avoid contract payload regressions.  
  - Occurrences:    
    - **L235#1gi8**
      - Anchor evidence: `L235`: `presetWin.webContents.send('preset-init', initialData || {});`
    - **L266#1gi8**
      - Anchor evidence: `L266`: `presetWin.webContents.send('preset-init', initialData || {});` 

##### CONTRACT:DELEGATED_IPC:presetsMain.registerIpc (1)
- **L304#1not**
  - Primary Theme: `CONTRACT:DELEGATED_IPC:presetsMain.registerIpc`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L304`: `presetsMain.registerIpc(ipcMain, {`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `presetsMain`]:
      - Definition trace (F12): defined at `electron/main.js`:L16 (`const presetsMain = require('./presets_main');`); Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `3` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `2` hits in `electron/main.js`; Verified at: `682c26a`
    - Symbol evidence [secondary: `settingsState`]:
      - Definition trace (F12): defined at `electron/main.js`:L12 (`const settingsState = require('./settings');`); Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `22` matches in `3` files (top: `electron/main.js`, `electron/presets_main.js`, `electron/settings.js`); Verified at: `682c26a`    
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `4` hits in `electron/main.js`; Verified at: `682c26a`
    - Delegated IPC registration surface [ipcMain as first arg]:
      - Repo search (Ctrl+Shift+F): `registerIpc(ipcMain` → `4` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'presetsMain.registerIpc'`, `registerIpc(ipcMain`
    - Symbol: `registerIpc`
    - Pattern: `registerIpc(ipcMain`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: 
    - Symbol `presetsMain` repo search includes 1 comment in `electron/main.js`.
    - Delegated IPC registration; ensure it is idempotent and runs early enough. Changes affect downstream contracts.

##### CONTRACT:DELEGATED_IPC:settingsState.registerIpc (1)
- **L284#126a**
  - Primary Theme: `CONTRACT:DELEGATED_IPC:settingsState.registerIpc`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L284`: `settingsState.registerIpc(ipcMain, {`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `settingsState`]:
      - Definition trace (F12): defined at `electron/main.js`:L12 (`const settingsState = require('./settings');`); Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `22` matches in `3` files (top: `electron/main.js`, `electron/presets_main.js`, `electron/settings.js`); Verified at: `682c26a`    
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `4` hits in `electron/main.js`; Verified at: `682c26a`
    - Delegated IPC registration surface [ipcMain as first arg]:
      - Repo search (Ctrl+Shift+F): `registerIpc(ipcMain` → `4` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'settingsState.registerIpc'`, `registerIpc(ipcMain`
    - Symbol: `registerIpc`
    - Pattern: `registerIpc(ipcMain`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Delegated IPC registration; ensure it is idempotent and runs early enough. Changes affect downstream contracts.

##### CONTRACT:DELEGATED_IPC:textState.registerIpc (1)
- **L278#q3if**
  - Primary Theme: `CONTRACT:DELEGATED_IPC:textState.registerIpc`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L278`: `textState.registerIpc(ipcMain, () => ({`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `textState`]:
      - Definition trace (F12): defined at `electron/main.js`:L13 (`const textState = require('./text_state');`); Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `5` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `5` hits in `1`; Verified at: `682c26a`
    - Delegated IPC registration surface [ipcMain as first arg]:
      - Repo search (Ctrl+Shift+F): `registerIpc(ipcMain` → `4` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'textState.registerIpc'`, `registerIpc(ipcMain`
    - Symbol: `registerIpc`
    - Pattern: `registerIpc(ipcMain`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Delegated IPC registration; ensure it is idempotent and runs early enough. Changes affect downstream contracts.

##### CONTRACT:DELEGATED_IPC:updater.registerIpc (1)
- **L315#5chc**
  - Primary Theme: `CONTRACT:DELEGATED_IPC:updater.registerIpc`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L315`: `updater.registerIpc(ipcMain, {`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `updater`]:
      - Definition trace (F12): defined at `electron/main.js`:L17 (`const updater = require('./updater');`); Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `7` matches in `2` files (top: `electron/main.js` and 1 comment in `electron/updater.js`); Verified at: `682c26a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `4` hits in `electron/main.js`; Verified at: `682c26a`
    - Delegated IPC registration surface [ipcMain as first arg]:
      - Repo search (Ctrl+Shift+F): `registerIpc(ipcMain` → `4` matches in `1` file (top: `electron/main.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `registerIpc(ipcMain`,
    - Symbol: `registerIpc`
    - Pattern: `registerIpc(ipcMain`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Delegated IPC registration; ensure it is idempotent and runs early enough. Changes affect downstream contracts.

#### P2-FALLBACK (17)

##### PATTERN:CATCH_LOG_ONLY (12)
- **L77#1xp5**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L77-79`: `} catch (err) { console.warn('Error registering development shortcuts:', err); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Dev-only shortcuts: log-only failures may silently disable dev accelerators; ensure this path cannot break production behavior and avoid noisy logs during startup/reload.
- **L85#1xp5**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L85-87`: `} catch (err) { console.warn('Error unregistering global shortcuts:', err); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: If unregister fails, shortcuts may remain registered across lifecycle transitions; potential interference with OS/global bindings. Ensure will-quit/shutdown remains stable even if cleanup fails.
- **L121#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L121-123`: `} catch (e) { console.error('Error closing editorWin from mainWin.close:', e); }`        
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Close/cleanup path for `editorWin`: log-only failure can leave the window/reference in an inconsistent state (dangling listeners, memory/resource leak). Consider making cleanup idempotent and clearing references even on error.
- **L129#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L129-131`: `} catch (e) { console.error('Error closing presetWin from mainWin.close:', e); }`        
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Close/cleanup path for `presetWin`: log-only failure can leave the window open or references stale. Consider ensuring reference nulling / defensive checks so subsequent open/close flows do not drift.
- **L133#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L133-135`: `} catch (e) { console.error('Error in mainWin.close handler:', e); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Catch inside `mainWin.close` handler: swallowing errors can mask shutdown sequencing bugs (windows not closing, state not persisted). If this handler gates teardown, consider surfacing a user-visible failure or forcing a safe minimal shutdown path.
- **L145#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L145-147`: `} catch (e) { console.error('Error calling app.quit() in mainWin.closed:', e); }`        
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: If `app.quit()` fails and is swallowed, the app may remain running with UI already torn down. Consider a more explicit fallback (e.g., retry once, or ensure the process terminates deterministically if that is required by UX).
- **L214#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L214-216`: `} catch (e) { console.error('Error showing manual editor:', e); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Manual editor open/show: log-only failure is user-visible (action does nothing). Consider returning/propagating a status to the renderer so UI can report failure instead of silently continuing.
- **L358#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L358-360`: `} catch (e) { console.error('Error applying fallback language:', e); } finally {`        
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Language fallback path: log-only failure can leave the app without a valid language state. Ensure there is a deterministic fallback language and that the “finally” block cannot hide a partially-initialized state.
- **L365#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L365-367`: `} catch (e) { console.error('Error creating mainWin after closing language modal:', e); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Failure creating `mainWin` after language modal close is startup-critical. Log-only behavior risks a “dead” app state. Consider surfacing a fatal error path (dialog + exit) or a controlled retry if appropriate.
- **L549#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L549-551`: `} catch (e) { console.warn('Position could not be calculated from screen.getPrimaryDisplay(); using the default FW position.', e); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Position calculation fallback: errors are swallowed and default FW position is used. Ensure the default position is always within workArea across DPI/multi-display setups and avoid repeated logs if this computation can be hit frequently.
- **L566#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L566-568`: `} catch (e) { console.error('Error loading floating HTML:', e); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Floating HTML load failure likely breaks the floating window UX. Log-only handling can leave the feature “dead” without feedback. Consider propagating status to the UI and/or disabling the feature until reload to avoid inconsistent state.
- **L845#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L845-847`: `} catch (e) { console.error('Error clearing stopwatch in will-quit:', e); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bcatch\s*\([^)]*\)\s*\{\s*console\.(warn|error)\b`]: `18` matches in `6` files (top: `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: will-quit cleanup: swallowing errors is typically acceptable, but ensure repeated failures do not spam logs and that cleanup attempts are idempotent (no secondary exceptions during shutdown).

##### PATTERN:DEFAULT_OR (2)
- **L51#1fba**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L51`: `const effectiveLang = lang || currentLanguage || 'es';`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `||`
      - Local matches in `electron/main.js`: `22`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `325` matches in `20` files (top: `public/renderer.js`, `electron/menu_builder.js`, `electron/presets_main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `buildAppMenu`]:
      - Definition trace (F12): defined at `electron/main.js`:L50; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `9` matches in `3` files (top: `electron/main.js`, `electron/menu_builder.js`, `electron/settings.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `3` hits in `electron/main.js`; Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Pattern: `||`, `lang ||`, `currentLanguage ||`, `'es'`
    - Symbol: `buildAppMenu`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Likely intentional language fallback chain. Defer unless evidence shows incorrect `lang` domain (e.g., empty string should be preserved).  
- **L801#1s82**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L801`: `currentLanguage = settings.language || 'es';`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `||`
      - Local matches in `electron/main.js`: `22`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `325` matches in `20` files (top: `public/renderer.js`, `electron/menu_builder.js`, `electron/presets_main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `settingsState.init`]:
      - Definition trace (F12): defined at `electron/settings.js`:L111; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `1` match in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
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
  - Type: `fallback (error swallow; noop)`
  - Tags: `near_contract`
  - Local evidence: `L323`: `try { langWin.focus(); } catch (e) { /* noop */ }`
  - Why: Noop catch can hide failures; confirm it is intentional and scoped. One-line catch form.
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `catch (`, `/* noop */`
      - Local matches in `electron/main.js`: `9`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `27` matches in `6` files (top: `public/manual.js`, `electron/main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `createLanguageWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L321; Verified at: `bc16c9a`
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
  - Type: `fallback (error swallow; noop) + fallback (defaulting)`
  - Tags: `near_contract`  
  - Local evidence: `L504`: `try { floatingWin.setBounds({ x: options.x || floatingWin.getBounds().x, y: options.y || floatingWin.getBounds().y }); } catch (e) { /* noop */ }`
  - Why: Noop catch can hide failures; confirm it is intentional and scoped. One-line catch form. Defaulting via || on options.x can discard valid 0 values; prefer typed/nullish fallback if 0 is meaningful.
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `catch (`, `/* noop */`
      - Local matches in `electron/main.js`: `9`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `27` matches in `6` files (top: `public/manual.js`, `electron/main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `createFloatingWindow`]:
      - Definition trace (F12): defined at `electron/main.js`:L499; Verified at: `bc16c9a`
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
  - Type: `fallback (error swallow; noop)`
  - Tags: `near_contract`  
  - Local evidence: `L573-575`: `} catch (e) { /* noop */ }`
  - Why: Noop catch can hide failures; confirm it is intentional and scoped. Multi-line catch body (non-throwing).        
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `catch (`, `/* noop */`
      - Local matches in `electron/main.js`: `9`; Verified at: `bc16c9a`
      - Repo matches (Ctrl+Shift+F): `27` matches in `6` files (top: `public/manual.js`, `electron/main.js`); Verified at: `bc16c9a`
    - Symbol evidence [primary: `snapWindowFullyIntoWorkArea`]:
      - Definition trace (F12): defined at `electron/main.js`:L408; Verified at: `bc16c9a`
      - Repo search (Ctrl+Shift+F): `5` matches in `1` file (top: `electron/main.js`); Verified at: `bc16c9a`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `5` hits in `electron/main.js`; Verified at: `bc16c9a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `/* noop */`, `snapWindowFullyIntoWorkArea(`
    - Symbol: `snapWindowFullyIntoWorkArea`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor
  - Risk notes / dependencies: If `snapWindowFullyIntoWorkArea` throws, swallowing may leave the floating window partially off-screen (user-visible). Prefer making the snap function robust or logging/reporting controlled failures.    

#### DEFER (5)

##### PATTERN:GUARD_RETURN (5)
- **L60#1l4p**
  - Primary Theme: `PATTERN:GUARD_RETURN`
  - Type: `fallback (guard return)`
  - Local evidence: `L60`: `if (app.isPackaged) return;`
  - Why: Guard return can silently skip behavior; confirm it is intentional and correctly scoped.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bif\s*\([^)]*\)\s*return\b`]: `49` matches in `13` files (top: `public/renderer.js`, `electron/main.js`, `electron/presets_main.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `if (app.isPackaged) return;`, `app.isPackaged`, `return;`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: This guard disables behavior in packaged builds; ensure any diagnostics/dev-only side effects are not required for production correctness and that the guard cannot accidentally suppress needed runtime behavior.
- **L414#10re**
  - Primary Theme: `PATTERN:GUARD_RETURN`
  - Type: `fallback (guard return)`
  - Local evidence: `L414`: `if (!wa) return;`
  - Why: Guard return can silently skip behavior; confirm it is intentional and correctly scoped.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bif\s*\([^)]*\)\s*return\b`]: `49` matches in `13` files (top: `public/renderer.js`, `electron/main.js`, `electron/presets_main.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `if (!wa) return;`, `workArea`, `return;`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: Silent return can skip positioning/restore behavior when `workArea` is unavailable; confirm callers tolerate no-op and consider returning an explicit status or logging in non-noisy form if this can affect UX.
- **L478#m8qu**
  - Primary Theme: `PATTERN:GUARD_RETURN`
  - Type: `fallback (guard return)`
  - Local evidence: `L478`: `if (!manualMoveArmed) return;`
  - Why: Guard return can silently skip behavior; confirm it is intentional and correctly scoped.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bif\s*\([^)]*\)\s*return\b`]: `49` matches in `13` files (top: `public/renderer.js`, `electron/main.js`, `electron/presets_main.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `if (!manualMoveArmed) return;`, `manualMoveArmed`, `return;`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Guard enforces a state precondition; if that state can desync (e.g., window recreated / event ordering), the guarded operation becomes a silent no-op. Ensure state is reset/armed deterministically to avoid “nothing happens” UX.
- **L622#7308**
  - Primary Theme: `PATTERN:GUARD_RETURN`
  - Type: `fallback (guard return)`
  - Local evidence: `L622`: `if (cronoInterval) return;`
  - Why: Guard return can silently skip behavior; confirm it is intentional and correctly scoped.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bif\s*\([^)]*\)\s*return\b`]: `49` matches in `13` files (top: `public/renderer.js`, `electron/main.js`, `electron/presets_main.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `if (cronoInterval) return;`, `cronoInterval`, `setInterval(`, `clearInterval(`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Guard prevents double-starting an interval; ensure there is a single authoritative place that clears `cronoInterval` on stop/reset to avoid a stuck “already running” state that blocks restarts.
- **L660#1yhe**
  - Primary Theme: `PATTERN:GUARD_RETURN`
  - Type: `fallback (guard return)`
  - Local evidence: `L660`: `if (crono.running) return;`
  - Why: Guard return can silently skip behavior; confirm it is intentional and correctly scoped.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [`\bif\s*\([^)]*\)\s*return\b`]: `49` matches in `13` files (top: `public/renderer.js`, `electron/main.js`, `electron/presets_main.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `if (crono.running) return;`, `crono.running`, `crono`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: preserve
  - Risk notes / dependencies: Guard prevents starting when already running; ensure `crono.running` is updated atomically with interval/state transitions (including error paths) so the flag cannot remain true after a failed start/stop sequence.

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
