// electron/current_text_snapshots_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Provide save/load snapshot flows for current text via native dialogs.
// - Enforce snapshot path containment under config/saved_current_texts.
// - Validate snapshot JSON schema { text: "<string>" }.
// - Apply loaded snapshots through text_state (same semantics as overwrite).
// - Register IPC handlers: current-text-snapshot-save / current-text-snapshot-load.
// =============================================================================

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const Log = require('./log');
const { DEFAULT_LANG } = require('./constants_main');
const {
  getCurrentTextSnapshotsDir,
  ensureCurrentTextSnapshotsDir,
  saveJson,
} = require('./fs_storage');
const textState = require('./text_state');
const settingsState = require('./settings');
const menuBuilder = require('./menu_builder');

const log = Log.get('current-text-snapshots');
log.debug('Current text snapshots main starting...');

// =============================================================================
// Constants / config
// =============================================================================
const SNAPSHOT_EXT = '.json';
const SNAPSHOT_NAME_RE = /^current_text_(\d+)\.json$/i;

// =============================================================================
// Helpers (paths + dialogs)
// =============================================================================
function safeRealpath(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function ensureSnapshotsRoot() {
  try {
    ensureCurrentTextSnapshotsDir();
  } catch (err) {
    log.error('ensureSnapshotsRoot failed:', err);
  }
  const root = getCurrentTextSnapshotsDir();
  return fs.existsSync(root) ? root : null;
}

function isPathInsideRoot(rootReal, candidatePath) {
  if (!rootReal || !candidatePath) return false;
  const rel = path.relative(rootReal, candidatePath);
  if (rel === '') return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function getDefaultSnapshotName(rootDir) {
  let maxNum = 0;
  try {
    const entries = fs.readdirSync(rootDir);
    entries.forEach((name) => {
      const match = name.match(SNAPSHOT_NAME_RE);
      if (match) {
        const n = Number(match[1]);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
    });
  } catch (err) {
    log.warnOnce('current_text_snapshots.defaultName', 'Failed to scan snapshots dir:', err);
  }
  return `current_text_${maxNum + 1}.json`;
}

function sanitizeSnapshotBaseName(base) {
  let next = String(base || '');
  next = next.replace(/\s+/g, '_');
  next = next.replace(/[^A-Za-z0-9_-]/g, '');
  next = next.replace(/_+/g, '_').replace(/-+/g, '-');
  next = next.replace(/^[_-]+|[_-]+$/g, '');
  return next || 'current_text';
}

function normalizeSavePath(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  const dir = path.dirname(resolved);
  const base = path.basename(resolved, path.extname(resolved));
  const safeBase = sanitizeSnapshotBaseName(base);
  return path.join(dir, `${safeBase}${SNAPSHOT_EXT}`);
}

function resolveDialogText(dialogTexts, key, fallback) {
  return menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log,
    warnPrefix: 'current_text_snapshots.dialog.missing',
  });
}

function getDialogTexts() {
  try {
    const settings = settingsState.getSettings();
    const lang = settings && settings.language ? settings.language : DEFAULT_LANG;
    return menuBuilder.getDialogTexts(lang);
  } catch (err) {
    log.warnOnce('current_text_snapshots.dialogTexts', 'Using fallback dialog texts:', err);
    return {};
  }
}

async function confirmOverwrite(kind, mainWin, name = '') {
  const dialogTexts = getDialogTexts();
  const yesLabel = resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
  const noLabel = resolveDialogText(dialogTexts, 'no', 'No, cancel');
  const messageKey = kind === 'save'
    ? 'snapshot_overwrite_save'
    : 'snapshot_overwrite_load';
  let message = resolveDialogText(
    dialogTexts,
    messageKey,
    kind === 'save'
      ? 'Overwrite existing snapshot file?'
      : 'Replace current text with the selected snapshot?'
  );
  if (kind === 'load' && name) {
    message = message.replace('{name}', String(name));
  }

  const res = await dialog.showMessageBox(mainWin || null, {
    type: 'none',
    buttons: [yesLabel, noLabel],
    defaultId: 1,
    cancelId: 1,
    message,
  });
  return res && res.response === 0;
}

// =============================================================================
// IPC registration
// =============================================================================
function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain) {
    throw new Error('[current_text_snapshots] registerIpc requires ipcMain');
  }

  const resolveMainWin = () => {
    if (typeof getWindows === 'function') {
      const wins = getWindows() || {};
      return wins.mainWin || null;
    }
    return null;
  };

  ipcMain.handle('current-text-snapshot-save', async () => {
    try {
      const root = ensureSnapshotsRoot();
      if (!root) {
        return { ok: false, code: 'WRITE_FAILED', message: 'snapshots dir unavailable' };
      }

      const rootReal = safeRealpath(root);
      if (!rootReal) {
        return { ok: false, code: 'WRITE_FAILED', message: 'snapshots dir realpath failed' };
      }

      const defaultName = getDefaultSnapshotName(root);
      const defaultPath = path.join(root, defaultName);

      const dialogRes = await dialog.showSaveDialog(resolveMainWin(), {
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (!dialogRes || dialogRes.canceled || !dialogRes.filePath) {
        return { ok: false, code: 'CANCELLED' };
      }

      const normalizedPath = normalizeSavePath(dialogRes.filePath);
      const candidateResolved = path.resolve(normalizedPath);
      const parentDir = path.dirname(candidateResolved);
      const parentReal = fs.existsSync(parentDir) ? safeRealpath(parentDir) : null;

      if (!isPathInsideRoot(rootReal, candidateResolved)) {
        return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
      }

      if (parentReal && !isPathInsideRoot(rootReal, parentReal)) {
        return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
      }

      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const text = textState.getCurrentText() || '';
      saveJson(candidateResolved, { text: String(text) });

      if (!fs.existsSync(candidateResolved)) {
        return { ok: false, code: 'WRITE_FAILED', message: 'snapshot not persisted' };
      }

      const stats = fs.existsSync(candidateResolved)
        ? fs.statSync(candidateResolved)
        : { size: 0, mtimeMs: Date.now() };

      return {
        ok: true,
        path: candidateResolved,
        filename: path.basename(candidateResolved),
        bytes: stats.size,
        mtime: stats.mtimeMs,
        length: String(text).length,
      };
    } catch (err) {
      log.error('snapshot save failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('current-text-snapshot-load', async () => {
    try {
      const root = ensureSnapshotsRoot();
      if (!root) {
        return { ok: false, code: 'READ_FAILED', message: 'snapshots dir unavailable' };
      }

      const rootReal = safeRealpath(root);
      if (!rootReal) {
        return { ok: false, code: 'READ_FAILED', message: 'snapshots dir realpath failed' };
      }

      const dialogRes = await dialog.showOpenDialog(resolveMainWin(), {
        defaultPath: root,
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });

      if (!dialogRes || dialogRes.canceled || !dialogRes.filePaths || !dialogRes.filePaths.length) {
        return { ok: false, code: 'CANCELLED' };
      }

      const selectedPath = String(dialogRes.filePaths[0] || '');
      const selectedReal = safeRealpath(selectedPath);
      if (!selectedReal) {
        return { ok: false, code: 'READ_FAILED', message: 'snapshot realpath failed' };
      }

      if (!isPathInsideRoot(rootReal, selectedReal)) {
        return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
      }

      const stats = fs.statSync(selectedReal);

      const confirmed = await confirmOverwrite('load', resolveMainWin(), path.basename(selectedReal));
      if (!confirmed) {
        return { ok: false, code: 'CONFIRM_DENIED' };
      }

      let raw = fs.readFileSync(selectedReal, 'utf8');
      raw = raw.replace(/^\uFEFF/, '');
      if (!raw.trim()) {
        return { ok: false, code: 'INVALID_JSON', message: 'empty snapshot file' };
      }

      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return { ok: false, code: 'INVALID_JSON', message: String(err) };
      }

      if (!parsed || typeof parsed !== 'object' || typeof parsed.text !== 'string') {
        return { ok: false, code: 'INVALID_SCHEMA', message: 'invalid snapshot schema' };
      }

      const res = textState.applyCurrentText(parsed.text, {
        source: 'main-window',
        action: 'load_snapshot',
      });

      return {
        ok: true,
        path: selectedReal,
        filename: path.basename(selectedReal),
        bytes: stats.size,
        mtime: stats.mtimeMs,
        length: res && typeof res.length === 'number' ? res.length : parsed.text.length,
        truncated: !!(res && res.truncated),
      };
    } catch (err) {
      log.error('snapshot load failed:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  registerIpc,
};

// =============================================================================
// End of electron/current_text_snapshots_main.js
// =============================================================================
