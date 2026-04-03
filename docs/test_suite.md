# App-level Manual Test Suite (Release Smoke + Regression)

**Purpose:** Provide a single, stable, app-level manual test suite to run:
- **Before every release** (fast “Release smoke” subset).
- **After high-risk refactors** (full regression).

**Scope coverage (app-level):**
- Startup + first-run language selection
- Import/extract from file picker + drag/drop
- Native extraction routes (`txt`, `md`, `html`, `docx`, PDF text layer)
- Google-backed extraction routes (`rtf`, `odt`, images, scanned PDFs), including OCR activation/disconnect
- Import/extract route choice, apply modal, processing lock, and abort flow
- Clipboard overwrite/append (including repetition by input N), empty text, automatic count/time calculation
- Counting mode (simple/precise) + consistency
- Presets CRUD + defaults restore + persistence
- Manual editor window (open/edit/apply semantics)
- Text snapshot feature (save, load, persistence)
- Task editor window (task lists, library, links, column widths, window position).
- Stopwatch (velocity) + floating window behavior (unfocused app)
- Menu actions: Guide/Instructions/FAQ/About (+ link routing)
- Persistence sanity (settings/current_text/editor_state)
- i18n: language switching + number formatting consistency
- Updater check (manual)

---

## 0) Definitions

- **Release smoke:** 5–15 minutes, minimum confidence gate for publishing.
- **Full regression:** 45–90 minutes, end-to-end validation across all primary windows/flows.

### 0.1 Automated coverage status

This document remains the **manual** app-level source of truth.

The current automated baseline does **not** replace the release smoke or full regression flows in this document. It currently covers only a small contract-focused slice under `test/unit/electron/`.

Current automated coverage maps back to this manual suite roughly as follows:

* `electron/settings.js`
  * supports parts of `REG-PERSIST`
  * supports parts of `REG-I18N`
* `electron/import_extract_platform/import_extract_supported_formats.js`
  * supports parts of `SM-09`
  * supports parts of `SM-10`
  * supports parts of `REG-IMPORT/EXTRACT`
* `electron/import_extract_platform/import_extract_prepare_execute_core.js`
  * supports parts of `SM-09`
  * supports parts of `SM-10`
  * supports parts of `REG-IMPORT/EXTRACT`
* `electron/import_extract_platform/import_extract_prepared_store.js`
  * supports parts of `REG-IMPORT/EXTRACT`
* `electron/import_extract_platform/ocr_google_drive_activation_state.js`
  * supports parts of `SM-10`
  * supports parts of `REG-OCR`
* `electron/import_extract_platform/ocr_google_drive_provider_failure.js`
  * supports parts of `REG-OCR`
* `electron/import_extract_platform/ocr_google_drive_provider_failure_classification.js`
  * supports parts of `REG-OCR`

Important limitations:

* no real Electron window smoke automation exists yet;
* no renderer/UI automation exists yet;
* OCR network/provider behavior is still primarily validated through the manual suite;
* packaged-build behaviors in this document are still manual-only.

---

## 1) Preconditions / Test Environments

### 1.1 Supported environments (minimum)

- OS: Windows 10/11.
- Build: Prefer **packaged ZIP build** for “Release smoke”.
  - Dev mode is acceptable for most UI flows, but **some doc-opening behaviors differ** (see 1.3).

### 1.2 Required conditions

- Clipboard access available (to test overwrite/append).
- A local sample-file set available for import/extract:
  - native samples: `txt`, `md`, `html`, `docx`, PDF with selectable text
  - Google-backed document samples: `rtf`, `odt`
  - OCR samples: at least one image (`jpg`/`jpeg`/`png`/`webp`/`bmp`/`tif`/`tiff`) and one scanned PDF
- Network access available for updater check (GitHub API) and OCR activation/runtime checks.

### 1.3 Dev vs packaged caveats (important)

- `open-app-doc` behavior differs in dev for some documents:
  - Electron/Chromium license docs are explicitly “not available in dev” per policy; validate those in packaged build.
- Updater check depends on `app.getVersion()` and GitHub latest release tag; packaged build gives the most realistic signal.

---

## 2) Test State Variants (must support both)

You must run tests under both:
1) **Clean first-run** (no config present)
2) **Existing user state** (config present)

### 2.1 Where user state lives

Config is stored under Electron `app.getPath('userData')/config` and includes:
- `user_settings.json`
- `current_text.json`
- `editor_state.json`
- `import_extract_state.json` (last picker directory)
- `presets_defaults/*.json` (runtime defaults copies)
- `saved_current_texts/*.json` (saved text snapshots)
- `ocr_google_drive/`
  - `ocr_google_drive/credentials.json` (runtime mirrored OAuth client; app-managed)
  - `ocr_google_drive/token.json` (local OCR sign-in state; present only after activation)
- `tasks/` (created on first use of the task editor)
  - `tasks/lists/*.json` (saved task lists)
  - `tasks/library.json` (task row library)
  - `tasks/allowed_hosts.json` (allowlist for https link opening)
  - `tasks/column_widths.json` (task editor column widths)
  - `tasks/task_editor_position.json` (task editor last position; x/y only)

**Windows example (typical):**
`%APPDATA%\@cibersino\tot\config\...`

### 2.2 How to force Clean first-run

1. Fully close the app.
2. Rename or delete the `config/` directory described above.
3. Launch the app.

Expected: language selection path should be reachable on first run (see FR-01).

---

## 3) Test Data (use consistent inputs)

Use the following test text(s) for repeatability.

### 3.1 Small text (multiline + punctuation)

```
¡!
Buen día niñ@s.
Esto es una prueba: 1,234.56 — ¿funciona?
👨‍👩‍👧‍👦 👨‍👩‍👧 👨‍👩 👨 . . . . . . . ... ///   
```

### 3.2 Large text (edge-case only)

Any text large enough to stress editor limits and truncation messaging (see Edge cases).

### 3.3 Import/extract sample files

Prepare a small local sample set whose expected text is known ahead of time:
- Native text docs:
  - `sample.txt`
  - `sample.md`
  - `sample.html`
  - `sample.docx`
- Google-backed document samples:
  - `sample.rtf`
  - `sample.odt`
- PDFs:
  - `sample_selectable.pdf` (contains selectable/native text)
  - `sample_scanned.pdf` (image/scanned PDF; no usable text layer)
- OCR images:
  - at least one of `sample.jpg`, `sample.png`, `sample.webp`, `sample.bmp`, `sample.tif`, or `sample.tiff`

Recommended content for the text-like samples:
- reuse the “Small text” content from 3.1 so count/preview expectations are easy to compare
- for PDF/image OCR samples, use content that is visibly legible and easy to recognize after extraction

---

## 4) Release Smoke (5–15 minutes)

Record each test as Pass/Fail. If Fail, file an issue and reference it in the run log.

### SM-01 Startup + main window ready
**Goal:** app opens and main UI is usable.
1. Launch the app.
2. Confirm main window shows text preview + results section + stopwatch section.

**Expected:**
- No blocking modal/errors.
- Main controls exist (Overwrite/Append, Editor, Trash, Load/Save snapshots, Precise toggle, Presets controls, Stopwatch controls).

### SM-02 First-run language selection reachable (clean run only)
**Goal:** first-run language path is reachable and applies.
1. (Clean run) Launch app after removing config.
2. If language window appears, search/filter list and select **Español achilenao (`es-cl`)** (or any other language available).
3. Confirm window closes and app continues.

**Expected:**
- Language is applied without crash.
- If language picker does not appear automatically, it must be reachable via menu “Preferences → Language” (see REG-I18N-01).

### SM-03 Clipboard overwrite + automatic results
**Goal:** overwrite-from-clipboard (with repeat input) updates preview + counts + time.
1. Copy text to clipboard.
2. Set repeat input (`clipboardRepeatInput`) to `2` and click **📋↺** once.
3. Observe preview and results.

**Expected:**
- Preview shows start/end of the text (or full if short).
- Words/chars/time update immediately.
- With `N=2`, one click on **📋↺** writes two repeated clipboard blocks in a single overwrite.

### SM-04 Append clipboard (+ newline semantics + repeat input)
**Goal:** append-from-clipboard adds new content with correct newline/repeat semantics and updates counts.
1. Copy text to clipboard.
2. Set repeat input (`clipboardRepeatInput`) to `1` and click **📋+**.
3. Set repeat input to `2` and click **📋+** once.
4. Observe preview and results.

**Expected:**
- Text length increases; preview changes accordingly.
- Counts/time increase.
- With `N=2`, one click behaves like two consecutive appends using the same clipboard content.

### SM-05 Empty current text
**Goal:** clearing text resets results.
1. Click Trash (🗑) on main window.
2. Observe preview and results.

**Expected:**
- Preview shows empty-state label.
- Words/chars/time go to zero.
- Stopwatch is reset because current text becomes empty.

### SM-06 Counting mode toggle (precise/simple)
**Goal:** toggle works and results remain coherent.
1. Set non-empty text (SM-03).
2. Toggle “Modo preciso” on/off.
3. Observe that results change only in ways consistent with mode differences.

**Expected:**
- Toggle state changes and is preserved during session.
- No NaN/blank results.

### SM-07 Presets: select an existing preset updates time
**Goal:** selecting a preset changes WPM and time estimate.
1. In the preset selector, choose a preset (e.g., “default” or any available).
2. Observe WPM input/slider and time estimate.

**Expected:**
- WPM input/slider reflect preset WPM.
- Time estimate recalculates (same words, different time).

### SM-08 Editor window open + edit sync
**Goal:** editor opens and changes propagate to main.
1. Click manual editor (⌨).
2. Modify text.
3. Observe main window preview/results.
4. Close editor.

**Expected:**
- Main window reflects editor changes.
- No crash; no stuck “editor loader”.

### SM-09 Import/extract: supported non-PDF quick check
**Goal:** picker-based import/extract works for a supported non-PDF file and reaches the apply modal.
1. Click **📥**.
2. Select a supported non-PDF file such as `sample.txt`, `sample.md`, `sample.html`, `sample.docx`, `sample.rtf`, or `sample.odt`.
3. If the apply modal appears, leave repetitions at `1` and choose **Sobrescribir**.
4. Observe preview and results.

**Expected:**
- File picker opens and accepts supported formats.
- The app may briefly show prepare/progress UI during the run.
- The apply modal appears after successful extraction.
- After **Sobrescribir**, preview/results reflect the extracted text.

### SM-10 Import/extract: OCR/route-choice quick check
**Goal:** OCR-capable files follow the correct route and can be applied.
1. Click **📥** and select either:
   - an OCR-capable image, or
   - a PDF known to have both selectable text and OCR available.
2. If route choice appears, choose either **Usar nativa** or **Usar OCR** as appropriate for the file being tested.
3. If OCR activation disclosure appears, confirm it is understandable and either complete activation or cancel deliberately.
4. On success, apply the extracted text with **Sobrescribir** or **Agregar**.

**Expected:**
- OCR-only files do not offer the native route.
- Dual-route PDFs show the route-choice modal.
- OCR activation/disclosure appears only when required.
- Successful extraction reaches the apply modal and updates current text after apply.

### SM-11 Stopwatch + floating window quick check
**Goal:** stopwatch runs and floating window reflects state.
1. With non-empty text, press ▶ to start stopwatch.
2. Wait ~2–3 seconds; press pause.
3. Toggle floating window (label may appear as **VF**/**FW** depending language).
4. Confirm floating window shows same time/state; try start/pause from floating window.

**Expected:**
- Stopwatch display increments while running.
- Main and floating window remain synchronized after pause/resume actions from either window.

### SM-12 Menu: About + Updater
**Goal:** About modal loads and updater check is reachable.
1. Menu → open **About**.
2. Confirm modal opens and contains content.
3. Menu → run **Actualizar versión**.

**Expected:**
- About modal opens and content is readable; version/environment fields hydrate when available.
- Updater shows a dialog (up-to-date / update available / failure).

### SM-13 Current text snapshots (Save/Load)
**Goal:** save and load a snapshot via native dialogs.
1. Set non-empty text (SM-03).
2. Click **💾** and save as `smoke_snapshot.json` under `config/saved_current_texts/`.
3. Change current text (SM-04 or edit in editor).
4. Click **📂**, select `smoke_snapshot.json`, and confirm overwrite.

**Expected:**
- Snapshot file is created.
- Current text is overwritten; preview/results update.
- Stopwatch behavior follows REG-CRONO-02 semantics (non-empty restore: no reset; empty restore: reset).

### SM-14 Task editor: open + basic save
**Goal:** save and load tasks.
1. From the main window, click **📝** (new task) to open the task editor.
2. Add one row with required text (and any numeric fields as desired).
3. Save the task list (accept the save dialog; choose a name).
4. Close the task editor, click **🗃️** (load task), and verify the saved data is present.

**Expected:** 
- task editor opens
- save/load round-trip works

---

## 5) Full Regression Suite (30–60 minutes)

### REG-FR — First-run & language selection

#### REG-FR-01 Clean run: language picker behavior
**Goal:** first-run supports language selection.
1. Remove config (2.2).
2. Launch app.
3. Use search box to filter language list; select language.

**Expected:**
- Filtering works; selection applies; window closes.

#### REG-FR-02 Existing state: no first-run surprises
**Goal:** existing config loads without resets.
1. Launch app normally with existing config.
2. Confirm last-used language/text/presets/mode are consistent with prior run.

**Expected:**
- No unexpected resets of presets/text unless intentionally cleared.

#### REG-FR-03 First-run fallback when closing language window
**Goal:** startup remains unblocked if language window closes without explicit selection.
1. Remove config (2.2).
2. Launch app to show the language window.
3. Close the language window using the window close button (without selecting language).

**Expected:**
- App continues startup and main window opens.
- A safe fallback language is applied/persisted.
- No startup deadlock or blank state.

---

### REG-MAIN — Main window counting, preview, and consistency

#### REG-MAIN-01 Preview behavior (short vs long)
**Goal:** preview reflects correct short/long logic.
1. Set small text → confirm preview shows full (if within inline threshold).
2. Append small text repeatedly until preview truncates.
3. Observe preview shows “start… | …end” style.

**Expected:**
- Short text shows fully; long text shows start/end preview.

#### REG-MAIN-02 Overwrite vs append semantics
**Goal:** overwrite replaces, append adds with newline intent.
1. Overwrite with small text; capture counts.
2. Append small text; counts increase.
3. Overwrite again with small text; counts return near original.

**Expected:**
- Overwrite does not keep previous text; append does.

#### REG-MAIN-03 Empty text + stopwatch reset coupling
**Goal:** clearing text resets stopwatch reliably.
1. Click trash in Text Selector.

**Expected:**
- Text clears.
- Stopwatch resets to `00:00:00`.

#### REG-MAIN-04 Snapshots: overwrite + cancel semantics
**Goal:** load behaves like an overwrite flow; cancels are no-ops.
1. Set a known text `T1` (SM-03).
2. Click **💾** → `reg_T1.json` under `config/saved_current_texts/`.
3. Change current text to `T2`.
4. Click **📂** → select `reg_T1.json` → **cancel** overwrite confirmation.
5. Click **📂** again → select `reg_T1.json` → **confirm** overwrite.

**Expected:**
- After cancel: current text remains `T2`.
- After confirm: current text becomes `T1` and UI updates.

#### REG-MAIN-05 Clipboard repeat input normalization/clamp
**Goal:** invalid/overflow values in clipboard repeat input are normalized safely.
1. Copy a short text to clipboard.
2. Set repeat input to each value and click **📋↺** once per case: `''`, `0`, `-3`, `3.7`, `abc`.
3. Repeat step 2 with **📋+**.
4. Set repeat input to a very large value (e.g., `100000`) and click **📋↺** and **📋+**.

**Expected:**
- Invalid values (`''`, `0`, `-3`, decimal, text) are treated as `N=1` (no crash, no broken flow).
- Values above max are clamped to the app max (`MAX_CLIPBOARD_REPEAT` / UI max).
- Both clipboard actions still use a single IPC write path (observable as normal success/failure behavior, not repeated dialog/error bursts).

---

### REG-IMPORT/EXTRACT — Picker, drag/drop, routes, apply, and processing mode

#### REG-IMPORT-01 Picker entry + supported format list
**Goal:** the main import/extract entrypoint is available and the picker accepts the supported file set.
1. Click **📥**.
2. Inspect the native picker filter and confirm it allows supported native and OCR-capable formats.
3. Cancel the picker.

**Expected:**
- The button is present in the main controls row.
- The picker opens to a reasonable default/persisted folder.
- Supported formats include native text docs, Google-backed document formats, and OCR-capable images/PDFs.
- Cancelling the picker is a no-op.

#### REG-IMPORT-02 Drag/drop happy path
**Goal:** dropping one supported local file starts the same shared flow as the picker.
1. Drag one supported local file over the main window.
2. Confirm the full-window drop affordance appears.
3. Drop the file.
4. Complete the flow through apply.

**Expected:**
- Overlay appears only while a valid file drag is active.
- Drop starts prepare/execution/apply without opening the file picker.
- Result matches the same file processed through the picker path.

#### REG-IMPORT-03 Drag/drop invalid payload guardrails
**Goal:** drag/drop rejects unsupported payload shapes safely.
1. Drag two files at once over the main window and drop them.
2. Drag a non-file payload (if available, e.g. selected text from another app) over the window.
3. If feasible, drag an item that resolves to no valid local path.

**Expected:**
- Two-file drop is rejected with a user-facing “single file only” style notice.
- Non-file drags do not start import/extract.
- Invalid local-path resolution fails safely with user feedback.

#### REG-IMPORT-04 Preconditions block import/extract
**Goal:** import/extract refuses to start when a secondary window is open or the stopwatch is running.
1. Start the stopwatch and try **📥**.
2. Stop the stopwatch.
3. Open a secondary window (editor, task editor, or floating window if it counts in the current build) and try **📥** again.

**Expected:**
- The flow does not start while blocked.
- User-facing guidance indicates that secondary windows must be closed and the stopwatch stopped before import/extract can start.

#### REG-IMPORT-05 Supported text/document extraction across declared formats
**Goal:** each declared text/document format extracts text and reaches the apply modal.
1. Run import/extract for:
   - `sample.txt`
   - `sample.md`
   - `sample.html`
   - `sample.docx`
   - `sample.rtf`
   - `sample.odt`
   - `sample_selectable.pdf`
2. For each successful run, use **Sobrescribir** with repetitions `1`.

**Expected:**
- `sample.txt`, `sample.md`, `sample.html`, `sample.docx`, and `sample_selectable.pdf` complete through the native route unless the user explicitly chooses OCR for the PDF.
- `sample.rtf` and `sample.odt` complete through the connected Google-backed extraction path.
- Extracted text is normalized into usable app text (preview/counts/time update).
- `sample_selectable.pdf` does not require OCR if native text is available and OCR is not explicitly chosen.

#### REG-IMPORT-06 PDF route choice when both routes are available
**Goal:** a dual-route PDF requires an explicit route choice and both choices are honored.
1. Use a PDF with selectable text while OCR is available.
2. Start import/extract and confirm the route-choice modal appears.
3. Cancel once.
4. Start again, choose **Usar nativa**, complete apply, note the result.
5. Start again, choose **Usar OCR**, complete apply, note the result.

**Expected:**
- Route-choice modal appears only for PDFs with both native and OCR routes available.
- Cancel is a no-op.
- Native and OCR choices both execute the selected route and reach the apply modal.

#### REG-IMPORT-07 OCR-only routing for images and scanned PDFs
**Goal:** OCR-only inputs skip native route selection and use the OCR path.
1. Run import/extract on one OCR-capable image, ideally including one of `sample.tif` or `sample.tiff`.
2. Run import/extract on `sample_scanned.pdf`.

**Expected:**
- No native-route option is offered for OCR-only inputs.
- If OCR is ready, extraction proceeds to the apply modal.
- If OCR is not ready, the app surfaces the correct OCR setup/activation failure instead of a generic error.

#### REG-IMPORT-08 Apply modal semantics
**Goal:** apply modal supports overwrite/append/cancel and repeat normalization.
1. Complete an extraction successfully so the apply modal appears.
2. Cancel once and confirm current text does not change.
3. Re-run extraction and choose **Sobrescribir** with repetitions `1`.
4. Re-run extraction and choose **Agregar** with repetitions `2`.
5. Re-run extraction and test invalid repeat values (`0`, `-1`, `abc`, decimal, very large number`) before blur/submit.

**Expected:**
- Cancel is a no-op.
- Overwrite replaces current text; append adds to it.
- Repeat input normalizes/clamps like the canonical text-apply path.
- On successful apply, preview/results update through the normal current-text subscription flow.

#### REG-IMPORT-09 Processing mode lock + abort
**Goal:** processing mode blocks main-window interactions until completion or abort, and abort exits cleanly.
1. Start an import/extract run that lasts long enough to observe the processing bar (OCR path is the easiest).
2. While processing is active, try other main-window actions such as clipboard overwrite, editor open, snapshot load, or task open.
3. Click **⛔** to abort.

**Expected:**
- Main controls are replaced by the processing UI while active.
- Main-window actions are blocked with user-facing feedback until processing ends or abort is requested.
- Abort stops the run, exits processing mode, restores normal controls, and leaves current text unchanged by the cancelled run.

#### REG-IMPORT-10 Delayed OCR waiting copy
**Goal:** long OCR runs update the waiting copy without breaking elapsed-time reporting.
1. Start a long OCR run and wait at least ~60 seconds if possible.
2. Observe the processing label and elapsed text while the run is active.

**Expected:**
- Elapsed time remains visible and updates during processing.
- OCR waiting copy shifts to the delayed wording after the long-running threshold.

---

### REG-OCR — Activation, disconnect, and OCR-specific outcomes

#### REG-OCR-01 Activation disclosure + cancel path
**Goal:** first OCR use can require activation, shows disclosure, and honors cancel safely.
1. Ensure OCR is not yet connected in this app instance (or disconnect first).
2. Start an OCR-required import/extract run.
3. When the disclosure modal appears, review:
   - intro copy
   - selected-files disclosure
   - local-storage disclosure
   - remote-cleanup disclosure
   - disconnect guidance
4. Click the privacy-policy link.
5. Cancel the disclosure.

**Expected:**
- Disclosure modal appears before browser OAuth launch.
- Privacy policy opens through the app-doc path.
- Cancel leaves OCR disconnected and the import/extract flow does not continue.

#### REG-OCR-02 Activation success + automatic retry
**Goal:** successful OCR activation retries the blocked extraction automatically.
1. Start an OCR-required import/extract run while disconnected.
2. Accept the disclosure and complete Google auth in the system browser.
3. Return to the app and observe the original extraction flow.

**Expected:**
- Activation success is surfaced to the user.
- The app retries preparation automatically after activation.
- The original OCR extraction continues without requiring manual restart.

#### REG-OCR-03 Token-invalid recovery path
**Goal:** invalid saved OCR sign-in state produces recovery instead of a dead-end generic error.
1. (Advanced) Corrupt or invalidate the saved OCR token state.
2. Start an OCR-required import/extract run.

**Expected:**
- The app identifies invalid OCR sign-in state.
- Recovery path routes back through activation/disclosure instead of silently failing.

#### REG-OCR-04 Disconnect from Preferences
**Goal:** the Preferences menu disconnect action revokes the saved sign-in state and reports the result clearly.
1. Ensure OCR is connected.
2. Menu → Preferences → **Disconnect Google OCR**.
3. Cancel once.
4. Run the same menu action again and confirm disconnect.
5. Attempt an OCR-required import/extract run after disconnect.

**Expected:**
- Cancel leaves OCR connected.
- Confirm disconnect removes the saved OCR sign-in state and shows success feedback.
- A later OCR run requires activation again.

#### REG-OCR-05 Disconnect when not connected
**Goal:** disconnect behaves safely when there is no saved OCR token.
1. Ensure OCR is not connected.
2. Menu → Preferences → **Disconnect Google OCR**.

**Expected:**
- The app reports that Google OCR is not connected in this app instance.
- No crash and no misleading success state.

---

### REG-MODE — Counting mode (simple/precise)

#### REG-MODE-01 Toggle persistence in-session
**Goal:** toggle affects counting without breaking formatting.
1. With non-empty text, toggle precise mode on/off multiple times.
2. Observe counts update each time and remain formatted.

**Expected:**
- No blank results; mode toggles reliably.

#### REG-MODE-02 Mode persisted across restart (existing-config)
**Goal:** mode stored in settings persists.
1. Set mode to “simple”.
2. Close app, relaunch.
3. Confirm mode toggle state matches prior selection.

**Expected:**
- Mode is restored from settings and reflected in UI toggle.

---

### REG-PRESETS — Presets CRUD, defaults, and persistence

#### REG-PRESETS-01 Create preset
**Goal:** create a new preset and verify selection.
1. Click **Nuevo**.
2. Enter name (e.g., `test`), WPM 300, with a description (optional).
3. Save.

**Expected:**
- Preset appears in select list and becomes selectable.
- Selecting it updates WPM + time estimate.

#### REG-PRESETS-02 Edit preset
**Goal:** edit an existing preset and verify it updates.
1. Select `test`.
2. Click **Editar**.
3. Change WPM to 275 and save.
4. Save and confirm dialog.

**Expected:**
- Preset now shows updated WPM and affects time estimate.

#### REG-PRESETS-03 Change language
1. Change app language to another base language and open the preset dropdown list. 

**Expected:**
- New and edited preset is not showing.

#### REG-PRESETS-04 Delete preset
**Goal:** delete a user preset and verify it disappears.
1. Go back to the previous language.
2. Select `test`.
3. Click delete (🗑).
4. Save and confirm dialog.

**Expected:**
- Preset no longer appears.
- App selects a safe fallback preset (e.g., “default” or first available).

#### REG-PRESETS-05 Repeat REG-01 to REG-04 with default presets
1. Repeat edit/delete flows with a **general default** preset (e.g., `default`).
2. Repeat edit/delete flows with a **language default** preset (if present in current language).
3. After deleting a default preset in current language, switch to another language and verify it is not globally removed.
4. Run **Restore defaults (R)** and verify removed defaults reappear for current language.

**Expected:**
- Default preset edit/delete flows complete without corruption/crash.
- Deletion of defaults respects language scoping (no unintended cross-language removal).
- Restore defaults recovers removed defaults for the active language.

#### REG-PRESETS-06 Restore defaults
**Goal:** restoring defaults yields a sane list and selection.
1. Click **R** (reset defaults).
2. Verify preset list repopulates.

**Expected:**
- Defaults restored; selection remains valid or falls back safely.

#### REG-PRESETS-07 Persistence across sessions
**Goal:** selected preset persists for language base.
1. Create or edit a preset.
2. Select it.
3. Close app; relaunch.
4. Verify the same preset is selected and applied.

**Expected:**
- Selected preset persisted and reapplied.

---

### REG-EDITOR — Manual editor flows and semantics

#### REG-EDITOR-01 Open editor and initial content
**Goal:** editor opens with current text.
1. Set a known text in main.
2. Open editor.
3. Verify editor area contains the same text.

**Expected:**
- Editor initializes from current text.

#### REG-EDITOR-02 Edit and propagate
**Goal:** editor edits update main view.
1. Modify text in manual editor (add/remove a line).
2. Paste/drop any text directly.
3. Overwrite/append with main window buttons.
4. Observe main window updates (wait 1 second or after apply/close).

**Expected:**
- Main reflects updated text and recounts results.

#### REG-EDITOR-03 CALCULAR
1. Uncheck automatic calculation in manual editor.
2. Modify text and wait.
3. Press CALCULAR.

**Expected:**
- Main reflects updated text only after you press the button.

#### REG-EDITOR-04 Editor clear
**Goal:** clearing inside editor clears main consistently.
1. Use editor clear control (trash/clear).
2. Confirm main shows empty state.

**Expected:**
- Editor clear sends state update to main; both stay consistent.

#### REG-EDITOR-05 Find (Ctrl+F) — modal mode + navigation + highlight
**Goal:** Find works on textarea content, does not edit text, scrolls to matches, and shows highlight while focus stays in find input.
1. Ensure editor has a text with repeated terms across multiple lines (use Small text, then add a repeated word like `prueba` in several lines).
2. Press **Ctrl+F** (or Cmd+F on macOS).
3. Type a query that has multiple matches.
4. Navigate:
   - **Enter** = next
   - **Shift+Enter** = previous
   - **F3** / **Shift+F3** = next/previous
5. While Find is open:
   - Try typing in the textarea, pressing Enter/Backspace, pasting (Ctrl+V), and dropping text.
6. Confirm visibility:
   - Match highlight must be visible even when focus is in the find input.
   - Use Next/Prev to jump to matches that are off-screen; verify internal textarea scroll moves to the match.
7. Scroll the textarea manually (mouse wheel / scrollbar) while Find remains open.

**Expected:**
- Find opens and focuses the find input.
- Navigation selects the match and scrolls the textarea so the match is in view.
- Text is not modifiable while Find is open (readOnly/modal behavior + blocked paste/drop/input).
- Highlight remains visible while focus stays in the find input (overlay-based highlight).
- Highlight stays aligned while scrolling the textarea.
- **Esc** closes Find and restores normal editing.

#### REG-EDITOR-06 Undo/Redo semantics (including Find not polluting edits)
**Goal:** Undo/Redo behaves predictably for edits and is not affected by Find navigation.
1. In editor, type a short string (e.g., `AAA`) in the middle of the text.
2. Press **Ctrl+Z** (undo) → verify the insertion is reverted.
3. Press **Ctrl+Y** (redo) (or Ctrl+Shift+Z depending on OS/browser behavior) → verify the insertion returns.
4. Paste a short string (Ctrl+V) in the middle; undo/redo it.
5. Open Find (**Ctrl+F**), search and navigate multiple times (Enter/F3), then close Find (Esc).
6. Press **Ctrl+Z** once.

**Expected:**
- Undo/Redo works for typing edits and paste edits in the textarea.
- Find open/navigate/close does not modify the document.
- After using Find, **Ctrl+Z** undoes the last real edit (not “selection movement” from Find), and the text remains intact.

---

### REG-TASKS — Task editor (lists, library, links)

#### REG-TASKS-01 Open new task editor + close guard
**Goal:** Task editor window open/close correctly.
1. From the main window, click new task (**📝**).
2. Verify the task editor window opens and is interactive (you can add/edit rows).
3. Attempt to close with unsaved changes:
   - Cancel keeps the window open.
   - Confirm closes the window.

**Expected:**
- Window opens.
- Close confirmation behaves correctly.

#### REG-TASKS-02 Save + load task list
**Goal:** saved list can be reopened.
1. Open Tasks editor (📝).
2. Add 2 rows with distinct values.
3. Save as a new list (name: e.g., "demo").
4. Close editor.
5. Click **🗃️** to load a Task in the saved folder.
6. Click Save again and choose the same filename (overwrite).

**Expected:**
- Loaded list shows the same rows + meta name.
- Overwrite confirmation: at most one confirmation (OS dialog); no additional in-app overwrite prompt.

#### REG-TASKS-03 Delete task list
**Goal:** Delete a task is working.
1. Load a previously saved list so a source path is present.
2. Trigger delete; accept the confirmation.
3. Try loading the same list again.

**Expected:**
- Delete removes the file.
- Deleted list is no longer available in the open dialog (or, if force-selected by path, load fails safely with user-facing notice).

#### REG-TASKS-04 Library save/load/delete
**Goal:** Save and load a text row to general library.
1. Save a row to the library (once without comment, once with comment if supported).
2. Open the library modal and verify the saved entry appears.
3. Insert/apply the library entry into the current task list.
4. Delete the library entry and verify it disappears.

**Expected:**
- Library list/save/delete works.
- Confirmation deny is a no-op.

#### REG-TASKS-05 Column widths persistence
**Goal:** Resize columns widths.
1. Resize at least two task editor columns.
2. Close and reopen the task editor.
3. Verify the widths persisted.

**Expected:**
- Column widths restore on open.

#### REG-TASKS-06 Link opening
**Goal:** link opening respects https + allowlist rules.
1. Open Tasks editor and add a row with Link populated.
2. Test cases:
   a) https://example.com (first time): confirm dialog; can "trust host"; opens.
   b) https://example.com (after trusting): opens without confirm.
   c) http://example.com: blocked; show "Link blocked."
   d) Local absolute path (e.g., C:\Users\...\file.pdf):
      - With an existing file: confirm dialog; opens if accepted.
      - With a missing file: show "File not found."

**Expected:**
- Confirm prompt appears for (a) and (d) and not for (b).
- (c) is blocked with user-visible notice.
- Local path opens only if the file exists and the user confirms.

#### REG-TASKS-07 Task editor window position persistence
**Goal:** Task editor position keep the same position after close.
1. Open the task editor and move it to a noticeable position.
2. Close and reopen the task editor.
3. Verify the position is restored (size may remain fixed).

**Expected:**
- Position (x/y) is restored.

---

### REG-CRONO — Stopwatch + floating window

#### REG-CRONO-01 Start/pause/reset in main
**Goal:** stopwatch controls behave correctly.
1. Start (▶), wait, pause, reset (⏹).
2. Confirm display changes as expected.

**Expected:**
- Time increments while running; reset returns to 00:00:00.

#### REG-CRONO-02 Text change semantics (non-empty vs empty)
**Goal:** non-empty text changes do not reset, but empty text does reset.
1. Start stopwatch.
2. While running, overwrite/append with a **non-empty** text (clipboard or editor).
3. Confirm stopwatch does **not** reset.
4. Clear current text (trash in main window).
5. Confirm stopwatch resets.

**Expected:**
- Non-empty text changes keep elapsed state.
- Clearing text resets to `00:00:00`.

#### REG-CRONO-03 Floating window state sync + unfocused behavior
**Goal:** floating window remains usable when main is unfocused.
1. Enable floating window (label may appear as **VF**/**FW** depending language).
2. Alt-tab away (unfocus app), then interact with floating window (play/pause/stop).
3. Verify state remains consistent when returning to main.

**Expected:**
- Floating window remains usable while main is unfocused and stays synchronized with main stopwatch state.

---

### REG-MENU — Menu actions and routing (Guide/Instructions/FAQ/About)

#### REG-MENU-01 Open Guide/Instructions/FAQ
**Goal:** info modal loads content and scrolls to section.
1. Open Guide (guia_basica), then Instructions, then FAQ via menu.
2. Confirm correct section visible.

**Expected:**
- Info modal opens; content loads from `public/info/*` and scroll targeting works.

#### REG-MENU-02 About modal hydration
**Goal:** About shows version + runtime info when available.
1. Open About.
2. Confirm version and environment fields are populated (or show N/A safely).

**Expected:**
- No crash; safe fallback when APIs unavailable.

#### REG-MENU-03 Link opening restrictions
**Goal:** external links are restricted; app docs open properly (packaged preferred).
1. From About (or other UI link points), attempt to open:
   - GitHub release/docs links (allowed host)
   - DOI links from “Links de interés” (allowed host)
2. (Packaged build) open bundled docs (LICENSE, PRIVACY, etc.) if wired in UI.

**Expected:**
- Only HTTPS + allowlisted hosts are opened externally (GitHub/DOI set).
- App docs open via OS viewer; missing docs yield safe failure.

#### REG-MENU-04 OCR disconnect menu action reachable
**Goal:** Preferences exposes the OCR disconnect action when the feature is present.
1. Open the Preferences menu.
2. Locate **Disconnect Google OCR**.
3. Trigger it and follow either the cancel path or the success/not-connected path.

**Expected:**
- Menu action is reachable from Preferences.
- It routes into the same disconnect flow covered by REG-OCR-04/05.

---

### REG-PERSIST — Persistence sanity

#### REG-PERSIST-01 Files created as expected (clean run)
**Goal:** app creates minimal state files.
1. Clean run launch.
2. Perform: set text, change mode, select a preset, open editor once, and complete one valid picker-based import/extract selection.
3. Close app.
4. Verify config files exist (`user_settings.json`, `current_text.json`, `editor_state.json`, `import_extract_state.json`).

**Expected:**
- Files exist; JSON is valid; no zero-byte corruption.

#### REG-PERSIST-02 Restore with existing config
**Goal:** relaunch loads last state.
1. Relaunch app.
2. Confirm:
   - last text restored
   - last language/mode restored
   - selected preset restored

**Expected:**
- State matches prior session (unless intentionally cleared).

#### REG-PERSIST-03 Snapshots folder + subfolder load (relaunch)
**Goal:** snapshots work under `config/saved_current_texts/` (including subfolders) across relaunch.
1. Set a known text `TP1`.
2. Click **💾** and save as `sub/persist_TP1.json` under `config/saved_current_texts/` (create `sub/` if needed).
3. Close app and relaunch.
4. Click **📂**, select `sub/persist_TP1.json`, confirm overwrite.

**Expected:**
- Snapshot remains on disk after relaunch.
- Loading from a descendant subfolder works and overwrites current text.

#### REG-PERSIST-04 Tasks: config/tasks persistence (lists, library, allowlist, widths, window position)
**Goal:** task feature state persists under config/tasks and reloads correctly after restart.
1. Click **📝** to open Tasks editor.
2. Resize at least two columns to non-default widths.
3. Add a row with a distinctive Text + Time and an optional Comment.
4. Save the list (name: e.g., "persist_demo").
5. Save the same row into Library (choose Include comment = Yes).
6. Open an https link to a new host and choose "Trust this host from now on".
7. Move the Tasks editor window to a distinctive position; close the editor; quit the app.
8. Inspect `config/tasks/` on disk:
   - `lists/persist_demo.json` exists
   - `library.json` exists
   - `allowed_hosts.json` exists
   - `column_widths.json` exists
   - `task_editor_position.json` exists
9. Relaunch the app.
10. Open Tasks editor and verify:
    - Window position restored (x/y) and fully visible.
    - Column widths restored.
    - Library entry still present.
    - Opening a link to the trusted host does not prompt again.

**Expected:**
- All files above exist and are valid JSON.
- Tasks state (position, column widths, library, allowed hosts) persists across restart.

#### REG-PERSIST-05 Import/extract picker + OCR runtime state persistence
**Goal:** import/extract persists its picker folder and OCR runtime state files correctly.
1. Use **📥** to open a file from a non-default folder and complete or cancel the run after selection.
2. If OCR is part of the build, complete OCR activation once.
3. Close the app.
4. Inspect config:
   - `import_extract_state.json` exists and records the last used directory
   - `ocr_google_drive/credentials.json` exists in OCR-enabled builds
   - `ocr_google_drive/token.json` exists after successful OCR activation
5. Relaunch the app and open **📥** again.

**Expected:**
- Picker state persists and reopens in the last-used directory when that directory still exists.
- OCR runtime files exist only when the relevant state has actually been created.
- Relaunch preserves OCR-connected state until disconnect is requested.

---

### REG-I18N — Language switching and number formatting

#### REG-I18N-01 Switch language via Preferences menu
**Goal:** language selection window is reachable and applies.
1. Menu → Preferences → Language.
2. Select a different language.
3. Confirm UI text changes and number formatting remains consistent.

**Expected:**
- Language window works; UI strings update.
- Numbers use correct separators per language settings.

#### REG-I18N-02 Cross-window i18n consistency
**Goal:** editor/preset/flotante reflect language updates.
1. Change language.
2. Open editor, preset modal, floating window, task editor.

**Expected:**
- Each window applies translations without crash.

---

### REG-UPDATER — Manual update check

#### REG-UPDATER-01 Up-to-date path (or failure-safe)
**Goal:** updater check shows a user-visible result and never silently updates.
1. Menu → “Actualizar versión”.
2. Observe dialog result.

**Expected:**
- If up to date: dialog indicates so.
- If network unavailable / API failure: dialog indicates failure (manual path).

---

## 6) Edge Cases / Known-Risk Scenarios (run as needed)

### EDGE-01 Large paste / truncation behavior
**Goal:** app handles oversized text safely.
1. Attempt to paste/drop very large text in editor (well above paste/drop threshold).
2. Attempt to exceed max text size by typing/concatenating until near hard limit.
3. Observe notices and resulting text size.

**Expected:**
- Oversized paste/drop is rejected or limited safely (no freeze/crash).
- Hard-cap overflow paths truncate safely when applicable.
- UI remains responsive and user receives notice on limit/truncation scenarios.

### EDGE-02 Offline updater
**Goal:** updater fails gracefully without hanging.
1. Disable network.
2. Run updater check.

**Expected:**
- Safe failure dialog; no crash.

### EDGE-03 Corrupt JSON recovery
**Goal:** app recovers from invalid JSON using fallback.
1. (Advanced) Corrupt `user_settings.json` or `current_text.json` (invalid JSON).
2. Launch app.

**Expected:**
- App logs warning and uses fallback values; remains usable.

### EDGE-04 Snapshot load: invalid file + outside snapshots tree
**Goal:** invalid/outside selections do not crash and do not change current text.
1. Set a known current text `TE1`.
2. Create `config/saved_current_texts/invalid.json` with invalid JSON (e.g., `{`).
3. Click **📂** and select `invalid.json`.
4. Click **📂** again and select a JSON file outside `config/saved_current_texts/` (navigate via dialog).
5. (Advanced) Repeat step 4 via a symlink/junction escape if applicable.

**Expected:**
- Invalid snapshot shows failure notice; current text remains `TE1`.
- Outside-tree selection is rejected with “outside snapshots tree” notice; current text remains `TE1`.
- No crash/hang.

### EDGE-05 Append repeat overflow guards (IPC/text cap)
**Goal:** repeated append fails safely when projected payload/size exceeds limits.
1. Put a large text in clipboard (large enough that repeating with high `N` can exceed limits).
2. Set repeat input to a high value and click **📋+**.
3. If current text is already near max size, click **📋+** again with any valid `N`.

**Expected:**
- If projected payload exceeds IPC cap, append is aborted with the same “append too large” behavior.
- If text limit is already reached, append is blocked with text-limit behavior.
- Current text is not corrupted and app remains responsive.

### EDGE-06 Import/extract unsupported format
**Goal:** unsupported files fail with a specific user-visible message and no broken UI state.
1. Try import/extract with an unsupported file extension.
2. Repeat via picker and, if possible, via drag/drop.

**Expected:**
- Unsupported format is rejected safely.
- Processing mode does not get stuck.
- Current text remains unchanged.

### EDGE-07 Import/extract prepared state invalidation
**Goal:** stale prepared runs do not execute against changed/expired source state.
1. Start a flow that reaches route choice or other post-prepare UI.
2. Before continuing, modify, replace, move, or delete the source file if feasible.
3. Continue the flow.

**Expected:**
- Execution is rejected safely if the prepared state is invalid/expired/reused or the source fingerprint changed.
- No stale text is applied.

### EDGE-08 OCR offline/setup failure paths
**Goal:** OCR-specific setup/runtime failures stay specific and recoverable.
1. Disable network and start an OCR-required import/extract run.
2. Re-enable network and try again.
3. If you have a build without bundled OCR credentials, attempt the same run there.

**Expected:**
- Offline OCR shows a connectivity-style failure, not a generic crash.
- Re-running after network restoration can succeed.
- Missing/invalid bundled-credentials builds report the specific setup problem.

---

## 7) Result Recording

Create a short log entry for each run (store wherever the release process stores evidence).

### 7.1 Run metadata (minimum)
- Date/time:
- Version (app):
- Build type: packaged ZIP / dev
- OS:
- Config state: clean first-run / existing
- Network: on/off (if updater tested)
- OCR state before run: disconnected / connected / not available in build

### 7.2 Checklist result
- Release smoke: Pass / Fail
- Full regression: Pass / Fail (if run)

### 7.3 Failure recording rules
For each failure:
- Test ID (e.g., SM-04)
- Observed behavior
- Expected behavior
- Repro steps (if different)
- Issue link created (label: `bug`, plus area label: `i18n` / `presets` / `editor` / `updater` / `crono`)

---

## 8) Notes for triage (non-invasive)

- Prefer **observable UI outcomes** over timing assumptions.
- If needed, open DevTools only to *observe* console errors; do not mutate runtime state during verification.
