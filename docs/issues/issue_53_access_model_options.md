# Issue 53 Access-model options

Purpose: working document for building, one dimension at a time, the access model for moving OCR from the current testing posture toward a production posture.

Working method used in this document:

- keep the governing dimensions separate
- choose one dimension at a time
- record the chosen value for that dimension
- continue with the next dimension in light of the previous choices
- build one candidate model progressively

At this stage, this document only freezes the governing dimensions.

## Governing dimensions

The access-model discussion must keep these dimensions separate:

1. OAuth publication ownership

- Who owns and publishes the OAuth app/surface presented to users.

2. Google project / client ownership

- Who owns the Google Cloud project and OAuth client used by the app path under discussion.

3. Usage-cost / quota responsibility

- Who carries the economic and quota exposure of normal OCR usage.

4. Operational responsibility

- Who is the effective operator of the OCR access model in normal use.

5. Setup responsibility

- Who must perform the Google-side setup needed before OCR can be used.

6. End-user activation burden

- What the normal end user must still do before OCR becomes available in the app.

## Current rule

This document does not need a prior taxonomy of named options.

The dimensions are the decision axes.

The candidate model should be built progressively by choosing values on those axes one by one.
