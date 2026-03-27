# Google OCR Overlap And Contract Conflict Fix Plan

## Summary

This issue captures four overlap problems in the Google Drive OCR / activation / setup area that are strong enough to create real behavior conflicts or credible maintenance risk from the current code alone.

The goal of this document is to preserve the exact conflict surface before any fix work starts.

This is not a cleanup issue.
This is a contract-alignment issue.

The affected code currently contains:

- overlapping token-readiness contracts
- overlapping activation-failure semantics
- overlapping credentials-validation rules
- overlapping OCR preflight decision paths

Three of those are confirmed active contract conflicts from code alone.
One is a strong duplication/risk item that should be resolved before it becomes active drift.

## Scope

In scope:

- Google OCR activation
- Google OCR setup validation
- Google OCR runtime route execution
- Google OCR disconnect/revocation
- import/extract OCR preparation and preflight gating

Out of scope:

- OCR product-policy changes
- privacy/disclosure copy changes
- unrelated renderer notification cleanup
- documentation-only cleanup

## Confirmed Problems Vs Suspicion

Confirmed active contract or behavior conflicts:

1. refresh-only token contract drift across activation, validation, and runtime
2. `ocr_activation_required` overloaded for both user cancellation and broken local token state
3. credentials validation contract disagrees with OAuth client construction on `redirect_uris`

Strong suspicion / maintenance-risk overlap:

4. duplicate OCR preflight path in `import_extract_ocr_gate_ipc.js` versus the active prepare path

## Problem 1: Refresh-Only Token Contract Drift

### Files

- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js)
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js)
- [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_disconnect_ipc.js)

### Identifiers

- `extractSerializableCredentials(...)`
- `parseTokenShape(...)`
- `validateGoogleDriveOcrSetup(...)`
- `buildGoogleOAuthClient(...)`
- `selectPreferredRevocationToken(...)`

### Producer And Consumer Anchors

Producer anchors:

- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:307`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js#L307)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:504`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js#L504)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:178`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js#L178)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:529`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js#L529)

Consumer anchors:

- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js:37`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js#L37)
- [`electron/import_extract_platform/ocr_google_drive_route.js:364`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js#L364)
- [`electron/import_extract_platform/ocr_google_drive_route.js:385`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js#L385)
- [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js:176`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_disconnect_ipc.js#L176)

### What Overlaps

Activation and token-shape validation both allow token payloads that contain either:

- `access_token`
- `refresh_token`

But setup validation later changes the readiness contract and requires an `access_token` to pass the API probe path.

Runtime OCR and disconnect do not use that stricter rule.
They accept the stored token payload and build/use the OAuth client directly.

### Why This Is A Real Problem

The code currently permits this sequence:

1. activation stores a token payload that has no immediately usable `access_token`, but does have a `refresh_token`
2. validation reports OCR not ready or auth-failed because the access token is missing at validation time
3. runtime and disconnect still treat the same payload as the correct persisted token contract

That is an active same-domain contract split.
The same persisted token state is both accepted and rejected depending on which module consumes it.

### Type

Same domain, different contract.

### Required Fix Direction

Pick one canonical persisted-token contract and apply it everywhere.

Allowed directions:

- either define persisted readiness as “refresh token is enough; probe/runtime may refresh or let Google client manage it”
- or define persisted readiness as “access token must be materialized before token state is considered ready”

But the code must not keep both contracts.

The final token-readiness rule must be shared by:

- activation persistence
- setup validation
- runtime OCR route execution
- disconnect/revocation

## Problem 2: `ocr_activation_required` Is Overloaded

### Files

- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js)

### Identifiers

- `mapCodeToAlertKey(...)`
- `mapAuthenticateError(...)`
- `mapValidationToActivationResult(...)`
- `validateGoogleDriveOcrSetup(...)`

### Producer And Consumer Anchors

Producer anchors:

- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:173`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js#L173)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:184`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js#L184)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:503`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js#L503)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:506`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js#L506)

Consumer anchors:

- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:78`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js#L78)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:82`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js#L82)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:94`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js#L94)

### What Overlaps

The code currently uses `ocr_activation_required` for two different meanings:

- the user cancelled or denied the browser-based OAuth flow
- the saved local token state is missing, invalid, or undecryptable

Activation result mapping then converts both meanings into the same user-facing cancelled path.

### Why This Is A Real Problem

A post-OAuth local token problem can surface as:

- `code: 'ocr_activation_required'`
- alert key: `renderer.alerts.import_extract_ocr_activation_cancelled`

That is a false behavior diagnosis.
The user did not cancel.
The local token state is broken.

This makes recovery guidance incorrect and hides actual token-storage or token-shape failures behind a cancel semantic.

### Type

Inconsistency / same domain, different contract.

### Required Fix Direction

Split these meanings into distinct codes.

Minimum required separation:

- browser-auth cancellation/denial
- missing token state
- invalid token payload / decrypt failure

`ocr_activation_required` should not remain the catch-all code for all three.

Activation result mapping and renderer-facing alert mapping must preserve that separation.

## Problem 3: Credentials Validation Contract Conflicts With OAuth Client Construction

### Files

- [`electron/import_extract_platform/ocr_google_drive_bundled_credentials.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_bundled_credentials.js)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js)
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js)
- [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_disconnect_ipc.js)

### Identifiers

- `hasValidCredentialsShape(...)`
- `validateCredentialsFile(...)`
- `validateStoredCredentialsFile(...)`
- `buildGoogleOAuthClient(...)`

### Producer And Consumer Anchors

Producer anchors:

- [`electron/import_extract_platform/ocr_google_drive_bundled_credentials.js:47`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_bundled_credentials.js#L47)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js:57`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js#L57)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js:165`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js#L165)

Consumer anchors:

- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js:37`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js#L37)
- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js:49`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js#L49)
- [`electron/import_extract_platform/ocr_google_drive_route.js:385`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js#L385)
- [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js:160`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_disconnect_ipc.js#L160)

### What Overlaps

All credentials validators accept a credentials file if:

- `client_id` exists
- `client_secret` exists
- `redirect_uris` is an array
- at least one entry in `redirect_uris` is non-empty

But runtime OAuth client construction does not use that same rule.
It always selects `redirect_uris[0]`, even if the only non-empty URI is later in the array.

### Why This Is A Real Problem

The code can currently:

1. accept and materialize a credentials file as valid
2. report setup as valid
3. later build an OAuth client with an empty or unintended redirect URI

So the validation contract and the runtime-use contract are not the same contract.

### Type

Exact duplication plus same-domain contract drift.

### Required Fix Direction

Centralize the credentials-shape rule in one shared helper and make runtime construction follow the same canonical rule.

The final contract must answer one explicit question:

- which redirect URI is considered valid and authoritative for runtime use

If the first URI is required, validators must enforce that.
If any non-empty URI is acceptable, runtime must select the same one deterministically.

## Problem 4: Duplicate OCR Preflight Decision Path

### Files

- [`electron/import_extract_platform/import_extract_ocr_gate_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_gate_ipc.js)
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js)
- [`electron/preload.js`](c:\Users\manue\Documents\toT\tot\electron\preload.js)
- [`public/js/import_extract_entry.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_entry.js)

### Identifiers

- `classifyFileForOcr(...)`
- `mapValidationBlock(...)`
- `validateOcrSetup(...)`
- `prepareSelectedFile(...)`
- `evaluateImportExtractOcrGate`

### Producer And Consumer Anchors

Duplicate-path anchors:

- [`electron/import_extract_platform/import_extract_ocr_gate_ipc.js:46`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_gate_ipc.js#L46)
- [`electron/import_extract_platform/import_extract_ocr_gate_ipc.js:90`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_gate_ipc.js#L90)
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js:293`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js#L293)
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js:466`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js#L466)

Bridge and active-flow anchors:

- [`electron/preload.js:23`](c:\Users\manue\Documents\toT\tot\electron\preload.js#L23)
- [`electron/preload.js:27`](c:\Users\manue\Documents\toT\tot\electron\preload.js#L27)
- [`public/js/import_extract_entry.js:172`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_entry.js#L172)

### What Overlaps

There are two separate OCR preflight surfaces:

- `import-extract-evaluate-ocr-gate`
- the active `prepareImportExtractSelectedFile` path

Both own overlapping decisions about:

- OCR-eligible file types
- OCR setup validation
- alert mapping for blocked OCR use

### Why This Is A Real Problem

The repo currently exposes both bridges, but the active renderer path uses prepare, not gate.

That means one preflight policy surface is active and one is parallel/stale.
Even if the second path is not currently called, it is still exported and maintained as if it were part of the feature.

This is credible maintenance risk because any future caller can wire the stale path back into the product and get behavior that is not guaranteed to match the real prepare contract.

### Type

Repeated decision path / near-duplication.

### Evidence Status

Suspicion, not confirmed active conflict.

The duplication is real.
An active runtime mismatch is not proven from current consumers because there is no in-repo caller of `evaluateImportExtractOcrGate`.

### Required Fix Direction

Choose one preflight authority.

Allowed directions:

- remove the gate IPC entirely if prepare is the canonical path
- or rewrite the gate IPC as a strict thin adapter over the prepare-time authority with no duplicated classification or alert logic

But the repo should not continue carrying two independently evolving OCR preflight policies.

## Cross-Cutting Fix Requirements

Any implementation that fixes this issue should satisfy all of the following:

1. One canonical persisted-token-readiness contract exists.
2. One canonical token-failure taxonomy exists.
3. One canonical credentials-validation contract exists.
4. One canonical OCR preflight authority exists.
5. Activation, setup validation, runtime OCR, and disconnect all consume those same shared contracts.
6. Renderer-facing alert mapping does not collapse distinct failure meanings back into one misleading code path.

## Recommended Work Order

1. Freeze and centralize the shared token contract.
2. Split token-state failure codes from user-cancel codes.
3. Centralize credentials validation and redirect-URI selection.
4. Remove or collapse the duplicate gate path.
5. Re-check every producer and consumer in:
   - activation
   - setup validation
   - OCR runtime route
   - disconnect
   - prepare/execute orchestration

## Acceptance Criteria

- A refresh-only token cannot be simultaneously “persisted successfully” and “not ready by contract” unless that distinction is explicitly modeled and shared everywhere.
- Browser-auth cancellation is not reported through the same code path as broken local token state.
- Credentials acceptance and OAuth client construction follow one shared redirect-URI rule.
- There is only one maintained OCR preflight policy surface, or any secondary surface is a strict adapter with no duplicated decision logic.
- The final code makes it possible to answer, from one place each:
  - what a valid OCR token state is
  - what activation cancellation means
  - what a valid credentials file is
  - what determines OCR preflight readiness

## Strongest Active Conflicts From Code Alone

These are the items already strong enough to prove a real active contract or behavior conflict without external assumptions:

1. refresh-only token contract drift
2. overloaded `ocr_activation_required`
3. credentials validation versus runtime redirect-URI selection

The duplicate gate path is still important, but it is included as a maintenance-risk issue rather than a proven active conflict.
