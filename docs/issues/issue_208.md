# Epic: Reading test pool acquisition and import

## Objective

Allow users to acquire and install additional reading-speed-test pool files from inside the app, without manually locating the local config directory.

The feature should provide two complementary entry points in the reading-test pool modal:

1. an external link to the official Google Drive folder with additional test files;
2. an in-app import action for one or more `.json` and/or `.zip` files.

This is a follow-up to the reading-speed-test flow defined in `docs/issues/issue_52.md`. It does not replace the seeded starter pool; it extends the pool-management UX.

## Product rationale

The app already ships with a starter set of reading-test files and also allows technically capable users to create or copy files manually into the pool folder. However, manual installation has high friction:

* the user must discover where the local pool folder lives;
* the user must manually download files and place them correctly;
* the current UI does not expose an obvious path to get more official test material.

This follow-up reduces that friction while keeping the underlying pool model simple:

* distribution can still happen through external files;
* installation becomes an explicit in-app action;
* the pool remains file-based and user-visible.

## Scope

### In scope

* Add acquisition/install actions to the reading-test pool modal.
* Add an official external link to the Google Drive distribution folder.
* Add a native import flow for one or more `.json` and/or `.zip` files.
* Validate imported files before installation into the pool.
* Copy imported valid files into the local `reading_speed_test_pool` folder.
* Recompute the modal state immediately after import if the modal is still open.
* Report import results clearly to the user.

### Out of scope

* Automatic background synchronization with Google Drive.
* In-app browsing of the Google Drive folder contents.
* Automatic download and installation directly from Drive.
* Remote catalogs, remote manifests, or remote version negotiation.
* A package registry beyond the official Drive folder.
* Changing the underlying pool-file JSON model defined in Issue 52.

## UX placement

The reading-test pool modal should expose one pool-management row that contains:

* an external clickable link to get more files from the official Google Drive folder;
* a button to import files into the local pool;
* the existing `Reset pool` button.

Recommended order:

1. `Get more files`
2. `Import files...`
3. `Reset pool`

This means the acquisition/import entry points appear immediately to the left of `Reset pool` in the same row.

This row belongs together because all three actions manage pool availability:

* Drive link = acquire official files,
* Import = install files locally,
* Reset = restore local usage state.

## External Google Drive link

### Behavior

* The pool modal should contain a clickable link that opens the official Google Drive folder in the user's browser (`https://drive.google.com/drive/folders/1uvNX53NPITaO-jyzqQvr_uZffp28eP4F?usp=sharing`).
* The link should follow the app's existing external-link opening pattern and confirmation/authorization rules.
* It should not invent a separate mechanism just for the reading-test feature.

### Copy

Suggested label:

* `Get more files`

This should remain a link-like external action, not a normal in-app button.

The UI should make clear that:

* this is an external resource;
* it opens in the browser;
* it is the official location for more reading-test files.

### Drive folder structure (recommended content-side convention)

The official Drive folder should be organized by language.

Recommended structure:

* top-level folder:
  * one subfolder per language
* inside each language folder:
  * an `index`
  * brief instructions
  * the actual `.json` files
  * optionally curated `.zip` packs

The app does not need to parse that structure automatically in this issue; this is a content/distribution convention for the official folder.

## Import files action

### Entry point

Add a new button in the same row as the Drive link and `Reset pool`.

Suggested label:

* `Import files...`

This should remain a normal in-app button, not a hyperlink.

### Accepted inputs

The import dialog should allow selecting:

* one or more `.json` files,
* one or more `.zip` files,
* or a mixed selection of both in a single operation.

### Destination

All successfully imported files must be copied into the local reading-test pool folder:

* `config/saved_current_texts/reading_speed_test_pool/`

Imported files do not go anywhere else.

### Supported file semantics

Imported `.json` files are valid only if they satisfy the same reading-test pool file contract already defined by Issue 52:

* valid JSON;
* valid snapshot-style shape;
* non-empty `text`;
* valid `tags.testUsed`;
* valid optional descriptive tags;
* valid optional `readingTest`.

Files without `readingTest.questions` remain valid as speed-only files.

### `.zip` semantics

For `.zip` imports:

* the app should inspect the archive locally;
* only `.json` entries inside the archive are candidates for import;
* non-JSON entries inside the archive are ignored;
* each extracted `.json` candidate must be validated exactly like a direct `.json` import;
* invalid files inside the archive are skipped and reported in the final summary.

The app does not need to preserve subfolders from inside the archive in this first version unless that later proves necessary. A flat import into the pool folder is sufficient.

## Duplicate/conflict handling

Conflicts should be defined by destination filename inside the pool folder.

If the import set contains one or more filenames that already exist in the pool folder, the app should ask the user once how to proceed.

Recommended conflict options:

1. `Skip duplicates`
2. `Replace duplicates`
3. `Cancel import`

Recommended default:

* `Skip duplicates`

Behavior:

* `Skip duplicates`:
  * keep existing local files untouched,
  * import only non-conflicting files.
* `Replace duplicates`:
  * overwrite the destination file with the imported validated file.
* `Cancel import`:
  * abort the whole import operation before any write happens.

Conflict handling should be decided before the first write so the import remains coherent and reviewable.

## Validation and installation behavior

### Validation

Each candidate file must be validated before being copied into the pool.

Rejected candidates should include at least these broad categories:

* invalid JSON;
* invalid snapshot shape;
* invalid or missing required reading-test tags;
* invalid text payload;
* archive read/extract failure.

### Installation

Only valid candidates should be installed.

The import process should not partially write one invalid file and then attempt to "repair" it in place. Invalid files are skipped before installation.

### Recompute after import

If the reading-test pool modal is currently open when import finishes:

* recompute pool entries,
* recompute eligible-count display,
* recompute enabled/disabled filter options,
* recompute exhausted/non-exhausted state.

This should happen automatically without requiring the user to close and reopen the modal.

## Result reporting

After the import attempt completes, the app should show a clear result summary.

At minimum, report:

* imported count,
* skipped count,
* failed count.

If possible, also distinguish:

* skipped duplicates,
* invalid files,
* archive extraction failures.

The summary should be user-facing and brief, for example through the app's existing notification helpers.

An example result shape:

* `12 files imported`
* `3 skipped as duplicates`
* `2 failed validation`

The issue does not require a detailed on-screen report modal unless implementation simplicity makes one worthwhile.

## Interaction with existing pool logic

This feature must not change the existing semantics of:

* `testUsed`,
* pool reset,
* random eligible selection,
* optional comprehension questions,
* current-text vs pool-text test flow.

It only changes how new files can be acquired and installed.

Imported valid files should behave exactly like any other pool file after installation.

## Recommended implementation model

### Main process responsibilities

The main process should own:

* opening the native file picker;
* inspecting selected paths;
* archive handling for `.zip`;
* validation of imported files;
* destination-path enforcement;
* duplicate/conflict handling;
* writing validated files into the pool folder;
* returning an import summary to the renderer.

### Renderer responsibilities

The renderer should own:

* the pool-modal link/button UI,
* invoking the import flow,
* invoking the external Drive link through the existing external-link pattern,
* refreshing the modal state after a successful import operation,
* displaying the import summary through the existing notification helpers.

## Contracts

### New reading-test modal actions

The reading-test entry modal should gain:

* a Drive-link action,
* an `Import files...` action.

### Import command contract (draft)

Prefer a dedicated main-owned import command, for example:

* `importReadingTestPoolFiles()`

Expected broad result shape:

```json
{
  "ok": true,
  "imported": 12,
  "skippedDuplicates": 3,
  "failedValidation": 2,
  "failedArchiveEntries": 1
}
```

If the import is cancelled intentionally by the user, the result should distinguish that from a runtime failure.

### External link action

Do not create a special-case browser-opening mechanism. Reuse the current app pattern for external links and user authorization.

## Acceptance criteria

* The reading-test pool modal exposes:
  * an external Drive link,
  * an import button,
  * the existing reset button in the same management row.
* The Drive link opens through the same external-link handling pattern already used elsewhere in the app.
* The import flow accepts one or more `.json` and/or `.zip` files.
* Valid imported files are copied into `reading_speed_test_pool`.
* Invalid files are not imported.
* Duplicate/conflicting filenames are handled explicitly, not silently.
* After import, the reading-test pool modal refreshes immediately if still open.
* Imported files become available to the pool selector with the same semantics as seeded or manually copied files.
* User-facing import results are reported clearly.
* No dead/legacy code is left behind after implementation.

## Risks / constraints

* `.zip` support adds a dependency or archive-handling implementation choice.
* Duplicate handling must be explicit to avoid silent overwrites.
* Import should not bloat `electron/main.js` or `public/renderer.js`; prefer modularization.
* The Google Drive link is only a distribution entry point, not a runtime dependency.

## Implementation plan

1. Extend the pool modal UI.
   * Add the Drive link and `Import files...` button in the pool-management row beside `Reset pool`.

2. Wire the external Drive link (`https://drive.google.com/drive/folders/1uvNX53NPITaO-jyzqQvr_uZffp28eP4F?usp=sharing`)
   * Reuse the app's existing external-link opening pattern and authorization flow.

3. Add a dedicated main-owned import module.
   * Open a native file picker.
   * Accept one or more `.json` and/or `.zip`.
   * Enforce destination writes only inside `reading_speed_test_pool`.

4. Implement validation and archive handling.
   * Validate `.json` candidates against the existing pool-file contract.
   * Extract `.json` candidates from `.zip` archives and validate them the same way.

5. Implement duplicate/conflict handling.
   * Ask once how to handle conflicting filenames:
     * skip duplicates,
     * replace duplicates,
     * cancel import.

6. Install valid files and report a summary.
   * Copy validated files into the pool folder.
   * Return a concise import summary to the renderer.

7. Recompute modal state after import.
   * Refresh pool entries, eligible count, exhausted state, and filter availability immediately when the pool modal is open.

8. Add i18n and tests.
   * Add user-facing strings for the new actions, confirmations, and import summary.
   * Add focused manual/regression coverage for:
     * importing valid `.json`,
     * importing valid `.zip`,
     * invalid-file rejection,
     * duplicate handling,
     * modal refresh after import,
     * Drive link opening path.

## Implementation constraints

* Avoid inflating `electron/main.js` and `public/renderer.js`; prefer modularization.
* Follow repo coding style.
* Follow `log.js` logging policies.
* Use `public/js/notify.js` helpers for user-facing notices where appropriate.
* Do not keep legacy/dead/useless code after implementation.
* Initial i18n scope can remain limited to the currently shipped app languages already supported by the pool modal.
