// electron/import_extract_platform/import_extract_preconditions_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process IPC wrapper for import/extract start preconditions.
// Responsibilities:
// - Validate registration dependencies for the precondition IPC path.
// - Validate the shape of the injected precondition context before decisions.
// - Normalize open secondary-window entries into the log/result surface.
// - Return a structured ready, blocked, or failure result for the renderer.
// - Keep precondition rejection diagnostics local to this IPC boundary.

// =============================================================================
// Imports / logger
// =============================================================================

const { BrowserWindow } = require('electron');
const Log = require('../log');

const log = Log.get('import-extract-preconditions');

// =============================================================================
// Helpers
// =============================================================================

function assertValidPreconditionContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('import-extract precondition context invalid');
  }
  if (!Array.isArray(context.openSecondaryWindows)) {
    throw new Error('import-extract precondition context missing openSecondaryWindows array');
  }
  if (typeof context.stopwatchRunning !== 'boolean') {
    throw new Error('import-extract precondition context missing stopwatchRunning boolean');
  }

  for (const item of context.openSecondaryWindows) {
    if (!item || typeof item !== 'object') {
      throw new Error('import-extract precondition window entry invalid');
    }
    if (typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error('import-extract precondition window entry missing id');
    }
    if (typeof item.isOpen !== 'boolean') {
      throw new Error('import-extract precondition window entry missing isOpen boolean');
    }
  }
}

function normalizeWindowEntries(rawWindows) {
  const list = Array.isArray(rawWindows) ? rawWindows : [];
  const normalized = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    const isOpen = !!item.isOpen;
    if (!id || !isOpen) continue;
    normalized.push({ id, label: label || id });
  }

  return normalized;
}

function buildBlockedResult({ openSecondaryWindows, stopwatchRunning }) {
  const reasons = [];
  if (openSecondaryWindows.length > 0) reasons.push('secondary_windows_open');
  if (stopwatchRunning) reasons.push('stopwatch_running');

  return {
    ok: true,
    canStart: false,
    state: 'precondition_rejected',
    reasons,
    guidanceKey: 'renderer.alerts.import_extract_precondition_blocked',
    detailsSafeForLogs: {
      openSecondaryWindowIds: openSecondaryWindows.map((w) => w.id),
      openSecondaryWindowCount: openSecondaryWindows.length,
      stopwatchRunning: !!stopwatchRunning,
    },
  };
}

function buildReadyResult() {
  return {
    ok: true,
    canStart: true,
    state: 'ready',
    reasons: [],
    guidanceKey: '',
    detailsSafeForLogs: {
      openSecondaryWindowIds: [],
      openSecondaryWindowCount: 0,
      stopwatchRunning: false,
    },
  };
}

function isAuthorizedSender(event, mainWin) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        'import_extract_preconditions.unauthorized',
        'import-extract-check-preconditions unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn('import-extract-check-preconditions sender validation failed:', err);
    return false;
  }
}

// =============================================================================
// IPC registration / handler
// =============================================================================

function registerIpc(ipcMain, { getWindows, getPreconditionContext } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_preconditions] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[import_extract_preconditions] registerIpc requires getWindows()');
  }
  if (typeof getPreconditionContext !== 'function') {
    throw new Error('[import_extract_preconditions] registerIpc requires getPreconditionContext()');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('import-extract-check-preconditions', async (event) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }

      const context = getPreconditionContext();
      assertValidPreconditionContext(context);
      const openSecondaryWindows = normalizeWindowEntries(context.openSecondaryWindows);
      const stopwatchRunning = context.stopwatchRunning;

      if (openSecondaryWindows.length > 0 || stopwatchRunning) {
        const blocked = buildBlockedResult({
          openSecondaryWindows,
          stopwatchRunning,
        });
        log.warn('import-extract precondition_rejected:', blocked.detailsSafeForLogs);
        return blocked;
      }

      return buildReadyResult();
    } catch (err) {
      log.error('import-extract precondition check failed:', err);
      return {
        ok: false,
        canStart: false,
        state: 'failure',
        reasons: ['precondition_check_failed'],
        guidanceKey: 'renderer.alerts.import_extract_precondition_error',
        detailsSafeForLogs: {
          errorName: String(err && err.name ? err.name : 'Error'),
          errorMessage: String(err && err.message ? err.message : err || ''),
        },
      };
    }
  });
}

// =============================================================================
// Module surface
// =============================================================================

module.exports = {
  registerIpc,
};

// =============================================================================
// End of electron/import_extract_platform/import_extract_preconditions_ipc.js
// =============================================================================
