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

#### Chosen value

- `app-owner-owned`

Why this value is currently preferred:

- the goal is a real production path for ordinary users of this app
- it avoids forcing ordinary users to bring their own Google-side OCR setup
- it matches the production direction already implied by the Issue 53 baseline: keep the OCR route logic stable, but move the Google-side setup from testing to a proper production project/client path

## Second axis to decide

### Runtime credential / configuration delivery

Decision question:

- If the Google-side OCR setup is app-owner-owned, how does the app runtime receive the Google-side credential/configuration material it needs?

Possible values:

- `manual local file delivery`
- `bundled with the app`
- `owner-controlled remote delivery`

Elements needed to decide:

- what users must do during installation or first use
- what the app owner must do to distribute and update the configuration
- what happens if the configuration changes later
- what support burden each value creates
- what mismatch risk each value creates between testing and production

#### What each value means in practice

`manual local file delivery`

What users must do:

- obtain the Google-side credential/configuration file
- place it where the app expects it, or pick/import it into the app

What the app owner must do:

- distribute that file to users by some separate path
- explain how users install or replace it

What this means for the production path:

- the app-owner-owned setup still exists, but users are doing a manual installation step
- configuration updates later are also likely to require a manual user action
- support burden rises because configuration mistakes become user-facing installation problems

`bundled with the app`

What users must do:

- nothing special beyond installing and using the app

What the app owner must do:

- package the needed Google-side credential/configuration material with the app
- update the packaged app only if that client/configuration material itself must be replaced

What this means for the production path:

- the production path is simpler for ordinary users
- installation and first use are cleaner
- configuration changes later are handled through app packaging/distribution rather than user file handling

Clarification:

- this does not mean the bundled client/configuration normally expires during ordinary use
- the thing that usually changes during normal use is user token state, not the bundled client/configuration itself
- the bundled app would only need updating if the owner decides or needs to replace that Google-side client/configuration

`owner-controlled remote delivery`

What users must do:

- use the app while it retrieves or receives the owner-provided configuration by an owner-controlled path

What the app owner must do:

- maintain the delivery service or retrieval path
- handle availability, update behavior, and failure handling for that delivery mechanism

What this means for the production path:

- users avoid manual file handling
- but the app now depends on an additional owner-controlled delivery mechanism
- operational complexity is higher than either manual local file delivery or bundling

#### Chosen value

- `bundled with the app`

Why this value is currently preferred:

- it gives ordinary users the cleanest production path
- it avoids manual file handling and related installation mistakes
- it avoids introducing an additional owner-controlled remote delivery mechanism
- it fits the Issue 53 direction of keeping the OCR route logic stable while changing the Google-side production setup
