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

2. Runtime credential / configuration delivery

- How the app instance gets the Google-side credential/configuration material it needs at runtime.

3. Runtime Google identity used for OCR

- Which actor's Google identity/account is actually used during normal OCR operation.

4. Usage-cost / quota responsibility

- Who bears the normal quota/cost exposure of OCR use.
