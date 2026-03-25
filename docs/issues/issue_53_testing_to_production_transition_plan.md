# Issue 53 Testing-to-Production Transition Plan

Date: 2026-03-22

Purpose: define the concrete work needed to move the current OCR path from the present testing posture to the intended production posture, using both the current repo state and official Google documentation as evidence.

This document is operational. It is not only about Google Console setup. For Issue 53, the transition also includes app changes and user-documentation changes because the current app still reflects a testing-oriented credential model in some runtime paths.

## Codex Policy For This File

- When this file is the active working document, Codex must treat it as the controlling source for scope, sequencing, and interpretation unless the user explicitly directs otherwise.
- Codex must follow this file as written and must not skip, reorder, narrow, reinterpret, optimize, or replace parts of it based on Codex's own judgment.
- Steps in this file are not optional merely because they are non-code, administrative, or appear trivial.
- Codex must distinguish explicitly between:
  - what this file requires
  - what the current repo state shows
  - what Codex is inferring
- Any deviation, or potential deviation, caused by Codex's own judgment must be reported before acting.
  - The report must state:
    - what instruction, requirement, or order would be deviated from
    - why Codex thinks deviation may help
    - impact/risk
    - whether execution paused for user confirmation or proceeded with rationale

## Current repo state

Current settled baseline in Issue 53:

- Testing baseline:
  - `user-managed + explicit sign-in activation`
  - Source: [issue_53.md](./issue_53.md)
- Production target:
  - Google-side asset ownership: `app-owner-owned`
  - runtime credential / configuration delivery: `bundled with the app`
  - runtime Google identity used for OCR: `the end user's Google account`
  - usage-cost / quota responsibility: `the end user's Google account / Google-side usage context`
  - Sources: [issue_53.md](./issue_53.md), [issue_53_access_model_options.md](./issue_53_access_model_options.md)

Current runtime evidence:

- The OCR activation code still supports manual user import of `credentials.json` when credentials are missing.
  - Source: [import_extract_ocr_activation_ipc.js](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js)
- The current OAuth scope is still locked to `drive.file`.
  - Source: [import_extract_ocr_activation_ipc.js](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js)
- The current OCR route uses the Google Drive API path (`files.create` with Google Docs conversion + `files.export`) and does not call the Docs API directly.
  - Source: [ocr_google_drive_route.js](../../electron/import_extract_platform/ocr_google_drive_route.js)
- The app already uses system-browser desktop OAuth and already has the pre-consent disclosure modal and disconnect flow implemented.
  - Sources: [import_extract_ocr_activation_ipc.js](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js), [import_extract_ocr_activation_disclosure_modal.js](../../public/js/import_extract_ocr_activation_disclosure_modal.js), [import_extract_ocr_disconnect_ipc.js](../../electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js)

## Terminology used in this document

- `App`
  - the desktop product itself: its runtime behavior, packaging, UI, and user documentation
- `Google Cloud project`
  - the Google-side container that owns OAuth consent configuration, enabled APIs, and OAuth clients
- `OAuth client`
  - the desktop client credentials created inside that Google Cloud project
- `Publish app` / `In production`
  - Google Console terminology for changing the OAuth audience/publishing state of the Google Cloud project from `Testing` to `In production`
  - In this document, this does **not** mean "ship the desktop binary to end users" by itself

## Target transition result

After this transition:

- the app no longer depends on ordinary end users manually providing `credentials.json` as the normal OCR onboarding path
- the app uses an app-owner-controlled production Google Cloud project and production desktop OAuth client
- the app still uses system-browser OAuth
- the app still requests only `drive.file`
- the app still uses the end user's Google account at runtime for OCR authorization
- the app is no longer constrained by testing-mode test-user limits or seven-day test-user authorization expiry
- user instructions describe the production path, not the testing path

## Status labels used in the work plan

- `Mandatory (Google)`:
  - required by official Google policy/guidance for the chosen production posture
- `Mandatory (Project)`:
  - required by the repo's own chosen Issue 53 production target, even if not directly imposed by Google
- `Conditional (Google)`:
  - required only if a stated Google-side condition applies
- `Optional`:
  - not required to reach the production target, but may still be useful

## Official Google source basis

1. Separate testing and production projects
   - Google states that OAuth production readiness requires separate projects for testing and production.
   - Source: [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)

2. Testing vs production audience behavior
   - Testing mode is limited to up to 100 listed test users.
   - Test-user authorizations expire after 7 days; refresh tokens also expire in that testing case.
   - `In production` is the publishing status of the Google OAuth project after selecting the `Publish app` button in the Google Auth Platform.
   - This publishing-state change is a console action, not a documented multi-day approval workflow by itself.
   - Source: [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)

3. Narrowest scope and `drive.file`
   - Google Drive guidance recommends narrow scopes and classifies `drive.file` as recommended and non-sensitive.
   - Source: [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

4. Production application home page / privacy policy
   - Google states every production OAuth app needs a publicly accessible **application home page**.
   - Google states that this page must describe the application's functionality and link to the application's privacy policy and optional terms of service.
   - Google brand-verification guidance also says the privacy policy must disclose how the application accesses, uses, stores, or shares Google user data.
   - Source: [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
   - Source: [Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

5. Brand verification
   - Google states an external app that wants to display its logo or display name on the OAuth consent screen requires brand verification.
   - Google also states that brand verification typically takes 2-3 business days after submission.
   - Source: [Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

6. Verification submission flow / production publishing step
   - Google states development/testing/staging projects are not the normal verification target.
   - Google states the production-tier Google OAuth project should have publishing status `In production`, and that production-tier projects are the ones that should be submitted for verification when verification applies.
   - Source: [Submitting your app for verification](https://support.google.com/cloud/answer/13461325?hl=en)

7. Non-sensitive scope verification posture
   - Google states apps using only non-sensitive scopes do not need full scope verification, though brand verification may still apply.
   - Source: [OAuth App Verification Help Center](https://support.google.com/cloud/answer/13463073?hl=en)

## Timing clarification

- Creating a desktop OAuth client is effectively immediate in Google Cloud Console.
  - Google states that after creating the OAuth client, you receive the client ID and, where applicable, the client secret.
  - Source: [Manage OAuth Clients](https://support.google.com/cloud/answer/15549257?hl=en)
- Changing the Google OAuth project from `Testing` to `In production` is also effectively immediate at the publishing-status level.
  - Source: [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)
- What may take review time is not the creation of the desktop OAuth client nor the `In production` state change itself, but later Google verification workflows if they apply.
  - In the current Issue 53 scope, the relevant likely review path is brand verification for an external production app.
  - Source: [Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- Because the current planned scope stays on `drive.file`, sensitive-scope verification is not the expected path unless the scope set changes.
  - Source: [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

## Work plan

### 1. Preconditions

- [ ] `Mandatory (Project)` The app owner has access to the Google account / organization that will own the production Google Cloud project and OAuth configuration.
- [ ] `Mandatory (Google)` If the target audience is `External`, the app owner controls a public web domain that can host the application's home page and privacy policy.
- [ ] `Mandatory (Google)` If the target audience is `External`, the app owner can verify that domain for Google OAuth branding/authorization purposes.
- [ ] `Mandatory (Project)` The desktop packaging/distribution path can carry owner-provided OCR client/configuration material for the production model.

### 2. Immediate Google Console actions

- [ ] `Mandatory (Google)` Create a separate production Google Cloud project rather than reusing the current testing project.
  - Why: Google production-readiness guidance requires separate testing and production projects.
  - Source: [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)

- [ ] `Mandatory (Google)` Choose the correct audience for the production project.
  - Use `External` if the app is meant for users outside one Google Workspace organization.
  - Use `Internal` only if the app is truly limited to one Workspace organization.
  - Source: [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)

- [ ] `Mandatory (Google)` Change the production Google OAuth project's publishing status to `In production` when it is ready for real-user rollout.
  - Why: testing mode is limited to listed test users and test-user authorizations expire after 7 days.
  - Clarification: this is an immediate publishing-status change in Google Console, not the same thing as later verification review.
  - Source: [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)

- [ ] `Mandatory (Google)` Enable the Google Drive API in the production project.
  - Why: the current OCR route uses Drive API calls for upload/convert/export.
  - Sources:
    - [Submitting your app for verification](https://support.google.com/cloud/answer/13461325?hl=en)
    - [ocr_google_drive_route.js](../../electron/import_extract_platform/ocr_google_drive_route.js)

- [ ] `Mandatory (Google)` Create a new desktop OAuth client in the production project.
  - Why: the app uses a desktop/system-browser OAuth flow and production should not reuse the testing client.
  - Sources:
    - [Submitting your app for verification](https://support.google.com/cloud/answer/13461325?hl=en)
    - [Desktop client creation example](https://developers.google.com/workspace/meet/api/guides/quickstart/nodejs)

- [ ] `Mandatory (Google)` Keep the declared OAuth scope at `drive.file` unless a separately justified change is approved.
  - Why: current code already uses `drive.file`, and Google classifies it as recommended and non-sensitive.
  - Sources:
    - [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
    - [import_extract_ocr_activation_ipc.js](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js)

- [ ] `Conditional (Google)` Enable billing only if the Google Cloud console or selected API configuration explicitly requires it.
  - Why: Google verification/setup guidance mentions billing only when prompted; this is not a universal requirement for this repo's current Drive-only route.
  - Source: [Submitting your app for verification](https://support.google.com/cloud/answer/13461325?hl=en)

### 3. Verification-dependent Google work

- [ ] `Mandatory (Google)` Configure accurate consent-screen metadata for the production project:
  - app name
  - user support email
  - developer contact information
  - declared scopes
  - Source: [Submitting your app for verification](https://support.google.com/cloud/answer/13461325?hl=en)

- [ ] `Mandatory (Google)` Provide a publicly accessible application home page for the production app.
  - Why: Google states every production OAuth app must have a publicly accessible application home page.
  - Meaning here: this page is about the desktop application/product that is requesting Google OAuth, not about the web page itself as a product.
  - Source: [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)

- [ ] `Mandatory (Google)` Provide a privacy-policy URL for the production app and keep it aligned with actual OCR behavior.
  - Why: Google requires an application privacy policy for production identity/verification posture.
  - Meaning here: this is the privacy policy of the application/product, not Google's privacy policy and not just a privacy note about the website itself.
  - Sources:
    - [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
    - [Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

- [ ] `Mandatory (Google)` Verify ownership of the authorized domain(s) used by the production app's home page and privacy policy.
  - Source: [Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

- [ ] `Conditional (Google)` Submit for brand verification if the production Google OAuth project is `External` and should display the application's real name/logo on the OAuth consent screen.
  - Why: Google states that an external app that wants logo or display name on the consent screen requires brand verification.
  - Clarification: this does not require owning a paid trademark; it requires accurate app identity and control of the relevant authorized domains.
  - Sources:
    - [Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
    - [OAuth App Verification Help Center](https://support.google.com/cloud/answer/13463073?hl=en)

- [ ] `Optional` Provide terms of service if the production distribution posture needs it.
  - Why: Google says terms are optional on the production home page requirements page.
  - Source: [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)

- [ ] `Optional` Prepare verification-support materials early, even if the current scope does not require sensitive/restricted-scope verification.
  - Examples:
    - internal explainer of the OAuth flow
    - app screenshots
    - review-ready summary of current scopes and why they are minimal

### 4. App/runtime changes

- [ ] `Mandatory (Project)` Remove manual end-user `credentials.json` import as the normal production onboarding path.
  - Why: the current runtime still supports manual import, but the chosen production target is `app-owner-owned` plus `bundled with the app`.
  - Sources:
    - [issue_53.md](./issue_53.md)
    - [issue_53_access_model_options.md](./issue_53_access_model_options.md)
    - [import_extract_ocr_activation_ipc.js](../../electron/import_extract_platform/import_extract_ocr_activation_ipc.js)

- [ ] `Mandatory (Project)` Decide the packaging shape for the production client/configuration.
  - The repo must settle where the owner-provided client/configuration lives at runtime in production.
  - At minimum, the implementation must avoid making ordinary users obtain, install, or browse for `credentials.json`.

- [ ] `Mandatory (Project)` Update the OCR readiness/activation flow so production setup failures match the new bundled-client model.
  - Example: "missing bundled production client/configuration" is a packaging/config problem, not a normal end-user onboarding step.

- [ ] `Mandatory (Project)` Re-review disconnect behavior and wording against the new production client/configuration delivery model.
  - Current wording says the app keeps `credentials.json` so the user can reconnect later.
  - That wording may remain technically true in some implementation shapes, but it must stop implying that the user owns or provides the normal production client file.
  - Sources:
    - [import_extract_ocr_disconnect_ipc.js](../../electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js)
    - [PRIVACY.md](../../PRIVACY.md)

- [ ] `Mandatory (Project)` Keep these behaviors unchanged unless separately re-decided:
  - system-browser OAuth
  - pre-consent disclosure immediately before OAuth
  - minimum practical scope (`drive.file`)
  - end-user Google account at runtime
  - disconnect / revoke flow

### 5. Documentation changes

- [ ] `Mandatory (Project)` Remove testing-path instructions that imply ordinary users must supply or import `credentials.json` themselves.

- [ ] `Mandatory (Project)` Add production-path instructions that explain the real shipped user flow:
  - OCR is available in the app
  - activation still requires explicit user consent/sign-in in the system browser
  - the app uses Google services for OCR when the OCR route is chosen
  - disconnect remains available in the app

- [ ] `Mandatory (Project)` Update any wording that still describes the testing posture rather than the production posture.
  - Current repo state already documents the current behavior, but those docs must be reconciled when the credential model changes.
  - Candidate surfaces:
    - [PRIVACY.md](../../PRIVACY.md)
    - [instrucciones.en.html](../../public/info/instrucciones.en.html)
    - [instrucciones.es.html](../../public/info/instrucciones.es.html)
    - [acerca_de.html](../../public/info/acerca_de.html)

- [ ] `Mandatory (Project)` Update the production-homepage / privacy-policy content so it matches the real shipped OCR model and does not contradict the app's in-app disclosures.

- [ ] `Optional` Add release-note language that explicitly says the OCR path has moved from testing posture to production posture.

### 6. Publication / verification decision record

- [ ] `Conditional (Google)` If the production Google OAuth project remains `External` and uses production branding, complete brand verification.
  - Source: [Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

- [ ] `Mandatory (Google)` Do not submit for sensitive or restricted scope verification unless the scope set expands beyond the current non-sensitive baseline.
  - Why: current intended baseline is `drive.file`, which Google classifies as non-sensitive.
  - Sources:
    - [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
    - [OAuth App Verification Help Center](https://support.google.com/cloud/answer/13463073?hl=en)

- [ ] `Mandatory (Project)` Record the final publication posture explicitly:
  - narrow private distribution
  - broader external production rollout
  - public-release website/verification readiness
  - This decision should stay explicit in Issue 53 docs and not be inferred implicitly from partial setup work.

### 7. Validation before calling the transition complete

- [ ] `Mandatory (Project)` Validate a packaged Windows build with the owner-provided production client/configuration included.
- [ ] `Mandatory (Project)` Validate first OCR use in a packaged build:
  - no manual credentials import
  - disclosure modal still appears before OAuth
  - system browser still launches
  - sign-in succeeds and OCR retries correctly
- [ ] `Mandatory (Project)` Validate disconnect/reconnect in a packaged build under the production model.
- [ ] `Mandatory (Project)` Validate that user-facing docs and consent-screen/public URLs are mutually consistent.
- [ ] `Mandatory (Project)` Validate that no code path widens scope beyond `drive.file`.
- [ ] `Mandatory (Project)` Validate that no code path reintroduces embedded OAuth/webview auth.

## What will change in user instructions

Current testing-oriented path:

- the user may need to provide/import `credentials.json`
- the user accepts the disclosure
- the user authorizes in the system browser

Target production path:

- the app already contains the owner-provided client/configuration
- the user accepts the disclosure
- the user authorizes in the system browser

Therefore, the user-facing setup instructions must change materially when this transition is implemented.

## Not required for the current scope unless something changes

- Sensitive-scope verification is not required while the app stays on the current `drive.file` non-sensitive baseline.
- Restricted-scope verification is not required while the app stays on the current `drive.file` non-sensitive baseline.
- A rewrite of the OCR route itself is not required; the Issue 53 target is to keep the route logic as stable as possible while changing the Google-side production posture.

## Exit condition for this document

This transition can be considered complete only when all `Mandatory (Google)` and `Mandatory (Project)` items above are checked for the chosen production posture, and any remaining unchecked items are explicitly `Conditional (Google)` not applicable or truly `Optional`.
