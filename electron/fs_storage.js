// electron/fs_storage.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process file system storage helpers.
// Responsibilities:
// - Initialize the config root under app.getPath('userData') once Electron is ready.
// - Resolve stable paths for settings, current text, editor state, presets, current-text snapshots, task files, and import/extract + OCR storage.
// - Ensure required storage directories exist before reads and writes.
// - Read and write small JSON files with recoverable fallback handling.
// - Stay synchronous because it is used only from the Electron main process.

// =============================================================================
// Imports / logger
// =============================================================================

const fs = require('fs');
const path = require('path');
const Log = require('./log');

const log = Log.get('fs-storage');
log.debug('FS storage starting...');

// =============================================================================
// Shared state
// =============================================================================

let CONFIG_DIR = null;
let APP_ROOT_DIR = null;

const ENSURE_DIR_OPTIONS = { recursive: true };

// =============================================================================
// Storage initialization
// =============================================================================

function initStorage(app) {
  if (!app || typeof app.getPath !== 'function') {
    throw new Error('[fs_storage] initStorage requires Electron app');
  }
  if (typeof app.isReady === 'function' && !app.isReady()) {
    throw new Error('[fs_storage] initStorage called before app is ready');
  }

  CONFIG_DIR = path.join(app.getPath('userData'), 'config');
  APP_ROOT_DIR = app.getAppPath();
}

function getConfigDir() {
  if (!CONFIG_DIR) {
    throw new Error('[fs_storage] CONFIG_DIR is not initialized');
  }
  return CONFIG_DIR;
}

function getAppRootDir() {
  if (!APP_ROOT_DIR) {
    throw new Error('[fs_storage] APP_ROOT_DIR is not initialized');
  }
  return APP_ROOT_DIR;
}

// =============================================================================
// Path helpers: core config files
// =============================================================================

function getConfigPresetsDir() {
  return path.join(getConfigDir(), 'presets_defaults');
}

function getCurrentTextSnapshotsDir() {
  return path.join(getConfigDir(), 'saved_current_texts');
}

function getSettingsFile() {
  return path.join(getConfigDir(), 'user_settings.json');
}

function getCurrentTextFile() {
  return path.join(getConfigDir(), 'current_text.json');
}

function getEditorStateFile() {
  return path.join(getConfigDir(), 'editor_state.json');
}

// =============================================================================
// Path helpers: tasks
// =============================================================================

function getTasksDir() {
  return path.join(getConfigDir(), 'tasks');
}

function getTasksListsDir() {
  return path.join(getTasksDir(), 'lists');
}

function getTasksLibraryFile() {
  return path.join(getTasksDir(), 'library.json');
}

function getTasksAllowedHostsFile() {
  return path.join(getTasksDir(), 'allowed_hosts.json');
}

function getTasksColumnWidthsFile() {
  return path.join(getTasksDir(), 'column_widths.json');
}

function getTaskEditorPositionFile() {
  return path.join(getTasksDir(), 'task_editor_position.json');
}

// =============================================================================
// Path helpers: import/extract + OCR
// =============================================================================

function getImportExtractStateFile() {
  return path.join(getConfigDir(), 'import_extract_state.json');
}

function getOcrGoogleDriveDir() {
  return path.join(getConfigDir(), 'ocr_google_drive');
}

function getOcrGoogleDriveCredentialsFile() {
  return path.join(getOcrGoogleDriveDir(), 'credentials.json');
}

function getOcrGoogleDriveTokenFile() {
  return path.join(getOcrGoogleDriveDir(), 'token.json');
}

function getBundledOcrGoogleDriveCredentialsFile() {
  return path.join(getAppRootDir(), 'electron', 'assets', 'ocr_google_drive', 'credentials.json');
}

// =============================================================================
// Directory ensure helpers
// =============================================================================

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, ENSURE_DIR_OPTIONS);
  }
}

function ensureConfigDir() {
  try {
    const dir = getConfigDir();
    ensureDirExists(dir);
  } catch (err) {
    log.error('ensureConfigDir failed:', CONFIG_DIR || '(uninitialized)', err);
  }
}

function ensureConfigPresetsDir() {
  let presetsDir = null;
  try {
    presetsDir = getConfigPresetsDir();
    ensureDirExists(presetsDir);
  } catch (err) {
    log.error('ensureConfigPresetsDir failed:', presetsDir || '(uninitialized)', err);
  }
}

function ensureCurrentTextSnapshotsDir() {
  let snapshotsDir = null;
  try {
    snapshotsDir = getCurrentTextSnapshotsDir();
    ensureDirExists(snapshotsDir);
  } catch (err) {
    log.error('ensureCurrentTextSnapshotsDir failed:', snapshotsDir || '(uninitialized)', err);
  }
}

function ensureTasksDirs() {
  let tasksDir = null;
  let listsDir = null;
  try {
    tasksDir = getTasksDir();
    listsDir = getTasksListsDir();
    ensureDirExists(tasksDir);
    ensureDirExists(listsDir);
  } catch (err) {
    log.error('ensureTasksDirs failed:', tasksDir || '(uninitialized)', listsDir || '(uninitialized)', err);
  }
}

function ensureOcrGoogleDriveDir() {
  let ocrDir = null;
  try {
    ocrDir = getOcrGoogleDriveDir();
    ensureDirExists(ocrDir);
  } catch (err) {
    log.error('ensureOcrGoogleDriveDir failed:', ocrDir || '(uninitialized)', err);
  }
}

// =============================================================================
// JSON helpers
// =============================================================================

const LOAD_JSON_FILE_METADATA = Object.freeze({
  'current_text.json': {
    missingNote: ' (note: may be normal on first run; file is created on quit)',
  },
  'user_settings.json': {
    missingNote: ' (note: may be normal on first run; file is created during startup)',
  },
  'editor_state.json': {
    missingNote: ' (note: may be normal on first run; file is created when editor window is opened for the first time)',
  },
  'task_editor_position.json': {
    missingNote: ' (note: may be normal on first run; file is created after the task editor window is opened and position is saved)',
  },
});

const LOAD_JSON_KNOWN_FILES = new Set(Object.keys(LOAD_JSON_FILE_METADATA));

function getLoadJsonOnceKey(kind, filePath) {
  const baseName = path.basename(String(filePath));
  const variant = LOAD_JSON_KNOWN_FILES.has(baseName) ? baseName : 'other';
  return `fs_storage.loadJson.${kind}.${variant}`;
}

function getLoadJsonMissingNote(filePath) {
  const baseName = path.basename(String(filePath));
  const metadata = LOAD_JSON_FILE_METADATA[baseName];
  return metadata ? metadata.missingNote : '';
}

function loadJson(filePath, fallback = {}) {
  try {
    // Missing file is recoverable: callers decide what the fallback should be.
    if (!fs.existsSync(filePath)) {
      log.warnOnce(
        getLoadJsonOnceKey('missing', filePath),
        `loadJson missing (using fallback):${getLoadJsonMissingNote(filePath)}`,
        filePath
      );
      return fallback;
    }

    let raw = fs.readFileSync(filePath, 'utf8');

    // Remove UTF-8 BOM if present (some editors add it and JSON.parse may fail).
    raw = raw.replace(/^\uFEFF/, '');

    // Empty/whitespace-only file is treated as invalid JSON (recoverable).
    if (raw.trim() === '') {
      log.warnOnce(
        getLoadJsonOnceKey('empty', filePath),
        'loadJson empty file (using fallback):',
        filePath
      );
      return fallback;
    }

    return JSON.parse(raw);
  } catch (err) {
    // Invalid JSON is recoverable: return fallback and continue running.
    log.warnOnce(
      getLoadJsonOnceKey('failed', filePath),
      'loadJson failed (using fallback):',
      filePath,
      err
    );
    return fallback;
  }
}

function saveJson(filePath, obj) {
  try {
    // Ensure the parent folder exists so callers do not depend on init ordering.
    const parentDir = path.dirname(filePath);
    ensureDirExists(parentDir);

    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    log.error('saveJson failed:', filePath, err);
  }
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  initStorage,
  getConfigDir,
  getAppRootDir,

  getConfigPresetsDir,
  getCurrentTextSnapshotsDir,
  getSettingsFile,
  getCurrentTextFile,
  getEditorStateFile,

  getTasksDir,
  getTasksListsDir,
  getTasksLibraryFile,
  getTasksAllowedHostsFile,
  getTasksColumnWidthsFile,
  getTaskEditorPositionFile,

  getImportExtractStateFile,
  getOcrGoogleDriveDir,
  getOcrGoogleDriveCredentialsFile,
  getOcrGoogleDriveTokenFile,
  getBundledOcrGoogleDriveCredentialsFile,

  ensureConfigDir,
  ensureConfigPresetsDir,
  ensureCurrentTextSnapshotsDir,
  ensureTasksDirs,
  ensureOcrGoogleDriveDir,

  loadJson,
  saveJson,
};

// =============================================================================
// End of electron/fs_storage.js
// =============================================================================
