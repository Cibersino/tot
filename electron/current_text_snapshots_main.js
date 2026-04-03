// electron/current_text_snapshots_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Provide save/load snapshot flows for current text via native dialogs.
// - Persist optional snapshot tag metadata on save.
// - Enforce snapshot path containment under config/saved_current_texts.
// - Validate legacy and tagged snapshot JSON schemas:
//   { text: "<string>" }
//   { text: "<string>", tags?: { language?, type?, difficulty? } }
// - Apply loaded snapshots through text_state (same semantics as overwrite).
// - Register IPC handlers: current-text-snapshot-save / current-text-snapshot-select / current-text-snapshot-load.
// =============================================================================

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const { dialog, BrowserWindow } = require('electron');
const Log = require('./log');
const { DEFAULT_LANG } = require('./constants_main');
const snapshotTagCatalog = require('../public/js/lib/snapshot_tag_catalog');
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
if (!snapshotTagCatalog
  || !Array.isArray(snapshotTagCatalog.TAG_KEYS)
  || typeof snapshotTagCatalog.isPlainObject !== 'function'
  || typeof snapshotTagCatalog.normalizeLanguageTag !== 'function'
  || typeof snapshotTagCatalog.normalizeTypeTag !== 'function'
  || typeof snapshotTagCatalog.normalizeDifficultyTag !== 'function') {
  throw new Error('[current_text_snapshots] SnapshotTagCatalog unavailable; cannot continue');
}

// =============================================================================
// Constants / config
// =============================================================================
const SNAPSHOT_EXT = '.json';
const SNAPSHOT_NAME_RE = /^current_text_(\d+)\.json$/i;
const { TAG_KEYS: SNAPSHOT_TAG_KEYS } = snapshotTagCatalog;

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

function normalizeSnapshotRelPath(raw) {
  const source = typeof raw === 'string' ? raw.trim() : '';
  if (!source) return '';
  const normalizedSlashes = source.replace(/\\/g, '/');
  const withoutLeading = normalizedSlashes.startsWith('/')
    ? normalizedSlashes.slice(1)
    : normalizedSlashes;
  const segments = withoutLeading.split('/').filter(Boolean);
  if (!segments.length) return '';
  if (segments.some((seg) => seg === '.' || seg === '..')) return '';
  const rel = `/${segments.join('/')}`;
  if (!rel.toLowerCase().endsWith('.json')) return '';
  return rel;
}

function resolveSnapshotFromRelPath(rootReal, snapshotRelPath) {
  const rel = normalizeSnapshotRelPath(snapshotRelPath);
  if (!rootReal || !rel) return null;
  const resolved = path.resolve(path.join(rootReal, rel.slice(1)));
  if (!isPathInsideRoot(rootReal, resolved)) return null;
  return resolved;
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

async function confirmLoadOverwrite(ownerWin, name = '') {
  const dialogTexts = getDialogTexts();
  const yesLabel = resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
  const noLabel = resolveDialogText(dialogTexts, 'no', 'No, cancel');
  let message = resolveDialogText(
    dialogTexts,
    'snapshot_overwrite_load',
    'Replace current text with the selected snapshot?'
  );
  if (name) {
    message = message.replace('{name}', String(name));
  }

  const dialogResult = await dialog.showMessageBox(ownerWin || null, {
    type: 'none',
    buttons: [yesLabel, noLabel],
    defaultId: 1,
    cancelId: 1,
    message,
  });
  return dialogResult && dialogResult.response === 0;
}

function resolveOwnerWin(event, resolveMainWin) {
  if (event && event.sender) {
    try {
      const senderWin = BrowserWindow.fromWebContents(event.sender);
      if (senderWin) return senderWin;
      log.warnOnce(
        'current_text_snapshots.owner_window.sender_window_missing',
        'Dialog owner fallback: BrowserWindow.fromWebContents returned no window; using mainWin or unowned dialog.'
      );
    } catch (err) {
      log.warnOnce(
        'current_text_snapshots.owner_window.sender_resolve_failed',
        'Dialog owner fallback: failed to resolve sender BrowserWindow; using mainWin or unowned dialog.',
        err
      );
    }
  } else {
    log.warnOnce(
      'current_text_snapshots.owner_window.sender_missing',
      'Dialog owner fallback: IPC event sender unavailable; using mainWin or unowned dialog.'
    );
  }

  return resolveMainWin();
}

function getSnapshotsRoot(mode = 'read') {
  const code = mode === 'write' ? 'WRITE_FAILED' : 'READ_FAILED';
  const root = ensureSnapshotsRoot();
  if (!root) {
    log.warn('snapshot root unavailable:', { mode, code });
    return { ok: false, code, message: 'snapshots dir unavailable' };
  }
  const rootReal = safeRealpath(root);
  if (!rootReal) {
    log.warn('snapshot root realpath failed:', { mode, root });
    return { ok: false, code, message: 'snapshots dir realpath failed' };
  }
  return { ok: true, root, rootReal };
}

function getSnapshotRelPath(rootReal, selectedReal) {
  const relRaw = path.relative(rootReal, selectedReal).split(path.sep).join('/');
  return normalizeSnapshotRelPath(`/${relRaw}`);
}

function validateSelectedSnapshot(rootReal, selectedPath) {
  const selectedReal = safeRealpath(selectedPath);
  if (!selectedReal) {
    log.warn('snapshot realpath failed:', { selectedPath });
    return { ok: false, code: 'READ_FAILED', message: 'snapshot realpath failed' };
  }
  if (!isPathInsideRoot(rootReal, selectedReal)) {
    log.warn('snapshot path outside allowed root:', { selectedPath, selectedReal });
    return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
  }
  const stats = fs.statSync(selectedReal);
  if (!stats.isFile()) {
    log.warn('snapshot path is not a file:', { selectedReal });
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot path is not a file' };
  }
  const snapshotRelPath = getSnapshotRelPath(rootReal, selectedReal);
  if (!snapshotRelPath) {
    log.warn('snapshot relative path invalid after normalization:', { selectedReal });
    return { ok: false, code: 'INVALID_SCHEMA', message: 'invalid snapshot relative path' };
  }
  return { ok: true, selectedReal, stats, snapshotRelPath };
}

async function promptForSnapshotSelection(ownerWin, root, rootReal) {
  const dialogResult = await dialog.showOpenDialog(ownerWin, {
    defaultPath: root,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });

  if (!dialogResult || dialogResult.canceled || !dialogResult.filePaths || !dialogResult.filePaths.length) {
    return { ok: false, code: 'CANCELLED' };
  }

  const selectedPath = String(dialogResult.filePaths[0] || '');
  return validateSelectedSnapshot(rootReal, selectedPath);
}

function sanitizeSnapshotTags(rawTags, { allowMissing = false } = {}) {
  if (rawTags == null) {
    return allowMissing
      ? { ok: true, tags: null }
      : { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot tags missing' };
  }
  if (!snapshotTagCatalog.isPlainObject(rawTags)) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot tags must be an object' };
  }

  const rawKeys = Object.keys(rawTags);
  if (rawKeys.some((key) => !SNAPSHOT_TAG_KEYS.includes(key))) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot tags contain unsupported keys' };
  }

  const tags = {};

  if (Object.prototype.hasOwnProperty.call(rawTags, 'language')) {
    const language = snapshotTagCatalog.normalizeLanguageTag(rawTags.language);
    if (!language) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot language tag invalid' };
    }
    tags.language = language;
  }

  if (Object.prototype.hasOwnProperty.call(rawTags, 'type')) {
    const type = snapshotTagCatalog.normalizeTypeTag(rawTags.type);
    if (!type) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot type tag invalid' };
    }
    tags.type = type;
  }

  if (Object.prototype.hasOwnProperty.call(rawTags, 'difficulty')) {
    const difficulty = snapshotTagCatalog.normalizeDifficultyTag(rawTags.difficulty);
    if (!difficulty) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot difficulty tag invalid' };
    }
    tags.difficulty = difficulty;
  }

  return { ok: true, tags: Object.keys(tags).length ? tags : null };
}

function sanitizeSnapshotSavePayload(payload) {
  if (payload == null) return { ok: true, tags: null };
  if (!snapshotTagCatalog.isPlainObject(payload)) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot save payload must be an object' };
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'tags')) {
    return { ok: true, tags: null };
  }
  return sanitizeSnapshotTags(payload.tags, { allowMissing: true });
}

function parseSnapshotFile(selectedReal) {
  let raw = fs.readFileSync(selectedReal, 'utf8');
  raw = raw.replace(/^\uFEFF/, '');
  if (!raw.trim()) {
    log.warn('snapshot file is empty:', { selectedReal });
    return { ok: false, code: 'INVALID_JSON', message: 'empty snapshot file' };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.warn('snapshot JSON parse failed:', { selectedReal, err: String(err) });
    return { ok: false, code: 'INVALID_JSON', message: String(err) };
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.text !== 'string') {
    log.warn('snapshot schema invalid:', { selectedReal });
    return { ok: false, code: 'INVALID_SCHEMA', message: 'invalid snapshot schema' };
  }

  const tagsInfo = sanitizeSnapshotTags(parsed.tags, { allowMissing: true });
  if (!tagsInfo.ok) {
    log.warn('snapshot tags schema invalid:', { selectedReal, message: tagsInfo.message });
    return { ok: false, code: 'INVALID_SCHEMA', message: tagsInfo.message };
  }

  return { ok: true, text: parsed.text, tags: tagsInfo.tags };
}

// =============================================================================
// IPC registration
// =============================================================================
function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[current_text_snapshots] registerIpc requires ipcMain');
  }

  const resolveMainWin = () => {
    if (typeof getWindows !== 'function') {
      log.warnOnce(
        'current_text_snapshots.owner_window.get_windows_missing',
        'Dialog owner fallback: getWindows unavailable; using unowned dialog.'
      );
      return null;
    }

    const wins = getWindows();
    if (!wins || typeof wins !== 'object') {
      log.warnOnce(
        'current_text_snapshots.owner_window.windows_invalid',
        'Dialog owner fallback: getWindows returned no windows object; using unowned dialog.'
      );
      return null;
    }

    if (!wins.mainWin) {
      log.warnOnce(
        'current_text_snapshots.owner_window.main_window_missing',
        'Dialog owner fallback: mainWin unavailable; using unowned dialog.'
      );
      return null;
    }

    return wins.mainWin;
  };

  ipcMain.handle('current-text-snapshot-save', async (event, payload) => {
    try {
      const payloadInfo = sanitizeSnapshotSavePayload(payload);
      if (!payloadInfo.ok) {
        log.warn('snapshot save payload invalid:', { message: payloadInfo.message });
        return payloadInfo;
      }

      const rootInfo = getSnapshotsRoot('write');
      if (!rootInfo.ok) return rootInfo;
      const { root, rootReal } = rootInfo;

      const defaultName = getDefaultSnapshotName(root);
      const defaultPath = path.join(root, defaultName);

      const dialogRes = await dialog.showSaveDialog(resolveOwnerWin(event, resolveMainWin), {
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
        log.warn('snapshot save blocked outside root:', { candidateResolved });
        return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
      }

      if (parentReal && !isPathInsideRoot(rootReal, parentReal)) {
        log.warn('snapshot save blocked; parent realpath outside root:', { parentReal, candidateResolved });
        return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
      }

      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const text = textState.getCurrentText() || '';
      const snapshotData = { text: String(text) };
      if (payloadInfo.tags) snapshotData.tags = payloadInfo.tags;
      saveJson(candidateResolved, snapshotData);

      if (!fs.existsSync(candidateResolved)) {
        log.error('snapshot save reported success but file missing:', { candidateResolved });
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
        tags: payloadInfo.tags,
      };
    } catch (err) {
      log.error('snapshot save failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('current-text-snapshot-select', async (event) => {
    try {
      const rootInfo = getSnapshotsRoot('read');
      if (!rootInfo.ok) return rootInfo;
      const { root, rootReal } = rootInfo;

      const selectedInfo = await promptForSnapshotSelection(
        resolveOwnerWin(event, resolveMainWin),
        root,
        rootReal
      );
      if (!selectedInfo.ok) return selectedInfo;

      return {
        ok: true,
        snapshotRelPath: selectedInfo.snapshotRelPath,
      };
    } catch (err) {
      log.error('snapshot select failed:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('current-text-snapshot-load', async (event, payload) => {
    try {
      const rootInfo = getSnapshotsRoot('read');
      if (!rootInfo.ok) return rootInfo;
      const { root, rootReal } = rootInfo;

      let selectedReal = '';
      let snapshotRelPath = '';
      let stats = null;
      const requestedRelPath = normalizeSnapshotRelPath(payload && payload.snapshotRelPath ? payload.snapshotRelPath : '');
      if (requestedRelPath) {
        selectedReal = resolveSnapshotFromRelPath(rootReal, requestedRelPath);
        if (!selectedReal) {
          log.warn('snapshot load blocked outside root from rel path:', { requestedRelPath });
          return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
        }
        if (!fs.existsSync(selectedReal)) {
          log.warn('snapshot load target not found:', { requestedRelPath, selectedReal });
          return { ok: false, code: 'NOT_FOUND' };
        }
        const selectedInfo = validateSelectedSnapshot(rootReal, selectedReal);
        if (!selectedInfo.ok) return selectedInfo;
        selectedReal = selectedInfo.selectedReal;
        stats = selectedInfo.stats;
        snapshotRelPath = selectedInfo.snapshotRelPath;
      } else {
        const selectedInfo = await promptForSnapshotSelection(
          resolveOwnerWin(event, resolveMainWin),
          root,
          rootReal
        );
        if (!selectedInfo.ok) return selectedInfo;
        selectedReal = selectedInfo.selectedReal;
        stats = selectedInfo.stats;
        snapshotRelPath = selectedInfo.snapshotRelPath;
      }

      const confirmed = await confirmLoadOverwrite(resolveOwnerWin(event, resolveMainWin), path.basename(selectedReal));
      if (!confirmed) {
        return { ok: false, code: 'CONFIRM_DENIED' };
      }

      const parsed = parseSnapshotFile(selectedReal);
      if (!parsed.ok) return parsed;

      const applyResult = textState.applyCurrentText(parsed.text, {
        source: 'main-window',
        action: 'load_snapshot',
      });

      return {
        ok: true,
        path: selectedReal,
        snapshotRelPath,
        filename: path.basename(selectedReal),
        bytes: stats.size,
        mtime: stats.mtimeMs,
        length: applyResult && typeof applyResult.length === 'number' ? applyResult.length : parsed.text.length,
        truncated: !!(applyResult && applyResult.truncated),
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
  normalizeSnapshotRelPath,
};

// =============================================================================
// End of electron/current_text_snapshots_main.js
// =============================================================================
