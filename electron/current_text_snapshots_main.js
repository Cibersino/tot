// electron/current_text_snapshots_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process owner for current-text snapshots under config/saved_current_texts.
// Responsibilities:
// - Register IPC handlers for save, open-folder, select, inspect, and load flows.
// - Persist optional snapshot tags, count, and reading metadata.
// - Enforce canonical path containment under config/saved_current_texts.
// - Validate snapshot requests and documents before persistence or loading.
// - Apply loaded text through textState's canonical current-text write path.

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
const readingDurationCore = require('../public/js/lib/reading_duration_core');
const currentTextSnapshotSchema = require('./current_text_snapshot_schema');
const {
  getCurrentTextSnapshotsDir,
  ensureCurrentTextSnapshotsDir,
  saveJsonStrict,
  createJsonStrict,
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
  normalizeSnapshotPreciseCountLocale,
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
const readingDurationUtils = readingDurationCore.createReadingDurationUtils();

// =============================================================================
// Helpers (snapshot paths + storage)
// =============================================================================
function resolveRealpath(targetPath) {
  try {
    return { ok: true, path: fs.realpathSync(targetPath) };
  } catch (error) {
    return { ok: false, error };
  }
}

function inspectPathEntry(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return { ok: true, exists: true };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ok: true, exists: false };
    }
    return { ok: false, error };
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
  // Stored references use a root-relative slash path; reject dot segments instead of resolving them into a different snapshot identity.
  const source = typeof raw === 'string' ? raw.trim() : '';
  if (!source) return '';
  const normalizedSlashes = source.replace(/\\/g, '/');
  const withoutLeading = normalizedSlashes.startsWith('/')
    ? normalizedSlashes.slice(1)
    : normalizedSlashes;
  const segments = withoutLeading.split('/').filter(Boolean);
  if (!segments.length) return '';
  if (segments.some((seg) => seg === '.' || seg === '..')) return '';
  return `/${segments.join('/')}`;
}

function getRequestedSnapshotRelPath(payload, { allowOmitted = false } = {}) {
  if (typeof payload === 'undefined') {
    if (allowOmitted) return { ok: true, snapshotRelPath: null };
    log.warn('snapshot request omitted snapshotRelPath payload.');
    return { ok: false, code: 'INVALID_SNAPSHOT_PATH' };
  }
  if (!snapshotTagCatalog.isPlainObject(payload)
    || !Object.prototype.hasOwnProperty.call(payload, 'snapshotRelPath')
    || typeof payload.snapshotRelPath !== 'string') {
    log.warn('snapshot request received invalid snapshotRelPath payload:', payload);
    return { ok: false, code: 'INVALID_SNAPSHOT_PATH' };
  }

  const snapshotRelPath = normalizeSnapshotRelPath(payload.snapshotRelPath);
  if (!snapshotRelPath || snapshotRelPath !== payload.snapshotRelPath) {
    log.warn('snapshot request received invalid snapshotRelPath:', {
      snapshotRelPath: payload.snapshotRelPath,
    });
    return { ok: false, code: 'INVALID_SNAPSHOT_PATH' };
  }
  return { ok: true, snapshotRelPath };
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

function isWindowsReservedDeviceName(baseName) {
  return /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(baseName);
}

function normalizeDerivedSnapshotBaseName(base) {
  let next = base.trim().normalize('NFC');
  next = next.replace(/[^\p{L}\p{N}\p{M}_-]+/gu, '_');
  next = next.replace(/_+/g, '_').replace(/-+/g, '-');
  next = next.replace(/^[_-]+|[_-]+$/g, '');
  if (isWindowsReservedDeviceName(next)) {
    next = `_${next}`;
  }
  return next || 'current_text';
}

function isValidInteractiveSnapshotFileName(filePath) {
  const fileName = path.basename(filePath);
  if (path.extname(fileName) !== SNAPSHOT_EXT) return false;
  const stem = fileName.slice(0, -SNAPSHOT_EXT.length);
  return Boolean(stem.trim());
}

function getDeterministicAutoSnapshotCandidate(rootDir, rawBaseName, collisionIndex) {
  const safeBaseName = normalizeDerivedSnapshotBaseName(rawBaseName);
  const candidateName = collisionIndex === 1
    ? `${safeBaseName}${SNAPSHOT_EXT}`
    : `${safeBaseName}_${collisionIndex}${SNAPSHOT_EXT}`;

  return {
    candidateName,
    candidatePath: path.join(rootDir, candidateName),
  };
}

function getSnapshotsRoot(mode = 'read') {
  // Canonicalize the root before treating it as the containment boundary, including when a selected path may traverse symlinks.
  const code = mode === 'write' ? 'WRITE_FAILED' : 'READ_FAILED';
  const root = ensureSnapshotsRoot();
  if (!root) {
    log.error('snapshot root unavailable:', { mode, code });
    return { ok: false, code, message: 'snapshots dir unavailable' };
  }
  const rootRealRes = resolveRealpath(root);
  if (!rootRealRes.ok) {
    log.error('snapshot root realpath failed:', { mode, root, error: rootRealRes.error });
    return { ok: false, code, message: 'snapshots dir realpath failed' };
  }
  return { ok: true, root, rootReal: rootRealRes.path };
}

function getSnapshotRelPath(rootReal, selectedReal) {
  const relRaw = path.relative(rootReal, selectedReal).split(path.sep).join('/');
  return normalizeSnapshotRelPath(`/${relRaw}`);
}

function validateSelectedSnapshot(rootReal, selectedPath) {
  const selectedRealRes = resolveRealpath(selectedPath);
  if (!selectedRealRes.ok) {
    log.error('snapshot realpath failed:', { selectedPath, error: selectedRealRes.error });
    return { ok: false, code: 'READ_FAILED', message: 'snapshot realpath failed' };
  }
  const selectedReal = selectedRealRes.path;
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

  if (!dialogResult) {
    log.error('snapshot file picker returned no result; treating as cancelled.');
    return { ok: false, code: 'CANCELLED' };
  }
  if (dialogResult.canceled) {
    return { ok: false, code: 'CANCELLED' };
  }
  if (!dialogResult.filePaths || !dialogResult.filePaths.length) {
    log.error('snapshot file picker returned no selected file; treating as cancelled:', dialogResult);
    return { ok: false, code: 'CANCELLED' };
  }

  const selectedPath = dialogResult.filePaths[0];
  if (typeof selectedPath !== 'string' || !selectedPath.trim()) {
    log.warn('snapshot file picker returned invalid file path:', dialogResult);
    return { ok: false, code: 'READ_FAILED', message: 'snapshot file picker returned invalid file path' };
  }
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
  if (mode === 'simple') return { mode };

  const requestedLocale = settings && typeof settings.language === 'string'
    ? settings.language
    : DEFAULT_LANG;
  const normalizedRequestedLocale = normalizeSnapshotPreciseCountLocale(requestedLocale);
  const locale = normalizedRequestedLocale
    || normalizeSnapshotPreciseCountLocale(DEFAULT_LANG);
  if (!locale) {
    throw new Error('snapshot count locale unavailable');
  }
  if (!normalizedRequestedLocale) {
    log.warn('Snapshot count locale invalid; using default locale:', { requestedLocale, locale });
  }
  return { mode, locale };
}

function countSnapshotText(text, countContext) {
  const countOptions = {
    modoConteo: countContext.mode,
  };
  if (countContext.mode === 'preciso') {
    countOptions.idioma = countContext.locale;
  }

  try {
    return { stats: countUtils.contarTexto(text, countOptions), countContext };
  } catch (err) {
    if (!countUtils.isPreciseCountFailure(err)) throw err;

    const fallbackInfo = settingsState.fallbackPreciseCountingToSimple({
      source: 'current-text-snapshot',
      code: err.code,
      stage: err.stage,
    });
    if (!fallbackInfo || fallbackInfo.ok !== true) throw err;

    const simpleCountContext = resolveSnapshotCountContext();
    if (simpleCountContext.mode !== 'simple') {
      throw new Error('snapshot Precise fallback did not establish simple mode');
    }
    return {
      stats: countUtils.contarTexto(text, { modoConteo: 'simple' }),
      countContext: simpleCountContext,
    };
  }
}

function buildSnapshotMetrics(text, payloadInfo) {
  if (!payloadInfo.includeCount) return null;

  const counted = countSnapshotText(text, resolveSnapshotCountContext());
  const { stats, countContext } = counted;
  const words = stats && stats.palabras;
  if (!Number.isSafeInteger(words) || words < 0) {
    throw new Error('snapshot word count invalid');
  }

  const count = {
    words,
    mode: countContext.mode,
  };
  if (countContext.mode === 'preciso') {
    count.locale = countContext.locale;
  }
  const metrics = { count };
  if (!payloadInfo.includeReading) return metrics;

  const estimatedSeconds = readingDurationUtils.getEstimatedReadingSeconds(words, payloadInfo.wpm);
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

function inspectSnapshotAtRelPath(snapshotRelPath) {
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
  if (!dialogResult || !Number.isInteger(dialogResult.response)) {
    log.error('snapshot overwrite confirmation returned invalid result:', dialogResult);
    return false;
  }
  return dialogResult && dialogResult.response === 0;
}

function hasCurrentTextToOverwrite() {
  const currentText = textState.getCurrentText();
  if (typeof currentText !== 'string') {
    throw new Error('textState.getCurrentText returned a non-string value');
  }
  return currentText.length > 0;
}

function resolveMainWin(getWindows) {
  // This fallback runs when resolveOwnerWin cannot use the IPC sender. Keep native dialogs attached to mainWin when possible, otherwise unowned.
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
      let writePath = '';
      let createExclusively = false;

      if (!payloadInfo.nonInteractive) {
        const defaultName = payloadInfo.name
          ? `${normalizeDerivedSnapshotBaseName(payloadInfo.name)}${SNAPSHOT_EXT}`
          : getDefaultSnapshotName(root);
        const defaultPath = path.join(root, defaultName);
        const dialogOptions = {
          defaultPath,
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: process.platform === 'darwin'
            ? ['showOverwriteConfirmation', 'createDirectory']
            : ['showOverwriteConfirmation'],
        };
        let selectedPath = null;

        while (!selectedPath) {
          const dialogRes = await dialog.showSaveDialog(
            resolveOwnerWin(event, getWindows),
            dialogOptions
          );

          if (!dialogRes) {
            log.error('snapshot save file picker returned no result; treating as cancelled.');
            return { ok: false, code: 'CANCELLED' };
          }
          if (dialogRes.canceled) {
            return { ok: false, code: 'CANCELLED' };
          }
          if (typeof dialogRes.filePath !== 'string' || !dialogRes.filePath.trim()) {
            log.error('snapshot save file picker returned invalid file path:', dialogRes);
            return { ok: false, code: 'WRITE_FAILED', message: 'snapshot save file picker returned invalid file path' };
          }
          if (!isValidInteractiveSnapshotFileName(dialogRes.filePath)) {
            const dialogTexts = getDialogTexts();
            await dialog.showMessageBox(resolveOwnerWin(event, getWindows), {
              type: 'warning',
              buttons: [resolveDialogText(dialogTexts, 'ok')],
              defaultId: 0,
              cancelId: 0,
              message: resolveDialogText(dialogTexts, 'snapshot_invalid_filename'),
            });
            continue;
          }

          selectedPath = dialogRes.filePath;
        }

        const candidateResolved = path.resolve(selectedPath);
        if (!isPathInsideRoot(rootReal, candidateResolved)) {
          log.warn('snapshot save blocked outside root:', { candidateResolved });
          return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
        }

        const parentDir = path.dirname(candidateResolved);
        const parentEntryRes = inspectPathEntry(parentDir);
        if (!parentEntryRes.ok) {
          log.error('snapshot save failed to inspect destination parent:', parentEntryRes.error);
          return { ok: false, code: 'WRITE_FAILED' };
        }
        if (!parentEntryRes.exists) {
          log.error('snapshot save failed because destination parent is missing:', parentDir);
          return { ok: false, code: 'WRITE_FAILED' };
        }

        const parentRealRes = resolveRealpath(parentDir);
        if (!parentRealRes.ok) {
          log.error('snapshot save failed to canonicalize destination parent:', parentRealRes.error);
          return { ok: false, code: 'WRITE_FAILED' };
        }
        if (!isPathInsideRoot(rootReal, parentRealRes.path)) {
          log.warn('snapshot save blocked; parent realpath outside root:', {
            parentReal: parentRealRes.path,
            candidateResolved,
          });
          return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
        }

        const destinationEntryRes = inspectPathEntry(candidateResolved);
        if (!destinationEntryRes.ok) {
          log.error('snapshot save failed to inspect destination entry:', destinationEntryRes.error);
          return { ok: false, code: 'WRITE_FAILED' };
        }
        if (destinationEntryRes.exists) {
          const destinationRealRes = resolveRealpath(candidateResolved);
          if (!destinationRealRes.ok) {
            log.error(
              'snapshot save failed to canonicalize existing destination:',
              destinationRealRes.error
            );
            return { ok: false, code: 'WRITE_FAILED' };
          }
          if (!isPathInsideRoot(rootReal, destinationRealRes.path)) {
            log.warn('snapshot save blocked existing destination outside root:', {
              destinationReal: destinationRealRes.path,
            });
            return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
          }
          const destinationStats = fs.statSync(destinationRealRes.path);
          if (!destinationStats.isFile()) {
            log.warn(
              'snapshot save rejected existing destination because canonical target is not a file:',
              { destinationReal: destinationRealRes.path }
            );
            return {
              ok: false,
              code: 'INVALID_SCHEMA',
              message: 'snapshot destination is not a file',
            };
          }
          writePath = destinationRealRes.path;
        } else {
          writePath = candidateResolved;
          createExclusively = true;
        }
      }

      const text = textState.getCurrentText();
      if (typeof text !== 'string') {
        throw new Error('textState.getCurrentText returned a non-string value');
      }
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
        tags: payloadInfo.tags === null ? {} : payloadInfo.tags,
        ...(metrics ? { metrics } : {}),
      };
      if (payloadInfo.nonInteractive) {
        const defaultBaseName = path.basename(getDefaultSnapshotName(rootReal), SNAPSHOT_EXT);
        const rawBaseName = payloadInfo.autoFileBaseName === ''
          ? defaultBaseName
          : payloadInfo.autoFileBaseName;
        let collisionIndex = 1;
        while (!writePath) {
          const candidate = getDeterministicAutoSnapshotCandidate(
            rootReal,
            rawBaseName,
            collisionIndex
          );
          try {
            createJsonStrict(candidate.candidatePath, snapshotData);
            writePath = candidate.candidatePath;
          } catch (error) {
            if (!error || error.code !== 'EEXIST') throw error;
            collisionIndex += 1;
          }
        }
      } else if (createExclusively) {
        createJsonStrict(writePath, snapshotData);
      } else {
        saveJsonStrict(writePath, snapshotData);
      }
      const stats = fs.statSync(writePath);

      return {
        ok: true,
        path: writePath,
        filename: path.basename(writePath),
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
      const request = getRequestedSnapshotRelPath(payload);
      if (!request.ok) return request;
      return inspectSnapshotAtRelPath(request.snapshotRelPath);
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

      const request = getRequestedSnapshotRelPath(payload, { allowOmitted: true });
      if (!request.ok) return request;
      let selectedInfo;
      if (request.snapshotRelPath !== null) {
        const selectedReal = resolveSnapshotFromRelPath(rootReal, request.snapshotRelPath);
        if (!selectedReal) {
          log.warn('snapshot load blocked outside root from rel path:', { snapshotRelPath: request.snapshotRelPath });
          return { ok: false, code: 'PATH_OUTSIDE_SNAPSHOTS' };
        }
        if (!fs.existsSync(selectedReal)) {
          log.warn('snapshot load target not found:', { snapshotRelPath: request.snapshotRelPath, selectedReal });
          return { ok: false, code: 'NOT_FOUND' };
        }
        selectedInfo = validateSelectedSnapshot(rootReal, selectedReal);
      } else {
        selectedInfo = await promptForSnapshotSelection(
          resolveOwnerWin(event, getWindows),
          root,
          rootReal
        );
      }
      if (!selectedInfo.ok) return selectedInfo;
      const { selectedReal, snapshotRelPath, stats } = selectedInfo;

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
