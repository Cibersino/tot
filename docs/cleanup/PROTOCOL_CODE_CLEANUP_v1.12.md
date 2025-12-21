# Code Cleanup Protocol (toT – Reading Meter)

Version: 1.12
Status: Draft (operational)  
Applies to: JavaScript/Electron codebase (`electron/`, `public/`, `public/js/`)  

## 1) Purpose

Provide a repeatable, low-risk workflow to clean and restructure **one file at a time** while controlling:
- accidental functional changes,
- omissions during reordering,
- silent contract breaks (IPC channels, event names, exported APIs),
- regressions introduced by “safe-looking” refactors.

This protocol defines:
- **Phase 1 (Safe):** No intentional functional changes.
- **Phase 2 (Risk):** Functional/behavioral changes allowed, but only with explicit tests.

## 2) Roles and responsibilities

### Operator (human, VS Code)
Source of truth. Executes:
- navigation (Outline, Go to Definition, Find All References),
- global search / static verification,
- applying patches / staging hunks,
- running the app and test checklists,
- committing and tagging the work.

### Reviewer / Refactor designer (AI)
Provides:
- per-file cleanup plan (Phase 1 + Phase 2),
- patch proposals in small, reviewable blocks,
- risk analysis (contracts, fallbacks, timing hazards),
- focused test checklists.

**Hard rule:** nothing is removed or restructured without evidence from VS Code searches/references.

## 3) Definitions

### Contract
Any string or symbol that is relied on across files/modules, including:
- IPC channels (`ipcMain.handle/on/once`, `ipcRenderer.invoke/send/on/once`),
- `webContents.send` event names and payload shapes,
- menu action IDs / routing keys,
- `module.exports` / `require(...)` interfaces,
- storage filenames (e.g. `config/*.json`) and stable persistence file paths,
- delegated registration surfaces that bind IPC/contracts indirectly (e.g. `*.registerIpc(ipcMain, ...)` / `*.register(ipcMain, ...)`).

### Evidence
A VS Code–generated fact that supports a change. Accepted evidence:
- Go to Definition (F12): definition location recorded as `<file>:L<line>`.
- Find All References (Shift+F12):
  - Record exactly what VS Code provides.
  - If results are file-local (common in JS/CommonJS setups), record explicitly as `file-local` and do NOT treat it as repo-wide proof.
- Repo-wide text search (Ctrl+Shift+F):
  - Required for repo-wide symbol/string claims.
  - Required for contract surface counts (surface-only, per B2.2).
- Definition tracing / call hierarchy (when available).
- (Optional) runtime logs confirming reachability/usage.

### Contract surface (surface statement)
A “contract surface statement” is the concrete statement that binds a key across modules, e.g.:
- `ipcMain.handle/on/once('<key>', ...)`
- `ipcRenderer.invoke/send/on/once('<key>', ...)`
- `webContents.send('<key>', ...)`
- Menu routing surfaces (e.g. `webContents.send("menu-click", "<id>")`)
Storage: a literal filename/path used as a stable persistence interface (e.g. `'user_settings.json'` via `path.join(CONFIG_DIR, ...)`).

### Official repo count (surface-only)
The official repo-wide count recorded in `_repo_contract_usage.md` and replicated into per-file B2.2 is a **surface-only** count.
It excludes mentions in:
- comments,
- logs (`console.*`),
- user-facing messages (dialogs/notifications/toasts),
- documentation strings.

Operationally, the official count is obtained via VS Code search restricted to contract surfaces (see B2.2).

### Mentions (observability/UX)
“Mentions” are any occurrences of keys or user-visible strings that are not contract surfaces
(comments/logs/messages). Mentions are tracked in B2.3 (local file), not in B2.2.

### Safe move
A reordering operation that does not change semantics, under verified conditions (see §7).

## 4) Pre-flight (once per cleanup series)

- Ensure `docs/cleanup/` exists (canonical location for per-file cleanup notes).
- Ensure `docs/cleanup/_repo_contract_usage.md` exists and is tracked. This is the series-wide cache of repo-wide Ctrl+Shift+F evidence for **B2 Contract Lock keys** and must be kept up to date as files are audited.
- Ensure you have access to the standard cleanup note template (see `cleanup_template.md`).
- Agree on the slug rule for filenames: replace `/` and `.` with `_` (example: `electron/main.js` → `electron_main_js`).
- Tooling rule: `/tools_local/**` is strictly local and must never be pushed to GitHub.

1. Ensure working tree is clean:
   - `git status` must show no pending changes.
2. Baseline smoke test: start app and perform the standard actions in §11.
3. Create a working branch:
   - `chore/cleanup-<file>-p1` for Phase 1 work
   - `chore/cleanup-<file>-p2` for Phase 2 work

## 5) Per-file workflow (mandatory)

### Step A — Select target file
1. Pick exactly one file (example: `electron/main.js`).
2. Create its cleanup note at `docs/cleanup/<slug>.md` using the standard template.
3. Fill the Metadata block (file path, branch, baseline short SHA, purpose).

### Step B — Create the Evidence Pack (in the per-file note)
In VS Code, populate Section **1) Step B — Evidence Pack** inside `docs/cleanup/<slug>.md`.

1) **B1 — Top-level inventory (inventory gating)**
- Capture a reliable list of top-level units (functions, classes, top-level state, constants, and other top-level statements/side effects).
- Preferred (if available): generate B1 via a local AST extractor script (e.g., `tools_local/ast_tools/b1_inventory.cjs`) run from VS Code/terminal, then paste the generated block into the per-file note.
- Fallback: use VS Code **Outline** (Ctrl+Shift+O) and targeted searches to build the list manually.

2) **B2 — Contract Lock (must remain stable in Phase 1)**
- Capture and list all externally observable “contracts”, using the template’s section structure.
- Minimum capture categories (add sections if a category exists in the file):
  - `IPC — ipcMain.handle`
  - `IPC — ipcMain.on`
  - `IPC — ipcMain.once`
  - `IPC — ipcRenderer.invoke`
  - `IPC — ipcRenderer.on`
    - If `ipcRenderer.send` / `ipcRenderer.once` appear in the file, add `IPC — ipcRenderer.send` / `IPC — ipcRenderer.once` sections using the same layout.
  - `Renderer events — webContents.send`
  - `Menu action IDs / routing keys (via webContents.send("menu-click", <id>))`
  - `Persistent storage filenames (via path.join(CONFIG_DIR, "*.json"))`
  - `Delegated IPC registration calls (first arg: ipcMain)` (e.g. `*.registerIpc(ipcMain, ...)`, `*.register(ipcMain, ...)`)
  - `Exports (module.exports / exports.*)` (if applicable)
- Preferred (if available): generate B2 via a local AST extractor script (e.g., `tools_local/ast_tools/b2_contract_lock.cjs`) run from VS Code/terminal, then paste the generated block into the per-file note.
- Fallback: use VS Code searches and manual extraction to build the list.

2a) **B2.1 — Raw match map (auto; navigation-only)**
- Purpose: navigation-only map to quickly jump to contract surfaces and key blocks in the target file.
- Source: prefer an automated scanner output (AST/text) when available; paste only what you actually use for navigation.
- Typical patterns:
  - `ipcMain.handle(`, `ipcMain.on(`, `ipcMain.once(`
  - `ipcRenderer.invoke(`, `ipcRenderer.on(` (and `send/once` if present)
  - `webContents.send(`
  - `path.join(CONFIG_DIR,`
  - `*.registerIpc(ipcMain,`, `*.register(ipcMain,`
  - `module.exports`, `exports.`
- Rule: do not include repo-wide counts here. This section is local-only and for navigation.

2b) **B2.2 — Repo contract cache sync (mandatory; surface-only; strings only)**

For every **string key** captured in B2 (IPC channel names, `webContents.send` event names, menu IDs, storage filenames/keys), `_repo_contract_usage.md` MUST record an **official surface-only** repo count.

- Delegated IPC registration call sites (e.g. `settingsState.registerIpc`) are not string keys; they are handled via symbol evidence in B3 and do not belong in `_repo_contract_usage.md`.

Method (VS Code Ctrl+Shift+F):
- Enable Regex search.
- Scope include: `electron/**`, `public/**`
- Scope exclude: `docs/cleanup/**`

Use the surface-only regex (replace `<KEY>` with the literal key):

`(ipcMain\.(handle|on|once)|ipcRenderer\.(invoke|send|on|once)|webContents\.send)\(\s*['"]<KEY>['"]`

Delegated IPC registration surface (first arg is ipcMain; not a string key):
`\.registerIpc\s*\(\s*ipcMain\b`

Record (in `_repo_contract_usage.md`):
- `Repo search (Ctrl+Shift+F): <N> matches in <M> files (top: ...)`
- `Verified at commit: <HEAD>`

Then, in the per-file cleanup note, B2.2 must copy per-key entries from `_repo_contract_usage.md`:
- `Cache (official; surface-only): ...`
- `Verified at: ...`

If the search results include comment-only matches, they MUST be excluded from the official count and recorded as Mentions in B2.3 (not in B2.2).
- “Non-surface matches MUST be excluded from the official count, even if they contain the key string. Examples (non-exhaustive):
  - ipcRenderer.removeListener('<KEY>', ...), ipcRenderer.off('<KEY>', ...), ipcRenderer.removeAllListeners('<KEY>')
  - any occurrence inside comments (// ... '<KEY>' ..., /* ... '<KEY>' ... */)
  - any occurrence inside logs or user-facing messages (console.*, dialogs/notifications/toasts)
These excluded occurrences are not part of B2.2; record them as local Mentions (B2.3) if they are cleanup-relevant.”

2c) **B2.3 — Observability / UX Mentions (local-only; mandatory)**

Track non-contractual mentions that are still cleanup-relevant:
- logs (`console.*`)
- maintenance comments (`TODO/FIXME/HACK/WIP/LEGACY/DEPRECATED`)
- user-facing hardcoded messages (dialogs, notifications, UI strings not coming from i18n)

Rules:
- No repo-wide counts here.
- Format: `L<line>: <snippet>`
- If a hardcoded user-facing message is a fallback, it MUST be distinguishable (see “Hardcoded fallback marker”).

3) **B3 — Candidate Ledger (single section; label-sorted; theme-grouped; evidence-gated)**

- B3 is a single ledger, sorted by label (in this order):
  `P1-DOC`, `P1-STRUCT`, `P2-CONTRACT`, `P2-SIDEFX`, `P2-FALLBACK`, `DEFER`, `DROP`.

- Atomic unit: **occurrence** (a line or bounded block) with `L<line>` + snippet.
  Each occurrence appears **exactly once** in B3.
- Occurrence identifiers are treated as `L<line>#<id>`; the `#<id>` suffix is not assumed unique across the file.
- Tooling convention (repo-wide symbol token search; Ctrl+Shift+F with Regex; replace `<SYMBOL>`): `(?<![\w$])<SYMBOL>(?![\w$])`

- Anchor semantics (mandatory):
  - For `CONTRACT:*` entries, the occurrence `L<line>` MUST anchor the **contract surface statement**
    (e.g., `ipcMain.handle/on/once('key', ...)`, `webContents.send('key', ...)`) for the relevant key.
  - For `PATTERN:*` entries, the occurrence `L<line>` anchors the **pattern line**.
  - If the flagged pattern lives on a different inner line (common inside payload objects), include:
    - `Local evidence (inner): L<line>: <snippet>`
      This inner evidence is additional; it does not replace the occurrence anchor.
  - Documentation convention (recommended):
    - Record the contract-surface snippet as `Anchor evidence: L<line>: <snippet>` (this must match the occurrence anchor).
    - Record the inner flagged pattern as `Local evidence (inner): L<line>: <snippet>` when it differs from the anchor line.

- Optional navigation (within each label): you can group by **Primary Theme** using headers.
  If used:
  - The headers are for navigation only: it is prohibited to replace occurrences with “summary entries” that do not enumerate every occurrence.

- Representation options (per Primary Theme; any label)
  For a given `Primary Theme` (under any label), you may present its occurrences in ONE of two shapes:

  **Option A — Individualized (occurrence blocks)**
  - Use when occurrences differ in any material way (inner evidence, guards, payload shapes, risk profile, proposed action, etc.).
  - Each occurrence is its own block (repeat the standard per-occurrence fields).

  **Option B — Clustered (Shared)**
  - Use only when all occurrences are materially identical (same Label + Primary Theme + Type + proposed actions + risk profile).
  - Write shared fields once at the cluster level and list occurrences under `Occurrences:`.
  - Each listed occurrence MUST still include `L<line>#<id>` plus an anchor snippet (and `Local evidence (inner)` / `Delta:` per occurrence if needed).

  Rules:
  - You MAY mix Option A and Option B across different themes.
  - Within the same theme, choose ONE shape (A or B). If needed, split into multiple clusters/themes.
  - Never cluster different contract keys/events/channels in the same Shared block.
  - “Shared” never replaces occurrences: it only compresses repetition while preserving per-occurrence anchoring.

  Deterministic naming conventions with an explicit axis, for example:
  - `CONTRACT:SEND:<event>` / `CONTRACT:IPC_HANDLE:<channel>` / `CONTRACT:IPC_ON:<channel>` / `CONTRACT:IPC_ONCE:<channel>` / ...
  - `PATTERN:TRY_NOOP` / `PATTERN:DEFAULT_OR` / `PATTERN:DEFAULT_NULLISH` / ...
  - `SIDEFX:<...>`
  - `MISC:<...>`

- Each occurrence must include, at a minimum:
  - Label, Type, `L<line>` + snippet (anchored per “Anchor semantics”), and `Primary Theme` (if grouping is used).
    - In cluster format: Label/Type/Why/Repo evidence/Proposed action may be satisfied at the cluster level, but each occurrence still must include `L<line>#<id>` + an anchor snippet.
  - Tags (recommended; keep short): e.g., `touches_contract`, `near_contract` (use when it adds classification value; omit if not useful).
  - If `CONTRACT:*` and the flagged pattern is not on the anchor line, add:
    - `Local evidence (inner): L<line>: <snippet>`
  - Repo evidence (mandatory for KEEP items except comment-only):
    - Symbol evidence (only if a concrete symbol is involved; choose 1 primary symbol):
      - Definition trace (F12): defined at `<file>`:L<line>; Verified at: `<HEAD>`
      - Repo search (Ctrl+Shift+F): `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
      - Shift+F12 (tooling-derived; file-local; NOT authoritative): `<N>` hits in `<file>`; Verified at: `<HEAD>`
    - Contract [`<KEY>`] (CONTRACT:* entries only):
      - Repo search (Ctrl+Shift+F) [surface only]: `<N>` matches in `<M>` files (top: `<files>`); Verified at: `<HEAD>`
      - Source of truth for this line is B2.2 / `_repo_contract_usage.md` (surface-only counts).
    - Pattern evidence (when the occurrence is primarily a pattern, or when helpful inside a CONTRACT entry):
      - Repo search (Ctrl+Shift+F) [pattern/snippet]: `<pattern>` → `<N>` matches in `<files>`; Verified at: `<HEAD>`
    - Suggested queries (optional; NOT evidence):
      - Contract: `<q...>`
      - Symbol: `<q...>`
      - Pattern: `<q...>`
  - Proposed action:
    - Phase 1: `<doc only / comment-only / reorder-only / none>`
    - Phase 2: `<remove / consolidate / refactor / change fallback>`
  - Risk notes / dependencies: `<fill>`

- Tooling note (repo-wide; mandatory when citing Shift+F12):
  - `Shift+F12` is file-local and tooling-derived (JS language service). It may return `0` or non-canonical counts for CommonJS/property access and dynamic JS. Treat `Shift+F12` counts as “semantic-ish signals”, not as proof of absence/presence. Use `Ctrl+Shift+F` for surface/textual counts.

- Pattern counting convention (mandatory when counting “noop catches”):
  - “noop catches” counted via regex `\/\*\s*noop\s*\*\/` (covers `/* noop */` and `/*noop*/`; multi-line safe).
  - Assumption: all noop markers occur inside catches.

- Preferred: bootstrap B3 from the scanner; then verify, use evidence-gate, and adjust labels/themes.
  - Scanner outputs (B1 inventory, B2 contract lock, B2.3 mentions, B3 candidate ledger) are **navigation aids**.
  - Truncated / one-lined snippets (e.g., `…`, collapsed whitespace, `--max-snippet`) are acceptable.
  - **Non-negotiable:** scanners must not omit occurrences. If any scanner reports truncation by cap
    (e.g., B3 prints `- (truncated) ... more item(s)`), the scan is considered **incomplete** and must be rerun
    with higher limits (e.g., `--max-per-label=<N>`) until no cap-truncation remains.
  - Evidence used for gating/decisions must be taken from VS Code (open file, anchor lines, references, and official surface-only counts).

Rule: Pruning is done by assigning `DEFER`/`DROP`, not by deleting occurrences from the ledger.

### Step C — Phase 1 (Safe)
Goal: structure and clarity improvements while preserving behavior.
Allowed operations:
- add section headers / `#region` blocks,
- translate/refresh comments (ES→EN),
- reorder **only safe-movable** code (see §7),
- create internal helper functions **only if equivalent** (no contract changes),
- remove code only if **demonstrably** unreachable or duplicated *and* verified by evidence.

Deliverable:
- small patch blocks,
- Phase 1 checklist completion (see §11),
- commit with message `chore(<file>): phase 1 safe cleanup`.

### Step D — Phase 2 (Risk)
Goal: remove undesirable fallbacks, legacy behavior, and perform structural changes.
Operations typically include:
- removing or tightening fallbacks,
- changing initialization/timing,
- changing payload shapes (only if coordinated),
- moving logic into modules,
- converting `const fn = () =>` to `function fn()` to enable safe reordering.

Deliverable:
- explicit list of behavior changes,
- focused test plan (beyond smoke test),
- commit with message `refactor(<file>): phase 2 behavior changes`.

## 6) “Nothing gets lost” rule (inventory gating)

Before *any* reordering that moves code blocks:
1. Build an **Inventory Checklist** from the Outline + contract searches:
   - list each top-level handler/function and each IPC channel string.
2. During reordering, each item must be checked off when it is placed in its final section.
3. Phase 1 cannot be marked “done” until all items are checked.

## 7) Reordering safety rules (Phase 1)

### 7.1 Allowed to move (generally safe)
- `function name(...) { ... }` declarations (hoisted).
- comment blocks and docstrings.
- grouping of adjacent statements **without dependencies**.

### 7.2 Conditionally allowed (requires verification)
- `const` / `let` definitions can move **only if**:
  - there is no use before the new definition (TDZ safety),
  - verified via Find All References + earliest usage inspection.

### 7.3 Not allowed in Phase 1
- moving top-level code with side effects:
  - registering listeners, creating windows, reading/writing disk, starting timers,
  - anything that changes execution order at module load time.
- changing IPC channel names, menu IDs, event names, exported API.
- changing default values, timeouts, window geometry behavior, or fallback logic.

If uncertain, treat as Phase 2.

## 8) Contract Lock checks (must be identical in Phase 1)

Before and after Phase 1, extract and compare:
- IPC registrations (`ipcMain.handle/on`) from the target file,
- `webContents.send` event names,
- menu action IDs if present.

Suggested PowerShell snippets:

```powershell
### IPC handlers in a file
Select-String -Path .\electron\main.js -Pattern "ipcMain\.(handle|on)\(" |
  ForEach-Object { $_.Line.Trim() } | Sort-Object

### webContents.send channels
Select-String -Path .\electron\main.js -Pattern "webContents\.send\(" |
  ForEach-Object { $_.Line.Trim() } | Sort-Object
```

## 9) Comment policy (Phase 1)

- Convert Spanish comments to English.
- Remove comments that restate obvious code.
- Add comments only where they clarify:
  - contracts (IPC/event names, payload shapes),
  - non-obvious ordering/timing requirements,
  - security constraints (preload boundary),
  - fallbacks and why they exist.
- Prefer short “why” comments over “what” comments.

### Hardcoded messages policy (mandatory when performing normalization)

- Translate Spanish → English for:
  - comments,
  - logs (`console.*`),
  - hardcoded user-facing messages (dialogs/notifications/toasts).

- Hardcoded user-facing messages that act as fallbacks MUST be prefixed with:
  `FALLBACK:`

- i18n-driven strings MUST NOT use the fallback prefix.

## 10) Commit protocol

- One commit per block if the file is large; never “everything at once”.
- Commit messages:
  - `chore(<file>): phase 1 safe cleanup (sections, comments, dedupe)`
  - `refactor(<file>): phase 2 behavior changes (describe main change)`
- Use `git add -p` (stage hunks) to keep commits tight.

## 11) Standard smoke test checklist (minimum)

After each Phase 1 commit (or after each major block move):

1. App launches without errors.
2. Main window renders and responds.
3. Menu actions still send expected events (basic actions).
4. Manual/editor window opens and closes.
5. Preset modal opens and closes.
6. Floating/timer window opens; basic controls respond; closing it leaves app stable.
7. Quit app; relaunch; settings/state persistence still OK (no unexpected resets).

If any item fails, stop and revert/repair before continuing.

## 12) Phase 2 testing (required)

In Phase 2, define tests **from the change**. Examples:
- If removing a fallback: test both the “valid config” and “missing/corrupt config” flows.
- If changing IPC payload shapes: test both sender and receiver sides.
- If changing window geometry logic: test on intended DPI scaling / monitor setups.

Document the Phase 2 test plan in the commit message body or in `docs/bugs.md` with a short entry.

## 13) Rollback and recovery

- If a Phase 1 change breaks behavior: `git revert <commit>` is preferred over ad-hoc edits.
- Keep Phase 2 in a separate branch until tests pass.

## 14) Output artifacts (recommended)

- The primary artifact is the per-file cleanup note: `docs/cleanup/<slug>.md`.
- Optionally maintain `docs/cleanup/INDEX.md` as a lightweight index (file → Phase 1/2 status → last commit).
