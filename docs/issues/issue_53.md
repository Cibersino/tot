# Epic: File Text Extraction

## Objective

Allow the user to extract text from supported files into the app’s current text.

Primary product goal:
- OCR quality for image files, especially photographed book pages, should be as close as realistically possible to Google Lens.

Also required:
- native extraction when a file already contains usable text
- user choice between available extraction routes when more than one is viable

The feature must preserve current text-application semantics:
- overwrite
- append
- repetitions
- MAX_TEXT_CHARS enforcement
- explicit truncation notices
- no silent fallback

Extraction language scope:
- text extraction must support text in any language, including Asian scripts
- this applies to both OCR and native extraction routes

UI localization implementation must follow the existing app pattern:
- trust the existence of `es` / `en`
- avoid hardcoded language fallbacks
- this UI localization rule does not limit extraction language coverage

## Implementation constraints

- Respect the modularized style of the current app. Avoid inflating `electron/main.js` and `public/renderer.js`.
- Respect the logging style of the current app. Follow the `log.js` and bridge failure policies.

## Entry point

- One dedicated import/extract button in the text-selector button row.
- Clicking it opens the native OS file picker.
- The picker opens:
  - in a default folder initially
  - then in the last relevant persisted folder on later uses

## Functional scope

The feature covers text extraction from:
- image files
- PDFs
- text/document files

Possible extraction routes:
- OCR
- native extraction

A selected file may expose one route or both.
When both routes are available, the user can choose.

This matters especially for PDFs and mixed-quality files, where native extraction may exist but OCR may still produce a better result.

## File families

### OCR-capable
Examples:
- jpg
- jpeg
- png
- webp
- bmp
- scanned PDFs

### Native-extraction-capable
Examples:
- txt
- md
- html
- docx
- PDFs with usable embedded/selectable text

## PDF policy

PDFs must be triaged.

Possible outcomes:
- native extraction only
- OCR only
- both routes available

The app must not assume that a PDF with some selectable text should automatically use native extraction.

If both routes are viable, the user chooses.

## Preconditions

No extraction process may start while:
- any secondary window is open
- the stopwatch is running

This includes, for example:
- text editor window
- task editor window

For this rule, "secondary window" means any non-main app window currently open.

If processing is requested while any of those conditions is true, the app must:
- refuse to start
- explicitly tell the user to close the secondary windows and stop the stopwatch
- log a structured `precondition_rejected` event with explicit reasons

Precondition rejection is a blocked-start path, not an extraction failure.

## Processing UX

While extraction is running:
- progress must be shown
- ETA must be shown and should be realistic
- when the window is not minimized, progress and ETA are visible in the main window
- the window and app menu must be blocked for normal interaction

Allowed actions during processing:
- close window
- minimize window
- move window
- abort

This processing lock must be treated as its own mode.
It must not be conflated with the startup lock.

## User flow

1. User clicks the import/extract button.
2. App opens the native file picker.
3. User selects a file.
4. App checks preconditions.
5. App determines available extraction routes.
6. If both routes are available, the app asks the user which one to use.
7. App runs extraction in processing mode with visible progress and ETA.
8. If extraction succeeds, app opens a post-extraction modal.
9. User chooses:
   - overwrite
   - append
   - repetitions
10. App applies the extracted text through the existing canonical text-application mechanism.

## Post-extraction apply flow

The post-extraction modal must mirror the current selector behavior.
Extraction changes the text source only; apply semantics remain exactly the current app behavior.

The user must be able to:
- overwrite current text
- append to current text
- choose repetitions

This flow must reuse current semantics for:
- overwrite/append meaning
- repetitions behavior
- MAX_TEXT_CHARS handling
- truncation notices
- existing canonical apply-path behavior

## Abort policy

The user must be able to abort an in-flight extraction.

A close-window request during processing is treated as user cancellation and must follow the same guarantees as abort.

On abort:
- processing stops as soon as safely possible
- no extracted result is shown
- no partial result is surfaced
- current text remains unchanged
- no apply modal is shown
- the app leaves processing mode cleanly
- abort/cancellation is logged as a structured abort event

User abort/cancellation is a controlled cancellation path, not an extraction failure.

## Error handling policy

This section applies to extraction failures after extraction has started.

On any extraction failure:
- show explicit user-visible error
- log structured warn/error
- do not modify current text
- do not silently switch routes

Failure cases include:
- unsupported format
- corrupt or unreadable file
- native extraction failure
- OCR failure
- route-classification failure
- missing substrate configuration
- missing credentials
- billing/auth issues
- quota/budget/usage-limit issues
- connectivity failure
- platform/runtime setup failure

## Substrate

The OCR substrate and access model are fixed for this epic.

Chosen baseline:
- substrate: `Google Drive OCR via Google Docs conversion`
- access model: `user-managed + explicit sign-in activation`

Decision references:
- `docs/issues/issue_53_ocr_substrate_evaluation.md` (final decision + rationale)
- `docs/issues/issue_53_contracts.md` (locked contract baseline)

Implementation implications:
- OCR remains unavailable until explicit user sign-in/activation is completed.
- Desktop OAuth must use the system browser (no embedded webview auth).
- The route should request minimum practical scope (target baseline: `drive.file`).
- OCR uploads selected files to Google for conversion; this must be explicitly disclosed.
- Auth/setup/quota/export/cleanup failures must be explicit user-visible states; no silent fallback.

## Setup / billing / compliance

This app is intended to be distributed to multiple users.

Because of that, the epic must explicitly define the OCR access / billing / activation model for the chosen substrate.

At minimum, this includes:
- who pays for OCR usage
- who owns the substrate account/project
- where credentials live
- whether OCR is vendor-managed, user-managed, or hybrid
- whether each user can enable OCR with their own account/billing
- whether OCR is enabled by default or requires explicit activation
- whether usage restrictions/limits exist and how they are enforced
- what happens when quota, budget, or usage limits are reached

If the chosen substrate requires user-side setup, the feature must include:
- setup guidance
- credential onboarding
- billing onboarding if required
- activation guidance
- validation/test flow
- explicit failure handling for incomplete setup

The feature must also include the required in-app license/compliance surfaces for the chosen substrate and dependencies, such as:
- third-party notices
- attributions
- license display
- privacy disclosures
- external-processing disclosure when applicable

## Platform constraint

Initial implementation target:
- Windows

Architectural constraint:
- the design must remain viable for later macOS/Linux support

Core routing, contracts, processing-mode behavior, and UX semantics should remain platform-agnostic.
Platform-specific code should be isolated.

## Contracts to define before implementation

### Extraction result
All routes must converge to one shared internal result shape, including:
- success/failure
- extracted text
- executed route
- warnings
- summary
- safe provenance metadata
- structured error on failure

### Route metadata
Must capture at least:
- detected file kind
- available routes
- chosen route
- executed route
- whether PDF triage occurred

### Apply behavior (reuse existing canonical path)
This epic must reuse the current app's existing apply behavior.

User-facing apply options after extraction:
- overwrite
- append
- repetitions

Implementation rule:
- apply must go through the current canonical text-application path already used by the app
- no new apply semantics, no parallel apply pipeline, and no alternative apply mode are introduced by this epic
- existing MAX_TEXT_CHARS enforcement and explicit truncation notices remain unchanged

Clarification:
- repetitions are apply behavior and user choice
- they do not require redefining or expanding text-state metadata fields in this epic

## Observability

Must log:
- selected file type
- available routes
- chosen route
- executed route
- extraction success/failure
- OCR latency
- native extraction latency
- ETA behavior quality where relevant
- apply choice
- repetition count
- truncation events
- setup/configuration failures
- precondition failures
- abort events

## Acceptance criteria

- extraction starts from the dedicated button in the text-selector button row
- the native file picker uses default/persisted folder behavior
- extraction supports text in any language (including Asian scripts) across OCR and native routes
- app UI localization continues to follow the existing `es` / `en` resource pattern with no hardcoded UI-language fallbacks
- extraction cannot start while secondary windows are open or the stopwatch is running, and the user is explicitly told what to close/stop
- files can be processed through OCR with visible progress, realistic ETA, and explicit failures
- native-capable files can be processed without OCR
- when both OCR and native extraction are viable, the user can choose
- PDFs are triaged correctly
- while processing is active, the main window and menu are blocked except for basic window actions and abort
- the processing lock is distinct from the startup lock
- after successful extraction, the user can choose overwrite/append and repetitions in a modal aligned with the current selector behavior
- post-extraction apply reuses the existing canonical apply path with no new apply semantics
- MAX_TEXT_CHARS is enforced with explicit truncation notice
- failed or aborted extraction never mutates current text
- abort never shows partial extracted results
- precondition rejection, extraction failure, and user cancellation are distinct states with distinct UX and logging
- close during processing follows user-cancellation semantics
- the first implementation works on Windows
- the architecture remains viable for later macOS/Linux support
- the OCR access / billing / activation model is explicitly chosen and documented for distributed app delivery
- required setup/billing/compliance surfaces are defined for the chosen substrate and chosen access model

## Open workstreams

- benchmark corpus definition, with emphasis on photographed book pages
- substrate evaluation, starting with Document AI
- route-availability model and PDF triage rules
- shared extraction/apply contracts
- processing-mode lock model, distinct from startup lock
- button entry point and picker behavior
- OCR route
- native extraction route
- native extraction engineering decomposition (parser mapping by format, normalization pipeline, structured native-route errors, fixture matrix for quality gate)
- route-choice UX when both routes are available
- overwrite/append/repetitions modal aligned with selector semantics
- progress, ETA, explicit errors, abort, and structured observability
- Windows packaging and future macOS/Linux boundaries
- access / billing / activation model for distributed app delivery
- user setup/billing/activation flow where applicable
- in-app license/compliance surfaces
