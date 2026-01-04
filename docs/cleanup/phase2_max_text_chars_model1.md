# Phase 2 — MAX_TEXT_CHARS (Model 1: main-authoritative hard cap)

## Purpose
Reduce conceptual and naming complexity around `MAX_TEXT_CHARS` while preserving observable behavior.
Establish a clear Model 1 contract:
- **Main (Node/Electron) is authoritative** for the hard cap.
- Renderer/editor consume the effective value via IPC (`maxTextChars`) and use a local camelCase variable.
- Renderer fallback exists only for IPC failure and is explicitly non-authoritative.
- `public/js/constants.js` is not a mutable store of “effective config”.

## Scope
In scope (Phase 2):
- Centralize developer-tunable hard cap on the main side.
- Eliminate mutable “global effective config” for MAX_TEXT_CHARS on renderer side.
- Rename mutable caches/locals to camelCase to match convention.

Out of scope (explicitly not Phase 2):
- User-configurable setting persisted in settings/user_settings.json.
- Re-architecting IPC model beyond what is needed to propagate `maxTextChars`.
- Removing accepted legacy keys (`cfg.MAX_TEXT_CHARS`, `cfg.max_text_chars`) unless explicitly scheduled later.

## Definitions
- **Hard cap (authoritative):** developer-tunable hard limit used by main/text_state to prevent crashes/OOM.
- **Effective value (runtime):** the number renderer/editor actually uses (ideally from IPC).
- **Fallback (non-authoritative):** local default used only if IPC fails.

## Current pipeline evidence (localizers)
(From repo-wide `rg` outputs; keep updated as patches land)
- Main hard cap constant:
  - `electron/constants_main.js:4 const MAX_TEXT_CHARS = 10000000;`
  - Main import: `electron/main.js:21 const { MAX_TEXT_CHARS } = require('./constants_main');`
  - IPC: `electron/main.js:1056-1059` returns `{ ok: true, maxTextChars: MAX_TEXT_CHARS }`
  - Injection: `electron/main.js:61-67` passes `maxTextChars` into text_state.init
- Main text_state cache + truncation:
  - `electron/text_state.js:19 const { MAX_TEXT_CHARS } = require('./constants_main');`
  - `electron/text_state.js:27 let maxTextChars = MAX_TEXT_CHARS;`
  - `electron/text_state.js:104-105 maxTextChars = opts.maxTextChars;`
  - Truncation: `electron/text_state.js:128-132` and `186-191`
- Renderer/editor locals:
  - `public/renderer.js:69 let MAX_TEXT_CHARS = AppConstants.MAX_TEXT_CHARS;` + reassignments `151,153`
  - `public/editor.js:13 let MAX_TEXT_CHARS = AppConstants.MAX_TEXT_CHARS;` + reassignments `21,23`
- Renderer constants + config parsing helper:
  - `public/js/constants.js:6 DEFAULTS.MAX_TEXT_CHARS = 10_000_000` (fallback)
  - `public/js/constants.js:21–25 applyConfig()` currently mutates `this.MAX_TEXT_CHARS`

## Completed prerequisite (Phase 1 P0)
- Logger export mismatch fixed: `LEVELS` now exports the map and `LEVEL_NAMES` exports the list.
- Verified via rg + node + runtime DevTools smoke.

## Architectural decision (Model 1)
### Contract
1) Main is the only authoritative source of the hard cap.
2) Main exposes it to renderer/editor via IPC as `maxTextChars`.
3) Renderer/editor store the effective value in a local `maxTextChars` (camelCase).
4) Renderer fallback uses `DEFAULTS.MAX_TEXT_CHARS` only if IPC fails.
5) `AppConstants` must not hold mutable “effective config” for MAX_TEXT_CHARS.

### Implementation strategy
Use two constants “centers” by runtime:
- `electron/constants_main.js` — Node/Electron main tuning constants (authoritative for hard caps).
- `public/js/constants.js` — renderer-side constants + fallback defaults (non-authoritative for hard caps sourced from main).

## Patch plan (small, testable, behavior-preserving)

### Patch 2.1 — Introduce `electron/constants_main.js` and move main hard cap knob there
Goal:
- Developer edits hard cap in one place on the main side.
- No behavior change.

Files:
- NEW: `electron/constants_main.js`
- MOD: `electron/main.js`

Changes:
- Create `MAX_TEXT_CHARS` export in `electron/constants_main.js` set to `10000000`.
- Replace literal `const MAX_TEXT_CHARS = 10000000;` in `electron/main.js` with import from `./constants_main`.

Pre-check (PowerShell):
- `rg -n -S -F "const MAX_TEXT_CHARS" .\electron\main.js`
- `rg -n -S -F "maxTextChars:" .\electron\main.js`

Post-check (PowerShell / Node):
- `node -e "console.log(require('./electron/constants_main').MAX_TEXT_CHARS)"`
- `rg -n -S -F "require('./constants_main')" .\electron\main.js` (or import form used)
- Run app; in DevTools: `window.electronAPI.getAppConfig()` returns same `maxTextChars`.

Smoke checklist:
- App starts.
- `get-app-config` returns `{ ok: true, maxTextChars: 10000000 }` (same as before).
- Existing truncation behavior unchanged (no errors).

Codex prompt (English):
- See section “Codex prompts” below.

Status:
- [ ] Pending
- [ ] In progress
- [x] Done (evidence attached)

---

### Patch 2.2 — Main text_state: rename mutable cache to camelCase and remove literal drift
Goal:
- Eliminate separate hard-coded default in `electron/text_state.js`.
- Align mutable cache naming with convention.

Files:
- MOD: `electron/text_state.js`
- (Optional MOD if needed): `electron/main.js` only if init signature needs minor adjustment (should not).

Changes:
- Replace module-level `let MAX_TEXT_CHARS = 10_000_000;` with camelCase cache `let maxTextChars = <authoritative default>` (prefer importing `MAX_TEXT_CHARS` from `./constants_main` or rely solely on init injection).
- Update all reads/writes to use `maxTextChars`.
- Preserve log messages and truncation semantics.

Pre-check:
- `rg -n -S -F "let MAX_TEXT_CHARS" .\electron\text_state.js`
- `rg -n -S -F "MAX_TEXT_CHARS" .\electron\text_state.js`

Post-check:
- No remaining `MAX_TEXT_CHARS` mutable cache in text_state (only possibly imported constant if used).
- Oversized set-current-text still truncates.

Smoke checklist:
- Trigger set-current-text with payload longer than cap; verify truncation path logs/behavior unchanged.
- Main window + editor window continue to receive updates (no regressions in IPC updates).

Status:
- [ ] Pending
- [ ] In progress
- [x] Done (evidence attached)

---

### Patch 2.3 — Renderer/editor: remove AppConstants mutation for MAX_TEXT_CHARS; use local `maxTextChars`
Goal:
- `public/js/constants.js` becomes default-only for this value (fallback), not “effective config store”.
- Renderer/editor use local camelCase variable derived from IPC.

Files:
- MOD: `public/js/constants.js`
- MOD: `public/renderer.js`
- MOD: `public/editor.js`

Changes:
- Make `AppConstants.applyConfig(cfg)` pure for maxTextChars: compute and return number **without mutating** `this.MAX_TEXT_CHARS`.
- In renderer/editor, rename local `MAX_TEXT_CHARS` to `maxTextChars` and assign from IPC-derived value (still calling `applyConfig` if it remains the canonical parser).
- Keep fallback default explicit when IPC fails.

Pre-check:
- `rg -n -S -F "this.MAX_TEXT_CHARS" .\public\js\constants.js`
- `rg -n -S -F "let MAX_TEXT_CHARS" .\public\renderer.js .\public\editor.js`
- `rg -n -S -F "applyConfig(" .\public`

Post-check:
- `public/js/constants.js` no longer mutates `this.MAX_TEXT_CHARS` for config application.
- Renderer/editor truncation still uses the effective local `maxTextChars`.

Smoke checklist:
- Main window: paste/append text; truncation logic still applies (renderer truncation sites).
- Editor: paste/drop text; truncation still applies (editor truncation sites).
- IPC success path updates effective value; IPC failure path uses fallback.

Status:
- [x] Pending
- [ ] In progress
- [ ] Done (evidence attached)

---

### Patch 2.4 (Optional / Later) — Legacy key rationalization
Goal:
- Decide whether to keep accepting `cfg.MAX_TEXT_CHARS` and `cfg.max_text_chars`.
- Document as legacy or schedule removal.

Status:
- [x] Not scheduled
- [ ] Scheduled
- [ ] Done

## Risks and hard gates
### Key risk
- Any code depending on `AppConstants.MAX_TEXT_CHARS` being mutated at runtime.

Hard gate before Patch 2.3:
- Repo-wide confirm `AppConstants.MAX_TEXT_CHARS` is not relied on as a mutable source beyond renderer/editor locals.
  - `rg -n -S -F "AppConstants.MAX_TEXT_CHARS" .\public`
- Confirm constants.js still loads before renderer/editor (AppConstants must exist before use).
  - `public/index.html:129-138` and `public/editor.html:26-30`
  - `rg -n -F "constants.js" public\\index.html public\\editor.html`

Hard gate before Patch 2.2:
- Confirm there are no other mutable `MAX_TEXT_CHARS` bindings outside renderer/editor/text_state.
  - `rg -n -S -g "electron/**" -g "public/**" "\\b(let|var)\\s+MAX_TEXT_CHARS\\b"`
  - `rg -n -S -F "let MAX_TEXT_CHARS" .\electron .\public`
  - `rg -n -S -F "var MAX_TEXT_CHARS" .\electron .\public`

### Drift risk
- Duplicated numeric literal values in multiple domains. Mitigation:
  - main-authoritative `electron/constants_main.js`
  - renderer default labeled explicitly as fallback-only

## Codex prompts

### Patch 2.1 prompt (English)

```
Task: Implement Patch 2.1 from `docs/cleanup/phase2_max_text_chars_model1.md` (Model 1: main-authoritative hard cap).

Goal (behavior-preserving):
- Centralize the developer-tunable hard cap for MAX_TEXT_CHARS on the main (Node/Electron) side in a new module.
- No behavior change. No IPC contract change. No formatting churn.

References (must follow):
- `docs/cleanup/phase2_max_text_chars_model1.md` — Patch 2.1 section (introduce `electron/constants_main.js`, import it from `electron/main.js`).
- `docs/cleanup/naming_convention.md` — UPPER_SNAKE_CASE is allowed only for true `const` constants; IPC payload keys remain camelCase.

Target files (exact):
- NEW: `electron/constants_main.js`
- MOD: `electron/main.js`
Do NOT modify any other files in this patch.

Required code changes:
1) Create `electron/constants_main.js` (CommonJS, `use strict`), exporting:
   - `MAX_TEXT_CHARS` as a true constant set to `10000000`.
   Keep this file minimal (only what Patch 2.1 needs). No extra refactors.

2) In `electron/main.js`:
   - Locate the current main hard cap definition (currently `const MAX_TEXT_CHARS = 10000000;` per the Phase 2 doc; confirm the exact location in your repo).
   - Replace it with an import from `./constants_main`, using the existing module style (CommonJS):
     Example:
       const { MAX_TEXT_CHARS } = require('./constants_main');
   - Ensure all existing uses of MAX_TEXT_CHARS in main remain unchanged in behavior (textState.init injection and get-app-config IPC response must still use the same numeric value and the same payload key `maxTextChars`).

Constraints:
- No unrelated refactors.
- No rename cascades.
- No changes to IPC channel names, payload shapes, return shapes, defaults, or error handling.
- Avoid formatting churn; change only the minimal lines required.

Verification (required, evidence-gated):
A) Pre-check commands (PowerShell):
- rg -n -S -F "const MAX_TEXT_CHARS" .\electron\main.js
- rg -n -S -F "maxTextChars:" .\electron\main.js

B) Post-check commands:
- node -e "console.log(require('./electron/constants_main').MAX_TEXT_CHARS)"
- rg -n -S -F "constants_main" .\electron\main.js

C) Runtime smoke:
- Start the app.
- In main window DevTools, run: window.electronAPI.getAppConfig()
  Expected: returned object still includes `maxTextChars` and its value equals 10000000 (same as before).

Deliverable:
- Provide a clean diff (preferred) showing:
  - full content of the new file `electron/constants_main.js`,
  - the minimal edit to `electron/main.js` (import + removal of the old local const).
- Include exact repo-local paths and the line numbers of the modified block in `electron/main.js`.
- Summarize changes in 1–3 bullets.
```

### Patch 2.2 prompt (English)

```
Task: Implement Patch 2.2 from `docs/cleanup/phase2_max_text_chars_model1.md` (Model 1: main-authoritative hard cap).

Intent (behavior-preserving):
- Normalize naming inside `electron/text_state.js` to follow `docs/cleanup/naming_convention.md`:
  - UPPER_SNAKE_CASE only for true constants
  - mutable/runtime cache must be camelCase (`maxTextChars`)
- Remove numeric literal drift in `electron/text_state.js` by sourcing the default hard-cap value from the main-authoritative knob introduced in Patch 2.1 (`electron/constants_main.js`) and/or the existing init injection pathway, without changing observable behavior.

Target file (exact):
- MOD: `electron/text_state.js`
Do NOT modify any other files in this patch.

Hard constraints:
- No unrelated refactors; avoid formatting churn.
- Preserve observable behavior and contract:
  - truncation semantics and thresholds remain identical
  - existing exported API stays the same (names, shapes, return values)
  - IPC behavior and payload shapes remain unchanged
  - logging behavior (levels/messages) remains unchanged, except where strictly necessary to avoid ambiguity about which limit is being enforced

Additional constraints (to avoid the previous misstep):
- Do NOT introduce a new semantic constant name such as `DEFAULT_MAX_TEXT_CHARS` (or any `DEFAULT_*` alias) for the authoritative knob.
  - Import/use the authoritative constant as `MAX_TEXT_CHARS` (UPPER_SNAKE_CASE is correct for a true const).
- Ensure log/message wording is not ambiguous:
  - If a log line refers to the enforced limit, it must clearly refer to the effective runtime limit (`maxTextChars`) and must not label it as `MAX_TEXT_CHARS` unless it is explicitly describing the authoritative knob.
  - Avoid “legacy label” framing; keep wording consistent with Model 1 (authoritative knob vs effective runtime value).

Repo-evidence gates (must be true after the change):
1) `electron/text_state.js` contains no mutable `MAX_TEXT_CHARS` binding (mutable cache becomes `maxTextChars`).
2) `electron/text_state.js` no longer hardcodes `10_000_000` as a local default; the default comes from the authoritative main constant and/or init injection.
3) Truncation paths use the effective mutable cache value (`maxTextChars`) consistently.
4) No new `DEFAULT_*` naming layer was introduced for the authoritative knob.
5) Any log text that mentions the limit is conceptually consistent (no “MAX_TEXT_CHARS” label paired with a `maxTextChars` value).

Deliverable:
- Provide a clean diff for `electron/text_state.js` only, including line numbers of the changed blocks.
- Summarize changes in 1–3 bullets.
- Include brief evidence that the gates hold (e.g., the key rg checks you ran).
```

### Patch 2.3 prompt (English)
(To be written when Patch 2.2 is complete and verified.)

## Evidence log (append-only)
Record commands and outputs proving each patch:
- rg outputs (before/after)
- node -e checks
- runtime DevTools logs (minimal excerpts)
- smoke results

### Patch 2.1 - DONE (main-authoritative hard cap constant extraction)

Code evidence:
- `electron/constants_main.js`:
  - `const MAX_TEXT_CHARS = 10000000;`
- `electron/main.js`:
  - imports `MAX_TEXT_CHARS` from `./constants_main`
  - `get-app-config` returns `{ ok: true, maxTextChars: MAX_TEXT_CHARS }`
  - injects `maxTextChars: MAX_TEXT_CHARS` into `text_state.init({ ... })`

Checks (verified):
- Node:
  - `node -e "console.log(require('./electron/constants_main').MAX_TEXT_CHARS)"`
  - Output: `10000000`
- Runtime (DevTools, main window):
  - `await window.electronAPI.getAppConfig()`
  - Output: `{ ok: true, maxTextChars: 10000000 }`
- Smoke:
  - App starts; no regressions observed in truncation paths.

### Patch 2.2 - DONE (text_state cache rename + default source)

Code evidence:
- `electron/text_state.js`:
  - `const { MAX_TEXT_CHARS } = require('./constants_main');`
  - `let maxTextChars = MAX_TEXT_CHARS;`
  - truncation uses `maxTextChars` (`electron/text_state.js:128-132` and `186-191`)

Checks (verified):
- `rg -n -S "\\b(let|var)\\s+MAX_TEXT_CHARS\\b" .\\electron\\text_state.js` (no matches)
- `rg -n -S -F "10_000_000" .\\electron\\text_state.js` (no matches)
