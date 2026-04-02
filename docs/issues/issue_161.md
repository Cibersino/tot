**Title**

Standardize preload listener APIs across the repo

**Body**

## Summary

Adopt and apply the new preload listener policy in [`docs/cleanup/preload_listener_api_standard.md`](c:\Users\manue\Documents\toT\tot\docs\cleanup\preload_listener_api_standard.md).

The repo currently has drift across preload listener-like APIs such as `onX(cb)`:
- some return `unsubscribe`
- some return nothing
- some isolate callback errors
- some call `cb(...)` directly
- some support replay/buffer semantics
- some do not

This issue is to normalize that surface deliberately, file by file, instead of leaving it as implicit drift.

## Why

A consistent preload listener contract will:
- reduce cleanup ambiguity
- make renderer consumers easier to reason about
- make review simpler
- prevent new drift in future preloads

## Policy to adopt

Per [`docs/cleanup/preload_listener_api_standard.md`](c:\Users\manue\Documents\toT\tot\docs\cleanup\preload_listener_api_standard.md):

- Default listener shape: `onX(cb) -> unsubscribe`
- Recurrent listeners should isolate callback errors
- Local unsubscribe should isolate `removeListener(...)` errors
- Replay/buffer semantics must be explicit and documented
- Any exception must be justified concretely, not by style or history

## Scope

Audit and normalize preload files that expose `window.*API` via `contextBridge`, including at least:

- [`electron/preload.js`](c:\Users\manue\Documents\toT\tot\electron\preload.js)
- [`electron/editor_preload.js`](c:\Users\manue\Documents\toT\tot\electron\editor_preload.js)
- [`electron/task_editor_preload.js`](c:\Users\manue\Documents\toT\tot\electron\task_editor_preload.js)
- [`electron/preset_preload.js`](c:\Users\manue\Documents\toT\tot\electron\preset_preload.js)
- [`electron/flotante_preload.js`](c:\Users\manue\Documents\toT\tot\electron\flotante_preload.js)
- [`electron/language_preload.js`](c:\Users\manue\Documents\toT\tot\electron\language_preload.js)
- [`electron/editor_find_preload.js`](c:\Users\manue\Documents\toT\tot\electron\editor_find_preload.js)

## Work plan

1. Produce a listener inventory for each preload:
   - exposed API name
   - all listener-like keys
   - channel
   - whether it returns unsubscribe
   - callback error policy
   - replay/buffer behavior if any

2. Classify each listener as:
   - stream/recurrent
   - rare/control
   - replay/buffer

3. For each non-compliant listener, decide one of:
   - normalize now
   - keep as explicit exception
   - escalate with Evidence/Risk/Validation if behavior change is non-trivial

4. Normalize file by file with repo call-site evidence:
   - grep call sites
   - check return-value usage
   - check repeated-arm risk
   - check consumer-side callback error handling

5. Smoke-test real listener paths after each touched preload.

## Initial likely targets

These look like the first concrete drift candidates to evaluate:

- [`electron/preload.js`](c:\Users\manue\Documents\toT\tot\electron\preload.js)
  - `onCurrentTextUpdated`
  - `onPresetCreated`

- [`electron/editor_preload.js`](c:\Users\manue\Documents\toT\tot\electron\editor_preload.js)
  - `onInitText`
  - `onExternalUpdate`

These should not be normalized mechanically; they should be checked against actual repo consumers first.

## Progress

### File order

1. [`electron/editor_preload.js`](c:\Users\manue\Documents\toT\tot\electron\editor_preload.js)
2. [`electron/preload.js`](c:\Users\manue\Documents\toT\tot\electron\preload.js)
3. [`electron/flotante_preload.js`](c:\Users\manue\Documents\toT\tot\electron\flotante_preload.js)
4. [`electron/preset_preload.js`](c:\Users\manue\Documents\toT\tot\electron\preset_preload.js)
5. [`electron/task_editor_preload.js`](c:\Users\manue\Documents\toT\tot\electron\task_editor_preload.js)
6. [`electron/editor_find_preload.js`](c:\Users\manue\Documents\toT\tot\electron\editor_find_preload.js)
7. [`electron/language_preload.js`](c:\Users\manue\Documents\toT\tot\electron\language_preload.js)

### File 1: `electron/editor_preload.js`

Status: normalized

LP0 inventory and classification:

| API key | Channel | Class | Unsub before | Callback policy before | Replay | Repo caller evidence | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `onInitText` | `editor-init-text` | stream/recurrent | No | direct `cb(text)` | No | `public/editor.js:679`; send sites `electron/main.js:509`, `electron/main.js:1363` | normalize now |
| `onExternalUpdate` | `editor-text-updated` | stream/recurrent | No | direct `cb(text)` | No | `public/editor.js:680`; send site `electron/text_state.js:153` | normalize now |
| `onSettingsChanged` | `settings-updated` | stream/recurrent | Yes | isolates | No | `public/editor.js:150`; broadcast site `electron/settings.js:419` | already compliant |
| `onForceClear` | `editor-force-clear` | rare/control | No | direct `cb(payload)` | No | `public/editor.js:682`; send site `electron/text_state.js:373` | normalize now |

Evidence:

- Repo call-site grep found only one consumer file: [`public/editor.js`](c:\Users\manue\Documents\toT\tot\public\editor.js).
- Return-value grep found no assignments or unsubscribe usage for `onInitText`, `onExternalUpdate`, `onSettingsChanged`, or `onForceClear`.
- Key-order dependency scan for `editorAPI` found 0 relevant enumeration hits.
- Consumer callback bodies do not depend on missing unsubscribe:
  - `onInitText` and `onExternalUpdate` both call `applyExternalUpdate(...)`.
  - `onForceClear` already isolates its callback body with local `try/catch`.

Risk:

- Observable change is limited to adding an unsubscribe return for three listeners and isolating synchronous callback errors in preload.
- No channel names, payload shapes, replay behavior, or delivery timing were changed.

Validation:

- Repo grep for call sites and return-value usage completed.
- `node --check electron/editor_preload.js`
- Human smoke pending: open editor window, confirm init/update/force-clear paths still work.

### File 2: `electron/preload.js`

Status: normalized

LP0 inventory and classification:

| API key | Channel | Class | Unsub before | Callback policy before | Replay | Repo caller evidence | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `onImportExtractProcessingModeChanged` | `import-extract-processing-mode-changed` | stream/recurrent | Yes | isolates | No | `public/renderer.js:930`; send path `electron/main.js:75` | already compliant |
| `onCurrentTextUpdated` | `current-text-updated` | stream/recurrent | No | isolates | No | `public/renderer.js:837`; send paths `electron/text_state.js:149`, `electron/text_state.js:370` | normalize now |
| `onEditorReady` | `editor-ready` | rare/control | Yes | isolates | No | `public/renderer.js:946`; send paths `electron/main.js:520`, `electron/main.js:1374` | already compliant |
| `onSettingsChanged` | `settings-updated` | stream/recurrent | Yes | isolates | No | `public/renderer.js:922`; broadcast path `electron/settings.js:419` | already compliant |
| `onPresetCreated` | `preset-created` | rare/control | No | direct `cb(preset)` | No | `public/renderer.js:858`; send paths `electron/presets_main.js:497`, `electron/presets_main.js:839` | normalize now |
| `onMenuClick` | `menu-click` | stream/recurrent | Yes | isolates | No | `public/js/menu_actions.js`; send path `electron/menu_builder.js:309` | already compliant |
| `onCronoState` | `crono-state` | stream/recurrent | Yes | isolates | No | `public/renderer.js:691`; send paths `electron/main.js:1087`, `electron/main.js:1093` | already compliant |
| `onFlotanteClosed` | `flotante-closed` | rare/control | Yes | isolates | No | `public/js/crono.js:523`; send path `electron/main.js:1018` | already compliant |
| `onStartupReady` | `startup:ready` | rare/control | Yes | isolates | No | `public/renderer.js:906`; send path `electron/main.js:735` | already compliant |

Evidence:

- Key-order dependency scan for `electronAPI` found 0 relevant enumeration hits.
- Repo call-site grep found no unsubscribe usage for `onCurrentTextUpdated` or `onPresetCreated`.
- Repo call-site evidence does show unsubscribe handling for `onMenuClick` in [`public/js/menu_actions.js`](c:\Users\manue\Documents\toT\tot\public\js\menu_actions.js), so that existing contract was preserved unchanged.
- Consumer callback bodies for the normalized listeners already isolate or contain their own async error handling in [`public/renderer.js`](c:\Users\manue\Documents\toT\tot\public\renderer.js).

Risk:

- Observable change is limited to adding unsubscribe support for `onCurrentTextUpdated` and `onPresetCreated`, plus isolating synchronous callback errors for `onPresetCreated`.
- No channel names, payload shapes, replay behavior, or delivery timing were changed.

Validation:

- Repo grep for call sites and return-value usage completed.
- `node --check electron/preload.js`
- Human smoke pending: current-text updates, preset creation sync, startup ready, and menu click handling.

### File 3: `electron/flotante_preload.js`

Status: no change

LP0 inventory and classification:

| API key | Channel | Class | Unsub | Callback policy | Replay | Repo caller evidence | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `onState` | `crono-state` | stream/recurrent | Yes | isolates | No | `public/flotante.js:115`; send paths `electron/main.js:1087`, `electron/main.js:1093` | already compliant |
| `onSettingsChanged` | `settings-updated` | stream/recurrent | Yes | isolates | No | `public/flotante.js:169`; broadcast path `electron/settings.js:419` | already compliant |

Evidence:

- Repo call-site grep found one consumer file: [`public/flotante.js`](c:\Users\manue\Documents\toT\tot\public\flotante.js).
- Key-order dependency scan for `flotanteAPI` found 0 relevant enumeration hits.
- Both listener wrappers already match the repo default contract: `onX(cb) -> unsubscribe`, isolated callback execution, and local `removeListener(...)` safety.
- No replay/buffer behavior is present or required by the current consumer flow.

Risk:

- No safe listener-contract change with meaningful payoff was identified.

Validation:

- Repo grep for call sites completed.
- No preload code change was made.

### File 4: `electron/preset_preload.js`

Status: no change

LP0 inventory and classification:

| API key | Channel | Class | Unsub | Callback policy | Replay | Repo caller evidence | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `onInit` | `preset-init` | replay/buffer | Yes | isolates | Yes, explicit async replay from buffered `lastInitData` | `public/preset_modal.js:127`; send paths `electron/main.js:611`, `electron/main.js:642` | already compliant |
| `onSettingsChanged` | `settings-updated` | stream/recurrent | Yes | isolates | No | `public/preset_modal.js:183`; broadcast path `electron/settings.js:419` | already compliant |

Evidence:

- Repo call-site grep found one consumer file: [`public/preset_modal.js`](c:\Users\manue\Documents\toT\tot\public\preset_modal.js).
- Key-order dependency scan for `presetAPI` found 0 relevant enumeration hits.
- Replay behavior is explicit and documented in code: always-on `ipcRenderer.on('preset-init', ...)`, buffered `lastInitData`, and async replay via `setTimeout(..., 0)`.
- The current replay contract is justified by producer timing: main may send `preset-init` before the modal renderer subscribes.

Risk:

- No safe listener-contract change with meaningful payoff was identified.
- Removing or reshaping replay here would be a real contract/timing change and is out of scope for this cleanup pass.

Validation:

- Repo grep for call sites completed.
- No preload code change was made.

### File 5: `electron/task_editor_preload.js`

Status: no change

LP0 inventory and classification:

| API key | Channel | Class | Unsub | Callback policy | Replay | Repo caller evidence | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `onInit` | `task-editor-init` | replay/buffer | Yes | isolates | Yes, explicit async replay from buffered `lastInitData` | `public/task_editor.js:1099`; send paths `electron/tasks_main.js:366`, `electron/tasks_main.js:421` | already compliant |
| `onSettingsChanged` | `settings-updated` | stream/recurrent | Yes | isolates | No | `public/task_editor.js:1151`; broadcast path `electron/settings.js:419` | already compliant |
| `onRequestClose` | `task-editor-request-close` | rare/control | Yes | isolates | No | `public/task_editor.js:1111`; send path `electron/main.js:583` | already compliant |

Evidence:

- Repo call-site grep found one consumer file: [`public/task_editor.js`](c:\Users\manue\Documents\toT\tot\public\task_editor.js).
- Key-order dependency scan for `taskEditorAPI` found 0 relevant enumeration hits.
- Replay behavior for `onInit` is explicit and justified by producer timing: main can send `task-editor-init` before the renderer registers.
- The close-request listener already matches the standard `onX(cb) -> unsubscribe` contract and isolates callback errors.

Risk:

- No safe listener-contract change with meaningful payoff was identified.

Validation:

- Repo grep for call sites completed.
- No preload code change was made.

### File 6: `electron/editor_find_preload.js`

Status: no change

LP0 inventory and classification:

| API key | Channel | Class | Unsub | Callback policy | Replay | Repo caller evidence | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `onInit` | `editor-find-init` | replay/buffer | Yes | isolates | Yes, explicit async replay from buffered `lastInitPayload` | `public/editor_find.js`; send path `electron/editor_find_main.js:105` | already compliant |
| `onState` | `editor-find-state` | replay/buffer | Yes | isolates | Yes, explicit async replay from buffered `lastStatePayload` | `public/editor_find.js`; send path `electron/editor_find_main.js:109` | already compliant |
| `onFocusQuery` | `editor-find-focus-query` | rare/control | Yes | isolates | No | `public/editor_find.js`; send path `electron/editor_find_main.js:254` | already compliant |
| `onSettingsChanged` | `settings-updated` | stream/recurrent | Yes | isolates | No | `public/editor_find.js`; broadcast path `electron/settings.js:419` | already compliant |

Evidence:

- Repo call-site grep found one consumer file: [`public/editor_find.js`](c:\Users\manue\Documents\toT\tot\public\editor_find.js).
- Key-order dependency scan for `editorFindAPI` found 0 relevant enumeration hits.
- Both replay listeners are explicit and documented in behavior: always-on capture plus async replay for late subscribers.
- Ordinary listeners (`onFocusQuery`, `onSettingsChanged`) already follow the standard `onX(cb) -> unsubscribe` contract.

Risk:

- No safe listener-contract change with meaningful payoff was identified.

Validation:

- Repo grep for call sites completed.
- No preload code change was made.

### File 7: `electron/language_preload.js`

Status: no change

LP0 inventory and classification:

- Exposed API: `languageAPI`
- Listener-like keys: none
- Result: out of scope for listener normalization; inventory complete

Evidence:

- Repo call-site grep found consumer usage only for invoke/send-style methods in [`public/language_window.js`](c:\Users\manue\Documents\toT\tot\public\language_window.js).
- `languageAPI` exposes `setLanguage(...)` and `getAvailableLanguages(...)`, but no `onX(cb)` or other listener-like keys.
- Key-order dependency scan for `languageAPI` found 0 relevant enumeration hits.

Risk:

- No listener contract exists here to normalize.

Validation:

- Repo grep for call sites completed.
- No preload code change was made.

## Smoke result

Status: PASS

Human validation completed after the preload normalization pass:

- App startup completed without preload/runtime errors.
- Editor window init path worked correctly.
- Main window to editor live text sync worked correctly.
- Editor to main window `current-text-updated` sync worked correctly.
- Main-window clear action propagated correctly to the editor.
- Preset creation sync worked correctly in the main window.
- Reopen behavior remained correct and no duplicate-listener issues were observed.

## Acceptance criteria

- Every preload listener-like API is inventoried and classified.
- Every listener either follows the new standard or has an explicit documented exception.
- No preload change alters channel names, payload shapes, or timing without explicit Evidence/Risk/Validation.
- Touched preloads pass syntax check and basic listener smoke checks.
- Future preload cleanup can cite one listener standard instead of re-arguing listener shape per file.

## Risks

- Accidental API churn if unsubscribe or callback error behavior changes without checking consumers.
- Over-normalization that hides meaningful differences such as replay/init semantics.
- Partial adoption creating a new mix of “old drift” and “new policy”.

## Non-goals

- Do not rewrite preloads wholesale.
- Do not change main/renderer business logic.
- Do not force replay behavior where it is not required.
- Do not treat every inconsistency as a bug without evidence.
