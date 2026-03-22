# Issue 53 Section 8 Item 3: Google obligations vs project choices

Purpose: separate what Section 8 item 3 requires because of official Google policy/guidance from what the repo may still choose to document for product/help quality.

Linked plan item:

- `docs/issues/issue_53_implementation_plan.md` Section 8 item 3:
  - `Update setup/billing/activation instructions for the chosen access model.`

This note does not, by itself, close Section 8 item 3. Its role is narrower:

- identify the authority behind each expected content requirement
- prevent overclaiming Google requirements
- prevent mixing Google-backed surface/content obligations with repo-chosen documentation depth

## Classification rule

Use only two labels:

- `Google obligation`
  - Use this label only when the requirement can be grounded in an official Google source.
  - In this note, this means: required content on required user-facing surfaces.
- `Project choice`
  - Use this label when the repo wants additional docs, tutorials, walkthroughs, assets, or explanatory depth, but the requirement is not directly grounded in an official Google source currently cited for Issue 53.

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
   - Used here only for public-release/verification posture, not for current item-3 tutorial depth

## Surface rule

This note distinguishes between:

- required content on required user-facing surfaces
- additional repo-chosen docs or instructional surfaces

What Google may require here is not "documentation about documentation."

What Google may require here is that certain user-facing surfaces themselves contain certain information.

This note therefore does not assume that:

- a separate manual must explain that a disclosure exists
- a separate instructions page must explain that a help page exists
- every fact disclosed in one required surface must also be repeated in other docs

Unless an official source specifically requires those extra surfaces, repetition across additional docs is treated as `Project choice`.

## Item-3 content classified by authority

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

### Project choice

- A separate step-by-step tutorial for obtaining Google OAuth credentials.

- A separate step-by-step tutorial for importing `credentials.json`.

- A separate step-by-step walkthrough of first activation/recovery screens.

- Billing instructions in user-manual form.

- Screenshots/assets for the setup or activation flow.

- Detailed troubleshooting playbooks beyond the minimum user-control / access-model explanation.

- Repeating required disclosure/help content across additional manuals, walkthroughs, or instructional pages.

These may still be required by the repo if desired, but in this note they are classified as `Project choice`, not as Google-backed obligations.

## Practical implication for Section 8 item 3

The current item-3 wording blends two kinds of requirements:

- Google-backed content obligations on user-facing surfaces
- repo-chosen tutorial/help depth or extra documentation surfaces

That means item 3 should not be judged by a single blurred standard.

For future closure discussion, the clean method is:

1. Decide whether item 3 is meant to close only the `Google obligation` subset or both subsets.
2. Evaluate current docs against each subset separately.
3. Mark the plan item complete only after the intended subset(s) are satisfied.

## Current repo status

As of 2026-03-21:

- `Google obligation`: satisfied
- `Project choice`: not satisfied

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

### Basis for `Project choice: not satisfied`

The repo does not currently contain the broader optional/tutorial depth listed above as `Project choice`, such as:

- a separate setup walkthrough for obtaining/importing `credentials.json`
- a separate activation-flow tutorial
- billing instructions in user-manual form
- dedicated setup/activation screenshots or instructional assets

This status note is descriptive only. It does not, by itself, change the checkbox state in `docs/issues/issue_53_implementation_plan.md`.

## Non-claims

This note does not claim that Google requires:

- a full onboarding tutorial
- billing documentation in end-user manual form
- screenshots for every activation/setup step
- a separate manual explaining that disclosure/help surfaces exist
- repetition of the same required content across every instructional surface

If later work wants those things, they should be justified as `Project choice` unless a new official Google source is added.
