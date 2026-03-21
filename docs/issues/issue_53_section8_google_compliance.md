**Title**

Close Google OAuth / API policy compliance gaps for OCR activation and release posture

**Body**

## Summary

Issue 53 introduced a Google-connected OCR route based on Google Drive OCR via Google Docs conversion.

This issue is about separate provider-side obligations that come from using Google OAuth and Google APIs in the distributed app.

The current repo state is now materially aligned, but not fully closed:

- the app uses a minimum practical scope
- the app uses system-browser OAuth
- the app now presents an explicit in-app OCR activation disclosure immediately before Google consent
- the app has a real disconnect / local token-removal path
- privacy/help text documents Google-connected OCR behavior, local token state, disconnect behavior, and Google Account-side revocation fallback

The remaining concrete gaps are now narrower:

- public-release OAuth verification requirements still need explicit release-facing documentation
- final reconciliation back into Issue 53 Section 8 / Section 9 closeout is still pending

## Why

These obligations are easy to miss because they are not the same as package-license obligations.

If this is left vague, the repo risks shipping a Google-connected feature with:

- weak or non-compliant activation disclosure
- incomplete user-help coverage for managing/deleting locally stored Google auth state
- release confusion about what is required before public distribution

This issue should close that gap deliberately and with official Google-source grounding.

## Status snapshot

- [x] Provider-policy baseline confirmed and frozen from official Google sources.
- [x] Current OCR activation flow and affected user-facing surfaces inventoried.
- [x] Disconnect / local token-removal minimum implemented and documented.
- [x] Activation-consent UX fix implemented.
- [x] User-facing privacy/help/setup gap materially closed.
- [ ] Release-posture documentation gap closed.
- [ ] Work fully reconciled back into Issue 53 closeout / Section 9 release blockers.

## Confirmed current repo state

### Already aligned

- Minimum scope is currently limited to `drive.file` in [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js).
- The app uses desktop/system-browser OAuth flow through `@google-cloud/local-auth`, not an embedded auth webview, in [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js).
- OCR activation now uses an explicit pre-consent disclosure step immediately before OAuth launch:
  - split activation bridge in [`electron/import_extract_platform/import_extract_ocr_activation_ipc.js`](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js)
  - renderer disclosure modal in [`public/js/import_extract_ocr_activation_disclosure_modal.js`](../../public/js/import_extract_ocr_activation_disclosure_modal.js)
  - renderer recovery orchestration in [`public/js/import_extract_ocr_activation_recovery.js`](../../public/js/import_extract_ocr_activation_recovery.js)
- The OCR route explicitly uploads the selected file to Google, exports text, and attempts remote cleanup of the temporary converted Google document in [`electron/import_extract_platform/ocr_google_drive_route.js`](../../electron/import_extract_platform/ocr_google_drive_route.js).
- The app has an explicit disconnect path that revokes the saved Google token and removes the local OCR token state while preserving `credentials.json`:
  - runtime path in [`electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js`](../../electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js)
  - user-facing trigger wording in [`public/info/acerca_de.html`](../../public/info/acerca_de.html), [`public/info/instrucciones.en.html`](../../public/info/instrucciones.en.html), [`public/info/instrucciones.es.html`](../../public/info/instrucciones.es.html), and [`PRIVACY.md`](../../PRIVACY.md)
- The app privacy/help text already states that OCR uses Google, only user-selected OCR files are sent, activation opens the system browser, and temporary Google cleanup is attempted:
  - [`PRIVACY.md`](../../PRIVACY.md)
  - [`public/info/acerca_de.html`](../../public/info/acerca_de.html)
  - [`public/info/instrucciones.en.html`](../../public/info/instrucciones.en.html)
  - [`public/info/instrucciones.es.html`](../../public/info/instrucciones.es.html)

### Remaining gap

- The repo still does not have an explicit release-facing document that records:
  - `drive.file` as the locked scope baseline for this OCR model
  - system-browser OAuth as the locked auth direction
  - that public homepage/privacy-policy verification material is still required before public release
  - that local in-app privacy/help pages are not sufficient for Google OAuth public verification by themselves
- The work is only partially reconciled back into Issue 53 closeout:
  - the tracker reflects the current state
  - Section 8 item 5 / item 6 in [`docs/issues/issue_53_implementation_plan.md`](./issue_53_implementation_plan.md) are still pending
  - remaining public-release-only blockers still need to be isolated explicitly under Section 9.5

## Official source basis

### 1. Minimum scope / verification burden

Google Drive scope guidance says apps should request the narrowest scope possible, and `drive.file` is the recommended per-file scope for many file-based workflows.

Source:
- Google Drive API scope guidance:
  - https://developers.google.com/workspace/drive/api/guides/api-specific-auth

Implication for this app:

- keeping the current `drive.file` baseline is correct
- this issue must not widen scopes unless separately justified

### 2. In-app disclosure requirement

Google API Services User Data Policy requires a prominent in-app disclosure that is presented in normal use, not buried only in a privacy policy, and that accompanies and immediately precedes the request for user consent.

Source:
- Google API Services User Data Policy:
  - https://developers.google.com/terms/api-services-user-data-policy

Implication for this app:

- `PRIVACY.md` and About/help text are useful, but not sufficient by themselves
- a transient toast before launching OAuth is too weak
- the app should use a deliberate pre-consent OCR activation dialog/modal with explicit user action

### 3. User help for managing and deleting data

Google Workspace API developer policy requires user-facing help documentation that explains how users can manage and delete their data from the app.

Source:
- Google Workspace API User Data and Developer Policy:
  - https://developers.google.com/workspace/workspace-api-user-data-developer-policy

Implication for this app:

- minimum you should have:
  - a real user-facing path to remove local OCR token state
  - docs explaining that path
  - docs explaining Google Account-side removal/revocation
- best implementation:
  - an in-app Disconnect Google OCR action that revokes the token and deletes the local token file
  - plus docs pointing to Google Account access removal as the external fallback/control

### 4. Public release / verification posture

Google OAuth production-readiness guidance and brand-verification guidance require accurate app identity and public-facing verification material for production/public distribution, including homepage/privacy-policy expectations.

Sources:
- OAuth 2.0 Policies:
  - https://developers.google.com/identity/protocols/oauth2/policies
- Brand verification:
  - https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification

Implication for this app:

- local in-app docs are not the same thing as the public URLs expected for Google OAuth verification
- before public release, the release checklist must explicitly account for homepage/privacy-policy verification posture
- this must be treated as release gating, not as an afterthought

### 5. System-browser auth direction

Google’s OAuth guidance for installed apps rejects old embedded/OOB-style approaches and supports browser-based flows instead.

Source:
- OOB migration / installed-app guidance context:
  - https://developers.google.com/identity/protocols/oauth2/resources/oob-migration

Implication for this app:

- the current system-browser direction is correct
- this issue should preserve that policy lock

## Scope

This issue covers only provider-side Google compliance/documentation/UX closeout for the existing OCR route.

In scope:

- add a dedicated OCR activation disclosure step that appears immediately before Google OAuth launch
- ensure the disclosure is explicit, human-facing, and requires affirmative user action
- make the disclosure consistent with current app behavior:
  - system browser opens
  - Google processes only the files the user explicitly selects for OCR
  - the app attempts immediate cleanup of the temporary converted Google document after export
  - local Google OCR token state is stored locally in the app instance
- implement at least the minimum compliance target for OCR disconnect/token-removal defined in section 3
- update user-facing privacy/help material to document the implemented posture clearly
- document the public-release OAuth verification requirements as release-gating obligations

## Non-goals

- Do not change OCR substrate.
- Do not widen OAuth scopes.
- Do not replace the current user-managed activation model.
- Do not treat dependency-license inventory as part of this issue.
- Do not force website implementation work here unless a separate release task explicitly chooses to do so.

## Work plan

- [x] Confirm and freeze the provider-policy baseline from official Google sources:
  - `drive.file` scope remains the baseline
  - system-browser OAuth remains the baseline
  - in-app disclosure is treated as a distinct requirement, not as a privacy-doc substitute
  - public-release verification requirements are recorded separately from local app docs

- [x] Inventory the exact current app flow and user-facing surfaces affected by those requirements:
  - prepare failure -> recovery -> OAuth launch
  - activation/recovery notifications
  - privacy docs
  - About/legal info page
  - instructions/help pages
  - any current disconnect / local token-removal surface

- [x] Implement the disconnect / local token-removal minimum:
  - implement at least the minimum compliance target defined in section 3

- [x] Implement the activation-consent UX fix:
  - design a dedicated pre-consent OCR activation modal/dialog for the main app window
  - ensure it appears immediately before Google OAuth launch
  - replace the current toast-only disclosure at activation start with that deliberate consent step
  - keep the copy aligned with actual runtime behavior and current scope/model constraints

- [x] Close the user-facing documentation/help gap:
  - update privacy/external-processing wording where needed
  - update setup / billing / activation instructions for the current user-managed model
  - document the implemented disconnect posture from section 3 explicitly
  - explain Google Account-side removal/revocation
  - ensure help text distinguishes local storage, Google processing, and cleanup behavior clearly

- [ ] Close the release-posture documentation gap:
  - add release-facing documentation that records the `drive.file` scope baseline
  - record the system-browser OAuth policy lock
  - record that public homepage/privacy-policy verification material is still required before public release
  - make clear that local in-app docs do not satisfy Google public verification by themselves

- [ ] Reconcile the work back into Issue 53 closeout:
  - map completed changes to Section 8.2 and 8.3 of [`docs/issues/issue_53_implementation_plan.md`](./issue_53_implementation_plan.md)
  - identify any remaining release-only blockers for Section 9.5 instead of burying them in Section 8
  - leave a concise evidence trail with official sources for future release decisions

## Acceptance criteria

- OCR activation no longer launches Google auth from a toast-only disclosure path.
- The app presents an explicit in-app OCR activation disclosure immediately before OAuth launch.
- The disclosure requires a clear affirmative action to continue.
- The disclosure text matches actual runtime behavior and does not overstate guarantees.
- The implemented/documented disconnect posture meets at least the minimum compliance target recorded in section 3.
- Privacy/help/setup surfaces are updated consistently, not just the activation UI.
- User-facing docs explicitly describe disconnect / local token-removal behavior for Google OCR.
- User-facing docs explicitly describe the current user-managed setup/activation model and what is sent to Google for OCR.
- Release documentation explicitly records the Google OAuth public-release verification requirement.
- Release documentation explicitly records that local in-app privacy/help pages are not sufficient for public OAuth verification.
- Section 8.2 and 8.3 closure for Issue 53 can cite this issue directly, with remaining public-release-only work isolated to Section 9.
- No change widens the scope beyond `drive.file`.
- No change introduces embedded/webview auth.

## Risks

- Overstating provider guarantees that the app does not actually control.
- Treating privacy-policy text as a substitute for the required immediate in-app disclosure.
- Forgetting that release verification obligations are separate from package-license obligations.
- Mixing provider-policy work with unrelated OCR product changes.

## Notes

This is a compliance-engineering issue grounded in official Google documentation. It is not legal advice.
