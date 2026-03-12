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

Initial language scope:
- English
- Spanish

The implementation must follow the existing app pattern:
- trust the existence of `es` / `en`
- avoid hardcoded language fallbacks

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
- tiff
- gif
- scanned PDFs

### Native-extraction-capable
Examples:
- txt
- md
- html
- rtf
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

If processing is requested while any of those conditions is true, the app must:
- refuse to start
- explicitly tell the user to close the secondary windows and stop the stopwatch

## Processing UX

While extraction is running:
- the main window remains visible
- progress must be shown
- ETA must be shown and should be realistic
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

The user must be able to:
- overwrite current text
- append to current text
- choose repetitions

This flow must reuse current semantics for:
- overwrite/append meaning
- repetitions behavior
- MAX_TEXT_CHARS handling
- truncation notices
- related metadata behavior

## Abort policy

The user must be able to abort an in-flight extraction.

On abort:
- processing stops as soon as safely possible
- no extracted result is shown
- no partial result is surfaced
- current text remains unchanged
- no apply modal is shown
- the app leaves processing mode cleanly

## Error handling policy

On any failure:
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
- connectivity failure
- platform/runtime setup failure
- precondition failure
- user abort

## Substrate

The OCR substrate is not fixed yet.

Current leading candidate:
- Google Document AI

Reason to evaluate it first:
- likely best chance of approaching the OCR quality target for photographed pages and scanned PDFs
- supports the core file families needed by this feature

This epic does not treat Document AI as already chosen, but it must be evaluated as the primary candidate rather than just one option among many.

## Setup / billing / compliance

If the chosen substrate requires user-side setup, the feature must include:
- setup guidance
- credential onboarding
- billing onboarding if required
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

### Apply metadata
Must remain aligned with current semantics:
- source: import
- action: overwrite | append
- repetitions

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
- initial language scope is English and Spanish, following the app’s existing `es` / `en` pattern with no hardcoded fallbacks
- extraction cannot start while secondary windows are open or the stopwatch is running, and the user is explicitly told what to close/stop
- image files can be processed through OCR with visible progress, realistic ETA, and explicit failures
- native-capable files can be processed without OCR
- when both OCR and native extraction are viable, the user can choose
- PDFs are triaged correctly
- while processing is active, the main window and menu are blocked except for basic window actions and abort
- the processing lock is distinct from the startup lock
- after successful extraction, the user can choose overwrite/append and repetitions in a modal aligned with the current selector behavior
- MAX_TEXT_CHARS is enforced with explicit truncation notice
- failed or aborted extraction never mutates current text
- abort never shows partial extracted results
- the first implementation works on Windows
- the architecture remains viable for later macOS/Linux support
- required setup/billing/compliance surfaces are defined for the chosen substrate

## Open workstreams

- benchmark corpus definition, with emphasis on photographed book pages
- substrate evaluation, starting with Document AI
- route-availability model and PDF triage rules
- shared extraction/apply contracts
- processing-mode lock model, distinct from startup lock
- button entry point and picker behavior
- OCR route
- native extraction route
- route-choice UX when both routes are available
- overwrite/append/repetitions modal aligned with selector semantics
- progress, ETA, explicit errors, abort, and structured observability
- Windows packaging and future macOS/Linux boundaries
- user setup/billing flow
- in-app license/compliance surfaces

## Codex Operational Policy

* All repository evidence presented in chat must be cited using relative repository paths.
* Any operation that drifts, or may drift, from issue instructions must be explicitly disclosed in chat.
* Drift disclosures must identify:
  * the instruction being diverged from
  * why the divergence is necessary
  * expected impact/risk
  * whether execution paused for user confirmation or proceeded with rationale
* Any doubt, ambiguity, or contradiction in issue instructions must be surfaced to the user during operations.
* For high-impact or blocking ambiguity, Codex must ask before performing the operation.
* For low-impact ambiguity where operation proceeds, Codex must state the assumption and rationale immediately after the operation.
