# Issue 53 Access-model options

Purpose: working document for evaluating the possible access models for moving OCR from the current testing posture toward a production posture.

Method used in this document:

- first freeze the governing dimensions
- then derive the theoretical option set from those fixed dimensions
- then reduce that set with realistic and objective constraints
- then reduce it further with explicit project decisions

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

No option set should be written in this document unless it can be expressed as a combination of the fixed dimensions above.
