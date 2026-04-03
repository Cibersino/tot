# Epic: Snapshot save tags modal + metadata persistence

## Objective

Allow the user to attach optional tags to a text snapshot at save time:

* language
* type
* difficulty

The UX must insert a renderer modal **before** the native save-file dialog opens. The modal contains optional dropdown selectors for those three tags plus a final **Save Text Snapshot** button that then opens the native save dialog and completes the save.

The tags are not yet used for filtering or recommendations in this issue. They must be persisted now so future features can rely on them.

## Current behavior

Today, pressing the main-window snapshot save button (`💾`) immediately opens the native save dialog and writes a JSON snapshot with this minimal schema:

```json
{
  "text": "..."
}
```

There is no pre-save metadata step and no stored snapshot tags.

## Problem

The app already supports saving reusable text snapshots, but snapshots are currently opaque files with no structured classification. That limits future work such as:

* filtering snapshots by language;
* separating fiction vs non-fiction reading material;
* selecting texts by difficulty;
* building curated reading/test pools on top of the same persistence model.

If tagging is added later without first defining a save-time contract, older save flows will keep producing incomplete snapshot data and the UX will need a second migration step.

## Proposed behavior

When the user presses **Save Snapshot** in the main window:

1. Open a renderer modal first.
2. Show three optional selectors:
   * language
   * type
   * difficulty
3. Show a primary button: **Save Text Snapshot**.
4. Only when that button is pressed, continue into the existing native save dialog flow.
5. If the user confirms the native save dialog, persist the current text together with the selected tags.
6. If the user closes or cancels the modal, do not open the native save dialog.

The existing load behavior remains unchanged for now. Loading a snapshot still overwrites current text using the current pipeline; tags are only persisted and tolerated by the loader in this issue.
After a snapshot is loaded, the app current-text state continues to carry only text; snapshot tags remain stored in the snapshot file and are not transferred into active current-text state in this issue.

## Scope

### In scope

* Add a pre-save modal in the main renderer flow for current-text snapshots.
* Add optional dropdown selectors for snapshot tags.
* Persist selected tags in snapshot JSON.
* Keep legacy snapshots loadable.
* Extend snapshot validation to accept the new optional metadata shape.
* Add i18n keys for modal copy and tag option labels.
* Add/update tests and documentation for the new save flow.

### Out of scope

* Snapshot library browsing/filtering by tags.
* Editing tags after a snapshot has already been saved.
* Displaying tags inside the current load dialog.
* Search/recommendation logic that uses the tags.
* Migrating old snapshots on disk.

## Data contract

### Proposed snapshot schema

Existing snapshots must remain valid:

```json
{
  "text": "..."
}
```

New snapshots may include optional tags:

```json
{
  "text": "...",
  "tags": {
    "language": "es",
    "type": "fiction",
    "difficulty": "easy"
  }
}
```

### Notes

* `text` remains required.
* `tags` is optional.
* Each individual tag is optional.
* When a selector is left empty, that tag should be omitted rather than stored as an empty string.
* The loader must accept both:
  * legacy snapshots without `tags`;
  * tagged snapshots with a valid `tags` object.

## Tag model

### Stored values

Persist stable canonical values, not user-facing labels.

Recommended initial values:

* `language`: normalized code/slug such as `es`, `en`
* `type`: `fiction`, `non_fiction`
* `difficulty`: `easy`, `normal`, `hard`

### Display values

The UI may display human-readable localized labels such as:

* `Español`
* `English`
* `Fiction`
* `Non-fiction`
* `Easy`
* `Normal`
* `Hard`

This keeps future filtering logic stable even if labels change by locale.

## UX requirements

### Modal behavior

* Modal opens from the main window when the user presses snapshot save.
* Modal must be dismissible by:
  * explicit cancel button;
  * close button;
  * `Escape`;
  * backdrop click, if that matches current modal conventions in the app.
* The native save dialog must not appear until the user presses **Save Text Snapshot** inside the modal.
* The modal should default all selectors to empty / unselected.
* If the native save dialog is cancelled, no snapshot is written and no extra modal loop is required.

### Fields

* `language` dropdown:
  * empty
  * Spanish / `es`
  * English / `en`
  * designed so more languages can be added later
* `type` dropdown:
  * empty
  * fiction
  * non-fiction
* `difficulty` dropdown:
  * empty
  * easy
  * normal
  * hard

## Implementation plan

### Phase 1: modal contract in renderer

* Add a dedicated snapshot-save modal to the main window HTML/CSS/JS.
* Follow the existing renderer modal pattern already used elsewhere in the app.
* Expose a promise-based helper that returns either:
  * `null` on cancel/close;
  * `{ tags }` when the user confirms.

### Phase 2: snapshot save API extension

* Extend the renderer snapshot helper so `saveSnapshot(...)` can receive optional tag metadata.
* Extend the preload bridge so `saveCurrentTextSnapshot(...)` can accept a payload.
* Extend the main IPC save handler to read that payload.

### Phase 3: persistence contract

* Update save logic so new snapshots write:
  * `text`
  * optional `tags`
* Strip empty values before persisting.
* Keep the current path-safety and native-dialog behavior unchanged.

### Phase 4: load/validation compatibility

* Update snapshot parsing/validation so it accepts:
  * `{ text }`
  * `{ text, tags }`
* Reject malformed `tags` payloads explicitly instead of silently coercing invalid shapes.
* Preserve the current text-load semantics.

### Phase 5: i18n + docs + tests

* Add renderer i18n keys for:
  * modal title
  * field labels
  * empty-option labels
  * save/cancel buttons
  * tag option labels
* Update user docs that describe the snapshot save flow.
* Update smoke/regression coverage for:
  * modal appears before native save dialog;
  * saving with no tags;
  * saving with one tag;
  * saving with all tags;
  * loading legacy snapshot;
  * loading tagged snapshot.

## Affected areas

Expected code touchpoints:

* `public/index.html`
* `public/style.css`
* `public/renderer.js`
* `public/js/current_text_snapshots.js`
* `electron/preload.js`
* `electron/current_text_snapshots_main.js`
* `i18n/*/renderer.json`
* snapshot flow documentation/tests

## Acceptance criteria

* Pressing the main-window snapshot save button opens a tags modal before any native save dialog appears.
* The modal contains optional selectors for language, type, and difficulty.
* Pressing the modal confirm button opens the native save dialog.
* Cancelling or closing the modal does not open the native save dialog.
* Saving with no selected tags still works.
* Saving with any combination of selected tags persists those tags in snapshot JSON.
* Existing legacy snapshots without tags still load successfully.
* Tagged snapshots load successfully.
* Invalid tagged snapshot schema fails explicitly instead of being treated as valid.
* All new user-facing strings go through i18n.

## Risks / constraints

* The save flow currently jumps directly into native dialog handling; adding a modal introduces an extra async step that must not break guard/state behavior in the main window.
* Snapshot schema changes must remain backward-compatible or older user files will become unreadable.
* If labels are stored instead of stable values, future filtering and localization become harder.
* If empty selectors are serialized as empty strings, downstream consumers will have to distinguish “unset” from “invalid”; omission is cleaner.

## Breakdown

- [ ] Add snapshot tag modal markup/styles in the main window
- [ ] Implement renderer helper for prompting snapshot tags
- [ ] Change main-window snapshot save button flow to prompt first, save second
- [ ] Extend preload/API contract to pass optional save metadata
- [ ] Extend main snapshot save IPC to persist optional tags
- [ ] Extend snapshot parser/validator for optional tags
- [ ] Add i18n entries for modal copy and tag labels
- [ ] Update snapshot documentation
- [ ] Add/adjust smoke or regression coverage for tagged saves and backward-compatible loads
