# Naming Convention: UPPER_SNAKE_CASE vs camelCase

**Project:** toT – Reading Meter
**Status:** Draft (v0.1)
**Scope:** JavaScript in `electron/**` and `public/**` (including preload scripts).
**Motivation:** reduce semantic ambiguity, prevent drift between “defaults” and “effective config”, and make invariants visually obvious.

## 1. Goals and non-goals

### Goals

* Make identifier casing communicate mutability and lifecycle (compile-time constant vs runtime state).
* Avoid misleading API names (export name must match value type/semantics).
* Make config propagation (main → renderer/editor) explicit, stable, and auditable.

### Non-goals

* No behavior changes implied by this document.
* No mass refactor mandated; normalization is incremental and evidence-gated.

## 2. Definitions

* **True constant:** a `const` binding that is never reassigned and is intended to be invariant for the module’s lifetime.
* **Default:** an invariant value used when config/IPC is unavailable (should be a true constant).
* **Effective config:** the runtime value after applying config (even if set “only once” after startup, it is still runtime-derived and therefore not an invariant).
* **Module state/cache:** variables holding injected paths, cached objects, or mutable state during runtime.
* **Environment override key:** `process.env.*` or `window.*` keys used as external configuration switches.

## 3. Policy rules (authoritative)

1. **UPPER_SNAKE_CASE only for true constants (`const`)** at module scope (paths, URLs, intervals, fixed caps, enums/dicts).

   * Example (main): `const MAX_TEXT_CHARS = 10000000;` (`electron/main.js`).

2. **Defaults must be explicit and immutable.**

   * Use `DEFAULT_*` (single) or `DEFAULTS` (object) as `const`. Do not mutate defaults.

3. **camelCase for effective config and runtime-derived values**, even if set only once during startup.

   * Rationale: async IPC/config application means “not an invariant”.

4. **camelCase for module state/cache** that can change at runtime (text buffers, injected file paths, window refs, timers, caches).

   * Example (current code that violates this): `let CURRENT_TEXT_FILE = null;` (`electron/text_state.js`).

5. **camelCase for IPC payload keys and JSON config fields.**

   * Choose one canonical key (e.g., `maxTextChars`).
   * Any alternate spellings (UPPERCASE or snake_case) are treated as **legacy aliases** and must be documented explicitly if retained.

6. **Environment override keys remain UPPER_SNAKE_CASE** (standard practice).

   * Examples in code: `process.env.TOT_LOG_LEVEL`, `process.env.SHOW_DEV_MENU`.

7. **Window APIs exposed via contextBridge use camelCase** for functions and operational properties (e.g., `getAppConfig`).

   * Only allow UPPER_SNAKE_CASE on such APIs for *true constant-like* properties (and only if not mutated).

8. **Export names must match the type/semantics of the exported value.**

   * If it is a map, name implies map; if it is a list, name implies list.
   * This is not cosmetic: it prevents consumer misuse.

## 4. Applied examples (from current repo)

### Example A — True constant at module scope (OK)

`electron/main.js`:

* `const MAX_TEXT_CHARS = 10000000;`
* Used to populate the IPC config and inject into text state.

### Example B — IPC payload key (OK)

`electron/main.js` (`get-app-config` handler):

* returns `{ ok: true, maxTextChars: MAX_TEXT_CHARS }`
  This follows Rule 5 (camelCase payload).

### Example C — Effective config stored as UPPERCASE `let` (policy violation)

`public/renderer.js`:

* `let MAX_TEXT_CHARS = AppConstants.MAX_TEXT_CHARS;`
* later: `MAX_TEXT_CHARS = AppConstants.applyConfig(cfg);`
  Under this policy, this should be camelCase (effective config).

### Example D — Module cache in UPPERCASE `let` (policy violation)

`electron/text_state.js`:

* `let CURRENT_TEXT_FILE = null;`
* assigned in `init()` from options.
  Under this policy, this should be camelCase because it is runtime state/cache.

### Example E — Export name/type mismatch (high-priority violation)

`electron/log.js`:

* internal: `const LEVELS = {...}` and `const LEVEL_NAMES = Object.keys(LEVELS)`
* export: `LEVELS: LEVEL_NAMES`
  Same pattern exists in `public/js/log.js`.
  This violates Rule 8 and is a concrete correctness/maintainability issue (name implies map, value is list).

## 5. Current violations and ambiguities (tracked)

### V1 — Export name/type mismatch (Rule 8)

* `electron/log.js`: `LEVELS` exported but value is `LEVEL_NAMES`
* `public/js/log.js`: same mismatch
  **Priority:** P0 (highest).
  **Reason:** misleading API surface.

### V2 — Effective config represented as UPPERCASE `let` (Rules 3/7)

* `public/renderer.js`, `public/editor.js`: `let MAX_TEXT_CHARS ...` then reassigned after `getAppConfig()`
  **Priority:** P1.
  **Reason:** misleading invariant signal.

### V3 — Runtime module caches represented as UPPERCASE `let` (Rule 4)

* `electron/text_state.js`: `CURRENT_TEXT_FILE`, `SETTINGS_FILE`, `MAX_TEXT_CHARS` are mutable module-level bindings
  **Priority:** P1.
  **Reason:** conflates constants with injected runtime state.

### V4 — Multiple accepted config keys (Rule 5)

`public/js/constants.js` accepts:

* `cfg.maxTextChars` (canonical)
* `cfg.MAX_TEXT_CHARS` and `cfg.max_text_chars` (legacy aliases)
  **Priority:** P2 (depends on whether anything external uses the aliases).
  **Action:** decide whether aliases are needed; document or deprecate.

## 6. Normalization plan (point-by-point; evidence-gated)

### Phase 0 — Documentation and tracking (no code changes)

1. Add this document to the repo.
2. Add a tracking checklist (below) to record each normalization item, with:

   * File(s)
   * Change type (rename-only vs API change)
   * Risk level
   * Required smoke checks

### Phase 1 — Fix objective API mismatch (P0)

**Item 1:** `LEVELS` export name/value mismatch (main + renderer loggers)

* Decide correct public surface:

  * Option A: export `LEVELS` as the map and add `LEVEL_NAMES` explicitly, or
  * Option B: keep the list but rename export to `LEVEL_NAMES`.
* Requirements:

  * Repo-wide search for consumers (Codex/rg) before changing.
  * Smoke: ensure logger still works and any consumers still resolve the expected symbol.

### Phase 2 — Separate defaults vs effective config (P1)

**Item 2:** `MAX_TEXT_CHARS` naming across layers

* Keep main’s `const MAX_TEXT_CHARS` (true constant) or rename to `DEFAULT_MAX_TEXT_CHARS` if you want to emphasize “default cap”.
* Rename renderer/editor mutable locals to camelCase (e.g., `maxTextChars` or `effectiveMaxTextChars`).
* In `constants.js`, decide whether `AppConstants.MAX_TEXT_CHARS` should be:

  * true constant (no mutation), or
  * treated as config object (then rename object or property to avoid “constant” semantics).
* Requirements:

  * No behavior change: ensure truncation still enforces cap.
  * Smoke: open app, editor, paste/append large text, verify truncation messages/behavior.

### Phase 3 — Rename mutable module caches (P1)

**Item 3:** `electron/text_state.js` module-level injected variables

* Rename UPPERCASE `let` caches to camelCase equivalents (e.g., `currentTextFile`, `settingsFile`, `maxTextChars`).
* Requirements:

  * Strictly rename-only where feasible; ensure no external reliance (module-internal).

### Phase 4 — Canonicalize config keys (P2)

**Item 4:** `applyConfig()` accepted keys

* Keep `maxTextChars` canonical.
* If aliases are truly needed, document them explicitly as legacy and add a deprecation strategy.
* If not needed, remove aliases later (breaking-change risk depends on consumers).

## 7. Tracking checklist (copy/paste)

* [ ] P0: Logger export mismatch (`LEVELS` vs `LEVEL_NAMES`) — `electron/log.js`, `public/js/log.js`
* [ ] P1: Renderer effective config casing — `public/renderer.js` (`MAX_TEXT_CHARS` local)
* [ ] P1: Editor effective config casing — `public/editor.js` (`MAX_TEXT_CHARS` local)
* [ ] P1: text_state module caches casing — `electron/text_state.js` (`CURRENT_TEXT_FILE`, `SETTINGS_FILE`, `MAX_TEXT_CHARS`)
* [ ] P2: Config keys canonicalization — `public/js/constants.js` (`applyConfig` accepted keys)
* [ ] P?: Any additional UPPERCASE `let` variables found by inventory (append here)

## 8. Enforcement (lightweight, practical)

* Rule of thumb: **no `let SOME_UPPERCASE`** in new code.
* Pre-PR check: repo-wide scan for new UPPERCASE `let/var` declarations and for exports whose names imply a different type than the value.
* Codex audit prompt (English) can be rerun before each phase to confirm scope.