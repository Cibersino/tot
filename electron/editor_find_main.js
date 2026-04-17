// electron/editor_find_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process coordinator for editor native find/search.
// Responsibilities:
// - Own the find window lifecycle (create/show/close/position).
// - Handle editor/find-window shortcuts via before-input-event.
// - Drive native search lifecycle using webContents.findInPage APIs.
// - Keep find UI state synced from found-in-page events.
// - Enforce that find IPC commands are accepted only from the find window.

// =============================================================================
// Imports / logger
// =============================================================================

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const Log = require('./log');
const {
  EDITOR_FIND_INPUT_MAX_CHARS,
} = require('./constants_main');

const log = Log.get('editor-find-main');
log.debug('Editor find main starting...');

// =============================================================================
// Constants / config (paths, window size)
// =============================================================================
const EDITOR_FIND_WINDOW_HTML = path.join(__dirname, '../public/editor_find.html');
const EDITOR_FIND_PRELOAD = path.join(__dirname, 'editor_find_preload.js');
const FIND_WIN_WIDTH = 560;
const FIND_WIN_HEIGHT_COLLAPSED = 56;
const FIND_WIN_HEIGHT_EXPANDED = 96;
const REPLACE_PIPELINE_TIMEOUT_MS = 4000;

// =============================================================================
// Shared state (window refs + find session state)
// =============================================================================
let editorWinRef = null;
let findWin = null;

let editorListeners = null;
let findListeners = null;

let pendingFocusTarget = null;
let pendingResyncRequestId = null;
let pendingSearchWait = null;
let pendingEditorReplace = null;
let closingFindWindow = false;
let editorClosing = false;
let editorShortcutActions = null;
let replaceResponseListenerRegistered = false;

const state = {
  query: '',
  requestId: null,
  matches: 0,
  activeMatchOrdinal: 0,
  finalUpdate: true,
  expanded: false,
  busy: false,
};

// =============================================================================
// Helpers (guards, state publishing, search actions)
// =============================================================================
function isAliveWindow(win) {
  return !!(win && !win.isDestroyed());
}

function resolveEditorWindow() {
  return isAliveWindow(editorWinRef) ? editorWinRef : null;
}

function resolveFindWindow() {
  return isAliveWindow(findWin) ? findWin : null;
}

function hasQuery() {
  return state.query.length > 0;
}

function getFindWindowHeight() {
  return state.expanded ? FIND_WIN_HEIGHT_EXPANDED : FIND_WIN_HEIGHT_COLLAPSED;
}

function clampFindInputText(value) {
  const text = String(value || '');
  if (text.length <= EDITOR_FIND_INPUT_MAX_CHARS) {
    return text;
  }
  return text.slice(0, EDITOR_FIND_INPUT_MAX_CHARS);
}

function buildPublicState() {
  return {
    query: state.query,
    matches: state.matches,
    activeMatchOrdinal: state.activeMatchOrdinal,
    finalUpdate: state.finalUpdate,
    expanded: state.expanded,
    busy: state.busy,
  };
}

function safeSendToFindWindow(channel, payload) {
  const win = resolveFindWindow();
  if (!win) return;

  const wc = win.webContents;
  const isLoading = typeof wc.isLoadingMainFrame === 'function'
    ? wc.isLoadingMainFrame()
    : wc.isLoading();
  if (isLoading) return;

  try {
    wc.send(channel, payload);
  } catch (err) {
    log.warnOnce(
      `editorFind.send.${channel}`,
      `editor find send('${channel}') failed (ignored):`,
      err
    );
  }
}

function publishInit() {
  safeSendToFindWindow('editor-find-init', buildPublicState());
}

function publishState() {
  safeSendToFindWindow('editor-find-state', buildPublicState());
}

function sendToFindWindowAfterLoad(wc, channel, payload) {
  if (!wc) return;

  try {
    wc.send(channel, payload);
  } catch (err) {
    log.warnOnce(
      `editorFind.sendAfterLoad.${channel}`,
      `editor find post-load send('${channel}') failed (ignored):`,
      err
    );
  }
}

function focusEditorWindow() {
  if (editorClosing) return;
  const editorWin = resolveEditorWindow();
  if (!editorWin) return;

  try {
    editorWin.focus();
    editorWin.webContents.focus();
  } catch (err) {
    log.warnOnce(
      'editorFind.focusEditor.failed',
      'Unable to focus editor window after find close (ignored):',
      err
    );
  }
}

function clearStateOnly() {
  state.query = '';
  state.requestId = null;
  state.matches = 0;
  state.activeMatchOrdinal = 0;
  state.finalUpdate = true;
  state.busy = false;
  pendingResyncRequestId = null;
}

function clearSearch({ clearSelection = true } = {}) {
  const editorWin = resolveEditorWindow();
  if (clearSelection && editorWin) {
    try {
      editorWin.webContents.stopFindInPage('clearSelection');
    } catch (err) {
      log.warnOnce(
        'editorFind.stopFind.clearSelection',
        "stopFindInPage('clearSelection') failed (ignored):",
        err
      );
    }
  }

  clearStateOnly();
  publishState();
}

function runFind(options) {
  const editorWin = resolveEditorWindow();
  if (!editorWin) {
    log.warnOnce(
      'editorFind.runFind.noEditor',
      'runFind ignored: editor window unavailable.'
    );
    return { ok: false, error: 'editor window unavailable' };
  }

  try {
    const requestId = editorWin.webContents.findInPage(state.query, options);
    state.requestId = requestId;
    return { ok: true, requestId };
  } catch (err) {
    log.error('Error calling webContents.findInPage:', err);
    return { ok: false, error: String(err) };
  }
}

function setQuery(rawQuery) {
  if (state.busy) {
    return { ok: true, skipped: 'busy' };
  }

  const nextQuery = clampFindInputText(rawQuery);
  state.query = nextQuery;

  if (!hasQuery()) {
    clearSearch({ clearSelection: true });
    return { ok: true };
  }

  state.matches = 0;
  state.activeMatchOrdinal = 0;
  state.finalUpdate = false;
  publishState();

  const res = runFind({
    forward: true,
    findNext: true,
    matchCase: false,
  });
  if (!res.ok) return res;
  return { ok: true, requestId: res.requestId };
}

function navigate(forward) {
  if (state.busy) {
    return { ok: true, skipped: 'busy' };
  }

  if (!hasQuery()) {
    return { ok: true, skipped: 'empty query' };
  }

  pendingResyncRequestId = null;
  state.finalUpdate = false;
  publishState();

  const res = runFind({
    forward: !!forward,
    findNext: false,
    matchCase: false,
  });
  if (!res.ok) return res;
  return { ok: true, requestId: res.requestId };
}

function handleFoundInPage(result) {
  if (!result || typeof result !== 'object') return;

  const requestId = Number(result.requestId);
  if (state.requestId !== null && Number.isFinite(requestId) && requestId !== state.requestId) {
    return;
  }

  const matches = Number(result.matches);
  const active = Number(result.activeMatchOrdinal);
  state.matches = Number.isFinite(matches) && matches > 0 ? Math.floor(matches) : 0;
  state.activeMatchOrdinal = Number.isFinite(active) && active > 0 ? Math.floor(active) : 0;
  state.finalUpdate = !!result.finalUpdate;
  if (
    pendingResyncRequestId !== null &&
    Number.isFinite(requestId) &&
    requestId === pendingResyncRequestId &&
    result.finalUpdate === true
  ) {
    pendingResyncRequestId = null;
  }

  if (
    pendingSearchWait &&
    Number.isFinite(requestId) &&
    requestId === pendingSearchWait.requestId &&
    result.finalUpdate === true
  ) {
    const { timeoutId, resolve } = pendingSearchWait;
    pendingSearchWait = null;
    clearTimeout(timeoutId);
    resolve({
      ok: true,
      status: 'completed',
      requestId,
      matches: state.matches,
      activeMatchOrdinal: state.activeMatchOrdinal,
    });
  }

  publishState();
}

// =============================================================================
// Input helpers (keyboard shortcuts)
// =============================================================================
function matchesLetterShortcut(input, letter) {
  if (!input) return false;

  const normalizedLetter = String(letter || '').toLowerCase();
  if (!normalizedLetter) return false;

  const key = String(input.key || '').toLowerCase();
  if (key === normalizedLetter) {
    return true;
  }

  const code = String(input.code || '');
  return code === `Key${normalizedLetter.toUpperCase()}`;
}

function isCmdOrCtrl(input) {
  return !!(input && (input.control || input.meta));
}

function isF3(input) {
  return !!(input && input.key === 'F3');
}

function isEscape(input) {
  return !!(input && input.key === 'Escape');
}

function isOpenFindShortcut(input) {
  if (!input || input.alt) return false;
  return isCmdOrCtrl(input) && matchesLetterShortcut(input, 'f');
}

function isOpenReplaceShortcut(input) {
  if (!input) return false;

  if (process.platform === 'darwin') {
    return !!(
      input.meta &&
      input.alt &&
      !input.control &&
      matchesLetterShortcut(input, 'f')
    );
  }

  return !!(
    input.control &&
    !input.meta &&
    !input.alt &&
    matchesLetterShortcut(input, 'h')
  );
}

function isIncreaseTextSizeShortcut(input) {
  if (!input || input.alt || !isCmdOrCtrl(input)) return false;
  const key = String(input.key || '');
  const code = String(input.code || '');
  return key === '+' || key === '=' || key === 'Add' || code === 'NumpadAdd';
}

function isDecreaseTextSizeShortcut(input) {
  if (!input || input.alt || !isCmdOrCtrl(input)) return false;
  const key = String(input.key || '');
  const code = String(input.code || '');
  return key === '-' || key === 'Subtract' || code === 'NumpadSubtract';
}

function isResetTextSizeShortcut(input) {
  if (!input || input.alt || !isCmdOrCtrl(input)) return false;
  const key = String(input.key || '');
  const code = String(input.code || '');
  return key === '0' || code === 'Digit0' || code === 'Numpad0';
}

function runEditorShortcutAction(actionName) {
  const actions = editorShortcutActions;
  if (!actions || typeof actions[actionName] !== 'function') {
    log.warnOnce(
      `editorFind.shortcutAction.missing:${actionName}`,
      'Editor shortcut action unavailable (ignored):',
      actionName
    );
    return;
  }

  try {
    actions[actionName]();
  } catch (err) {
    log.error(`Error running editor shortcut action '${actionName}':`, err);
  }
}

function sendFocusTarget(target, selectAll = false) {
  safeSendToFindWindow('editor-find-focus-target', {
    target: target === 'replace' ? 'replace' : 'query',
    selectAll: !!selectAll,
  });
}

function queueFocusTarget(target, selectAll = false) {
  pendingFocusTarget = {
    target: target === 'replace' ? 'replace' : 'query',
    selectAll: !!selectAll,
  };
}

function tryDispatchPendingFocus() {
  if (!pendingFocusTarget) return;
  const win = resolveFindWindow();
  if (!win) return;

  const wc = win.webContents;
  const isLoading = typeof wc.isLoadingMainFrame === 'function'
    ? wc.isLoadingMainFrame()
    : wc.isLoading();
  if (isLoading) return;

  sendFocusTarget(pendingFocusTarget.target, pendingFocusTarget.selectAll);
  pendingFocusTarget = null;
}

function setExpanded(expanded, { publish = true } = {}) {
  const nextExpanded = !!expanded;
  const changed = state.expanded !== nextExpanded;
  state.expanded = nextExpanded;

  if (changed) {
    positionFindWindow();
    if (publish) {
      publishState();
    }
  }

  return changed;
}

function setBusy(busy, { publish = true } = {}) {
  const nextBusy = !!busy;
  const changed = state.busy !== nextBusy;
  state.busy = nextBusy;

  if (changed && publish) {
    publishState();
  }

  return changed;
}

function clearPendingSearchWait(status = 'aborted') {
  if (!pendingSearchWait) return;

  const { timeoutId, resolve } = pendingSearchWait;
  pendingSearchWait = null;

  try {
    clearTimeout(timeoutId);
  } catch {
    // ignore timeout cleanup failure
  }

  try {
    resolve({ ok: false, status });
  } catch {
    // ignore resolve failure
  }
}

function waitForSearchCompletion(requestId, timeoutMs = REPLACE_PIPELINE_TIMEOUT_MS) {
  clearPendingSearchWait('superseded');

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      if (!pendingSearchWait || pendingSearchWait.requestId !== requestId) return;
      pendingSearchWait = null;
      resolve({ ok: false, status: 'timeout' });
    }, timeoutMs);

    pendingSearchWait = { requestId, resolve, timeoutId };
  });
}

function clearPendingEditorReplace(status = 'aborted') {
  if (!pendingEditorReplace) return;

  const { timeoutId, resolve } = pendingEditorReplace;
  pendingEditorReplace = null;

  try {
    clearTimeout(timeoutId);
  } catch {
    // ignore timeout cleanup failure
  }

  try {
    resolve({
      ok: false,
      status,
      operation: 'replace-current',
      replacements: 0,
      error: '',
    });
  } catch {
    // ignore resolve failure
  }
}

function requestEditorReplaceCurrent(payload) {
  clearPendingEditorReplace('superseded');

  const editorWin = resolveEditorWindow();
  if (!editorWin) {
    return Promise.resolve({
      ok: false,
      status: 'editor-window-unavailable',
      operation: 'replace-current',
      replacements: 0,
      error: 'editor window unavailable',
    });
  }

  return new Promise((resolve) => {
    const requestId = Date.now() + Math.floor(Math.random() * 1000);
    const timeoutId = setTimeout(() => {
      if (!pendingEditorReplace || pendingEditorReplace.requestId !== requestId) return;
      pendingEditorReplace = null;
      resolve({
        ok: false,
        status: 'timeout',
        operation: 'replace-current',
        replacements: 0,
        error: 'editor replace request timed out',
      });
    }, REPLACE_PIPELINE_TIMEOUT_MS);

    pendingEditorReplace = { requestId, resolve, timeoutId };

    try {
      editorWin.webContents.send('editor-replace-request', {
        requestId,
        operation: 'replace-current',
        query: String(payload && payload.query ? payload.query : ''),
        replacement: String(payload && payload.replacement ? payload.replacement : ''),
        matchCase: !!(payload && payload.matchCase),
      });
    } catch (err) {
      pendingEditorReplace = null;
      clearTimeout(timeoutId);
      resolve({
        ok: false,
        status: 'send-failed',
        operation: 'replace-current',
        replacements: 0,
        error: String(err),
      });
    }
  });
}

function rerunCurrentQueryOnCurrentText() {
  if (!hasQuery()) {
    pendingResyncRequestId = null;
    return { ok: true, skipped: 'empty query' };
  }

  state.matches = 0;
  state.activeMatchOrdinal = 0;
  state.finalUpdate = false;
  publishState();

  const res = runFind({
    forward: true,
    findNext: true,
    matchCase: false,
  });
  if (!res.ok) {
    state.finalUpdate = true;
    publishState();
    pendingResyncRequestId = null;
    return res;
  }

  pendingResyncRequestId = res.requestId;
  return { ok: true, requestId: res.requestId };
}

async function replaceCurrent(rawReplacement) {
  if (state.busy) {
    return {
      ok: true,
      status: 'busy',
      operation: 'replace-current',
      replacements: 0,
    };
  }

  if (!hasQuery()) {
    return {
      ok: true,
      status: 'noop-empty-query',
      operation: 'replace-current',
      replacements: 0,
    };
  }

  const replacement = clampFindInputText(rawReplacement);
  const editorWin = resolveEditorWindow();
  if (!editorWin) {
    return {
      ok: false,
      status: 'editor-window-unavailable',
      operation: 'replace-current',
      replacements: 0,
      error: 'editor window unavailable',
    };
  }

  let stoppedFindSelection = false;
  setBusy(true);

  try {
    const resync = rerunCurrentQueryOnCurrentText();
    if (!resync.ok || !resync.requestId) {
      return {
        ok: false,
        status: 'resync-start-failed',
        operation: 'replace-current',
        replacements: 0,
        error: resync.error || 'replace re-sync start failed',
      };
    }

    const resyncResult = await waitForSearchCompletion(resync.requestId);
    if (!resyncResult.ok) {
      return {
        ok: false,
        status: resyncResult.status || 'resync-failed',
        operation: 'replace-current',
        replacements: 0,
        error: '',
      };
    }

    if (!Number.isFinite(resyncResult.matches) || resyncResult.matches <= 0) {
      return {
        ok: true,
        status: 'noop-no-matches',
        operation: 'replace-current',
        replacements: 0,
      };
    }

    try {
      editorWin.webContents.stopFindInPage('keepSelection');
      stoppedFindSelection = true;
    } catch (err) {
      return {
        ok: false,
        status: 'keep-selection-failed',
        operation: 'replace-current',
        replacements: 0,
        error: String(err),
      };
    }

    const replaceResult = await requestEditorReplaceCurrent({
      query: state.query,
      replacement,
      matchCase: false,
    });

    return replaceResult;
  } finally {
    if (stoppedFindSelection && hasQuery()) {
      const refresh = rerunCurrentQueryOnCurrentText();
      if (refresh.ok && refresh.requestId) {
        const refreshResult = await waitForSearchCompletion(refresh.requestId);
        if (!refreshResult.ok) {
          log.warnOnce(
            'editorFind.replaceCurrent.refresh',
            'replace-current refresh search did not complete cleanly (ignored):',
            refreshResult.status
          );
        }
      }
    }

    setBusy(false);
  }
}

// =============================================================================
// Find window lifecycle / wiring
// =============================================================================
function positionFindWindow() {
  const hostWin = resolveEditorWindow();
  const win = resolveFindWindow();
  if (!hostWin || !win) return;

  try {
    const height = getFindWindowHeight();
    const hostBounds = hostWin.getContentBounds();
    const margin = 12;

    let targetX = Math.round(hostBounds.x + Math.max(0, hostBounds.width - FIND_WIN_WIDTH - margin));
    let targetY = Math.round(hostBounds.y + margin);

    const display = screen.getDisplayNearestPoint({ x: targetX, y: targetY });
    const workArea = display && display.workArea ? display.workArea : null;
    if (workArea) {
      const maxX = workArea.x + workArea.width - FIND_WIN_WIDTH;
      const maxY = workArea.y + workArea.height - height;
      targetX = Math.min(Math.max(targetX, workArea.x), maxX);
      targetY = Math.min(Math.max(targetY, workArea.y), maxY);
    }

    win.setBounds({
      x: targetX,
      y: targetY,
      width: FIND_WIN_WIDTH,
      height,
    }, false);
  } catch (err) {
    log.warnOnce(
      'editorFind.position.failed',
      'Unable to position editor find window (ignored):',
      err
    );
  }
}

function removeListenerWithWarn(target, eventName, listener, warnKey, warnMessage) {
  try {
    target.removeListener(eventName, listener);
  } catch (err) {
    log.warnOnce(warnKey, warnMessage, err);
  }
}

function detachFindWindow() {
  if (!findListeners) return;
  const { wc, win, onBeforeInput, onDidFinishLoad, onFocus } = findListeners;

  removeListenerWithWarn(
    wc,
    'before-input-event',
    onBeforeInput,
    'editorFind.detachFind.beforeInput',
    'Unable to detach find before-input-event listener (ignored):'
  );
  removeListenerWithWarn(
    wc,
    'did-finish-load',
    onDidFinishLoad,
    'editorFind.detachFind.didFinishLoad',
    'Unable to detach find did-finish-load listener (ignored):'
  );
  removeListenerWithWarn(
    win,
    'focus',
    onFocus,
    'editorFind.detachFind.focus',
    'Unable to detach find focus listener (ignored):'
  );

  findListeners = null;
}

function handleFindWindowClosed() {
  detachFindWindow();
  pendingFocusTarget = null;
  pendingResyncRequestId = null;
  clearPendingSearchWait('find-window-closed');
  clearPendingEditorReplace('find-window-closed');

  if (!closingFindWindow) {
    clearSearch({ clearSelection: true });
    focusEditorWindow();
  }

  closingFindWindow = false;
}

function attachFindWindow(win) {
  detachFindWindow();
  if (!isAliveWindow(win)) return;

  const wc = win.webContents;

  const onBeforeInput = (event, input) => {
    try {
      handleFindBeforeInput(event, input);
    } catch (err) {
      log.error('Error in find before-input-event handler:', err);
    }
  };

  const onDidFinishLoad = () => {
    sendToFindWindowAfterLoad(wc, 'editor-find-init', buildPublicState());
    sendToFindWindowAfterLoad(wc, 'editor-find-state', buildPublicState());
    tryDispatchPendingFocus();
  };
  const onFocus = () => {
    try {
      tryDispatchPendingFocus();
      rerunCurrentQueryOnCurrentText();
    } catch (err) {
      log.error('Error in find focus handler:', err);
    }
  };

  wc.on('before-input-event', onBeforeInput);
  wc.on('did-finish-load', onDidFinishLoad);
  win.on('focus', onFocus);
  findListeners = { wc, win, onBeforeInput, onDidFinishLoad, onFocus };
}

function createFindWindow() {
  const hostWin = resolveEditorWindow();
  if (!hostWin) {
    log.warnOnce(
      'editorFind.create.noEditor',
      'createFindWindow ignored: editor window unavailable.'
    );
    return null;
  }

  const existing = resolveFindWindow();
  if (existing) return existing;

  findWin = new BrowserWindow({
    width: FIND_WIN_WIDTH,
    height: getFindWindowHeight(),
    show: false,
    frame: false,
    hasShadow: false,
    thickFrame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: false,
    skipTaskbar: true,
    parent: hostWin,
    modal: false,
    webPreferences: {
      preload: EDITOR_FIND_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  findWin.setMenu(null);
  findWin.setMenuBarVisibility(false);

  attachFindWindow(findWin);
  findWin.loadFile(EDITOR_FIND_WINDOW_HTML);
  findWin.once('ready-to-show', () => {
    positionFindWindow();
  });
  findWin.on('closed', () => {
    handleFindWindowClosed();
    findWin = null;
  });

  return findWin;
}

function ensureFindWindow() {
  const existing = resolveFindWindow();
  if (existing) return existing;
  return createFindWindow();
}

function closeFindWindow() {
  const win = resolveFindWindow();
  if (!win) {
    closingFindWindow = false;
    return;
  }
  closingFindWindow = true;
  try {
    win.close();
  } catch (err) {
    closingFindWindow = false;
    log.error('Error closing editor find window:', err);
  }
}

function openFindUi({
  expanded = false,
  preserveExpandedWhenOpen = false,
  focusTarget = 'query',
} = {}) {
  const editorWin = resolveEditorWindow();
  if (!editorWin) {
    log.warnOnce(
      'editorFind.open.noEditor',
      'openFindUi ignored: editor window unavailable.'
    );
    return { ok: false, error: 'editor window unavailable' };
  }

  const existing = resolveFindWindow();
  if (!existing) {
    state.expanded = !!expanded;
  }

  const win = ensureFindWindow();
  if (!isAliveWindow(win)) {
    log.warnOnce(
      'editorFind.open.createFailed',
      'openFindUi failed: find window was not created.'
    );
    return { ok: false, error: 'find window unavailable' };
  }

  if (existing && !preserveExpandedWhenOpen) {
    setExpanded(expanded, { publish: false });
  }

  positionFindWindow();

  try {
    win.show();
    win.focus();
  } catch (err) {
    log.error('Error showing/focusing find window:', err);
  }

  publishInit();
  publishState();
  queueFocusTarget(focusTarget, true);
  tryDispatchPendingFocus();

  return { ok: true };
}

function closeFindUi({ restoreFocus = true } = {}) {
  clearSearch({ clearSelection: true });
  pendingFocusTarget = null;
  closeFindWindow();

  if (restoreFocus) {
    focusEditorWindow();
  }

  return { ok: true };
}

// =============================================================================
// Editor event handling / lifecycle wiring
// =============================================================================
function handleEditorBeforeInput(event, input) {
  if (!input || input.type !== 'keyDown') return;

  if (isOpenFindShortcut(input)) {
    event.preventDefault();
    openFindUi({
      expanded: false,
      preserveExpandedWhenOpen: true,
      focusTarget: 'query',
    });
    return;
  }

  if (isOpenReplaceShortcut(input)) {
    event.preventDefault();
    openFindUi({
      expanded: true,
      preserveExpandedWhenOpen: false,
      focusTarget: hasQuery() ? 'replace' : 'query',
    });
    return;
  }

  if (isF3(input)) {
    event.preventDefault();
    if (input.shift) {
      navigate(false);
    } else {
      navigate(true);
    }
    return;
  }

  if (isIncreaseTextSizeShortcut(input)) {
    event.preventDefault();
    runEditorShortcutAction('onIncreaseTextSize');
    return;
  }

  if (isDecreaseTextSizeShortcut(input)) {
    event.preventDefault();
    runEditorShortcutAction('onDecreaseTextSize');
    return;
  }

  if (isResetTextSizeShortcut(input)) {
    event.preventDefault();
    runEditorShortcutAction('onResetTextSize');
    return;
  }

  if (isEscape(input) && resolveFindWindow()) {
    event.preventDefault();
    closeFindUi({ restoreFocus: true });
  }
}

function handleFindBeforeInput(event, input) {
  if (!input || input.type !== 'keyDown') return;

  if (isOpenFindShortcut(input)) {
    event.preventDefault();
    queueFocusTarget('query', true);
    tryDispatchPendingFocus();
    return;
  }

  if (isOpenReplaceShortcut(input)) {
    event.preventDefault();
    if (!state.expanded) {
      setExpanded(true);
    }
    queueFocusTarget(hasQuery() ? 'replace' : 'query', true);
    tryDispatchPendingFocus();
    return;
  }

  if (isF3(input)) {
    event.preventDefault();
    if (input.shift) {
      navigate(false);
    } else {
      navigate(true);
    }
    return;
  }

  if (isIncreaseTextSizeShortcut(input)) {
    event.preventDefault();
    runEditorShortcutAction('onIncreaseTextSize');
    return;
  }

  if (isDecreaseTextSizeShortcut(input)) {
    event.preventDefault();
    runEditorShortcutAction('onDecreaseTextSize');
    return;
  }

  if (isResetTextSizeShortcut(input)) {
    event.preventDefault();
    runEditorShortcutAction('onResetTextSize');
    return;
  }

  if (isEscape(input)) {
    event.preventDefault();
    closeFindUi({ restoreFocus: true });
  }
}

function onEditorWindowWillClose() {
  editorClosing = true;
  pendingResyncRequestId = null;
  clearPendingSearchWait('editor-window-closed');
  clearPendingEditorReplace('editor-window-closed');
}

function onEditorWindowClosed() {
  editorClosing = false;
  pendingFocusTarget = null;
  pendingResyncRequestId = null;
  clearPendingSearchWait('editor-window-closed');
  clearPendingEditorReplace('editor-window-closed');
  closingFindWindow = false;
  editorShortcutActions = null;
  clearStateOnly();
  detachEditorWindow();
  editorWinRef = null;
}

function detachEditorWindow() {
  if (!editorListeners) return;
  const {
    win,
    wc,
    onBeforeInput,
    onFoundInPage,
    onMove,
    onResize,
    onMaximize,
    onUnmaximize,
    onClose,
    onClosed,
  } = editorListeners;

  removeListenerWithWarn(
    wc,
    'before-input-event',
    onBeforeInput,
    'editorFind.detachEditor.beforeInput',
    'Unable to detach editor before-input-event listener (ignored):'
  );
  removeListenerWithWarn(
    wc,
    'found-in-page',
    onFoundInPage,
    'editorFind.detachEditor.foundInPage',
    'Unable to detach editor found-in-page listener (ignored):'
  );
  removeListenerWithWarn(
    win,
    'move',
    onMove,
    'editorFind.detachEditor.move',
    'Unable to detach editor move listener (ignored):'
  );
  removeListenerWithWarn(
    win,
    'resize',
    onResize,
    'editorFind.detachEditor.resize',
    'Unable to detach editor resize listener (ignored):'
  );
  removeListenerWithWarn(
    win,
    'maximize',
    onMaximize,
    'editorFind.detachEditor.maximize',
    'Unable to detach editor maximize listener (ignored):'
  );
  removeListenerWithWarn(
    win,
    'unmaximize',
    onUnmaximize,
    'editorFind.detachEditor.unmaximize',
    'Unable to detach editor unmaximize listener (ignored):'
  );
  removeListenerWithWarn(
    win,
    'close',
    onClose,
    'editorFind.detachEditor.close',
    'Unable to detach editor close listener (ignored):'
  );
  removeListenerWithWarn(
    win,
    'closed',
    onClosed,
    'editorFind.detachEditor.closed',
    'Unable to detach editor closed listener (ignored):'
  );

  editorListeners = null;
}

function attachEditorWindow(editorWin, options = {}) {
  detachEditorWindow();
  editorWinRef = null;
  editorClosing = false;
  editorShortcutActions = options && typeof options === 'object' ? options : null;

  if (!isAliveWindow(editorWin)) return;
  editorWinRef = editorWin;

  const wc = editorWin.webContents;
  const onBeforeInput = (event, input) => {
    try {
      handleEditorBeforeInput(event, input);
    } catch (err) {
      log.error('Error in editor before-input-event handler:', err);
    }
  };
  const onFoundInPage = (_event, result) => {
    try {
      handleFoundInPage(result);
    } catch (err) {
      log.error('Error in found-in-page handler:', err);
    }
  };

  const onMove = () => positionFindWindow();
  const onResize = () => positionFindWindow();
  const onMaximize = () => positionFindWindow();
  const onUnmaximize = () => positionFindWindow();
  const onClose = () => {
    onEditorWindowWillClose();
    closeFindWindow();
  };
  const onClosed = () => {
    onEditorWindowClosed();
  };

  wc.on('before-input-event', onBeforeInput);
  wc.on('found-in-page', onFoundInPage);
  editorWin.on('move', onMove);
  editorWin.on('resize', onResize);
  editorWin.on('maximize', onMaximize);
  editorWin.on('unmaximize', onUnmaximize);
  editorWin.on('close', onClose);
  editorWin.on('closed', onClosed);

  editorListeners = {
    win: editorWin,
    wc,
    onBeforeInput,
    onFoundInPage,
    onMove,
    onResize,
    onMaximize,
    onUnmaximize,
    onClose,
    onClosed,
  };
}

// =============================================================================
// IPC authorization + registration
// =============================================================================
function isAuthorizedFindSender(event) {
  const win = resolveFindWindow();
  if (!win || !event || !event.sender) return false;
  return event.sender === win.webContents;
}

function registerAuthorizedFindIpc(ipcMain, channel, warnKey, warnMessage, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAuthorizedFindSender(event)) {
      log.warnOnce(warnKey, warnMessage);
      return { ok: false, error: 'unauthorized' };
    }
    return handler(...args);
  });
}

function handleEditorReplaceResponse(event, payload) {
  const editorWin = resolveEditorWindow();
  if (!editorWin || !event || !event.sender || event.sender !== editorWin.webContents) {
    log.warnOnce(
      'editorFind.editorReplaceResponse.unauthorized',
      'editor-replace-response unauthorized (ignored).'
    );
    return;
  }

  if (!pendingEditorReplace) {
    log.warnOnce(
      'editorFind.editorReplaceResponse.unexpected',
      'editor-replace-response without a pending request (ignored).'
    );
    return;
  }

  const responseRequestId = Number(payload && payload.requestId);
  if (!Number.isFinite(responseRequestId) || responseRequestId !== pendingEditorReplace.requestId) {
    log.warnOnce(
      'editorFind.editorReplaceResponse.mismatch',
      'editor-replace-response requestId mismatch (ignored).'
    );
    return;
  }

  const { timeoutId, resolve } = pendingEditorReplace;
  pendingEditorReplace = null;
  clearTimeout(timeoutId);
  resolve(payload && typeof payload === 'object'
    ? payload
    : {
      ok: false,
      status: 'invalid-response',
      operation: 'replace-current',
      replacements: 0,
      error: 'invalid editor replace response',
    });
}

function registerIpc(ipcMain) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[editor-find-main] registerIpc requires ipcMain');
  }

  if (!replaceResponseListenerRegistered && typeof ipcMain.on === 'function') {
    ipcMain.on('editor-replace-response', handleEditorReplaceResponse);
    replaceResponseListenerRegistered = true;
  }

  registerAuthorizedFindIpc(
    ipcMain,
    'editor-find-set-query',
    'editorFind.ipc.setQuery.unauthorized',
    'editor-find-set-query unauthorized (ignored).',
    (rawQuery) => {
      pendingResyncRequestId = null;
      return setQuery(rawQuery);
    }
  );

  registerAuthorizedFindIpc(
    ipcMain,
    'editor-find-next',
    'editorFind.ipc.next.unauthorized',
    'editor-find-next unauthorized (ignored).',
    () => navigate(true)
  );

  registerAuthorizedFindIpc(
    ipcMain,
    'editor-find-prev',
    'editorFind.ipc.prev.unauthorized',
    'editor-find-prev unauthorized (ignored).',
    () => navigate(false)
  );

  registerAuthorizedFindIpc(
    ipcMain,
    'editor-find-replace-current',
    'editorFind.ipc.replaceCurrent.unauthorized',
    'editor-find-replace-current unauthorized (ignored).',
    (replacement) => replaceCurrent(replacement)
  );

  registerAuthorizedFindIpc(
    ipcMain,
    'editor-find-toggle-expanded',
    'editorFind.ipc.toggleExpanded.unauthorized',
    'editor-find-toggle-expanded unauthorized (ignored).',
    () => {
      setExpanded(!state.expanded);
      return { ok: true, expanded: state.expanded };
    }
  );

  registerAuthorizedFindIpc(
    ipcMain,
    'editor-find-close',
    'editorFind.ipc.close.unauthorized',
    'editor-find-close unauthorized (ignored).',
    () => closeFindUi({ restoreFocus: true })
  );
}

// =============================================================================
// Exports / module surface
// =============================================================================
module.exports = {
  registerIpc,
  attachEditorWindow,
  closeFindWindow,
  getFindWindow: resolveFindWindow,
};

// =============================================================================
// End of electron/editor_find_main.js
// =============================================================================
