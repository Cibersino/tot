# Code Cleanup Note — <RELATIVE_PATH>

> Location: `docs/cleanup/<SLUG>.md`  
> Scope: This document records all evidence and decisions needed to clean, reorder, and de-legacy a single file, in two phases:
> - **Phase 1 (Safe):** no functional changes; must preserve observable behavior.
> - **Phase 2 (Risk):** may change behavior; requires explicit tests.

---

## 0) Metadata

- Target file: `<RELATIVE_PATH>`
- Slug: `<SLUG>` (rule: replace `/` and `.` with `_`)
- Date started: `<YYYY-MM-DD>`
- Branch: `<BRANCH>`
- Baseline commit (short SHA): `<SHA>`
- Latest commit touching this cleanup: `<SHA>`
- Phase 1 status: `<pending/done + commit SHA>`
- Phase 2 status: `<pending/done + commit SHA>`

---

## 1) Step B — Evidence Pack

### B1) Top-level inventory (AST / Outline)
> Goal: prevent losing/misplacing top-level units during reordering.

#### Top-level state (global variables)
- `L<line>`: `<name>` — <role>

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
> IPC channels, event names, storage filenames, menu action IDs, etc.

#### IPC — ipcMain.handle
- `<channel>`

#### IPC — ipcMain.on
- `<channel>`

#### IPC — ipcMain.once
- `<channel>`

#### IPC (renderer-side, if this file defines it)
- `ipcRenderer.invoke`: `<channel>`
- `ipcRenderer.send/on`: `<channel>`

#### Renderer events — webContents.send
- `<event>`

#### Menu action IDs / routing keys (if any)
- `<id>`

#### Persistent storage filenames / keys (if any)
- `<filename or key>`

#### Other contracts (URLs, command names, env vars, analytics tags, etc.)
- `<contract>`

---

### B2.1) Raw match map (optional, navigation-only)
> Paste only what you actually use for navigation. Avoid dumping hundreds of lines unless needed.

- Pattern: `ipcMain.handle(`  
  - Count (local file): `<N>`  
  - Key matches:
    - `L<line>`: `<snippet>`

- Pattern: `ipcMain.on(`  
  - Count (local file): `<N>`  
  - Key matches:
    - `L<line>`: `<snippet>`

- Pattern: `ipcMain.once(`  
  - Count (local file): `<N>`  
  - Key matches:
    - `L<line>`: `<snippet>`

- Pattern: `webContents.send(`  
  - Count (local file): `<N>`  
  - Key matches:
    - `L<line>`: `<snippet>`

---

### B2.2) Repo contract cache sync (mandatory; surface-only)
> This section syncs Contract Lock keys with `docs/cleanup/_repo_contract_usage.md`.
> **Official counts are surface-only**: contract surface statements only (exclude mentions in logs/comments/user-facing messages/docs).

**VS Code (Ctrl+Shift+F) settings**
- Regex: ON
- Include: `electron/**`, `public/**`
- Exclude: `docs/cleanup/**`

**Surface-only regex (replace `<KEY>` with the literal key)**
- `(ipcMain\\.(handle|on|once)|ipcRenderer\\.(invoke|send|on)|webContents\\.send)\\(\\s*['"]<KEY>['"]`

**Per-key record (copy from `_repo_contract_usage.md`; keep per-key, no global notes)**

| Key | Kind (IPC_HANDLE/IPC_ON/IPC_ONCE/SEND/STORAGE/OTHER) | Official (surface-only) | Files (top) | Verified-at (SHA) | Notes (optional, per-key only) |
|---|---|---:|---|---|---|
| `<key>` | `<kind>` | `<N> matches` | `<file1>, <file2>...` | `<SHA>` | `<only if needed>` |

**Pass condition**
- Every B2 key appears in `_repo_contract_usage.md` with a surface-only count and Verified-at = current HEAD (or explicit per-key invariance note recorded in the cache).

---

### B2.3) Observability / UX Mentions (local; mandatory)
> Track cleanup-relevant **non-contract** occurrences:
> - logs (`console.*`)
> - maintenance comments (`TODO/FIXME/HACK/WIP/LEGACY/DEPRECATED`)
> - user-facing hardcoded messages (dialogs/notifications/UI hardcodes not coming from i18n)
>
> Rules:
> - **No repo-wide counts here.**
> - Keep it local to this file.
> - Format is occurrence-first: `L<line>: <snippet>`.
> - Translate ES→EN during normalization work.
> - If a user-facing hardcoded message is a fallback, prefix with `FALLBACK:` (and keep i18n strings unprefixed).

#### Logs (console.*)
- `L<line>`: `<snippet>`
- `L<line>`: `<snippet>`

#### Maintenance comments (TODO/FIXME/HACK/WIP/LEGACY/DEPRECATED)
- `L<line>`: `<snippet>`
- `L<line>`: `<snippet>`

#### User-facing hardcoded messages (dialogs/notifications/UI hardcodes)
- `L<line>`: `<snippet>`
- `L<line>`: `<snippet>`

#### Fallback hardcoded marker audit (optional but useful)
- Pivot search: `FALLBACK:`
  - `L<line>`: `<snippet>`

---

### B3) Candidate Ledger (triaged; label-sorted; theme-grouped; evidence-gated)
> Triaged from auto-scan of `<RELATIVE_PATH>`.
> **No edits allowed until repo evidence is filled (VS Code gating).**
>
> Anchor semantics (mandatory):
> - `CONTRACT:*` entries: the `L<line>` anchor points to the **contract surface statement**
>   (`ipcMain.*('key'...)`, `ipcRenderer.*('key'...)`, `webContents.send('key'...)`).
> - If the flagged pattern is on a different inner line (e.g. inside a payload object), record it as:
>   `Local evidence (inner): L<line>: <snippet>`.
> - `PATTERN:*` entries: anchor = the pattern line.
>
> Decision hygiene:
> - Behavioral decisions belong in **## 4) Open Questions / Decisions**, not inside the ledger entries.

#### Scanner fidelity decision (must be settled BEFORE running triage/gating)
- Scanner output truncation acceptable? `<yes/no>`
- If **no**: required script fixes (before B3): `<list>`
- Evidence of compliance (example): `no "..." in snippets`, `no truncated filenames`, etc.

---

#### P1-DOC (<N>)
> Doc-only candidates: comments, naming, section headers, clarifying notes (no behavior change).

##### <THEME> (<count>)
- **L<line>#<id>**
  - Primary Theme: `<THEME>`
  - Type: `<doc-only>`
  - Tags: `<...>`
  - Local evidence: `L<line>`: `<snippet>`
  - Why: <...>
  - Repo evidence: <fill as needed>
  - Proposed action:
    - Phase 1: `doc only`
    - Phase 2: `none`
  - Risk notes / dependencies: <fill>

---

#### P1-STRUCT (<N>)
> Structure-only candidates: reordering, grouping, dedupe with no behavior change.

---

#### P2-CONTRACT (<N>)
> Contract-adjacent candidates: must be evidence-gated and carefully staged.

##### CONTRACT:<...> (<count>)
- **L<contractLine>#<id>**
  - Primary Theme: `CONTRACT:<...>`
  - Type: `<fallback / duplication / error swallow / ...>`
  - Tags: `<near_contract / touches_contract / ...>`
  - Anchor evidence: `L<contractLine>`: `<contract surface snippet>`
  - Local evidence (inner): `L<patternLine>`: `<inner snippet>` (only if different)
  - Why: <...>
  - Repo evidence: <fill>
    - References (Shift+F12): `<N> hits in <files>` (only for symbols: functions/vars)
    - Repo search (Ctrl+Shift+F) — contractual (surface-only):
      - From B2.2: `<N> matches`, `<top files>`, `Verified-at <SHA>`
    - Repo search (Ctrl+Shift+F) — non-contractual (patterns/snippets):
      - `<pattern>`: `<N> matches in <files>`
    - Suggested queries (optional): `<q1>`, `<q2>`, `<q3>`
  - Proposed action:
    - Phase 1: `<doc only / comment-only / reorder-only / none>`
    - Phase 2: `<remove / consolidate / refactor / change fallback>`
  - Risk notes / dependencies: <fill>

---

#### P2-SIDEFX (<N>)
> Timing/initialization/order side effects: often risky even if “small”.

---

#### P2-FALLBACK (<N>)
> Non-contract patterns (defaulting, noop catches, coercion) that may still affect behavior.

##### PATTERN:<...> (<count>)
- **L<line>#<id>**
  - Primary Theme: `PATTERN:<...>`
  - Type: `<fallback (defaulting) / fallback (error swallow) / ...>`
  - Tags: `<...>`
  - Local evidence: `L<line>`: `<snippet>`
  - Why: <...>
  - Repo evidence: <fill>
    - References (Shift+F12): `<N> hits in <files>` (symbols only)
    - Repo search (Ctrl+Shift+F): `<N> matches in <files>`
    - Suggested queries (optional): `<q1>`, `<q2>`
  - Proposed action:
    - Phase 1: `<doc only / comment-only / reorder-only / none>`
    - Phase 2: `<remove / consolidate / refactor / change fallback>`
  - Risk notes / dependencies: <fill>

---

#### DEFER (<N>)
> Real issues, but explicitly postponed.

#### DROP (<N>)
> False positives or out-of-scope items (keep record of why dropped).

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
