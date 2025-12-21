# Code Cleanup Note — <RELATIVE_PATH>

> Location: `docs/cleanup/electron_preload_js.md`  
> Scope: This document records all evidence and decisions needed to clean, reorder, and de-legacy a single file, in two phases:
> - **Phase 1 (Safe):** no functional changes; must preserve observable behavior.
> - **Phase 2 (Risk):** may change behavior; requires targeted tests.

---

## 0) Metadata

- Target file: `electron/preload.js`
- Slug: `electron_preload_js`
- Evidence snapshots:
  - `682c26a`: `2025/12/18`. Start
  - `98975dc`: `2025/12/21`. No changes in code.
- Change log: No changes in code.
- Phase 1 status: `pending`
- Phase 2 status: `pending`

---

## 1) Step B — Evidence Pack

### B1) Top-level inventory (AST)
> Generated from AST. Source: `electron/preload.js`

#### Top-level state (global variables)
- (none)

#### Top-level declarations
**Functions**
- (none)

**Classes**
- (none)

**Variables assigned to functions**
- (none)

#### Top-level constants (non-function)
- `L2`: const clipboard
- `L2`: const contextBridge
- `L2`: const ipcRenderer
- `L4`: const api

#### Other top-level statements (units / side effects)
- `L104`: [ExpressionStatement] contextBridge.exposeInMainWorld("electronAPI", api)
  - raw: contextBridge.exposeInMainWorld('electronAPI', api);

---

### B2) Contract Lock
> Contract lock = externally observable “interfaces” that must not change in Phase 1:
> IPC channels, event names, storage keys, file paths, menu action IDs, etc.
> Generated from AST. Source: `C:\Users\manue\Documents\toT-ReadingMeter\tot-readingmeter\electron\preload.js`

#### IPC — ipcMain.handle
- Total calls: 0
- Unique keys: 0

- (none)

#### IPC — ipcMain.on
- Total calls: 0
- Unique keys: 0

- (none)

#### IPC — ipcMain.once
- Total calls: 0
- Unique keys: 0

- (none)

#### IPC — ipcRenderer.invoke
- Total calls: 17
- Unique keys: 17

- `check-for-updates` — 1 call(s): L8
- `crono-get-state` — 1 call(s): L74
- `floating-close` — 1 call(s): L86
- `floating-open` — 1 call(s): L83
- `force-clear-editor` — 1 call(s): L40
- `get-app-config` — 1 call(s): L14
- `get-current-text` — 1 call(s): L12
- `get-default-presets` — 1 call(s): L28
- `get-settings` — 1 call(s): L20
- `notify-no-selection-edit` — 1 call(s): L37
- `open-default-presets-folder` — 1 call(s): L11
- `open-editor` — 1 call(s): L7
- `open-preset-modal` — 1 call(s): L10
- `request-delete-preset` — 1 call(s): L31
- `request-restore-defaults` — 1 call(s): L34
- `set-current-text` — 1 call(s): L13
- `set-mode-conteo` — 1 call(s): L59

#### IPC — ipcRenderer.send
- Total calls: 3
- Unique keys: 3

- `crono-reset` — 1 call(s): L72
- `crono-set-elapsed` — 1 call(s): L73
- `crono-toggle` — 1 call(s): L71

#### IPC — ipcRenderer.on
- Total calls: 7
- Unique keys: 7

- `crono-state` — 1 call(s): L77
- `current-text-updated` — 1 call(s): L16
- `flotante-closed` — 1 call(s): L92
- `manual-editor-ready` — 1 call(s): L99
- `menu-click` — 1 call(s): L47
- `preset-created` — 1 call(s): L24
- `settings-updated` — 1 call(s): L65

#### IPC — ipcRenderer.once
- Total calls: 0
- Unique keys: 0

- (none)

#### Preload boundary — contextBridge.exposeInMainWorld
- Total calls: 1
- Unique keys: 1

- `electronAPI` — 1 call(s): L104 (bound: api)

#### Renderer events — webContents.send
- Total calls: 0
- Unique keys: 0

- (none)

#### Menu action IDs / routing keys (via `webContents.send("menu-click", <id>)`)
- Total calls: 0
- Unique keys: 0

- (none)

#### Persistent storage filenames (via `path.join(CONFIG_DIR, "*.json")`)
- Total calls: 0
- Unique keys: 0

- (none)

#### Delegated IPC registration calls (first arg: ipcMain)
- Total calls: 0
- Unique keys: 0

- (none)

#### Exports (module.exports / exports.*) [non-string surface; local-only; NOT part of B2.2 cache sync]
- Total calls: 0
- Unique keys: 0

- (none)

### B2.1) Raw match map (auto)
> Auto-generated navigation map. Paste only what you actually use for navigation.

- Pattern: `ipcRenderer.invoke(`
  - Count: 17
  - Key matches:
    - `L7`: `ipcRenderer.invoke('open-editor')`
    - `L8`: `ipcRenderer.invoke('check-for-updates', { manual })`
    - `L10`: `ipcRenderer.invoke('open-preset-modal', payload)`
    - `L11`: `ipcRenderer.invoke('open-default-presets-folder')`
    - `L12`: `ipcRenderer.invoke('get-current-text')`
    - `L13`: `ipcRenderer.invoke('set-current-text', text)`
    - `L14`: `ipcRenderer.invoke('get-app-config')`
    - `L20`: `ipcRenderer.invoke('get-settings')`
    - `L28`: `ipcRenderer.invoke('get-default-presets')`
    - `L31`: `ipcRenderer.invoke('request-delete-preset', name)`
    - `L34`: `ipcRenderer.invoke('request-restore-defaults')`
    - `L37`: `ipcRenderer.invoke('notify-no-selection-edit')`
    - `L40`: `ipcRenderer.invoke('force-clear-editor')`
    - `L59`: `ipcRenderer.invoke('set-mode-conteo', mode)`
    - `L74`: `ipcRenderer.invoke('crono-get-state')`
    - `L83`: `ipcRenderer.invoke('floating-open')`
    - `L86`: `ipcRenderer.invoke('floating-close')`
- Pattern: `ipcRenderer.send(`
  - Count: 3
  - Key matches:
    - `L71`: `ipcRenderer.send('crono-toggle')`
    - `L72`: `ipcRenderer.send('crono-reset')`
    - `L73`: `ipcRenderer.send('crono-set-elapsed', ms)`
- Pattern: `ipcRenderer.on(`
  - Count: 7
  - Key matches:
    - `L16`: `ipcRenderer.on('current-text-updated', (_e, text) => cb(text))`
    - `L24`: `ipcRenderer.on('preset-created', (_e, preset) => cb(preset))`
    - `L47`: `ipcRenderer.on('menu-click', wrapper)`
    - `L65`: `ipcRenderer.on('settings-updated', listener)`
    - `L77`: `ipcRenderer.on('crono-state', wrapper)`
    - `L92`: `ipcRenderer.on('flotante-closed', listener)`
    - `L99`: `ipcRenderer.on('manual-editor-ready', listener)`
- Pattern: `contextBridge.exposeInMainWorld(`
  - Count: 1
  - Key matches:
    - `L104`: `contextBridge.exposeInMainWorld('electronAPI', api)`

---

### B2.2) Repo contract cache sync (mandatory; surface-only)
> This section syncs Contract Lock keys with `docs/cleanup/_repo_contract_usage.md`.
> **Official counts are surface-only**: contract surface statements only (exclude mentions in logs/comments/user-facing messages/docs).

**Per-key record (copy from `_repo_contract_usage.md`; keep per-key, no global notes)**

#### IPC — ipcRenderer.invoke

- Key: `check-for-updates`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/updater.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `crono-get-state`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `floating-close`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `floating-open`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `force-clear-editor`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/text_state.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `get-app-config`
  - Cache (official; surface-only): `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at: `682c26a`

- Key: `get-current-text`
  - Cache (official; surface-only): `3` matches in `3` files (top: `electron/text_state.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at: `682c26a`

- Key: `get-default-presets`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `get-settings`
  - Cache (official; surface-only): `5` matches in `5` files (top: `electron/settings.js`, `electron/preload.js`, `electron/manual_preload.js`, `electron/preset_preload.js`, `electron/flotante_preload.js`)
  - Verified at: `682c26a`

- Key: `notify-no-selection-edit`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `open-default-presets-folder`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `open-editor`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `open-preset-modal`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `request-delete-preset`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `request-restore-defaults`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `set-current-text`
  - Cache (official; surface-only): `3` matches in `3` files (top: `electron/text_state.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at: `682c26a`

- Key: `set-mode-conteo`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/settings.js`, `electron/preload.js`)
  - Verified at: `682c26a`

#### IPC — ipcRenderer.send

- Key: `crono-reset`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `crono-set-elapsed`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `crono-toggle`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

#### IPC — ipcRenderer.on

- Key: `crono-state`
  - Cache (official; surface-only): `5` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at: `682c26a`

- Key: `current-text-updated`
  - Cache (official; surface-only): `3` matches in `2` files (top: `electron/text_state.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `flotante-closed`
  - Cache (official; surface-only): `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at: `682c26a`

- Key: `manual-editor-ready`
  - Cache (official; surface-only): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `menu-click`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/menu_builder.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `preset-created`
  - Cache (official; surface-only): `3` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `682c26a`

- Key: `settings-updated`
  - Cache (official; surface-only): `9` matches in `3` files (top: `electron/presets_main.js`, `electron/settings.js`, `electron/preload.js`)
  - Verified at: `682c26a`

#### Preload boundary — contextBridge.exposeInMainWorld

- Key: `electronAPI`
  - Cache (definition; surface-only): [regex `contextBridge\.exposeInMainWorld\(\s*['"]electronAPI['"]`]: `1` match in `1` file (top: `electron/preload.js`)
  - Cache (usage; access sites): [regex `\b(?:window|globalThis)\.electronAPI\b`]: `69` matches in `2` files (top: `public/renderer.js`, `public/js/menu.js`)
  - Verified at: `682c26a`

---

### B2.3) Observability / UX Mentions (local-only)
> Script: v1.2.0
> Target: `C:\Users\manue\Documents\toT-ReadingMeter\tot-readingmeter\electron\preload.js`
> Realpath: `C:\Users\manue\Documents\toT-ReadingMeter\tot-readingmeter\electron\preload.js`
> Format: `L<line>: <snippet>`
> Block capture: max 16 lines

#### Logs (console.*)
- L45:             try { cb(payload); } catch (err) { console.error('menuAPI callback error:', err); }
- L46:         };
- L47:         ipcRenderer.on('menu-click', wrapper);
- L54:                 console.error('Error removing menu listener:', e);
- L63:             try { cb(newSettings); } catch (err) { console.error('settings callback error:', err); }
- L64:         };
- L65:         ipcRenderer.on('settings-updated', listener);
- L67:         return () => { try { ipcRenderer.removeListener('settings-updated', listener); } catch (e) { console.error('removeListener error:', e); } };
- L68:     },
- L69:
- L70:     // Central Timer API (renderer <-> main)
- L76:         const wrapper = (_e, state) => { try { cb(state); } catch (err) { console.error('onCronoState callback error:', err); } };
- L77:         ipcRenderer.on('crono-state', wrapper);
- L78:         return () => { try { ipcRenderer.removeListener('crono-state', wrapper); } catch (e) { console.error('removeListener error (crono-state):', e); } };
- L79:     },
- L80:
- L81:     // ------------------ APIs for the floating window (updated) ------------------
- L82:     openFloatingWindow: async () => {
- L83:         return ipcRenderer.invoke('floating-open');
- L91:         const listener = () => { try { cb(); } catch (e) { console.error('floating closed callback error:', e); } };
- L92:         ipcRenderer.on('flotante-closed', listener);
- L93:         return () => { try { ipcRenderer.removeListener('flotante-closed', listener); } catch (e) { console.error('removeListener error:', e); } };
- L94:     },
- L95:
- L96:     // Manual editor ready (to hide loader in main window)
- L98:         const listener = () => { try { cb(); } catch (err) { console.error('manual-ready callback error:', err); } };
- L99:         ipcRenderer.on('manual-editor-ready', listener);
- L100:         return () => { try { ipcRenderer.removeListener('manual-editor-ready', listener); } catch (e) { console.error('removeListener error (manual-editor-ready):', e); } };
- L101:     }
- L102: };
- L103:
- L104: contextBridge.exposeInMainWorld('electronAPI', api);

#### Maintenance comments (TODO/FIXME/HACK/WIP/LEGACY/DEPRECATED)
- (none)

#### User-facing hardcoded (dialog/Notification/etc.)
- (none)

#### Fallback pivot (FALLBACK:)
- (none)

---

### B3) Candidate Ledger (auto-scan; label-sorted; theme-grouped; evidence-gated)
> Auto-generated bootstrap from `electron/preload.js`. Suggested labels are heuristics; you must confirm and fill repo evidence where required.
> Theme headers are navigation only; occurrences remain the unit of decision.
> Tooling note (repo-wide): `Shift+F12` is file-local and tooling-derived (JS language service). It may return `0` or non-canonical counts for CommonJS/property access and dynamic JS. Treat `Shift+F12` counts as “semantic-ish signals”, not as proof of absence/presence. Use `Ctrl+Shift+F` for surface/textual counts.
> Placeholders like `<N>`, `<M>`, `<files>`, `<file>`, `<line>`, `682c26a` are placeholders (not repo evidence) until you fill them via the protocol steps.
> Snippet truncation: rerun with `--max-snippet=0` to disable. List truncation: rerun with `--max-per-label=<N>`.
> Contract surface seeding: `all` (disable with `--seed-contracts=none`).

#### P2-CONTRACT (27)

##### CONTRACT:IPC_INVOKE:check-for-updates (1)
- **L8#1upp**
  - Primary Theme: `CONTRACT:IPC_INVOKE:check-for-updates`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L8`: `checkForUpdates: (manual = false) => ipcRenderer.invoke('check-for-updates', { manual }),`    
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `checkForUpdates`]:
      - Definition trace (F12): defined at `electron/preload.js`:L8; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `9` matches in `3` files (top: `electron/preload.js`, `electron/updater.js`, `public/renderer.js`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `1` hits in `electron/preload.js`; Verified at: `682c26a`
    - Contract [`check-for-updates`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/updater.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'check-for-updates'`, `ipcRenderer.invoke(`
    - Symbol: `checkForUpdates`, `electronAPI.checkForUpdates`, `window.electronAPI.checkForUpdates`
    - Pattern: `invoke('check-for-updates'`, `{ manual }`, `manual = false`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: none
  - Risk notes / dependencies: Payload shape is `{ manual: boolean }` (do not change without coordinating handler and call sites). Contract couples to main-side update flow (see B2.2 top file `electron/updater.js`). Keep channel string stable.

##### CONTRACT:IPC_INVOKE:crono-get-state (1)
- **L74#txry**
  - Primary Theme: `CONTRACT:IPC_INVOKE:crono-get-state`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L74`: `getCronoState: () => ipcRenderer.invoke('crono-get-state'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `getCronoState`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`crono-get-state`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'crono-get-state'`, `ipcRenderer.invoke(`
    - Symbol: `getCronoState`, `electronAPI.getCronoState`, `window.electronAPI.getCronoState`
    - Pattern: `invoke('crono-get-state'`, `getCronoState:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Depends on main-side handler returning a “state” object; any schema change must be coordinated with `onCronoState` consumers and main-side producer. Keep channel stable.

##### CONTRACT:IPC_INVOKE:floating-close (1)
- **L86#yw9g**
  - Primary Theme: `CONTRACT:IPC_INVOKE:floating-close`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L86`: `return ipcRenderer.invoke('floating-close');`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `closeFloatingWindow`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`floating-close`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'floating-close'`, `ipcRenderer.invoke(`
    - Symbol: `closeFloatingWindow`, `electronAPI.closeFloatingWindow`, `window.electronAPI.closeFloatingWindow`
    - Pattern: `invoke('floating-close'`, `closeFloatingWindow`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Coupled to floating window lifecycle on main side. Keep channel stable; behavior changes must be coordinated with any renderer flows that assume idempotent close.

##### CONTRACT:IPC_INVOKE:floating-open (1)
- **L83#eput**
  - Primary Theme: `CONTRACT:IPC_INVOKE:floating-open`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L83`: `return ipcRenderer.invoke('floating-open');`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `openFloatingWindow`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`floating-open`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'floating-open'`, `ipcRenderer.invoke(`
    - Symbol: `openFloatingWindow`, `electronAPI.openFloatingWindow`, `window.electronAPI.openFloatingWindow`
    - Pattern: `invoke('floating-open'`, `openFloatingWindow`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Coupled to floating window creation/positioning on main side. Keep channel stable; behavior changes must be coordinated with any renderer code expecting a resolved promise/return value.

##### CONTRACT:IPC_INVOKE:force-clear-editor (1)
- **L40#1fxr**
  - Primary Theme: `CONTRACT:IPC_INVOKE:force-clear-editor`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L40`: `forceClearEditor: () => ipcRenderer.invoke('force-clear-editor'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `forceClearEditor`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`force-clear-editor`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/text_state.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'force-clear-editor'`, `ipcRenderer.invoke(`
    - Symbol: `forceClearEditor`, `electronAPI.forceClearEditor`, `window.electronAPI.forceClearEditor`
    - Pattern: `invoke('force-clear-editor'`, `forceClearEditor:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Coupled to editor/text state reset logic on main side (`electron/text_state.js`). Keep channel stable; confirm idempotence expectations in UI.

##### CONTRACT:IPC_INVOKE:get-app-config (1)
- **L14#pb3m**
  - Primary Theme: `CONTRACT:IPC_INVOKE:get-app-config`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L14`: `getAppConfig: () => ipcRenderer.invoke('get-app-config'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `getAppConfig`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`get-app-config`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/manual_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'get-app-config'`, `ipcRenderer.invoke(`
    - Symbol: `getAppConfig`, `electronAPI.getAppConfig`, `window.electronAPI.getAppConfig`
    - Pattern: `invoke('get-app-config'`, `getAppConfig:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Contract likely returns config object consumed by renderer; schema changes must be coordinated with all preloads/renderers that consume it (B2.2 includes `electron/manual_preload.js`). Keep channel stable.

##### CONTRACT:IPC_INVOKE:get-current-text (1)
- **L12#8v0o**
  - Primary Theme: `CONTRACT:IPC_INVOKE:get-current-text`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L12`: `getCurrentText: () => ipcRenderer.invoke('get-current-text'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `getCurrentText`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`get-current-text`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `3` matches in `3` files (top: `electron/text_state.js`, `electron/preload.js`, `electron/manual_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'get-current-text'`, `ipcRenderer.invoke(`
    - Symbol: `getCurrentText`, `electronAPI.getCurrentText`, `window.electronAPI.getCurrentText`
    - Pattern: `invoke('get-current-text'`, `getCurrentText:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Coupled to persisted “current text” state (`electron/text_state.js`). Keep channel stable; any change in return type impacts renderer/editor and manual flows.

##### CONTRACT:IPC_INVOKE:get-default-presets (1)
- **L28#10ki**
  - Primary Theme: `CONTRACT:IPC_INVOKE:get-default-presets`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L28`: `getDefaultPresets: () => ipcRenderer.invoke('get-default-presets'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `getDefaultPresets`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`get-default-presets`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'get-default-presets'`, `ipcRenderer.invoke(`
    - Symbol: `getDefaultPresets`, `electronAPI.getDefaultPresets`, `window.electronAPI.getDefaultPresets`
    - Pattern: `invoke('get-default-presets'`, `getDefaultPresets:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Returns preset list; schema changes impact preset modal/UI and persistence logic (`electron/presets_main.js`). Keep channel stable.

##### CONTRACT:IPC_INVOKE:get-settings (1)
- **L20#1gre**
  - Primary Theme: `CONTRACT:IPC_INVOKE:get-settings`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L20`: `getSettings: () => ipcRenderer.invoke('get-settings'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `getSettings`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`get-settings`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `5` matches in `5` files (top: `electron/settings.js`, `electron/preload.js`, `electron/manual_preload.js`, `electron/preset_preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'get-settings'`, `ipcRenderer.invoke(`
    - Symbol: `getSettings`, `electronAPI.getSettings`, `window.electronAPI.getSettings`
    - Pattern: `invoke('get-settings'`, `getSettings:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: High fan-out: used across multiple preloads (per B2.2). Any schema change must be coordinated broadly; keep channel stable.

##### CONTRACT:IPC_INVOKE:notify-no-selection-edit (1)
- **L37#1bdq**
  - Primary Theme: `CONTRACT:IPC_INVOKE:notify-no-selection-edit`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L37`: `notifyNoSelectionEdit: () => ipcRenderer.invoke('notify-no-selection-edit'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `notifyNoSelectionEdit`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`notify-no-selection-edit`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'notify-no-selection-edit'`, `ipcRenderer.invoke(`
    - Symbol: `notifyNoSelectionEdit`, `electronAPI.notifyNoSelectionEdit`, `window.electronAPI.notifyNoSelectionEdit`
    - Pattern: `invoke('notify-no-selection-edit'`, `notifyNoSelectionEdit:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Likely triggers dialog/notification on main side (`electron/presets_main.js`). Keep channel stable; UI behavior changes should be documented.

##### CONTRACT:IPC_INVOKE:open-default-presets-folder (1)
- **L11#55gp**
  - Primary Theme: `CONTRACT:IPC_INVOKE:open-default-presets-folder`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L11`: `openDefaultPresetsFolder: () => ipcRenderer.invoke('open-default-presets-folder'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `openDefaultPresetsFolder`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`open-default-presets-folder`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'open-default-presets-folder'`, `ipcRenderer.invoke(`
    - Symbol: `openDefaultPresetsFolder`, `electronAPI.openDefaultPresetsFolder`, `window.electronAPI.openDefaultPresetsFolder`
    - Pattern: `invoke('open-default-presets-folder'`, `openDefaultPresetsFolder:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Opens a folder via main side; platform-specific behavior likely lives in `electron/presets_main.js`. Keep channel stable.

##### CONTRACT:IPC_INVOKE:open-editor (1)
- **L7#1nxm**
  - Primary Theme: `CONTRACT:IPC_INVOKE:open-editor`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L7`: `openEditor: () => ipcRenderer.invoke('open-editor'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `openEditor`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`open-editor`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'open-editor'`, `ipcRenderer.invoke(`
    - Symbol: `openEditor`, `electronAPI.openEditor`, `window.electronAPI.openEditor`
    - Pattern: `invoke('open-editor'`, `openEditor:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Opens editor window via main side; keep channel stable. Any behavior change must be coordinated with window management in main.

##### CONTRACT:IPC_INVOKE:open-preset-modal (1)
- **L10#1hnt**
  - Primary Theme: `CONTRACT:IPC_INVOKE:open-preset-modal`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L10`: `openPresetModal: (payload) => ipcRenderer.invoke('open-preset-modal', payload),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `openPresetModal`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`open-preset-modal`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'open-preset-modal'`, `ipcRenderer.invoke(`
    - Symbol: `openPresetModal`, `electronAPI.openPresetModal`, `window.electronAPI.openPresetModal`
    - Pattern: `invoke('open-preset-modal'`, `openPresetModal`, `{ wpm`, `mode`, `preset`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: none
  - Risk notes / dependencies: Payload is intentionally polymorphic (comment: number or object `{ wpm, mode, preset }`). Do not change accepted shapes without coordinating all call sites and main handler. Keep channel stable.

##### CONTRACT:IPC_INVOKE:request-delete-preset (1)
- **L31#zylk**
  - Primary Theme: `CONTRACT:IPC_INVOKE:request-delete-preset`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L31`: `requestDeletePreset: (name) => ipcRenderer.invoke('request-delete-preset', name),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `requestDeletePreset`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`request-delete-preset`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'request-delete-preset'`, `ipcRenderer.invoke(`
    - Symbol: `requestDeletePreset`, `electronAPI.requestDeletePreset`, `window.electronAPI.requestDeletePreset`
    - Pattern: `invoke('request-delete-preset'`, `requestDeletePreset:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: User-facing destructive action likely involves dialogs and persistence (per comment). Keep channel stable; validate `name` expectations on main side before tightening.

##### CONTRACT:IPC_INVOKE:request-restore-defaults (1)
- **L34#1cjk**
  - Primary Theme: `CONTRACT:IPC_INVOKE:request-restore-defaults`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L34`: `requestRestoreDefaults: () => ipcRenderer.invoke('request-restore-defaults'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `requestRestoreDefaults`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`request-restore-defaults`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'request-restore-defaults'`, `ipcRenderer.invoke(`
    - Symbol: `requestRestoreDefaults`, `electronAPI.requestRestoreDefaults`, `window.electronAPI.requestRestoreDefaults`
    - Pattern: `invoke('request-restore-defaults'`, `requestRestoreDefaults:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Likely triggers dialog + resets persisted presets. Keep channel stable; changes must be coordinated with persistence logic in `electron/presets_main.js`.

##### CONTRACT:IPC_INVOKE:set-current-text (1)
- **L13#2rzt**
  - Primary Theme: `CONTRACT:IPC_INVOKE:set-current-text`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L13`: `setCurrentText: (text) => ipcRenderer.invoke('set-current-text', text),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `setCurrentText`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`set-current-text`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `3` matches in `3` files (top: `electron/text_state.js`, `electron/preload.js`, `electron/manual_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'set-current-text'`, `ipcRenderer.invoke(`
    - Symbol: `setCurrentText`, `electronAPI.setCurrentText`, `window.electronAPI.setCurrentText`
    - Pattern: `invoke('set-current-text'`, `setCurrentText:`, `text =>`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Writes persisted text state (likely via `electron/text_state.js`). Keep channel stable; any validation/tightening must be coordinated with manual/editor flows.

##### CONTRACT:IPC_INVOKE:set-mode-conteo (1)
- **L59#1k0m**
  - Primary Theme: `CONTRACT:IPC_INVOKE:set-mode-conteo`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L59`: `setModeConteo: (mode) => ipcRenderer.invoke('set-mode-conteo', mode),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `setModeConteo`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`set-mode-conteo`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/settings.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'set-mode-conteo'`, `ipcRenderer.invoke(`
    - Symbol: `setModeConteo`, `electronAPI.setModeConteo`, `window.electronAPI.setModeConteo`
    - Pattern: `invoke('set-mode-conteo'`, `setModeConteo:`, `(mode)`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: none
  - Risk notes / dependencies: `mode` is an input contract; tightening/enum changes require coordinated update with UI and `electron/settings.js`. Keep channel stable.

##### CONTRACT:IPC_ON:crono-state (1)
- **L77#pvhj**
  - Primary Theme: `CONTRACT:IPC_ON:crono-state`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L77`: `ipcRenderer.on('crono-state', wrapper);`
  - Local evidence (inner): `L76`: `const wrapper = (_e, state) => { try { cb(state); } catch (err) { console.error('onCronoState callback error:', err); } };`
  - Local evidence (inner): `L78`: `return () => { try { ipcRenderer.removeListener('crono-state', wrapper); } catch (e) { console.error('removeListener error (crono-state):', e); } };`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `onCronoState`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Symbol evidence [secondary: `broadcastCronoState`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`      
    - Contract [`crono-state`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `5` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'crono-state'`, `ipcMain.on(`, `ipcRenderer.on(`
    - Symbol: `onCronoState`, `electronAPI.onCronoState`, `window.electronAPI.onCronoState`
    - Pattern: `on('crono-state'`, `removeListener('crono-state'`, `onCronoState callback error`
  - Proposed action:
    - Phase 1: comment-only
    - Phase 2: change fallback
  - Risk notes / dependencies: Log-only swallow hides callback errors; decide if this is policy (uniform) or ad-hoc. Any change affects all consumers of `onCronoState` (and similar listener wrappers). Keep channel stable; coordinate with main-side emitter.

##### CONTRACT:IPC_ON:current-text-updated (1)
- **L16#n0kg**
  - Primary Theme: `CONTRACT:IPC_ON:current-text-updated`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L16`: `ipcRenderer.on('current-text-updated', (_e, text) => cb(text));`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `onCurrentTextUpdated`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`current-text-updated`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `3` matches in `2` files (top: `electron/text_state.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'current-text-updated'`, `ipcMain.on(`, `ipcRenderer.on(`
    - Symbol: `onCurrentTextUpdated`, `electronAPI.onCurrentTextUpdated`, `window.electronAPI.onCurrentTextUpdated`
    - Pattern: `on('current-text-updated'`, `onCurrentTextUpdated:`, `cb(text)`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor
  - Risk notes / dependencies: Unlike other listeners, this wrapper does not return an unsubscribe function and does not guard `cb` with try/catch. If called multiple times, risk of listener leaks/duplicate callbacks. Any refactor must preserve channel and argument order.

##### CONTRACT:IPC_ON:flotante-closed (1)
- **L92#lyea**
  - Primary Theme: `CONTRACT:IPC_ON:flotante-closed`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L92`: `ipcRenderer.on('flotante-closed', listener);`
  - Local evidence (inner): `L91`: `const listener = () => { try { cb(); } catch (e) { console.error('floating closed callback error:', e); } };`
  - Local evidence (inner): `L93`: `return () => { try { ipcRenderer.removeListener('flotante-closed', listener); } catch (e) { console.error('removeListener error:', e); } };`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `onFloatingClosed`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`flotante-closed`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'flotante-closed'`, `ipcMain.on(`, `ipcRenderer.on(`
    - Symbol: `onFloatingClosed`, `electronAPI.onFloatingClosed`, `window.electronAPI.onFloatingClosed`
    - Pattern: `on('flotante-closed'`, `removeListener('flotante-closed'`, `floating closed callback error`, `main emits`
  - Proposed action:
    - Phase 1: comment-only
    - Phase 2: none
  - Risk notes / dependencies: Comment says “main emits 'float-closed'” but actual channel is `'flotante-closed'`. Fix comment to avoid accidental contract rename. Log-only swallow policy decision applies here too.

##### CONTRACT:IPC_ON:manual-editor-ready (1)
- **L99#hfoc**
  - Primary Theme: `CONTRACT:IPC_ON:manual-editor-ready`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L99`: `ipcRenderer.on('manual-editor-ready', listener);`
  - Local evidence (inner): `L98`: `const listener = () => { try { cb(); } catch (err) { console.error('manual-ready callback error:', err); } };`
  - Local evidence (inner): `L100`: `return () => { try { ipcRenderer.removeListener('manual-editor-ready', listener); } catch (e) { console.error('removeListener error (manual-editor-ready):', e); } };`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `onManualEditorReady`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`manual-editor-ready`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'manual-editor-ready'`, `ipcMain.on(`, `ipcRenderer.on(`
    - Symbol: `onManualEditorReady`, `electronAPI.onManualEditorReady`, `window.electronAPI.onManualEditorReady`
    - Pattern: `on('manual-editor-ready'`, `removeListener('manual-editor-ready'`, `manual-ready callback error`
  - Proposed action:
    - Phase 1: comment-only
    - Phase 2: change fallback
  - Risk notes / dependencies: Log-only swallow on callback/unsubscribe; decide policy (uniform vs per-event). Keep channel stable; ensure renderer lifecycle calls unsubscribe to avoid leaks.

##### CONTRACT:IPC_ON:menu-click (1)
- **L47#jacp**
  - Primary Theme: `CONTRACT:IPC_ON:menu-click`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L47`: `ipcRenderer.on('menu-click', wrapper);`
  - Local evidence (inner): `L45`: `try { cb(payload); } catch (err) { console.error('menuAPI callback error:', err); }`  
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `onMenuClick`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Symbol evidence [secondary: `buildAppMenu`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`      
    - Contract [`menu-click`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/menu_builder.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'menu-click'`, `ipcMain.on(`, `ipcRenderer.on(`
    - Symbol: `onMenuClick`, `electronAPI.onMenuClick`, `window.electronAPI.onMenuClick`
    - Pattern: `on('menu-click'`, `removeListener('menu-click'`, `menuAPI callback error`, `Error removing menu listener`
  - Proposed action:
    - Phase 1: comment-only
    - Phase 2: change fallback
  - Risk notes / dependencies: This is a “stable listener” surface and likely high-traffic. Log-only swallow may mask real defects; change requires policy decision. Unsubscribe uses try/catch (also tracked by `PATTERN:CATCH_LOG_ONLY`). Keep channel stable; coordinate with main menu emitter (`electron/menu_builder.js`).

##### CONTRACT:IPC_ON:preset-created (1)
- **L24#1a5o**
  - Primary Theme: `CONTRACT:IPC_ON:preset-created`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L24`: `ipcRenderer.on('preset-created', (_e, preset) => cb(preset));`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `onPresetCreated`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`preset-created`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `3` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'preset-created'`, `ipcMain.on(`, `ipcRenderer.on(`
    - Symbol: `onPresetCreated`, `electronAPI.onPresetCreated`, `window.electronAPI.onPresetCreated`
    - Pattern: `on('preset-created'`, `onPresetCreated:`, `cb(preset)`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: refactor
  - Risk notes / dependencies: Like `current-text-updated`, this wrapper does not return unsubscribe and does not guard `cb`. Risk of listener leaks/duplicate callbacks if registered repeatedly. Any refactor must preserve payload schema and channel.

##### CONTRACT:IPC_ON:settings-updated (1)
- **L65#4gz7**
  - Primary Theme: `CONTRACT:IPC_ON:settings-updated`
  - Type: `contract surface + fallback (error swallow; log-only)`
  - Tags: `touches_contract, near_contract`
  - Anchor evidence: `L65`: `ipcRenderer.on('settings-updated', listener);`
  - Local evidence (inner): `L63`: `try { cb(newSettings); } catch (err) { console.error('settings callback error:', err); }`
  - Local evidence (inner): `L67`: `return () => { try { ipcRenderer.removeListener('settings-updated', listener); } catch (e) { console.error('removeListener error:', e); } };`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present. Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. One-line catch form.
  - Repo evidence:
    - Symbol evidence [primary: `onSettingsChanged`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`settings-updated`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `9` matches in `3` files (top: `electron/presets_main.js`, `electron/settings.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'settings-updated'`, `ipcMain.on(`, `ipcRenderer.on(`
    - Symbol: `onSettingsChanged`, `electronAPI.onSettingsChanged`, `window.electronAPI.onSettingsChanged`
    - Pattern: `on('settings-updated'`, `removeListener('settings-updated'`, `settings callback error`, `removeListener error:`
  - Proposed action:
    - Phase 1: comment-only
    - Phase 2: change fallback
  - Risk notes / dependencies: High fan-out (see B2.2 top files). Log-only swallow policy decision applies here. Keep channel stable; schema changes to settings must be coordinated with `electron/settings.js` and consumers.

##### CONTRACT:IPC_SEND:crono-reset (1)
- **L72#mia8**
  - Primary Theme: `CONTRACT:IPC_SEND:crono-reset`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L72`: `sendCronoReset: () => ipcRenderer.send('crono-reset'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `sendCronoReset`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`crono-reset`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'crono-reset'`, `ipcRenderer.send(`
    - Symbol: `sendCronoReset`, `electronAPI.sendCronoReset`, `window.electronAPI.sendCronoReset`
    - Pattern: `send('crono-reset'`, `sendCronoReset:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Fire-and-forget message; no acknowledgement. If reliability/ordering becomes an issue, consider migrating to invoke/ack pattern (requires coordinated contract migration). Keep channel stable.

##### CONTRACT:IPC_SEND:crono-set-elapsed (1)
- **L73#1s7c**
  - Primary Theme: `CONTRACT:IPC_SEND:crono-set-elapsed`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L73`: `setCronoElapsed: (ms) => ipcRenderer.send('crono-set-elapsed', ms),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `setCronoElapsed`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`crono-set-elapsed`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'crono-set-elapsed'`, `ipcRenderer.send(`
    - Symbol: `setCronoElapsed`, `electronAPI.setCronoElapsed`, `window.electronAPI.setCronoElapsed`
    - Pattern: `send('crono-set-elapsed'`, `setCronoElapsed:`, `(ms)`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: none
  - Risk notes / dependencies: `ms` is an input contract (likely number). Tightening/validation must be coordinated with sender and main handler. Fire-and-forget semantics; keep channel stable.

##### CONTRACT:IPC_SEND:crono-toggle (1)
- **L71#19of**
  - Primary Theme: `CONTRACT:IPC_SEND:crono-toggle`
  - Type: `contract surface`
  - Tags: `touches_contract`
  - Anchor evidence: `L71`: `sendCronoToggle: () => ipcRenderer.send('crono-toggle'),`
  - Why: Contract surface detected; included to maintain complete contract inventory even if no fallback/guard/comment signals are present.
  - Repo evidence:
    - Symbol evidence [primary: `sendCronoToggle`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `682c26a`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `682c26a`
    - Contract [`crono-toggle`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Contract: `'crono-toggle'`, `ipcRenderer.send(`
    - Symbol: `sendCronoToggle`, `electronAPI.sendCronoToggle`, `window.electronAPI.sendCronoToggle`
    - Pattern: `send('crono-toggle'`, `sendCronoToggle:`
  - Proposed action:
    - Phase 1: none
    - Phase 2: none
  - Risk notes / dependencies: Fire-and-forget; ordering vs other crono messages may matter. Keep channel stable; any migration to invoke/ack requires coordinated change.

#### P2-FALLBACK (1)

##### PATTERN:CATCH_LOG_ONLY (1)
- **L53#1hm2**
  - Primary Theme: `PATTERN:CATCH_LOG_ONLY`
  - Type: `fallback (error swallow; log-only)`
  - Local evidence: `L53-55`: `} catch (e) { console.error('Error removing menu listener:', e); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `catch (` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `682c26a`
  - Suggested queries (optional):
    - Pattern: `catch (`, `console.error`, `console.warn`
    - Pattern (narrow): `Error removing menu listener`, `removeListener('menu-click'`, `onMenuClick`
  - Proposed action:
    - Phase 1: doc only
    - Phase 2: change fallback
  - Risk notes / dependencies: This catch is within `onMenuClick` unsubscribe. Treat as coupled to that contract surface (do not “fix” in isolation). If you change fallback policy (e.g., remove swallow), coordinate with renderer lifecycle and error reporting expectations.

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
