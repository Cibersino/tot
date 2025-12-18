# Code Cleanup Note — <RELATIVE_PATH>

> Location: `docs/cleanup/electron_preload_js.md`  
> Scope: This document records all evidence and decisions needed to clean, reorder, and de-legacy a single file, in two phases:
> - **Phase 1 (Safe):** no functional changes; must preserve observable behavior.
> - **Phase 2 (Risk):** may change behavior; requires targeted tests.

---

## 0) Metadata

- Target file: `electron/preload.js`
- Slug: `electron_preload_js`
- Date started: `2025-12-17`
- Branch: `depuracion2`
- Baseline commit (short SHA): `36fe2e1`
- Latest commit touching this cleanup: `50c0396`
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
> Generated from AST. Source: `electron/preload.js`

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

#### Exports (module.exports / exports.*)
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
> **Official counts are surface-only**: contract surface statements only.
> Exclude mentions in logs/comments/user-facing messages/docs.

**Per-key record (copy from `_repo_contract_usage.md`; keep per-key, no global notes)**

#### IPC — ipcRenderer.invoke

- Key: `check-for-updates`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/updater.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `crono-get-state`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `floating-close`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `floating-open`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `force-clear-editor`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/text_state.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `get-app-config`
  - Cache (official; surface-only): `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at: `36fe2e1`

- Key: `get-current-text`
  - Cache (official; surface-only): `3` matches in `3` files (top: `electron/text_state.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at: `36fe2e1`

- Key: `get-default-presets`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `get-settings`
  - Cache (official; surface-only): `5` matches in `5` files (top: `electron/settings.js`, `electron/preload.js`, `electron/manual_preload.js`, `electron/preset_preload.js`, `electron/flotante_preload.js`)
  - Verified at: `36fe2e1`

- Key: `notify-no-selection-edit`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `open-default-presets-folder`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `open-editor`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `open-preset-modal`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `request-delete-preset`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `request-restore-defaults`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `set-current-text`
  - Cache (official; surface-only): `3` matches in `3` files (top: `electron/text_state.js`, `electron/preload.js`, `electron/manual_preload.js`)
  - Verified at: `36fe2e1`

- Key: `set-mode-conteo`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/settings.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

#### IPC — ipcRenderer.send

- Key: `crono-reset`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `crono-set-elapsed`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `crono-toggle`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

#### IPC — ipcRenderer.on

- Key: `crono-state`
  - Cache (official; surface-only): `5` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at: `36fe2e1`

- Key: `current-text-updated`
  - Cache (official; surface-only): `3` matches in `2` files (top: `electron/text_state.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `flotante-closed`
  - Cache (official; surface-only): `3` matches in `3` files (top: `electron/main.js`, `electron/preload.js`, `electron/flotante_preload.js`)
  - Verified at: `36fe2e1`

- Key: `manual-editor-ready`
  - Cache (official; surface-only): `3` matches in `2` files (top: `electron/main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `menu-click`
  - Cache (official; surface-only): `2` matches in `2` files (top: `electron/menu_builder.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `preset-created`
  - Cache (official; surface-only): `3` matches in `2` files (top: `electron/presets_main.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

- Key: `settings-updated`
  - Cache (official; surface-only): `9` matches in `3` files (top: `electron/presets_main.js`, `electron/settings.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

#### Preload boundary — contextBridge.exposeInMainWorld

- Key: `electronAPI`
  - Cache (definition; surface-only): [regex `contextBridge\.exposeInMainWorld\(\s*['"]electronAPI['"]`]: `1` match in `1` file (top: `electron/preload.js`)
  - Cache (usage; access sites): [regex `\b(?:window|globalThis)\.electronAPI\b`]: `69` matches in `2` files (top: `public/renderer.js`, `public/js/menu.js`)
  - Verified at: `36fe2e1`

---

### B2.3) Observability / UX Mentions (local-only)
> Script: v1.2.0
> Target: `electron/preload.js`
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
- L81:     // ------------------ NEW APIs for the floating window (updated) ------------------
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
> Auto-generated bootstrap from `<RELATIVE_PATH>`. Suggested labels are heuristics; you must confirm and fill repo evidence where required.
> Theme headers are navigation only; occurrences remain the unit of decision.
> Tooling note (repo-wide): `Shift+F12` is file-local and tooling-derived (JS language service). It may return `0` or non-canonical counts for CommonJS/property access and dynamic JS. Treat `Shift+F12` counts as “semantic-ish signals”, not as proof of absence/presence. Use `Ctrl+Shift+F` for surface/textual counts.
> Pattern counting convention: “noop catches” counted via regex `\/\*\s*noop\s*\*\/` (covers `/* noop */` and `/*noop*/`; multi-line safe). Assumption: all noop markers occur inside catches.

- No candidates detected by heuristics.

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
