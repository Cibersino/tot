# Issue 53 Access-model options

Purpose: working document for building, one dimension at a time, the access model for moving OCR from the current testing posture toward a production posture.

Working method used in this document:

- keep the governing dimensions separate
- choose one dimension at a time
- record the chosen value for that dimension
- continue with the next dimension in light of the previous choices
- build one candidate model progressively

At this stage, this document only freezes the governing dimensions.

## What counts as a valid dimension here

A dimension is admissible in this document only if it is:

- factual rather than evaluative
- materially independent from the other dimensions
- decision-driving rather than merely descriptive after the fact
- not just a consequence of other choices
- concrete enough that its value can be stated without vague interpretation

Dimensions that are overlapping, abstract, or derivative should not be used as governing dimensions here.

## Governing dimensions

The access-model discussion must keep these dimensions separate:

1. Google-side asset ownership

- Who owns and controls the Google Cloud project, OAuth consent configuration, and OAuth client used by the app path under discussion.

2. Runtime credential / configuration source

- What runtime Google-side material the app instance depends on, and who supplies that material to the app instance.

3. Usage-cost / quota responsibility

- Who carries the economic and quota exposure of normal OCR usage.

4. Google-side setup / maintenance responsibility

- Who must perform and maintain the Google-side setup over time so the OCR path keeps working.

5. Runtime Google identity used for normal OCR operation

- Which actor's Google identity/account is actually used during normal OCR operation in the shipped model.

## Current rule

This document does not need a prior taxonomy of named options.

The dimensions are the decision axes.

The candidate model should be built progressively by choosing values on those axes one by one.
