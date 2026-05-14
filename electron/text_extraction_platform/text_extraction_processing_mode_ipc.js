// electron/text_extraction_platform/text_extraction_processing_mode_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process processing-mode controller and IPC surface for text extraction flows.
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

const log = Log.get('text-extraction-processing-mode');

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

function sanitizePositiveInt(rawValue) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

function sanitizeRoute(rawValue) {
  const value = sanitizeMeta(rawValue).toLowerCase();
  return value === 'native' || value === 'ocr' ? value : '';
}

function sanitizeProcessingContext(context = {}) {
  const raw = context && typeof context === 'object' ? context : {};
  return {
    unitIndex: sanitizePositiveInt(raw.unitIndex),
    unitCount: sanitizePositiveInt(raw.unitCount),
    inputIndex: sanitizePositiveInt(raw.inputIndex),
    inputCount: sanitizePositiveInt(raw.inputCount),
    selectedRoute: sanitizeRoute(raw.selectedRoute),
    processingInputFileName: sanitizeMeta(raw.processingInputFileName),
    processingInputSource: sanitizeMeta(raw.processingInputSource),
  };
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
  let unitIndex = null;
  let unitCount = null;
  let inputIndex = null;
  let inputCount = null;
  let selectedRoute = '';
  let processingInputFileName = '';
  let processingInputSource = '';

  const getState = () => ({
    active,
    lockId,
    sinceEpochMs,
    source,
    reason,
    unitIndex,
    unitCount,
    inputIndex,
    inputCount,
    selectedRoute,
    processingInputFileName,
    processingInputSource,
  });

  const notifyStateChanged = () => {
    if (typeof onStateChanged !== 'function') {
      log.warnOnce(
        'text_extraction_processing_mode.onStateChanged.unavailable',
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
    ({
      unitIndex,
      unitCount,
      inputIndex,
      inputCount,
      selectedRoute,
      processingInputFileName,
      processingInputSource,
    } = sanitizeProcessingContext(context));

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
    unitIndex = null;
    unitCount = null;
    inputIndex = null;
    inputCount = null;
    selectedRoute = '';
    processingInputFileName = '';
    processingInputSource = '';

    log.info('Processing mode disabled:', { lockId, source, reason });
    notifyStateChanged();
    return { changed: true, state: getState() };
  };

  const update = (context = {}) => {
    if (!active) return { changed: false, state: getState() };
    const next = sanitizeProcessingContext(context);
    unitIndex = next.unitIndex;
    unitCount = next.unitCount;
    inputIndex = next.inputIndex;
    inputCount = next.inputCount;
    selectedRoute = next.selectedRoute;
    processingInputFileName = next.processingInputFileName;
    processingInputSource = next.processingInputSource;
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
    update,
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
        'text_extraction_processing_mode.unauthorized',
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
    throw new Error('[text_extraction_processing_mode] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[text_extraction_processing_mode] registerIpc requires getWindows()');
  }
  if (!controller || typeof controller.getState !== 'function' || typeof controller.requestAbort !== 'function') {
    throw new Error('[text_extraction_processing_mode] registerIpc requires controller');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('text-extraction-get-processing-mode', async (event) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      return { ok: true, state: controller.getState() };
    } catch (err) {
      log.error('text-extraction-get-processing-mode failed:', err);
      return { ok: false, code: 'STATE_READ_FAILED', error: String(err) };
    }
  });

  ipcMain.handle('text-extraction-enter-processing-session', async (event, payload) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }

      const context = payload && typeof payload === 'object' ? payload : {};
      const transition = controller.enter(context);
      if (!transition.changed && controller.isActive()) {
        return { ok: false, code: 'ALREADY_ACTIVE', state: controller.getState() };
      }
      return { ok: true, state: transition.state };
    } catch (err) {
      log.error('text-extraction-enter-processing-session failed:', err);
      return { ok: false, code: 'SESSION_ENTER_FAILED', error: String(err) };
    }
  });

  ipcMain.handle('text-extraction-update-processing-session', async (event, payload) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      if (!controller.isActive()) {
        return { ok: false, code: 'NOT_ACTIVE', state: controller.getState() };
      }

      const context = payload && typeof payload === 'object' ? payload : {};
      const transition = controller.update(context);
      return { ok: true, state: transition.state };
    } catch (err) {
      log.error('text-extraction-update-processing-session failed:', err);
      return { ok: false, code: 'SESSION_UPDATE_FAILED', error: String(err) };
    }
  });

  ipcMain.handle('text-extraction-exit-processing-session', async (event, payload) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      if (!controller.isActive()) {
        return { ok: false, code: 'NOT_ACTIVE', state: controller.getState() };
      }

      const context = payload && typeof payload === 'object' ? payload : {};
      const transition = controller.exit(context);
      return { ok: true, state: transition.state };
    } catch (err) {
      log.error('text-extraction-exit-processing-session failed:', err);
      return { ok: false, code: 'SESSION_EXIT_FAILED', error: String(err) };
    }
  });

  ipcMain.handle('text-extraction-request-abort', async (event, payload) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }

      const context = payload && typeof payload === 'object' ? payload : {};
      return controller.requestAbort(context);
    } catch (err) {
      log.error('text-extraction-request-abort failed:', err);
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
// End of electron/text_extraction_platform/text_extraction_processing_mode_ipc.js
// =============================================================================
