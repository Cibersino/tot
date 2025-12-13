# Code Cleanup Protocol (toT – Reading Meter)

Version: 1.8  
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
- IPC channels (`ipcMain.handle/on`, `ipcRenderer.invoke/on/send`),
- `webContents.send` event names and payload shapes,
- menu action IDs,
- `module.exports` / `require(...)` interfaces,
- storage filenames (`config/*.json`), keys, and expected shapes.

### Evidence
A VS Code–generated fact that supports a change. Accepted evidence:
- `Find All References` results,
- global search results (`Ctrl+Shift+F`) for symbol/string variants,
- call hierarchy / definition tracing,
- (optional) runtime logs confirming reachability/usage.

### Safe move
A reordering operation that does not change semantics, under verified conditions (see §7).

## 4) Pre-flight (once per cleanup series)

- Ensure `docs/cleanup/` exists (canonical location for per-file cleanup notes).
- Ensure you have access to the standard cleanup note template (see `cleanup_template.md`).
- Agree on the slug rule for filenames: replace `/` and `.` with `_` (example: `electron/main.js` → `electron_main_js`).


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
- Capture a reliable list of top-level units (functions, classes, top-level state, and other top-level statements).
- Preferred (if available): generate B1 via a local AST extractor script (e.g., `b1_inventory.cjs`) run from VS Code/terminal, then paste the generated block into the per-file note.
- Fallback: use VS Code **Outline** (Ctrl+Shift+O) and targeted searches to build the list manually.

2) **B2 — Contract Lock (must remain stable in Phase 1)**
- Capture and list all externally observable “contracts”, at minimum:
  - `ipcMain.handle(`
  - `ipcMain.on(`
  - `ipcMain.once(`
  - `ipcRenderer.invoke(`
  - `ipcRenderer.on(`
  - `webContents.send(`
  - menu action IDs / routing keys (including `"menu-click"` if used)
  - `module.exports` / `exports.` (if applicable)
- Preferred (if available): generate B2 via a local AST extractor script (e.g., `b2_contract_lock.cjs`) run from VS Code/terminal, then paste the generated block into the per-file note.
- Fallback: use VS Code **PowerShell Terminal** and targeted searches to build the list manually.

3) **B3 — Candidate Ledger (single section; label-sorted; evidence-gated)**

- B3 is a single ledger, sorted by label (in this order):
  `P1-DOC`, `P1-STRUCT`, `P2-CONTRACT`, `P2-SIDEFX`, `P2-FALLBACK`, `DEFER`, `DROP`.

- Atomic unit: **occurrence** (a line or bounded block) with `L<line>` + snippet.
  Each occurrence appears **exactly once** in B3.

- Optional navigation (within each label): you can group by **Primary Theme** using headers.
  If used:
  - a single level (no subtrees/subheaders);
  - each entry declares exactly one `Primary Theme`;
  - the headers are for navigation only: **it is prohibited** to replace occurrences with “summary entries”.

  Deterministic naming conventions with an explicit axis, for example:
  - `CONTRACT:SEND:<event>` / `CONTRACT:IPC_HANDLE:<channel>` / `CONTRACT:IPC_ON:<channel>` / ...
  - `PATTERN:TRY_NOOP` / `PATTERN:DEFAULT_OR` / `PATTERN:DEFAULT_NULLISH` / ...
  - `MISC:<...>`

- Each occurrence must include, at a minimum:
  - Label, Type, `L<line>` + snippet, and `Primary Theme` (if grouping is used).
  - Repo evidence (mandatory for KEEP items except comment-only):
    - References (Shift+F12): `<N>` hits in `<files>`
    - Repo search (Ctrl+Shift+F): `<N>` matches in `<files>`
    - Suggested queries (optional): `<q1>`, `<q2>`
  - Proposed action:
    - Phase 1: `<doc only / comment-only / reorder-only / none>`
    - Phase 2: `<remove / consolidate / refactor / change fallback>`
  - Risk notes / dependencies: `<fill>`

- Preferred: bootstrap from the scanner; then verify, use evidence-gate, and adjust labels/themes.

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

Phase 1 pass condition: extracted lists remain identical (ignoring whitespace changes).

## 9) Comment policy (Phase 1)

- Convert Spanish comments to English.
- Remove comments that restate obvious code.
- Add comments only where they clarify:
  - contracts (IPC/event names, payload shapes),
  - non-obvious ordering/timing requirements,
  - security constraints (preload boundary),
  - fallbacks and why they exist.
- Prefer short “why” comments over “what” comments.

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
