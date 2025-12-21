# Code Cleanup Note — <RELATIVE_PATH>

> Location: `docs/cleanup/menu_builder_js.md`  
> Scope: This document records all evidence and decisions needed to clean, reorder, and de-legacy a single file, in two phases:
> - **Phase 1 (Safe):** no functional changes; must preserve observable behavior.
> - **Phase 2 (Risk):** may change behavior; requires targeted tests.

---

## 0) Metadata

- Target file: `electron/menu_builder.js`
- Slug: `menu_builder_js`
- Date started: `2025-12-18`
- Branch: `depuracion2`
- Baseline commit (short SHA): `682c26a`
- Latest commit touching this cleanup: `TBD`
- Phase 1 status: `pending`
- Phase 2 status: `pending`

---

## 1) Step B — Evidence Pack

### B1) Top-level inventory (AST)
> Generated from AST. Source: `electron/menu_builder.js`

#### Top-level state (global variables)
- (none)

#### Top-level declarations
**Functions**
- `L11`: loadMainTranslations()
- `L29`: getDialogTexts()
- `L44`: buildAppMenu()

**Classes**
- (none)

**Variables assigned to functions**
- (none)

#### Top-level constants (non-function)
- `L6`: const app
- `L6`: const Menu
- `L7`: const fs
- `L8`: const path

#### Other top-level statements (units / side effects)
- `L219`: [ExpressionStatement] <AssignmentExpression>
  - raw: module.exports = { loadMainTranslations, getDialogTexts, buildAppMenu, };

---

### B2) Contract Lock
> Contract lock = externally observable “interfaces” that must not change in Phase 1:
> IPC channels, event names, storage keys, file paths, menu action IDs, etc.
> Generated from AST. Source: `C:\Users\manue\Documents\toT-ReadingMeter\tot-readingmeter\electron\menu_builder.js`

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
- Total calls: 1
- Unique keys: 1

- `menu-click` — 1 call(s): L57

#### Menu action IDs / routing keys (via `webContents.send("menu-click", <id>)`)
- Total calls: 19
- Unique keys: 19

- `acerca_de` — 1 call(s): L182 (via sendMenuClick)
- `actualizar_version` — 1 call(s): L174 (via sendMenuClick)
- `avisos` — 1 call(s): L157 (via sendMenuClick)
- `cargador_texto` — 1 call(s): L86 (via sendMenuClick)
- `colabora` — 1 call(s): L167 (via sendMenuClick)
- `contador_imagen` — 1 call(s): L90 (via sendMenuClick)
- `discord` — 1 call(s): L153 (via sendMenuClick)
- `diseno_colores` — 1 call(s): L134 (via sendMenuClick)
- `diseno_crono_flotante` — 1 call(s): L126 (via sendMenuClick)
- `diseno_fuentes` — 1 call(s): L130 (via sendMenuClick)
- `diseno_skins` — 1 call(s): L122 (via sendMenuClick)
- `faq` — 1 call(s): L77 (via sendMenuClick)
- `guia_basica` — 1 call(s): L69 (via sendMenuClick)
- `instrucciones_completas` — 1 call(s): L73 (via sendMenuClick)
- `links_interes` — 1 call(s): L163 (via sendMenuClick)
- `presets_por_defecto` — 1 call(s): L144 (via sendMenuClick)
- `readme` — 1 call(s): L178 (via sendMenuClick)
- `shortcuts` — 1 call(s): L140 (via sendMenuClick)
- `test_velocidad` — 1 call(s): L94 (via sendMenuClick)

#### Persistent storage filenames (via `path.join(CONFIG_DIR, "*.json")`)
- Total calls: 0
- Unique keys: 0

- (none)

#### Delegated IPC registration calls (first arg: ipcMain)
- Total calls: 0
- Unique keys: 0

- (none)

#### Exports (module.exports / exports.*) [non-string surface; local-only; NOT part of B2.2 cache sync]
- Total calls: 1
- Unique keys: 1

- `module.exports` — 1 call(s): L219

### B2.1) Raw match map (auto)
> Auto-generated navigation map. Paste only what you actually use for navigation.

- Pattern: `webContents.send(`
  - Count: 1
  - Key matches:
    - `L57`: `mainWindow.webContents.send('menu-click', payload)`

---

### B2.2) Repo contract cache sync (mandatory; surface-only)
> This section syncs Contract Lock keys with `docs/cleanup/_repo_contract_usage.md`.
> **Official counts are surface-only**: contract surface statements only.
> Exclude mentions in logs/comments/user-facing messages/docs.

**Per-key record (copy from `_repo_contract_usage.md`; keep per-key, no global notes)**

#### Renderer events — webContents.send / equivalents

- Key: `menu-click`
  - Cache (official; surface-only): 2 matches in 2 files (top: `electron/menu_builder.js`, `electron/preload.js`)
  - Verified at: `36fe2e1`

#### Menu action IDs / routing keys

- Key: `acerca_de`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]acerca_de['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]acerca_de['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `actualizar_version`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]actualizar_version['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]actualizar_version['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `avisos`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]avisos['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]avisos['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `cargador_texto`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]cargador_texto['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]cargador_texto['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `colabora`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]colabora['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]colabora['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `contador_imagen`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]contador_imagen['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]contador_imagen['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `discord`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]discord['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]discord['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `diseno_colores`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]diseno_colores['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]diseno_colores['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `diseno_crono_flotante`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]diseno_crono_flotante['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]diseno_crono_flotante['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `diseno_fuentes`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]diseno_fuentes['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]diseno_fuentes['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `diseno_skins`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]diseno_skins['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]diseno_skins['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `faq`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]faq['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]faq['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `guia_basica`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]guia_basica['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]guia_basica['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `instrucciones_completas`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]instrucciones_completas['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]instrucciones_completas['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `links_interes`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]links_interes['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]links_interes['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `presets_por_defecto`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]presets_por_defecto['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]presets_por_defecto['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `readme`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]readme['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]readme['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

- Key: `shortcuts`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]shortcuts['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]shortcuts['"]`]: 0 matches in 0 files
  - Verified at: `682c26a`

- Key: `test_velocidad`
  - Cache (definition; surface-only): [regex `\bsendMenuClick\(\s*['"]test_velocidad['"]`]: 1 match in 1 file (top: `electron/menu_builder.js`)
  - Cache (usage; access sites): [regex `\b(?:menuActions\.)?registerMenuAction\(\s*['"]test_velocidad['"]`]: 1 match in 1 file (top: `public/renderer.js`)
  - Verified at: `682c26a`

---

### B2.3) Observability / UX Mentions (local-only)
> Script: v1.2.0
> Target: `C:\Users\manue\Documents\toT-ReadingMeter\tot-readingmeter\electron\menu_builder.js`
> Realpath: `C:\Users\manue\Documents\toT-ReadingMeter\tot-readingmeter\electron\menu_builder.js`
> Format: `L<line>: <snippet>`
> Block capture: max 16 lines

#### Logs (console.*)
- L16:             console.warn('[menu_builder] main.json no found for', langCode, 'in', file);
- L24:         console.error('[menu_builder] Error loading translations from main.json:', err);
- L59:             console.error('[menu_builder] Error sending menu-click:', payload, err);
- L109:                                 console.error(
- L110:                                     '[menu_builder] Error in callback onOpenLanguage:',
- L111:                                     err
- L112:                                 );
- L204:                             console.error(
- L205:                                 '[menu_builder] Error toggling DevTools from menu:',
- L206:                                 err
- L207:                             );

#### Maintenance comments (TODO/FIXME/HACK/WIP/LEGACY/DEPRECATED)
- (none)

#### User-facing hardcoded (dialog/Notification/etc.)
- (none)

#### Fallback pivot (FALLBACK:)
- (none)

---

### B3) Candidate Ledger (auto-scan; label-sorted; theme-grouped; evidence-gated)
> Auto-generated bootstrap from `electron/menu_builder.js`. Suggested labels are heuristics; you must confirm and fill repo evidence where required.
> Theme headers are navigation only; occurrences remain the unit of decision.
> Tooling note (repo-wide): `Shift+F12` is file-local and tooling-derived (JS language service). It may return `0` or non-canonical counts for CommonJS/property access and dynamic JS. Treat `Shift+F12` counts as “semantic-ish signals”, not as proof of absence/presence. Use `Ctrl+Shift+F` for surface/textual counts.
> Placeholders like `<N>`, `<M>`, `<files>`, `<file>`, `<line>`, `<HEAD>` are placeholders (not repo evidence) until you fill them via the protocol steps.
> Snippet truncation: rerun with `--max-snippet=0` to disable. List truncation: rerun with `--max-per-label=<N>`.

#### P2-CONTRACT (1)

##### CONTRACT:SEND:menu-click (1)
- **L57#h289**
  - Primary Theme: `CONTRACT:SEND:menu-click`
  - Type: `fallback (error swallow; log-only)`
  - Tags: `near_contract, touches_contract`
  - Anchor evidence: `L57`: `mainWindow.webContents.send('menu-click', payload);`
  - Local evidence (inner): `L58-60`: `} catch (err) { console.error('[menu_builder] Error sending menu-click:', payload, err); }`
  - Why: Catch swallows error (log-only); confirm intentional and scoped. Near contract/lifecycle surface. Multi-line catch body (non-throwing).
  - Repo evidence:
    - Symbol evidence [primary: `<Symbol>`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `<HEAD>`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `<HEAD>`
    - Contract [`menu-click`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Contract: `'menu-click'`, `webContents.send(`, `.webContents.send(`
    - Symbol: `<fill>`
    - Pattern: `catch (`, `console.error`, `console.warn`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>

#### P2-FALLBACK (10)

##### PATTERN:CATCH_DEFAULT_RETURN (1)
- **L23#1xp5**
  - Primary Theme: `PATTERN:CATCH_DEFAULT_RETURN`
  - Type: `fallback (error swallow; default return)`
  - Local evidence: `L23-26`: `} catch (err) { console.error('[menu_builder] Error loading translations from main.json:', err); return null; }`
  - Why: Catch swallows error (default return); confirm intentional and scoped. Multi-line catch body (non-throwing).     
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `catch (` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `catch (`, `return null`, `return;`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>

##### PATTERN:DEFAULT_OR (9)
- **L12#2cwe**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L12`: `const langCode = (lang || 'es').toLowerCase() || 'es';`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `||` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `||`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>
- **L22#1nls**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L22`: `return JSON.parse(raw || '{}');`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `||` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `||`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>
- **L30#2cwe**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L30`: `const langCode = (lang || 'es').toLowerCase() || 'es';`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `||` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `||`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>
- **L33#s272**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L33`: `return tMain.dialog || {};`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `||` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `||`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>
- **L45#1gpp**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L45`: `const effectiveLang = (lang || 'es').toLowerCase();`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `||` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `||`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>
- **L46#erjf**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L46`: `const tr = loadMainTranslations(effectiveLang) || {};`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `||` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
    - Symbol evidence [primary: `loadMainTranslations`]:
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `<HEAD>`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
      - References (Shift+F12; file-local): `<N>` hits in `<file>`; Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `||`
    - Symbol: `loadMainTranslations`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>
- **L47#h64c**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L47`: `const tMain = tr.main || {};`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `||` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `||`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>
- **L48#fmwl**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L48`: `const m = tMain.menu || {};`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `||` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `||`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>
- **L50#1fpm**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L50`: `const mainWindow = opts.mainWindow || null;`
  - Why: Defaulting via ||/?? may be intentional, but can be an unwanted fallback depending on input domain.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `||` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `||`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>

#### DEFER (30)

##### PATTERN:I18N_LABEL_DEFAULT (30)
- Shared:
  - Primary Theme: `PATTERN:I18N_LABEL_DEFAULT`
  - Type: `fallback (i18n label default)`
  - Tags: `i18n`
  - Occurrences:
    - **L65#qmsw**
      - Local evidence: `L65`: `label: m.como_usar || 'Como usar la app?',`
    - **L68#1hbq**
      - Local evidence: `L68`: `label: m.guia_basica || 'Guide',`
    - **L72#116n**
      - Local evidence: `L72`: `label: m.instrucciones_completas || 'Instructions',`
    - **L76#1rcy**
      - Local evidence: `L76`: `label: m.faq || 'FAQ',`
    - **L82#e2wd**
      - Local evidence: `L82`: `label: m.herramientas || 'Tools',`
    - **L85#eq5t**
      - Local evidence: `L85`: `label: m.cargador_texto || 'Text loader',`
    - **L89#17jy**
      - Local evidence: `L89`: `label: m.cargador_imagen || 'Image loader',`
    - **L93#17rj**
      - Local evidence: `L93`: `label: m.test_velocidad || 'Speed test',`
    - **L99#1qi1**
      - Local evidence: `L99`: `label: m.preferencias || 'Preferences',`
    - **L102#81kx**
      - Local evidence: `L102`: `label: m.idioma || 'Language',`
    - **L118#nnom**
      - Local evidence: `L118`: `label: m.diseno || 'Design',`
    - **L121#a7x6**
      - Local evidence: `L121`: `label: m.skins || 'Skins',`
    - **L125#1cvh**
      - Local evidence: `L125`: `label: m.crono_flotante || 'FW',`
    - **L129#1l58**
      - Local evidence: `L129`: `label: m.fuentes || 'Fonts',`
    - **L133#1m1p**
      - Local evidence: `L133`: `label: m.colores || 'Colors',`
    - **L139#o8y2**
      - Local evidence: `L139`: `label: m.shortcuts || 'Shortcuts',`
    - **L143#1e28**
      - Local evidence: `L143`: `label: m.presets_por_defecto || 'Default presets',`
    - **L149#1vys**
      - Local evidence: `L149`: `label: m.comunidad || 'Community',`
    - **L152#1gmp**
      - Local evidence: `L152`: `label: m.discord || 'Discord',`
    - **L156#1alt**
      - Local evidence: `L156`: `label: m.avisos || 'News & updates',`
    - **L162#ngl3**
      - Local evidence: `L162`: `label: m.links_interes || 'Links',`
    - **L166#1o0r**
      - Local evidence: `L166`: `label: m.colabora || '($)',`
    - **L170#1jp1**
      - Local evidence: `L170`: `label: m.ayuda || '?',`
    - **L173#4qan**
      - Local evidence: `L173`: `label: m.actualizar_version || 'Update',`
    - **L177#19xz**
      - Local evidence: `L177`: `label: m.readme || 'Readme',`
    - **L181#146y**
      - Local evidence: `L181`: `label: m.acerca_de || 'About',`
    - **L192#o8td**
      - Local evidence: `L192`: `label: m.desarrollo || 'Development',`
    - **L194#1grq**
      - Local evidence: `L194`: `{ role: 'reload', label: m.recargar || 'Reload' },`
    - **L195#1nd7**
      - Local evidence: `L195`: `{ role: 'forcereload', label: m.forcereload || 'Force reload' },`
    - **L197#1fb1**
      - Local evidence: `L197`: `label: m.toggle_devtools || 'Toggle DevTools',`
  - Why: Menu label fallback can mask missing translation keys; confirm translation coverage and intended fallback language.
  - Repo evidence:
    - Pattern evidence:
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `label:` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
  - Suggested queries (optional):
    - Pattern: `label:`, `||`
  - Proposed action:
    - Phase 1: <doc only / comment-only / reorder-only / none>
    - Phase 2: <remove / consolidate / refactor / change fallback>
  - Risk notes / dependencies: <fill>

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
