// electron/snapshot_tag_settings.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Snapshot-tag preference owner for config/snapshot_tags.json.
// Responsibilities:
// - Load and normalize persisted snapshot-tag preferences.
// - Reload public reads from disk while keeping the latest normalized value in memory.
// - Admit and strictly persist normal bootstrap preferences before publication.
// - Persist user-triggered mutations through verified saveJsonStrict(...).
// - Own direct snapshot-tag IPC operations that require usable storage before reporting success or saving.
// - Request a follow-up settings publish after confirmed writes.

// =============================================================================
// Imports / logger
// =============================================================================

const Log = require('./log');
const snapshotTagCatalog = require('../public/js/lib/snapshot_tag_catalog');

const log = Log.get('snapshot-tag-settings');
log.debug('Snapshot tag settings starting...');

// =============================================================================
// Shared state
// =============================================================================

let _loadJsonWithStatus = null;
let _saveJsonStrict = null;
let _snapshotTagsFile = null;
let _currentSnapshotTagPreferences = null;

// =============================================================================
// Helpers
// =============================================================================

function createDefaultSnapshotTagPreferences() {
  return snapshotTagCatalog.createEmptySnapshotTagPreferences();
}

function normalizeSnapshotTagPreferences(rawSnapshotTags) {
  if (!snapshotTagCatalog.isPlainObject(rawSnapshotTags)) {
    log.warn(
      'Invalid snapshot-tag preferences root; using empty preferences:',
      { type: typeof rawSnapshotTags, isArray: Array.isArray(rawSnapshotTags) }
    );
    return createDefaultSnapshotTagPreferences();
  }

  return snapshotTagCatalog.normalizeSnapshotTagPreferences(rawSnapshotTags);
}

function createStartupInitializationError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function getStructuralAdmissionError(rawSnapshotTags) {
  if (!snapshotTagCatalog.isPlainObject(rawSnapshotTags)) {
    return new Error('snapshot-tag preferences root is not an object');
  }

  for (const category of snapshotTagCatalog.TAG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rawSnapshotTags, category)) continue;

    const categoryPreferences = rawSnapshotTags[category];
    if (!snapshotTagCatalog.isPlainObject(categoryPreferences)) {
      return new Error(`snapshot-tag category ${category} is not an object`);
    }

    for (const collectionName of ['custom', 'hiddenDefaults', 'order']) {
      if (!Object.prototype.hasOwnProperty.call(categoryPreferences, collectionName)) continue;
      if (!Array.isArray(categoryPreferences[collectionName])) {
        return new Error(
          `snapshot-tag category ${category}.${collectionName} is not an array`
        );
      }
    }

    for (const entry of categoryPreferences.custom || []) {
      if (!snapshotTagCatalog.isPlainObject(entry)) {
        return new Error(`snapshot-tag category ${category}.custom contains a non-object entry`);
      }
      if (!snapshotTagCatalog.validateCustomLabel(entry.label).ok) {
        return new Error(`snapshot-tag category ${category}.custom contains an unrecoverable label`);
      }
    }
  }

  return null;
}

function getStartupAdmissionError(loadResult) {
  if (!loadResult || loadResult.status === 'empty' || loadResult.status === 'failed') {
    return createStartupInitializationError(
      'SNAPSHOT_TAGS_STARTUP_ADMISSION_FAILED',
      `[snapshot-tag-settings] startup snapshot-tag file is ${loadResult && loadResult.status || 'unavailable'}`
    );
  }
  if (loadResult.status === 'missing') return null;
  if (loadResult.status !== 'loaded') {
    return createStartupInitializationError(
      'SNAPSHOT_TAGS_STARTUP_ADMISSION_FAILED',
      `[snapshot-tag-settings] startup snapshot-tag file has unsupported status ${loadResult.status}`
    );
  }

  const structuralError = getStructuralAdmissionError(loadResult.value);
  if (!structuralError) return null;
  return createStartupInitializationError(
    'SNAPSHOT_TAGS_STARTUP_ADMISSION_FAILED',
    '[snapshot-tag-settings] startup snapshot-tag file is structurally unrecoverable',
    structuralError
  );
}

function assertInitialized(apiName) {
  if (!_loadJsonWithStatus || !_snapshotTagsFile) {
    throw new Error(`[snapshot-tag-settings] ${apiName} called before init`);
  }
}

function assertStrictInitialized(apiName) {
  if (!_saveJsonStrict || !_snapshotTagsFile) {
    throw new Error(`[snapshot-tag-settings] ${apiName} called before init`);
  }
}

function loadSnapshotTagPreferencesFromDisk() {
  assertInitialized('loadSnapshotTagPreferencesFromDisk');

  const loadResult = _loadJsonWithStatus(
    _snapshotTagsFile,
    createDefaultSnapshotTagPreferences()
  );
  _currentSnapshotTagPreferences = normalizeSnapshotTagPreferences(loadResult.value);
  return {
    snapshotTags: _currentSnapshotTagPreferences,
    storageReadStatus: loadResult.status,
  };
}

function isSnapshotTagStorageReadUsable(storageReadStatus) {
  return storageReadStatus === 'loaded' || storageReadStatus === 'missing';
}

function loadUsableSnapshotTagPreferences() {
  const loadResult = loadSnapshotTagPreferencesFromDisk();
  // Fallback-shaped data after an empty or failed read must not become a write baseline.
  if (!isSnapshotTagStorageReadUsable(loadResult.storageReadStatus)) {
    throw new Error(
      `Snapshot-tag preferences unavailable after ${loadResult.storageReadStatus} storage read.`
    );
  }
  return loadResult.snapshotTags;
}

function saveSnapshotTagPreferencesStrict(nextSnapshotTags) {
  assertStrictInitialized('saveSnapshotTagPreferencesStrict');

  const normalizedSnapshotTags = normalizeSnapshotTagPreferences(nextSnapshotTags);
  _saveJsonStrict(_snapshotTagsFile, normalizedSnapshotTags);
  _currentSnapshotTagPreferences = normalizedSnapshotTags;
  return _currentSnapshotTagPreferences;
}

function init({ loadJsonWithStatus, saveJsonStrict, snapshotTagsFile }) {
  if (
    typeof loadJsonWithStatus !== 'function'
    || typeof saveJsonStrict !== 'function'
  ) {
    throw new Error(
      '[snapshot-tag-settings] init requires loadJsonWithStatus and saveJsonStrict'
    );
  }
  if (!snapshotTagsFile) {
    throw new Error('[snapshot-tag-settings] init requires snapshotTagsFile');
  }

  const initialLoad = loadJsonWithStatus(
    snapshotTagsFile,
    createDefaultSnapshotTagPreferences()
  );
  const admissionError = getStartupAdmissionError(initialLoad);
  if (admissionError) throw admissionError;

  const normalizedSnapshotTags = normalizeSnapshotTagPreferences(initialLoad.value);
  try {
    saveJsonStrict(snapshotTagsFile, normalizedSnapshotTags);
  } catch (error) {
    throw createStartupInitializationError(
      'SNAPSHOT_TAGS_STARTUP_INITIAL_WRITE_FAILED',
      '[snapshot-tag-settings] startup snapshot-tag persistence failed',
      error
    );
  }

  _loadJsonWithStatus = loadJsonWithStatus;
  _saveJsonStrict = saveJsonStrict;
  _snapshotTagsFile = snapshotTagsFile;
  _currentSnapshotTagPreferences = normalizedSnapshotTags;
  return _currentSnapshotTagPreferences;
}

// =============================================================================
// Public API
// =============================================================================

function getSnapshotTagPreferences() {
  assertInitialized('getSnapshotTagPreferences');
  return loadSnapshotTagPreferencesFromDisk().snapshotTags;
}

// =============================================================================
// IPC registration / handlers
// =============================================================================

function registerIpc(
  ipcMain,
  {
    publishSettingsUpdate,
  } = {}
) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[snapshot-tag-settings] registerIpc requires ipcMain');
  }

  ipcMain.handle('get-snapshot-tag-preferences', async () => {
    try {
      return {
        ok: true,
        snapshotTags: loadUsableSnapshotTagPreferences(),
      };
    } catch (error) {
      log.error(
        'IPC get-snapshot-tag-preferences failed (using safe fallback):',
        error
      );
      return {
        ok: false,
        error: String(error),
        snapshotTags: createDefaultSnapshotTagPreferences(),
      };
    }
  });

  ipcMain.handle('set-snapshot-tag-preferences', async (_event, rawSnapshotTags) => {
    try {
      if (!snapshotTagCatalog.isPlainObject(rawSnapshotTags)) {
        log.warn(
          'set-snapshot-tag-preferences called with invalid payload (ignored).',
          { type: typeof rawSnapshotTags, isArray: Array.isArray(rawSnapshotTags) }
        );
        return { ok: false, error: 'invalid' };
      }

      const nextSnapshotTags = normalizeSnapshotTagPreferences(rawSnapshotTags);
      const currentSnapshotTags = loadUsableSnapshotTagPreferences();
      if (JSON.stringify(currentSnapshotTags) === JSON.stringify(nextSnapshotTags)) {
        return { ok: true, snapshotTags: currentSnapshotTags };
      }

      const savedSnapshotTags = saveSnapshotTagPreferencesStrict(nextSnapshotTags);
      if (typeof publishSettingsUpdate === 'function') {
        try {
          publishSettingsUpdate();
        } catch (error) {
          log.warn(
            'Snapshot-tag settings publish callback failed (ignored):',
            error
          );
        }
      } else {
        log.warn(
          'Snapshot-tag settings publish callback unavailable; settings-updated publish failed (ignored).'
        );
      }

      return { ok: true, snapshotTags: savedSnapshotTags };
    } catch (error) {
      log.error('IPC set-snapshot-tag-preferences failed:', error);
      return { ok: false, error: String(error) };
    }
  });
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  init,
  getSnapshotTagPreferences,
  registerIpc,
};

// =============================================================================
// End of electron/snapshot_tag_settings.js
// =============================================================================
