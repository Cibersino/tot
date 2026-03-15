'use strict';

const Log = require('../log');

const log = Log.get('import-extract-preconditions');

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

function registerIpc(ipcMain, { getPreconditionContext } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_preconditions] registerIpc requires ipcMain');
  }
  if (typeof getPreconditionContext !== 'function') {
    throw new Error('[import_extract_preconditions] registerIpc requires getPreconditionContext()');
  }

  ipcMain.handle('import-extract-check-preconditions', async () => {
    try {
      const context = getPreconditionContext() || {};
      const openSecondaryWindows = normalizeWindowEntries(context.openSecondaryWindows);
      const stopwatchRunning = !!context.stopwatchRunning;

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

module.exports = {
  registerIpc,
};
