# Renderer Dialog API Unification Under `notify.js`

## Summary

This issue captures the decision to unify renderer-side dialogs under a single maintained API in [`public/js/notify.js`](c:\Users\manue\Documents\toT\tot\public\js\notify.js).

The current renderer code does not use one consistent dialog layer. It mixes:

- direct browser `alert(...)`
- direct browser `confirm(...)`
- `window.Notify.*` calls from `notify.js`
- local wrapper functions such as `notifyMain(...)`
- helper wrappers such as `safeNotify(...)`
- renderer-owned custom DOM modal APIs that live outside `notify.js`

The result is a renderer notification/dialog surface that is harder to reason about and harder to maintain than it should be.

This issue is to define and apply one renderer-side rule:

- renderer dialogs should be owned by `notify.js`
- renderer call sites should use one consistent `window.Notify.*` surface
- call sites should not carry local fallback, guard, or wrapper logic for the same underlying dialog behavior

In this issue, “owned by `notify.js`” means more than adding a new alias under `window.Notify`.
It means `notify.js` becomes the clear maintained public entry point for the renderer dialog behavior,
so centralization reduces surface fragmentation instead of only moving the same indirection to a new file.

## Scope

This issue covers renderer-process dialog flows only.

In scope:

- blocking renderer alerts currently using browser `alert(...)`
- blocking renderer confirms currently using browser `confirm(...)`
- renderer-owned custom DOM modals in the main window
- renderer-owned custom DOM modals in the task editor
- the public `window.Notify` API in [`public/js/notify.js`](c:\Users\manue\Documents\toT\tot\public\js\notify.js)
- renderer call-site cleanup so the dialog API is used consistently

Out of scope:

- main-process native dialogs using `dialog.showMessageBox(...)`
- toast redesign
- translation-copy redesign unrelated to notification API shape
- unrelated business-logic changes in the flows that happen to show dialogs

## Current Runtime Evidence

### 1. `notify.js` is only one part of the renderer dialog surface

[`public/js/notify.js`](c:\Users\manue\Documents\toT\tot\public\js\notify.js) exports:

- `window.Notify.notifyMain`
- `window.Notify.notifyEditor`
- `window.Notify.toastMain`
- `window.Notify.toastEditorText`

But renderer code also uses other dialog paths directly.

### 2. Direct browser dialogs still exist outside `notify.js`

Direct `alert(...)` call sites:

- [`public/js/notify.js`](c:\Users\manue\Documents\toT\tot\public\js\notify.js)
- [`public/preset_modal.js`](c:\Users\manue\Documents\toT\tot\public\preset_modal.js)

Direct `confirm(...)` call sites:

- [`public/task_editor.js`](c:\Users\manue\Documents\toT\tot\public\task_editor.js)

### 3. Renderer call sites use multiple notification patterns

Examples of direct `window.Notify.notifyMain(...)` usage:

- [`public/renderer.js`](c:\Users\manue\Documents\toT\tot\public\renderer.js)

Examples of local wrappers around a passed or global notify function:

- [`public/js/import_extract_entry.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_entry.js)
- [`public/js/import_extract_drag_drop.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_drag_drop.js)
- [`public/js/import_extract_ocr_disconnect.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_ocr_disconnect.js)
- [`public/preset_modal.js`](c:\Users\manue\Documents\toT\tot\public\preset_modal.js)

Example of helper wrapper around notification calls:

- [`public/js/import_extract_ocr_activation_recovery.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_ocr_activation_recovery.js) uses `safeNotify(...)`

Examples of guard/fallback patterns around `window.Notify`:

- [`public/renderer.js`](c:\Users\manue\Documents\toT\tot\public\renderer.js)
- [`public/editor.js`](c:\Users\manue\Documents\toT\tot\public\editor.js)
- [`public/preset_modal.js`](c:\Users\manue\Documents\toT\tot\public\preset_modal.js)
- [`public/task_editor.js`](c:\Users\manue\Documents\toT\tot\public\task_editor.js)

### 4. Renderer-owned custom modals are not part of one central notification API

Main-window custom modal APIs:

- [`public/js/import_extract_route_choice_modal.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_route_choice_modal.js)
- [`public/js/import_extract_apply_modal.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_apply_modal.js)
- [`public/js/import_extract_ocr_activation_disclosure_modal.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_ocr_activation_disclosure_modal.js)
- [`public/js/info_modal.js`](c:\Users\manue\Documents\toT\tot\public\js\info_modal.js)

Task-editor custom modal handling:

- [`public/task_editor.js`](c:\Users\manue\Documents\toT\tot\public\task_editor.js)

These are renderer dialogs, but they are not exposed through `window.Notify`.

## Current Problem

The renderer dialog model has drifted into multiple overlapping patterns.

Concrete problems:

- `notify.js` is not the single renderer dialog owner
- some renderer flows use direct browser dialogs while others use `window.Notify`
- some flows call `window.Notify` directly while others wrap it locally
- some flows inject notify functions as dependencies while others reach into `window.Notify`
- some flows carry local fallback behavior and some do not
- some renderer dialogs are centralized, while others still expose separate feature-local public APIs

This makes the dialog layer harder to maintain because there is no single place to answer questions like:

- how renderer alerts are shown
- how renderer confirms are shown
- what the standard renderer dialog API is
- whether renderer dialogs are blocking or not
- how renderer custom modal flows are exposed

## Direction

Renderer dialogs should be unified behind `notify.js`.

That means:

- `public/js/notify.js` becomes the single renderer dialog module
- `window.Notify` becomes the single public renderer dialog surface
- renderer call sites use `window.Notify.*` directly instead of local wrappers for the same dialog behavior
- renderer alert and confirm behavior is exposed from `notify.js`, not from direct browser globals at feature call sites
- renderer-owned custom DOM modal flows are also integrated into `notify.js` as maintained public dialog entry points, instead of remaining separate feature-local public APIs

For custom modals, the goal is real ownership consolidation, not a thin forwarding alias that leaves the feature-local API as the practical owner.
If `Notify` becomes the new public surface, the old scattered public path should stop being the intended integration point.

This issue is intentionally broader than only replacing `alert(...)` and `confirm(...)`.

The target is a single renderer dialog architecture, not just a smaller count of browser-dialog calls.

## Required Changes

### 1. Define the canonical renderer dialog API in `notify.js`

`notify.js` should own the renderer dialog surface for:

- blocking message dialogs
- blocking confirmation dialogs
- renderer-owned custom modal prompts

The API names should be explicit and internally consistent, and the module should be the real public owner of those flows rather than a simple re-export layer over scattered feature globals.

### 2. Remove direct browser dialog calls from renderer features

Renderer feature files should not call browser `alert(...)` or `confirm(...)` directly.

Those calls should be routed through `window.Notify`.

### 3. Remove local notify wrappers for shared dialog behavior

Renderer features should not define local `notifyMain(...)` wrappers, `safeNotify(...)` wrappers, or similar pass-through helpers when they are only proxying the same renderer dialog API.

If a helper remains, it must represent real feature-specific behavior, not API indirection.

### 4. Fold renderer custom modal ownership into the central API

Custom renderer modal flows should still be allowed where the UI needs them, but their maintained public access path should be centralized through `window.Notify` rather than scattered per-feature globals.

This includes both:

- main-window custom modal flows
- task-editor custom modal flows

The intent here is to reduce the number of renderer dialog surfaces that callers need to know about.
Adding a thin `window.Notify.*` forwarder without consolidating ownership or deprecating the old public path does not fully solve the problem described in this issue.

### 5. Remove call-site guards and fallbacks around renderer dialog access

Renderer code should not repeatedly do things like:

- check whether `window.Notify` exists
- check whether a specific notify method exists
- fall back to direct `alert(...)`
- silently drop notices when a notify function is unavailable

The renderer dialog surface should be a stable contract. Call sites should use it directly.

## Implementation Plan

1. Inventory every renderer dialog entry point and classify it as:
   - message alert
   - confirmation prompt
   - custom modal prompt

2. Design the final `window.Notify` renderer API so those categories have one explicit home.

3. Move existing custom modal modules under that API in a way that makes `Notify` the clear public owner, without changing their user-facing flow unnecessarily.

4. Remove direct browser dialog calls from renderer feature files.

5. Remove local pass-through wrappers and guard/fallback branches whose only purpose is to compensate for the current fragmented API.

6. Re-check renderer call sites so dialog invocation style is uniform across:
   - main window
   - editor window
   - task editor
   - preset modal
   - import/extract feature modules

## Acceptance Criteria

- Renderer feature files do not call browser `alert(...)` directly.
- Renderer feature files do not call browser `confirm(...)` directly.
- Renderer dialog access is centralized in [`public/js/notify.js`](c:\Users\manue\Documents\toT\tot\public\js\notify.js).
- `window.Notify` is the single renderer dialog API surface.
- Renderer-owned custom modal flows are exposed through the same central API surface, and no longer rely on scattered feature-local public dialog APIs as the intended integration path.
- Renderer call sites do not contain local notify fallbacks or availability guards for the standard dialog API.
- The final renderer dialog API is consistent enough that a new renderer dialog flow has one obvious integration path.

## Risks

- Over-normalization could cause unnecessary churn if modal-specific behavior is flattened too aggressively.
- Renaming the API carelessly could create more ambiguity instead of less.
- Converting feature-local modal globals into one central API could blur ownership if the boundaries are not documented clearly.

## Notes

- This issue is about renderer dialog architecture, not about removing valid non-blocking toast usage.
- This issue does not claim that every renderer message should use the same visual treatment.
- The goal is one consistent renderer dialog API and ownership model, not one single visual component for every case.
