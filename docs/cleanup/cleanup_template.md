# Code Cleanup Note — <RELATIVE_PATH>

> Location: `docs/cleanup/<SLUG>.md`  
> Scope: This document records all evidence and decisions needed to clean, reorder, and de-legacy a single file, in two phases:
> - **Phase 1 (Safe):** no functional changes; must preserve observable behavior.
> - **Phase 2 (Risk):** may change behavior; requires targeted tests.

---

## 0) Metadata

- Target file: `<RELATIVE_PATH>`  
- Date started: `<YYYY-MM-DD>`  
- Branch: `<BRANCH>`  
- Baseline commit (short SHA): `<SHA>`  
- Latest commit touching this cleanup: `<SHA>`  
- Phase 1 status: `<pending/done + commit)>`
- Phase 2 status: `<pending/done + commit)>`

---

## 1) Step B — Evidence Pack

### B1) Top-level inventory (AST / Outline)
> Goal: prevent losing/misplacing top-level units during reordering.

#### Top-level state (global variables)
- `<name>` — <role>
- `<name>` — <role>

#### Top-level declarations
**Functions**
- `L<line>`: `<name>()` — <role>

**Classes**
- `L<line>`: `<name>` — <role>

**Variables assigned to functions**
- `L<line>`: `<const/let> <name> = <function>` — <role>

#### Other top-level statements (units / side effects)
- `L<line>`: `[<type>] <snippet>` — <why it matters>

---

### B2) Contract Lock (must remain stable in Phase 1)
> Contract lock = externally observable “interfaces” that must not change in Phase 1:
> IPC channels, event names, storage keys, file paths, menu action IDs, etc.

#### IPC — ipcMain.handle
- `<channel>`
- `<channel>`

#### IPC — ipcMain.on
- `<channel>`
- `<channel>`

#### IPC — ipcMain.once
- `<channel>`
- `<channel>`

#### Renderer events — webContents.send / ipcRenderer.emit equivalents
- `<event>`
- `<event>`

#### Menu action IDs / routing keys (if any)
- `<id>`
- `<id>`

#### Persistent storage keys / filenames (if any)
- `<key or filename>`
- `<key or filename>`

#### Other contracts (URLs, command names, env vars, analytics tags, etc.)
- `<contract>`
- `<contract>`

---

### B2.1) Raw match map (optional but useful)
> Paste only what you actually use for navigation. Avoid dumping hundreds of lines unless needed.

- Pattern: `ipcMain.handle(`  
  - Count: `<N>`  
  - Key matches:
    - `L<line>`: `<snippet>`
- Pattern: `ipcMain.on(`  
  - Count: `<N>`  
  - Key matches:
    - `L<line>`: `<snippet>`
- Pattern: `webContents.send(`  
  - Count: `<N>`  
  - Key matches:
    - `L<line>`: `<snippet>`

---

### B3) Candidate Ledger (triaged; label-sorted; theme-grouped; evidence-gated)
> Triaged from auto-scan of `electron/main.js`. No edits allowed until repo evidence is filled (VS Code gating).
> Note: any contract-level behavioral decisions are recorded in `## 4) Open Questions / Decisions` (not in B3), to keep the ledger occurrence-first.

#### P2-CONTRACT (13)

##### PATTERN:NUM_COERCE (2)
- **L549**
  - Primary Theme: `PATTERN:NUM_COERCE`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L549`: `const n = Number(ms) || 0;`
  - Why: Invalid/NaN ms collapses to 0 → can silently reset elapsed if caller sends bad payload.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (function `setCronoElapsed`)
    - Repo search (Ctrl+Shift+F): TODO (strings: `crono-set-elapsed`, `flotante-command`)
    - Suggested queries: `setCronoElapsed`, `'crono-set-elapsed'`, `'flotante-command'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: change fallback semantics per `## 4 / Q1` (fail-safe: ignore invalid / negative; keep previous elapsed)
  - Risk notes / dependencies: Any change affects timer state when payload is invalid.

- **L611**
  - Primary Theme: `PATTERN:NUM_COERCE`
  - Type: `fallback (defaulting) + duplication (double coercion)`
  - Tags: `near_contract`
  - Local evidence: `L611`: `setCronoElapsed(Number(cmd.value) || 0);`
  - Why: Coercion/defaulting is duplicated (also done inside `setCronoElapsed`). May hide invalid payload origin.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`setCronoElapsed`)
    - Repo search (Ctrl+Shift+F): TODO (`'flotante-command'`)
    - Suggested queries: `'flotante-command'`, `Number(cmd.value)`
  - Proposed action:
    - Phase 1: none
    - Phase 2: remove double coercion and validate payload explicitly per `## 4 / Q1`
  - Risk notes / dependencies: Tightening validation changes behavior for malformed `cmd.value`.

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
  - Why: same as above (floating window).
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`'crono-state'`)
    - Suggested queries: `'crono-state'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: same as above
  - Risk notes / dependencies: same as above.

- **L508**
  - Primary Theme: `CONTRACT:SEND:crono-state`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Local evidence: `L508`: `try { if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }`
  - Why: same as above (editor window).
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`'crono-state'`)
    - Suggested queries: `'crono-state'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: same as above
  - Risk notes / dependencies: same as above.

##### CONTRACT:SEND:flotante-closed (1)
- **L472**
  - Primary Theme: `CONTRACT:SEND:flotante-closed`
  - Type: `fallback (error swallow)`
  - Tags: `touches_contract`
  - Local evidence: `L472`: `try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }`
  - Why: Silences failures during close-notify; may mask renderer lifecycle issues.
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`'flotante-closed'`)
    - Suggested queries: `'flotante-closed'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: consolidate under `safeSend` policy (if created)
  - Risk notes / dependencies: Preserve event name + no new noisy logs.

##### CONTRACT:SEND:manual-init-text (2)
- **L198**
  - Primary Theme: `CONTRACT:SEND:manual-init-text`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L198`: `text: initialText || "",`
  - Why: Defaults to empty string if initialText falsy (includes empty string).
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`'manual-init-text'`)
    - Suggested queries: `'manual-init-text'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: decide if `""` should be preserved distinctly vs “unset”
  - Risk notes / dependencies: Editor expects stable payload shape.

- **L627**
  - Primary Theme: `CONTRACT:SEND:manual-init-text`
  - Type: `fallback (defaulting)`
  - Tags: `near_contract`
  - Local evidence: `L627`: `text: initialText || "",`
  - Why: same as above (second send site).
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`'manual-init-text'`)
    - Suggested queries: `'manual-init-text'`
  - Proposed action:
    - Phase 1: none
    - Phase 2: same as above
  - Risk notes / dependencies: same as above.

##### CONTRACT:SEND:preset-init (2)
- **L235**
  - Primary Theme: `CONTRACT:SEND:preset-init`
  - Type: `fallback (defaulting)`
  - Tags: `touches_contract`
  - Local evidence: `L235`: `presetWin.webContents.send('preset-init', initialData || {});`
  - Why: Defaults to `{}` if payload missing/falsy.
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
  - Why: same as above (second send site).
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
  - Why: `||` drops valid `0` coordinates; noop catch hides geometry failures; affects user-visible placement.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`createFloatingWindow`)
    - Repo search (Ctrl+Shift+F): TODO (`setBounds`, `createFloatingWindow(`)
    - Suggested queries: `createFloatingWindow`, `setBounds({ x: options.x`
  - Proposed action:
    - Phase 1: none
    - Phase 2: implement workArea-safe placement policy per `## 4 / Q2` + replace `||` with explicit numeric check (preserve 0)
  - Risk notes / dependencies: Placement logic must be tested under DPI/scaling and multi-monitor.

- **L463-465**
  - Primary Theme: `MISC:FLOATING_WINDOW_BOUNDS`
  - Type: `fallback (error swallow)`
  - Tags: `near_contract`
  - Local evidence: `L463-465`: `} catch (e) { // noop }`
  - Why: Swallows exceptions in “keep inside screen” clamp; failures become silent offscreen windows.
  - Repo evidence: TODO (VS Code)
    - References (Shift+F12): TODO (`createFloatingWindow`)
    - Repo search (Ctrl+Shift+F): TODO (`getDisplayMatching`, `workArea`)
    - Suggested queries: `getDisplayMatching`, `workArea`, `offscreen`
  - Proposed action:
    - Phase 1: none
    - Phase 2: align with `## 4 / Q2` and replace noop with guarded debug log OR narrow the try scope
  - Risk notes / dependencies: Geometry code is timing-sensitive (display metrics, bounds after load).


#### P2-FALLBACK (2)

##### PATTERN:DEFAULT_OR (1)
- **L51**
  - Primary Theme: `PATTERN:DEFAULT_OR`
  - Type: `fallback (defaulting)`
  - Local evidence: `L51`: `const effectiveLang = lang || currentLanguage || "es";`
  - Why: Ensures a usable language code for menu building.
  - Repo evidence: TODO (VS Code)
    - Repo search (Ctrl+Shift+F): TODO (`buildAppMenu(`)
    - Suggested queries: `buildAppMenu`, `effectiveLang`
  - Proposed action:
    - Phase 1: none
    - Phase 2: optional: prefer nullish coalescing if empty-string should remain meaningful
  - Risk notes / dependencies: Affects language selection only.

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

- Q1 (L549, L611): Crono elapsed input validation (fail-safe vs reset-on-invalid)
  - Decision (decided): Policy B (fail-safe). If `ms` is invalid (NaN / non-numeric / undefined) OR `ms < 0`, IGNORE the update and keep previous `crono.elapsed` (no reset-to-0).
  - Rationale: Avoid silent state destruction from malformed IPC payloads; aligns with “ignore and keep prior value” preference.

- Q2 (L382, L463-465): Floating window placement policy (workArea safety + multi-monitor border rule)
  - Decision (decided): Floating window must remain 100% inside the target display `workArea` (never partially offscreen). Reposition/clamp if it would exceed margins.
  - Border criterion (decided): choose simplest to implement; if tie, select display by window center point.
  - Rationale: Preserve user freedom of placement while preventing “lost window” scenarios; keep implementation tractable.

---

## 5) Appendix — Repro commands / tooling notes (optional)

- Task(s) used: `<VS Code task label(s)>`
- Local tooling used (must stay in /tools_local): `<tooling>`
- Notes about limitations or false positives: `<...>`
