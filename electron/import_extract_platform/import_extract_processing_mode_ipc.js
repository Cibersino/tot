'use strict';

const { BrowserWindow } = require('electron');
const Log = require('../log');

const log = Log.get('import-extract-processing-mode');

const MAX_META_CHARS = 160;

function sanitizeMeta(rawValue) {
  if (typeof rawValue !== 'string') return '';
  return rawValue.trim().slice(0, MAX_META_CHARS);
}

function createController({ onStateChanged } = {}) {
  let active = false;
  let lockId = 0;
  let sinceEpochMs = null;
  let source = '';
  let reason = '';

  const getState = () => ({
    active,
    lockId,
    sinceEpochMs,
    source,
    reason,
  });

  const notifyStateChanged = () => {
    if (typeof onStateChanged !== 'function') return;
    try {
      onStateChanged(getState());
    } catch (err) {
      log.error('Processing-mode state change callback failed:', err);
    }
  };

  const enter = (context = {}) => {
    if (active) return { changed: false, state: getState() };

    active = true;
    lockId += 1;
    sinceEpochMs = Date.now();
    source = sanitizeMeta(context.source);
    reason = sanitizeMeta(context.reason);

    log.info('Processing mode enabled:', { lockId, source, reason });
    notifyStateChanged();
    return { changed: true, state: getState() };
  };

  const exit = (context = {}) => {
    if (!active) return { changed: false, state: getState() };

    active = false;
    sinceEpochMs = null;
    source = sanitizeMeta(context.source);
    reason = sanitizeMeta(context.reason);

    log.info('Processing mode disabled:', { lockId, source, reason });
    notifyStateChanged();
    return { changed: true, state: getState() };
  };

  const requestAbort = (context = {}) => {
    if (!active) {
      return { ok: false, code: 'NOT_ACTIVE', state: getState() };
    }

    const requestSource = sanitizeMeta(context.source) || 'main_window';
    const requestReason = sanitizeMeta(context.reason) || 'user_abort_requested';
    log.info('Processing abort requested:', { lockId, source: requestSource, reason: requestReason });

    const transition = exit({
      source: requestSource,
      reason: requestReason,
    });
    return { ok: true, cancelled: true, state: transition.state };
  };

  return {
    getState,
    isActive: () => active,
    enter,
    exit,
    requestAbort,
  };
}

function isAuthorizedSender(event, mainWin) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        'import_extract_processing_mode.unauthorized',
        'Processing-mode IPC unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn('Processing-mode sender validation failed:', err);
    return false;
  }
}

function registerIpc(ipcMain, { getWindows, controller } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_processing_mode] registerIpc requires ipcMain');
  }
  if (!controller || typeof controller.getState !== 'function' || typeof controller.requestAbort !== 'function') {
    throw new Error('[import_extract_processing_mode] registerIpc requires controller');
  }

  const resolveMainWin = () => {
    if (typeof getWindows === 'function') {
      const windows = getWindows() || {};
      return windows.mainWin || null;
    }
    return null;
  };

  ipcMain.handle('import-extract-get-processing-mode', async (event) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      return { ok: true, state: controller.getState() };
    } catch (err) {
      log.error('import-extract-get-processing-mode failed:', err);
      return { ok: false, code: 'STATE_READ_FAILED', error: String(err) };
    }
  });

  ipcMain.handle('import-extract-request-abort', async (event, payload) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }

      const context = payload && typeof payload === 'object' ? payload : {};
      return controller.requestAbort(context);
    } catch (err) {
      log.error('import-extract-request-abort failed:', err);
      return { ok: false, code: 'ABORT_FAILED', error: String(err) };
    }
  });
}

module.exports = {
  createController,
  registerIpc,
};
