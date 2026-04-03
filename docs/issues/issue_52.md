# Epic: Reading speed test flow (reading speed test -> preset creation)

## Objective

Provide an in-app reading speed test that:
1) explains the test and warns it will overwrite the current text,
2) loads a test text and starts the stopwatch immediately,
3) lets the user finish, computes WPM, and offers to save it as a preset (prefilled).

## Context / Problem

Users want to calibrate their personal WPM instead of guessing. The app already has:
- current text persistence/overwrite flows,
- a stopwatch/crono system,
- preset creation flows.
This epic stitches them into a single guided UX with clear user consent and consistent state transitions.

## Scope

- Add a dedicated "Reading speed test" entry point.
- On open:
  - Check the app is in steady state to continue.
  - Show an explanation screen/modal describing the test.
  - Explicitly warn that the current text will be overwritten (and any related implications).
  - Ask language, type and difficulty. The checkboxes that can be selected by the user are those that actually have at least one file in the pool that matches a possible combination of tags and, additionally, have the `used = false` tag. 
  - In the same modal there is a tiny button to restore the options and set all files in the pool tagged back to `used = false`.
  - There is a mirrored count mode toggle.
  - Provide a single "Start" button. It choose a random text from a pool, based on the chosen language, type and difficulty, and tag it `used = true` after that.
- Start flow:
  - Main window becomes blocked for the user interaction during the process.
  - Automatically open the manual editor window. It should open maximized or inmediatelly be maximized.
  - Automatically open the Floating Window.
  - Overwrite the app current text with the selected text. May use the same same semantics as existing overwrite flows, or even the same semantics as snapshot load.
  - Start the app stopwatch immediately, so the Floating Window shows the time running.
  - While running the Stopwatch during the test, Stop button not only should reset the Stopwatch, but cancel the test too: clean the Current Text, close the Editor, close the Floating Window, notify the test cancellation to the user, and unblock the main window.
- Finish flow:
  - User clicks "Pause" when finish reading.
  - A modal window appears containing 7 reading comprehension questions, each with 4 options. One question is a trick question: there is no true or false answer. 5 of the remaining 6 questions must be answered correctly to pass the test.
  - Automatically insert the cronometer computed WPM speed into the WPM input in the speed selector in the main window.
  - Automatically open the preset creation modal with prefilled editable values/strings:
    - Name: `Test <N>` (N should be a number).
    - WPM: the computed WPM.
    - Description: `Velocidad testeada del usuario (Test <N>).`
  - User can modify/save/cancel/close the preset modal with the same consequences as normal "Nuevo preset".

## Non-goals

- Long-term tracking/history of test results.
- Advanced analytics or multiple test types/difficulty calibration beyond the initial pool.
- External content import; the pool is internal.
- Changing the existing preset system semantics beyond invoking it.
- All of the previous non-goals could be implemented in follow-ups.

## Test content pool (draft; must be finalized before implementation)

- Store test texts as internal assets. 
- It could be in a dedicated subfolder in text snapshots folder.
- Each file is tagged with language, type (fiction/non-fiction), difficult (easy/normal/hard) and used (false/true).
- Each text ~5 minutes for an average adult reader.

## UX flow (mechanical)

(TODO)

## Contracts

### IPC / commands (draft)

(TODO)

### Persistencia
- None required for v1 of the test.

### Presets
- Must invoke the existing "new preset" flow with prefilled values.

## Acceptance criteria
- i18n:
  - all user-facing strings are translated via the i18n system.
- No silent fallbacks:
  - missing pool text / load failure produces an explicit user-visible error.

## Risks / constraints
- Consistency with counting mode (precise vs simple) and with `Intl.Segmenter` availability.
- Stopwatch authority and window focus interactions (ensure the start/stop is not fragile).
- Keeping the test window UX minimal and non-buggy.

## Breakdown (sub-issues)

(TODO)
