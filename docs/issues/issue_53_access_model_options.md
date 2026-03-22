# Issue 53 Access-model options

Purpose: working document for deciding what must change, and what must stay the same, when moving the chosen OCR route from the current testing posture toward a production posture.

Core question:

- What result do we want for the shipped OCR access model, and why?

## Current settled baseline

The following points are already fixed by existing Issue 53 documents:

- chosen substrate: `Google Drive OCR via Google Docs conversion`
- chosen access model baseline: `user-managed + explicit sign-in activation`
- the route should be developed first against a testing setup
- testing and production should stay as close as possible at the app-route level
- the OCR route itself should not be rewritten just because the Google-side environment moves from testing to production

## Open question for this document

The remaining problem is not which OCR substrate was chosen.

The remaining problem is:

- what exactly must change, if anything, in the chosen access model when moving from the current testing posture toward a production posture

This document should answer that question without re-deciding the already chosen OCR substrate.

## Working dimensions

The current access-model discussion will use these working dimensions:

1. Google-side asset ownership

- Who owns and controls the Google Cloud project, OAuth consent configuration, and OAuth client used by the app path under discussion.

  Plain meaning for this app:
  Are ordinary users of this app expected to bring their own Google-side OCR setup, or does the app owner provide the Google-side OCR setup they use?

2. Runtime credential / configuration delivery

- How the app instance gets the Google-side credential/configuration material it needs at runtime.

3. Runtime Google identity used for OCR

- Which actor's Google identity/account is actually used during normal OCR operation.

4. Usage-cost / quota responsibility

- Who bears the normal quota/cost exposure of OCR use.

## First axis to decide

### Google-side asset ownership

Possible values:

- `end-user-owned`
- `app-owner-owned`
- `mixed / split`

#### What each value means in practice

`end-user-owned`

What users must do:

- bring their own Google-side OCR setup
- provide the Google Cloud project / OAuth client path that the app will use

What the app owner must do:

- provide the app
- explain how users connect their own Google-side setup

What this means for the production path:

- the product stays a bring-your-own-Google-setup model
- user onboarding stays heavier
- the app owner is not providing the normal Google-side OCR path used by users

`app-owner-owned`

What users must do:

- use the Google-side OCR setup provided by the app owner as the normal path

What the app owner must do:

- create and maintain the production Google Cloud project / OAuth client path used by the app
- maintain the related Google-side publication/compliance surface for that path

What this means for the production path:

- the product becomes a normal owner-provided integration path
- user onboarding gets simpler
- the Google-side production/publication burden sits with the app owner's path

`mixed / split`

What users must do:

- provide some part of the Google-side setup while relying on the app owner for another part

What the app owner must do:

- explain clearly which part belongs to the user and which part belongs to the app owner
- maintain the owner-provided part of the setup

What this means for the production path:

- this is harder to explain than the two cleaner single-owner values
- support complexity goes up
- it should only be chosen if it solves a real problem that the two cleaner values do not

#### Official source basis

Google does not define the labels `end-user-owned`, `app-owner-owned`, or `mixed / split`.

What Google does define is the Google-side structure behind this axis:

- desktop-app OAuth credentials are created as OAuth client IDs in a Google Cloud project and downloaded as `credentials.json`
- testing and production should use separate Google Cloud projects
- production publication / verification requirements attach to the Google-side project, OAuth consent screen, and related owned-domain / branding setup

For this document, the three values above are plain-language ways to describe who is expected to provide and control that Google-side setup for users of this app.
