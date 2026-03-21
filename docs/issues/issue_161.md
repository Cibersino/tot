**Title**

Standardize preload listener APIs across the repo

**Body**

## Summary

Adopt and apply the new preload listener policy in [`docs/cleanup/preload_listener_api_standard.md`](c:\Users\manue\Documents\toT\tot\docs\cleanup\preload_listener_api_standard.md).

The repo currently has drift across preload listener-like APIs such as `onX(cb)`:
- some return `unsubscribe`
- some return nothing
- some isolate callback errors
- some call `cb(...)` directly
- some support replay/buffer semantics
- some do not

This issue is to normalize that surface deliberately, file by file, instead of leaving it as implicit drift.

## Why

A consistent preload listener contract will:
- reduce cleanup ambiguity
- make renderer consumers easier to reason about
- make review simpler
- prevent new drift in future preloads

## Policy to adopt

Per [`docs/cleanup/preload_listener_api_standard.md`](c:\Users\manue\Documents\toT\tot\docs\cleanup\preload_listener_api_standard.md):

- Default listener shape: `onX(cb) -> unsubscribe`
- Recurrent listeners should isolate callback errors
- Local unsubscribe should isolate `removeListener(...)` errors
- Replay/buffer semantics must be explicit and documented
- Any exception must be justified concretely, not by style or history

## Scope

Audit and normalize preload files that expose `window.*API` via `contextBridge`, including at least:

- [`electron/preload.js`](c:\Users\manue\Documents\toT\tot\electron\preload.js)
- [`electron/editor_preload.js`](c:\Users\manue\Documents\toT\tot\electron\editor_preload.js)
- [`electron/task_editor_preload.js`](c:\Users\manue\Documents\toT\tot\electron\task_editor_preload.js)
- [`electron/preset_preload.js`](c:\Users\manue\Documents\toT\tot\electron\preset_preload.js)
- [`electron/flotante_preload.js`](c:\Users\manue\Documents\toT\tot\electron\flotante_preload.js)
- [`electron/language_preload.js`](c:\Users\manue\Documents\toT\tot\electron\language_preload.js)
- [`electron/editor_find_preload.js`](c:\Users\manue\Documents\toT\tot\electron\editor_find_preload.js)

## Work plan

1. Produce a listener inventory for each preload:
   - exposed API name
   - all listener-like keys
   - channel
   - whether it returns unsubscribe
   - callback error policy
   - replay/buffer behavior if any

2. Classify each listener as:
   - stream/recurrent
   - rare/control
   - replay/buffer

3. For each non-compliant listener, decide one of:
   - normalize now
   - keep as explicit exception
   - escalate with Evidence/Risk/Validation if behavior change is non-trivial

4. Normalize file by file with repo call-site evidence:
   - grep call sites
   - check return-value usage
   - check repeated-arm risk
   - check consumer-side callback error handling

5. Smoke-test real listener paths after each touched preload.

## Initial likely targets

These look like the first concrete drift candidates to evaluate:

- [`electron/preload.js`](c:\Users\manue\Documents\toT\tot\electron\preload.js)
  - `onCurrentTextUpdated`
  - `onPresetCreated`

- [`electron/editor_preload.js`](c:\Users\manue\Documents\toT\tot\electron\editor_preload.js)
  - `onInitText`
  - `onExternalUpdate`

These should not be normalized mechanically; they should be checked against actual repo consumers first.

## Acceptance criteria

- Every preload listener-like API is inventoried and classified.
- Every listener either follows the new standard or has an explicit documented exception.
- No preload change alters channel names, payload shapes, or timing without explicit Evidence/Risk/Validation.
- Touched preloads pass syntax check and basic listener smoke checks.
- Future preload cleanup can cite one listener standard instead of re-arguing listener shape per file.

## Risks

- Accidental API churn if unsubscribe or callback error behavior changes without checking consumers.
- Over-normalization that hides meaningful differences such as replay/init semantics.
- Partial adoption creating a new mix of “old drift” and “new policy”.

## Non-goals

- Do not rewrite preloads wholesale.
- Do not change main/renderer business logic.
- Do not force replay behavior where it is not required.
- Do not treat every inconsistency as a bug without evidence.
