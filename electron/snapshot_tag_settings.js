// electron/snapshot_tag_settings.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Own persisted editable snapshot-tag preferences under config/snapshot_tags.json.
// - Load and normalize the persisted preference schema.
// - Keep the latest normalized snapshot-tag preferences in memory.
// - Persist normalized preferences through injected JSON helpers:
//   - best-effort normalization/repair through saveJson(...)
//   - verified user-triggered mutations through saveJsonStrict(...)
// - Own the dedicated snapshot-tag IPC contract.
// - Request a settings publish through the existing settings owner after writes.
// =============================================================================

const Log = require('./log');
const snapshotTagCatalog = require('../public/js/lib/snapshot_tag_catalog');

const log = Log.get('snapshot-tag-settings');
log.debug('Snapshot tag settings starting...');

let _loadJson = null;
let _saveJson = null;
let _saveJsonStrict = null;
let _snapshotTagsFile = null;
let _currentSnapshotTagPreferences = null;

function createDefaultSnapshotTagPreferences() {
  return snapshotTagCatalog.createEmptySnapshotTagPreferences();
}

function normalizeSnapshotTagPreferences(rawSnapshotTags) {
  if (!snapshotTagCatalog.isPlainObject(rawSnapshotTags)) {
    log.warnOnce(
      'snapshot-tag-settings.normalize.invalid-root',
      'Invalid snapshot-tag preferences root; using empty preferences:',
      { type: typeof rawSnapshotTags, isArray: Array.isArray(rawSnapshotTags) }
    );
    return createDefaultSnapshotTagPreferences();
  }

  return snapshotTagCatalog.normalizeSnapshotTagPreferences(rawSnapshotTags);
}

function assertInitialized(apiName) {
  if (!_loadJson || !_saveJson || !_snapshotTagsFile) {
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

  const rawSnapshotTags = _loadJson(
    _snapshotTagsFile,
    createDefaultSnapshotTagPreferences()
  );
  _currentSnapshotTagPreferences = normalizeSnapshotTagPreferences(rawSnapshotTags);
  return _currentSnapshotTagPreferences;
}

function saveSnapshotTagPreferencesStrict(nextSnapshotTags) {
  assertStrictInitialized('saveSnapshotTagPreferencesStrict');

  const normalizedSnapshotTags = normalizeSnapshotTagPreferences(nextSnapshotTags);
  _saveJsonStrict(_snapshotTagsFile, normalizedSnapshotTags);
  _currentSnapshotTagPreferences = normalizedSnapshotTags;
  return _currentSnapshotTagPreferences;
}

function init({ loadJson, saveJson, saveJsonStrict, snapshotTagsFile }) {
  if (
    typeof loadJson !== 'function'
    || typeof saveJson !== 'function'
    || typeof saveJsonStrict !== 'function'
  ) {
    throw new Error(
      '[snapshot-tag-settings] init requires loadJson, saveJson, and saveJsonStrict'
    );
  }
  if (!snapshotTagsFile) {
    throw new Error('[snapshot-tag-settings] init requires snapshotTagsFile');
  }

  _loadJson = loadJson;
  _saveJson = saveJson;
  _saveJsonStrict = saveJsonStrict;
  _snapshotTagsFile = snapshotTagsFile;

  const snapshotTags = loadSnapshotTagPreferencesFromDisk();
  try {
    _saveJson(_snapshotTagsFile, snapshotTags);
  } catch (err) {
    log.warn(
      'BOOTSTRAP: Snapshot-tag init normalization persist failed (ignored):',
      _snapshotTagsFile,
      err
    );
  }

  return snapshotTags;
}

function getSnapshotTagPreferences() {
  assertInitialized('getSnapshotTagPreferences');
  return loadSnapshotTagPreferencesFromDisk();
}

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
        snapshotTags: getSnapshotTagPreferences(),
      };
    } catch (err) {
      log.errorOnce(
        'snapshot-tag-settings.ipc.get',
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
        log.warnOnce(
          'snapshot-tag-settings.ipc.set.invalid',
          'set-snapshot-tag-preferences called with invalid payload (ignored).',
          { type: typeof rawSnapshotTags, isArray: Array.isArray(rawSnapshotTags) }
        );
        return { ok: false, error: 'invalid' };
      }

      const nextSnapshotTags = normalizeSnapshotTagPreferences(rawSnapshotTags);
      const currentSnapshotTags = getSnapshotTagPreferences();
      if (JSON.stringify(currentSnapshotTags) === JSON.stringify(nextSnapshotTags)) {
        return { ok: true, snapshotTags: currentSnapshotTags };
      }

      const savedSnapshotTags = saveSnapshotTagPreferencesStrict(nextSnapshotTags);
      if (typeof publishSettingsUpdate === 'function') {
        try {
          publishSettingsUpdate();
        } catch (err) {
          log.warnOnce(
            'snapshot-tag-settings.ipc.set.publish-failed',
            'Snapshot-tag settings publish callback failed (ignored):',
            err
          );
        }
      } else {
        log.warnOnce(
          'snapshot-tag-settings.ipc.set.publish-unavailable',
          'Snapshot-tag settings publish callback unavailable; settings-updated skipped.'
        );
      }

      return { ok: true, snapshotTags: savedSnapshotTags };
    } catch (err) {
      log.error('IPC set-snapshot-tag-preferences failed:', err);
      return { ok: false, error: String(err) };
    }
  });
}

module.exports = {
  init,
  getSnapshotTagPreferences,
  registerIpc,
};
