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

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const Log = require('./log');

const log = Log.get('editor-find-main');

const EDITOR_FIND_WINDOW_HTML = path.join(__dirname, '../public/editor_find.html');
const EDITOR_FIND_PRELOAD = path.join(__dirname, 'editor_find_preload.js');

// =============================================================================
// Internal refs/state
// =============================================================================
let editorWinRef = null;
let findWin = null;

let editorListeners = null;
let findListeners = null;

let pendingFocusQuery = false;
let closingFindWindow = false;
let editorClosing = false;

const state = {
  query: '',
  requestId: null,
  matches: 0,
  activeMatchOrdinal: 0,
  finalUpdate: true,
};

// =============================================================================
// Helpers
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

function buildPublicState() {
  return {
    query: state.query,
    matches: state.matches,
    activeMatchOrdinal: state.activeMatchOrdinal,
    finalUpdate: state.finalUpdate,
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
  const nextQuery = String(rawQuery || '');
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
  if (!hasQuery()) {
    return { ok: true, skipped: 'empty query' };
  }

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

  publishState();
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
  const k = String(input.key || '');
  return (k === 'f' || k === 'F') && isCmdOrCtrl(input);
}

function sendFocusQuery() {
  safeSendToFindWindow('editor-find-focus-query', { selectAll: true });
}

function tryDispatchPendingFocus() {
  if (!pendingFocusQuery) return;
  const win = resolveFindWindow();
  if (!win) return;

  const wc = win.webContents;
  const isLoading = typeof wc.isLoadingMainFrame === 'function'
    ? wc.isLoadingMainFrame()
    : wc.isLoading();
  if (isLoading) return;

  sendFocusQuery();
  pendingFocusQuery = false;
}

function positionFindWindow() {
  const hostWin = resolveEditorWindow();
  const win = resolveFindWindow();
  if (!hostWin || !win) return;

  try {
    const hostBounds = hostWin.getContentBounds();
    const findBounds = win.getBounds();
    const margin = 12;

    let targetX = Math.round(hostBounds.x + Math.max(0, hostBounds.width - findBounds.width - margin));
    let targetY = Math.round(hostBounds.y + margin);

    const display = screen.getDisplayNearestPoint({ x: targetX, y: targetY });
    const workArea = display && display.workArea ? display.workArea : null;
    if (workArea) {
      const maxX = workArea.x + workArea.width - findBounds.width;
      const maxY = workArea.y + workArea.height - findBounds.height;
      targetX = Math.min(Math.max(targetX, workArea.x), maxX);
      targetY = Math.min(Math.max(targetY, workArea.y), maxY);
    }

    win.setBounds({
      x: targetX,
      y: targetY,
      width: findBounds.width,
      height: findBounds.height,
    }, false);
  } catch (err) {
    log.warnOnce(
      'editorFind.position.failed',
      'Unable to position editor find window (ignored):',
      err
    );
  }
}

function detachFindWindow() {
  if (!findListeners) return;
  const { wc, onBeforeInput, onDidFinishLoad } = findListeners;

  try {
    wc.removeListener('before-input-event', onBeforeInput);
  } catch (err) {
    log.warnOnce(
      'editorFind.detachFind.beforeInput',
      'Unable to detach find before-input-event listener (ignored):',
      err
    );
  }

  try {
    wc.removeListener('did-finish-load', onDidFinishLoad);
  } catch (err) {
    log.warnOnce(
      'editorFind.detachFind.didFinishLoad',
      'Unable to detach find did-finish-load listener (ignored):',
      err
    );
  }

  findListeners = null;
}

function handleFindWindowClosed() {
  detachFindWindow();
  pendingFocusQuery = false;

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
    publishInit();
    publishState();
    tryDispatchPendingFocus();
  };

  wc.on('before-input-event', onBeforeInput);
  wc.on('did-finish-load', onDidFinishLoad);
  findListeners = { wc, onBeforeInput, onDidFinishLoad };
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
    width: 560,
    height: 56,
    show: false,
    frame: false,
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
  if (!win) return;
  closingFindWindow = true;
  try {
    win.close();
  } catch (err) {
    log.error('Error closing editor find window:', err);
  }
}

function openFindUi(origin = 'unknown') {
  const editorWin = resolveEditorWindow();
  if (!editorWin) {
    log.warnOnce(
      'editorFind.open.noEditor',
      'openFindUi ignored: editor window unavailable.',
      origin
    );
    return { ok: false, error: 'editor window unavailable' };
  }

  const win = ensureFindWindow();
  if (!isAliveWindow(win)) {
    log.warnOnce(
      'editorFind.open.createFailed',
      'openFindUi failed: find window was not created.'
    );
    return { ok: false, error: 'find window unavailable' };
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
  pendingFocusQuery = true;
  tryDispatchPendingFocus();

  return { ok: true };
}

function closeFindUi({ restoreFocus = true } = {}) {
  clearSearch({ clearSelection: true });
  pendingFocusQuery = false;
  closeFindWindow();

  if (restoreFocus) {
    focusEditorWindow();
  }

  return { ok: true };
}

function handleEditorBeforeInput(event, input) {
  if (!input || input.type !== 'keyDown') return;

  if (isOpenFindShortcut(input)) {
    event.preventDefault();
    openFindUi('shortcut');
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

  if (isEscape(input) && resolveFindWindow()) {
    event.preventDefault();
    closeFindUi({ restoreFocus: true });
  }
}

function handleFindBeforeInput(event, input) {
  if (!input || input.type !== 'keyDown') return;

  if (isOpenFindShortcut(input)) {
    event.preventDefault();
    pendingFocusQuery = true;
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

  if (isEscape(input)) {
    event.preventDefault();
    closeFindUi({ restoreFocus: true });
  }
}

function onEditorWindowWillClose() {
  editorClosing = true;
}

function onEditorWindowClosed() {
  editorClosing = false;
  pendingFocusQuery = false;
  closingFindWindow = false;
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

  try {
    wc.removeListener('before-input-event', onBeforeInput);
  } catch (err) {
    log.warnOnce(
      'editorFind.detachEditor.beforeInput',
      'Unable to detach editor before-input-event listener (ignored):',
      err
    );
  }

  try {
    wc.removeListener('found-in-page', onFoundInPage);
  } catch (err) {
    log.warnOnce(
      'editorFind.detachEditor.foundInPage',
      'Unable to detach editor found-in-page listener (ignored):',
      err
    );
  }

  try { win.removeListener('move', onMove); } catch (err) { log.warnOnce('editorFind.detachEditor.move', 'Unable to detach editor move listener (ignored):', err); }
  try { win.removeListener('resize', onResize); } catch (err) { log.warnOnce('editorFind.detachEditor.resize', 'Unable to detach editor resize listener (ignored):', err); }
  try { win.removeListener('maximize', onMaximize); } catch (err) { log.warnOnce('editorFind.detachEditor.maximize', 'Unable to detach editor maximize listener (ignored):', err); }
  try { win.removeListener('unmaximize', onUnmaximize); } catch (err) { log.warnOnce('editorFind.detachEditor.unmaximize', 'Unable to detach editor unmaximize listener (ignored):', err); }
  try { win.removeListener('close', onClose); } catch (err) { log.warnOnce('editorFind.detachEditor.close', 'Unable to detach editor close listener (ignored):', err); }
  try { win.removeListener('closed', onClosed); } catch (err) { log.warnOnce('editorFind.detachEditor.closed', 'Unable to detach editor closed listener (ignored):', err); }

  editorListeners = null;
}

function attachEditorWindow(editorWin) {
  detachEditorWindow();
  editorWinRef = null;
  editorClosing = false;

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

function isAuthorizedFindSender(event) {
  const win = resolveFindWindow();
  if (!win || !event || !event.sender) return false;
  return event.sender === win.webContents;
}

// =============================================================================
// IPC registration
// =============================================================================
function registerIpc(ipcMain) {
  ipcMain.handle('editor-find-set-query', (event, rawQuery) => {
    if (!isAuthorizedFindSender(event)) {
      log.warnOnce(
        'editorFind.ipc.setQuery.unauthorized',
        'editor-find-set-query unauthorized (ignored).'
      );
      return { ok: false, error: 'unauthorized' };
    }
    return setQuery(rawQuery);
  });

  ipcMain.handle('editor-find-next', (event) => {
    if (!isAuthorizedFindSender(event)) {
      log.warnOnce(
        'editorFind.ipc.next.unauthorized',
        'editor-find-next unauthorized (ignored).'
      );
      return { ok: false, error: 'unauthorized' };
    }
    return navigate(true);
  });

  ipcMain.handle('editor-find-prev', (event) => {
    if (!isAuthorizedFindSender(event)) {
      log.warnOnce(
        'editorFind.ipc.prev.unauthorized',
        'editor-find-prev unauthorized (ignored).'
      );
      return { ok: false, error: 'unauthorized' };
    }
    return navigate(false);
  });

  ipcMain.handle('editor-find-close', (event) => {
    if (!isAuthorizedFindSender(event)) {
      log.warnOnce(
        'editorFind.ipc.close.unauthorized',
        'editor-find-close unauthorized (ignored).'
      );
      return { ok: false, error: 'unauthorized' };
    }
    return closeFindUi({ restoreFocus: true });
  });
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  registerIpc,
  attachEditorWindow,
  closeFindWindow,
  getFindWindow: resolveFindWindow,
};

