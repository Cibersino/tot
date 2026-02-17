// electron/editor_find_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process coordinator for editor native find/search.
// Responsibilities:
// - Handle editor/find-window shortcuts via before-input-event.
// - Drive native search lifecycle using webContents.findInPage APIs.
// - Keep find UI state synced from found-in-page events.
// - Own cleanup behavior when find/editor windows close.

const Log = require('./log');

const log = Log.get('editor-find-main');

// =============================================================================
// Dependency injection hooks (set by registerIpc)
// =============================================================================
let getWindows = () => ({});
let ensureFindWindow = null;
let closeFindWindow = null;
let positionFindWindow = null;

// =============================================================================
// Internal state
// =============================================================================
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

function resolveWindows() {
  try {
    const wins = typeof getWindows === 'function' ? (getWindows() || {}) : {};
    return wins && typeof wins === 'object' ? wins : {};
  } catch (err) {
    log.error('Error resolving windows for editor find:', err);
    return {};
  }
}

function resolveEditorWindow() {
  const wins = resolveWindows();
  return isAliveWindow(wins.editorWin) ? wins.editorWin : null;
}

function resolveFindWindow() {
  const wins = resolveWindows();
  return isAliveWindow(wins.editorFindWin) ? wins.editorFindWin : null;
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
  const findWin = resolveFindWindow();
  if (!findWin) return;
  const wc = findWin.webContents;
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
  const findWin = resolveFindWindow();
  if (!findWin) return;

  const wc = findWin.webContents;
  const isLoading = typeof wc.isLoadingMainFrame === 'function'
    ? wc.isLoadingMainFrame()
    : wc.isLoading();

  if (isLoading) return;
  sendFocusQuery();
  pendingFocusQuery = false;
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

  let findWin = resolveFindWindow();
  if (!findWin) {
    if (typeof ensureFindWindow !== 'function') {
      log.warnOnce(
        'editorFind.open.ensureMissing',
        'openFindUi unavailable: ensureFindWindow callback missing.'
      );
      return { ok: false, error: 'find window unavailable' };
    }
    findWin = ensureFindWindow();
  }

  if (!isAliveWindow(findWin)) {
    log.warnOnce(
      'editorFind.open.createFailed',
      'openFindUi failed: find window was not created.'
    );
    return { ok: false, error: 'find window unavailable' };
  }

  if (typeof positionFindWindow === 'function') {
    try {
      positionFindWindow();
    } catch (err) {
      log.warnOnce(
        'editorFind.position.onOpen',
        'Unable to position find window on open (ignored):',
        err
      );
    }
  }

  try {
    findWin.show();
    findWin.focus();
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

  const findWin = resolveFindWindow();
  if (findWin) {
    closingFindWindow = true;
    try {
      if (typeof closeFindWindow === 'function') {
        closeFindWindow();
      } else {
        findWin.close();
      }
    } catch (err) {
      log.error('Error closing find window:', err);
    }
  }

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

function detachEditorWindow() {
  if (!editorListeners) return;
  const { wc, onBeforeInput, onFoundInPage } = editorListeners;
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
  editorListeners = null;
}

function attachEditorWindow(editorWin) {
  detachEditorWindow();
  editorClosing = false;

  if (!isAliveWindow(editorWin)) return;

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

  wc.on('before-input-event', onBeforeInput);
  wc.on('found-in-page', onFoundInPage);
  editorListeners = { wc, onBeforeInput, onFoundInPage };
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

function attachFindWindow(findWin) {
  detachFindWindow();
  if (!isAliveWindow(findWin)) return;

  const wc = findWin.webContents;
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

function handleFindWindowClosed() {
  detachFindWindow();
  pendingFocusQuery = false;

  if (!closingFindWindow) {
    clearSearch({ clearSelection: true });
    focusEditorWindow();
  }

  closingFindWindow = false;
}

function onEditorWindowWillClose() {
  editorClosing = true;
}

function onEditorWindowClosed() {
  editorClosing = false;
  pendingFocusQuery = false;
  closingFindWindow = false;
  detachEditorWindow();
  clearStateOnly();
}

function isAuthorizedFindSender(event) {
  const findWin = resolveFindWindow();
  if (!findWin || !event || !event.sender) return false;
  return event.sender === findWin.webContents;
}

// =============================================================================
// IPC registration
// =============================================================================
function registerIpc(ipcMain, opts = {}) {
  getWindows = typeof opts.getWindows === 'function' ? opts.getWindows : () => ({});
  ensureFindWindow = typeof opts.ensureFindWindow === 'function' ? opts.ensureFindWindow : null;
  closeFindWindow = typeof opts.closeFindWindow === 'function' ? opts.closeFindWindow : null;
  positionFindWindow = typeof opts.positionFindWindow === 'function' ? opts.positionFindWindow : null;

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
  attachFindWindow,
  handleFindWindowClosed,
  onEditorWindowWillClose,
  onEditorWindowClosed,
};
