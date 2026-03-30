## Summary

This issue adds a time-multiplier control to the main window’s count results section.

Today the results area shows one estimated reading time derived from the current text and WPM.
The requested change is to let the user enter a natural-number multiplier below that estimated time and immediately see the multiplied total time to the right of the input.

This is a UI and renderer-behavior issue for the main count view.

## Scope

This issue covers:

- adding a multiplier input in the main window results section
- showing a derived multiplied-time result next to that input
- recalculating the multiplied result when the base estimated time changes
- recalculating the multiplied result when the multiplier changes
- validating the input as a natural number

This issue does not cover:

- changing the existing base estimated-time calculation
- changing word or character counting rules
- adding persistence for the multiplier unless that is explicitly decided later
- changing stopwatch behavior

## Current Runtime Evidence

Current main-window results UI:

- `public/index.html` contains the count results section
- `public/index.html` shows the main estimated time in `#resTime`
- `public/renderer.js` updates the estimated time in `updatePreviewAndResults(...)`
- `public/renderer.js` also updates the estimated time in `updateTimeOnlyFromStats()`
- `public/style.css` styles the results section and highlighted time area

Current behavior:

- the main window shows one estimated reading time
- there is no multiplier input in the results section
- there is no derived “estimated time x N” display

## Required Behavior

### 1. Add a multiplier input under the estimated time

The results section should include a numeric input directly below the existing estimated-time display.

Requirements:

- accepts natural numbers only
- should be visually part of the results area
- should be clearly labeled as a time multiplier

### 2. Show the multiplied time to the right of the input

When the multiplier has a valid natural-number value, the UI should show the result of:

`estimated time × multiplier`

This derived result should appear to the right of the multiplier input.

### 3. Keep the derived result live

The multiplied-time display should update when either of these change:

- the current estimated time changes because text/WPM/count mode changed
- the multiplier input value changes

### 4. Handle invalid or empty input deliberately

The input should not allow non-natural-number values as a valid result state.

Expected rule:

- valid values are `1, 2, 3, ...`
- `0`, negatives, decimals, empty input, and non-numeric input should not be treated as valid multiplier values

The final UI behavior for invalid temporary input should be explicit and consistent.

## Current Problem

The main window only exposes the base estimated time.

That makes it harder to answer a common planning question directly in the UI:
“How long will this take if I repeat it N times?”

Users currently have to do that multiplication outside the app even though the app already computes the base estimate.

## Implementation Direction

### 1. Markup

Update the results section in `public/index.html` to add:

- a multiplier label
- a numeric input below `#resTime`
- a derived multiplied-time display positioned to the right of the input

### 2. Renderer logic

Update `public/renderer.js` so the multiplied-time display is derived from the same base estimate already used for `#resTime`.

The renderer should:

- store or reconstruct the base time parts from current count stats and WPM
- compute the multiplied duration from the multiplier input
- render the multiplied result whenever the base estimate or multiplier changes

### 3. Styling

Update `public/style.css` so the new control fits the existing results panel layout on both desktop and narrow widths.

## Constraints

- Prefer modules over adding more logic to `electron/main.js` or `public/renderer.js`.
- Follow the existing logging policy in `public/js/log.js` and `electron/log.js`.

## Acceptance Criteria

- The main window results section includes a multiplier input below the estimated time.
- The multiplier input accepts only natural-number values as valid input.
- A multiplied-time result appears to the right of the input.
- The multiplied-time result updates when the estimated time changes.
- The multiplied-time result updates when the multiplier changes.
- The existing estimated-time display remains intact.
- The new UI fits the current results layout without breaking the toggle/help controls.

## Notes

- Unless product direction says otherwise, the simplest default is for the multiplier input to start at `1`.
- This issue is about exposing a derived planning value in the UI, not about changing the underlying time-estimation model.

## Implementation Plan

This section refines the implementation direction above and should be treated as the working plan for the issue.

### 1. Preserve one canonical estimate path

- The multiplier feature must not introduce a second canonical `words -> time` path.
- The existing estimated time already comes from `getTimeParts(...)` in `public/renderer.js` and is rendered into `#resTime`.
- The multiplier feature should use that same already-rounded `{ hours, minutes, seconds }` result as its base input.
- This avoids drift between the visible base estimate and the multiplied estimate.

### 2. Add a dedicated renderer module

- Create a focused renderer module under `public/js/` for the time-multiplier feature.
- That module should own:
  - DOM handling for the multiplier controls
  - natural-number validation
  - invalid visual state
  - multiplied-time rendering
  - translation application for its own UI
- Keep the module surface small and explicit, for example:
  - `applyTranslations({ tRenderer, msgRenderer })`
  - `setBaseTimeParts({ hours, minutes, seconds })`

### 3. Keep `public/renderer.js` as wiring, not feature owner

- `public/renderer.js` should not own the multiplier feature logic.
- Its responsibility should be limited to:
  - checking that the dedicated module is available
  - delegating translation application to that module
  - passing canonical base time parts to that module
- Replace the duplicated `#resTime` update lines with one small helper in `renderer.js` that:
  - renders the base estimated time
  - passes the exact same `{ hours, minutes, seconds }` to the multiplier module
- Call that helper from both existing estimate update paths:
  - `updatePreviewAndResults(...)`
  - `updateTimeOnlyFromStats()`

### 4. Keep scope renderer-only

- This feature should remain renderer-owned.
- Do not add IPC.
- Do not add `main.js` work.
- Do not add persistence in this issue unless scope changes explicitly.

### 5. Keep CSS changes minimal

- Limit `public/style.css` changes to the minimum needed for:
  - the new multiplier row
  - the derived-result placement
  - the invalid input state
- Do not broaden this issue into a larger results-panel layout cleanup.
- If the panel fit or spacing needs more polish, leave that to follow-up work.

### 6. Limit i18n scope to `en` and `es`

- Add only the required new keys to:
  - `i18n/en/renderer.json`
  - `i18n/es/renderer.json`
- Keep the key set minimal:
  - multiplier label
  - multiplied-time result text

### 7. Define input behavior explicitly

- Default multiplier: `1`
- Valid settled values: integers `>= 1`
- While typing:
  - valid input updates the multiplied result immediately
  - invalid or empty input clears the multiplied result and marks the input invalid
- On blur:
  - normalize invalid settled input back to `1`
  - rerender the multiplied result

### 8. Follow the logging policy narrowly

- Do not log ordinary invalid user typing.
- Only log real runtime faults, such as:
  - missing required DOM
  - missing required module exports
- Any such logs must follow the existing logging policy in `public/js/log.js`.

### 9. Deliberate non-changes

This issue should not, in its first implementation pass, expand into changes in:

- `electron/main.js`
- `public/js/format.js`
- `public/js/text_apply_canonical.js`
- renderer locale files other than `en` and `es`

### 10. Verification

1. Run `npm run lint`.
2. Manually verify:
   - startup
   - text changes
   - WPM slider changes
   - WPM input normalization
   - preset-driven WPM changes
   - precise-mode recount changes
   - invalid multiplier states: empty, `0`, negative, decimal
