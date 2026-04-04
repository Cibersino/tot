# Epic: Reading speed test flow (reading speed test -> preset creation)

## Objective

Provide an in-app reading speed test that:
1. explains the test and warns it will overwrite the current text,
2. loads a test text and starts the stopwatch immediately,
3. lets the user finish, computes WPM, combines it with reading comprehension when questions exist for the selected file, and offers to save it as a preset (prefilled).

## Product assumptions

- This is a trust-based self-calibration feature, not an anti-cheat or competitive system.
- If the user edits the text or otherwise distorts the result, they only harm their own calibration.
- Reusing existing app primitives is preferred over inventing parallel systems:
  - current text overwrite/persistence,
  - crono / floating window,
  - preset creation modal,
  - snapshot-style JSON files and snapshot folder semantics.

## Context / Problem

Users want to calibrate their personal WPM instead of guessing. The app already has:
- current text persistence/overwrite flows,
- a stopwatch/crono system,
- preset creation flows,
- snapshot JSON files that can already act as reusable text containers.

This epic stitches them into a single guided UX with clear user consent and consistent state transitions.

## Scope

- Add a dedicated "Reading speed test" entry point.
- On open:
  - Check the app is in a steady state to continue.
  - Prefer reusing the same general notion of preconditions already used by other gated flows:
    - main window READY,
    - no processing-mode lock,
    - no conflicting secondary windows,
    - stopwatch not already running.
  - If blocked, the intro modal does not open and the user receives one clear advice/notice for the blocked state rather than a granular reason-by-reason breakdown.
  - Show an explanation screen/modal describing the test.
  - Explicitly warn that the current text will be overwritten, and that this test is meant for self-calibration.
  - Explicitly state that editing the text during the test is allowed but will affect the result.
  - Ask language, type, and difficulty using checkbox-style controls.
  - Checked boxes act as positive filters only.
  - If no boxes are checked in a category, that category imposes no restriction.
  - These controls must reflect real available combinations from the current pool, not independent category lists.
  - A checkbox should be enabled only if checking it would still leave at least one eligible pool file with `testUsed = false` under the current partial selection.
  - Impossible boxes must be disabled.
  - The modal should show a live count of currently eligible files.
  - If there are no pool files with `testUsed = false`, the test flow is cancelled immediately and the user is informed of the reason.
  - As the user changes the current partial selection, the enabled/disabled state of the remaining controls must update accordingly so the UI never leads into an impossible filter state.
  - Each time the user checks or unchecks a box, all checkboxes should become temporarily disabled until the recomputation of availability is finished and the modal stabilizes.
  - `Start` should also be temporarily disabled during that recomputation.
  - Once the modal has stabilized, the user may check or uncheck any currently enabled box in any order.
  - Expose a small reset action in the same modal to restore pool usage state by setting all pool files in the dedicated pool folder back to `testUsed = false`.
  - The reset action should ask for confirmation before applying the change.
  - After reset, the modal should run the same stabilization cycle as after a checkbox change:
    - temporarily disable checkbox interaction,
    - temporarily disable `Start`,
    - recompute the eligible set,
    - recompute the enabled/disabled state of every checkbox,
    - update the live eligible count,
    - re-enable interaction only after the modal stabilizes.
  - Provide a single "Start" button. It chooses a random text from the eligible pool for the chosen filters.

- Start flow:
  - Main window becomes blocked for user interaction during the active test session.
  - Main-window stopwatch controls are not user-interactive during the active test session.
  - Automatically open the manual editor window.
  - If the editor is not maximized, maximize it.
  - If the session forces the Editor Window to maximize, that maximized state may overwrite the user's persisted editor-window state. That's not a problem.
  - Automatically open the Floating Window.
  - Overwrite the app current text with the selected text.
  - Reuse canonical overwrite semantics already used by existing flows wherever possible.
  - Start the app stopwatch immediately after the text is applied successfully, so the Floating Window shows the time running.
  - Mark the selected pool file as `testUsed = true` after the text has been successfully chosen/applied.
  - During the active test session, the existing Floating Window stopwatch controls are session-owned:
    - the running-session pause/toggle action is the explicit "finish reading" action for the test flow,
    - the reset action is the explicit cancellation action for the test flow,
    - there is no pause-then-resume branch inside the guided reading-test session.
  - While the test session is active, Stop/Reset should not only reset the stopwatch but also cancel the test:
    - the user-interactive surfaces for the active session are the Editor Window and the Floating Window,
    - the Floating Window exposes the session controls, while the Editor Window is the reading surface,
    - the main-window stopwatch controls remain blocked,
    - stop/reset the crono,
    - clear the current text,
    - close the Editor,
    - close the Floating Window,
    - notify the cancellation to the user,
    - unblock the main window.

- Finish flow:
  - User clicks "Pause" in the Floating Window when finished reading.
  - The app computes WPM from the authoritative crono elapsed time and the current text stats under the active count mode.
  - The Editor window closes.
  - The Floating Window closes.
  - If the selected file includes a valid comprehension-question payload, a questions modal appears and inserts itself into the flow before preset creation.
  - If the selected file does not include a valid comprehension-question payload, that modal does not appear and the flow continues directly.
  - Automatically insert the computed WPM into the WPM input in the speed selector in the main window before opening the preset modal.
  - Automatically open the preset creation modal with prefilled editable values/strings:
    - Name: `Test <N>` (N should be a number).
    - WPM: the computed WPM.
    - Description: `Velocidad testeada del usuario (Test <N>).`
  - The preset modal opens immediately after the questions step resolves, or immediately after `Pause` when there is no questions step.
  - The preset modal is modal relative to the main window.
  - The main window remains blocked until the preset modal is closed.
  - User can modify/save/cancel/close the preset modal with the same consequences as normal "Nuevo preset".
  - Once the preset modal closes, the guided reading-test flow is finished and the main window returns to normal interaction.

## Pool / content model

- The test-file pool should live in a dedicated subfolder inside the snapshots directory.
- This is intentional:
  - users can load any test file as current text,
  - users can author and save their own test files,
  - the app keeps one coherent JSON file model instead of introducing a separate content type.
- Files in the pool should remain ordinary snapshot JSON files with additional metadata relevant to the reading-test flow.
- Because these are ordinary snapshot JSON files, the normal snapshot feature must accept them as valid snapshot files.
- When such a file is loaded through the normal snapshot flow, only `text` is applied to current-text state; reading-test metadata remains stored in the file.
- Each pool file must carry `tags.testUsed` (`false` / `true`).
- `tags.language`, `tags.type`, and `tags.difficulty` are descriptive selection tags:
  - they may be present,
  - they may be absent,
  - and absence does not invalidate the file as a pool file.
- If a category is not actively filtered by checked boxes, files are not excluded based on that category.
- When a user saves a snapshot, the file should default to `testUsed = false`, regardless of whether the user saves it inside or outside the dedicated pool folder.
- The selector in the first modal must be derived from the real set of remaining pool files, not from hardcoded category availability.
- Eligibility for the test flow should not require comprehension questions to exist.
- A file with no valid questions payload can still participate in the reading-speed flow.
- A file with a valid questions payload participates in the reading-speed + comprehension flow.
- (Not mandatory, just a recommendation) Each text should target roughly ~5 minutes for an average adult reader.

## Pool selection algorithm

- The first modal allows multiple checked values within each category.
- Selection semantics are:
  - OR within a category,
  - AND across categories that are actively filtered.
- A category is actively filtered only when one or more boxes are checked in that category.
- If no boxes are checked in a category, that category behaves as a wildcard and imposes no restriction.
- A file is eligible for selection when all of the following are true:
  - `tags.testUsed = false`,
  - if one or more language boxes are checked, the file's `tags.language` matches one of those checked language values,
  - if one or more type boxes are checked, the file's `tags.type` matches one of those checked type values,
  - if one or more difficulty boxes are checked, the file's `tags.difficulty` matches one of those checked difficulty values.
- If all categories are left unchecked, the eligible set is all remaining pool files with `testUsed = false`.
- If there are no remaining pool files with `testUsed = false`, the modal must not proceed and the user must be informed that there are no remaining eligible files.
- `Start` is enabled only when the current selection yields at least one eligible file.
- The modal shows a live count of the current eligible set.
- Whenever the user checks or unchecks a box:
  - all checkbox interaction is temporarily disabled,
  - `Start` is temporarily disabled,
  - the eligible set is recomputed,
  - all checkbox enabled/disabled states are recomputed,
  - the live eligible count is updated,
  - interaction is re-enabled only after the modal stabilizes.
- Once the user presses `Start`, the final file choice is made by uniform random selection among all currently eligible files.
- The selection algorithm does not prefer files with questions over files without questions.
- A valid questions payload affects only the inserted post-pause questions step, not the random weighting of the selected file.

## Preconditions and blocking model

- The reading speed test is a guided, stateful flow with exclusive ownership of current-text state and crono state from successful `Start` until `Pause` or cancellation.
- Entry preconditions:
  - main window READY,
  - no processing-mode lock,
  - no conflicting secondary windows,
  - crono not already running.
- If entry preconditions are not met:
  - the reading-test intro/config modal does not open,
  - the user receives one clear advice/notice telling them the test cannot start from the current app state.
- Active test session:
  - begins immediately after successful `Start`,
  - ends only on `Pause` or cancellation via `Stop/Reset` from the Floating Window.
- During the active test session:
  - the main window is blocked for normal interaction,
  - main-window stopwatch controls are not user-interactive,
  - unrelated main-window actions and menu actions are blocked,
  - current text and crono state are owned by the test flow.
- During the active test session, the floating-session controls are not only generic stopwatch controls anymore:
  - pressing the running-session pause/toggle control finalizes the reading phase and continues into the finish flow,
  - pressing reset cancels the test session,
  - the guided session does not support pause/resume cycling.
- During the active test session, the user-interactive surfaces are the Editor Window and the Floating Window.
- During the active test session:
  - the Editor Window is the reading surface,
  - the Floating Window is the session-control surface.
- Inserted questions step:
  - if the selected file has valid questions, the questions modal appears after `Pause`,
  - the questions modal is an inserted step in the same guided path, not a separate branch,
  - the questions modal should be opened as a modal child of the main window,
  - while it is open, it is the only user-interactive surface of the flow,
  - while that modal is open, the guided flow is still not complete and the main window remains blocked for normal interaction,
  - pressing `Continue` closes the questions modal and immediately advances to preset creation,
  - closing the questions modal via the normal window close affordance has the same effect as pressing `Continue`,
  - once the questions modal has been closed for that test session, it is not reopened again.
- Inserted preset step:
  - after the questions step resolves, or immediately after `Pause` when no questions step exists, the preset modal opens,
  - the computed WPM is already written into the main window before that modal opens,
  - the preset modal is modal relative to the main window,
  - while it is open, the guided flow is still not complete and the main window remains blocked for normal interaction,
  - once the preset modal closes, the guided flow is complete and the main window returns to normal interaction.
- After `Pause`:
  - the active reading session is over,
  - the Editor window is closed,
  - the Floating Window is closed,
  - progression continues through the optional inserted questions step and then to preset creation.

## Questions / comprehension model

- The questions branch is conditional on the selected file carrying a valid questions payload.
- If questions exist, the modal appears after Pause and before preset creation.
- If questions do not exist, the flow continues directly after Pause.
- The modal should insert itself into the existing path, not fork it into a separate feature flow.
- Questions are multiple-choice and single-selection:
  - the user can select only one option per question,
  - each question has one and only one correct answer.
- Different questions may have different numbers of options.
- Question order in the JSON array is the display order in the modal.
- Option order in each question array is the display order for that question.
- The modal should contain:
  - the questions themselves,
  - a visible corner summary of the probable percentage of correct answers if one were to answer randomly,
  - a visible corner feedback box containing the developer email address for complaints,
  - a button to evaluate the currently selected answers,
  - a separate button to continue and resume the interrupted path.
- Suggested core controls:
  - `Check result`
  - `Continue`
- On open, the modal starts with:
  - no result summary shown yet,
  - no low-score warning shown yet,
  - the current saved selections initialized to empty.
- The user may select at most one option per question at any given time.
- If the user presses `Check result` with one or more unanswered questions:
  - the modal should not compute a result yet,
  - the modal should show an internal warning telling the user that all questions must be answered before evaluating.
- If all questions are answered and the user presses `Check result`:
  - the modal computes the aggregate result,
  - the modal displays `X / T` and percentage,
  - the modal may display the low-score warning if the threshold rule is met,
  - the modal must not reveal which specific answers were correct or incorrect.
- After `Check result`, the user may change any selection and press `Check result` again as many times as desired.
- Re-checking completely replaces the previous aggregate result display with the newly computed one.
- `Continue` resumes the interrupted main path after the questions modal step.
- `Continue` does not require any minimum score.
- `Continue` should be available even if the user never pressed `Check result`.
- The modal should not turn the questions step into a pass/fail gate unless the issue is explicitly changed later.
- Closing the questions modal via the normal window close affordance should have the same effect as pressing `Continue`.
- The random-guess baseline must account for the number of options in each question:
  - `expectedCorrectRandom = sum(1 / optionCount_i)` across all questions,
  - `randomGuessPercentage = (expectedCorrectRandom / totalQuestions) * 100`.
- Once the user evaluates the answers, the modal should display:
  - `X` out of `T` correct answers,
  - the corresponding percentage.
- The modal must not reveal which specific answers were correct or incorrect.
- If the user's percentage of correct answers is below `5 / 3` times the random-guess percentage, the modal should show an internal warning that the user may have read the questions too hastily.
- Continuing after the modal does not require the user to reach any minimum score; the modal informs but does not block progression.
- The random-baseline box and feedback box should remain visible regardless of whether the user has already checked a result.

## Persistence

- This feature requires persistence because pool files must remember `testUsed`.
- `testUsed` is stored inline in the snapshot JSON file.
- Once a selected pool file has been successfully applied/revealed for a test session, cancellation does not roll `testUsed` back to `false`; the text has already been exposed to the user.
- Resetting the pool rewrites all pool files in the dedicated pool folder back to `testUsed = false`.
- Resetting the pool is a confirmed action and is followed by immediate selector recomputation.

## Distribution / seeding

- Because the pool lives under user-local config, the app package itself will not contain the runtime files in place.
- The app should seed official starter files into the local config area using the same general strategy already used for preset JSON distribution:
  - bundled source files copied into the writable local config tree when needed.
- Additionally, the app and website may provide a visible button/link to an official Google Drive folder where users can download more test files.
- The product should provide lightweight instructions for how to place downloaded files into the correct pool directory.

## UX flow (mechanical draft)

1. User clicks "Reading speed test".
2. App runs precondition check.
3. If blocked, app shows explicit guidance and does nothing else.
4. If allowed, app opens the intro/config modal.
5. User reviews overwrite warning, trust-based nature of the test, and filter options derived from real available combinations in the pool.
6. User clicks "Start".
7. App selects an eligible text from the pool, applies it as current text, opens Editor (maximized) + Floating Window, and starts crono.
8. App marks the chosen pool file as `testUsed = true`.
9. During the test, main window stays interaction-blocked.
10. User reads the text. They may edit it, but the result will reflect the final text/time state.
11. During this stage, the user-interactive surfaces are the Editor Window and the Floating Window.
12. If user presses Stop/Reset during the active session, the test is cancelled with the defined cancellation cleanup.
13. If user presses Pause in the Floating Window, the app finalizes the speed result and closes the Editor + Floating Window.
14. If the file has valid comprehension questions, show the questions modal as an inserted step in the path.
15. Inside that modal, the user may evaluate answers repeatedly, review aggregate results, optionally see the low-score warning, and then continue.
16. If the file has no valid comprehension questions, skip that inserted step.
17. App writes the computed WPM into main.
18. App opens the preset modal prefilled.
19. While the preset modal is open, the main window remains blocked.
20. User saves/edits/cancels the preset as usual.
21. When the preset modal closes, the guided flow is complete and the main window returns to normal interaction.

## Contracts

### IPC / commands (draft)

- Prefer a dedicated main-owned reading-test session controller instead of scattering ad hoc flags across renderer code.
- Likely responsibilities:
  - open/start session,
  - select eligible text from pool,
  - reset pool usage state,
  - cancel active session,
  - finish active session / finalize computed result,
  - detect whether the chosen file has a valid questions payload and route the finish flow accordingly,
  - expose reading-test session state and block state to renderer/menu integrations,
  - expose session state to renderer if needed.
- The questions modal may compute its own aggregate result and warning threshold locally from the validated selected-file payload; that UI logic does not need to be centralized in the session controller.
- Reuse existing IPC where sensible:
  - current text apply,
  - crono state / toggle / reset,
  - open editor,
  - open floating window,
  - open preset modal.

### Snapshot JSON shape (draft)

- The reading-speed feature should build on the snapshot JSON shape rather than inventing a separate file type.
- Test-capable files remain ordinary snapshot JSON files and extend the existing `tags` object.
- Draft shape:

```json
{
  "text": "Full reading text here.",
  "tags": {
    "language": "es",
    "type": "fiction",
    "difficulty": "normal",
    "testUsed": false
  },
  "readingTest": {
    "questions": [
      {
        "id": "q1",
        "prompt": "Question text here.",
        "correctOptionId": "b",
        "options": [
          { "id": "a", "text": "Option A" },
          { "id": "b", "text": "Option B" },
          { "id": "c", "text": "Option C" }
        ]
      }
    ]
  }
}
```

- Required fields for a pool file:
  - `text`: non-empty string,
  - `tags.testUsed`: boolean.
- Optional descriptive selection tags:
  - `tags.language`: supported language tag when present,
  - `tags.type`: `fiction` or `non_fiction` when present,
  - `tags.difficulty`: `easy`, `normal`, or `hard` when present.
- The snapshot validator/loader must treat `tags.testUsed` and optional `readingTest` as valid schema for these files.
- Missing `tags.language`, `tags.type`, or `tags.difficulty` does not invalidate the file.
- A file with a missing descriptive tag still participates in the pool whenever that category is not actively filtered.
- `readingTest` is optional.
- If `readingTest` is absent, the file is still eligible for the speed flow.
- If `readingTest.questions` exists and is valid, the questions modal must appear.
- If `readingTest.questions` is absent or invalid, the file remains eligible for the speed flow and the questions modal must not appear.
- A valid questions payload means:
  - `questions` is a non-empty array,
  - each question has a non-empty string `id`,
  - question `id` values are unique within the file,
  - each question has a non-empty `prompt` string,
  - each question has a non-empty string `correctOptionId`,
  - each question has an `options` array with at least 2 options,
  - each option has a non-empty string `id`,
  - option `id` values are unique within that question,
  - each option has a non-empty `text` string,
  - each question's `correctOptionId` matches exactly one option `id` in that question.
- The number of options may vary from question to question.
- Question IDs and option IDs are structural identifiers for validation/scoring and are not user-facing.
- Empty strings are invalid for `question.id`, `question.prompt`, `question.correctOptionId`, `option.id`, and `option.text`.
- Duplicate option text is allowed; correctness is determined by `correctOptionId`, not by display text.
- The random-guess baseline displayed in the questions modal is derived from the number of options in each question.
- Unknown extra fields may exist, but they do not affect eligibility or scoring unless explicitly adopted by the feature later.

### Presets

- Must invoke the existing "new preset" flow with prefilled values.
- Should not create a parallel preset persistence path.

## Open decisions

1. Exact folder name for the dedicated test-file pool under the snapshots directory.

## Non-goals

- Anti-cheat enforcement.
- Long-term tracking/history of test results.
- Advanced analytics or multiple test types/difficulty calibration beyond the pool-and-questions model described here.
- External content import beyond user-managed JSON files placed in the snapshots/pool structure.
- Changing the existing preset system semantics beyond invoking it.

## Acceptance criteria

- i18n:
  - all user-facing strings are translated via the i18n system.
- No silent fallbacks:
  - missing pool text / pool exhaustion / load failure produce explicit user-visible errors.
- Session coherence:
  - start, cancel, and finish semantics are explicit and consistent.
- Preconditions and blocking:
  - if the test cannot start, the user gets one clear blocked-state advice,
  - during the active session, main-window interaction is blocked,
  - during the active session, the user-interactive surfaces are the Editor Window and the Floating Window,
  - during the active session, the Floating Window pause/toggle control finalizes the reading phase and reset cancels the session,
  - the guided test session does not support pause/resume cycling,
  - after `Pause`, the Editor and Floating Window close before the optional questions step / preset step continues.
- Trust-model clarity:
  - the intro flow clearly states that the test is for self-calibration and that editing affects the result.
- Result integration:
  - computed WPM is inserted into the main speed selector and can flow directly into the normal preset modal.
- Pool behavior:
  - selection only draws from eligible `testUsed = false` texts,
  - once a selected file has been revealed for a test session, cancellation does not return it to the unused pool automatically,
  - reset action restores the pool usage state explicitly,
  - reset asks for confirmation,
  - reset recomputes the selector state immediately after completion,
  - checked boxes act as positive filters only,
  - categories with no checked boxes behave as wildcards,
  - impossible boxes are disabled,
  - the modal shows a live count of eligible files,
  - the selector temporarily disables interaction while availability is recomputed after each checkbox change,
  - if there are no remaining files with `testUsed = false`, the test is cancelled and the user is informed of the reason,
  - the final file choice is uniform random among the eligible files.
- Questions branch:
  - if the selected file contains valid questions, the questions modal appears and the finish flow uses it,
  - if the selected file does not contain valid questions, the finish flow skips that modal without error,
  - the modal shows aggregate result only (`X / T` and percentage),
  - the modal shows the random-guess baseline percentage derived from the actual option counts,
  - the modal allows repeated re-evaluation without revealing which individual answers are correct,
  - the modal includes a separate continue button that resumes the interrupted path.
- Snapshot authoring compatibility:
  - users can save and manage their own test-capable JSON files within the snapshots tree.
- Snapshot loading integration:
  - these files remain loadable through the normal snapshot feature without schema rejection,
  - normal snapshot load still applies only `text` to current-text state.

## Risks / constraints

- Consistency with counting mode (`precise` vs `simple`) and with `Intl.Segmenter` availability.
- Stopwatch authority and window focus interactions (ensure start/stop/cancel is not fragile).
- Keeping the optional-questions branch explicit so the UX does not become ambiguous.
- Keeping the test UX minimal and non-buggy.
- If comprehension questions exist for many files, the content burden and localization scope increase significantly.

## Implementation plan

1. Add a main-owned reading-test session controller.
   - Own precondition checks, active-session state, main-window blocking, selected-file metadata, cancellation, and finish handoff.
   - Reuse the existing guarded-action and secondary-window/precondition patterns where possible.

2. Extend snapshot schema support and pool helpers.
   - Accept `tags.testUsed` and optional `readingTest` in snapshot validation/load flows.
   - Default snapshot saves to `testUsed = false`.
   - Add helpers to scan the pool folder, compute filter availability, mark selected files as used, and reset the pool.

3. Implement the intro/config modal in the main renderer.
   - Show explanation + overwrite warning + trust-model notice.
   - Render checkbox filters from real pool combinations.
   - Implement live eligible-count updates, temporary stabilization lock, and confirmed pool reset.

4. Implement session start orchestration.
   - Select one eligible pool file uniformly at random.
   - Apply its text through canonical current-text overwrite semantics.
   - Open Editor + Floating Window, maximize Editor if needed, start crono, and mark the selected file as `testUsed = true`.
   - Activate the test-session block state so main-window actions and menu actions are guarded correctly.

5. Implement session-owned floating-window behavior.
   - While a reading-test session is active, reinterpret floating pause/toggle as finish-reading and floating reset as cancel-test.
   - Keep the normal stopwatch behavior unchanged outside the reading-test session.

6. Implement finish flow and optional questions step.
   - On finish, compute WPM from authoritative elapsed time and current text stats under the active count mode.
   - Close Editor + Floating Window.
   - If the selected file has valid questions, open the inserted questions modal; otherwise continue directly.
   - Keep the main window blocked until this inserted step resolves.

7. Integrate preset creation handoff.
   - Write the computed WPM into the main speed selector.
   - Open the existing preset modal prefilled with the reading-test values.
   - Keep the main window blocked until the preset modal closes, then tear down the session cleanly.

8. Complete i18n, seeded content plumbing, and tests.
   - Add all new user-facing strings to i18n.
   - Implement starter-pool seeding and optional distribution link wiring.
   - Add regression/manual coverage for pool exhaustion, schema compatibility, session blocking, finish/cancel behavior, optional questions, and preset handoff.

## Follow-up: use current text directly

- Add a second explicit start action in the first modal:
  - `Start with current text`
- This is a parallel entry into the same guided reading-test flow, but it does not replace or restructure the existing pool path.
- The existing pool UI remains visible exactly as it is:
  - filters,
  - live eligible count,
  - reset pool action.
- Those pool controls still belong only to the pool path.
- `Start with current text` ignores the pool filters and pool selection state entirely.
- `Start with current text` should be enabled only when:
  - the normal reading-test entry preconditions are satisfied,
  - current text is non-empty.
- Current-text start semantics:
  - use the already loaded current text directly,
  - do not choose any file from the pool,
  - do not overwrite current text with a pool file,
  - do not touch any `testUsed` state,
  - open Editor + Floating Window and start crono exactly like the pool path.
- During the active session, trust-model semantics remain the same:
  - the user may edit the text,
  - the final result reflects the final text/time state.
- Finish semantics for current-text mode:
  - compute WPM the same way as the pool path,
  - write the computed WPM into the main selector,
  - open the preset modal prefilled the same way,
  - skip the questions modal by default.
- The default follow-up assumption is:
  - current-text mode does not carry a comprehension/questions payload,
  - therefore current-text mode is speed-only unless the issue is explicitly extended later.
- Cancellation semantics for current-text mode differ from the pool path:
  - stop/reset crono,
  - close Editor,
  - close Floating Window,
  - do not clear current text,
  - notify cancellation,
  - unblock the main window.
- This difference is intentional:
  - pool mode reveals a selected external test text and owns that replacement,
  - current-text mode reuses the user's already loaded text and must not destroy it on cancellation.

### Follow-up implementation plan

1. Extend the entry modal with a second action button.
   - Keep the existing pool controls and pool start action unchanged.
   - Add `Start with current text` as a separate button in the same action area.

2. Add a current-text start path in the main-owned session controller.
   - Reuse the same entry precondition check.
   - Validate that current text is non-empty before starting.
   - Start the guided session without touching pool selection or `testUsed`.

3. Reuse the same active-session orchestration.
   - Open Editor + Floating Window.
   - Maximize Editor if needed.
   - Start crono.
   - Keep the same blocking and session-owned Floating Window behavior.

4. Add mode-specific cancellation handling.
   - Preserve the existing pool cancellation path.
   - Add a current-text cancellation path that leaves current text unchanged.

5. Reuse the same finish-to-preset handoff.
   - Compute WPM exactly as in pool mode.
   - Apply WPM to main.
   - Open the prefilled preset modal.
   - Skip questions in current-text mode unless a future extension explicitly adds metadata support for them.

6. Add focused regression/manual coverage.
   - verify `Start with current text` is disabled when current text is empty,
   - verify it starts a session without changing pool state,
   - verify cancellation preserves current text,
   - verify finish reaches preset creation normally.

## Implementation constraints

- Avoid inflating [main.js](c:/Users/manue/Documents/toT/tot/electron/main.js) and [renderer.js](c:/Users/manue/Documents/toT/tot/public/renderer.js).
  - Prefer feature modularization in dedicated files/modules and keep those entrypoints focused on orchestration/wiring.
- Follow the repository coding style and existing module structure conventions.
- Follow the logging policies established by [log.js](c:/Users/manue/Documents/toT/tot/electron/log.js) and [log.js](c:/Users/manue/Documents/toT/tot/public/js/log.js).
- Use the existing notification helpers in [notify.js](c:/Users/manue/Documents/toT/tot/public/js/notify.js) where user-facing notifications are needed.
- Do not keep legacy, dead, or useless code after implementation changes.
  - Clean up obsolete branches, placeholders, and transitional code introduced during the feature work.
- For this feature, add i18n keys only for `es` and `en` for now.

## Codex implementation policy

- Any implementation step that materially drifts from this issue's plan or decisions must be made explicit before proceeding.
- Do not rush implementation.
  - Prefer a deliberate, reviewable sequence of small coherent changes over fast patch stacking.
- Re-read the current issue state before making substantial changes so implementation stays aligned with the latest agreed decisions.
- Do not silently reinterpret settled product decisions as implementation shortcuts.
- If a code-level constraint forces a meaningful deviation from the documented plan, surface it explicitly and update the issue deliberately instead of letting the code drift away from the spec.

## Breakdown (draft sub-issues)

- Entry point + precondition check.
- Intro/config modal.
- Pool folder + seeding/distribution.
- Snapshot JSON/schema extension (`testUsed` + optional questions payload).
- Active session orchestration (text apply + crono + window control + blocking).
- Finish flow -> optional questions modal -> computed WPM -> prefilled preset modal.
- i18n + tests.
