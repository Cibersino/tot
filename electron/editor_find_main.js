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
  isDecreaseTextSizeShortcut,
  isEscape,
  isF3,
  isIncreaseTextSizeShortcut,
  isOpenFindShortcut,
  isOpenReplaceShortcut,
  isResetTextSizeShortcut,
} = require('./editor_find_shortcuts');
const { createSession } = require('./editor_find_session');
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
const FIND_WIN_HEIGHT_COLLAPSED = 48;
const FIND_WIN_HEIGHT_EXPANDED = 84;

// =============================================================================
// Shared state (window refs + find session state)
// =============================================================================
let editorWinRef = null;
let findWin = null;

let editorListeners = null;
let findListeners = null;

let pendingFocusTarget = null;
let closingFindWindow = false;
let editorClosing = false;
let editorShortcutActions = null;
let replaceResponseListenerRegistered = false;
let replaceStatusListenerRegistered = false;

const state = {
  query: '',
  requestId: null,
  matches: 0,
  activeMatchOrdinal: 0,
  finalUpdate: true,
  expanded: false,
  busy: false,
  replaceAllAllowedByLength: false,
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
    replaceAllAllowedByLength: state.replaceAllAllowedByLength,
  };
}

function isLoadingWindowContents(wc) {
  if (!wc) return true;
  return typeof wc.isLoadingMainFrame === 'function'
    ? wc.isLoadingMainFrame()
    : wc.isLoading();
}

function safeSendToFindWindow(channel, payload) {
  const win = resolveFindWindow();
  if (!win) return;

  const wc = win.webContents;
  if (isLoadingWindowContents(wc)) return;

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

function buildFocusTargetPayload(target, selectAll = false) {
  return {
    target: target === 'replace' ? 'replace' : 'query',
    selectAll: !!selectAll,
  };
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

const session = createSession({
  log,
  state,
  clampFindInputText,
  resolveEditorWindow,
  publishState,
});

function clearStateOnly() {
  return session.clearStateOnly();
}

function clearSearch(options) {
  return session.clearSearch(options);
}

function hasQuery() {
  return session.hasQuery();
}

function setQuery(rawQuery) {
  return session.setQuery(rawQuery);
}

function navigate(forward) {
  return session.navigate(forward);
}

function handleFoundInPage(result) {
  return session.handleFoundInPage(result);
}

function clearPendingSearchWait(status) {
  return session.clearPendingSearchWait(status);
}

function clearPendingEditorReplace(status) {
  return session.clearPendingEditorReplace(status);
}

function clearPendingSessionState(status) {
  session.clearPendingResyncRequest();
  clearPendingSearchWait(status);
  clearPendingEditorReplace(status);
}

function rerunCurrentQueryOnCurrentText() {
  return session.rerunCurrentQueryOnCurrentText();
}

function replaceCurrent(rawReplacement) {
  return session.replaceCurrent(rawReplacement);
}

function replaceAll(rawReplacement) {
  return session.replaceAll(rawReplacement);
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
  safeSendToFindWindow(
    'editor-find-focus-target',
    buildFocusTargetPayload(target, selectAll)
  );
}

function queueFocusTarget(target, selectAll = false) {
  pendingFocusTarget = buildFocusTargetPayload(target, selectAll);
}

function tryDispatchPendingFocus() {
  if (!pendingFocusTarget) return;
  const win = resolveFindWindow();
  if (!win) return;

  const wc = win.webContents;
  if (isLoadingWindowContents(wc)) return;

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
  clearPendingSessionState('find-window-closed');

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
  clearPendingSessionState('editor-window-closed');
}

function onEditorWindowClosed() {
  editorClosing = false;
  pendingFocusTarget = null;
  clearPendingSessionState('editor-window-closed');
  closingFindWindow = false;
  editorShortcutActions = null;
  clearStateOnly();
  state.replaceAllAllowedByLength = false;
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
  state.replaceAllAllowedByLength = false;

  if (!isAliveWindow(editorWin)) {
    throw new Error('attachEditorWindow requires a live editor window');
  }
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

function isAuthorizedEditorSender(event) {
  const editorWin = resolveEditorWindow();
  if (!editorWin || !event || !event.sender) return false;
  return event.sender === editorWin.webContents;
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
  if (!isAuthorizedEditorSender(event)) {
    log.warnOnce(
      'editorFind.editorReplaceResponse.unauthorized',
      'editor-replace-response unauthorized (ignored).'
    );
    return;
  }

  session.handleEditorReplaceResponse(payload);
}

function handleEditorReplaceStatus(event, payload) {
  if (!isAuthorizedEditorSender(event)) {
    log.warnOnce(
      'editorFind.editorReplaceStatus.unauthorized',
      'editor-replace-status unauthorized (ignored).'
    );
    return;
  }

  session.handleEditorReplaceStatus(payload);
}

function registerIpc(ipcMain) {
  if (!ipcMain || typeof ipcMain.handle !== 'function' || typeof ipcMain.on !== 'function') {
    throw new Error('[editor-find-main] registerIpc requires ipcMain.handle and ipcMain.on');
  }

  if (!replaceResponseListenerRegistered) {
    ipcMain.on('editor-replace-response', handleEditorReplaceResponse);
    replaceResponseListenerRegistered = true;
  }
  if (!replaceStatusListenerRegistered) {
    ipcMain.on('editor-replace-status', handleEditorReplaceStatus);
    replaceStatusListenerRegistered = true;
  }

  registerAuthorizedFindIpc(
    ipcMain,
    'editor-find-set-query',
    'editorFind.ipc.setQuery.unauthorized',
    'editor-find-set-query unauthorized (ignored).',
    (rawQuery) => {
      session.clearPendingResyncRequest();
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
    'editor-find-replace-all',
    'editorFind.ipc.replaceAll.unauthorized',
    'editor-find-replace-all unauthorized (ignored).',
    (replacement) => replaceAll(replacement)
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
