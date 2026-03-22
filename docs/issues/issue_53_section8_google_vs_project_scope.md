# Issue 53 Section 8: Google obligations vs project scope

Purpose: separate what Section 8 requires because of official Google policy/guidance from what Section 8 still requires because of the repo's own chosen Issue 53 scope.

Linked plan section:

- `docs/issues/issue_53_implementation_plan.md` Section 8

This note does not, by itself, close Section 8. Its role is narrower:

- identify the authority behind each expected content requirement
- prevent overclaiming Google requirements
- prevent mixing Google-backed surface/content obligations with repo-chosen documentation scope

## Classification rule

Use only two labels:

- `Google obligation`
  - Use this label only when the requirement can be grounded in an official Google source.
  - In this note, this means: required content on required user-facing surfaces.
- `Project scope`
  - Use this label when the requirement comes from the repo's own Issue 53 scope/plan rather than from an official Google source currently cited for Issue 53.
  - In this note, `Project scope` does not mean optional. It means the authority is the project/issue scope, not Google.

No hybrid or hedge label should be used here.

## Official Google source basis used for this classification

1. Google API Services User Data Policy
   - https://developers.google.com/terms/api-services-user-data-policy
   - Used here for:
     - accurate in-app disclosure of data access/use
     - disclosure that is not hidden only in a privacy policy
     - disclosure that immediately precedes user consent

2. Google Workspace API User Data and Developer Policy
   - https://developers.google.com/workspace/workspace-api-user-data-developer-policy
   - Used here for:
     - user help documentation explaining how users manage and delete their data from the app/service

3. OAuth 2.0 policy / production-readiness guidance
   - https://developers.google.com/identity/protocols/oauth2/policies
   - https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
   - Used here only for public-release/verification posture, not for general Section 8 instructional depth

## Surface rule

This note distinguishes between:

- required content on required user-facing surfaces
- additional project-required documentation scope

What Google may require here is not "documentation about documentation."

What Google may require here is that certain user-facing surfaces themselves contain certain information.

This note therefore does not assume that:

- a separate manual must explain that a disclosure exists
- a separate instructions page must explain that a help page exists
- every fact disclosed in one required surface must also be repeated in other docs

Unless an official source specifically requires those extra surfaces, repetition across additional docs is treated here as `Project scope`, not as `Google obligation`.

## Section 8 content classified by authority

### Google obligation

- Required user-facing surfaces must state that OCR uses Google services.
  - Why: users must be accurately informed about the connected service/data-use context.

- Required user-facing surfaces must state that activation/authorization opens the system browser and occurs as part of the normal app flow.
  - Why: the consent/disclosure context must be accurate and visible in normal usage.

- Required user-facing surfaces must state that the app stores local OCR sign-in state locally when OCR is connected.
  - Why: this is part of accurately describing the access/storage model.

- Required user-facing help surfaces must state how the user can disconnect Google OCR from inside the app.
  - Why: user-help guidance for managing/removing app-side access/state is part of the Google-backed documentation requirement.

- Required user-facing help surfaces must state that the user can also revoke the app's access from their Google Account as an external control.
  - Why: this is part of user control over connected access.

### Project scope

- Explain the chosen OCR access model for real users in the distributed app:
  - OCR uses the chosen `user-managed + explicit sign-in activation` model
  - OCR is not enabled by default
  - OCR availability depends on local setup/activation state

- Explain ownership and control boundaries for the chosen model:
  - who provides the Google OAuth credentials/project
  - who controls the Google-side account/project used for OCR
  - where local credentials/token state live
  - what the app owns vs what the user owns
  - what disconnect removes and what it keeps

- Explain the setup / onboarding path required by the chosen model:
  - what the user must have before OCR can work
  - credential onboarding
  - activation/sign-in path
  - validation/check flow where applicable

- Explain the billing / access posture of the chosen model where applicable:
  - who pays for OCR usage
  - whether billing is user-side
  - whether billing/setup is part of the chosen model

- Explain the availability and failure model in user-facing terms where the issue scope requires it:
  - OCR unavailable until explicit activation
  - missing credentials
  - activation required
  - auth failure
  - quota/rate-limit failure
  - connectivity/setup failure

- Explain the chosen model consistently with the issue's distributed-delivery scope, not only with the narrow activation modal/runtime disclosure slice.

- Add any walkthroughs, screenshots, assets, or broader instruction-pass updates that the project chooses to require under Section 8.

These may still be mandatory for Issue 53 because they are part of the repo's chosen scope, but in this note they are classified as `Project scope`, not as Google-backed obligations.

## Practical implication for Section 8

Section 8 blends two kinds of requirements:

- Google-backed content obligations on user-facing surfaces
- project-scoped documentation requirements for the chosen distributed-delivery model

That means Section 8 documentation work should not be judged by a single blurred standard.

For future closure discussion, the clean method is:

1. Decide which pending Section 8 work is grounded in `Google obligation` and which is grounded in `Project scope`.
2. Evaluate current docs against each subset separately.
3. Mark the relevant plan item(s) complete only after the intended subset(s) are satisfied.

## Current repo status

As of 2026-03-21:

- `Google obligation`: satisfied
- `Project scope`: not satisfied

### Basis for `Google obligation: satisfied`

The current repo already contains the required minimum content on current user-facing surfaces:

- OCR uses Google services:
  - `PRIVACY.md`
  - `public/info/acerca_de.html`
  - `public/index.html`

- activation/authorization opens the system browser:
  - `PRIVACY.md`
  - `public/index.html`

- local OCR sign-in state is stored locally:
  - `PRIVACY.md`
  - `public/info/instrucciones.en.html`
  - `public/info/instrucciones.es.html`
  - `public/index.html`

- users can disconnect Google OCR from inside the app:
  - `PRIVACY.md`
  - `public/info/acerca_de.html`
  - `public/info/instrucciones.en.html`
  - `public/info/instrucciones.es.html`
  - `public/index.html`

- users can also revoke the app's access from their Google Account:
  - `PRIVACY.md`
  - `public/info/instrucciones.en.html`
  - `public/info/instrucciones.es.html`

### Basis for `Project scope: not satisfied`

The repo does not currently contain the broader project-scoped documentation depth listed above, such as:

- a clear user-facing explanation of the chosen `user-managed + explicit sign-in activation` model as such
- a clear user-facing explanation of ownership/control boundaries for credentials/project/account
- broader setup/credential onboarding guidance for the chosen model
- broader billing/access-model guidance where applicable
- broader user-facing explanation of the chosen availability/failure model

This status note is descriptive only. It does not, by itself, change the checkbox state in `docs/issues/issue_53_implementation_plan.md`.

## Non-claims

This note does not claim that Google requires:

- a full onboarding tutorial
- billing documentation in end-user manual form
- screenshots for every activation/setup step
- a separate manual explaining that disclosure/help surfaces exist
- repetition of the same required content across every instructional surface

If later work wants those things, they should be justified as `Project scope` unless a new official Google source is added.
