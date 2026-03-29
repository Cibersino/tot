# Google OCR Contract Overlap Conflicts

## Summary

This issue captures only meaningful overlap problems found in code around Google Drive OCR, activation, setup, and the import/extract route pipeline.

It excludes harmless duplication, stylistic repetition, and speculative cleanup.

The current code shows:

- two direct active contract/behavior conflicts
- one resolved overlap retained here as a closure record
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

## Confirmed Problems

### 1. `setup_incomplete` is overloaded with incompatible meanings

Type:

- same domain, different contract
- active inconsistency

Files:

- [`electron/import_extract_platform/ocr_google_drive_provider_failure.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_provider_failure.js)
- [`electron/import_extract_platform/ocr_google_drive_activation_state.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_activation_state.js)
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js)
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js)
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js)
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js)

Identifiers:

- `resolveGoogleDriveOcrAvailability(...)`
- `classifyApiFailure(...)`
- `mapCodeToAlertKey(...)`
- `buildOcrPrepareFailure(...)`
- `resolvePrimaryAlertKey(...)`
- `classifyCommonFailure(...)`

Producer anchors:

- [`electron/import_extract_platform/ocr_google_drive_activation_state.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_activation_state.js) returns `setup_incomplete` when credentials are missing.
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js) also returns `setup_incomplete` when Google reports `accessNotConfigured` or `serviceDisabled`.
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js) independently classifies provider setup failures as `setup_incomplete`.

Consumer anchors:

- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js) maps both `setup_incomplete` and `credentials_missing` to `renderer.alerts.import_extract_ocr_setup_missing_credentials`.
- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js) treats the same setup area more generically in prepare and execute result mapping.

What overlaps exactly:

- one status code is being used for both local credential absence and remote Google API/project setup failure
- downstream consumers do not interpret that code the same way

Why this is a real problem:

- after activation, a remote provider setup failure can be surfaced as a local missing-credentials problem
- that gives the wrong remediation path
- the same failure domain is already shown differently depending on whether the caller is activation, prepare, or execute

Hard evidence:

- [`electron/import_extract_platform/ocr_google_drive_activation_state.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_activation_state.js) produces `setup_incomplete` for missing credentials
- [`electron/import_extract_platform/ocr_google_drive_setup_validation.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_setup_validation.js) produces `setup_incomplete` for provider-side API-not-configured conditions
- [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_ocr_activation_ipc.js) collapses that code into the missing-credentials alert

The current overload conflict is proven by code. But this issue does not by itself settle which exact Google provider signals should replace that overloaded code. Any provider-side replacement used in the fix must be based on documented or captured Google signals.

Because this problem crosses both internal contract behavior and user-facing alert/remediation behavior, any contract-level fix must remain consistent with the UI-facing outcome. Any UI-facing change introduced by the fix must also close its `en` and `es` i18n surface.

Follow the log policy of the `log.js` files.

The final fix must not leave dead code or unused contract/UI surface behind.

Any deviation from the plan must be recorded and explained.

Proposed plan:

**Contract Shape**
- Retire `setup_incomplete` as a live detailed code everywhere in problem-1 paths.
- Split failures into:
  - `credentials_missing`
  - `credentials_invalid`
  - `provider_api_disabled`
- Keep these existing real/operative codes unchanged:
  - `ocr_activation_required`
  - `ocr_token_state_invalid`
  - `auth_failed`
  - `connectivity_failed`
  - `quota_or_rate_limited`
- Do not keep `setup_incomplete` as a fallback state bucket.

**Provider Boundary**
- One shared parser/classifier for setup validation and execute.
- It must read both documented Google shapes:
  - `error.errors[].reason`
  - `error.details[]` `google.rpc.ErrorInfo.reason`
- Use neutral names:
  - `errorsReason`
  - `errorInfoReason`
- It must recognize:
  - `accessNotConfigured`
  - `API_DISABLED`
  - `SERVICE_DISABLED`
- Do not include `serviceDisabled` without captured evidence.
- If both `errorsReason` and `errorInfoReason` are present:
  - if structured `errorInfoReason` is a recognized provider-disabled signal, prefer that classification
  - otherwise, if legacy `errorsReason` is recognized and structured is empty or unrecognized, use the legacy classification
  - preserve both raw fields for diagnostics and log the mismatch once
  - fall back to a generic provider/runtime failure only when neither side yields a recognized actionable category

**Implementation**
1. [ocr_google_drive_provider_failure.js](/c:/Users/manue/Documents/toT/tot/electron/import_extract_platform/ocr_google_drive_provider_failure.js)
- own the shared parser/classifier for `errorsReason` + `errorInfoReason`
- recognize documented provider-disabled signals and expose one normalized provider-disabled category without opening extra dead surface

2. [ocr_google_drive_activation_state.js](/c:/Users/manue/Documents/toT/tot/electron/import_extract_platform/ocr_google_drive_activation_state.js)
- missing credentials -> `credentials_missing`

3. [import_extract_ocr_activation_ipc.js](/c:/Users/manue/Documents/toT/tot/electron/import_extract_platform/import_extract_ocr_activation_ipc.js)
- `missing_file` -> `credentials_missing`
- invalid/read/shape failures -> `credentials_invalid`
- alert mapping:
  - `credentials_missing` -> missing alert
  - `credentials_invalid` -> invalid alert
  - `provider_api_disabled` -> generic OCR unavailable
- remove `setup_incomplete`

4. [ocr_google_drive_setup_validation.js](/c:/Users/manue/Documents/toT/tot/electron/import_extract_platform/ocr_google_drive_setup_validation.js)
- use the shared provider parser
- provider-disabled probe result -> `provider_api_disabled`
- conflicting provider signals must not discard a recognized actionable provider-disabled classification
- local credentials failures -> `credentials_missing` / `credentials_invalid`
- remove `ERROR_SURFACE.setup_incomplete`
- add explicit `ERROR_SURFACE` entries for:
  - `credentials_invalid`
  - `provider_api_disabled`
- ensure no emitted code falls through to `unknown`
- remove `state: 'setup_incomplete'`
- remove dead validator-facing message/action/fallback surface if there is no live consumer

5. [ocr_google_drive_route.js](/c:/Users/manue/Documents/toT/tot/electron/import_extract_platform/ocr_google_drive_route.js)
- use the shared provider parser
- provider-disabled execute failures -> `provider_api_disabled`
- conflicting provider signals must not discard a recognized actionable provider-disabled classification
- local credentials preflight failure -> `credentials_missing` / `credentials_invalid`
- use the shared credentials reader so local mapping matches setup/activation

6. [import_extract_prepare_execute_core.js](/c:/Users/manue/Documents/toT/tot/electron/import_extract_platform/import_extract_prepare_execute_core.js)
- remove `setup_incomplete` handling
- map:
  - `credentials_missing` -> missing alert
  - `credentials_invalid` -> invalid alert
  - `provider_api_disabled` -> generic OCR unavailable
- leave:
  - `auth_failed`
  - `connectivity_failed`
  - `quota_or_rate_limited`
  as they are

7. [import_extract_ocr_activation_recovery.js](/c:/Users/manue/Documents/toT/tot/public/js/import_extract_ocr_activation_recovery.js)
- stop using `setup_incomplete`
- recoverable set:
  - `ocr_activation_required`
  - `ocr_token_state_invalid`
  - `auth_failed`
- do not treat local credentials failures or provider-disabled failures as recoverable activation flows

**Closure Requirements**
- No new renderer alert keys.
- Reuse existing:
  - missing credentials
  - invalid credentials
  - generic OCR unavailable
- Do not leave dead validator-facing `userMessageKey`, `userActionKey`, `userMessageFallback`, or `issueType` surface behind when the live flow routes by `error.code`.
- No emitted validator code may degrade to `unknown`.

**Verification**
- shared provider parser tests:
  - `accessNotConfigured`
  - `API_DISABLED`
  - `SERVICE_DISABLED`
  - matching `errorsReason` + `errorInfoReason`
  - `errorsReason=rateLimitExceeded`, `errorInfoReason=API_DISABLED`
  - `errorsReason=unknown_legacy_reason`, `errorInfoReason=SERVICE_DISABLED`
  - `errorsReason=accessNotConfigured`, `errorInfoReason=API_DISABLED`
- validator-surface test:
  every emitted validation code has an explicit `ERROR_SURFACE`
- mapping checks:
  - local invalid -> invalid alert
  - provider disabled -> generic OCR unavailable
  - recognized provider-disabled signals do not degrade to `platform_runtime_failed` only because both raw fields are present
- grep confirms no live `setup_incomplete` branches remain in problem-1 paths

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

### 3. Prepare-time native-route eligibility is broader than execute-time native-route support

Type:

- same domain, different contract
- active behavior conflict

Files:

- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js)
- [`electron/import_extract_platform/native_extraction_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\native_extraction_route.js)
- [`electron/import_extract_platform/import_extract_file_picker_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_file_picker_ipc.js)
- [`public/js/import_extract_drag_drop.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_drag_drop.js)

Identifiers:

- `getFileInfo(...)`
- `prepareSelectedFile(...)`
- `resolveNonPdfNativePreparation(...)`
- `NATIVE_PARSER_BY_EXT`
- `runNativeExtractionRoute(...)`

Producer anchors:

- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js) classifies every non-PDF, non-image file as `text_document`
- the same module then routes all such files into native preparation

Consumer anchors:

- [`electron/import_extract_platform/native_extraction_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\native_extraction_route.js) supports only `.txt`, `.md`, `.html`, `.htm`, `.docx`, and `.pdf`
- [`electron/import_extract_platform/import_extract_file_picker_ipc.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_file_picker_ipc.js) narrows the common picker path, but its `All files` option still allows unsupported extensions
- [`public/js/import_extract_drag_drop.js`](c:\Users\manue\Documents\toT\tot\public\js\import_extract_drag_drop.js) forwards dropped files without extension filtering

What overlaps exactly:

- prepare owns one notion of “native-capable non-image file”
- execute owns a narrower extension-level notion of “native-capable file”

Why this is a real problem:

- a file can prepare successfully for native extraction and then deterministically fail at execute with `unsupported_format`
- that is not just maintenance drift; it is a visible route-contract mismatch

Hard evidence:

- [`electron/import_extract_platform/import_extract_prepare_execute_core.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\import_extract_prepare_execute_core.js) routes every non-image, non-PDF file to native preparation
- [`electron/import_extract_platform/native_extraction_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\native_extraction_route.js) rejects unsupported extensions during execution

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

## Confirmed Problems vs Suspicion

Confirmed active:

- overloaded `setup_incomplete` meaning
- prepare/execute native support mismatch

Resolved closure record:

- disconnect now has an explicit token-revocation contract

Suspicion:

- duplicated Google API failure taxonomy between setup validation and OCR execute

## Strong Active Conflicts From Code Alone

### 1. Active conflict: `setup_incomplete` means different things but is surfaced as one local-credentials alert in activation

This is already sufficient from code alone to show a real contract conflict.

One producer means:

- missing local credentials

Another producer means:

- remote Google API/project setup disabled

But activation consumes both as:

- `renderer.alerts.import_extract_ocr_setup_missing_credentials`

That is a concrete producer/consumer mismatch, not a hypothetical one.

### 2. Active conflict: native prepare can succeed for files that native execute will always reject

This is also sufficient from code alone to show a real behavior conflict.

Prepare says:

- any non-image, non-PDF file is native-preparable

Execute says:

- only a fixed extension list is native-executable

So the route contract is internally inconsistent before any external assumption is needed.

## Direction

The remaining live parts of this issue should be resolved by making the shared contracts explicit and singular:

- one canonical code set for OCR setup/auth/provider failures
- one canonical native-route capability contract shared by picker, prepare, drag/drop, and execute
- one intentional decision on whether setup-time and execute-time provider-failure classification are truly shared or intentionally separate

## Acceptance Criteria

- local missing credentials and remote provider setup failure do not share one ambiguous status code
- OCR activation, prepare, and execute do not map the same failure code to conflicting user actions
- prepare cannot advertise a native route that execute will reject for the same file type
- any remaining duplicated provider-failure classifier is either unified or kept with an explicit reason and bounded difference

## Notes

- This issue is diagnosis-derived and intentionally excludes harmless duplication.
- Problem 2 is retained above as a closure record; its closure requirements are already satisfied in current code.
- The suspicion above should not be treated as a confirmed bug without further evidence.
