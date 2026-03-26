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

Section 8 still requires more than the Google-backed minimum.

Under Issue 53, the project-side documentation scope is the user-facing documentation needed to make the shipped import/extract feature understandable and usable as a real app feature, not only as a compliant Google-connected OCR integration.

That project scope includes, at minimum:

- explain the feature entrypoint and basic user flow:
  - the dedicated import/extract button
  - native file picker flow
  - selection of a source file for extraction

- explain the feature coverage:
  - supported file families at a user-facing level
  - OCR route vs native extraction route
  - that some files may expose one route or both

- explain the main user decisions in the flow:
  - route choice when both OCR and native are available
  - post-extraction apply choices such as overwrite/append/repetitions

- explain the main operational constraints that affect normal use:
  - extraction cannot start while secondary windows are open
  - extraction cannot start while the stopwatch is running
  - processing/abort behavior at a user-facing level where relevant

- explain the chosen OCR model as part of the product's actual behavior:
  - OCR is not always available automatically
  - OCR setup is moving toward an app-owner-provided Google-side configuration for production delivery
  - OCR may still require user-side activation/sign-in with the user's own Google account
  - OCR uses the chosen Google-based model when that route is used

- explain the main user-facing failure/setup states where they materially affect feature usability:
  - setup incomplete
  - activation required
  - route unavailable/restricted
  - quota/rate-limit or connectivity cases at a user-facing level where relevant

- update the instructional surfaces and assets needed so the current shipped feature is documented coherently, not only disclosed legally.

This project scope is not derived from Google policy. It is derived from the repo's own Issue 53 scope, user-flow design, and documentation expectations for a distributed end-user feature.

## Practical implication for Section 8

Section 8 blends two kinds of requirements:

- Google-backed content obligations on user-facing surfaces
- project-scoped documentation requirements

That means Section 8 documentation work should not be judged by a single blurred standard.

For future closure discussion, the clean method is:

1. Decide which pending Section 8 work is grounded in `Google obligation` and which is grounded in `Project scope`.
2. Evaluate current docs against each subset separately.
3. Mark the relevant plan item(s) complete only after the intended subset(s) are satisfied.

## Current repo status

As of 2026-03-26:

- `Google obligation`: satisfied
- `Project scope`: pending rewrite

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

The project-side content is not yet satisfied because the current repo still does not document the broader import/extract feature coherently at the level described above.

In particular, the current user-facing docs are still light or missing on:

- the import/extract feature flow as a whole
- route coverage and route choice behavior
- apply-flow behavior after extraction
- normal-use constraints such as blocked starts
- the broader feature-level instructional surfaces/assets needed for this shipped feature

The previous note also said the repo was still missing a clean user-facing explanation of the refined production-target OCR model recorded in `docs/issues/issue_53_access_model_options.md`. That part is now outdated.

The current repo does contain that explanation on public user-facing privacy surfaces, including:

- `website/public/en/app-privacy/google-ocr/index.html`
- `website/public/es/app-privacy/google-ocr/index.html`

Those pages now state, in user-facing terms, that:

- the Google Cloud project / OAuth client is owner-provided
- that client/configuration is distributed with the app rather than manually imported by ordinary users
- OCR runs under the end user's Google account
- the requested Drive permission is `drive.file`

So the remaining `Project scope` gap is the broader import/extract feature documentation, not the absence of a user-facing explanation of the refined OCR ownership/runtime model itself.

The previous project-side content was removed because it reduced Section 8 too narrowly to the Google/OCR activation slice.

This status note is descriptive only. It does not, by itself, change the checkbox state in `docs/issues/issue_53_implementation_plan.md`.

## Non-claims

This note does not claim that Google requires:

- a full onboarding tutorial
- billing documentation in end-user manual form
- screenshots for every activation/setup step
- a separate manual explaining that disclosure/help surfaces exist
- repetition of the same required content across every instructional surface

If later work wants those things, they should be justified as `Project scope` unless a new official Google source is added.
