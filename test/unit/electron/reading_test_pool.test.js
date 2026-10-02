'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const snapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

const readingTestPool = require('../../../electron/reading_test_pool');
const {
  IMPORT_CONFLICT_STRATEGY,
  importSelectedFiles,
} = require('../../../electron/reading_test_pool_import');

const BUNDLED_POOL_DIR = path.resolve(__dirname, '../../../electron/reading_test_pool');
const SNAPSHOT_META = Object.freeze({
  savedAt: '2026-08-03T00:00:00.000Z',
  savedWith: 'toT (totapp.org)',
});

function makeTempDir() {
  return createTestTempDir('reading-test-pool');
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function createFileSymlinkOrSkip(t, targetPath, linkPath, type = 'file') {
  try {
    fs.symlinkSync(targetPath, linkPath, type);
    return true;
  } catch (err) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
      t.skip('file symlinks are unavailable in this test environment');
      return false;
    }
    throw err;
  }
}

function createSnapshotData({ text, tags = {}, readingTest } = {}) {
  const snapshot = {
    type: 'text snapshot',
    meta: { ...SNAPSHOT_META },
    text,
    tags,
  };
  if (readingTest !== undefined) {
    snapshot.readingTest = readingTest;
  }
  return snapshot;
}

test('every built-in reading-test snapshot satisfies the canonical snapshot schema', () => {
  const fileNames = fs.readdirSync(BUNDLED_POOL_DIR)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  assert.equal(fileNames.length, 13);
  for (const fileName of fileNames) {
    const payload = JSON.parse(fs.readFileSync(path.join(BUNDLED_POOL_DIR, fileName), 'utf8'));
    const payloadInfo = readingTestPool.sanitizePoolData(payload);
    assert.equal(payloadInfo.ok, true, fileName);
  }
});

test('bundled sync seeds runtime files and pool state is tracked externally', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');

  writeJson(path.join(bundledSourceDir, 'starter.json'), createSnapshotData({
    text: 'Bundled starter text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
    readingTest: {
      questions: [
        {
          id: 'q1',
          prompt: 'Which text is this?',
          correctOptionId: 'a',
          options: [
            { id: 'a', text: 'Bundled starter text.' },
            { id: 'b', text: 'Something else.' },
          ],
        },
      ],
    },
  }));

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.copied, 1);
  assert.equal(syncInfo.updated, 0);

  const listInfo = readingTestPool.listPoolEntries({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });
  assert.equal(listInfo.ok, true);
  assert.equal(listInfo.entries.length, 1);
  assert.equal(listInfo.entries[0].used, false);
  assert.equal(listInfo.entries[0].hasValidQuestions, true);
  assert.equal(listInfo.entries[0].questions.length, 1);

  const snapshotRelPath = listInfo.entries[0].snapshotRelPath;
  const markInfo = readingTestPool.markPoolEntryUsed(snapshotRelPath, true, { stateFilePath });
  assert.equal(markInfo.ok, true);

  const usedListInfo = readingTestPool.listPoolEntries({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });
  assert.equal(usedListInfo.entries[0].used, true);

  const resetInfo = readingTestPool.resetPoolUsageState({ stateFilePath });
  assert.equal(resetInfo.ok, true);

  const resetState = readingTestPool.loadPoolState({ stateFilePath });
  assert.equal(resetState.showBundledEntries, true);

  const resetListInfo = readingTestPool.listPoolEntries({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });
  assert.equal(resetListInfo.entries[0].used, false);
});

test('bundled sync refreshes managed starter content when bundled content hash changes', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');

  writeJson(bundledFilePath, createSnapshotData({
    text: 'Version one.',
    tags: {
      language: 'en',
    },
  }));

  const firstSync = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });
  assert.equal(firstSync.ok, true);
  assert.equal(firstSync.copied, 1);

  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const markInfo = readingTestPool.markPoolEntryUsed(snapshotRelPath, true, { stateFilePath });
  assert.equal(markInfo.ok, true);

  writeJson(bundledFilePath, createSnapshotData({
    text: 'Version two.',
    tags: {
      language: 'en',
    },
  }));

  const secondSync = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });
  assert.equal(secondSync.ok, true);
  assert.equal(secondSync.updated, 1);

  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const runtimeJson = JSON.parse(fs.readFileSync(runtimeFilePath, 'utf8'));
  assert.equal(runtimeJson.text, 'Version two.');

  const state = readingTestPool.loadPoolState({ stateFilePath });
  assert.equal(state.showBundledEntries, true);
  assert.equal(state.entries[snapshotRelPath].used, false);
  assert.match(state.entries[snapshotRelPath].managedBundledHash, /^sha256:/);
});

test('bundled sync demotes changed managed content instead of overwriting it', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled version one.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);
  assert.equal(readingTestPool.markPoolEntryUsed(snapshotRelPath, true, { stateFilePath }).ok, true);

  writeJson(runtimeFilePath, createSnapshotData({ text: 'User replacement.' }));
  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled version two.' }));

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.updated, 0);
  assert.equal(JSON.parse(fs.readFileSync(runtimeFilePath, 'utf8')).text, 'User replacement.');
  assert.deepEqual(readingTestPool.loadPoolState({ stateFilePath }).entries[snapshotRelPath], { used: true });

  const listInfo = readingTestPool.listPoolEntries({ snapshotsRootDir, stateFilePath });
  assert.equal(listInfo.entries[0].isBundled, false);
  assert.equal(readingTestPool.getVisiblePoolEntries(listInfo.entries, false).length, 1);
});

test('retired bundled content preserves a changed runtime entry and removes its managed marker', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Retired starter.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  writeJson(runtimeFilePath, createSnapshotData({ text: 'User keeps this text.' }));
  fs.unlinkSync(bundledFilePath);

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.removedManagedFiles, 0);
  assert.equal(syncInfo.prunedStateEntries, 0);
  assert.equal(JSON.parse(fs.readFileSync(runtimeFilePath, 'utf8')).text, 'User keeps this text.');
  assert.deepEqual(readingTestPool.loadPoolState({ stateFilePath }).entries[snapshotRelPath], { used: false });
});

test('bundled sync preserves a user-owned collision introduced by a later bundled source', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const poolDir = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME);
  const runtimeFilePath = path.join(poolDir, 'starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');

  writeJson(runtimeFilePath, createSnapshotData({ text: 'Existing user pool text.' }));
  writeJson(path.join(bundledSourceDir, 'starter.json'), createSnapshotData({ text: 'New bundled text.' }));

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.copied, 0);
  assert.equal(JSON.parse(fs.readFileSync(runtimeFilePath, 'utf8')).text, 'Existing user pool text.');
  assert.equal(
    Object.prototype.hasOwnProperty.call(readingTestPool.loadPoolState({ stateFilePath }).entries, snapshotRelPath),
    false
  );
});

test('bundled sync does not install a source that discovery would reject', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'invalid.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('invalid.json');

  writeJson(path.join(bundledSourceDir, 'invalid.json'), { text: 'Not a canonical snapshot.' });

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.copied, 0);
  assert.equal(syncInfo.failed, 1);
  assert.equal(fs.existsSync(runtimeFilePath), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(readingTestPool.loadPoolState({ stateFilePath }).entries, snapshotRelPath),
    false
  );
});

test('bundled sync retains managed entries when bundled source enumeration is incomplete', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled starter.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  fs.rmSync(bundledSourceDir, { recursive: true, force: true });
  fs.writeFileSync(bundledSourceDir, 'not a directory', 'utf8');

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, false);
  assert.equal(syncInfo.code, 'BUNDLED_SOURCE_SCAN_FAILED');
  assert.equal(syncInfo.removedManagedFiles, 0);
  assert.equal(fs.existsSync(runtimeFilePath), true);
  assert.match(readingTestPool.loadPoolState({ stateFilePath }).entries[snapshotRelPath].managedBundledHash, /^sha256:/);
});

test('bundled sync does not prune a managed entry below an unreadable bundled subtree', (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const bundledNestedDir = path.join(bundledSourceDir, 'nested');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'nested', 'starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('nested/starter.json');
  const originalReaddirSync = fs.readdirSync;

  writeJson(path.join(bundledNestedDir, 'starter.json'), createSnapshotData({ text: 'Bundled nested starter.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  t.mock.method(fs, 'readdirSync', (directoryPath, ...args) => {
    if (path.resolve(directoryPath) === bundledNestedDir) {
      const err = new Error('simulated bundled subtree read failure');
      err.code = 'EIO';
      throw err;
    }
    return originalReaddirSync.call(fs, directoryPath, ...args);
  });

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, false);
  assert.equal(syncInfo.code, 'BUNDLED_SOURCE_SCAN_FAILED');
  assert.equal(syncInfo.removedManagedFiles, 0);
  assert.equal(fs.existsSync(runtimeFilePath), true);
  assert.match(readingTestPool.loadPoolState({ stateFilePath }).entries[snapshotRelPath].managedBundledHash, /^sha256:/);
});

test('bundled sync keeps ownership separate from current schema usability', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const nowInvalidData = {
    type: 'text snapshot',
    meta: { ...SNAPSHOT_META },
    text: 'Legacy bundled content.',
    tags: { language: 'en', obsolete: false },
  };

  writeJson(runtimeFilePath, nowInvalidData);
  writeJson(stateFilePath, {
    showBundledEntries: true,
    entries: {
      [snapshotRelPath]: {
        used: true,
        managedBundledHash: readingTestPool.computeJsonContentHash(nowInvalidData),
      },
    },
  });
  writeJson(bundledFilePath, createSnapshotData({ text: 'Current bundled content.' }));

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.updated, 1);
  assert.equal(JSON.parse(fs.readFileSync(runtimeFilePath, 'utf8')).text, 'Current bundled content.');
  const state = readingTestPool.loadPoolState({ stateFilePath });
  assert.equal(state.entries[snapshotRelPath].used, false);
  assert.match(state.entries[snapshotRelPath].managedBundledHash, /^sha256:/);
});

test('pool listing retains matching ownership for a parseable but unusable managed file', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const nowInvalidData = {
    type: 'text snapshot',
    meta: { ...SNAPSHOT_META },
    text: 'Legacy bundled content.',
    tags: { language: 'en', obsolete: false },
  };

  writeJson(runtimeFilePath, nowInvalidData);
  writeJson(stateFilePath, {
    showBundledEntries: true,
    entries: {
      [snapshotRelPath]: {
        used: false,
        managedBundledHash: readingTestPool.computeJsonContentHash(nowInvalidData),
      },
    },
  });

  const listInfo = readingTestPool.listPoolEntries({ snapshotsRootDir, stateFilePath });

  assert.equal(listInfo.ok, true);
  assert.equal(listInfo.entries.length, 0);
  assert.equal(
    readingTestPool.loadPoolState({ stateFilePath }).entries[snapshotRelPath].managedBundledHash,
    readingTestPool.computeJsonContentHash(nowInvalidData)
  );
});

test('pool listing retains ownership when a managed runtime file cannot be read', (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const originalReadFileSync = fs.readFileSync;

  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled starter.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  t.mock.method(fs, 'readFileSync', (filePath, ...args) => {
    if (path.resolve(filePath) === runtimeFilePath) {
      const err = new Error('simulated runtime read failure');
      err.code = 'EIO';
      throw err;
    }
    return originalReadFileSync.call(fs, filePath, ...args);
  });

  const listInfo = readingTestPool.listPoolEntries({ snapshotsRootDir, stateFilePath });

  assert.equal(listInfo.ok, true);
  assert.equal(listInfo.entries.length, 0);
  assert.match(readingTestPool.loadPoolState({ stateFilePath }).entries[snapshotRelPath].managedBundledHash, /^sha256:/);
});

test('pool listing excludes a readable entry when final canonicalization fails', (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'entry.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('entry.json');
  const originalRealpathSync = fs.realpathSync;
  const snapshot = createSnapshotData({ text: 'Readable runtime entry.' });

  writeJson(runtimeFilePath, snapshot);
  writeJson(stateFilePath, {
    showBundledEntries: true,
    entries: {
      [snapshotRelPath]: {
        used: false,
        managedBundledHash: readingTestPool.computeJsonContentHash(snapshot),
      },
    },
  });
  t.mock.method(fs, 'realpathSync', (targetPath, ...args) => {
    if (path.resolve(targetPath) === runtimeFilePath) {
      const err = new Error('simulated final-entry canonicalization failure');
      err.code = 'EIO';
      throw err;
    }
    return originalRealpathSync.call(fs, targetPath, ...args);
  });

  const listInfo = readingTestPool.listPoolEntries({ snapshotsRootDir, stateFilePath });

  assert.equal(listInfo.ok, true);
  assert.deepEqual(listInfo.entries, []);
  assert.equal(
    readingTestPool.loadPoolState({ stateFilePath }).entries[snapshotRelPath].managedBundledHash,
    readingTestPool.computeJsonContentHash(snapshot)
  );
});

test('startup prune removes stale state when a nested pool parent is missing', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('nested/starter.json');

  fs.mkdirSync(bundledSourceDir, { recursive: true });
  writeJson(stateFilePath, {
    showBundledEntries: true,
    entries: {
      [snapshotRelPath]: { used: true },
    },
  });

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.prunedStateEntries, 1);
  assert.equal(
    Object.prototype.hasOwnProperty.call(readingTestPool.loadPoolState({ stateFilePath }).entries, snapshotRelPath),
    false
  );
});

test('bundled sync demotes changed runtime content even when the current bundled source is invalid', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Initial bundled text.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  writeJson(runtimeFilePath, createSnapshotData({ text: 'User replacement.' }));
  writeJson(bundledFilePath, { text: 'No longer a valid snapshot.' });

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.failed, 1);
  assert.equal(JSON.parse(fs.readFileSync(runtimeFilePath, 'utf8')).text, 'User replacement.');
  assert.deepEqual(readingTestPool.loadPoolState({ stateFilePath }).entries[snapshotRelPath], { used: false });
});

test('bundled sync rejects a redirected final destination without writing through it', (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const outsidePath = path.join(tempDir, 'outside.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled version one.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);
  fs.unlinkSync(runtimeFilePath);
  writeJson(outsidePath, createSnapshotData({ text: 'Outside text.' }));
  if (!createFileSymlinkOrSkip(t, outsidePath, runtimeFilePath)) return;
  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled version two.' }));

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.updated, 0);
  assert.equal(syncInfo.failed, 1);
  assert.equal(JSON.parse(fs.readFileSync(outsidePath, 'utf8')).text, 'Outside text.');
  assert.equal(
    Object.prototype.hasOwnProperty.call(readingTestPool.loadPoolState({ stateFilePath }).entries, snapshotRelPath),
    false
  );
});

test('bundled sync rejects a redirected snapshots root without creating a runtime pool', (t) => {
  const tempDir = makeTempDir();
  const redirectedSnapshotsRoot = path.join(tempDir, 'redirected-snapshots');
  const outsideSnapshotsRoot = path.join(tempDir, 'outside-snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');

  fs.mkdirSync(outsideSnapshotsRoot, { recursive: true });
  if (!createFileSymlinkOrSkip(t, outsideSnapshotsRoot, redirectedSnapshotsRoot, 'junction')) return;
  writeJson(path.join(bundledSourceDir, 'starter.json'), createSnapshotData({ text: 'Bundled text.' }));

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir: redirectedSnapshotsRoot,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, false);
  assert.equal(syncInfo.code, 'INVALID_POOL_CONTEXT');
  assert.equal(fs.existsSync(path.join(outsideSnapshotsRoot, readingTestPool.POOL_DIR_NAME)), false);
});

test('pool listing removes managed ownership for a redirected runtime entry', (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const outsidePath = path.join(tempDir, 'outside.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled text.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);
  fs.unlinkSync(runtimeFilePath);
  writeJson(outsidePath, createSnapshotData({ text: 'Outside text.' }));
  if (!createFileSymlinkOrSkip(t, outsidePath, runtimeFilePath)) return;

  const listInfo = readingTestPool.listPoolEntries({ snapshotsRootDir, stateFilePath });

  assert.equal(listInfo.ok, true);
  assert.equal(listInfo.entries.length, 0);
  assert.equal(
    Object.prototype.hasOwnProperty.call(readingTestPool.loadPoolState({ stateFilePath }).entries, snapshotRelPath),
    false
  );
});

test('pool state defaults showBundledEntries to true and persists false across writes', () => {
  const tempDir = makeTempDir();
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');

  const initialState = readingTestPool.loadPoolState({ stateFilePath });
  assert.equal(initialState.showBundledEntries, true);
  assert.deepEqual(initialState.entries, {});

  const setInfo = readingTestPool.setShowBundledEntries(false, { stateFilePath });
  assert.equal(setInfo.ok, true);

  const reloadedState = readingTestPool.loadPoolState({ stateFilePath });
  assert.equal(reloadedState.showBundledEntries, false);
  assert.deepEqual(reloadedState.entries, {});
});

test('entry state updates and reset preserve showBundledEntries', () => {
  const tempDir = makeTempDir();
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');

  writeJson(stateFilePath, {
    showBundledEntries: false,
    entries: {
      [snapshotRelPath]: {
        used: true,
      },
    },
  });

  const markInfo = readingTestPool.markPoolEntryUsed(snapshotRelPath, false, { stateFilePath });
  assert.equal(markInfo.ok, true);

  const resetInfo = readingTestPool.resetPoolUsageState({ stateFilePath });
  assert.equal(resetInfo.ok, true);

  const finalState = readingTestPool.loadPoolState({ stateFilePath });
  assert.equal(finalState.showBundledEntries, false);
  assert.equal(finalState.entries[snapshotRelPath].used, false);
});

test('markPoolEntryUsed returns WRITE_FAILED when verified pool-state persistence fails', () => {
  const tempDir = makeTempDir();
  const stateFilePath = tempDir;
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');

  const markInfo = readingTestPool.markPoolEntryUsed(snapshotRelPath, true, { stateFilePath });

  assert.equal(markInfo.ok, false);
  assert.equal(markInfo.code, 'WRITE_FAILED');
  assert.match(String(markInfo.message || ''), /directory|eperm|eisdir/i);
});

test('clearImportedPoolEntriesState returns WRITE_FAILED when imported-entry cleanup persistence fails', () => {
  const tempDir = makeTempDir();
  const stateFilePath = tempDir;
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const runtimeFilePath = path.join(
    snapshotsRootDir,
    readingTestPool.POOL_DIR_NAME,
    'starter.json'
  );
  writeJson(runtimeFilePath, createSnapshotData({ text: 'Imported entry.' }));
  const context = readingTestPool.resolvePoolContext({ snapshotsRootDir, stateFilePath });
  assert.equal(context.ok, true);

  const clearInfo = readingTestPool.clearImportedPoolEntriesState(['starter.json'], { context });

  assert.equal(clearInfo.ok, false);
  assert.equal(clearInfo.code, 'WRITE_FAILED');
  assert.match(String(clearInfo.message || ''), /directory|eperm|eisdir/i);
});

test('startup prune removes stale state entries but leaves existing unmanaged files intact', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const poolDir = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME);
  const existingCustomRelPath = readingTestPool.buildPoolSnapshotRelPath('custom_story.json');
  const missingCustomRelPath = readingTestPool.buildPoolSnapshotRelPath('missing_story.json');

  fs.mkdirSync(bundledSourceDir, { recursive: true });
  writeJson(path.join(poolDir, 'custom_story.json'), createSnapshotData({
    text: 'Imported custom story.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
  }));
  writeJson(stateFilePath, {
    entries: {
      [existingCustomRelPath]: { used: true },
      [missingCustomRelPath]: { used: true },
    },
  });

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.removedManagedFiles, 0);
  assert.equal(syncInfo.prunedStateEntries, 1);
  assert.equal(fs.existsSync(path.join(poolDir, 'custom_story.json')), true);

  const state = readingTestPool.loadPoolState({ stateFilePath });
  assert.deepEqual(state.entries[existingCustomRelPath], { used: true });
  assert.equal(Object.prototype.hasOwnProperty.call(state.entries, missingCustomRelPath), false);
});

test('listPoolEntries accepts permitted custom snapshot tags from pool files', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const poolDir = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME);
  const customLanguage = snapshotTagCatalog.buildCustomTagValue('language', 'Plain text');
  const customType = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');

  writeJson(path.join(poolDir, 'custom_pool.json'), createSnapshotData({
    text: 'Imported custom pool story.',
    tags: {
      language: customLanguage,
      type: customType,
      difficulty: 'hard',
    },
  }));

  const listInfo = readingTestPool.listPoolEntries({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(listInfo.ok, true);
  assert.equal(listInfo.entries.length, 1);
  assert.deepEqual(listInfo.entries[0].tags, {
    language: customLanguage,
    type: customType,
    difficulty: 'hard',
  });
});

test('listPoolEntries accepts valid non-catalog language tags from pool files', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const poolDir = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME);

  writeJson(path.join(poolDir, 'open-language-pool.json'), createSnapshotData({
    text: 'Imported open-language pool story.',
    tags: {
      language: 'es-cl',
      type: 'fiction',
    },
  }));

  const listInfo = readingTestPool.listPoolEntries({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(listInfo.ok, true);
  assert.equal(listInfo.entries.length, 1);
  assert.deepEqual(listInfo.entries[0].tags, {
    language: 'es-cl',
    type: 'fiction',
  });
});

test('startup prune removes retired managed starter files and their state entries', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');

  writeJson(bundledFilePath, createSnapshotData({
    text: 'Retired starter.',
    tags: {
      language: 'en',
    },
  }));

  const firstSync = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });
  assert.equal(firstSync.ok, true);
  assert.equal(firstSync.copied, 1);

  fs.unlinkSync(bundledFilePath);

  const secondSync = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const state = readingTestPool.loadPoolState({ stateFilePath });

  assert.equal(secondSync.ok, true);
  assert.equal(secondSync.removedManagedFiles, 1);
  assert.equal(secondSync.prunedStateEntries, 1);
  assert.equal(fs.existsSync(runtimeFilePath), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state.entries, snapshotRelPath), false);
});

test('case-only runtime rename retains the bundled logical state identity on case-insensitive filesystems', (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const renamedRuntimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'Starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const renamedSnapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('Starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Initial bundled content.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  fs.renameSync(runtimeFilePath, renamedRuntimeFilePath);
  if (!fs.existsSync(runtimeFilePath)) {
    t.skip('case-only renames are distinct on this filesystem');
    return;
  }

  const listInfo = readingTestPool.listPoolEntries({ snapshotsRootDir, stateFilePath });

  assert.equal(listInfo.ok, true);
  assert.equal(listInfo.entries.length, 1);
  assert.equal(listInfo.entries[0].fileName, 'Starter.json');
  assert.equal(listInfo.entries[0].snapshotRelPath, snapshotRelPath);
  assert.equal(listInfo.entries[0].isBundled, true);
  assert.equal(readingTestPool.getVisiblePoolEntries(listInfo.entries, false).length, 0);

  assert.equal(readingTestPool.markPoolEntryUsed(
    listInfo.entries[0].snapshotRelPath,
    true,
    { stateFilePath }
  ).ok, true);
  let state = readingTestPool.loadPoolState({ stateFilePath });
  assert.deepEqual(Object.keys(state.entries), [snapshotRelPath]);
  assert.equal(state.entries[snapshotRelPath].used, true);
  assert.equal(Object.prototype.hasOwnProperty.call(state.entries, renamedSnapshotRelPath), false);

  writeJson(bundledFilePath, createSnapshotData({ text: 'Updated bundled content.' }));
  const updateInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(updateInfo.ok, true);
  assert.equal(updateInfo.updated, 1);
  assert.equal(JSON.parse(fs.readFileSync(renamedRuntimeFilePath, 'utf8')).text, 'Updated bundled content.');
  state = readingTestPool.loadPoolState({ stateFilePath });
  assert.equal(state.entries[snapshotRelPath].used, false);
  assert.match(state.entries[snapshotRelPath].managedBundledHash, /^sha256:/);

  fs.unlinkSync(bundledFilePath);
  const pruneInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(pruneInfo.ok, true);
  assert.equal(pruneInfo.removedManagedFiles, 1);
  assert.equal(fs.existsSync(renamedRuntimeFilePath), false);
  assert.equal(Object.prototype.hasOwnProperty.call(
    readingTestPool.loadPoolState({ stateFilePath }).entries,
    snapshotRelPath
  ), false);
});

test('case-equivalent replacement clears the managed state associated with the physical runtime entry', async (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const renamedRuntimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'Starter.json');
  const externalFilePath = path.join(tempDir, 'external', 'Starter.json');
  const bundledSnapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const replacement = createSnapshotData({ text: 'Same bundled content.' });

  writeJson(bundledFilePath, replacement);
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  fs.renameSync(runtimeFilePath, renamedRuntimeFilePath);
  if (!fs.existsSync(runtimeFilePath)) {
    t.skip('case-only runtime names are distinct on this filesystem');
    return;
  }

  writeJson(externalFilePath, replacement);
  const importInfo = await importSelectedFiles({
    selectedPaths: [externalFilePath],
    poolDir: path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME),
    resolveConflictStrategy: async () => IMPORT_CONFLICT_STRATEGY.REPLACE,
  });
  assert.equal(importInfo.ok, true);
  assert.equal(importInfo.imported, 1);
  assert.deepEqual(importInfo.writtenDestinationNames, ['Starter.json']);

  const context = readingTestPool.resolvePoolContext({ snapshotsRootDir, stateFilePath });
  const cleanupInfo = readingTestPool.clearImportedPoolEntriesState(
    importInfo.writtenDestinationNames,
    { context }
  );
  assert.equal(cleanupInfo.ok, true);

  const stateAfterImport = readingTestPool.loadPoolState({ stateFilePath });
  assert.deepEqual(stateAfterImport.entries[bundledSnapshotRelPath], { used: false });
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      stateAfterImport.entries,
      readingTestPool.buildPoolSnapshotRelPath('Starter.json')
    ),
    false
  );

  fs.unlinkSync(bundledFilePath);
  const pruneInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });

  assert.equal(pruneInfo.ok, true);
  assert.equal(pruneInfo.removedManagedFiles, 0);
  assert.equal(fs.existsSync(renamedRuntimeFilePath), true);
});

test('import-state cleanup does not guess a raw key when a case-equivalent state identity is unverified', (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const renamedRuntimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'Starter.json');
  const bundledSnapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const importedSnapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('Starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled content.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  fs.renameSync(runtimeFilePath, renamedRuntimeFilePath);
  if (!fs.existsSync(runtimeFilePath)) {
    t.skip('case-only runtime names are distinct on this filesystem');
    return;
  }

  const stateBeforeCleanup = readingTestPool.loadPoolState({ stateFilePath });
  const managedHash = stateBeforeCleanup.entries[bundledSnapshotRelPath].managedBundledHash;
  const context = readingTestPool.resolvePoolContext({ snapshotsRootDir, stateFilePath });
  const originalNativeRealpath = fs.realpathSync.native;
  t.mock.method(fs.realpathSync, 'native', (targetPath, ...args) => {
    if (path.resolve(targetPath) === runtimeFilePath) {
      const err = new Error('simulated state-entry canonicalization failure');
      err.code = 'EIO';
      throw err;
    }
    return originalNativeRealpath(targetPath, ...args);
  });

  const cleanupInfo = readingTestPool.clearImportedPoolEntriesState(['Starter.json'], { context });

  assert.equal(cleanupInfo.ok, false);
  assert.equal(cleanupInfo.code, 'STATE_ASSOCIATION_UNVERIFIED');
  assert.equal(cleanupInfo.snapshotRelPath, bundledSnapshotRelPath);
  const stateAfterCleanup = readingTestPool.loadPoolState({ stateFilePath });
  assert.equal(stateAfterCleanup.entries[bundledSnapshotRelPath].managedBundledHash, managedHash);
  assert.equal(Object.prototype.hasOwnProperty.call(stateAfterCleanup.entries, importedSnapshotRelPath), false);
});

test('import-state cleanup does not guess a raw key when a case-equivalent state destination cannot be inspected', (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const renamedRuntimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'Starter.json');
  const bundledSnapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const importedSnapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('Starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled content.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  fs.renameSync(runtimeFilePath, renamedRuntimeFilePath);
  if (!fs.existsSync(runtimeFilePath)) {
    t.skip('case-only runtime names are distinct on this filesystem');
    return;
  }

  const stateBeforeCleanup = readingTestPool.loadPoolState({ stateFilePath });
  const managedHash = stateBeforeCleanup.entries[bundledSnapshotRelPath].managedBundledHash;
  const context = readingTestPool.resolvePoolContext({ snapshotsRootDir, stateFilePath });
  const originalLstatSync = fs.lstatSync;
  t.mock.method(fs, 'lstatSync', (targetPath, ...args) => {
    if (path.resolve(targetPath) === runtimeFilePath) {
      const err = new Error('simulated state-entry inspection failure');
      err.code = 'EIO';
      throw err;
    }
    return originalLstatSync.call(fs, targetPath, ...args);
  });

  const cleanupInfo = readingTestPool.clearImportedPoolEntriesState(['Starter.json'], { context });

  assert.equal(cleanupInfo.ok, false);
  assert.equal(cleanupInfo.code, 'STATE_ASSOCIATION_UNVERIFIED');
  assert.equal(cleanupInfo.snapshotRelPath, bundledSnapshotRelPath);
  const stateAfterCleanup = readingTestPool.loadPoolState({ stateFilePath });
  assert.equal(stateAfterCleanup.entries[bundledSnapshotRelPath].managedBundledHash, managedHash);
  assert.equal(Object.prototype.hasOwnProperty.call(stateAfterCleanup.entries, importedSnapshotRelPath), false);
});

test('case-sensitive runtime rename remains a distinct unowned pool entry', (t) => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');
  const runtimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'starter.json');
  const renamedRuntimeFilePath = path.join(snapshotsRootDir, readingTestPool.POOL_DIR_NAME, 'Starter.json');
  const snapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('starter.json');
  const renamedSnapshotRelPath = readingTestPool.buildPoolSnapshotRelPath('Starter.json');

  writeJson(bundledFilePath, createSnapshotData({ text: 'Bundled content.' }));
  assert.equal(readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  }).ok, true);

  fs.renameSync(runtimeFilePath, renamedRuntimeFilePath);
  if (fs.existsSync(runtimeFilePath)) {
    t.skip('case-only renames identify the same file on this filesystem');
    return;
  }

  const syncInfo = readingTestPool.synchronizeBundledPoolContent({
    snapshotsRootDir,
    bundledSourceDir,
    stateFilePath,
  });
  const listInfo = readingTestPool.listPoolEntries({ snapshotsRootDir, stateFilePath });
  const bundledEntry = listInfo.entries.find((entry) => entry.snapshotRelPath === snapshotRelPath);
  const renamedEntry = listInfo.entries.find((entry) => entry.snapshotRelPath === renamedSnapshotRelPath);

  assert.equal(syncInfo.ok, true);
  assert.equal(syncInfo.copied, 1);
  assert.equal(listInfo.ok, true);
  assert.equal(listInfo.entries.length, 2);
  assert.equal(bundledEntry.isBundled, true);
  assert.equal(renamedEntry.isBundled, false);
});

test('visible pool filtering excludes bundled entries only when showBundledEntries is false', () => {
  const entries = [
    {
      snapshotRelPath: '/reading_speed_test_pool/bundled.json',
      used: false,
      isBundled: true,
    },
    {
      snapshotRelPath: '/reading_speed_test_pool/imported.json',
      used: true,
      isBundled: false,
    },
  ];

  const visibleWithBundled = readingTestPool.getVisiblePoolEntries(entries, true);
  assert.equal(visibleWithBundled.length, 2);

  const visibleWithoutBundled = readingTestPool.getVisiblePoolEntries(entries, false);
  assert.deepEqual(visibleWithoutBundled, [entries[1]]);
  assert.equal(readingTestPool.hasHiddenBundledUnusedEntries(entries, false), true);
  assert.equal(readingTestPool.hasHiddenBundledUnusedEntries(entries, true), false);
});
