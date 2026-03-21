# Preload Listener API Standard

**Project:** toT  
**Status:** Draft (v0.1)  
**Scope:** Preload files that expose `window.*API` surfaces via `contextBridge`.

## 1. Purpose

Define a consistent contract for preload listener-like APIs such as `onX(cb)`.

The goal is to reduce drift across preloads, make renderer consumers easier to reason about, and make cleanup decisions evidence-driven instead of stylistic.

This document is preload-specific. It does not replace the bridge failure-mode convention; it refines the listener contract inside preload surfaces.

## 2. Problem statement

Listener-like preload APIs in the repo currently vary in ways that are easy to miss:

1. Some return an unsubscribe function, others return `undefined`.
2. Some isolate callback errors with `try/catch`, others call `cb(...)` directly.
3. Some support replay/buffer behavior, others are live-only.
4. Some remove listeners through a shared helper, others inline the wiring.

This variation is not automatically a bug, but it is drift until the difference is either:

- standardized, or
- documented as an explicit exception.

## 3. Core rule

Every listener-like preload API must be classified before implementation or cleanup:

1. **stream/recurrent listener**
2. **rare/control listener**
3. **replay/buffer listener**

The classification determines the default listener contract.

If a listener does not follow the default contract for its class, the file must carry an explicit reason grounded in behavior, not style.

## 4. Default listener contract

### 4.1 Stream/recurrent listener

Examples:

- state updates
- settings updates
- repeated UI sync events
- repeated feature status broadcasts

Default contract:

- Shape: `onX(cb) -> unsubscribe`
- Callback policy: isolate callback errors with `try/catch`
- Removal policy: isolate `removeListener(...)` errors locally
- Timing: preserve current delivery timing; do not add replay unless explicitly required

Baseline pattern:

```js
function onSomething(cb) {
  const listener = (_event, payload) => {
    try {
      cb(payload);
    } catch (err) {
      console.error('something callback error:', err);
    }
  };

  ipcRenderer.on('something', listener);

  return () => {
    try {
      ipcRenderer.removeListener('something', listener);
    } catch (err) {
      console.error('removeListener error (something):', err);
    }
  };
}
```

### 4.2 Rare/control listener

Examples:

- readiness notifications
- close requests
- one-shot control signals

Default contract:

- Shape: `onX(cb) -> unsubscribe`
- Callback policy: isolate by default unless there is a deliberate fail-fast reason
- Removal policy: isolate `removeListener(...)` errors locally

Rationale:

Even rare listeners benefit from a uniform unsubscribe surface. The repo should not require consumers to remember which `onX` keys return teardown and which do not, unless there is an explicit reason.

### 4.3 Replay/buffer listener

Examples:

- preload APIs that may receive data before the renderer subscribes
- init payloads that must be replayed to late subscribers

Default contract:

- Shape: `onX(cb) -> unsubscribe`
- Replay behavior: explicit and documented in the preload
- Callback policy: isolate callback errors for both live delivery and replay
- Removal policy: local unsubscribe must be safe even if replay is pending

Replay is not the default. It must be introduced only when the feature contract requires it.

## 5. Default no-go rule

Do not treat these as harmless internal refactors:

- adding an unsubscribe return where none existed
- removing an unsubscribe return
- changing direct `cb(...)` to isolated `try/catch`
- changing isolated callback delivery to direct propagation
- adding replay/buffer behavior
- changing listener delivery timing

These are preload surface changes unless proven otherwise.

## 6. Contract gate for listener normalization

A listener normalization change is allowed in cleanup only if all of the following are true:

1. **Evidence**
- exact repo call sites are identified
- return-value usage is checked
- repeated-arm / duplicate-subscription risk is checked
- callback error handling at consumers is checked

2. **Risk**
- the change states what observable behavior would differ
- the change states whether the repo has any current caller depending on the old behavior

3. **Validation**
- repo grep for call sites and return-value usage
- `node --check <preload-file>`
- human smoke of one real listener path where applicable

If any of those are missing, the change should not be presented as a routine cleanup normalization.

## 7. Evaluation checklist per listener

For each preload listener-like API, answer:

1. Does it return unsubscribe?
2. Does any repo caller use the return value?
3. Is the listener armed once or can it be armed repeatedly?
4. Does the preload isolate callback errors?
5. Does the consumer already isolate its own callback body?
6. Is replay/buffer behavior present?
7. Is the current shape consistent with the listener class?

The result must be one of:

- already compliant
- normalize now
- keep as explicit exception
- escalate because behavior evidence is insufficient

## 8. Exceptions

An exception is acceptable only if it is explicit and useful.

Examples of acceptable exceptions:

- no unsubscribe because the listener is intentionally permanent for the page lifetime and replay/teardown would be misleading
- direct callback propagation because the listener is intentionally fail-fast and the consumer must surface errors
- replay/buffer semantics because the main process can emit before renderer subscription

Bad exceptions:

- "older code"
- "it works"
- "it looks different"
- "it is probably intentional"

If the reason cannot be stated concretely, it is not a documented exception.

## 9. Repo default to adopt

Unless a preload documents an explicit exception, the repo default is:

1. Listener APIs use `onX(cb) -> unsubscribe`
2. Recurrent listeners isolate callback errors
3. Local unsubscribe isolates `removeListener(...)` errors
4. Replay/buffer is opt-in and documented

This is the default standard for future preload cleanup.

## 10. Adoption strategy

Apply the standard incrementally.

1. New preload listener APIs must follow this standard.
2. Touched preload files should be audited against this standard.
3. Existing drift should be normalized only with repo call-site evidence.
4. If normalization would change observed behavior in healthy paths, escalate with Evidence/Risk/Validation instead of forcing the change.

## 11. Review checklist

Before accepting a preload listener cleanup:

1. Is each listener classified as stream/recurrent, rare/control, or replay/buffer?
2. Does each listener follow the repo default contract or an explicit documented exception?
3. Was return-value usage checked across the repo?
4. Was duplicate-subscription risk checked?
5. Was callback error behavior checked at both preload and consumer sides?
6. Were replay/timing semantics preserved?
7. Did the change avoid introducing cross-context dependencies or non-console preload logging?

## 12. Relationship to other cleanup docs

- `docs/cleanup/cleanup_file_by_file.md` remains the operational workflow for preload LP0-LP4.
- `docs/cleanup/bridge_failure_mode_convention.md` still governs required/optional/best-effort bridge dependency handling.
- This document adds a preload-specific listener contract so "inconsistent listener shape" is reviewed against a standard instead of by intuition.
