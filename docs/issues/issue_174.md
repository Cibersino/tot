# Selectable-Text PDF Prepare Hides OCR Activation Path

## Summary

Current code auto-selects the native PDF route when:

- the PDF has detectable selectable text
- Google OCR is not ready yet

In that branch, the user is not offered both routes and cannot reach OCR activation from the same PDF flow.

This is an active behavior problem, not just a UX preference, because the renderer's OCR activation recovery only runs for OCR prepare failures. The current `native_only` prepare result bypasses that recovery path completely.

## Scope

This issue covers:

- PDF prepare-time route selection
- OCR activation recovery reachability from import/extract
- the contract between prepare-time route triage and renderer-side recovery

This issue does not cover:

- native extraction correctness by itself
- OCR provider failure taxonomy
- drag/drop vs picker entrypoint differences by themselves

## Problem

### 1. Selectable-text PDFs lose the OCR branch entirely when OCR is inactive

Type:

- active behavior conflict
- prepare/recovery contract gap

Files:

- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js)
- [`electron/import_extract_platform/import_extract_prepare_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_ipc.js)
- [`public/js/import_extract_entry.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_entry.js)
- [`public/js/import_extract_ocr_activation_recovery.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_ocr_activation_recovery.js)

Identifiers:

- `resolvePdfPreparation(...)`
- `buildOcrPrepareFailure(...)`
- `recoverAfterSetupFailure(...)`
- `runSharedFlow(...)`

Producer anchors:

- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js) detects whether a PDF has selectable text and whether OCR setup is ready.
- the same module sets `pdfTriage = 'both'` only when `nativeAvailable && ocrReady`.
- the same module sets `pdfTriage = 'native_only'` and `chosenRoute = 'native'` when `nativeAvailable && !ocrReady`.
- [`electron/import_extract_platform/import_extract_prepare_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_ipc.js) forwards that prepare result and logs `choice-required` only when `preparation.requiresRouteChoice === true`.

Consumer anchors:

- [`public/js/import_extract_entry.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_entry.js) asks the OCR activation recovery helper to inspect the prepare result before continuing.
- [`public/js/import_extract_ocr_activation_recovery.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_ocr_activation_recovery.js) only runs recovery when `preparation.prepareFailed === true` and `preparation.routeKind === 'ocr'`.
- if prepare succeeds with `native_only`, the renderer proceeds directly to execute without exposing an OCR choice or OCR activation path.

Current code evidence:

- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js) uses this split:
  - `nativeAvailable && ocrReady` -> `pdfTriage = 'both'`, `availableRoutes = ['native', 'ocr']`, `requiresRouteChoice = true`
  - `nativeAvailable && !ocrReady` -> `pdfTriage = 'native_only'`, `availableRoutes = ['native']`, `chosenRoute = 'native'`
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js) only builds an OCR prepare failure when the PDF is effectively OCR-only and OCR validation is unavailable.
- [`public/js/import_extract_ocr_activation_recovery.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_ocr_activation_recovery.js) returns early unless the prepare result is a failed OCR prepare surface.
- [`public/js/import_extract_entry.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_entry.js) notifies and returns on `prepareFailed`, but otherwise proceeds to route choice or direct execute.

Observed smoke-test evidence:

- a selectable-text PDF produced:
  - `pdfTriage: 'native_only'`
  - `triageReason: 'native_text_detected_ocr_unavailable'`
  - `availableRoutes: [ 'native' ]`
  - `chosenRoute: 'native'`
  - `ocrSetupState: 'ocr_activation_required'`
- execute then ran the native route directly and reached the apply modal without any route-choice modal or OCR activation recovery.

Why this is an active problem:

- the same import/extract entry flow can trigger OCR activation recovery for image OCR and OCR-only prepare failures, but not for selectable-text PDFs
- the prepare contract currently treats "OCR unavailable" as a reason to remove the OCR branch entirely when native text exists
- that means the user cannot choose OCR for the current PDF and cannot activate OCR from that route-selection point, even though the flow already supports OCR activation recovery in other import/extract cases
- the route triage is therefore making a user-facing product decision that also suppresses the only renderer path that can recover OCR setup

## Direction

The likely fix direction is:

- keep native text detection
- keep OCR setup validation
- but do not collapse selectable-text PDFs to `native_only` merely because OCR is inactive
- instead, preserve both branches for selectable-text PDFs and let the OCR branch trigger the existing OCR activation recovery flow when selected

Possible implementation shapes:

- prepare always returns `both` for selectable-text PDFs, with route choice available even when OCR setup is not ready
- or prepare returns a richer dual-route surface where `native` is immediately runnable and `ocr` is selectable-but-requires-activation

The important constraint is this:

- selectable-text PDF triage should not make OCR activation unreachable from the PDF flow

## Acceptance Criteria

- a selectable-text PDF still advertises the native route
- when OCR is already ready, the route-choice modal still appears as today
- when OCR is not ready, the PDF flow still exposes an OCR branch instead of collapsing to `native_only`
- selecting the OCR branch can trigger the existing OCR activation recovery flow
- declining OCR activation leaves the user in a bounded, predictable state without silently running the wrong route
- native execution remains available without requiring OCR activation

## Notes

- This issue is about prepare/recovery contract behavior, not about forcing OCR by default.
- The problem is narrower than "route choice modal broken"; current code is doing exactly what it encodes.
- The problem is that the encoded `native_only` branch suppresses OCR activation reachability for one class of PDFs.
