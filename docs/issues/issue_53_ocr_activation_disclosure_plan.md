# Issue 53 OCR Activation Disclosure Plan

Linked issue: `docs/issues/issue_53.md`  
Linked implementation plan: `docs/issues/issue_53_implementation_plan.md`  
Linked compliance note: `docs/issues/issue_53_section8_google_compliance.md`

## Purpose

Freeze the implementation contract for the pre-consent Google OCR activation modal based on the current codebase, not on intended architecture.

This document records:

- what the current activation flow actually does
- which code surfaces are currently involved
- which changes are required to insert the disclosure modal correctly
- the architecture constraints already agreed with the user

## Current code: actual activation path

### A. Recovery entry from import/extract

The OCR activation flow is not started from a standalone settings screen. It is currently triggered only as recovery from a failed OCR prepare path.

Current path:

- `public/js/import_extract_entry.js`
- `public/renderer.js`
- `public/js/import_extract_ocr_activation_recovery.js`

Observed current behavior:

1. `ImportExtractEntry.runSharedFlow(...)` prepares the selected file.
2. If prepare returns `ok: true` plus `prepareFailed: true`, the renderer calls `maybeRecoverImportExtractOcrSetupAndRetry(...)` from `public/renderer.js`.
3. That function delegates to `window.ImportExtractOcrActivationRecovery.recoverAfterSetupFailure(...)`.

### B. Current recovery conditions

Current recoverable OCR setup/auth codes in `public/js/import_extract_ocr_activation_recovery.js` are:

- `setup_incomplete`
- `ocr_activation_required`
- `auth_failed`

So, as of now, the renderer may attempt OCR activation recovery for any of those three prepare-failure codes.

### C. Current renderer-side activation behavior

Current behavior in `public/js/import_extract_ocr_activation_recovery.js`:

- resolves `activateImportExtractOcr` from preload
- emits `renderer.alerts.import_extract_ocr_activation_starting`
- immediately invokes `activateImportExtractOcr(...)`
- on success, emits success alert and retries prepare
- on failure, emits the returned `alertKey` or a generic activation-failed alert

Important current fact:

- the current renderer recovery flow has no intermediate disclosure step between “recovery decided to activate” and “main process may open the browser”

### D. Current preload bridge

Current preload surface in `electron/preload.js`:

- `activateImportExtractOcr: (payload) => ipcRenderer.invoke('import-extract-activate-ocr', payload)`

So the current renderer has exactly one OCR-activation IPC entrypoint.

### E. Current main-process activation behavior

Current activation handler:

- `electron/import_extract_platform/import_extract_ocr_activation_ipc.js`
- IPC channel: `import-extract-activate-ocr`

Observed current behavior inside that single handler:

1. authorize sender
2. resolve `credentialsPath` and `tokenPath`
3. if `credentials.json` is missing:
   - optionally use `payload.credentialsSourcePath`
   - otherwise open a native file picker
   - validate/import the selected credentials file
4. call `authenticate(...)` from `@google-cloud/local-auth`
5. serialize returned credentials
6. persist the token with `writeEncryptedTokenFile(...)`
7. run `validateGoogleDriveOcrSetup(...)`
8. return a structured activation result

Important current fact:

- credentials readiness and browser-launch OAuth are currently one indivisible IPC action

### F. Current auth-cancel behavior

Current OAuth/browser-side cancel-or-deny handling in `electron/import_extract_platform/import_extract_ocr_activation_ipc.js`:

- `mapAuthenticateError(...)` maps cancel/denied/consent-style failures to:
  - `state: 'ocr_activation_required'`
  - `code: 'ocr_activation_required'`
  - `alertKey: 'renderer.alerts.import_extract_ocr_activation_cancelled'`

Important current fact:

- browser-auth cancellation currently reuses the `ocr_activation_required` code path and surfaces `import_extract_ocr_activation_cancelled`

This matters because pre-consent modal decline must not be folded into that same path.

## Current code: surrounding surfaces that the new modal must fit

### Existing main-window modals

Current modal DOM in `public/index.html`:

- `infoModal`
- `importExtractRouteModal`
- `importExtractApplyModal`

Current modal logic modules:

- `public/js/import_extract_route_choice_modal.js`
- `public/js/import_extract_apply_modal.js`

Current blocking-modal guard in `public/renderer.js`:

- `hasBlockingMainWindowModalOpen()` checks only:
  - `infoModal`
  - `importExtractRouteModal`
  - `importExtractApplyModal`

Important current fact:

- a new OCR activation disclosure modal will need both:
  - new DOM in `public/index.html`
  - inclusion in `hasBlockingMainWindowModalOpen()`

### Current docs-opening surfaces

Current direct app-doc IPC in `electron/link_openers.js` / `electron/preload.js`:

- `openAppDoc('privacy-policy')`

Current in-app manual/help surface in `public/renderer.js`:

- `showInfoModal('instrucciones')`
- `showInfoModal('guia_basica')`
- `showInfoModal('faq')`

Important current fact:

- direct IPC currently supports opening the privacy policy, but not the instructions/help HTML as an `openAppDoc(...)` key
- instructions/help are currently shown through the renderer info-modal path, not through the app-doc IPC

### Current i18n footprint for activation-starting disclosure

Current `import_extract_ocr_activation_starting` strings exist in:

- `i18n/en/renderer.json`
- `i18n/es/renderer.json`
- `i18n/de/renderer.json`
- `i18n/fr/renderer.json`
- `i18n/it/renderer.json`
- `i18n/pt/renderer.json`

Current `import_extract_ocr_activation_cancelled` strings also exist in those renderer locale files.

Important current fact:

- removing the current starting-alert path is not only an EN/ES change

## Agreed target behavior

The following decisions were explicitly agreed with the user:

### 1. Trigger point

- The disclosure modal must appear only when a fresh Google OAuth browser flow is about to launch.
- It must not appear earlier in the recovery chain.
- It must not appear during ordinary OCR use when OCR is already connected.
- Credentials import/setup, if needed, must happen before the disclosure modal.

### 2. Persistence

- Acceptance must not be persisted across future reconnect attempts.
- The modal must appear for each fresh OAuth activation launch.
- The modal must not appear when no new OAuth launch is needed.

### 3. UI form

- The disclosure must be a renderer modal.

### 4. Button semantics

- Primary button: proceed to Google activation
- Secondary button: cancel
- There must be a direct link to privacy/help documentation.
- The required link target for this implementation is:
  - `openAppDoc('privacy-policy')`
- Reusing the renderer info-modal manual/help surface is optional future enhancement, not part of the required contract for this slice.

### 5. Cancel semantics

- Cancelling the disclosure modal must stop the flow cleanly.
- Modal decline is not `auth_failed`.
- Modal decline must not produce a noisy failure alert.
- Modal-decline result contract is frozen as:
  - `ok: false`
  - `cancelled: true`
  - `code: 'ocr_activation_disclosure_declined'`
  - `alertKey: ''`
- Renderer handling contract:
  - if `cancelled === true`, return quietly
  - do not emit a toast
  - do not fall back to `renderer.alerts.import_extract_ocr_activation_failed`
  - do not reuse `renderer.alerts.import_extract_ocr_activation_cancelled`

### 6. Replace, do not stack

- The current activation-starting alert must be removed and replaced.
- The modal must not be added on top of that alert.

## Consequences from the current code

Based on the current code, the feature cannot be implemented correctly by only inserting a modal into the existing renderer recovery module.

The code changes required by the current architecture are:

### 1. Split the current single activation IPC shape

Because `electron/import_extract_platform/import_extract_ocr_activation_ipc.js` currently performs both:

- credentials readiness
- OAuth browser launch

the implementation needs a split between:

- a credentials-readiness step
- an OAuth-launch step

Without that split, the disclosure modal cannot be placed at the agreed point: immediately before browser launch, but after credentials readiness.

Public activation boundary to implement:

- replace the current single renderer-facing activation bridge with two explicit methods:
  - `prepareImportExtractOcrActivation`
  - `launchImportExtractOcrActivation`

Frozen responsibilities:

- `prepareImportExtractOcrActivation`
  - authorize sender
  - resolve runtime paths
  - ensure/import `credentials.json`
  - return readiness result only
  - must never open the browser
  - return contract:
    - success:
      - `ok: true`
      - `ready: true`
      - `code: ''`
      - `alertKey: ''`
      - `detailsSafeForLogs`
    - failure:
      - `ok: false`
      - `ready: false`
      - `code`
      - `alertKey`
      - `detailsSafeForLogs`
  - failure taxonomy contract:
    - preserve current setup-related behavior for:
      - unauthorized sender
      - missing runtime paths
      - credentials picker cancelled
      - invalid credentials file
      - credentials import failure
  - on successful credentials import during prepare:
    - returning `detailsSafeForLogs.importedCredentials: true` is allowed and preferred

- `launchImportExtractOcrActivation`
  - authorize sender
  - run `authenticate(...)`
  - persist token state
  - validate setup
  - return activation success/failure result

Renderer orchestration contract:

1. call `prepareImportExtractOcrActivation`
2. if readiness succeeds, show the disclosure modal
3. if the user accepts, call `launchImportExtractOcrActivation`
4. if activation succeeds, retry the original OCR prepare flow

### 2. Update renderer recovery orchestration

Because `public/js/import_extract_ocr_activation_recovery.js` currently:

- emits the starting alert
- then immediately calls the one-step activation IPC

the renderer recovery flow must change to:

1. complete credentials readiness
2. show disclosure modal
3. only on acceptance, invoke the OAuth-launch step
4. preserve retry-after-success behavior

### 3. Add a new modal surface to the main window

Because current modal infrastructure already exists in `public/index.html` plus focused modal modules under `public/js/`, the new disclosure modal should fit that pattern:

- add new modal DOM to `public/index.html`
- add a focused renderer module under `public/js/`
- add the modal to `hasBlockingMainWindowModalOpen()` in `public/renderer.js`

### 4. Choose a docs-link path using current surfaces

Because current code already supports:

- direct privacy-policy opening through `openAppDoc('privacy-policy')`
- instructions/help through the renderer info modal

the required implementation path is:

- use direct privacy-policy opening through `openAppDoc('privacy-policy')`

The renderer info-modal manual/help surface may be reused later, but it is not required for this implementation.

## Required removals and replacements

This section records what must be removed or replaced based on the current code, not on desired architecture.

### Renderer-side removals/replacements

- Remove the current toast dispatch in `public/js/import_extract_ocr_activation_recovery.js`:
  - `safeNotify(notifyMain, 'renderer.alerts.import_extract_ocr_activation_starting')`
- Replace the current immediate jump from recovery into `activateImportExtractOcr(...)` with renderer orchestration that:
  - calls `prepareImportExtractOcrActivation`
  - shows the disclosure modal only after readiness succeeds
  - calls `launchImportExtractOcrActivation` only after user acceptance

### Main-process removals/replacements

- Replace the current one-step activation shape in `electron/import_extract_platform/import_extract_ocr_activation_ipc.js` where:
  - credentials import/readiness
  - and `authenticate(...)`
  are still performed by one indivisible IPC action.
- Replace the single current renderer-facing activation bridge:
  - `activateImportExtractOcr`
  with:
  - `prepareImportExtractOcrActivation`
  - `launchImportExtractOcrActivation`

### i18n removals/replacements

- Remove `import_extract_ocr_activation_starting` from every renderer locale file that currently defines it.
- Do not reuse `import_extract_ocr_activation_cancelled` for pre-consent modal decline.
- Add modal-specific renderer i18n for:
  - title/body copy
  - proceed button
  - cancel button
  - privacy-policy link label

### Semantic removals/replacements

- Remove the current assumption that all user-declined activation paths can be modeled as browser-auth cancellation.
- Add a distinct pre-consent decline path.
- Do not add a second confirmation/alert immediately before browser launch.

## Architecture constraints

The user explicitly requested that this work avoid inflating:

- `electron/main.js`
- `public/renderer.js`

That constraint is part of the implementation contract.

### Main-process constraint

- `electron/main.js` should remain only a registration/orchestration surface.
- New activation-disclosure logic should live under `electron/import_extract_platform/`.
- If activation code becomes broader, prefer:
  - extracting helpers
  - or adding a focused sibling module
  instead of growing `electron/main.js`.

### Renderer constraint

- `public/renderer.js` should remain only a wiring/configuration surface.
- New modal logic should live in a focused `public/js/...` module.
- If disclosure orchestration becomes broader than the current recovery helper, prefer:
  - a focused sibling module
  - or a refactor that keeps `public/js/import_extract_ocr_activation_recovery.js` small
  instead of embedding modal logic into `public/renderer.js`.

## Implementation shape to follow

This is the agreed target shape, stated in terms of the current code:

### Phase 1. Credentials readiness

Use current activation logic to ensure:

- `credentials.json` exists and is valid

before any disclosure modal is shown.

If credentials import/pick fails or is cancelled:

- keep current setup-related failure behavior
- do not show the disclosure modal
- `prepareImportExtractOcrActivation` return contract is:
  - success:
    - `ok: true`
    - `ready: true`
    - `code: ''`
    - `alertKey: ''`
    - `detailsSafeForLogs`
  - failure:
    - `ok: false`
    - `ready: false`
    - `code`
    - `alertKey`
    - `detailsSafeForLogs`

### Phase 2. Disclosure modal

Show a renderer modal only after credentials readiness is complete and immediately before a fresh OAuth browser launch.

The modal copy must state only behavior that the current app actually implements:

- Google services are used for OCR
- only user-selected files are sent
- local `credentials.json` and local token state are stored in the app instance
- the app attempts remote cleanup of the temporary Google document after export
- users can later disconnect via `Preferences > Disconnect Google OCR`
- the required docs link opens `privacy-policy` through the existing app-doc bridge

### Phase 3. OAuth browser launch

Only after explicit modal acceptance:

- run `launchImportExtractOcrActivation`

### Phase 4. Result handling

- success stays compatible with the current retry-after-activation behavior
- pre-consent modal decline is quiet and distinct
- real browser/auth/runtime failures keep explicit failure handling
- modal-decline result shape is:
  - `ok: false`
  - `cancelled: true`
  - `code: 'ocr_activation_disclosure_declined'`
  - `alertKey: ''`

## Acceptance criteria

- OCR activation no longer relies on `import_extract_ocr_activation_starting`.
- The app presents a renderer modal immediately before a fresh Google OAuth browser launch.
- The modal is not shown before credentials readiness is complete.
- The modal is not shown during ordinary OCR use when OCR is already connected.
- The modal is shown again after disconnect if the user later reconnects.
- Cancelling the modal does not open the browser.
- Cancelling the modal does not surface as `auth_failed`.
- Pre-consent modal decline does not reuse `import_extract_ocr_activation_cancelled`.
- Pre-consent modal decline returns:
  - `ok: false`
  - `cancelled: true`
  - `code: 'ocr_activation_disclosure_declined'`
  - `alertKey: ''`
- The implementation removes the current starting-alert strings from all renderer locales that currently define them.
- The implementation replaces the single current renderer-facing activation bridge with:
  - `prepareImportExtractOcrActivation`
  - `launchImportExtractOcrActivation`
- The implementation does not materially inflate `electron/main.js` or `public/renderer.js`.

## Manual verification checklist

1. Missing credentials path
- start OCR activation with no local `credentials.json`
- credentials picker/import runs first
- disclosure modal does not appear before credentials are ready
- disclosure modal appears only after credentials readiness succeeds

2. Modal decline path
- disclosure modal opens
- click cancel
- browser does not open
- no noisy failure alert appears
- result is handled as `cancelled === true`, not as auth failure

3. Healthy activation path
- `prepareImportExtractOcrActivation` completes first
- disclosure modal opens
- click proceed
- `launchImportExtractOcrActivation` runs
- browser opens
- complete auth
- token persists and OCR activation succeeds
- prepare is retried successfully

4. Browser-auth cancellation path
- disclosure modal opens
- click proceed
- browser opens
- user cancels/denies in the browser flow
- this continues to use the browser-auth cancellation path, distinct from modal decline

5. Reconnect path
- disconnect Google OCR
- start activation again
- disclosure modal appears again

6. Already connected path
- OCR already connected
- ordinary OCR use does not show the disclosure modal

## Non-goals

- Do not change OCR substrate.
- Do not widen OAuth scopes.
- Do not replace system-browser OAuth with embedded/webview auth.
- Do not redesign Preferences or create a general settings framework as part of this task.
- Do not treat this modal as a substitute for Google-side consent or public OAuth verification requirements.
