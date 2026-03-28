# Google OCR Contract Overlap Conflicts

## Summary

This issue captures only meaningful overlap problems found in code around Google Drive OCR, activation, setup, and the import/extract route pipeline.

It excludes harmless duplication, stylistic repetition, and speculative cleanup.

The current code shows:

- two direct active contract/behavior conflicts
- one confirmed maintenance-risk overlap with already-divergent rules
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

### 2. Google OAuth credentials validation is duplicated with different acceptance rules

Type:

- duplication
- same domain, different contract

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
- `readGoogleCredentialsFile(...)`
- `readJsonFile(...)`
- `buildGoogleOAuthClient(...)`
- `buildRevocationClient(...)`

Producer anchors:

- [`electron/import_extract_platform/ocr_google_drive_credentials_file.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_credentials_file.js) is the strict validator and requires a non-empty `redirect_uris` entry.
- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js) has its own raw reader and its own client builder.
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js) bypasses the strict validator and reads raw JSON directly before calling `buildGoogleOAuthClient(...)`.

Consumer anchors:

- setup validation and activation consume the strict validator
- OCR execute consumes raw JSON plus the OAuth client builder
- disconnect consumes another raw parse path and then falls back to a generic OAuth client if credential-based client construction fails

What overlaps exactly:

- the same credentials contract is validated and consumed by multiple local implementations
- those implementations do not require the same shape and do not fail the same way

Why this is a real problem:

- a credentials file can be rejected in setup/activation but still be accepted later by execute/disconnect paths
- the repo already has divergent rules around `redirect_uris`
- that means future credential-shape changes must be updated in several places or behavior will keep drifting

Hard evidence:

- [`electron/import_extract_platform/ocr_google_drive_credentials_file.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_credentials_file.js) requires at least one non-empty redirect URI
- [`electron/import_extract_platform/ocr_google_drive_oauth_client.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_oauth_client.js) accepts the first redirect URI if present, otherwise `''`
- [`electron/import_extract_platform/ocr_google_drive_route.js`](c:\Users\manue\Documents\toT\tot\electron\import_extract_platform\ocr_google_drive_route.js) does not use the strict validator before building the client

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

Confirmed:

- overloaded `setup_incomplete` meaning
- duplicated credentials contract with different acceptance rules
- prepare/execute native support mismatch

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

This issue should be resolved by making the shared contracts explicit and singular:

- one canonical code set for OCR setup/auth/provider failures
- one canonical credentials contract shared by activation, setup, execute, and disconnect
- one canonical native-route capability contract shared by picker, prepare, drag/drop, and execute
- one intentional decision on whether setup-time and execute-time provider-failure classification are truly shared or intentionally separate

## Acceptance Criteria

- local missing credentials and remote provider setup failure do not share one ambiguous status code
- OCR activation, prepare, and execute do not map the same failure code to conflicting user actions
- Google OAuth credentials are validated and consumed through one canonical contract
- prepare cannot advertise a native route that execute will reject for the same file type
- any remaining duplicated provider-failure classifier is either unified or kept with an explicit reason and bounded difference

## Notes

- This issue is diagnosis-derived and intentionally excludes harmless duplication.
- The suspicion above should not be treated as a confirmed bug without further evidence.
