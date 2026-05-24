// electron/current_text_processing_state_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process controller and IPC surface for authoritative current-text pending
// state.
// Responsibilities:
// - Own the latest authoritative current-text settle lifecycle used by main.
// - Keep the lock authoritative in main while the renderer-derived UI settles.
// - Ignore stale renderer settle completions when a newer text update exists.
// - Expose current state to the main renderer and broadcast state changes.

// =============================================================================
// Imports / logger
// =============================================================================

const { BrowserWindow } = require('electron');
const Log = require('./log');

const log = Log.get('current-text-processing-state');

// =============================================================================
// Constants / helpers
// =============================================================================

const MAX_META_CHARS = 160;

function sanitizeMeta(rawValue) {
  if (typeof rawValue !== 'string') return '';
  return rawValue.trim().slice(0, MAX_META_CHARS);
}

function sanitizeRequestId(rawValue) {
  const requestId = Number(rawValue);
  if (!Number.isInteger(requestId) || requestId < 1) return null;
  return requestId;
}

function sanitizeStateContext(context = {}) {
  const raw = context && typeof context === 'object' ? context : {};
  return {
    source: sanitizeMeta(raw.source),
    action: sanitizeMeta(raw.action),
  };
}

function sanitizeResolutionContext(context = {}) {
  const raw = context && typeof context === 'object' ? context : {};
  return {
    requestId: sanitizeRequestId(raw.requestId),
    outcome: raw && raw.ok === false ? 'failed' : 'settled',
  };
}

// =============================================================================
// Shared state controller
// =============================================================================

function createController({ onStateChanged } = {}) {
  let active = false;
  let lockId = 0;
  let requestId = 0;
  let sinceEpochMs = null;
  let source = '';
  let action = '';

  const getState = () => ({
    active,
    lockId,
    requestId,
    sinceEpochMs,
    source,
    action,
  });

  function notifyStateChanged() {
    if (typeof onStateChanged !== 'function') {
      log.warnOnce(
        'current_text_processing_state.onStateChanged.unavailable',
        'Current-text processing onStateChanged callback unavailable; state change notification skipped.'
      );
      return;
    }
    try {
      onStateChanged(getState());
    } catch (err) {
      log.warn('Current-text processing state change callback failed (ignored):', err);
    }
  }

  function begin(context = {}) {
    const nextContext = sanitizeStateContext(context);
    if (!active) {
      lockId += 1;
    }
    active = true;
    requestId += 1;
    sinceEpochMs = Date.now();
    source = nextContext.source;
    action = nextContext.action;
    log.info('Current-text processing enabled:', {
      lockId,
      requestId,
      source,
      action,
    });
    notifyStateChanged();
    return getState();
  }

  function resolve(context = {}) {
    if (!active) {
      return { ok: false, code: 'NOT_ACTIVE', state: getState() };
    }

    const resolution = sanitizeResolutionContext(context);
    if (!resolution.requestId) {
      return { ok: false, code: 'REQUEST_ID_INVALID', state: getState() };
    }
    if (resolution.requestId !== requestId) {
      return { ok: false, code: 'STALE_REQUEST', state: getState() };
    }

    const resolvedState = {
      lockId,
      requestId,
      source,
      action,
      outcome: resolution.outcome,
    };
    active = false;
    sinceEpochMs = null;
    source = '';
    action = '';

    log.info('Current-text processing resolved:', resolvedState);
    notifyStateChanged();
    return { ok: true, state: getState() };
  }

  return {
    begin,
    getState,
    isActive: () => active,
    resolve,
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
        'current_text_processing_state.unauthorized',
        'Current-text processing IPC unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn('Current-text processing sender validation failed:', err);
    return false;
  }
}

function registerIpc(ipcMain, { getWindows, controller } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[current_text_processing_state] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[current_text_processing_state] registerIpc requires getWindows()');
  }
  if (!controller || typeof controller.getState !== 'function' || typeof controller.resolve !== 'function') {
    throw new Error('[current_text_processing_state] registerIpc requires controller');
  }

  function resolveMainWin() {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  }

  ipcMain.handle('current-text-processing-get-state', async (event) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      return { ok: true, state: controller.getState() };
    } catch (err) {
      log.error('current-text-processing-get-state failed:', err);
      return { ok: false, code: 'STATE_READ_FAILED', error: String(err) };
    }
  });

  ipcMain.handle('current-text-processing-resolve', async (event, payload) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      return controller.resolve(payload);
    } catch (err) {
      log.error('current-text-processing-resolve failed:', err);
      return { ok: false, code: 'RESOLVE_FAILED', error: String(err) };
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
// End of electron/current_text_processing_state_ipc.js
// =============================================================================
