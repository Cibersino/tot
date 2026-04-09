# Issue 210 — Editor spellcheck toggle and app-language-driven spellchecker

## Objective

Add explicit spellcheck control to the manual editor window and stop relying on Electron's default OS-locale behavior.

The target UX is:

* the editor window exposes a spellcheck checkbox;
* the checkbox is enabled by default;
* the checkbox state is persisted in app settings;
* spellcheck language follows the app's active language when possible;
* Windows/Linux behavior no longer falls back implicitly to the operating system language just because Electron was left unconfigured.

## Research summary

Current local code and Electron behavior indicate all of the following:

* the editor window does not explicitly configure `webPreferences.spellcheck`;
* the main editor `textarea` does not explicitly disable spellcheck;
* Electron spellcheck is enabled by default on Electron 9+;
* this app uses Electron `^39.8.6`;
* on Windows/Linux Electron uses Hunspell dictionaries;
* on Windows/Linux Electron does not auto-detect the language being typed;
* if spellchecker languages are left empty, Electron tries to populate them from the current OS locale;
* the app already has its own persisted language setting and broadcasts live `settings-updated` events to the editor window.

That means the current red-underlines behavior is consistent with Electron defaults, not with an app-owned spellcheck policy.

## Problem

The current editor spellcheck behavior has three product problems:

1. the user has no explicit editor-level control to disable the feature;
2. the effective spellcheck language is implicitly driven by Electron/OS defaults rather than by the app's language setting;
3. unsupported or mixed-language text can produce misleading underlines with no clear explanation or predictable fallback rule.

## Decision summary

This issue adopts the following decisions:

1. Add an editor-window spellcheck checkbox, enabled by default.
2. Persist the preference as part of normal app settings.
3. Drive spellchecker language from the app's active language, not from the OS locale, whenever a supported Electron spellchecker language can be resolved.
4. Reapply spellcheck configuration at startup and whenever app language or spellcheck preference changes.
5. Do not attempt automatic typed-text language detection on Windows/Linux in this issue.
6. If the active app language cannot be mapped to a supported Electron spellchecker language, do not silently fall back to the OS locale.
7. For unsupported app languages, disable active spellchecking for the editor rather than applying a misleading wrong-language dictionary.

## Why automatic text-language detection is out of scope

Electron's built-in Windows/Linux spellchecker does not automatically detect what language the user is typing. It requires explicit language codes through `session.setSpellCheckerLanguages(...)`.

So there are two realistic policies for this app:

* follow the app's active language;
* build a more advanced custom language-detection layer outside Electron's built-in behavior.

This issue chooses the first policy.

## Scope

### In scope

* Add a spellcheck checkbox to the manual editor window UI.
* Default the checkbox to enabled for fresh settings.
* Persist the checkbox state in settings.
* Apply the checkbox state live to the editor textarea.
* Configure Electron spellchecker languages from the app language.
* Resolve Electron spellchecker language codes dynamically from `availableSpellCheckerLanguages`.
* Update the editor when the app language changes while the window is open.
* Update the editor document language metadata (`<html lang>` / `document.documentElement.lang`) to match the app language.

### Out of scope

* Automatic per-paragraph or per-word language detection.
* A multi-language spellcheck UI with manual language overrides.
* A custom spellchecker implementation outside Electron's built-in APIs.
* Spellcheck suggestion context menus.
* Per-window session partitioning just for spellcheck isolation.

## Target behavior

### Editor checkbox

The manual editor window should expose a new checkbox in the bottom control bar, near the existing editor behavior toggles.

Suggested label:

* `Spellcheck`

Behavior:

* checked = spellcheck enabled for the editor textarea, subject to language availability;
* unchecked = no spellcheck underlines in the editor textarea;
* the state is restored from persisted settings on editor open;
* toggling it should take effect immediately without reopening the editor window.

### Language source of truth

The source of truth for spellcheck language should be the app's active language setting, not the OS locale.

This app already owns a language setting and already pushes changes to renderers. Spellcheck should follow that same model.

### Language resolution policy

The app should not hardcode one exact Electron language code without checking availability first.

Instead, it should:

1. read `session.availableSpellCheckerLanguages`;
2. compute a preferred candidate list for the active app language;
3. choose the first available supported candidate;
4. call `session.setSpellCheckerLanguages([...])` with that resolved list.

Examples of preferred candidate logic:

* `es`:
  * prefer Spanish variants if available;
* `en`:
  * prefer `en-US`, then another supported English variant if needed;
* `fr`, `de`, `it`, `pt`:
  * prefer matching variants for that base language;

Non-standard or joke UI tags are not part of supported spellchecker scope and must not be treated as distinct spellchecker locales.

### Unsupported app languages

Some app UI languages may not have a corresponding Electron spellchecker dictionary.

In this repository, `arn` is the clearest example of a likely unsupported spellchecker locale.

For such cases:

* do not leave the language list empty;
* do not allow Electron to repopulate from the OS locale;
* do not silently substitute a wrong-language dictionary by default;
* disable active spellcheck for the editor while preserving the user's stored checkbox preference.

This produces a more honest result than marking nearly every word as misspelled under an unrelated dictionary.

### Search bar behavior

The editor find/search input already has `spellcheck="false"` and should remain that way.

This issue is about the text editor area, not the find bar.

## Session behavior note

The current windows in this app use the default Electron session because no custom `partition` is configured.

That means:

* `setSpellCheckerLanguages(...)` is effectively app-session-wide;
* the language configuration may affect other windows that use spellcheck-capable inputs under the same session.

This is acceptable for this issue because the app language is already global.

The visible enable/disable control requested here remains editor-window-specific through the editor textarea's own `spellcheck` property and stored settings-driven UI.

## Settings model

Add one persisted boolean setting.

Recommended key:

* `spellcheckEnabled`

Recommended default:

* `true`

Normalization rules:

* missing -> `true`;
* non-boolean -> coerce back to `true`.

## Implementation notes

Expected touch points:

* `public/editor.html`
  * add the checkbox markup;
* `public/editor.js`
  * initialize the checkbox from settings;
  * update `editor.spellcheck`;
  * react to live `settings-updated` changes;
  * update `document.documentElement.lang`;
* `electron/editor_preload.js`
  * expose any new IPC calls needed for spellcheck settings updates;
* `electron/settings.js`
  * add `spellcheckEnabled` to defaults, normalization, persistence, and broadcast;
* `electron/main.js`
  * add spellcheck configuration helper(s);
  * apply them on startup/editor creation and after language/settings changes.

Recommended main-process helper responsibilities:

* read the active settings;
* resolve a supported spellchecker language list from the app language;
* call `ses.setSpellCheckerEnabled(...)`;
* call `ses.setSpellCheckerLanguages(...)` only when a supported language list is available;
* otherwise explicitly keep spellchecker disabled for the editor use case.

## Acceptance criteria

* The manual editor window shows a spellcheck checkbox.
* Fresh installs default the checkbox to enabled.
* Unchecking the checkbox removes spellcheck underlines from the editor textarea immediately.
* Rechecking the checkbox restores spellcheck immediately when a supported spellchecker language is available.
* The checkbox state persists across app restart.
* Changing the app language while the editor is open updates spellcheck behavior without reopening the editor.
* Supported app languages use the app language as the spellchecker source, not the OS locale.
* Unsupported app languages do not fall back silently to the OS locale.
* The editor find bar continues to keep spellcheck disabled.

## Risks / constraints

* Electron spellchecker dictionaries vary by platform and by the `availableSpellCheckerLanguages` list returned at runtime.
* Initial dictionary download may be needed on Windows/Linux depending on the user's environment.
* Because the default session is shared, spellchecker-language configuration is broader than a single window.
* Disabling spellcheck for unsupported languages is the least misleading fallback, but it also means no assistance for those languages in this issue.

## Follow-up opportunities

Potential follow-up work, explicitly outside this issue:

* add misspelling suggestions and `Add to dictionary` in the context menu;
* expose a manual spellcheck-language override instead of only following app language;
* support multi-language spellcheck lists for bilingual writing workflows;
* investigate whether specific unsupported languages need custom dictionaries or a plugin-based spellchecker path.
