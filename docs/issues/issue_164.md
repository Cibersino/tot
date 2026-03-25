# Task Name Required

## Summary

This issue captures the decision to make task names required in the task editor.

This is not just i18n cleanup. The unused key `renderer.tasks.alerts.name_required` exposed an unresolved product and validation gap in the task feature. The chosen direction is to keep the key and implement the missing behavior.

## Decision

Task names are required by design.

Implications:

- A task cannot be saved with an empty name.
- The task editor must block save and show `renderer.tasks.alerts.name_required` when the name is empty after trimming.
- Existing task files with empty `meta.name` must still be loadable, but they must be given a valid name before they can be saved again.
- Default save naming should continue to derive from the task name once that name is required.

## Why This Direction

Current evidence from the task feature:

- The task editor exposes a first-class task name field.
- There is already an i18n key for a required-name alert.
- Saving unnamed tasks currently falls back to generic filenames like `task.json`, which weakens task identity.
- Treating names as required gives the feature a clearer object model and aligns better with save/load/delete flows.

## Current Behavior

Renderer:

- `validateBeforeSave()` rejects empty row text but not empty task names.
- The editor writes `meta.name = name || ''`.
- The save path proceeds even when the trimmed task name is empty.

Main:

- The save flow accepts an empty `meta.name`.
- Filename generation falls back to `task` when the name is empty.

Result:

- The visible task name field behaves as optional even though the UI and translations suggest otherwise.

## Required Changes

### 1. Renderer validation

- Update task save validation to reject an empty trimmed task name.
- Show `renderer.tasks.alerts.name_required`.
- Keep the existing row-text validation.
- Ensure the validation order is explicit and stable.

### 2. Loaded unnamed tasks

- Continue allowing older task files with empty `meta.name` to load.
- Do not silently rewrite the task on load.
- Require the user to enter a valid name before re-save.

### 3. Save semantics

- Keep save behavior based on the validated task name.
- Preserve current filename sanitization rules.
- Re-check success and error notices after validation changes.

### 4. i18n cleanup follow-up

- Keep `renderer.tasks.alerts.name_required`.
- Do not remove it as unused once the required-name behavior is implemented.

## Out Of Scope

- Redesigning the broader task save model.
- Renaming files automatically when a loaded task name changes.
- Bulk migration of existing task files.
- General task-editor UX polish unrelated to required-name enforcement.

## Implementation Plan

1. Confirm the current save validation entry point in the renderer.
2. Add required-name validation using the existing i18n alert.
3. Verify that unnamed task files still load normally.
4. Verify that unnamed loaded tasks cannot be re-saved until named.
5. Re-check whether any other stale code or messages remain around task naming.

## Acceptance Criteria

- Saving with an empty or whitespace-only task name is blocked.
- The user sees `renderer.tasks.alerts.name_required`.
- Saving with a valid task name still works.
- Existing unnamed task files can be opened.
- Existing unnamed task files cannot be re-saved without first entering a name.
- `renderer.tasks.alerts.name_required` is now live and justified by runtime behavior.

## Notes

- This issue exists because the i18n audit surfaced a feature-level inconsistency, not because localization itself was the main problem.
- This issue should be completed before deciding any further cleanup around task-name-related translations.
