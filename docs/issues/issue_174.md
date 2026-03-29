# Google OCR Contract Overlap Conflicts

## Summary

This issue captures only meaningful overlap problems found in code around Google Drive OCR, activation, setup, and the import/extract route pipeline.

It excludes harmless duplication, stylistic repetition, and speculative cleanup.

The current code shows:

- no confirmed active contract/behavior conflicts remaining from the original findings
- three resolved overlap/behavior records retained here as closure records
- one bounded suspicion where duplicated provider-failure classification is likely to drift further

## Scope

This issue covers:

- Google Drive OCR setup state
- Google OAuth credentials validation and consumption
- OCR activation and disconnect flows
- import/extract prepare and execute route contracts
- related file-selection boundaries where the route contract is consumed

This issue does not cover:

- documentation drift
- translation copy cleanup by itself
- harmless helper duplication
- general refactors without a concrete contract problem

## Closure Records

### 1. `setup_incomplete` overload removed from live OCR paths

Type:

- resolved overlap
- closure record

Files:

- [`electron/import_extract_platform/ocr_google_drive_provider_failure.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_provider_failure.js)
- [`electron/import_extract_platform/ocr_google_drive_activation_state.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_activation_state.js)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js)
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js)
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js)
- [`public/js/import_extract_ocr_activation_recovery.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_ocr_activation_recovery.js)

Identifiers:

- `resolveGoogleDriveOcrAvailability(...)`
- `parseGoogleProviderFailure(...)`
- `mapCodeToAlertKey(...)`
- `buildOcrPrepareFailure(...)`
- `resolvePrimaryAlertKey(...)`
- `classifyCommonFailure(...)`

Closure evidence:

- [`electron/import_extract_platform/ocr_google_drive_activation_state.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_activation_state.js) now emits `credentials_missing` for missing credentials and `ocr_activation_required` for missing token state; it no longer emits `setup_incomplete`.
- [`electron/import_extract_platform/ocr_google_drive_provider_failure.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_provider_failure.js) owns the shared provider parser/classifier and normalizes `accessNotConfigured`, `API_DISABLED`, and `SERVICE_DISABLED` into `provider_api_disabled`.
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js) uses the availability helper plus the shared provider parser, and its explicit `ERROR_SURFACE` includes `credentials_missing`, `credentials_invalid`, and `provider_api_disabled`.
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js) maps `credentials_missing` to the missing-credentials alert, `credentials_invalid` to the invalid-credentials alert, and `provider_api_disabled` to the generic OCR-unavailable alert.
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js) applies the same split during prepare-time and execute-time alert resolution.
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js) uses the shared provider parser and maps local credentials preflight failures explicitly to `credentials_missing` or `credentials_invalid`.
- [`public/js/import_extract_ocr_activation_recovery.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_ocr_activation_recovery.js) only treats `ocr_activation_required`, `ocr_token_state_invalid`, and `auth_failed` as recoverable activation flows.
- grep against current `electron`, `public/js`, and `i18n` code finds no live `setup_incomplete` references outside this issue document.

Why this closes the original problem:

- the old producer/consumer mismatch is gone
- missing local credentials and provider-disabled setup no longer share one ambiguous live status code
- activation, prepare, and execute now consume the replacement codes consistently enough that the original `setup_incomplete` overload is not an active conflict anymore

Residual note:

- the bounded suspicion below about duplicated provider-failure taxonomy remains a separate question
- that suspicion should not be promoted back into this closure record without new code evidence showing a live setup/execute mismatch for the same provider failure shape

### 2. OCR disconnect mixes a strict credentials contract with a token-centric revocation contract

Type:

- resolved overlap
- same domain, clarified contract

Files:

- [`electron/import_extract_platform/ocr_google_drive_credentials_file.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_credentials_file.js)
- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js)
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js)
- [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_disconnect_ipc.js)

Identifiers:

- `hasValidCredentialsShape(...)`
- `readGoogleOAuthCredentialsFile(...)`
- `buildGoogleOAuthClient(...)`
- `buildGoogleTokenRevocationClient(...)`
- `buildRevocationClient(...)`
- `selectPreferredRevocationToken(...)`

Producer anchors:

- [`electron/import_extract_platform/ocr_google_drive_credentials_file.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_credentials_file.js) is the shared strict validator and requires `client_id`, `client_secret`, and at least one non-empty `redirect_uris` entry.
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js) uses that strict validator before activation can proceed.
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js) uses that strict validator before setup validation can proceed.
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js) uses that strict validator before OCR execute can proceed.
- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js) now exposes `buildGoogleTokenRevocationClient(...)` as a token-only OAuth client builder for disconnect-time revocation.
- [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_disconnect_ipc.js) now reads the stored token, selects the revocation token, builds a token-only revocation client, revokes the token, and deletes the local encrypted token file.

Consumer anchors:

- activation prepare and launch consume the strict validator.
- setup validation consumes the strict validator.
- OCR execute consumes the strict validator.
- disconnect consumes the selected revocation token and no longer depends on a credentials-read path.

What changed exactly:

- activation, setup validation, and execute now share one strict credentials contract.
- disconnect now owns a separate explicit token-revocation contract.
- disconnect no longer reads or validates `credentials.json` as part of token revocation.
- the same local credentials domain is no longer represented by two disconnect-time implementations.

Why this closes problem 2:

- disconnect is now explicitly token-centric instead of mixing credential-shape handling with token revocation.
- credential-shape changes no longer need to stay aligned across a second disconnect-specific credentials path.
- a broken or missing credentials file no longer changes the disconnect contract; only token availability and token revocation outcome matter.

Hard evidence:

- [`electron/import_extract_platform/ocr_google_drive_credentials_file.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_credentials_file.js) rejects credentials unless `redirect_uris` contains at least one non-empty string.
- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js) exports `buildGoogleTokenRevocationClient(...)` and `selectPreferredRevocationToken(...)` for disconnect-time token revocation.
- [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_disconnect_ipc.js) imports `buildGoogleTokenRevocationClient(...)` instead of a credentials reader or credential-based OAuth client builder.
- [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_disconnect_ipc.js) requires `tokenPath` up front but does not require `credentialsPath` before disconnect can proceed.
- [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_disconnect_ipc.js) reads the encrypted token file, selects the preferred revocation token, builds the revocation client from token data, and deletes the local token file only after successful revocation.

Implemented fix:

- keep the strict credentials validator as the canonical local credentials contract for activation, setup validation, and execute.
- keep disconnect on an explicit token-revocation contract.
- remove the disconnect-side raw credentials parse / credential-based client branch.
- remove dead shared OAuth helper surface that only existed to support the old disconnect-side credentials path.

Closure requirements:

- disconnect must not read `credentials.json` during token revocation.
- disconnect must require only token-path availability and a revocable stored token before revocation can proceed.
- activation, setup validation, and execute must remain on the shared strict credentials validator.
- the shared OAuth helper surface must not retain dead raw-credentials reader code for disconnect.

Verification:

- grep confirms no live `readGoogleCredentialsFile(...)` usage remains in runtime code paths.
- disconnect still returns `not_connected` when the local token file is missing.
- disconnect can revoke and delete the local token without depending on a credentials-read path.
- activation, setup validation, and execute still consume the strict credentials validator independently of disconnect.

### 3. Native prepare/execute support mismatch removed from live import/extract flow

Type:

- resolved behavior conflict
- closure record

Files:

- [`electron/import_extract_platform/import_extract_supported_formats.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_supported_formats.js)
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js)
- [`electron/import_extract_platform/native_extraction_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\native_extraction_route.js)
- [`electron/import_extract_platform/import_extract_file_picker_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_file_picker_ipc.js)
- [`public/js/import_extract_drag_drop.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_drag_drop.js)

Identifiers:

- `getNativeParserForExt(...)`
- `getSupportedNativeExtensions(...)`
- `getSupportedOcrSourceExtensions(...)`
- `getFileInfo(...)`
- `prepareSelectedFile(...)`
- `resolveNonPdfNativePreparation(...)`
- `runNativeExtractionRoute(...)`

Closure evidence:

- [`electron/import_extract_platform/import_extract_supported_formats.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_supported_formats.js) now owns the shared native parser contract and the shared OCR-upload extension contract.
- [`electron/import_extract_platform/native_extraction_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\native_extraction_route.js) uses `getNativeParserForExt(...)` from that shared helper instead of keeping a separate execute-only extension truth.
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js) checks `getNativeParserForExt(...)` before native prepare and rejects unsupported non-image, non-PDF files during prepare with `unsupported_format`.
- the same prepare module now routes images to OCR, PDFs to the existing PDF triage, and only shared-helper-supported extensions to native execution.
- [`electron/import_extract_platform/import_extract_file_picker_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_file_picker_ipc.js) derives its supported extension list from `getSupportedNativeExtensions(...)` and `getSupportedOcrSourceExtensions(...)`.
- [`public/js/import_extract_drag_drop.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_drag_drop.js) still forwards dropped files, but correctness no longer depends on renderer-side filtering because prepare is now the authority.

Why this closes the original problem:

- prepare no longer advertises a native route for extensions that native execute will reject
- unsupported non-image, non-PDF files now fail at prepare instead of surviving into deterministic execute-time `unsupported_format` failures
- picker and drag/drop can still be broader UI entrypoints, but the main-process prepare gate is now the single correctness boundary

Verification already observed:

- `.docx` prepared and executed successfully on the native route
- unsupported `.doc` failed during prepare with `unsupported_format`, `availableRoutes: []`, and no execute start afterward
- `.jpg` still prepared and executed on the OCR route
- `.pdf` still followed the existing choice-required PDF triage and executed successfully on the chosen route

## Suspicion

### 4. Setup-time and execute-time Google API failure classifiers are duplicated and already structurally drifted

Type:

- near-duplication
- same domain, different contract

Files:

- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js)

Identifiers:

- `classifyApiFailure(...)`
- `classifyCommonFailure(...)`

Producer anchors:

- setup validation uses `classifyApiFailure(...)`
- OCR execute uses `classifyCommonFailure(...)`

Consumer anchors:

- activation and prepare consume setup-validation classifications
- runtime execute consumes route classifications

What overlaps exactly:

- both modules own the same Google provider-failure taxonomy locally
- they do not classify all inputs the same way

Why this is a credible maintenance risk:

- setup treats any non-empty string `networkErrorCode` as connectivity failure
- execute only treats a fixed network-code whitelist that way
- setup also collapses unknown `4xx` responses into `platform_runtime_failed`
- execute can fall through to stage-specific OCR conversion/export codes instead

Why this remains a suspicion instead of a confirmed active conflict:

- the code shows structural drift now
- but proving one exact provider error already surfaces differently in both paths would require a specific shared error shape reaching both code paths

## Current Status vs Suspicion

Confirmed active:

- none from the original findings

Resolved closure records:

- `setup_incomplete` overload removed from live OCR paths
- disconnect now has an explicit token-revocation contract
- native prepare/execute support mismatch removed from live import/extract flow

Suspicion:

- duplicated Google API failure taxonomy between setup validation and OCR execute

## Current Code Reading

- The original active conflicts captured by this issue are no longer live in current code.
- The only remaining live item under this issue is the bounded suspicion above about duplicated Google API failure classification between setup validation and OCR execute.
- That suspicion should stay bounded unless one concrete provider failure shape is shown to surface differently across both paths.

## Direction

The remaining live part of this issue is narrower:

- either unify setup-time and execute-time provider-failure classification
- or keep both classifiers with an explicit reason and a bounded, intentional behavioral difference

## Acceptance Criteria

- no regression reintroduces the retired `setup_incomplete` overload
- no regression lets prepare advertise a native route that execute rejects for the same file type
- any remaining duplicated provider-failure classifier is either unified or kept with an explicit reason and bounded difference

## Notes

- This issue is diagnosis-derived and intentionally excludes harmless duplication.
- Problems 1, 2, and 3 are retained above as closure records.
- The suspicion above should not be treated as a confirmed bug without further evidence.
