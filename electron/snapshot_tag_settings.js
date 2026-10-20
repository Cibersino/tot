// electron/snapshot_tag_settings.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Snapshot-tag preference owner for config/snapshot_tags.json.
// Responsibilities:
// - Load and normalize persisted snapshot-tag preferences.
// - Reload public reads from disk while keeping the latest normalized value in memory.
// - Repair normal bootstrap persistence through best-effort saveJson(...).
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
let _saveJson = null;
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

function assertInitialized(apiName) {
  if (!_loadJsonWithStatus || !_saveJson || !_snapshotTagsFile) {
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

function init({ loadJsonWithStatus, saveJson, saveJsonStrict, snapshotTagsFile }) {
  if (
    typeof loadJsonWithStatus !== 'function'
    || typeof saveJson !== 'function'
    || typeof saveJsonStrict !== 'function'
  ) {
    throw new Error(
      '[snapshot-tag-settings] init requires loadJsonWithStatus, saveJson, and saveJsonStrict'
    );
  }
  if (!snapshotTagsFile) {
    throw new Error('[snapshot-tag-settings] init requires snapshotTagsFile');
  }

  _loadJsonWithStatus = loadJsonWithStatus;
  _saveJson = saveJson;
  _saveJsonStrict = saveJsonStrict;
  _snapshotTagsFile = snapshotTagsFile;

  const loadResult = loadSnapshotTagPreferencesFromDisk();
  // Do not repair an unreadable catalog by persisting the fallback used for its degraded read.
  if (isSnapshotTagStorageReadUsable(loadResult.storageReadStatus)) {
    try {
      _saveJson(_snapshotTagsFile, loadResult.snapshotTags);
    } catch (err) {
      log.warn(
        'BOOTSTRAP: Snapshot-tag init normalization persist failed (ignored):',
        _snapshotTagsFile,
        err
      );
    }
  } else {
    log.warn(
      'BOOTSTRAP: Snapshot-tag init persistence skipped after degraded storage read:',
      _snapshotTagsFile,
      loadResult.storageReadStatus
    );
  }

  return loadResult.snapshotTags;
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
    } catch (err) {
      log.error(
        'IPC get-snapshot-tag-preferences failed (using safe fallback):',
        err
      );
      return {
        ok: false,
        error: String(err),
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
        } catch (err) {
          log.warn(
            'Snapshot-tag settings publish callback failed (ignored):',
            err
          );
        }
      } else {
        log.warn(
          'Snapshot-tag settings publish callback unavailable; settings-updated publish failed (ignored).'
        );
      }

      return { ok: true, snapshotTags: savedSnapshotTags };
    } catch (err) {
      log.error('IPC set-snapshot-tag-preferences failed:', err);
      return { ok: false, error: String(err) };
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
