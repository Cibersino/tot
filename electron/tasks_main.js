// electron/tasks_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Open/load the Task Editor and send task-editor-init payloads.
// - Save/delete task lists via native dialogs with path containment under config/tasks/lists.
// - Manage task library entries (list/save/delete) under config/tasks.
// - Persist task column widths under config/tasks.
// - Open task links with confirmation and allowlist rules.
// - Register IPC handlers for Task Editor actions.
// =============================================================================

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const { dialog, shell, BrowserWindow, app } = require('electron');
const Log = require('./log');
const menuBuilder = require('./menu_builder');
const { normalizeSnapshotRelPath } = require('./current_text_snapshots_main');
const taskDurationCore = require('../public/js/lib/task_duration_core');
const {
  DEFAULT_LANG,
  TASK_NAME_MAX_CHARS,
  TASK_LIST_MAX_ROWS,
  TASK_LIBRARY_MAX_ITEMS,
  TASK_ROW_TEXT_MAX_CHARS,
  TASK_ROW_COMMENT_MAX_CHARS,
  TASK_ROW_LINK_MAX_CHARS,
} = require('./constants_main');
const {
  ensureTasksDirs,
  getTasksListsDir,
  getTasksLibraryFile,
  getTasksAllowedHostsFile,
  getTasksColumnWidthsFile,
  getTaskFilePickerStateFile,
  loadJson,
  saveJson,
  saveJsonStrict,
  createJsonStrict,
} = require('./fs_storage');
const { getTextExtractionPlatformAdapter } = require('./text_extraction_platform/text_extraction_platform_adapter');

const log = Log.get('tasks-main');
log.debug('Tasks main starting...');

// =============================================================================
// Constants / shared state
// =============================================================================
const TASK_EXT = '.json';
const TASK_TYPE = 'task';
const TASK_SAVED_WITH = 'toT (totapp.org)';
const TASK_COLUMN_LAYOUT_VERSION = 1;
const TASK_COLUMN_WIDTH_MAX_PX = 100_000;
const TASK_UTILITY_COLUMN_MIN_WIDTHS = Object.freeze({
  comentario: 82,
  tiempo: 88,
  percent: 63,
  falta: 65,
  enlace: 250,
  acciones: 124,
});
const TASK_FILE_PICKER_STATE_FALLBACK = Object.freeze({
  lastDirectory: '',
});
const platformAdapter = getTextExtractionPlatformAdapter(process.platform);
const taskDurationUtils = taskDurationCore.createTaskDurationUtils();

// =============================================================================
// Helpers (paths, dialogs, file IO)
// =============================================================================
function resolveRealpath(targetPath) {
  try {
    return { ok: true, path: fs.realpathSync(targetPath) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function inspectPathEntry(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return { ok: true, exists: true };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, exists: false };
    return { ok: false, error: err };
  }
}

function ensureTasksRoot() {
  try {
    ensureTasksDirs();
  } catch (err) {
    log.error('ensureTasksRoot failed:', err);
  }
  const root = getTasksListsDir();
  if (!fs.existsSync(root)) {
    log.warn('tasks root missing (using null).');
    return null;
  }
  return root;
}

function isPathInsideRoot(rootReal, candidatePath) {
  if (!rootReal || !candidatePath) return false;
  const rel = path.relative(rootReal, candidatePath);
  if (rel === '') return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function sanitizeTaskBaseName(base) {
  let next = base;
  next = next.replace(/\s+/g, '_');
  next = next.replace(/[^A-Za-z0-9_-]/g, '');
  next = next.replace(/_+/g, '_').replace(/-+/g, '-');
  next = next.replace(/^[_-]+|[_-]+$/g, '');
  return next || 'task';
}

function resolveDialogText(dialogTexts, key, fallback) {
  return menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log,
  });
}

function getDialogTexts() {
  try {
    const settings = require('./settings').getSettings();
    const lang = settings && settings.language ? settings.language : DEFAULT_LANG;
    return menuBuilder.getDialogTexts(lang);
  } catch (err) {
    log.warn('Using fallback dialog texts:', err);
    return {};
  }
}

async function showContinueCancelDialog(ownerWin, {
  messageKey,
  messageReplacements,
} = {}) {
  const dialogTexts = getDialogTexts();
  const continueLabel = resolveDialogText(dialogTexts, 'continue_button');
  const cancelLabel = resolveDialogText(dialogTexts, 'cancel_button');

  let message = resolveDialogText(dialogTexts, messageKey);
  if (messageReplacements && typeof messageReplacements === 'object') {
    Object.keys(messageReplacements).forEach((key) => {
      message = message.replace(`{${key}}`, String(messageReplacements[key]));
    });
  }

  const dialogOptions = {
    type: 'none',
    buttons: [continueLabel, cancelLabel],
    defaultId: 1,
    cancelId: 1,
    message,
  };

  return dialog.showMessageBox(ownerWin || null, dialogOptions);
}

function getDefaultTaskFileName(rootDir, taskName) {
  const base = sanitizeTaskBaseName(taskName);
  const candidate = `${base}${TASK_EXT}`;
  if (!fs.existsSync(path.join(rootDir, candidate))) return candidate;
  let idx = 2;
  while (fs.existsSync(path.join(rootDir, `${base}_${idx}${TASK_EXT}`))) {
    idx += 1;
  }
  return `${base}_${idx}${TASK_EXT}`;
}

function readJsonFile(filePath) {
  let exists = false;
  try {
    exists = fs.existsSync(filePath);
  } catch (err) {
    return { ok: false, code: 'READ_FAILED', error: err };
  }
  if (!exists) return { ok: false, code: 'NOT_FOUND' };

  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  } catch (err) {
    return { ok: false, code: 'READ_FAILED', error: err };
  }
  if (!raw.trim()) return { ok: false, code: 'INVALID_JSON' };

  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, code: 'INVALID_JSON', error: err };
  }
}

// =============================================================================
// Helpers (normalization / validation)
// =============================================================================
const TASK_LIST_KEYS = Object.freeze(['type', 'meta', 'rows']);
const TASK_LIST_KEYS_WITH_SUMMARY = Object.freeze(['type', 'meta', 'summary', 'rows']);
const TASK_META_KEYS = Object.freeze(['name', 'createdAt', 'updatedAt', 'savedWith']);
const TASK_SUMMARY_KEYS = Object.freeze(['estimatedTotalSeconds', 'estimatedRemainingSeconds']);
const TASK_ROW_KEYS = Object.freeze([
  'texto',
  'tiempoSeconds',
  'percentComplete',
  'enlace',
  'comentario',
  'snapshotRelPath',
]);
const TASK_LIBRARY_ENTRY_REQUIRED_KEYS = Object.freeze(['texto', 'tiempoSeconds', 'enlace']);
const TASK_LIBRARY_ENTRY_OPTIONAL_KEYS = Object.freeze(['comentario', 'snapshotRelPath']);
const TASK_LIBRARY_SAVE_PAYLOAD_KEYS = Object.freeze(['entry']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function validateTaskSummary(rawTask, expectedSummary) {
  const hasSummary = Object.prototype.hasOwnProperty.call(rawTask, 'summary');
  if (!expectedSummary) {
    return hasSummary
      ? { ok: false, code: 'INVALID_SUMMARY' }
      : { ok: true, summary: null };
  }
  if (!hasSummary || !hasExactKeys(rawTask.summary, TASK_SUMMARY_KEYS)) {
    return { ok: false, code: 'INVALID_SUMMARY' };
  }

  const summary = rawTask.summary;
  if (!Number.isSafeInteger(summary.estimatedTotalSeconds)
    || !Number.isSafeInteger(summary.estimatedRemainingSeconds)
    || summary.estimatedTotalSeconds <= 0
    || summary.estimatedRemainingSeconds < 0
    || summary.estimatedRemainingSeconds > summary.estimatedTotalSeconds
    || summary.estimatedTotalSeconds !== expectedSummary.estimatedTotalSeconds
    || summary.estimatedRemainingSeconds !== expectedSummary.estimatedRemainingSeconds) {
    return { ok: false, code: 'INVALID_SUMMARY' };
  }
  return { ok: true, summary: expectedSummary };
}

function isCanonicalSnapshotRelPath(value) {
  if (typeof value !== 'string') return false;
  if (!value) return true;
  return normalizeSnapshotRelPath(value) === value;
}

function validateCanonicalTaskText(value, maxLength, { required = false, requireTrimmed = false } = {}) {
  if (typeof value !== 'string') return { ok: false, code: 'INVALID_TEXT_TYPE' };
  if (value.length > maxLength) return { ok: false, code: 'TEXT_TOO_LONG' };
  if (requireTrimmed && value !== value.trim()) return { ok: false, code: 'TEXT_NOT_CANONICAL' };
  if (required && !value) return { ok: false, code: 'EMPTY_TEXT' };
  return { ok: true, value };
}

function normalizeRow(raw) {
  if (!hasExactKeys(raw, TASK_ROW_KEYS)) return { ok: false, code: 'INVALID_ROW' };

  const textoRes = validateCanonicalTaskText(raw.texto, TASK_ROW_TEXT_MAX_CHARS, {
    required: true,
    requireTrimmed: true,
  });
  if (!textoRes.ok) return textoRes;
  if (!taskDurationUtils.isWholeDurationSeconds(raw.tiempoSeconds)) {
    return { ok: false, code: 'INVALID_TIEMPO' };
  }
  if (!taskDurationUtils.isPercentComplete(raw.percentComplete)) {
    return { ok: false, code: 'INVALID_PERCENT' };
  }
  const enlaceRes = validateCanonicalTaskText(raw.enlace, TASK_ROW_LINK_MAX_CHARS);
  if (!enlaceRes.ok) return enlaceRes;
  const comentarioRes = validateCanonicalTaskText(raw.comentario, TASK_ROW_COMMENT_MAX_CHARS);
  if (!comentarioRes.ok) return comentarioRes;
  if (!isCanonicalSnapshotRelPath(raw.snapshotRelPath)) {
    return { ok: false, code: 'INVALID_SNAPSHOT_PATH' };
  }

  return {
    ok: true,
    row: {
      texto: textoRes.value,
      tiempoSeconds: raw.tiempoSeconds,
      percentComplete: raw.percentComplete,
      enlace: enlaceRes.value,
      comentario: comentarioRes.value,
      snapshotRelPath: raw.snapshotRelPath,
    },
  };
}

function normalizeTaskRows(rows) {
  const normalizedRows = [];
  for (const row of rows) {
    const rowRes = normalizeRow(row);
    if (!rowRes.ok) return rowRes;
    normalizedRows.push(rowRes.row);
  }
  return { ok: true, rows: normalizedRows };
}

function hasExactLibraryEntryKeys(raw) {
  if (!isPlainObject(raw)) return false;
  const keys = Object.keys(raw);
  if (!TASK_LIBRARY_ENTRY_REQUIRED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(raw, key))) {
    return false;
  }
  return keys.every((key) => TASK_LIBRARY_ENTRY_REQUIRED_KEYS.includes(key)
    || TASK_LIBRARY_ENTRY_OPTIONAL_KEYS.includes(key));
}

function validateLibraryEntry(raw) {
  if (!hasExactLibraryEntryKeys(raw)) return { ok: false, code: 'INVALID_LIBRARY_ENTRY' };

  const textoRes = validateCanonicalTaskText(raw.texto, TASK_ROW_TEXT_MAX_CHARS, {
    required: true,
    requireTrimmed: true,
  });
  if (!textoRes.ok) return textoRes;
  if (!taskDurationUtils.isWholeDurationSeconds(raw.tiempoSeconds)) {
    return { ok: false, code: 'INVALID_TIEMPO' };
  }
  const enlaceRes = validateCanonicalTaskText(raw.enlace, TASK_ROW_LINK_MAX_CHARS);
  if (!enlaceRes.ok) return enlaceRes;

  const entry = {
    texto: textoRes.value,
    tiempoSeconds: raw.tiempoSeconds,
    enlace: enlaceRes.value,
  };
  if (Object.prototype.hasOwnProperty.call(raw, 'comentario')) {
    const comentarioRes = validateCanonicalTaskText(raw.comentario, TASK_ROW_COMMENT_MAX_CHARS, { required: true });
    if (!comentarioRes.ok) return comentarioRes;
    entry.comentario = comentarioRes.value;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'snapshotRelPath')) {
    if (!isCanonicalSnapshotRelPath(raw.snapshotRelPath) || !raw.snapshotRelPath) {
      return { ok: false, code: 'INVALID_SNAPSHOT_PATH' };
    }
    entry.snapshotRelPath = raw.snapshotRelPath;
  }
  return { ok: true, entry };
}

function validateTaskMeta(rawMeta) {
  if (!hasExactKeys(rawMeta, TASK_META_KEYS)) return { ok: false, code: 'INVALID_META' };
  const nameRes = validateCanonicalTaskText(rawMeta.name, TASK_NAME_MAX_CHARS, {
    required: true,
    requireTrimmed: true,
  });
  if (!nameRes.ok) {
    return { ok: false, code: nameRes.code === 'EMPTY_TEXT' ? 'NAME_REQUIRED' : nameRes.code };
  }
  if (!isCanonicalIsoTimestamp(rawMeta.createdAt) || !isCanonicalIsoTimestamp(rawMeta.updatedAt)) {
    return { ok: false, code: 'INVALID_META' };
  }
  if (rawMeta.savedWith !== TASK_SAVED_WITH) {
    return { ok: false, code: 'INVALID_META' };
  }
  return {
    ok: true,
    meta: {
      name: nameRes.value,
      createdAt: rawMeta.createdAt,
      updatedAt: rawMeta.updatedAt,
      savedWith: TASK_SAVED_WITH,
    },
  };
}

function normalizeTaskMeta(rawMeta) {
  const metaRes = validateTaskMeta(rawMeta);
  if (!metaRes.ok) return metaRes;
  return {
    ok: true,
    meta: {
      name: metaRes.meta.name,
      createdAt: metaRes.meta.createdAt,
      updatedAt: new Date().toISOString(),
      savedWith: TASK_SAVED_WITH,
    },
  };
}

function normalizeTaskList(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.rows)) {
    return { ok: false, code: 'INVALID_SCHEMA' };
  }
  const expectedTaskKeys = Object.prototype.hasOwnProperty.call(raw, 'summary')
    ? TASK_LIST_KEYS_WITH_SUMMARY
    : TASK_LIST_KEYS;
  if (!hasExactKeys(raw, expectedTaskKeys)) return { ok: false, code: 'INVALID_SCHEMA' };
  if (raw.type !== TASK_TYPE) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'INVALID_TASK_TYPE' };
  }
  if (raw.rows.length > TASK_LIST_MAX_ROWS) {
    return { ok: false, code: 'ROWS_TOO_MANY' };
  }

  const metaRes = validateTaskMeta(raw.meta);
  if (!metaRes.ok) return { ok: false, code: 'INVALID_SCHEMA', message: metaRes.code };

  const rowsRes = normalizeTaskRows(raw.rows);
  if (!rowsRes.ok) return { ok: false, code: 'INVALID_SCHEMA', message: rowsRes.code };

  const summaryRes = taskDurationUtils.deriveTaskSummary(rowsRes.rows);
  if (!summaryRes.ok) return { ok: false, code: 'INVALID_SCHEMA', message: summaryRes.code };
  const validatedSummary = validateTaskSummary(raw, summaryRes.summary);
  if (!validatedSummary.ok) {
    return { ok: false, code: 'INVALID_SCHEMA', message: validatedSummary.code };
  }

  const task = {
    type: TASK_TYPE,
    meta: metaRes.meta,
    ...(validatedSummary.summary ? { summary: validatedSummary.summary } : {}),
    rows: rowsRes.rows,
  };
  return { ok: true, task };
}

function validateColumnLayoutRecord(raw) {
  if (!hasExactKeys(raw, ['version', 'widths'])) return null;
  if (raw.version !== TASK_COLUMN_LAYOUT_VERSION) return null;

  const widthKeys = Object.keys(TASK_UTILITY_COLUMN_MIN_WIDTHS);
  if (!hasExactKeys(raw.widths, widthKeys)) return null;

  const widths = {};
  for (const key of widthKeys) {
    const width = raw.widths[key];
    if (
      !Number.isSafeInteger(width)
      || width < TASK_UTILITY_COLUMN_MIN_WIDTHS[key]
      || width > TASK_COLUMN_WIDTH_MAX_PX
    ) return null;
    widths[key] = width;
  }

  return {
    version: TASK_COLUMN_LAYOUT_VERSION,
    widths,
  };
}

// =============================================================================
// Helpers (library + allowlist)
// =============================================================================
function normalizeTexto(raw) {
  let s = raw;
  s = s.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  try {
    s = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  } catch {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return s.toLowerCase();
}

function loadLibraryData() {
  const file = getTasksLibraryFile();
  const res = readJsonFile(file);
  if (!res.ok) {
    if (res.code === 'NOT_FOUND') {
      log.warn('task library missing; using empty list. (NOTE: may be normal; no entries have been saved)');
      return { ok: true, items: [] };
    }
    if (res.code === 'READ_FAILED') {
      log.error('Task library read failed; task library actions unavailable.', res.error);
    } else {
      log.warn('Task library JSON invalid; task library actions unavailable.', res.error);
    }
    return { ok: false, code: res.code };
  }
  if (!Array.isArray(res.data)) {
    log.warn('Task library schema invalid; task library actions unavailable.');
    return { ok: false, code: 'INVALID_SCHEMA' };
  }
  if (res.data.length > TASK_LIBRARY_MAX_ITEMS) {
    log.warn(
      'Task library exceeds TASK_LIBRARY_MAX_ITEMS; task library actions unavailable.',
      { count: res.data.length, limit: TASK_LIBRARY_MAX_ITEMS }
    );
    return { ok: false, code: 'LIBRARY_TOO_LARGE' };
  }
  const items = [];
  for (const rawEntry of res.data) {
    const entryRes = validateLibraryEntry(rawEntry);
    if (!entryRes.ok) {
      log.warn('Task library entry invalid; task library actions unavailable.', {
        code: entryRes.code,
      });
      return { ok: false, code: 'INVALID_SCHEMA' };
    }
    items.push(entryRes.entry);
  }
  return { ok: true, items };
}

function saveLibraryData(items) {
  const file = getTasksLibraryFile();
  saveJsonStrict(file, items);
  return { ok: true };
}

function loadAllowedHosts() {
  const file = getTasksAllowedHostsFile();
  const res = readJsonFile(file);
  if (!res.ok) {
    if (res.code === 'NOT_FOUND') {
      log.warn('allowed_hosts.json missing; using empty set. (NOTE: may be normal; no host has been trusted)');
    } else if (res.code === 'READ_FAILED') {
      log.warn('allowed_hosts.json read failed; using empty set.', res.error);
    } else {
      log.warn('allowed_hosts.json invalid; using empty set.', res.error);
    }
    return new Set();
  }
  if (!Array.isArray(res.data)) {
    log.warn('allowed_hosts.json schema invalid; using empty set.');
    return new Set();
  }
  const set = new Set();
  let invalidEntryCount = 0;
  res.data.forEach((h) => {
    if (typeof h === 'string' && h.trim()) {
      set.add(h.trim().toLowerCase());
    } else {
      invalidEntryCount += 1;
    }
  });
  if (invalidEntryCount) {
    log.warn('allowed_hosts.json contains invalid entries; ignoring them.', {
      invalidEntryCount,
      totalEntries: res.data.length,
    });
  }
  return set;
}

function saveAllowedHosts(set) {
  const file = getTasksAllowedHostsFile();
  const arr = Array.from(set);
  saveJson(file, arr);
}

function isAuthorizedSender(event, expectedWin, logMessage) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!expectedWin || senderWin !== expectedWin) {
      log.warn(logMessage);
      return false;
    }
    return true;
  } catch (err) {
    log.error('tasks_main sender validation failed:', err);
    return false;
  }
}

function sendTaskEditorInit(taskEditorWin, payload, taskEditorLifecycle) {
  if (!taskEditorWin || taskEditorWin.isDestroyed()) {
    log.error("taskEditorWin send('task-editor-init') unavailable.");
    return false;
  }
  if (!taskEditorLifecycle
    || typeof taskEditorLifecycle.prepareInitialization !== 'function'
    || typeof taskEditorLifecycle.acceptInitializationIssued !== 'function') {
    log.error('Task Editor initialization lifecycle unavailable.');
    return false;
  }
  const correlatedPayload = taskEditorLifecycle.prepareInitialization(taskEditorWin, payload);
  if (!correlatedPayload) {
    log.error('Task Editor initialization could not be prepared.');
    return false;
  }
  try {
    taskEditorWin.webContents.send('task-editor-init', correlatedPayload);
  } catch (err) {
    log.error("taskEditorWin send('task-editor-init') failed:", err);
    return false;
  }
  return taskEditorLifecycle.acceptInitializationIssued(taskEditorWin, correlatedPayload.initId);
}

function normalizeTaskFilePickerState(rawState) {
  const state = rawState && typeof rawState === 'object' ? rawState : {};
  return {
    lastDirectory: typeof state.lastDirectory === 'string'
      ? state.lastDirectory.trim()
      : '',
  };
}

function readTaskFilePickerState() {
  try {
    const statePath = getTaskFilePickerStateFile();
    return {
      statePath,
      state: normalizeTaskFilePickerState(loadJson(statePath, TASK_FILE_PICKER_STATE_FALLBACK)),
    };
  } catch (err) {
    log.warn('Failed to read Task Editor file picker state (using defaults):', err);
    return {
      statePath: null,
      state: { ...TASK_FILE_PICKER_STATE_FALLBACK },
    };
  }
}

function persistTaskFilePickerState(statePath, nextState) {
  if (!statePath) return;
  try {
    saveJson(statePath, nextState);
  } catch (err) {
    log.warn('Failed to persist Task Editor file picker state (ignored):', err);
  }
}

function resolveTaskFilePickerDefaultPath(pickerState) {
  const persisted = platformAdapter.normalizePersistedDirectory(pickerState.lastDirectory);
  if (persisted) return persisted;
  return platformAdapter.resolveDefaultPickerPath({
    app,
    cwd: process.cwd(),
    log,
  });
}

async function promptForTaskFileSelection(ownerWin, { allowMultiple } = {}) {
  const properties = allowMultiple
    ? ['openFile', 'multiSelections']
    : ['openFile'];
  const stateInfo = readTaskFilePickerState();
  const defaultPath = resolveTaskFilePickerDefaultPath(stateInfo.state);
  const dialogRes = await dialog.showOpenDialog(ownerWin || null, { defaultPath, properties });
  if (!dialogRes) {
    log.error('Task file picker returned no result; treating as cancelled.');
    return { ok: false, code: 'CANCELLED' };
  }
  if (typeof dialogRes.canceled !== 'boolean') {
    log.error('Task file picker returned an invalid canceled flag:', dialogRes);
  }
  if (dialogRes.canceled) {
    return { ok: false, code: 'CANCELLED' };
  }

  if (!Array.isArray(dialogRes.filePaths) || !dialogRes.filePaths.length
    || dialogRes.filePaths.some((filePath) => typeof filePath !== 'string' || !filePath.trim())) {
    return { ok: false, code: 'READ_FAILED', message: 'file picker returned invalid file paths' };
  }
  const filePaths = dialogRes.filePaths.map((filePath) => path.resolve(filePath));

  const selectedDirectory = platformAdapter.normalizeSelectedDirectory(filePaths[0]);
  if (selectedDirectory) {
    persistTaskFilePickerState(stateInfo.statePath, { lastDirectory: selectedDirectory });
  }

  return { ok: true, filePaths };
}

// =============================================================================
// IPC registration
// =============================================================================
function registerIpc(ipcMain, { getWindows, ensureTaskEditorWindow, taskEditorLifecycle } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function' || typeof ipcMain.on !== 'function') {
    throw new Error('[tasks_main] registerIpc requires ipcMain');
  }

  const resolveWins = () => {
    if (typeof getWindows !== 'function') {
      log.error('tasks_main getWindows unavailable; resolving no windows.');
      return {};
    }
    const windows = getWindows();
    if (!windows) {
      log.error('tasks_main getWindows returned no window references; resolving no windows.');
      return {};
    }
    return windows;
  };
  const resolveMainWin = () => resolveWins().mainWin || null;
  const resolveTaskEditorWin = () => resolveWins().taskEditorWin || null;
  const resolveAuthorizedTaskEditorWin = (event, logMessage) => {
    const taskEditorWin = resolveTaskEditorWin();
    return isAuthorizedSender(event, taskEditorWin, logMessage)
      ? taskEditorWin
      : null;
  };

  const hasTaskEditorLifecycle = !!(taskEditorLifecycle
    && typeof taskEditorLifecycle.acceptDirtyState === 'function'
    && typeof taskEditorLifecycle.confirmReplacement === 'function'
    && typeof taskEditorLifecycle.prepareInitialization === 'function'
    && typeof taskEditorLifecycle.acceptInitializationIssued === 'function');
  if (!hasTaskEditorLifecycle) {
    log.warn('Task Editor lifecycle unavailable; New and Load are disabled.');
  }

  ipcMain.on('task-editor-dirty-state', (event, payload) => {
    if (!hasTaskEditorLifecycle) {
      log.warn('task-editor-dirty-state ignored because Task Editor lifecycle is unavailable.');
      return;
    }
    taskEditorLifecycle.acceptDirtyState(event, payload);
  });

  // =============================================================================
  // IPC: open Task Editor (new/load)
  // =============================================================================
  ipcMain.handle('open-task-editor', async (event, payload) => {
    try {
      const mainWin = resolveMainWin();
      if (
        !isAuthorizedSender(
          event,
          mainWin,
          'open-task-editor unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      if (typeof ensureTaskEditorWindow !== 'function') {
        log.warn('open-task-editor unavailable: ensureTaskEditorWindow missing.');
        return { ok: false, code: 'UNAVAILABLE' };
      }

      if (!isPlainObject(payload) || (payload.mode !== 'new' && payload.mode !== 'load')) {
        log.warn('open-task-editor received invalid mode payload:', payload);
        return { ok: false, code: 'INVALID_REQUEST' };
      }
      const { mode } = payload;

      if (mode === 'new') {
        if (!hasTaskEditorLifecycle) {
          return { ok: false, code: 'UNAVAILABLE' };
        }
        const allowDiscard = await taskEditorLifecycle.confirmReplacement(mainWin);
        if (!allowDiscard) return { ok: false, code: 'CONFIRM_DENIED' };
        ensureTaskEditorWindow();
        const taskEditorWin = resolveTaskEditorWin();
        const now = new Date().toISOString();
        const didSendInit = sendTaskEditorInit(taskEditorWin, {
          mode: 'new',
          task: {
            type: TASK_TYPE,
            meta: {
              name: '',
              createdAt: now,
              updatedAt: now,
              savedWith: TASK_SAVED_WITH,
            },
            rows: [],
          },
          sourcePath: null,
        }, taskEditorLifecycle);
        if (!didSendInit) {
          return { ok: false, code: 'UNAVAILABLE' };
        }
        return { ok: true };
      }

      // Load mode only accepts JSON files inside the managed tasks root.
      const root = ensureTasksRoot();
      if (!root) {
        return { ok: false, code: 'READ_FAILED', message: 'tasks root unavailable' };
      }
      const rootRealRes = resolveRealpath(root);
      if (!rootRealRes.ok) {
        log.error('open-task-editor failed to canonicalize tasks root:', rootRealRes.error);
        return { ok: false, code: 'READ_FAILED', message: 'tasks root realpath failed' };
      }
      const rootReal = rootRealRes.path;

      const dialogRes = await dialog.showOpenDialog(resolveMainWin(), {
        defaultPath: root,
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });

      if (!dialogRes) {
        log.error('open-task-editor file picker returned no result; treating as cancelled.');
        return { ok: false, code: 'CANCELLED' };
      }
      if (typeof dialogRes.canceled !== 'boolean') {
        log.error('open-task-editor file picker returned an invalid canceled flag:', dialogRes);
      }
      if (dialogRes.canceled) {
        return { ok: false, code: 'CANCELLED' };
      }
      if (!Array.isArray(dialogRes.filePaths) || !dialogRes.filePaths.length) {
        log.error('open-task-editor file picker returned invalid filePaths; treating as cancelled.', dialogRes);
        return { ok: false, code: 'CANCELLED' };
      }

      const selectedPath = dialogRes.filePaths[0];
      if (typeof selectedPath !== 'string' || !selectedPath.trim()) {
        log.error('open-task-editor file picker returned invalid file path:', dialogRes);
        return { ok: false, code: 'READ_FAILED', message: 'task list file picker returned invalid file path' };
      }
      const selectedRealRes = resolveRealpath(selectedPath);
      if (!selectedRealRes.ok) {
        log.error('open-task-editor failed to canonicalize selected task list:', selectedRealRes.error);
        return { ok: false, code: 'READ_FAILED', message: 'task list realpath failed' };
      }
      const selectedReal = selectedRealRes.path;
      if (!isPathInsideRoot(rootReal, selectedReal)) {
        log.warn('open-task-editor rejected selected path outside managed tasks root:', selectedReal);
        return { ok: false, code: 'PATH_OUTSIDE_TASKS' };
      }

      const jsonRes = readJsonFile(selectedReal);
      if (!jsonRes.ok) {
        if (jsonRes.code === 'READ_FAILED') {
          log.error('Task list read failed; loading aborted:', jsonRes.error);
        } else if (jsonRes.code === 'NOT_FOUND') {
          log.error('Task list disappeared before it could be read; loading aborted.');
        } else {
          log.warn('Task list JSON invalid; loading rejected.', jsonRes.error);
        }
        return { ok: false, code: jsonRes.code || 'INVALID_JSON' };
      }
      const normalized = normalizeTaskList(jsonRes.data);
      if (!normalized.ok) {
        log.warn('Task list schema invalid; loading rejected.', { code: normalized.code });
        return { ok: false, code: normalized.code || 'INVALID_SCHEMA', message: normalized.message };
      }

      if (!hasTaskEditorLifecycle) {
        return { ok: false, code: 'UNAVAILABLE' };
      }

      const allowDiscard = await taskEditorLifecycle.confirmReplacement(mainWin);
      if (!allowDiscard) return { ok: false, code: 'CONFIRM_DENIED' };

      ensureTaskEditorWindow();
      const taskEditorWin = resolveTaskEditorWin();
      const didSendInit = sendTaskEditorInit(taskEditorWin, {
        mode: 'load',
        task: normalized.task,
        sourcePath: selectedReal,
      }, taskEditorLifecycle);
      if (!didSendInit) {
        return { ok: false, code: 'UNAVAILABLE' };
      }
      return { ok: true };
    } catch (err) {
      log.error('Error processing open-task-editor:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });

  // =============================================================================
  // IPC: task list save/delete
  // =============================================================================
  ipcMain.handle('task-list-save', async (event, payload) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-list-save unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      const root = ensureTasksRoot();
      if (!root) return { ok: false, code: 'WRITE_FAILED', message: 'tasks root unavailable' };
      const rootRealRes = resolveRealpath(root);
      if (!rootRealRes.ok) {
        log.error('task-list-save failed to canonicalize tasks root:', rootRealRes.error);
        return { ok: false, code: 'WRITE_FAILED', message: 'tasks root realpath failed' };
      }
      const rootReal = rootRealRes.path;

      const rowsRaw = payload && Array.isArray(payload.rows) ? payload.rows : null;
      if (!rowsRaw) {
        log.warn('task-list-save received invalid rows payload.');
        return { ok: false, code: 'INVALID_SCHEMA' };
      }
      if (rowsRaw.length > TASK_LIST_MAX_ROWS) {
        log.warn('task-list-save rejected rows exceeding TASK_LIST_MAX_ROWS.', {
          count: rowsRaw.length,
          limit: TASK_LIST_MAX_ROWS,
        });
        return { ok: false, code: 'ROWS_TOO_MANY' };
      }

      const rowsRes = normalizeTaskRows(rowsRaw);
      if (!rowsRes.ok) {
        log.warn('task-list-save rejected invalid task rows.', { code: rowsRes.code });
        return { ok: false, code: 'INVALID_SCHEMA', message: rowsRes.code };
      }

      const metaRes = normalizeTaskMeta(payload.meta);
      if (!metaRes.ok) {
        log.warn('task-list-save rejected invalid task metadata.', { code: metaRes.code });
        return { ok: false, code: metaRes.code, message: metaRes.code };
      }

      const summaryRes = taskDurationUtils.deriveTaskSummary(rowsRes.rows);
      if (!summaryRes.ok) {
        log.warn('task-list-save rejected task rows with an invalid summary.', { code: summaryRes.code });
        return { ok: false, code: 'INVALID_SCHEMA', message: summaryRes.code };
      }

      const defaultName = getDefaultTaskFileName(root, metaRes.meta.name);
      const defaultPath = path.join(root, defaultName);
      const dialogOptions = {
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['showOverwriteConfirmation'],
      };
      let selectedPath = null;

      while (!selectedPath) {
        const dialogRes = await dialog.showSaveDialog(taskEditorWin || null, dialogOptions);

        if (!dialogRes) {
          log.error('task-list-save file picker returned no result; treating as cancelled.');
          return { ok: false, code: 'CANCELLED' };
        }
        if (typeof dialogRes.canceled !== 'boolean') {
          log.error('task-list-save file picker returned an invalid canceled flag:', dialogRes);
        }
        if (dialogRes.canceled) {
          return { ok: false, code: 'CANCELLED' };
        }
        if (typeof dialogRes.filePath !== 'string' || !dialogRes.filePath.trim()) {
          log.error('task-list-save file picker returned invalid file path:', dialogRes);
          return { ok: false, code: 'WRITE_FAILED', message: 'task list file picker returned invalid file path' };
        }

        const fileName = path.basename(dialogRes.filePath);
        if (path.extname(fileName) !== TASK_EXT || fileName === TASK_EXT) {
          const dialogTexts = getDialogTexts();
          await dialog.showMessageBox(taskEditorWin || null, {
            type: 'warning',
            buttons: [resolveDialogText(dialogTexts, 'ok')],
            defaultId: 0,
            cancelId: 0,
            message: resolveDialogText(dialogTexts, 'task_list_invalid_filename'),
          });
          continue;
        }

        selectedPath = dialogRes.filePath;
      }

      const candidateResolved = path.resolve(selectedPath);
      const parentDir = path.dirname(candidateResolved);
      const parentRealRes = fs.existsSync(parentDir) ? resolveRealpath(parentDir) : null;
      const parentReal = parentRealRes && parentRealRes.ok ? parentRealRes.path : null;
      const parentCanonicalizationFailed = parentRealRes && !parentRealRes.ok;

      if (parentCanonicalizationFailed) {
        log.error(
          'task-list-save failed to canonicalize destination parent:',
          parentRealRes.error
        );
      }

      if (!isPathInsideRoot(rootReal, candidateResolved)) {
        log.warn('task-list-save rejected destination outside managed tasks root:', candidateResolved);
        return { ok: false, code: 'PATH_OUTSIDE_TASKS' };
      }
      if (parentCanonicalizationFailed) {
        return { ok: false, code: 'WRITE_FAILED' };
      }
      if (parentReal && !isPathInsideRoot(rootReal, parentReal)) {
        log.warn('task-list-save rejected destination parent outside managed tasks root:', parentReal);
        return { ok: false, code: 'PATH_OUTSIDE_TASKS' };
      }

      const destinationEntryRes = inspectPathEntry(candidateResolved);
      if (!destinationEntryRes.ok) {
        log.error('task-list-save failed to inspect destination entry:', destinationEntryRes.error);
        return { ok: false, code: 'WRITE_FAILED' };
      }

      let writePath = candidateResolved;
      if (destinationEntryRes.exists) {
        const destinationRealRes = resolveRealpath(candidateResolved);
        if (!destinationRealRes.ok) {
          log.error(
            'task-list-save failed to canonicalize existing destination:',
            destinationRealRes.error
          );
          return { ok: false, code: 'WRITE_FAILED' };
        }
        if (!isPathInsideRoot(rootReal, destinationRealRes.path)) {
          log.warn(
            'task-list-save rejected existing destination outside managed tasks root:',
            destinationRealRes.path
          );
          return { ok: false, code: 'PATH_OUTSIDE_TASKS' };
        }
        writePath = destinationRealRes.path;
      } else if (!parentReal) {
        log.error('task-list-save failed because destination parent is missing:', parentDir);
        return { ok: false, code: 'WRITE_FAILED' };
      }

      const taskData = {
        type: TASK_TYPE,
        meta: metaRes.meta,
        ...(summaryRes.summary ? { summary: summaryRes.summary } : {}),
        rows: rowsRes.rows,
      };
      if (destinationEntryRes.exists) {
        saveJsonStrict(writePath, taskData);
      } else {
        createJsonStrict(writePath, taskData);
      }

      return { ok: true, path: writePath, meta: taskData.meta };
    } catch (err) {
      log.error('task-list-save failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-list-delete', async (event, payload) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-list-delete unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      if (!isPlainObject(payload) || typeof payload.path !== 'string' || !payload.path) {
        log.warn('task-list-delete received invalid path payload:', payload);
        return { ok: false, code: 'INVALID_REQUEST' };
      }
      const target = payload.path;

      const root = ensureTasksRoot();
      if (!root) return { ok: false, code: 'WRITE_FAILED' };
      const rootRealRes = resolveRealpath(root);
      if (!rootRealRes.ok) {
        log.error('task-list-delete failed to canonicalize tasks root:', rootRealRes.error);
        return { ok: false, code: 'WRITE_FAILED' };
      }
      const targetRealRes = resolveRealpath(target);
      if (!targetRealRes.ok) {
        log.error('task-list-delete failed to canonicalize target path:', targetRealRes.error);
        return { ok: false, code: 'WRITE_FAILED' };
      }
      const rootReal = rootRealRes.path;
      const targetReal = targetRealRes.path;
      if (!isPathInsideRoot(rootReal, targetReal)) {
        log.warn('task-list-delete rejected path outside managed tasks root:', targetReal);
        return { ok: false, code: 'PATH_OUTSIDE_TASKS' };
      }

      const dialogRes = await showContinueCancelDialog(taskEditorWin, {
        messageKey: 'task_delete_confirm',
        messageReplacements: { name: path.basename(targetReal) },
      });
      if (!dialogRes || (dialogRes.response !== 0 && dialogRes.response !== 1)) {
        log.error('task-list-delete confirmation dialog returned invalid result; treating as denied.', dialogRes);
        return { ok: false, code: 'CONFIRM_DENIED' };
      }
      if (dialogRes.response !== 0) {
        return { ok: false, code: 'CONFIRM_DENIED' };
      }

      fs.unlinkSync(targetReal);
      return { ok: true };
    } catch (err) {
      log.error('task-list-delete failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  // =============================================================================
  // IPC: task library list/save/delete
  // =============================================================================
  ipcMain.handle('task-library-list', async (event) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-library-list unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      ensureTasksDirs();
      const res = loadLibraryData();
      if (!res.ok) return { ok: false, code: res.code };

      const items = res.items.slice().sort((a, b) => (
        normalizeTexto(a.texto).localeCompare(normalizeTexto(b.texto))
      ));
      return { ok: true, items };
    } catch (err) {
      log.error('task-library-list failed:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-library-save', async (event, payload) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-library-save unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      if (!hasExactKeys(payload, TASK_LIBRARY_SAVE_PAYLOAD_KEYS)) {
        log.warn('task-library-save received invalid payload.');
        return { ok: false, code: 'INVALID_SCHEMA', message: 'INVALID_LIBRARY_SAVE_PAYLOAD' };
      }
      const resEntry = validateLibraryEntry(payload.entry);
      if (!resEntry.ok) {
        log.warn('task-library-save rejected invalid library entry.', { code: resEntry.code });
        return { ok: false, code: 'INVALID_SCHEMA', message: resEntry.code };
      }

      ensureTasksDirs();
      const res = loadLibraryData();
      if (!res.ok) return { ok: false, code: res.code };

      const items = res.items;
      const norm = normalizeTexto(resEntry.entry.texto);
      const existingIdx = items.findIndex((it) => normalizeTexto(it.texto) === norm);

      if (existingIdx >= 0) {
        const dialogRes = await showContinueCancelDialog(taskEditorWin, {
          messageKey: 'task_library_row_save_overwrite',
          messageReplacements: { name: resEntry.entry.texto },
        });
        if (!dialogRes || (dialogRes.response !== 0 && dialogRes.response !== 1)) {
          log.error('task-library-save overwrite dialog returned invalid result; treating as denied.', dialogRes);
          return { ok: false, code: 'CONFIRM_DENIED' };
        }
        if (dialogRes.response !== 0) {
          return { ok: false, code: 'CONFIRM_DENIED' };
        }
        items.splice(existingIdx, 1, resEntry.entry);
      } else if (items.length >= TASK_LIBRARY_MAX_ITEMS) {
        return { ok: false, code: 'LIBRARY_TOO_LARGE' };
      } else {
        items.push(resEntry.entry);
      }

      items.sort((a, b) => normalizeTexto(a.texto).localeCompare(normalizeTexto(b.texto)));
      saveLibraryData(items);
      return { ok: true };
    } catch (err) {
      log.error('task-library-save failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-library-delete', async (event, payload) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-library-delete unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      ensureTasksDirs();
      if (!isPlainObject(payload)
        || typeof payload.texto !== 'string'
        || !payload.texto
        || payload.texto !== payload.texto.trim()) {
        log.warn('task-library-delete received invalid texto payload:', payload);
        return { ok: false, code: 'INVALID_REQUEST' };
      }
      const texto = payload.texto;

      const res = loadLibraryData();
      if (!res.ok) return { ok: false, code: res.code };

      const items = res.items;
      const norm = normalizeTexto(texto);
      const idx = items.findIndex((it) => normalizeTexto(it.texto) === norm);
      if (idx < 0) return { ok: false, code: 'NOT_FOUND' };

      const dialogRes = await showContinueCancelDialog(taskEditorWin, {
        messageKey: 'task_library_row_delete',
        messageReplacements: { name: items[idx].texto },
      });
      if (!dialogRes || (dialogRes.response !== 0 && dialogRes.response !== 1)) {
        log.error('task-library-delete confirmation dialog returned invalid result; treating as denied.', dialogRes);
        return { ok: false, code: 'CONFIRM_DENIED' };
      }
      if (dialogRes.response !== 0) {
        return { ok: false, code: 'CONFIRM_DENIED' };
      }

      items.splice(idx, 1);
      saveLibraryData(items);
      return { ok: true };
    } catch (err) {
      log.error('task-library-delete failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  // =============================================================================
  // IPC: task column widths load/save
  // =============================================================================
  ipcMain.handle('task-columns-load', async (event) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-columns-load unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      ensureTasksDirs();
      const file = getTasksColumnWidthsFile();
      const res = readJsonFile(file);
      if (!res.ok) {
        if (res.code === 'NOT_FOUND') {
          log.warn('task column widths missing; returning null. (NOTE: may be normal; fresh layouts are persisted after initialization)');
          return { ok: true, record: null };
        }
        if (res.code === 'INVALID_JSON') {
          log.warn('Task column layout JSON invalid; returning fresh-default signal.');
          return { ok: true, record: null };
        }
        log.warn('Task column layout read failed:', res.error);
        return { ok: false, code: 'READ_FAILED' };
      }
      const record = validateColumnLayoutRecord(res.data);
      if (!record) {
        log.warn('Task column layout schema invalid; returning fresh-default signal.');
        return { ok: true, record: null };
      }
      return { ok: true, record };
    } catch (err) {
      log.warn('task-columns-load failed:', err);
      return { ok: false, code: 'READ_FAILED' };
    }
  });

  ipcMain.handle('task-columns-save', async (event, payload) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-columns-save unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      ensureTasksDirs();
      const record = validateColumnLayoutRecord(payload && payload.record ? payload.record : null);
      if (!record) {
        log.warn('task-columns-save received invalid column layout payload.');
        return { ok: false, code: 'INVALID_SCHEMA' };
      }
      const file = getTasksColumnWidthsFile();
      saveJsonStrict(file, record);
      return { ok: true };
    } catch (err) {
      log.warn('task-columns-save failed:', err);
      return { ok: false, code: 'WRITE_FAILED' };
    }
  });

  // =============================================================================
  // IPC: select local file(s) for task rows
  // =============================================================================
  ipcMain.handle('task-file-select', async (event) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-file-select unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      const res = await promptForTaskFileSelection(taskEditorWin, { allowMultiple: false });
      if (!res.ok) {
        if (res.code === 'READ_FAILED') {
          log.error('task-file-select returned invalid filePaths.');
        }
        return res;
      }
      return { ok: true, filePath: res.filePaths[0] };
    } catch (err) {
      log.error('task-file-select failed:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-files-select', async (event) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-files-select unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      const res = await promptForTaskFileSelection(taskEditorWin, { allowMultiple: true });
      if (!res.ok) {
        if (res.code === 'READ_FAILED') {
          log.error('task-files-select returned invalid filePaths.');
        }
        return res;
      }
      return res;
    } catch (err) {
      log.error('task-files-select failed:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });

  // =============================================================================
  // IPC: open task link (path or https)
  // =============================================================================
  ipcMain.handle('task-open-link', async (event, payload) => {
    try {
      const taskEditorWin = resolveAuthorizedTaskEditorWin(
        event,
        'task-open-link unauthorized (ignored).'
      );
      if (!taskEditorWin) return { ok: false, code: 'UNAUTHORIZED' };

      const raw = payload && typeof payload.raw === 'string' ? payload.raw.trim() : '';
      if (!raw) return { ok: false, code: 'LINK_BLOCKED' };

      const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\');
      const isPosixPath = path.posix.isAbsolute(raw);
      const looksLikePath = isWindowsPath || isPosixPath;

      if (looksLikePath) {
        if (!fs.existsSync(raw)) {
          return { ok: false, code: 'LINK_MISSING' };
        }
        const stats = fs.statSync(raw);
        if (!stats.isFile()) {
          return { ok: false, code: 'LINK_BLOCKED' };
        }

        const dialogRes = await showContinueCancelDialog(taskEditorWin, {
          messageKey: 'task_path_confirm',
          messageReplacements: { path: raw },
        });
        if (!dialogRes || (dialogRes.response !== 0 && dialogRes.response !== 1)) {
          log.error('task-open-link confirmation dialog returned invalid result; treating as denied.', dialogRes);
          return { ok: false, code: 'CONFIRM_DENIED' };
        }
        if (dialogRes.response !== 0) {
          return { ok: false, code: 'CONFIRM_DENIED' };
        }

        const openRes = await shell.openPath(raw);
        if (openRes) {
          log.warn('task-open-link openPath failed:', openRes);
          return { ok: false, code: 'OPEN_FAILED' };
        }
        return { ok: true };
      }

      // Non-path links are treated as URLs, and only https: is allowed.
      let parsed = null;
      try {
        parsed = new URL(raw);
      } catch {
        parsed = null;
      }

      if (!parsed || parsed.protocol !== 'https:') {
        return { ok: false, code: 'LINK_BLOCKED' };
      }

      const host = parsed.hostname.toLowerCase();
      const allowlist = loadAllowedHosts();

      if (!allowlist.has(host)) {
        const parsedUrl = parsed.toString();
        const dialogTexts = getDialogTexts();
        const continueLabel = resolveDialogText(dialogTexts, 'continue_button');
        const cancelLabel = resolveDialogText(dialogTexts, 'cancel_button');
        let message = resolveDialogText(dialogTexts, 'task_link_confirm');
        message = message.replace('{url}', parsedUrl);
        const checkboxLabel = resolveDialogText(dialogTexts, 'task_link_trust_host');

        const dialogRes = await dialog.showMessageBox(taskEditorWin || null, {
          type: 'none',
          buttons: [continueLabel, cancelLabel],
          defaultId: 1,
          cancelId: 1,
          message,
          detail: parsedUrl,
          checkboxLabel,
          checkboxChecked: false,
        });
        if (!dialogRes || (dialogRes.response !== 0 && dialogRes.response !== 1)) {
          log.error('task-open-link trust dialog returned invalid result; treating as denied.', dialogRes);
          return { ok: false, code: 'CONFIRM_DENIED' };
        }
        if (dialogRes.response !== 0) {
          return { ok: false, code: 'CONFIRM_DENIED' };
        }
        if (typeof dialogRes.checkboxChecked !== 'boolean') {
          log.error('task-open-link trust dialog returned invalid checkboxChecked value:', dialogRes);
        }
        if (dialogRes.checkboxChecked) {
          allowlist.add(host);
          saveAllowedHosts(allowlist);
        }
      }

      await shell.openExternal(parsed.toString());
      return { ok: true };
    } catch (err) {
      log.error('task-open-link failed:', err);
      return { ok: false, code: 'ERROR', message: String(err) };
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
// End of electron/tasks_main.js
// =============================================================================
