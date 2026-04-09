# Issue 212 — Manual editor text-size controls

## Objective

Allow the user to increase or decrease the text size of the manual editor window directly from that window, without scaling the rest of the app UI.

This issue intentionally chooses editor-local text scaling for the main `textarea`, not full Electron page zoom.

## Problem

The manual editor currently uses a fixed text size in CSS:

* `public/editor.css` sets `#editorArea` to `font-size: 20px`;
* the user cannot increase it for readability or decrease it to see more text at once;
* there is no persisted preference for editor reading size;
* if we use full page zoom as the solution, the bottom bar and the rest of the window UI would scale too, which is not the target behavior here.

This creates two product gaps:

1. the editor is missing a basic accessibility/readability control;
2. the most obvious technical shortcut, BrowserWindow/webContents zoom, would produce the wrong UX surface.

## Decision summary

This issue adopts all of the following decisions:

1. Add editor-local text-size controls for the main editor `textarea`.
2. Persist the chosen text size in shared app settings.
3. Keep the scaling scoped to the editor text area only.
4. Add both visible UI controls and keyboard shortcuts.
5. Support a reset-to-default action.
6. Do not use Electron page zoom or BrowserWindow zoom for this issue.

## Scope

### In scope

* Add text-size controls to the manual editor bottom bar.
* Persist a numeric editor text-size setting.
* Apply the setting live to the editor textarea.
* React to `settings-updated` so the editor stays consistent with persisted settings.
* Add keyboard shortcuts for increase, decrease, and reset.
* Add i18n labels/tooltips/aria strings required by the new controls.
* Keep responsive layout working in small editor windows.

### Out of scope

* App-wide zoom.
* BrowserWindow/webContents zoom.
* Separate font-family selection.
* Separate line-height, margin, or theme controls.
* Mouse-wheel-with-Ctrl zoom behavior.
* Per-document or per-language text-size presets.
* Text-size controls for the dedicated editor find window.

## UX model

### Control placement

Add the text-size controls to the manual editor bottom bar alongside the existing editor toggles.

Recommended grouping:

* left controls:
  * `CALC/SAVE`
  * `Auto-save and auto-recalculate as you type`
  * `Spellcheck`
  * text-size controls

Recommended compact control set:

* decrease button: `A-`
* current size readout: for example `20 px`
* increase button: `A+`
* reset button: `Reset`

The exact visual styling may be refined during implementation, but the control group should remain compact enough to fit the current bottom-bar model.

### Behavior

* `A-` decreases the editor text size by one fixed step.
* `A+` increases the editor text size by one fixed step.
* `Reset` restores the default size.
* The current size readout updates immediately after every change.
* Changes apply immediately to the editor text area without reopening the window.
* The bottom bar itself should not grow/shrink with editor text size changes.

## Keyboard shortcuts

Add manual editor shortcuts for:

* `Ctrl/Cmd +` or `Ctrl/Cmd =`
  * increase text size
* `Ctrl/Cmd -`
  * decrease text size
* `Ctrl/Cmd 0`
  * reset text size

These shortcuts should target the manual editor window behavior, not global app zoom.

Implementation should intercept the shortcut before Chromium/Electron default page zoom behavior can take over.

## Settings model

Add one persisted numeric setting.

Recommended key:

* `editorFontSizePx`

Recommended default:

* `20`

Recommended range:

* minimum: `12`
* maximum: `36`
* default step: `2`

Normalization rules:

* missing -> `20`
* non-numeric -> `20`
* non-finite -> `20`
* below minimum -> clamp to `12`
* above maximum -> clamp to `36`

This setting should be treated like other user settings:

* loaded on editor bootstrap;
* persisted through the normal settings path;
* rebroadcast through `settings-updated`.

## Render/CSS model

The editor text size should be driven through a CSS variable rather than direct repeated inline assignments.

Recommended model:

* define a root variable such as `--editor-font-size: 20px`;
* apply it to `#editorArea`;
* keep `line-height` unitless so it scales naturally with font size.

Important responsive note:

The current mobile/small-window CSS overrides `#editorArea` to `font-size: 14px` inside a media query. That hardcoded override should be removed or adapted so it does not defeat the persisted editor text-size setting.

Small-window handling should keep:

* reduced paddings if needed;
* compact button layout if needed;
* the same persisted text-size value.

## Translation/i18n surface

Add renderer strings for the new editor controls.

Expected new keys under `renderer.editor`:

* decrease_text_size
* increase_text_size
* reset_text_size
* text_size_label
* text_size_value

The exact key names may vary if implementation finds a better fit, but the translation surface should remain editor-scoped and not leak into unrelated sections.

## Expected code areas

Primary touch points are expected to be:

* `public/editor.html`
  * add the new text-size controls and readout markup;
* `public/editor.css`
  * introduce the CSS variable and bottom-bar layout updates;
* `public/editor.js`
  * initialize the text-size setting;
  * apply the CSS variable/readout;
  * wire the buttons;
  * respond to `settings-updated`;
* `electron/editor_preload.js`
  * expose a dedicated setter IPC for editor text size;
* `electron/settings.js`
  * add defaults, normalization, persistence, and broadcast behavior for `editorFontSizePx`;
* `electron/editor_find_main.js`
  * extend manual-editor shortcut handling so `Ctrl/Cmd +/-/0` changes editor text size instead of page zoom.

## Acceptance criteria

* The manual editor window exposes text-size controls in its bottom bar.
* The editor text size changes immediately when the user uses those controls.
* The controls affect only the editor text area, not the entire window UI.
* The chosen text size persists across editor reopen and app restart.
* The editor loads the persisted text size on startup.
* `Ctrl/Cmd +`, `Ctrl/Cmd -`, and `Ctrl/Cmd 0` work in the manual editor window.
* Those shortcuts do not trigger BrowserWindow/page zoom.
* The small-window responsive layout still works after the new controls are added.
* The implementation does not leave dead zoom-related code paths behind.

## Risks / constraints

* Bottom-bar width is limited, especially in narrow editor windows.
* Shortcut handling must account for keyboard-layout differences such as `+` arriving as `=` plus `Shift`, and numpad variants if feasible.
* If the setting is shared through general app settings, other windows will receive `settings-updated`; they should safely ignore the new field if they do not use it.
* The issue must avoid accidental coupling to Chromium's page zoom APIs, or the UX will drift away from the intended textarea-only scope.

## Implementation plan

1. Extend persisted settings.
   * Add `editorFontSizePx` to settings defaults and normalization in `electron/settings.js`.
   * Add a dedicated IPC setter exposed through `electron/editor_preload.js`.
   * Reuse the existing `settings-updated` broadcast path.

2. Add the editor UI controls.
   * Update `public/editor.html` with a compact text-size control group in the bottom bar.
   * Add translated labels, titles, and aria attributes for the new controls and readout.

3. Refactor editor styling to use a CSS variable.
   * Introduce a root-level editor font-size variable in `public/editor.css`.
   * Apply it to `#editorArea`.
   * Adjust the bottom-bar layout so the additional controls fit without breaking the current window layout.
   * Remove or adapt the hardcoded small-window `font-size: 14px` override.

4. Implement renderer-side state application.
   * In `public/editor.js`, read `editorFontSizePx` during bootstrap.
   * Apply the setting to the CSS variable and visible readout.
   * Clamp values before applying them locally.
   * Wire decrease, increase, and reset button handlers.
   * React to `settings-updated` so the open editor stays in sync with persisted settings.

5. Add keyboard shortcut handling.
   * Extend the editor shortcut owner in `electron/editor_find_main.js` so the manual editor window handles `Ctrl/Cmd +/-/0`.
   * Prevent default Chromium/Electron page zoom behavior for those shortcuts.
   * Dispatch the desired text-size action to the editor renderer through a focused and explicit mechanism.

6. Add i18n coverage.
   * Add the new editor text-size strings to shipped renderer locales.
   * Keep the copy short enough for the narrow bottom bar.

7. Verify and clean up.
   * Manually verify button behavior, shortcut behavior, persistence, and small-window layout.
   * Remove any dead code or fallback experiments that are not part of the final chosen textarea-only model.

## Implementation constraints

* Keep the solution editor-scoped.
* Prefer the existing settings architecture over adding a new persistence path.
* Prefer the existing editor shortcut coordinator over scattered ad hoc shortcut listeners.
* Do not introduce BrowserWindow/page zoom as an alternate path in the same implementation.

## Codex policy

After implementation, any deviation from or irresolution of the plan above must be explained explicitly.
