# Renderer Dialog API Policy (`window.Notify`)

**Project:** toT  
**Status:** Draft (v0.1)  
**Scope:** Renderer-process dialog access in `public/**`

## 1. Purpose

Define the maintained renderer dialog policy so future cleanup/refactor work does not reintroduce drift.

This document is about **renderer dialog API ownership and call-site usage**.
It is **not** a general rule for feature taxonomy design, bridge failure-mode classification, or i18n cleanup by itself.

Related documents:

* `docs/cleanup/bridge_failure_mode_convention.md`
* `docs/cleanup/no_silence.md`
* `docs/cleanup/cleanup_file_by_file.md`

## 2. Core rule

Renderer dialogs are owned by `public/js/notify.js`.

The maintained public renderer dialog surface is `window.Notify`.

Renderer feature modules must use `window.Notify.*` directly for standard dialog behavior instead of:

* direct browser `alert(...)`
* direct browser `confirm(...)`
* local pass-through wrappers such as `notifyMain(...)`
* local safety wrappers such as `safeNotify(...)`
* repeated feature-level availability guards/fallbacks around the same standard dialog API

## 3. What counts as a renderer dialog

For this policy, renderer dialogs include:

1. Blocking renderer alerts/messages.
2. Blocking renderer confirms.
3. Renderer-owned custom modal prompts.

This policy does **not** claim every message must use the same visual treatment.
It only defines **one public access path** for renderer dialog behavior.

## 4. Authoritative rules

### 4.1 Ownership

1. `public/js/notify.js` is the single maintained renderer dialog module.
2. `window.Notify` is the single public renderer dialog API surface.
3. If a renderer dialog flow is intended for general consumption, its maintained public entry point must live on `window.Notify`.

### 4.2 Call-site policy

1. Renderer feature files should call `window.Notify.*` directly.
2. Renderer feature files must not define pass-through helpers whose only job is to proxy `window.Notify.*`.
3. Renderer feature files must not carry local fallback logic for standard dialog access.
4. Renderer feature files must not repeatedly check whether `window.Notify` or a standard `window.Notify.*` method exists.
5. If the renderer dialog API is required for a module to function, treat it as part of stable renderer contract rather than as an optional per-call dependency.

### 4.3 Browser globals

1. Renderer feature files must not call browser `alert(...)` directly.
2. Renderer feature files must not call browser `confirm(...)` directly.
3. Any renderer alert/confirm behavior must be exposed from `notify.js`.

### 4.4 Custom modal prompts

1. Renderer-owned custom modal flows are allowed.
2. Their maintained public access path must be centralized through `window.Notify`.
3. Adding a thin forwarder while keeping the feature-local global as the real intended API is not enough.

### 4.5 Fallback ownership

1. If dialog fallback behavior is needed, it belongs in `public/js/notify.js`.
2. Feature modules must not duplicate fallback policy that `notify.js` already owns.
3. This includes toast-to-alert fallback, confirm fallback, and similar renderer dialog degradation policy.

## 5. What this policy does not say

This document does **not** say:

1. Every feature must use the same notification taxonomy.
2. Every runtime reason needs a direct 1:1 i18n key.
3. Every helper near notification logic is forbidden.

Those are separate questions.

## 6. Allowed helpers vs forbidden wrappers

### Allowed

Helpers are allowed when they represent **real feature logic**, not dialog indirection.

Examples:

1. Mapping runtime reasons to user-facing notification keys.
2. Resolving a result object into one chosen `alertKey` / `guidanceKey`.
3. Choosing between a feature-specific toast vs alert based on business semantics.

Example shape:

```js
function mapExternalFailureReasonToKey(reason) {
  if (reason === 'blocked') return 'renderer.info.external.blocked';
  return 'renderer.info.external.error';
}

window.Notify.notifyMain(mapExternalFailureReasonToKey(result && result.reason));
```

### Forbidden

Wrappers are forbidden when they only add API indirection over the same standard dialog behavior.

Examples:

```js
function notifyUnavailable() {
  window.Notify.notifyMain('renderer.alerts.some_unavailable');
}

function safeNotify(key) {
  if (window.Notify && typeof window.Notify.notifyMain === 'function') {
    window.Notify.notifyMain(key);
  }
}
```

Both are policy drift unless they encode additional feature behavior that is not just dialog proxying.

## 7. Interaction with bridge failure-mode policy

This document does not replace `docs/cleanup/bridge_failure_mode_convention.md`.

Both rules apply together:

1. Bridge policy decides whether a dependency is required, optional, or best-effort.
2. This dialog policy decides **how renderer call sites access dialog behavior** once they need to notify/prompt the user.

Practical consequence:

* A feature may still classify a bridge as optional or best-effort.
* But when it needs user-facing renderer dialog feedback, it should surface that through `window.Notify.*`, not through local dialog wrappers.

## 8. Interaction with feature taxonomy design

When a feature has runtime reasons that do not match user-facing message groups, explicit mapping is allowed and expected.

Example:

* runtime reasons: `blocked`, `not_found`, `open_failed`
* user-facing groups: `blocked`, `missing`, `error`

In that case:

1. define the feature taxonomy,
2. implement explicit mapping in the feature,
3. call `window.Notify.*` directly with the chosen key.

What is centralized by this policy is the **dialog API surface**, not every feature’s semantic mapping logic.

## 9. Anti-patterns

The following are policy violations:

1. Feature-local wrappers that only proxy `window.Notify.*`.
2. Feature-local `safeNotify(...)` style wrappers for standard renderer dialogs.
3. Repeated `if (window.Notify && typeof window.Notify.foo === 'function')` checks across feature call sites.
4. Falling back from `window.Notify.*` to direct browser `alert(...)` or `confirm(...)` in feature code.
5. Keeping scattered feature-local public modal globals as the intended integration path after adding `window.Notify.*` aliases.

## 10. Practical review checklist

When touching a renderer module, verify:

1. Does the module call `window.Notify.*` directly for standard dialog behavior?
2. Did the change avoid adding a local pass-through notify wrapper?
3. Did the change avoid new browser `alert(...)` / `confirm(...)` calls?
4. If a custom renderer modal is exposed publicly, is `window.Notify` the intended public path?
5. If a fallback was needed, does it live in `public/js/notify.js` rather than at the feature call site?
6. If a feature-specific mapping helper exists, does it map semantics rather than proxy the dialog API?

## 11. Adoption rule

Apply this policy incrementally:

1. New or touched renderer code must follow it.
2. Existing drift is fixed when a file is actively being cleaned up or refactored.
3. If a file conflicts with this policy and older scattered patterns, prefer this document as the current renderer dialog baseline.
