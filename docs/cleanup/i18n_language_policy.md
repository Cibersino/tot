# i18n Language Policy

**Project:** toT
**Status:** Draft (v0.1)
**Scope:** i18n assets under `i18n/**`, runtime i18n helpers, and all JavaScript in `electron/**` and `public/**` that resolves user-facing text.

## 1. Goals and non-goals

### Goals

* Prevent drift between i18n files, runtime helpers, and feature modules.
* Make fallback behavior explicit, stable, and auditable.
* Ensure user-facing text comes from i18n assets, not ad hoc runtime strings.
* Keep native-dialog/menu text and renderer UI text on separate, clear owners.

### Non-goals

* This document does not require mass translation rewrites in one pass.
* This document does not change runtime contracts by itself; code changes remain incremental.
* This document does not require regional overlays to be fully duplicated when a base/root bundle is sufficient.

## 2. Canonical owners

1. `electron/constants_main.js` and `public/js/constants.js`
   * Own the canonical `DEFAULT_LANG`.
   * These two files must stay synchronized.

2. `i18n/languages.json`
   * Owns the list of shipped root languages exposed to users.
   * If a language is listed here, it is part of the supported shipped surface.

3. `i18n/<lang>/main.json`
   * Owns main-process text for menus and native dialogs.

4. `i18n/<lang>/renderer.json`
   * Owns renderer UI text.

5. `public/js/i18n.js`
   * Owns renderer translation loading, merge behavior, and key resolution.

6. `electron/menu_builder.js`
   * Owns main-process translation loading, merge behavior, and key resolution for menus/native dialogs.

## 3. Runtime guarantees

### 3.1 DEFAULT_LANG is the only final fallback

1. `DEFAULT_LANG` is the only language allowed as the final runtime i18n fallback.
2. The default language bundles must be key-complete for their domain:
   * `i18n/<DEFAULT_LANG>/main.json` must contain every reachable `main.*` key.
   * `i18n/<DEFAULT_LANG>/renderer.json` must contain every reachable `renderer.*` key.
3. If a key is missing after merge, that is an authoring/distribution defect, not a reason to inject hardcoded user-facing text at runtime.

### 3.2 Merge chain

1. Main-process text resolves through `menu_builder.js`:
   * requested tag -> base tag -> `DEFAULT_LANG`
2. Renderer text resolves through `public/js/i18n.js`:
   * requested tag -> base tag -> `DEFAULT_LANG`
3. Feature modules must consume that merged result.
4. Feature modules must not implement their own language fallback chains.

### 3.3 Key-level fallback after merge

1. If the merged bundle still lacks a key, the helper may return the key path itself for diagnostics.
2. The helper returning the key path is acceptable as an internal/debug fallback.
3. Feature modules must not replace that behavior with:
   * DOM text fallbacks
   * placeholder/title/textContent fallbacks
   * hardcoded localized strings
   * empty-string fallbacks that silently blank UI text

## 4. Shipped language policy

### 4.1 Root shipped languages

1. Every root language listed in `i18n/languages.json` must ship:
   * `i18n/<lang>/main.json`
   * `i18n/<lang>/renderer.json`
   * `i18n/<lang>/numberFormat.json`
2. Root shipped bundles must follow the same key schema as the canonical default bundles for their domain.
3. A root shipped bundle may be partial at runtime only because the merge chain is explicit and controlled.
4. A root shipped bundle must not use stale key names once the canonical schema changes.

### 4.2 Regional overlays

1. Regional overlays such as `i18n/es/es-cl/*.json` are optional overlays over a root language.
2. Regional overlays may override only the subset of keys they need.
3. Regional overlays must not invent a separate schema.
4. If a key is renamed in the canonical schema, any overlay that overrides that key must be updated in the same change set.

## 5. Authoritative rules for code

### 5.1 Forbidden patterns

The following are policy violations for user-facing text:

1. Hardcoded language strings in `.js` as runtime fallback text.

```js
resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
tRenderer('renderer.editor_find.label', 'Find');
```

2. Reusing current DOM text/title/placeholder as an i18n fallback.

```js
tRenderer('renderer.main.selector_title', el.textContent || '');
tRenderer('renderer.editor.placeholder', input.getAttribute('placeholder') || '');
```

3. Using empty strings as i18n fallback for user-facing text.

```js
msgRenderer('renderer.modal_preset.char_count', params, '');
```

4. Mixing native-dialog copy with renderer keys, or renderer copy with `main` keys.

```js
// Wrong owner:
buttons: [tRenderer('renderer.tasks.buttons.yes')]
```

5. Reintroducing per-module mini fallback chains.

```js
const label = customMap[key] || tRenderer(key) || 'Some text';
```

### 5.2 Required pattern

Feature modules must resolve text by key only, using the owner helper for that runtime:

```js
tRenderer('renderer.editor_find.label');
msgRenderer('renderer.main.results.words', { n });
resolveDialogText(dialogTexts, 'continue_button');
```

### 5.3 Main vs renderer separation

1. Native menu and native dialog labels belong in `main.json`.
2. Renderer HTML/UI labels belong in `renderer.json`.
3. Do not route native confirmation buttons through renderer keys.
4. Do not route renderer modal/button text through `main.dialog.*`.

## 6. Button and dialog labeling policy

1. Native dialogs must use action-specific `main.dialog.*` keys when the button copy is action-specific.
2. Do not collapse action labels into generic `yes` / `no` if the shipped UX expects labels such as:
   * `Yes, continue`
   * `No, cancel`
3. If a dialog needs distinct button text, add distinct i18n keys for that dialog family or action family.
4. Generic renderer-side `yes` / `no` buttons may still exist when the UI truly wants generic labels.

## 7. Exceptions

Only these exceptions are allowed:

1. Non-linguistic invariant symbols or glyphs may be literal if they are not language strings.
   * Examples: icon-only markers, separators, arrows, stopwatch glyphs.
2. The exception must be truly non-linguistic.
3. If a symbol already has an owned i18n key, prefer the i18n key rather than duplicating the literal across modules.

## 8. Rules for adding, renaming, and removing keys

### 8.1 Adding a key

1. Add the key to the canonical default bundle first:
   * `i18n/<DEFAULT_LANG>/main.json` for main-process text
   * `i18n/<DEFAULT_LANG>/renderer.json` for renderer text
2. Update every shipped root language bundle affected by that domain in the same change set whenever possible.
3. If non-default translations are not ready yet, the runtime may temporarily use the merged default text, but the missing translation must be treated as translation debt, not hidden with JS literals.

### 8.2 Renaming a key

1. Rename the key in all call sites and in the canonical default bundle in the same change set.
2. Update every shipped root bundle and every regional overlay that overrides that key.
3. Do not leave both names alive unless there is an explicit migration window with evidence.

### 8.3 Removing a key

1. Remove the key only after all reachable call sites are gone.
2. Search both `electron/**` and `public/**` before removal.
3. Search regional overlays too; otherwise stale keys accumulate and hide schema drift.

## 9. Review checklist

Before merging any change that touches user-facing text, verify:

1. Is the text in the correct owner bundle (`main.json` vs `renderer.json`)?
2. Was the key added to the canonical default bundle?
3. Were shipped root languages reviewed for the same key/schema change?
4. Were regional overlays reviewed if they override the touched key?
5. Did the change avoid hardcoded language strings in `.js`?
6. Did the change avoid DOM/title/placeholder/textContent fallback arguments to translation helpers?
7. Did the change avoid empty-string fallback arguments that can silently blank text?
8. If a native dialog button changed, is the label action-specific and owned by `main.dialog.*`?
9. If a translation miss still happens after merge, does the code surface it as a defect instead of inventing runtime copy?

## 10. Recommended repo scans

Use these before merge when touching i18n-sensitive code:

### 10.1 Hardcoded fallback scan

```powershell
rg -n "tRenderer\\(|msgRenderer\\(|resolveDialogText\\(" public electron
```

Review every call that passes a fallback argument.

### 10.2 Suspicious DOM-fallback scan

```powershell
rg -n "textContent \\|\\||title \\|\\||placeholder\\)|getAttribute\\([^\\)]*\\) \\|\\|" public electron
```

Review every hit used near translation calls.

### 10.3 Root bundle schema drift scan

```powershell
Get-ChildItem -Path i18n -Recurse -Filter *.json
```

Then compare the touched key path across:

* `i18n/<DEFAULT_LANG>/main.json`
* `i18n/<DEFAULT_LANG>/renderer.json`
* all shipped root bundles in `i18n/languages.json`
* any regional overlay that overrides that path

## 11. Enforcement stance

1. New or touched code must follow this policy.
2. Existing drift should be fixed when a file is actively touched.
3. The runtime i18n helpers are infrastructure owners; feature modules are consumers.
4. The existence of a helper fallback parameter does not authorize feature modules to bypass the language policy.
