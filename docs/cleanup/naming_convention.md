# Naming Convention: UPPER_SNAKE_CASE vs camelCase

**Project:** toT – Reading Meter
**Status:** Draft (v0.1)
**Scope:** JavaScript in `electron/**` and `public/**` (including preload scripts).
**Motivation:** reduce semantic ambiguity, prevent drift between “defaults” and “effective config”, and make invariants visually obvious.

## 1. Goals and non-goals

### Goals

* Make identifier casing communicate mutability and lifecycle (compile-time constant vs runtime state).
* Avoid misleading API names (export name must match value type/semantics).
* Make config propagation (main -> renderer/editor) explicit, stable, and auditable.

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

   * Example (main): `const MAX_TEXT_CHARS = 10000000;` (`electron/constants_main.js`).

2. **Defaults must be explicit and immutable.**

   * Use `DEFAULT_*` (single) or `DEFAULTS` (object) as `const`. Do not mutate defaults.

3. **camelCase for effective config and runtime-derived values**, even if set only once during startup.

   * Rationale: async IPC/config application means “not an invariant”.

4. **camelCase for module state/cache** that can change at runtime (text buffers, injected file paths, window refs, timers, caches).

   * Example: `let currentTextFile = null;` (`electron/text_state.js`).

5. **camelCase for IPC payload keys and JSON config fields.**

   * Use the canonical key (`maxTextChars`).
   * Do not accept alternate spellings for this value in config/IPC.

6. **Environment override keys remain UPPER_SNAKE_CASE** (standard practice).

   * Examples in code: `process.env.TOT_LOG_LEVEL`, `process.env.SHOW_DEV_MENU`.

7. **Window APIs exposed via contextBridge use camelCase** for functions and operational properties (e.g., `getAppConfig`).

   * Only allow UPPER_SNAKE_CASE on such APIs for *true constant-like* properties (and only if not mutated).

8. **Export names must match the type/semantics of the exported value.**

   * If it is a map, name implies map; if it is a list, name implies list.
   * This is not cosmetic: it prevents consumer misuse.

## 4. Applied examples (from current repo)

### Example A — True constant at module scope (OK)

`electron/constants_main.js`:

* `const MAX_TEXT_CHARS = 10000000;`
* Imported by `electron/main.js` to populate the IPC config and inject into text state.

### Example B — IPC payload key (OK)

`electron/main.js` (`get-app-config` handler):

* returns `{ ok: true, maxTextChars: MAX_TEXT_CHARS }`
  This follows Rule 5 (camelCase payload).

### Example C — Effective config stored as camelCase (OK)

`public/renderer.js`, `public/editor.js`:

* `let maxTextChars = AppConstants.MAX_TEXT_CHARS;`
* later: `maxTextChars = AppConstants.applyConfig(cfg);`
  This follows Rule 3 (effective config is camelCase).

### Example D — Module cache in camelCase (OK)

`electron/text_state.js`:

* `let currentTextFile = null;`
* `let settingsFile = null;`
* assigned in `init()` from options.
  This follows Rule 4 (runtime state/cache in camelCase).

### Example E — Export name/type match (OK)

`electron/log.js`, `public/js/log.js`:

* `LEVELS` exports the map and `LEVEL_NAMES` exports the list.
  This aligns with Rule 8 (export name matches value type).

## 5. Current violations and ambiguities (tracked)

### V1 — Export name/type mismatch (Rule 8) — RESOLVED

* `electron/log.js`: `LEVELS` exports the map; `LEVEL_NAMES` exports the list.
* `public/js/log.js`: same fix.
  **Status:** Done (P0).

### V2 — Effective config represented as UPPERCASE `let` (Rules 3/7) — RESOLVED

* `public/renderer.js`, `public/editor.js`: `maxTextChars` is used for the effective limit.
  **Status:** Done (P1).

### V3 — Runtime module caches represented as UPPERCASE `let` (Rule 4) — RESOLVED

* `electron/text_state.js`: `currentTextFile`, `settingsFile` are camelCase module-level bindings.
  **Status:** Done (P1).

### V4 — Multiple accepted config keys (Rule 5) — RESOLVED

`public/js/constants.js` accepts only:

* `cfg.maxTextChars` (canonical)
  **Status:** Done (P2).

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

* Keep main’s `const MAX_TEXT_CHARS` in `electron/constants_main.js` (true constant).
* Rename renderer/editor mutable locals to camelCase (e.g., `maxTextChars` or `effectiveMaxTextChars`).
* In `constants.js`, `AppConstants.MAX_TEXT_CHARS` is a true constant; `applyConfig` returns the effective value without mutation.
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

* Keep `maxTextChars` canonical; legacy aliases are removed (Patch 2.4).

## 7. Tracking checklist (copy/paste)

* [x] P0: Logger export mismatch (`LEVELS` vs `LEVEL_NAMES`) — `electron/log.js`, `public/js/log.js`
* [x] P1: Renderer effective config casing — `public/renderer.js` (`maxTextChars` local)
* [x] P1: Editor effective config casing — `public/editor.js` (`maxTextChars` local)
* [x] P1: text_state module caches casing — `electron/text_state.js` (`currentTextFile`, `settingsFile`)
* [x] P2: Config keys canonicalization — `public/js/constants.js` (`applyConfig` accepted keys)
* Additional UPPERCASE `let/var` items are tracked via pre-PR scans (none in the latest inventory).

## 8. Enforcement (lightweight, practical)

* Rule of thumb: **no `let SOME_UPPERCASE`** in new code.
* Pre-PR check: repo-wide scan for new UPPERCASE `let/var` declarations and for exports whose names imply a different type than the value.
* Codex audit prompt (English) can be rerun before each phase to confirm scope.
