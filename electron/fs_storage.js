// electron/fs_storage.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process file system storage helpers.
// Responsibilities:
// - Initialize the config root under app.getPath('userData') once Electron is ready.
// - Resolve stable paths for settings, current text, Text Editor state, presets, current-text snapshots, task files, and text extraction + OCR storage.
// - Ensure required storage directories exist before reads and writes.
// - Read small JSON files with recoverable fallback handling.
// - Write small JSON files through either a best-effort or strict contract.
// - Stay synchronous because it is used only from the Electron main process.

// =============================================================================
// Imports / logger
// =============================================================================

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const Log = require('./log');

const log = Log.get('fs-storage');

// =============================================================================
// Constants / configuration
// =============================================================================

const ENSURE_DIR_OPTIONS = { recursive: true };
const FILE_PERMISSION_BITS = 0o777;
const SPECIAL_PERMISSION_BITS = 0o7000;
const SETTINGS_BACKUP_FILE_PREFIX = 'user_settings.json.backup.';
const MAX_SETTINGS_BACKUPS = 3;

// =============================================================================
// Shared state
// =============================================================================

let configDir = null;
let appRootDir = null;

// =============================================================================
// Storage initialization
// =============================================================================

function initStorage(app) {
  if (!app || typeof app.getPath !== 'function') {
    throw new Error("[fs_storage] initStorage requires Electron app.getPath('userData')");
  }
  if (typeof app.getAppPath !== 'function') {
    throw new Error('[fs_storage] initStorage requires Electron app.getAppPath');
  }
  if (typeof app.isReady !== 'function') {
    throw new Error('[fs_storage] initStorage requires Electron app.isReady');
  }
  if (app.isReady() !== true) {
    throw new Error('[fs_storage] initStorage called before app is ready');
  }

  const userDataPath = app.getPath('userData');
  if (typeof userDataPath !== 'string' || userDataPath.length === 0) {
    throw new Error("[fs_storage] initStorage app.getPath('userData') returned invalid path");
  }

  const resolvedAppRootDir = app.getAppPath();
  if (typeof resolvedAppRootDir !== 'string' || resolvedAppRootDir.length === 0) {
    throw new Error('[fs_storage] initStorage app.getAppPath() returned invalid path');
  }

  configDir = path.join(userDataPath, 'config');
  appRootDir = resolvedAppRootDir;
}

function getConfigDir() {
  if (!configDir) {
    throw new Error('[fs_storage] CONFIG_DIR is not initialized');
  }
  return configDir;
}

function getAppRootDir() {
  if (!appRootDir) {
    throw new Error('[fs_storage] APP_ROOT_DIR is not initialized');
  }
  return appRootDir;
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

function getSnapshotTagsFile() {
  return path.join(getConfigDir(), 'snapshot_tags.json');
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

function getTaskEditorStateFile() {
  return path.join(getConfigDir(), 'task_editor_state.json');
}

function getTaskFilePickerStateFile() {
  return path.join(getTasksDir(), 'task_file_picker_state.json');
}

// =============================================================================
// Path helpers: text extraction + OCR
// =============================================================================

function getTextExtractionStateFile() {
  return path.join(getConfigDir(), 'text_extraction_state.json');
}

function getReadingTestPoolImportStateFile() {
  return path.join(getConfigDir(), 'reading_test_pool_import_state.json');
}

function getReadingTestPoolStateFile() {
  return path.join(getConfigDir(), 'reading_test_pool_state.json');
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
  } catch (error) {
    log.error('ensureConfigDir failed:', configDir || '(uninitialized)', error);
  }
}

function ensureConfigPresetsDir() {
  let presetsDir = null;
  try {
    presetsDir = getConfigPresetsDir();
    ensureDirExists(presetsDir);
  } catch (error) {
    log.error('ensureConfigPresetsDir failed:', presetsDir || '(uninitialized)', error);
  }
}

function ensureCurrentTextSnapshotsDir() {
  let snapshotsDir = null;
  try {
    snapshotsDir = getCurrentTextSnapshotsDir();
    ensureDirExists(snapshotsDir);
  } catch (error) {
    log.error('ensureCurrentTextSnapshotsDir failed:', snapshotsDir || '(uninitialized)', error);
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
  } catch (error) {
    log.error('ensureTasksDirs failed:', tasksDir || '(uninitialized)', listsDir || '(uninitialized)', error);
  }
}

function ensureOcrGoogleDriveDir() {
  let ocrDir = null;
  try {
    ocrDir = getOcrGoogleDriveDir();
    ensureDirExists(ocrDir);
  } catch (error) {
    log.error('ensureOcrGoogleDriveDir failed:', ocrDir || '(uninitialized)', error);
  }
}

// =============================================================================
// JSON helpers
// =============================================================================

const LOAD_JSON_FILE_METADATA = Object.freeze({
  'current_text.json': {
    missingNote: ' (NOTE: may be normal; file is created on quit)',
  },
  'user_settings.json': {
    missingNote: ' (NOTE: may be normal; file is created during startup)',
  },
  'snapshot_tags.json': {
    missingNote: ' (NOTE: may be normal; file is created during startup)',
  },
  'editor_state.json': {
    missingNote: ' (NOTE: may be normal; file is created when the Text Editor window is first opened)',
  },
  'task_editor_state.json': {
    missingNote: ' (NOTE: may be normal; file is created after the Task Editor window is opened and window state is saved)',
  },
  'task_file_picker_state.json': {
    missingNote: ' (NOTE: may be normal; file is created after the first Task Editor file selection)',
  },
  'text_extraction_state.json': {
    missingNote: ' (NOTE: may be normal; file is created after the first text-extraction file selection)',
  },
  'reading_test_pool_import_state.json': {
    missingNote: ' (NOTE: may be normal; file is created after the first reading-test import file selection)',
  },
  'reading_test_pool_state.json': {
    missingNote: ' (NOTE: may be normal; file is initialized during the first reading-test pool synchronization)',
  },
});

function getLoadJsonMissingNote(filePath) {
  const baseName = path.basename(String(filePath));
  const metadata = LOAD_JSON_FILE_METADATA[baseName];
  return metadata ? metadata.missingNote : '';
}

function withRawJsonBytes(result, rawBytes, includeRawBytes) {
  if (!includeRawBytes || !rawBytes) return result;
  return { ...result, rawBytes };
}

function loadJsonWithStatus(filePath, fallback = {}, { includeRawBytes = false } = {}) {
  let rawBytes;
  try {
    rawBytes = fs.readFileSync(filePath);
  } catch (error) {
    // Missing file is recoverable: callers decide what the fallback should be.
    if (error && error.code === 'ENOENT') {
      log.warn(
        `loadJson missing (using fallback):${getLoadJsonMissingNote(filePath)}`,
        filePath
      );
      return { status: 'missing', value: fallback };
    }
    log.warn(
      'loadJson failed (using fallback):',
      filePath,
      error
    );
    return { status: 'failed', value: fallback };
  }

  // Remove UTF-8 BOM if present (some editors add it and JSON.parse may fail).
  const raw = rawBytes.toString('utf8').replace(/^\uFEFF/, '');

  // Empty/whitespace-only file is treated as invalid JSON (recoverable).
  if (raw.trim() === '') {
    log.warn(
      'loadJson empty file (using fallback):',
      filePath
    );
    return withRawJsonBytes({ status: 'empty', value: fallback }, rawBytes, includeRawBytes);
  }

  try {
    return withRawJsonBytes({ status: 'loaded', value: JSON.parse(raw) }, rawBytes, includeRawBytes);
  } catch (error) {
    log.warn(
      'loadJson failed (using fallback):',
      filePath,
      error
    );
    return withRawJsonBytes({ status: 'failed', value: fallback }, rawBytes, includeRawBytes);
  }
}

function loadJson(filePath, fallback = {}) {
  return loadJsonWithStatus(filePath, fallback).value;
}

function prepareJsonWrite(filePath, obj) {
  const parentDir = path.dirname(filePath);
  ensureDirExists(parentDir);
  return {
    parentDir,
    serialized: JSON.stringify(obj, null, 2),
  };
}

function writeSerializedJsonDirect(filePath, serialized) {
  fs.writeFileSync(filePath, serialized, 'utf8');
}

function writeJsonDirect(filePath, obj) {
  const { serialized } = prepareJsonWrite(filePath, obj);
  writeSerializedJsonDirect(filePath, serialized);
}

function getReplacementPermissionMode(filePath) {
  try {
    const destinationStats = fs.lstatSync(filePath);
    if (
      !destinationStats.isFile()
      || destinationStats.nlink !== 1
      || (destinationStats.mode & SPECIAL_PERMISSION_BITS) !== 0
    ) {
      return undefined;
    }
    return destinationStats.mode & FILE_PERMISSION_BITS;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function canCreateReplacementIn(parentDir) {
  try {
    fs.accessSync(parentDir, fs.constants.W_OK | fs.constants.X_OK);
    return true;
  } catch (error) {
    log.warn(
      'JSON replacement skipped; using direct write after temporary-file creation access check failed:',
      parentDir,
      error
    );
    return false;
  }
}

function verifyExistingFileIsWritable(filePath) {
  const destinationFileDescriptor = fs.openSync(filePath, 'r+');
  fs.closeSync(destinationFileDescriptor);
}

function cleanupTemporaryJsonFile(temporaryFilePath) {
  try {
    fs.unlinkSync(temporaryFilePath);
  } catch (error) {
    log.warn('JSON replacement temporary-file cleanup failed (ignored):', temporaryFilePath, error);
  }
}

function writeTemporaryJsonFile(temporaryFileDescriptor, serialized, temporaryFilePath) {
  let writeError = null;
  try {
    fs.writeFileSync(temporaryFileDescriptor, serialized, 'utf8');
  } catch (error) {
    writeError = error;
  }

  try {
    fs.closeSync(temporaryFileDescriptor);
  } catch (error) {
    if (writeError) {
      log.warn(
        'JSON replacement temporary-file close failed after write failure (ignored):',
        temporaryFilePath,
        error
      );
    } else {
      throw error;
    }
  }

  if (writeError) throw writeError;
}

// Replaces a regular, single-linked JSON record only after a complete sibling
// file has been written and closed. Other destination entries retain direct
// write semantics so their identity, metadata, and access behavior are not
// silently changed.
function writeJsonWithReplacement(filePath, obj) {
  const { parentDir, serialized } = prepareJsonWrite(filePath, obj);
  const replacementPermissionMode = getReplacementPermissionMode(filePath);

  if (replacementPermissionMode === undefined) {
    log.warn(
      'JSON replacement skipped; using direct write for a destination that cannot be safely replaced:',
      filePath
    );
    writeSerializedJsonDirect(filePath, serialized);
    return;
  }

  if (replacementPermissionMode !== null) {
    verifyExistingFileIsWritable(filePath);
    if (!canCreateReplacementIn(parentDir)) {
      writeSerializedJsonDirect(filePath, serialized);
      return;
    }
  }

  const temporaryFilePath = path.join(parentDir, `.tot-json-${randomUUID()}.tmp`);
  let temporaryFileExists = false;

  try {
    const temporaryFileDescriptor = replacementPermissionMode === null
      ? fs.openSync(temporaryFilePath, 'wx')
      : fs.openSync(temporaryFilePath, 'wx', replacementPermissionMode);
    temporaryFileExists = true;
    writeTemporaryJsonFile(temporaryFileDescriptor, serialized, temporaryFilePath);

    if (replacementPermissionMode !== null && process.platform !== 'win32') {
      fs.chmodSync(temporaryFilePath, replacementPermissionMode);
    }
    fs.renameSync(temporaryFilePath, filePath);
    temporaryFileExists = false;
  } finally {
    if (temporaryFileExists) {
      cleanupTemporaryJsonFile(temporaryFilePath);
    }
  }
}

// Best-effort JSON persistence for runtime/config state:
// - attempts a synchronous replacement write where the destination permits it;
// - logs internally on failure;
// - does not throw or return a success result.
function saveJson(filePath, obj) {
  try {
    writeJsonWithReplacement(filePath, obj);
  } catch (error) {
    log.warn('saveJson failed (ignored):', filePath, error);
  }
}

// Strict JSON persistence for explicit save flows:
// - uses the same parent-dir creation and replacement contract as saveJson(...);
// - does not suppress failures;
// - callers own catch/log/result mapping at the operation boundary.
function saveJsonStrict(filePath, obj) {
  writeJsonWithReplacement(filePath, obj);
}

// Direct JSON persistence is reserved for the high-frequency editor-state
// owners, whose geometry writes deliberately retain the previous mechanism.
function saveJsonDirect(filePath, obj) {
  try {
    writeJsonDirect(filePath, obj);
  } catch (error) {
    log.warn('saveJson failed (ignored):', filePath, error);
  }
}

function saveJsonDirectStrict(filePath, obj) {
  writeJsonDirect(filePath, obj);
}

// Strict JSON creation for flows that must never replace an entry that appeared after their preflight. By default, unlike saveJsonStrict(...), this does not create the parent directory and requests exclusive filesystem creation.
function createJsonStrict(filePath, obj, { ensureParent = false } = {}) {
  if (ensureParent) {
    ensureDirExists(path.dirname(filePath));
  }
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), {
    encoding: 'utf8',
    flag: 'wx',
  });
}

function getSettingsBackupGeneration(fileName) {
  if (!fileName.startsWith(SETTINGS_BACKUP_FILE_PREFIX)) return null;
  const rawGeneration = fileName.slice(SETTINGS_BACKUP_FILE_PREFIX.length);
  if (!/^(?:0|[1-9]\d*)$/.test(rawGeneration)) return null;
  return BigInt(rawGeneration);
}

function getSettingsBackupInventory(settingsFile) {
  const backupDir = path.dirname(settingsFile);
  const reservedGenerations = [];
  const backupEntries = [];
  for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
    const generation = getSettingsBackupGeneration(entry.name);
    if (generation === null) continue;
    reservedGenerations.push(generation);
    if (entry.isFile()) {
      backupEntries.push({
        generation,
        filePath: path.join(backupDir, entry.name),
      });
    }
  }
  return { reservedGenerations, backupEntries };
}

// Creates a byte-exact startup backup before settings normalization can rewrite an admitted file.
// Direct exclusive creation intentionally accepts that an abrupt interruption can leave an incomplete generation.
function createSettingsStartupBackup(settingsFile, originalBytes) {
  if (!Buffer.isBuffer(originalBytes)) {
    throw new TypeError('createSettingsStartupBackup requires original settings bytes');
  }

  const backupDir = path.dirname(settingsFile);
  const { reservedGenerations } = getSettingsBackupInventory(settingsFile);
  const highestReservedGeneration = reservedGenerations.reduce(
    (highest, generation) => (highest === null || generation > highest ? generation : highest),
    null
  );
  const nextReservedGeneration = highestReservedGeneration === null ? 1n : highestReservedGeneration + 1n;
  const backupPath = path.join(backupDir, `${SETTINGS_BACKUP_FILE_PREFIX}${nextReservedGeneration}`);

  fs.writeFileSync(backupPath, originalBytes, { flag: 'wx' });

  const { backupEntries } = getSettingsBackupInventory(settingsFile);
  backupEntries.sort((left, right) => (left.generation < right.generation ? -1 : 1));
  const obsoleteEntries = backupEntries.slice(0, Math.max(0, backupEntries.length - MAX_SETTINGS_BACKUPS));
  for (const entry of obsoleteEntries) {
    fs.unlinkSync(entry.filePath);
  }

  return backupPath;
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
  getSnapshotTagsFile,
  getCurrentTextFile,
  getEditorStateFile,

  getTasksDir,
  getTasksListsDir,
  getTasksLibraryFile,
  getTasksAllowedHostsFile,
  getTaskEditorStateFile,
  getTaskFilePickerStateFile,

  getTextExtractionStateFile,
  getReadingTestPoolImportStateFile,
  getReadingTestPoolStateFile,
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
  loadJsonWithStatus,
  saveJson,
  saveJsonStrict,
  saveJsonDirect,
  saveJsonDirectStrict,
  createJsonStrict,
  createSettingsStartupBackup,
};

// =============================================================================
// End of electron/fs_storage.js
// =============================================================================
