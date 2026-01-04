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
  - `electron/main.js:57 const MAX_TEXT_CHARS = 10000000;`
  - IPC: `electron/main.js:1055–1059` returns `{ ok: true, maxTextChars: MAX_TEXT_CHARS }`
  - Injection: `electron/main.js:61–67` passes `maxTextChars` into text_state.init
- Main text_state cache + truncation:
  - `electron/text_state.js:26 let MAX_TEXT_CHARS = 10_000_000;`
  - `electron/text_state.js:104 MAX_TEXT_CHARS = opts.maxTextChars;`
  - Truncation: `electron/text_state.js:127–131` and `185–190`
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
- [ ] Done (evidence attached)

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
- [ ] Done (evidence attached)

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
- [ ] Pending
- [ ] In progress
- [ ] Done (evidence attached)

---

### Patch 2.4 (Optional / Later) — Legacy key rationalization
Goal:
- Decide whether to keep accepting `cfg.MAX_TEXT_CHARS` and `cfg.max_text_chars`.
- Document as legacy or schedule removal.

Status:
- [ ] Not scheduled
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
Task: Introduce `electron/constants_main.js` and import it from `electron/main.js`.
(Insert the exact prompt used in the chat for Patch 2.1.)

### Patch 2.2 prompt (English)
(To be written when Patch 2.1 is complete and verified.)

### Patch 2.3 prompt (English)
(To be written when Patch 2.2 is complete and verified.)

## Evidence log (append-only)
Record commands and outputs proving each patch:
- rg outputs (before/after)
- node -e checks
- runtime DevTools logs (minimal excerpts)
- smoke results
