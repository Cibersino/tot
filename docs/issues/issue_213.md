# Issue 213 — Reading-test editor countdown is sent before editor renderer readiness

## Objective

Document the reading-test countdown bug in the editor window and capture the confirmed root cause based on local code review plus runtime trace evidence.

This issue should help implementation stay focused on the actual startup ordering problem and avoid speculative fixes in the wrong layer.

## Bug

When a reading test starts, the editor countdown overlay is not reliable:

1. sometimes the countdown overlay does not appear at all;
2. sometimes there is a small visible gap where the plain editor window appears before the overlay shows.

The second symptom is easy to notice visually:

* the editor window becomes visible;
* the user can briefly see the text area;
* only after that does the countdown overlay appear.

The first symptom is intermittent rather than deterministic:

* the reading test starts;
* the editor window opens;
* the countdown overlay is expected;
* sometimes no overlay appears during the prestart window.

## Confirmed product constraint

The editor must be closed before a reading test can start.

Current local evidence:

* `electron/reading_test_session.js`
  * `checkEntryAvailability()`
  * blocks the feature when any secondary window is open
* `electron/main.js`
  * the reading-test precondition context includes `editor` in `openSecondaryWindows`

This means every reading test uses the fresh editor-window creation path.

## Confirmed runtime behavior

### Editor window lifecycle

The editor window is created with:

* `show: false`

and then shown from:

* `electron/main.js`
  * `createEditorWindow()`
  * `editorWin.once('ready-to-show', ...)`
  * `editorWin.show()`

So the editor becomes visible as soon as Electron considers it ready to show its first painted frame.

### Reading-test startup ordering

The reading-test session currently does the following:

* `electron/reading_test_session.js`
  * `openReadingSessionWindows()`
  * `waitForWindowVisible(editorWin, 'EDITOR')`
  * `startEditorCountdown(editorWin)`
  * `editorWin.webContents.send('reading-test-prestart-countdown', { ... })`

The key point is:

* the countdown send is gated on window visibility;
* it is not gated on confirmed renderer listener readiness.

### Editor listener location

The countdown listener is attached in the editor renderer:

* `public/editor.js`
  * `window.editorAPI.onReadingTestCountdown((payload) => { ... })`

This listener is registered near the end of the file, during normal top-level script execution.

### Overlay implementation

The overlay path already exists:

* `public/editor.html`
  * `#readingTestCountdownOverlay`
  * `#readingTestCountdownValue`
* `public/editor.css`
  * `.reading-test-countdown-overlay`
* `public/editor.js`
  * `startReadingTestCountdown(payload)`
  * `setReadingTestCountdownVisible(true)`

So the missing-overlay symptom is not explained by missing DOM/CSS wiring.

## External platform evidence

Electron's official documentation states:

* `ready-to-show` fires when the renderer has rendered the page for the first time;
* it is usually emitted after `did-finish-load`, but it may be emitted before `did-finish-load`;
* `did-finish-load` is the point where navigation is done and the page `onload` has been dispatched.

Sources:

* https://www.electronjs.org/docs/latest/api/browser-window
* https://www.electronjs.org/docs/latest/api/web-contents

## Confirmed diagnosis

The missing countdown is caused by a real startup race in the current reading-test/editor orchestration.

Confirmed facts:

* the reading-test session gates countdown send on editor window visibility;
* the session does not gate countdown send on editor renderer load completion;
* the editor countdown subscription is attached near the end of `public/editor.js`;
* the countdown IPC is fire-once and not replayed;
* runtime trace evidence shows the countdown is sometimes sent while the editor renderer is still loading.

### Confirmed failing sequence

The confirmed failing order is:

1. a reading test starts while the editor is closed;
2. the app creates a fresh editor window;
3. `openReadingSessionWindows()` calls `ensureEditorWindow()`;
4. the reading-test flow immediately calls `editorWin.maximize()` before the renderer is ready;
5. that early window show/visibility satisfies `waitForWindowVisible(editorWin, 'EDITOR')`;
6. the reading-test session treats the editor as ready and sends `reading-test-prestart-countdown`;
7. at send time, `webContents` is still loading;
8. the editor renderer has not yet reached the countdown-listener registration near the end of `public/editor.js`;
9. the one-shot countdown event is lost;
10. the overlay never appears.

### Runtime trace evidence

The following trace was captured from a failing run:

* `editor_window_created` at `1775802102482`
* `editor_window_show` at `1775802102513`
* `open_session_windows_ready` at `1775802102741`
* `countdown_send` at `1775802102741` with `isLoading: true`
* `editor_dom_ready` at `1775802102754`
* `editor_did_finish_load` at `1775802102758`
* `editor_ready_to_show` at `1775802102816`

What this proves:

* the countdown was sent before `dom-ready`;
* the countdown was sent before `did-finish-load`;
* the countdown was sent while the editor renderer was still loading;
* the visibility gate was satisfied too early;
* the session did not actually wait for renderer readiness.

### Why the current visibility gate is wrong

The current reading-test gate is:

* "editor window became visible"

What the countdown delivery actually needs is stronger:

* "editor renderer has finished loading enough that the countdown listener exists"

Current local code and the trace together prove that those two states are not equivalent.

## Separate proven UX issue

Even when the countdown event is not lost, the current startup order allows a visible editor-before-overlay gap.

Why:

* `electron/reading_test_session.js` calls `editorWin.maximize()` during startup before renderer readiness is confirmed;
* that can make the editor visible before the normal `ready-to-show` path completes;
* only after the editor is considered visible does `electron/reading_test_session.js` send the countdown event;
* the overlay is therefore activated after the window has already been revealed.

So there are two related but distinct issues:

1. intermittent missing overlay:
   * caused by the confirmed one-shot startup race described above
2. brief visible plain editor before overlay:
   * caused by the current early-visibility / show-before-overlay ordering

## Scope

### In scope

* make the reading-test countdown overlay reliable;
* remove the startup ordering gap that lets the user see the plain editor before the overlay;
* keep the solution narrowly scoped to the reading-test/editor startup path.

### Out of scope

* redesigning the visual style of the countdown overlay;
* changing countdown duration or displayed text;
* redesigning general-purpose multi-window orchestration across the app;
* adding speculative broad state machines without evidence that they are needed.

## Implementation direction

The implementation should be based on the confirmed diagnosis above:

* do not treat editor visibility as equivalent to editor readiness for countdown delivery;
* prevent the editor from becoming user-visible before the countdown state is established;
* ensure the one-shot countdown send happens only after a readiness boundary that is strong enough for the listener to exist.

This issue does not prescribe one exact code shape, but it does rule out any solution that continues to send the countdown while `webContents` may still be loading.

## Architectural constraint

The implementation should avoid bloating `electron/main.js`.

Preferred ownership split:

* `electron/main.js`
  * remain a thin owner of generic editor-window primitives only;
  * do not own reading-test countdown tokens, waiters, or feature-specific readiness state;
* `electron/reading_test_session.js`
  * own the reading-test startup orchestration;
  * own the countdown send timing;
  * own any feature-specific ack/wait logic needed for this flow;
* `electron/editor_preload.js`
  * expose only a minimal bridge needed by the editor renderer;
* `public/editor.js`
  * own overlay activation and the renderer-side ack that the overlay state is active.

## Implementation plan

### Goal

Fix both confirmed issues:

1. missing countdown overlay due to one-shot send before renderer readiness;
2. brief visible plain-editor flash before countdown state is active.

### Proposed flow

The preferred startup flow is:

1. open the editor window in a hidden/deferred-show mode;
2. wait for the editor renderer load boundary that is strong enough for the countdown listener to exist;
3. send the countdown IPC with a per-run token;
4. let the editor renderer activate the overlay;
5. have the editor renderer acknowledge that the overlay state is active;
6. only then reveal the editor window to the user;
7. start the normal 5-second prestart delay.

### Module responsibilities

#### `electron/main.js`

Keep changes minimal and generic.

Expected responsibility:

* support opening/creating the editor window without automatically revealing it immediately;
* support explicitly revealing the editor window later when asked;
* avoid owning any reading-test-specific protocol state.

This should be implemented as a generic editor-window capability, not as reading-test-specific coordination living in `main.js`.

#### `electron/reading_test_session.js`

This should be the primary orchestration owner.

Expected responsibility:

* request the editor window in deferred-show mode;
* wait for editor renderer load completion;
* send `reading-test-prestart-countdown` only after that stronger readiness gate;
* attach a per-run token to the countdown payload;
* wait for a renderer ack for that same token;
* reveal the editor only after the ack arrives;
* then continue with the existing 5-second arming wait.

Any token generation, waiting, and timeout handling should live here rather than in `main.js`.

#### `electron/editor_preload.js`

Expected responsibility:

* expose one minimal send-only API so the editor renderer can acknowledge countdown activation.

#### `public/editor.js`

Expected responsibility:

* keep the existing countdown overlay logic;
* after `startReadingTestCountdown(payload)` activates the overlay state, send a small ack using the token received in the payload.

### Why this plan fits the diagnosis

This plan solves the confirmed race because:

* the countdown is no longer sent while the renderer may still be loading;
* the event is no longer gated on early visibility caused by `maximize()` or other premature reveal paths.

This plan solves the visible plain-editor flash because:

* the editor is not shown until the countdown state is already active in the renderer.

### What to avoid

Do not solve this issue with:

* arbitrary timing delays;
* retry loops for the countdown event;
* feature-specific countdown state machines living in `electron/main.js`;
* a partial fix that only changes the send gate but still reveals the editor before overlay activation.

## Acceptance criteria

* Starting a reading test always shows the countdown overlay.
* The countdown overlay is not dependent on lucky startup timing.
* The editor window does not briefly expose readable plain editor content before the countdown state is active.
* The final fix is justified by the actual startup ordering problem, not by unrelated speculation.

## Manual verification

1. Ensure the editor is closed.
2. Start a reading test.
3. Repeat several times in a row.

Expected:

* the countdown overlay always appears;
* the user does not get a readable plain-editor flash before the countdown state is active.

## Expected code areas

Primary expected touch points:

* `electron/reading_test_session.js`
* `electron/main.js`
* `public/editor.js`
* `electron/editor_preload.js`

The exact final surface should depend on the implementation chosen after confirming the diagnosis-to-fix mapping.
