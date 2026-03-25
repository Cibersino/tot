# Info Modal Link Notifications

## Summary

This issue combines the design and implementation work for info-modal link failure notifications.

The i18n audit showed two related problems:

- info-modal link failures are logged but not shown to users
- the existing `renderer.info.external.*` and `renderer.info.appdoc.*` keys do not cleanly match the runtime reason model

These should be handled in one issue because the final i18n cleanup depends on the chosen runtime-to-UI mapping, and the implementation depends on that same mapping.

## Scope

This issue covers:

- defining the user-facing failure taxonomy for info-modal links
- implementing the renderer notification layer in `public/js/info_modal_links.js`
- aligning i18n keys to the final mapping
- removing obsolete `renderer.info.*` keys after the mapping is implemented

This issue does not cover:

- unrelated link-opening flows outside the info modal
- general notification-system redesign
- generic i18n cleanup outside this feature boundary

## Current Runtime Evidence

Info-modal renderer flow:

- `public/js/info_modal_links.js` calls `openExternalUrl(...)`
- `public/js/info_modal_links.js` calls `openAppDoc(...)`
- failures are currently logged, not surfaced with `window.Notify`

Runtime reasons:

External links:

- `blocked`
- `error`

App-doc links:

- `blocked`
- `not_found`
- `error`
- `open_failed`
- `not_available_in_dev`
- `not_available_on_platform`

Current i18n keys:

- `renderer.info.external.blocked`
- `renderer.info.external.missing`
- `renderer.info.external.error`
- `renderer.info.appdoc.blocked`
- `renderer.info.appdoc.missing`
- `renderer.info.appdoc.error`

## Current Problem

The current key set is not a reliable final taxonomy.

Examples:

- external `missing` does not match the current external runtime reasons
- app-doc runtime reasons are richer than the current three-key set

So the right sequence is:

1. decide the user-facing message groups
2. implement the mapping
3. clean the now-obsolete keys

## Proposed Taxonomy Direction

### External links

Proposed user-facing groups:

- `blocked`
- `error`

Rationale:

- the runtime only distinguishes those two outcomes today
- `missing` should not be kept unless the runtime later introduces a real external “missing” concept

### App-doc links

Proposed user-facing groups:

- `blocked`
- `missing`
- `error`

Proposed reason mapping:

- `blocked` -> `blocked`
- `not_found` -> `missing`
- `not_available_in_dev` -> `missing`
- `not_available_on_platform` -> `missing`
- `error` -> `error`
- `open_failed` -> `error`

Rationale:

- users likely do not need six distinct app-doc failure messages
- `missing` is a reasonable user-facing collapse for “not available here” and “not found”
- `error` is a reasonable user-facing collapse for runtime/open failures

## Implementation Plan

### 1. Renderer notification layer

In `public/js/info_modal_links.js`:

- keep structured logging
- when `openExternalUrl(...)` fails, map the runtime reason to an external notification key
- when `openAppDoc(...)` fails, map the runtime reason to an app-doc notification key
- surface the selected key through the existing notification mechanism

### 2. Runtime-to-UI mapping

Implement explicit mapping functions in the renderer for:

- external-link failure reasons
- app-doc failure reasons

Do not rely on raw runtime codes doubling as translation-key suffixes.

### 3. I18n alignment

Keep or add only the keys required by the final mapping:

External:

- keep `renderer.info.external.blocked`
- keep `renderer.info.external.error`
- remove `renderer.info.external.missing`

App-doc:

- keep `renderer.info.appdoc.blocked`
- keep `renderer.info.appdoc.missing`
- keep `renderer.info.appdoc.error`

### 4. Cleanup

After implementation:

- remove any `renderer.info.*` key with no justified runtime mapping
- verify that the remaining keys are all reachable from the info-modal link flow

## Acceptance Criteria

- info-modal external-link failures produce user-visible notifications
- info-modal app-doc failures produce user-visible notifications
- structured logging remains intact
- external-link runtime reasons map deliberately to the final external notification keys
- app-doc runtime reasons map deliberately to the final app-doc notification keys
- `renderer.info.external.missing` is removed unless a real runtime reason justifies it
- no remaining `renderer.info.*` key is left without a defined role in the final mapping

## Notes

- This issue intentionally combines what had been separated as “taxonomy” and “implementation” because they are one continuous design-to-code task.
- Cleanup is the last step, not the first one.
