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
