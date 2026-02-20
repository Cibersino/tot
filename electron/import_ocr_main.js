// electron/import_ocr_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own import/OCR session and job stores (main-process authority).
// - Own global OCR lock state and broadcast lock changes to renderers.
// - Register import/OCR IPC contract scaffolding for phased implementation.
// - Provide shared IPC lock-guard helpers for other main-process modules.

// =============================================================================
// Imports / logger
// =============================================================================
const { BrowserWindow } = require('electron');
const Log = require('./log');

const log = Log.get('import-ocr-main');
log.debug('Import/OCR main starting...');

// =============================================================================
// State
// =============================================================================
let resolveWindows = () => ({});

// Session/job stores are intentionally in-memory only for MVP.
const sessions = new Map();
const jobs = new Map();
let activeJobId = '';

const ocrLockState = {
  locked: false,
  reason: '',
};

// =============================================================================
// Helpers
// =============================================================================
function isAliveWindow(win) {
  return !!(win && !win.isDestroyed());
}

function safeSend(win, channel, payload) {
  if (!isAliveWindow(win)) return;
  try {
    win.webContents.send(channel, payload);
  } catch (err) {
    log.warnOnce(
      `import_ocr_main.safeSend.${channel}`,
      `webContents.send('${channel}') failed (ignored):`,
      err
    );
  }
}

function getUniqueAliveWindows() {
  const windows = resolveWindows() || {};
  const seen = new Set();
  const out = [];
  Object.values(windows).forEach((win) => {
    if (!isAliveWindow(win)) return;
    const key = String(win.id || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(win);
  });
  return out;
}

function fail(code, message, extra = {}) {
  return Object.assign({ ok: false, code, message }, extra);
}

function isKnownAppSender(event) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!senderWin) return false;
    return getUniqueAliveWindows().some((win) => win === senderWin);
  } catch {
    return false;
  }
}

function isMainWindowSender(event) {
  try {
    const windows = resolveWindows() || {};
    const mainWin = windows.mainWin || null;
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    return !!(isAliveWindow(mainWin) && senderWin && senderWin === mainWin);
  } catch {
    return false;
  }
}

function broadcastLockState() {
  const payload = {
    locked: !!ocrLockState.locked,
    reason: ocrLockState.reason || '',
  };
  getUniqueAliveWindows().forEach((win) => {
    safeSend(win, 'ocr-lock-state', payload);
  });
}

function setOcrLockState(locked, reason = '') {
  const nextLocked = !!locked;
  const nextReason = nextLocked
    ? String(reason || 'OCR_RUNNING')
    : '';

  if (ocrLockState.locked === nextLocked && ocrLockState.reason === nextReason) {
    return;
  }

  ocrLockState.locked = nextLocked;
  ocrLockState.reason = nextReason;
  broadcastLockState();
}

function getOcrLockState() {
  return {
    locked: !!ocrLockState.locked,
    reason: ocrLockState.reason || '',
    activeJobId: activeJobId || null,
  };
}

function isOcrLockActive() {
  return !!ocrLockState.locked;
}

function guardIpcWhileLocked(event, options = {}) {
  if (!isOcrLockActive()) return null;
  if (options && options.allowWhenLocked) return null;

  const knownWindowsOnly = !options || options.knownWindowsOnly !== false;
  if (knownWindowsOnly && !isKnownAppSender(event)) return null;

  const mainWindowOnly = !!(options && options.mainWindowOnly);
  if (mainWindowOnly && !isMainWindowSender(event)) return null;

  const channel = options && typeof options.channel === 'string' && options.channel
    ? options.channel
    : 'unknown';

  log.warnOnce(
    `import_ocr_main.lock.blocked.${channel}`,
    `OCR lock active: blocked IPC '${channel}'.`
  );

  return fail(
    'OCR_LOCKED',
    'OCR is currently running; action blocked.',
    { reason: ocrLockState.reason || 'OCR_RUNNING' }
  );
}

function ensureMainSender(event, channel) {
  if (isMainWindowSender(event)) return null;
  log.warnOnce(
    `import_ocr_main.${channel}.unauthorized`,
    `${channel} unauthorized (ignored).`
  );
  return fail('UNAUTHORIZED', 'unauthorized');
}

// =============================================================================
// IPC registration (Batch 1 scaffolding)
// =============================================================================
function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_ocr_main] registerIpc requires ipcMain');
  }

  if (typeof getWindows === 'function') {
    resolveWindows = getWindows;
  }

  // Read-only lock snapshot for renderer bootstrap.
  ipcMain.handle('ocr-lock-get-state', (event) => {
    if (!isKnownAppSender(event)) {
      return fail('UNAUTHORIZED', 'unauthorized');
    }
    return Object.assign({ ok: true }, getOcrLockState());
  });

  // Contract scaffold: select file + route (to be implemented in Phase A/B/C).
  ipcMain.handle('import-select-file', async (event) => {
    const unauthorized = ensureMainSender(event, 'import-select-file');
    if (unauthorized) return unauthorized;

    const blocked = guardIpcWhileLocked(event, {
      channel: 'import-select-file',
      mainWindowOnly: true,
    });
    if (blocked) return blocked;

    return fail('IMPORT_NOT_READY', 'Import/OCR pipeline is not implemented yet.');
  });

  // Contract scaffold: start extraction/OCR job for a session.
  ipcMain.handle('import-run', async (event, payload) => {
    const unauthorized = ensureMainSender(event, 'import-run');
    if (unauthorized) return unauthorized;

    const blocked = guardIpcWhileLocked(event, {
      channel: 'import-run',
      mainWindowOnly: true,
    });
    if (blocked) return blocked;

    const p = payload && typeof payload === 'object' ? payload : {};
    const sessionId = typeof p.sessionId === 'string' ? p.sessionId.trim() : '';
    if (!sessionId) {
      return fail('IMPORT_INVALID_PAYLOAD', 'Missing sessionId.');
    }
    if (!sessions.has(sessionId)) {
      return fail('IMPORT_SESSION_NOT_FOUND', 'Session not found.');
    }

    return fail('IMPORT_NOT_READY', 'Import/OCR pipeline is not implemented yet.');
  });

  // Contract scaffold: cancel active OCR (allowed during lock).
  ipcMain.handle('import-cancel', async (event) => {
    const unauthorized = ensureMainSender(event, 'import-cancel');
    if (unauthorized) return unauthorized;

    if (!activeJobId || !jobs.has(activeJobId)) {
      return fail('OCR_NOT_RUNNING', 'No active OCR job.');
    }

    return fail('IMPORT_NOT_READY', 'Import/OCR pipeline is not implemented yet.');
  });

  // Contract scaffold: apply finished result through existing current-text flow.
  ipcMain.handle('import-apply', async (event, payload) => {
    const unauthorized = ensureMainSender(event, 'import-apply');
    if (unauthorized) return unauthorized;

    const blocked = guardIpcWhileLocked(event, {
      channel: 'import-apply',
      mainWindowOnly: true,
    });
    if (blocked) return blocked;

    const p = payload && typeof payload === 'object' ? payload : {};
    const sessionId = typeof p.sessionId === 'string' ? p.sessionId.trim() : '';
    if (!sessionId) {
      return fail('IMPORT_INVALID_PAYLOAD', 'Missing sessionId.');
    }
    if (!sessions.has(sessionId)) {
      return fail('IMPORT_SESSION_NOT_FOUND', 'Session not found.');
    }

    return fail('IMPORT_NOT_READY', 'Import/OCR pipeline is not implemented yet.');
  });

  // Contract scaffold: discard session/result.
  ipcMain.handle('import-discard', async (event, payload) => {
    const unauthorized = ensureMainSender(event, 'import-discard');
    if (unauthorized) return unauthorized;

    const blocked = guardIpcWhileLocked(event, {
      channel: 'import-discard',
      mainWindowOnly: true,
    });
    if (blocked) return blocked;

    const p = payload && typeof payload === 'object' ? payload : {};
    const sessionId = typeof p.sessionId === 'string' ? p.sessionId.trim() : '';
    if (!sessionId) {
      return fail('IMPORT_INVALID_PAYLOAD', 'Missing sessionId.');
    }
    if (!sessions.has(sessionId)) {
      return fail('IMPORT_SESSION_NOT_FOUND', 'Session not found.');
    }

    sessions.delete(sessionId);
    return { ok: true };
  });

}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  registerIpc,
  guardIpcWhileLocked,
  setOcrLockState,
  getOcrLockState,
  isOcrLockActive,
};
