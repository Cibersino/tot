// electron/editor_window_lifecycle.js
'use strict';

function isAliveWindow(win) {
  return !!(win && !win.isDestroyed());
}

function hasLiveWebContents(win) {
  return !!(isAliveWindow(win) && win.webContents && !win.webContents.isDestroyed());
}

function createController({ log, editorState }) {
  if (!log || typeof log.warn !== 'function' || typeof log.error !== 'function') {
    throw new Error('[editor_window_lifecycle] createController requires log');
  }
  if (!editorState || typeof editorState.notifyWindowState !== 'function') {
    throw new Error('[editor_window_lifecycle] createController requires editorState.notifyWindowState');
  }

  function notifyMainEditorReady(mainWin, logContext) {
    if (!hasLiveWebContents(mainWin)) {
      log.warn('editor-ready notification skipped (ignored): main window unavailable.', logContext);
      return;
    }

    try {
      mainWin.webContents.send('editor-ready');
    } catch (err) {
      log.warn(`Unable to notify editor-ready from ${logContext}:`, err);
    }
  }

  function showEditorWindow(editorWin, options = {}) {
    if (!isAliveWindow(editorWin)) return null;

    const shouldMaximize = !!(
      options.maximize === true
      || (options.useSavedMaximized !== false && editorWin.__totSavedMaximized === true)
    );

    if (typeof editorWin.isMinimized === 'function' && editorWin.isMinimized()) {
      if (typeof editorWin.restore === 'function') {
        editorWin.restore();
      }
    }

    if (shouldMaximize && typeof editorWin.maximize === 'function' && !editorWin.isMaximized()) {
      editorWin.maximize();
    }

    if (typeof editorWin.show === 'function' && !editorWin.isVisible()) {
      editorWin.show();
    }

    if (typeof editorWin.focus === 'function') {
      editorWin.focus();
    }
    if (editorWin.webContents && typeof editorWin.webContents.focus === 'function') {
      editorWin.webContents.focus();
    }

    editorState.notifyWindowState(editorWin, 'showEditorWindow');
    return editorWin;
  }

  function handleEditorWindowReady({ editorWin, mainWin, deferShow = false, logContext }) {
    if (!isAliveWindow(editorWin)) return null;

    if (!deferShow) {
      showEditorWindow(editorWin);
    }
    notifyMainEditorReady(mainWin, logContext);
    return editorWin;
  }

  function ensureEditorWindowOpen({ editorWin, mainWin, createEditorWindow, options = {}, logContext }) {
    const deferShow = !!(options && options.deferShow);

    if (!isAliveWindow(editorWin)) {
      return createEditorWindow({ deferShow });
    }

    if (!deferShow) {
      showEditorWindow(editorWin);
    }
    notifyMainEditorReady(mainWin, logContext);
    return editorWin;
  }

  return {
    notifyMainEditorReady,
    showEditorWindow,
    handleEditorWindowReady,
    ensureEditorWindowOpen,
  };
}

module.exports = {
  isAliveWindow,
  hasLiveWebContents,
  createController,
};
