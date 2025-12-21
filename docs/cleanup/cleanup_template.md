# Code Cleanup Note — <RELATIVE_PATH>

> Location: `docs/cleanup/<SLUG>.md`  
> Scope: This document records all evidence and decisions needed to clean, reorder, and de-legacy a single file, in two phases:
> - **Phase 1 (Safe):** no functional changes; must preserve observable behavior.
> - **Phase 2 (Risk):** may change behavior; requires targeted tests.

---

## 0) Metadata

- Target file: `<RELATIVE_PATH>` (canonical repo path; prefer `/`)
- Slug: `<SLUG>` (rule: replace `/` and `.` with `_`)

- Evidence snapshots (short SHAs; append-only):
  - `<SHA>`: `<YYYY/MM/DD>`. `<note>`
  - `<SHA>`: `<YYYY/MM/DD>`. `<note>`

- Change log: `<one-line summary of drift/no drift and what changed in the cleanup note itself>`

- Phase 1 status: `<pending|done>`
- Phase 2 status: `<pending|done>`

---

## 1) Step B — Evidence Pack

### B1) Top-level inventory (AST)
> Generated from AST. Source: `<RELATIVE_PATH>`

#### Top-level state (global variables)
- `L<line>`: let `<name>`
- `L<line>`: let `<name>`

#### Top-level declarations
**Functions**
- `L<line>`: `<name>()`
- `L<line>`: `<name>()`

**Classes**
- (none)
  - or:
- `L<line>`: `<name>`

**Variables assigned to functions**
- (none)
  - or:
- `L<line>`: `<const/let> <name> = <function>`

#### Top-level constants (non-function)
- `L<line>`: const `<name>`
- `L<line>`: const `<name>`

#### Other top-level statements (units / side effects)
- `L<line>`: `[<NodeType>] <summary>`
  - raw: `<raw statement (may be truncated)>`
- `L<line>`: `[<NodeType>] <summary>`
  - raw: `<raw statement (may be truncated)>`

---

### B2) Contract Lock
> Contract lock = externally observable “interfaces” that must not change in Phase 1:
> IPC channels, event names, storage keys, file paths, menu action IDs, etc.
> Generated from AST. Source: `<RELATIVE_PATH>`

#### IPC — ipcMain.handle
- Total calls: `<N>`
- Unique keys: `<N>`

- `<key>` — `<n>` call(s): `L<line>[, L<line>...]`
- `<key>` — `<n>` call(s): `L<line>[, L<line>...]`

#### IPC — ipcMain.on
- Total calls: `<N>`
- Unique keys: `<N>`

- `<key>` — `<n>` call(s): `L<line>[, L<line>...]`

#### IPC — ipcMain.once
- Total calls: `<N>`
- Unique keys: `<N>`

- `<key>` — `<n>` call(s): `L<line>[, L<line>...]`

#### IPC — ipcRenderer.invoke
- Total calls: `<N>`
- Unique keys: `<N>`

- (none)
  - or:
- `<key>` — `<n>` call(s): `L<line>[, L<line>...]`

#### IPC — ipcRenderer.on
- Total calls: `<N>`
- Unique keys: `<N>`

- (none)
  - or:
- `<key>` — `<n>` call(s): `L<line>[, L<line>...]`

#### Renderer events — webContents.send
- Total calls: `<N>`
- Unique keys: `<N>`

- `<event>` — `<n>` call(s): `L<line>[, L<line>...]`

#### Menu action IDs / routing keys (via `webContents.send("menu-click", <id>)`)
- Total calls: `<N>`
- Unique keys: `<N>`

- `<id>` — `<n>` call(s): `L<line>[, L<line>...]`

#### Persistent storage filenames (via `path.join(CONFIG_DIR, "*.json")`)
- Total calls: `<N>`
- Unique keys: `<N>`

- `<filename>` — `<n>` call(s): `L<line>[, L<line>...]` (bound: `<CONST_OR_VAR>` optional)
- (none)

#### Delegated IPC registration calls (first arg: ipcMain)
- Total calls: `<N>`
- Unique keys: `<N>`

- `<callee>` — `<n>` call(s): `L<line>` (keys: `<k1, k2, ...>`)

#### Exports (module.exports / exports.*)
- Total calls: `<N>`
- Unique keys: `<N>`

- `<export key>` — `<n>` call(s): `L<line>[, L<line>...]`
- (none)

---

### B2.1) Raw match map (auto)
> Auto-generated navigation map. Paste only what you actually use for navigation.

- Pattern: `ipcMain.handle(`
  - Count: `<N>`
  - Key matches:
    - `L<line>`: `<snippet>`
    - `L<line>`: `<snippet>`

- Pattern: `ipcMain.on(`
  - Count: `<N>`
  - Key matches:
    - `L<line>`: `<snippet>`

- Pattern: `ipcMain.once(`
  - Count: `<N>`
  - Key matches:
    - `L<line>`: `<snippet>`

- Pattern: `webContents.send(`
  - Count: `<N>`
  - Key matches:
    - `L<line>`: `<snippet>`

- Pattern: `path.join(CONFIG_DIR,`
  - Count: `<N>`
  - Key matches:
    - `L<line>`: `<snippet>`

- Pattern: `*.registerIpc(ipcMain,`
  - Count: `<N>`
  - Key matches:
    - `L<line>`: `<snippet>`

- Pattern: `*.register(ipcMain,`
  - Count: `<N>`
  - Key matches:
    - `L<line>`: `<snippet>`

---

### B2.2) Repo contract cache sync (mandatory; surface-only)
> This section syncs Contract Lock keys with `docs/cleanup/_repo_contract_usage.md`.
> **Official counts are surface-only**: contract surface statements only (exclude mentions in logs/comments/user-facing messages/docs).

**Per-key record (copy from `_repo_contract_usage.md`; keep per-key, no global notes)**

#### IPC — ipcMain.handle
- Key: `<key>`
  - Cache (official; surface-only): `<N> matches in <M> files (top: <file1>, <file2>...)`
  - Verified at: `<SHA>`

#### IPC — ipcMain.on
- Key: `<key>`
  - Cache (official; surface-only): `<N> matches in <M> files (top: <file1>, <file2>...)`
  - Verified at: `<SHA>`

#### IPC — ipcMain.once
- Key: `<key>`
  - Cache (official; surface-only): `<N> matches in <M> files (top: <file1>, <file2>...)`
  - Verified at: `<SHA>`

#### Renderer events — webContents.send / equivalents
- Key: `<key>`
  - Cache (official; surface-only): `<N> matches in <M> files (top: <file1>, <file2>...)`
  - Verified at: `<SHA>`

#### Menu action IDs / routing keys
- Key: `<id>`
  - Cache (official; surface-only): `<N> matches in <M> files (top: <file1>, <file2>...)`
  - Verified at: `<SHA>`

#### Persistent storage filenames / keys
- Key: `<filename or key>`
  - Cache (official; surface-only): `<N> matches in <M> files (top: <file1>, <file2>...)`
  - Verified at: `<SHA>`

---

### B2.3) Observability / UX Mentions (local-only)
> Script: `<name/version>`
> Target: `<RELATIVE_PATH>`
> Realpath: `<absolute path (optional)>`
> Format: `L<line>: <snippet>`
> Block capture: max `<N>` lines

#### Logs (console.*)
- L<line>: <snippet>
- L<line>: <snippet>
- (none)

#### Maintenance comments (TODO/FIXME/HACK/WIP/LEGACY/DEPRECATED)
- L<line>: <snippet>
- (none)

#### User-facing hardcoded (dialog/Notification/etc.)
- L<line>: <snippet>
- (none)

#### Fallback pivot (FALLBACK:)
- L<line>: <snippet>
- (none)

---

### B3) Candidate Ledger (auto-scan; label-sorted; theme-grouped; evidence-gated)
> Auto-generated bootstrap from `<RELATIVE_PATH>`. Suggested labels are heuristics; you must confirm and fill repo evidence where required.
> Theme headers are navigation only; occurrences remain the unit of decision.
> Tooling note (repo-wide): `Shift+F12` is file-local and tooling-derived (JS language service). It may return `0` or non-canonical counts for CommonJS/property access and dynamic JS. Treat `Shift+F12` counts as “semantic-ish signals”, not as proof of absence/presence. Use `Ctrl+Shift+F` for surface/textual counts.
> Pattern counting convention: “noop catches” counted via regex `\/\*\s*noop\s*\*\/` (covers `/* noop */` and `/*noop*/`; multi-line safe). Assumption: all noop markers occur inside catches.
> Representation options (per Primary Theme; any label)
>
> For a given `Primary Theme` (under any label), you may present its occurrences in ONE of two shapes:
>
> **Option A — Individualized (occurrence blocks)**
> - Use when occurrences differ in any material way (inner evidence, guards, payload shapes, risk profile, proposed action, etc.).
> - Each occurrence is its own block (repeat the standard per-occurrence fields).
>
> **Option B — Clustered (Shared)**
> - Use only when all occurrences are materially identical (same Label + Primary Theme + Type + proposed actions + risk profile).
> - Write shared fields once at the cluster level and list occurrences under `Occurrences:`.
> - Each listed occurrence MUST still include `L<line>#<id>` plus an anchor snippet (and `Local evidence (inner)` / `Delta:` per occurrence if needed).
>
> Rules:
> - You MAY mix Option A and Option B across different themes.
> - Within the same theme, choose ONE shape (A or B). If needed, split into multiple clusters/themes.
> - Never cluster different contract keys/events/channels in the same Shared block.
> - “Shared” never replaces occurrences: it only compresses repetition while preserving per-occurrence anchoring.

#### P1-DOC (<N>)

##### <THEME> (<count>)
- **L<line>#<id>**
  - Primary Theme: `<THEME>`
  - Type: `<doc-only>`
  - Tags: `<...>`
  - Local evidence: `L<line>`: `<snippet>`
  - Why: `<...>`
  - Repo evidence: `<optional>`
  - Proposed action:
    - Phase 1: `<doc only>`
    - Phase 2: `<none>`
  - Risk notes / dependencies: `<...>`

#### P1-STRUCT (<N>)

##### <THEME> (<count>)
- **L<line>#<id>**
  - Primary Theme: `<THEME>`
  - Type: `<struct>`
  - Tags: `<...>`
  - Local evidence: `L<line>`: `<snippet>`
  - Why: `<...>`
  - Repo evidence:
    - Symbol evidence [primary: `<symbol>`]:
      - Definition trace (F12): defined at `<file>`:L`<line>`; Verified at: `<SHA>`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<SHA>`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `<N>` hits in `<file>`; Verified at: `<SHA>`
  - Proposed action:
    - Phase 1: `<reorder-only>`
    - Phase 2: `<none>`
  - Risk notes / dependencies: `<...>`

#### P2-CONTRACT (<N>)

##### CONTRACT:<KIND>:<KEY> (<count>)
- **L<line>#<id>**
  - Primary Theme: `CONTRACT:<KIND>:<KEY>`
  - Type: `<fallback/defaulting/error swallow/other>`
  - Tags: `<touches_contract/near_contract/...>`
  - Anchor evidence: `L<line>`: `<contract surface snippet>`
  - Local evidence (inner): `L<line>`: `<snippet>` (optional; only if different from anchor)
  - Why: `<...>`
  - Repo evidence:
    - Symbol evidence [primary: `<symbol>`]:
      - Definition trace (F12): defined at `<file>`:L`<line>`; Verified at: `<SHA>`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<SHA>`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `<N>` hits in `<file>`; Verified at: `<SHA>`
    - Contract [`<KEY>`]:
      - Repo search (Ctrl+Shift+F) [surface only; fill from B2.2]: `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<SHA>`
    - Pattern evidence (optional):
      - Repo matches (Ctrl+Shift+F): `<pattern>` → `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<SHA>`
  - Suggested queries (optional):
    - Contract: `'<KEY>'`, `<surface pattern>`
    - Symbol: `<symbol>`
    - Pattern: `<pattern>`
  - Proposed action:
    - Phase 1: `<doc only>`
    - Phase 2: `<change fallback / refactor / remove>`
  - Risk notes / dependencies: `<...>`

##### CONTRACT:<KIND>:<KEY> (<count>)
- Shared:
  - Primary Theme: `CONTRACT:<KIND>:<KEY>`
  - Type: `<...>`
  - Tags: `<...>`
  - Occurrences:
    - **L<line>#<id>**
      - Anchor evidence: `L<line>`: `<snippet>`
    - **L<line>#<id>**
      - Anchor evidence: `L<line>`: `<snippet>`
  - Why: `<...>`
  - Repo evidence: `<...>`
  - Proposed action:
    - Phase 1: `<doc only>`
    - Phase 2: `<...>`
  - Risk notes / dependencies: `<...>`

#### P2-SIDEFX (<N>)

##### SIDEFX:<THEME> (<count>)
- **L<line>#<id>**
  - Primary Theme: `SIDEFX:<THEME>`
  - Type: `<sidefx>`
  - Tags: `<touches_sidefx/...>`
  - Local evidence: `L<line>`: `<snippet>`
  - Why: `<...>`
  - Repo evidence:
    - Symbol evidence [primary: `<symbol>`]:
      - Definition trace (F12): defined at `<file>`:L`<line>`; Verified at: `<SHA>`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<SHA>`
  - Proposed action:
    - Phase 1: `<doc only>`
    - Phase 2: `<refactor / reorder / change timing>`
  - Risk notes / dependencies: `<...>`

#### P2-FALLBACK (<N>)

##### PATTERN:<NAME> (<count>)
- **L<line>#<id>**
  - Primary Theme: `PATTERN:<NAME>`
  - Type: `fallback (<defaulting/error swallow/...>)`
  - Tags: `<near_contract/touches_contract/...>`
  - Local evidence: `L<line>`: `<snippet>`
  - Why: `<...>`
  - Repo evidence:
    - Pattern evidence:
      - Pattern: `<pattern>`
      - Local matches in `<RELATIVE_PATH>`: `<N>`; Verified at: `<SHA>`
      - Repo matches (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<SHA>`
    - Symbol evidence [primary: `<symbol>`] (optional; only if relevant):
      - Definition trace (F12): defined at `<file>`:L`<line>`; Verified at: `<SHA>`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<SHA>`
  - Suggested queries (optional):
    - Pattern: `<pattern>`
    - Symbol: `<symbol>`
  - Proposed action:
    - Phase 1: `<doc only>`
    - Phase 2: `<change fallback / refactor / remove>`
  - Risk notes / dependencies: `<...>`

#### DEFER (<N>)

##### <THEME> (<count>)
- **L<line>#<id>**
  - Primary Theme: `<THEME>`
  - Type: `<...>`
  - Tags: `<...>`
  - Local evidence: `L<line>`: `<snippet>`
  - Why: `<...>`
  - Repo evidence: `<...>`
  - Proposed action:
    - Phase 1: `<none>`
    - Phase 2: `<none>`
  - Risk notes / dependencies: `<...>`

#### DROP (<N>)

##### <THEME> (<count>)
- **L<line>#<id>**
  - Primary Theme: `<THEME>`
  - Type: `<false positive / out-of-scope>`
  - Tags: `<...>`
  - Local evidence: `L<line>`: `<snippet>`
  - Why: `<...>`
  - Repo evidence (optional): `<...>`
  - Proposed action:
    - Phase 1: `<none>`
    - Phase 2: `<none>`
  - Risk notes / dependencies: `<...>`

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
