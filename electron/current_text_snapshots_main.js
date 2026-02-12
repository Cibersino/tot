// electron/current_text_snapshots_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Show native save/open dialogs for current-text snapshots.
// - Persist/load snapshot JSON files under config/saved_current_texts.
// - Enforce path containment (including symlink-safe checks) within snapshots tree.
// - Confirm overwrite before loading and apply text through text_state main logic.
// - Register a minimal IPC contract for renderer actions.

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const { dialog, BrowserWindow } = require('electron');
const Log = require('./log');
const menuBuilder = require('./menu_builder');
const settingsState = require('./settings');

const log = Log.get('current-text-snapshots');

const SNAPSHOT_FILTERS = [{ name: 'JSON', extensions: ['json'] }];
const DEFAULT_STEM = 'current_text';
const DEFAULT_EXT = '.json';
const MAX_FILENAME_STEM_CHARS = 96;

const resolveDialogText = (dialogTexts, key, fallback) =>
  menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log,
    warnPrefix: 'current_text_snapshots.dialog.missing',
  });

function isPlainObject(x) {
  if (!x || typeof x !== 'object') return false;
  return Object.getPrototypeOf(x) === Object.prototype;
}

function sanitizeFileStem(raw) {
  const base = String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '');
  if (!base) return '';
  return base.slice(0, MAX_FILENAME_STEM_CHARS);
}

function sanitizeSnapshotFilename(raw, fallbackName) {
  const fallbackStem =
    sanitizeFileStem(String(fallbackName || '').replace(/\.json$/i, '')) ||
    DEFAULT_STEM;
  const inputStem = sanitizeFileStem(String(raw || '').replace(/\.json$/i, ''));
  const finalStem = inputStem || fallbackStem;
  return `${finalStem}${DEFAULT_EXT}`;
}

function ensureRealPath(inputPath) {
  try {
    if (fs.realpathSync && fs.realpathSync.native) {
      return fs.realpathSync.native(inputPath);
    }
    return fs.realpathSync(inputPath);
  } catch (err) {
    return null;
  }
}

function isWithinBase(basePath, candidatePath) {
  const rel = path.relative(basePath, candidatePath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function findNearestExistingAncestor(absPath) {
  let cur = path.resolve(absPath);
  while (true) {
    if (fs.existsSync(cur)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function verifyLoadPathInsideTree({ snapshotsDir, selectedPath }) {
  const baseReal = ensureRealPath(snapshotsDir);
  if (!baseReal) {
    return { ok: false, code: 'SNAPSHOTS_DIR_UNAVAILABLE', message: 'snapshots dir unavailable' };
  }

  const chosenAbs = path.resolve(String(selectedPath || '').trim());
  if (!chosenAbs || !fs.existsSync(chosenAbs)) {
    return { ok: false, code: 'NOT_FOUND', message: 'selected file not found' };
  }

  const chosenReal = ensureRealPath(chosenAbs);
  if (!chosenReal) {
    return { ok: false, code: 'READ_FAILED', message: 'failed to resolve selected file realpath' };
  }

  if (!isWithinBase(baseReal, chosenReal)) {
    return { ok: false, code: 'OUTSIDE_SNAPSHOTS_DIR', message: 'selected file is outside snapshots tree' };
  }

  return { ok: true, baseReal, chosenReal };
}

function verifySavePathInsideTree({ snapshotsDir, selectedPath }) {
  const baseReal = ensureRealPath(snapshotsDir);
  if (!baseReal) {
    return { ok: false, code: 'SNAPSHOTS_DIR_UNAVAILABLE', message: 'snapshots dir unavailable' };
  }

  const chosenAbs = path.resolve(String(selectedPath || '').trim());
  if (!chosenAbs) {
    return { ok: false, code: 'INVALID_PATH', message: 'invalid selected path' };
  }

  if (fs.existsSync(chosenAbs)) {
    const chosenReal = ensureRealPath(chosenAbs);
    if (!chosenReal) {
      return { ok: false, code: 'WRITE_FAILED', message: 'failed to resolve selected target realpath' };
    }
    if (!isWithinBase(baseReal, chosenReal)) {
      return { ok: false, code: 'OUTSIDE_SNAPSHOTS_DIR', message: 'selected target is outside snapshots tree' };
    }
    return { ok: true, baseReal, chosenAbs };
  }

  const parentAbs = path.dirname(chosenAbs);
  const ancestorAbs = findNearestExistingAncestor(parentAbs);
  if (!ancestorAbs) {
    return { ok: false, code: 'WRITE_FAILED', message: 'target path has no existing ancestor' };
  }

  const ancestorReal = ensureRealPath(ancestorAbs);
  if (!ancestorReal) {
    return { ok: false, code: 'WRITE_FAILED', message: 'failed to resolve ancestor realpath' };
  }
  if (!isWithinBase(baseReal, ancestorReal)) {
    return { ok: false, code: 'OUTSIDE_SNAPSHOTS_DIR', message: 'selected path escapes snapshots tree via symlink' };
  }

  return { ok: true, baseReal, chosenAbs };
}

function computeDefaultSnapshotName(snapshotsDir) {
  let maxN = 0;
  try {
    const entries = fs.existsSync(snapshotsDir)
      ? fs.readdirSync(snapshotsDir, { withFileTypes: true })
      : [];
    for (const entry of entries) {
      if (!entry || !entry.isFile || !entry.isFile()) continue;
      const m = /^current_text_(\d+)\.json$/i.exec(String(entry.name || ''));
      if (!m || !m[1]) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  } catch (err) {
    log.warnOnce(
      'current_text_snapshots.defaultName.scan_failed',
      '[current_text_snapshots] Could not scan snapshots dir for default name (ignored):',
      err
    );
  }
  return `current_text_${maxN + 1}.json`;
}

function getDialogContext() {
  let lang = 'es';
  try {
    const settings = settingsState.getSettings();
    if (settings && typeof settings.language === 'string' && settings.language.trim()) {
      lang = settings.language.trim();
    }
  } catch (err) {
    log.warnOnce(
      'current_text_snapshots.dialogContext.settings',
      '[current_text_snapshots] Could not read settings for dialog language (using fallback).',
      err
    );
  }
  const dialogTexts = menuBuilder.getDialogTexts(lang);
  return { dialogTexts };
}

function interpolate(template, vars = {}) {
  if (typeof template !== 'string' || !template) return '';
  return template.replace(/\{(\w+)\}/g, (m, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return m;
    const value = vars[key];
    return value === undefined || value === null ? m : String(value);
  });
}

function parseSnapshotJson(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  if (!text.trim()) {
    return { ok: false, code: 'INVALID_JSON', message: 'snapshot file is empty' };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, code: 'INVALID_JSON', message: 'snapshot file has invalid JSON' };
  }
  if (!isPlainObject(parsed) || typeof parsed.text !== 'string') {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot JSON schema must be: { "text": "<string>" }' };
  }
  return { ok: true, snapshot: parsed };
}

function ensureMainSender(event, getWindows) {
  const windows = typeof getWindows === 'function' ? getWindows() : {};
  const mainWin = windows && windows.mainWin ? windows.mainWin : null;
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (!mainWin || mainWin.isDestroyed() || !senderWin || senderWin !== mainWin) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'unauthorized sender', mainWin: null };
  }
  return { ok: true, mainWin };
}

function getFileStatsSafe(filePath) {
  try {
    const st = fs.statSync(filePath);
    return {
      bytes: Number(st.size) || 0,
      mtimeMs: Number(st.mtimeMs) || 0,
    };
  } catch {
    return { bytes: 0, mtimeMs: 0 };
  }
}

function registerIpc(
  ipcMain,
  {
    getWindows,
    ensureSnapshotsDir,
    getSnapshotsDir,
    getCurrentText,
    applyCurrentText,
  } = {}
) {
  if (!ipcMain) {
    throw new Error('[current_text_snapshots] registerIpc requires ipcMain');
  }
  if (typeof ensureSnapshotsDir !== 'function' || typeof getSnapshotsDir !== 'function') {
    throw new Error('[current_text_snapshots] registerIpc requires ensureSnapshotsDir/getSnapshotsDir');
  }
  if (typeof getCurrentText !== 'function' || typeof applyCurrentText !== 'function') {
    throw new Error('[current_text_snapshots] registerIpc requires getCurrentText/applyCurrentText');
  }

  ipcMain.handle('current-text-snapshot-save-via-dialog', async (event) => {
    try {
      const auth = ensureMainSender(event, getWindows);
      if (!auth.ok) {
        log.warnOnce(
          'current_text_snapshots.save.unauthorized',
          '[current_text_snapshots] save unauthorized (ignored).'
        );
        return { ok: false, code: auth.code, message: auth.message };
      }

      ensureSnapshotsDir();
      const snapshotsDir = getSnapshotsDir();
      const defaultName = computeDefaultSnapshotName(snapshotsDir);
      const defaultPath = path.join(snapshotsDir, defaultName);

      const saveRes = await dialog.showSaveDialog(auth.mainWin || null, {
        defaultPath,
        filters: SNAPSHOT_FILTERS,
      });
      if (saveRes && saveRes.canceled) {
        return { ok: false, code: 'CANCELLED' };
      }

      const rawPath = saveRes && typeof saveRes.filePath === 'string' ? saveRes.filePath.trim() : '';
      if (!rawPath) {
        return { ok: false, code: 'INVALID_PATH', message: 'missing save path' };
      }

      const parentDir = path.dirname(rawPath);
      const rawName = path.basename(rawPath);
      const safeName = sanitizeSnapshotFilename(rawName, defaultName);
      const sanitizedPath = path.join(parentDir, safeName);

      const pathCheck = verifySavePathInsideTree({
        snapshotsDir,
        selectedPath: sanitizedPath,
      });
      if (!pathCheck.ok) {
        return { ok: false, code: pathCheck.code, message: pathCheck.message };
      }

      const payload = { text: String(getCurrentText() || '') };
      const json = JSON.stringify(payload, null, 2);
      fs.mkdirSync(path.dirname(pathCheck.chosenAbs), { recursive: true });
      fs.writeFileSync(pathCheck.chosenAbs, json, 'utf8');

      const info = getFileStatsSafe(pathCheck.chosenAbs);
      return {
        ok: true,
        code: 'SAVED',
        filename: path.basename(pathCheck.chosenAbs),
        bytes: info.bytes,
        mtimeMs: info.mtimeMs,
        length: payload.text.length,
      };
    } catch (err) {
      log.error('[current_text_snapshots] save failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('current-text-snapshot-load-via-dialog', async (event) => {
    try {
      const auth = ensureMainSender(event, getWindows);
      if (!auth.ok) {
        log.warnOnce(
          'current_text_snapshots.load.unauthorized',
          '[current_text_snapshots] load unauthorized (ignored).'
        );
        return { ok: false, code: auth.code, message: auth.message };
      }

      ensureSnapshotsDir();
      const snapshotsDir = getSnapshotsDir();
      const openRes = await dialog.showOpenDialog(auth.mainWin || null, {
        defaultPath: snapshotsDir,
        filters: SNAPSHOT_FILTERS,
        properties: ['openFile'],
      });
      if (openRes && openRes.canceled) {
        return { ok: false, code: 'CANCELLED' };
      }

      const selectedPath = openRes && Array.isArray(openRes.filePaths) ? String(openRes.filePaths[0] || '') : '';
      if (!selectedPath) {
        return { ok: false, code: 'NOT_FOUND', message: 'no file selected' };
      }

      const pathCheck = verifyLoadPathInsideTree({
        snapshotsDir,
        selectedPath,
      });
      if (!pathCheck.ok) {
        return { ok: false, code: pathCheck.code, message: pathCheck.message };
      }

      const raw = fs.readFileSync(pathCheck.chosenReal, 'utf8');
      const parsed = parseSnapshotJson(raw);
      if (!parsed.ok) {
        return { ok: false, code: parsed.code, message: parsed.message };
      }

      const fileName = path.basename(pathCheck.chosenReal);
      const { dialogTexts } = getDialogContext();
      const yesLabel = resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
      const noLabel = resolveDialogText(dialogTexts, 'no', 'No, cancel');
      const confirmMessage =
        interpolate(dialogTexts.load_current_text_snapshot_confirm, { name: fileName }) ||
        resolveDialogText(
          dialogTexts,
          'load_current_text_snapshot_confirm',
          `Overwrite current text with snapshot "${fileName}"?`
        );

      const conf = await dialog.showMessageBox(auth.mainWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message: confirmMessage,
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      const applyRes = applyCurrentText({
        text: parsed.snapshot.text,
        meta: { source: 'main-window', action: 'overwrite_snapshot' },
      });
      if (!applyRes || applyRes.ok === false) {
        return {
          ok: false,
          code: 'APPLY_FAILED',
          message: applyRes && applyRes.error ? String(applyRes.error) : 'failed to apply snapshot text',
        };
      }

      const info = getFileStatsSafe(pathCheck.chosenReal);
      return {
        ok: true,
        code: 'LOADED',
        filename: fileName,
        bytes: info.bytes,
        mtimeMs: info.mtimeMs,
        truncated: !!applyRes.truncated,
        length: Number(applyRes.length) || 0,
      };
    } catch (err) {
      log.error('[current_text_snapshots] load failed:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });
}

module.exports = {
  registerIpc,
};
