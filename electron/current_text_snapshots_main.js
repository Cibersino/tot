// electron/current_text_snapshots_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Current-text snapshot owner for save/load flows under config/saved_current_texts.
// Responsibilities:
// - Provide save/load snapshot flows for current text via native dialogs.
// - Persist optional snapshot tag metadata on save.
// - Enforce snapshot path containment under config/saved_current_texts.
// - Validate snapshot JSON payloads before save and after load.
// - Apply loaded snapshots through text_state (same semantics as overwrite).
// - Register IPC handlers for save, open-folder, select, and load flows.
// =============================================================================

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const { dialog, BrowserWindow, shell } = require('electron');
const Log = require('./log');
const {
  DEFAULT_LANG,
  PRESET_WPM_MIN,
  PRESET_WPM_MAX,
} = require('./constants_main');
const snapshotTagCatalog = require('../public/js/lib/snapshot_tag_catalog');
const countCore = require('../public/js/lib/count_core');
const formatCore = require('../public/js/lib/format_core');
const currentTextSnapshotSchema = require('./current_text_snapshot_schema');
const {
  getCurrentTextSnapshotsDir,
  ensureCurrentTextSnapshotsDir,
  saveJsonStrict,
} = require('./fs_storage');
const textState = require('./text_state');
const settingsState = require('./settings');
const menuBuilder = require('./menu_builder');

const log = Log.get('current-text-snapshots');
log.debug('Current text snapshots main starting...');

// =============================================================================
// Startup dependency validation
// =============================================================================

if (!snapshotTagCatalog
  || typeof snapshotTagCatalog.isPlainObject !== 'function') {
  throw new Error('[current_text_snapshots] SnapshotTagCatalog unavailable; cannot continue');
}

// =============================================================================
// Constants / config
// =============================================================================
const SNAPSHOT_EXT = '.json';
const {
  SNAPSHOT_TYPE,
  SNAPSHOT_SAVED_WITH,
  normalizeSnapshotCountLocale,
} = currentTextSnapshotSchema;
const SNAPSHOT_NAME_RE = /^current_text_(\d+)\.json$/i;
const SNAPSHOT_SAVE_PAYLOAD_KEYS = Object.freeze([
  'nonInteractive',
  'autoFileBaseName',
  'name',
  'sourceComment',
  'tags',
  'includeCount',
  'includeReading',
  'wpm',
]);
const countUtils = countCore.createCountUtils({
  DEFAULT_LANG,
  log,
  intlObject: typeof Intl !== 'undefined' ? Intl : null,
});
const formatUtils = formatCore.createFormatUtils({ DEFAULT_LANG, log });

// =============================================================================
// Helpers (paths)
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
    log.warn('ensureSnapshotsRoot failed (continuing):', err);
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
  let next = String(base || '').trim().normalize('NFC');
  next = next.replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ');
  next = next.replace(/\s+/g, ' ').trim();
  next = next.replace(/[. ]+$/g, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(next)) {
    next = `_${next}`;
  }
  return next || 'current_text';
}

function normalizeDerivedSnapshotBaseName(base) {
  let next = String(base || '').trim().normalize('NFC');
  next = next.replace(/[^\p{L}\p{N}\p{M}_-]+/gu, '_');
  next = next.replace(/_+/g, '_').replace(/-+/g, '-');
  next = next.replace(/^[_-]+|[_-]+$/g, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(next)) {
    next = `_${next}`;
  }
  return next || 'current_text';
}

function normalizeSavePath(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  const dir = path.dirname(resolved);
  const base = path.basename(resolved, path.extname(resolved));
  const safeBase = sanitizeSnapshotBaseName(base);
  return path.join(dir, `${safeBase}${SNAPSHOT_EXT}`);
}

function resolveDeterministicAutoSnapshotPath(rootDir, rawBaseName) {
  const safeBaseName = normalizeDerivedSnapshotBaseName(rawBaseName);
  let candidateName = `${safeBaseName}${SNAPSHOT_EXT}`;
  let candidatePath = path.join(rootDir, candidateName);
  let collisionIndex = 2;

  while (fs.existsSync(candidatePath)) {
    candidateName = `${safeBaseName}_${collisionIndex}${SNAPSHOT_EXT}`;
    candidatePath = path.join(rootDir, candidateName);
    collisionIndex += 1;
  }

  return {
    candidateName,
    candidatePath,
  };
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

// =============================================================================
// Helpers (schema + payloads)
// =============================================================================
function sanitizeSnapshotSavePayload(payload) {
  if (!snapshotTagCatalog.isPlainObject(payload)) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot save payload must be an object' };
  }

  const payloadKeys = Object.keys(payload);
  if (payloadKeys.some((key) => !SNAPSHOT_SAVE_PAYLOAD_KEYS.includes(key))) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot save payload contains unsupported keys' };
  }
  if (typeof payload.includeCount !== 'boolean' || typeof payload.includeReading !== 'boolean') {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot metric flags invalid' };
  }
  if (payload.includeReading && !payload.includeCount) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot reading requires count' };
  }

  const hasNonInteractive = Object.prototype.hasOwnProperty.call(payload, 'nonInteractive');
  if (hasNonInteractive && typeof payload.nonInteractive !== 'boolean') {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot nonInteractive flag invalid' };
  }
  const nonInteractive = payload.nonInteractive === true;

  const hasAutoFileBaseName = Object.prototype.hasOwnProperty.call(payload, 'autoFileBaseName');
  if (hasAutoFileBaseName && typeof payload.autoFileBaseName !== 'string') {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot automatic filename invalid' };
  }
  const autoFileBaseName = hasAutoFileBaseName ? payload.autoFileBaseName.trim() : '';

  let name = '';
  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    const nameInfo = currentTextSnapshotSchema.validateSnapshotName(payload.name);
    if (!nameInfo.ok) return nameInfo;
    name = nameInfo.value;
  }

  let sourceComment = '';
  if (Object.prototype.hasOwnProperty.call(payload, 'sourceComment')) {
    const sourceCommentInfo = currentTextSnapshotSchema.validateSnapshotSourceComment(payload.sourceComment);
    if (!sourceCommentInfo.ok) return sourceCommentInfo;
    sourceComment = sourceCommentInfo.value;
  }

  if (hasAutoFileBaseName && !nonInteractive) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot automatic fields require nonInteractive' };
  }

  const hasWpm = Object.prototype.hasOwnProperty.call(payload, 'wpm');
  if (payload.includeReading) {
    if (!hasWpm
      || !Number.isSafeInteger(payload.wpm)
      || payload.wpm < PRESET_WPM_MIN
      || payload.wpm > PRESET_WPM_MAX) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot WPM invalid' };
    }
  } else if (hasWpm) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot WPM requires reading' };
  }

  let tags = null;
  if (Object.prototype.hasOwnProperty.call(payload, 'tags') && payload.tags != null) {
    const tagsInfo = currentTextSnapshotSchema.validateSnapshotTags(payload.tags);
    if (!tagsInfo.ok) return tagsInfo;
    tags = Object.keys(tagsInfo.tags).length ? { ...tagsInfo.tags } : null;
  }

  return {
    ok: true,
    tags,
    autoFileBaseName,
    name,
    sourceComment,
    nonInteractive,
    includeCount: payload.includeCount,
    includeReading: payload.includeReading,
    wpm: payload.includeReading ? payload.wpm : null,
  };
}

function resolveSnapshotCountContext() {
  let settings = null;
  try {
    settings = settingsState.getSettings();
  } catch (err) {
    log.warn('Snapshot count settings read failed; using defaults.', err);
  }

  const mode = settings && settings.modeConteo === 'simple' ? 'simple' : 'preciso';
  const requestedLocale = settings && typeof settings.language === 'string'
    ? settings.language
    : DEFAULT_LANG;
  const locale = normalizeSnapshotCountLocale(requestedLocale)
    || normalizeSnapshotCountLocale(DEFAULT_LANG);
  if (!locale) {
    throw new Error('snapshot count locale unavailable');
  }
  if (!normalizeSnapshotCountLocale(requestedLocale)) {
    log.warn('Snapshot count locale invalid; using default locale:', { requestedLocale, locale });
  }
  return { mode, locale };
}

function buildSnapshotMetrics(text, payloadInfo) {
  if (!payloadInfo.includeCount) return null;

  const countContext = resolveSnapshotCountContext();
  const stats = countUtils.contarTexto(text, {
    modoConteo: countContext.mode,
    idioma: countContext.locale,
  });
  const words = stats && stats.palabras;
  if (!Number.isSafeInteger(words) || words < 0) {
    throw new Error('snapshot word count invalid');
  }

  const metrics = {
    count: {
      words,
      mode: countContext.mode,
      locale: countContext.locale,
    },
  };
  if (!payloadInfo.includeReading) return metrics;

  const exactSeconds = formatUtils.getExactTotalSeconds(words, payloadInfo.wpm);
  const estimatedSeconds = Math.round(exactSeconds);
  if (!Number.isSafeInteger(estimatedSeconds) || estimatedSeconds < 0) {
    throw new Error('snapshot estimated reading duration invalid');
  }
  metrics.reading = {
    estimatedSeconds,
    wpm: payloadInfo.wpm,
  };
  return metrics;
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

  const snapshotInfo = currentTextSnapshotSchema.validateSnapshotDocument(parsed);
  if (!snapshotInfo.ok) {
    log.warn('snapshot schema invalid:', { selectedReal, message: snapshotInfo.message });
    return snapshotInfo;
  }

  const tags = snapshotInfo.snapshot.tags;
  const reading = snapshotInfo.snapshot.metrics && snapshotInfo.snapshot.metrics.reading;
  return {
    ok: true,
    text: snapshotInfo.snapshot.text,
    tags: Object.keys(tags).length ? tags : null,
    name: Object.prototype.hasOwnProperty.call(snapshotInfo.snapshot, 'name')
      ? snapshotInfo.snapshot.name
      : null,
    sourceComment: Object.prototype.hasOwnProperty.call(snapshotInfo.snapshot, 'sourceComment')
      ? snapshotInfo.snapshot.sourceComment
      : null,
    estimatedSeconds: reading ? reading.estimatedSeconds : null,
    wpm: reading ? reading.wpm : null,
  };
}

function inspectSnapshotAtRelPath(rawSnapshotRelPath) {
  const suppliedSnapshotRelPath = typeof rawSnapshotRelPath === 'string'
    ? rawSnapshotRelPath
    : '';
  const snapshotRelPath = normalizeSnapshotRelPath(suppliedSnapshotRelPath);
  if (!snapshotRelPath || snapshotRelPath !== suppliedSnapshotRelPath) {
    log.warn('snapshot inspection received invalid snapshotRelPath:', {
      snapshotRelPath: suppliedSnapshotRelPath,
    });
    return { ok: false, code: 'INVALID_SNAPSHOT_PATH' };
  }

  const rootInfo = getSnapshotsRoot('read');
  if (!rootInfo.ok) return rootInfo;
  const { rootReal } = rootInfo;
  const selectedReal = resolveSnapshotFromRelPath(rootReal, snapshotRelPath);
  if (!selectedReal) {
    log.warn('snapshot inspection blocked outside root:', { snapshotRelPath });
    return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
  }
  if (!fs.existsSync(selectedReal)) {
    log.warn('snapshot inspection target not found:', { snapshotRelPath, selectedReal });
    return { ok: false, code: 'NOT_FOUND' };
  }

  const selectedInfo = validateSelectedSnapshot(rootReal, selectedReal);
  if (!selectedInfo.ok) return selectedInfo;

  const parsed = parseSnapshotFile(selectedInfo.selectedReal);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    name: parsed.name,
    sourceComment: parsed.sourceComment,
    estimatedSeconds: parsed.estimatedSeconds,
    wpm: parsed.wpm,
  };
}

// =============================================================================
// Helpers (dialogs + owners)
// =============================================================================
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
  const continueLabel = resolveDialogText(dialogTexts, 'continue_button');
  const cancelLabel = resolveDialogText(dialogTexts, 'cancel_button');
  let message = resolveDialogText(dialogTexts, 'snapshot_overwrite_load');
  if (name) {
    message = message.replace('{name}', String(name));
  }

  const dialogResult = await dialog.showMessageBox(ownerWin || null, {
    type: 'none',
    buttons: [continueLabel, cancelLabel],
    defaultId: 1,
    cancelId: 1,
    message,
  });
  return dialogResult && dialogResult.response === 0;
}

function hasCurrentTextToOverwrite() {
  return String(textState.getCurrentText() || '').length > 0;
}

function resolveMainWin(getWindows) {
  if (typeof getWindows !== 'function') {
    log.warnOnce(
      'current_text_snapshots.owner_window.get_windows_missing',
      'Dialog owner fallback: getWindows unavailable; using unowned dialog.'
    );
    return null;
  }

  let wins = null;
  try {
    wins = getWindows();
  } catch (err) {
    log.warnOnce(
      'current_text_snapshots.owner_window.get_windows_failed',
      'Dialog owner fallback: getWindows failed; using unowned dialog.',
      err
    );
    return null;
  }

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
}

function resolveOwnerWin(event, getWindows) {
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

  return resolveMainWin(getWindows);
}

// =============================================================================
// IPC registration / handlers
// =============================================================================
function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[current_text_snapshots] registerIpc requires ipcMain');
  }

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
      let normalizedPath = '';
      if (payloadInfo.nonInteractive) {
        const defaultBaseName = path.basename(getDefaultSnapshotName(root), SNAPSHOT_EXT);
        const autoPath = resolveDeterministicAutoSnapshotPath(
          root,
          payloadInfo.autoFileBaseName || defaultBaseName
        );
        normalizedPath = normalizeSavePath(autoPath.candidatePath);
      } else {
        const defaultName = payloadInfo.name
          ? `${normalizeDerivedSnapshotBaseName(payloadInfo.name)}${SNAPSHOT_EXT}`
          : getDefaultSnapshotName(root);
        const defaultPath = path.join(root, defaultName);

        const dialogRes = await dialog.showSaveDialog(resolveOwnerWin(event, getWindows), {
          defaultPath,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });

        if (!dialogRes || dialogRes.canceled || !dialogRes.filePath) {
          return { ok: false, code: 'CANCELLED' };
        }

        normalizedPath = normalizeSavePath(dialogRes.filePath);
      }
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

      const text = String(textState.getCurrentText() || '');
      const metrics = buildSnapshotMetrics(text, payloadInfo);
      const snapshotData = {
        type: SNAPSHOT_TYPE,
        meta: {
          savedAt: new Date().toISOString(),
          savedWith: SNAPSHOT_SAVED_WITH,
        },
        ...(payloadInfo.name ? { name: payloadInfo.name } : {}),
        ...(payloadInfo.sourceComment ? { sourceComment: payloadInfo.sourceComment } : {}),
        text,
        tags: payloadInfo.tags || {},
        ...(metrics ? { metrics } : {}),
      };
      saveJsonStrict(candidateResolved, snapshotData);
      const stats = fs.statSync(candidateResolved);

      return {
        ok: true,
        path: candidateResolved,
        filename: path.basename(candidateResolved),
        bytes: stats.size,
        mtime: stats.mtimeMs,
        length: text.length,
        tags: payloadInfo.tags,
      };
    } catch (err) {
      log.error('snapshot save failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('current-text-snapshot-open-folder', async () => {
    try {
      const rootInfo = getSnapshotsRoot('read');
      if (!rootInfo.ok) return rootInfo;
      const { root } = rootInfo;
      const openResult = await shell.openPath(root);
      if (typeof openResult === 'string' && openResult.trim()) {
        log.warn('snapshot open folder failed:', { openResult });
        return { ok: false, code: 'READ_FAILED', message: openResult };
      }
      return { ok: true, path: root };
    } catch (err) {
      log.error('snapshot open folder failed:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('current-text-snapshot-select', async (event) => {
    try {
      const rootInfo = getSnapshotsRoot('read');
      if (!rootInfo.ok) return rootInfo;
      const { root, rootReal } = rootInfo;

      const selectedInfo = await promptForSnapshotSelection(
        resolveOwnerWin(event, getWindows),
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

  ipcMain.handle('current-text-snapshot-inspect', async (_event, payload) => {
    try {
      return inspectSnapshotAtRelPath(payload && payload.snapshotRelPath);
    } catch (err) {
      log.error('snapshot inspection failed:', err);
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
          resolveOwnerWin(event, getWindows),
          root,
          rootReal
        );
        if (!selectedInfo.ok) return selectedInfo;
        selectedReal = selectedInfo.selectedReal;
        stats = selectedInfo.stats;
        snapshotRelPath = selectedInfo.snapshotRelPath;
      }

      if (hasCurrentTextToOverwrite()) {
        const confirmed = await confirmLoadOverwrite(
          resolveOwnerWin(event, getWindows),
          path.basename(selectedReal)
        );
        if (!confirmed) {
          return { ok: false, code: 'CONFIRM_DENIED' };
        }
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
