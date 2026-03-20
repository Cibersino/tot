// electron/import_extract_platform/import_extract_processing_mode_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process processing-mode controller and IPC surface for import/extract flows.
// Responsibilities:
// - Own the processing-mode controller state transitions used by main and IPC.
// - Sanitize caller-provided metadata that is persisted in controller state.
// - Guard processing-mode IPC to the main window sender only.
// - Expose current processing-mode state to the renderer.
// - Expose abort requests that translate into controller state transitions.

// =============================================================================
// Imports / logger
// =============================================================================

const { BrowserWindow } = require('electron');
const Log = require('../log');

const log = Log.get('import-extract-processing-mode');

// =============================================================================
// Constants / config
// =============================================================================

const MAX_META_CHARS = 160;

// =============================================================================
// Helpers
// =============================================================================

function sanitizeMeta(rawValue) {
  if (typeof rawValue !== 'string') return '';
  return rawValue.trim().slice(0, MAX_META_CHARS);
}

// =============================================================================
// Shared state controller
// =============================================================================

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
    if (typeof onStateChanged !== 'function') {
      log.warnOnce(
        'import_extract_processing_mode.onStateChanged.unavailable',
        'Processing-mode onStateChanged callback unavailable; state change notification skipped.'
      );
      return;
    }
    try {
      onStateChanged(getState());
    } catch (err) {
      log.warn('Processing-mode state change callback failed (ignored):', err);
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

// =============================================================================
// IPC registration / handlers
// =============================================================================

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
  if (typeof getWindows !== 'function') {
    throw new Error('[import_extract_processing_mode] registerIpc requires getWindows()');
  }
  if (!controller || typeof controller.getState !== 'function' || typeof controller.requestAbort !== 'function') {
    throw new Error('[import_extract_processing_mode] registerIpc requires controller');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
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

// =============================================================================
// Module surface
// =============================================================================

module.exports = {
  createController,
  registerIpc,
};

// =============================================================================
// End of electron/import_extract_platform/import_extract_processing_mode_ipc.js
// =============================================================================
