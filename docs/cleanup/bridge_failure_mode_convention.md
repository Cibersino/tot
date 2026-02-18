# Bridge Dependency Failure-Mode Convention

**Project:** toT  
**Status:** Draft (v0.1)  
**Scope:** Renderer modules in `public/**` that consume preload APIs (`window.*API`), plus related main/preload bridge contracts.

## 1. Purpose

Define when a module must fail fast vs degrade gracefully when a bridge dependency is missing or invalid.

Coexistence of both behaviors is allowed and expected, but only when the dependency class is explicit and consistent.

## 2. Core rule

Each dependency must be classified before coding:

1. **Required startup dependency** -> fail fast.
2. **Optional capability** -> guard + continue with feature disabled.
3. **Best-effort side action** (race-prone) -> attempt, and if unavailable drop without breaking main flow.

Unclassified coexistence is drift and should be treated as a policy violation.

## 3. Definitions

- **Required startup dependency:** Without it, module invariants cannot hold and normal initialization is invalid.
- **Optional capability:** Feature can be disabled while module remains usable.
- **Best-effort side action:** Intended action may be dropped due to transient/race state (for example, target window closed).

## 4. Decision matrix (authoritative)

1. Required startup dependency
- Missing/invalid handling: Throw or hard abort the init path.
- Diagnostics: Emit a clear failure diagnostic following the logging policy.
- Runtime effect: The screen/module does not continue in an invalid state.

2. Optional capability
- Missing/invalid handling: Guard the call site and skip the feature.
- Diagnostics: Emit a deduplicated fallback diagnostic following the logging policy.
- Runtime effect: The module continues; capability is disabled.

3. Best-effort side action
- Missing/invalid handling: Do not crash; drop the action.
- Diagnostics: If a real intended action is dropped, emit a deduplicated "failed (ignored)" style diagnostic.
- Runtime effect: Main flow continues.

## 5. Observability requirements

1. No silent fallback for real fallback paths.
2. For high-frequency repeatable misses/failures, use output deduplication.
3. Dedupe keys must be stable short IDs, optionally with controlled suffixes.
4. Do not put unbounded dynamic data in dedupe keys.
5. Keep dynamic diagnostics in message arguments, not in the dedupe key.
6. In `.js` source files, developer diagnostics in warning/error logs and thrown errors must be English-only (`log.warn|warnOnce|error|errorOnce`, `console.warn|error`, `throw new Error(...)`, `throw ...`); user-facing UI text remains i18n-owned.
7. Proper names / identifiers must remain verbatim (including non-English tokens) inside those diagnostics, for example function/method names, i18n keys, config/object keys, IPC channel names, constants, and internal IDs (e.g., `modoConteo`, `acerca_de`, `setModeConteo`).
8. Keep the existing logger mechanism for the runtime context: main/renderer use the repo logger mechanism (`electron/log.js` / `public/js/log.js`); preload remains console-based.
9. Call-site style is mandatory: call `log.warn|warnOnce|error|errorOnce` directly; do not introduce local aliases/wrappers for those methods.
10. If a fallback is BOOTSTRAP-only, the message or explicit dedupe key must start with `BOOTSTRAP:` and that path must become unreachable after init.

## 6. Coding patterns

### 6.1 Required startup dependency (fail fast)

```js
if (!window.someAPI || typeof window.someAPI.requiredMethod !== 'function') {
  throw new Error('someAPI.requiredMethod unavailable');
}
```

### 6.2 Optional capability (guard + degrade)

```js
if (!window.someAPI || typeof window.someAPI.optionalMethod !== 'function') {
  // Emit a deduplicated fallback diagnostic per logging policy.
  return;
}
await window.someAPI.optionalMethod(payload);
```

### 6.3 Best-effort side action (failed ignored)

```js
try {
  target.webContents.send('channel', payload);
} catch (err) {
  // Emit a deduplicated "failed (ignored)" diagnostic per logging policy.
}
```

## 7. Anti-patterns

1. Using one recent feature module as the policy source of truth.
2. Mixing fail-fast and degrade for the same dependency type across modules without a stated reason.
3. Replacing explicit classification with ad hoc "defensive" guards.
4. Silent fallback that changes behavior without diagnostics.

## 8. Review checklist (PR gate)

1. Is each bridge dependency classified as required, optional, or best-effort?
2. Does handling match the matrix in Section 4?
3. Are fallback paths non-silent when they represent real fallback behavior?
4. Are dedupe keys stable and bounded?
5. Did the change avoid contract drift (channels, payloads, ordering)?
6. Did the author cite mature baseline modules, not only recent feature files?
7. Are warning/error logs and thrown errors in `.js` files English-only (non-UI diagnostics) while keeping proper names/identifiers verbatim?
8. Does the file keep the context logger mechanism and direct call-site style (no local log wrappers/aliases)?
9. Are BOOTSTRAP-only fallbacks marked with `BOOTSTRAP:` and unreachable after init?

## 9. Baseline selection rule

When deriving conventions from existing code:

1. Prefer mature cross-cutting modules first (core renderer/main/logging paths).
2. Use recent feature modules only as secondary evidence.
3. If evidence conflicts, document the conflict and choose one policy path explicitly before changing code.

## 10. Adoption

Apply this convention incrementally:

1. New or touched modules must follow this policy.
2. Existing drift is fixed only when a file is actively being refactored.
3. Behavior/contract/timing must remain unchanged unless a dedicated architecture change is approved.
