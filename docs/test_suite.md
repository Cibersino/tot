# App-level Manual Test Suite (Release Smoke + Regression)

**Purpose:** Provide a single, stable, app-level manual test suite to run:
- **Before every release** (fast “Release smoke” subset).
- **After high-risk refactors** (full regression).

**Scope coverage (app-level):**
- Startup + first-run language selection
- Clipboard overwrite/append, empty text, automatic count/time calculation
- Counting mode (simple/precise) + consistency
- Presets CRUD + defaults restore + persistence
- Manual editor window (open/edit/apply semantics)
- Stopwatch (velocity) + floating window behavior (unfocused app)
- Menu actions: Guide/Instructions/FAQ/About (+ link routing)
- Persistence sanity (settings/current_text/editor_state)
- i18n: language switching + number formatting consistency
- Updater check (manual)

---

## 0) Definitions

- **Release smoke:** 5–15 minutes, minimum confidence gate for publishing.
- **Full regression:** 30–60 minutes, end-to-end validation across all primary windows/flows.

---

## 1) Preconditions / Test Environments

### 1.1 Supported environments (minimum)

- OS: Windows 10/11.
- Build: Prefer **packaged ZIP build** for “Release smoke”.
  - Dev mode is acceptable for most UI flows, but **some doc-opening behaviors differ** (see 1.3).

### 1.2 Required conditions

- Clipboard access available (to test overwrite/append).
- Network access available for updater check (GitHub API).

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
- plus `presets_defaults/` (runtime defaults copies)

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
2. If language window appears, search/filter list and select **Chileno** (or any other regional language available).
3. Confirm window closes and app continues.

**Expected:**
- Language is applied without crash.
- If language picker does not appear automatically, it must be reachable via menu “Preferences → Language” (see REG-i18n-02).

### SM-03 Clipboard overwrite + automatic results
**Goal:** overwrite-from-clipboard updates preview + counts + time.
1. Copy text to clipboard.
2. Click **📋↺**.
3. Observe preview and results.

**Expected:**
- Preview shows start/end of the text (or full if short).
- Words/chars/time update immediately.

### SM-04 Append clipboard (+ newline semantics)
**Goal:** append-from-clipboard adds new content and updates counts.
1. Copy text to clipboard.
2. Click **📋+**.
3. Observe preview and results.

**Expected:**
- Text length increases; preview changes accordingly.
- Counts/time increase.

### SM-05 Empty current text
**Goal:** clearing text resets results.
1. Click Trash (🗑) on main window.
2. Observe preview and results.

**Expected:**
- Preview shows empty-state label.
- Words/chars/time go to zero.
- Stopwatch is reset due to text change.

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

### SM-09 Stopwatch + floating window quick check
**Goal:** stopwatch runs and floating window reflects state.
1. With non-empty text, press ▶ to start stopwatch.
2. Wait ~2–3 seconds; press pause.
3. Toggle **FW** (floating window).
4. Confirm floating window shows same time/state; try start/pause from floating window.

**Expected:**
- Stopwatch display increments while running.

### SM-10 Menu: About + Updater
**Goal:** About modal loads and updater check is reachable.
1. Menu → open **About**.
2. Confirm modal opens and contains content.
3. Menu → run **Actualizar versión**.

**Expected:**
- About modal opens and content is readable; version/environment fields hydrate when available.
- Updater shows a dialog (up-to-date / update available / failure).

### SM-11 Current text snapshots (Save/Load)
**Goal:** save and load a snapshot via native dialogs.
1. Set non-empty text (SM-03).
2. Click **Save** and save as `smoke_snapshot.json` under `config/saved_current_texts/`.
3. Change current text (SM-04 or edit in editor).
4. Click **Load**, select `smoke_snapshot.json`, and confirm overwrite.

**Expected:**
- Snapshot file is created.
- Current text is overwritten; preview/results update.
- Stopwatch resets due to text change.

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

#### REG-MAIN-04 Snapshots: overwrite + cancel semantics
**Goal:** load behaves like an overwrite flow; cancels are no-ops.
1. Set a known text `T1` (SM-03).
2. Click **Save** → `reg_T1.json` under `config/saved_current_texts/`.
3. Change current text to `T2`.
4. Click **Load** → select `reg_T1.json` → **cancel** overwrite confirmation.
5. Click **Load** again → select `reg_T1.json` → **confirm** overwrite.

**Expected:**
- After cancel: current text remains `T2`.
- After confirm: current text becomes `T1` and UI updates.

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
- Repeat previous steps with a default preset
- Repeat previous steps with a language default preset.

**Expected:**
- Same results.

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

### REG-CRONO — Stopwatch + floating window

#### REG-CRONO-01 Start/pause/reset in main
**Goal:** stopwatch controls behave correctly.
1. Start (▶), wait, pause, reset (⏹).
2. Confirm display changes as expected.

**Expected:**
- Time increments while running; reset returns to 00:00:00.

#### REG-CRONO-02 Text change forces reset
**Goal:** any text update triggers crono reset.
1. Start stopwatch.
2. Overwrite/Append clipboard or edit in editor.
3. Confirm crono resets.

**Expected:**
- Reset is requested automatically on textChanged.

#### REG-CRONO-03 Floating window state sync + unfocused behavior
**Goal:** floating window remains usable when main is unfocused.
1. Enable VF (floating window).
2. Alt-tab away (unfocus app), then interact with floating window (play/pause/stop).
3. Verify state remains consistent when returning to main.

**Expected:**
- Floating window shows always on top, with updated state and control the stopwatch.

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
2. (Packaged build) open bundled docs (LICENSE, PRIVACY, etc.) if wired in UI.

**Expected:**
- Only HTTPS + allowed GitHub hosts are opened externally.
- App docs open via OS viewer; missing docs yield safe failure.

---

### REG-PERSIST — Persistence sanity

#### REG-PERSIST-01 Files created as expected (clean run)
**Goal:** app creates minimal state files.
1. Clean run launch.
2. Perform: set text, change mode, select a preset, open editor once.
3. Close app.
4. Verify config files exist (`user_settings.json`, `current_text.json`, `editor_state.json`).

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
2. Click **Save** and save as `sub/persist_TP1.json` under `config/saved_current_texts/` (create `sub/` if needed).
3. Close app and relaunch.
4. Click **Load**, select `sub/persist_TP1.json`, confirm overwrite.

**Expected:**
- Snapshot remains on disk after relaunch.
- Loading from a descendant subfolder works and overwrites current text.

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
2. Open editor, preset modal, floating window.

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
1. Attempt to paste or insert very large text in editor.
2. Observe truncation warnings / safe behavior.

**Expected:**
- Text is truncated to max limits; UI remains responsive.
- Warning/notice may appear for truncation.

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
3. Click **Load** and select `invalid.json`.
4. Click **Load** again and select a JSON file outside `config/saved_current_texts/` (navigate via dialog).
5. (Advanced) Repeat step 4 via a symlink/junction escape if applicable.

**Expected:**
- Invalid snapshot shows failure notice; current text remains `TE1`.
- Outside-tree selection is rejected with “outside snapshots tree” notice; current text remains `TE1`.
- No crash/hang.

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
