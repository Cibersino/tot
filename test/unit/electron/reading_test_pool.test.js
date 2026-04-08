'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const readingTestPool = require('../../../electron/reading_test_pool');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tot-reading-test-pool-'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

test('bundled sync seeds runtime files and pool state is tracked externally', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');

  writeJson(path.join(bundledSourceDir, 'starter.json'), {
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
  });

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

  writeJson(bundledFilePath, {
    text: 'Version one.',
    tags: {
      language: 'en',
    },
  });

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

  writeJson(bundledFilePath, {
    text: 'Version two.',
    tags: {
      language: 'en',
    },
  });

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
  assert.equal(state.entries[snapshotRelPath].used, false);
  assert.match(state.entries[snapshotRelPath].managedBundledHash, /^sha256:/);
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
  writeJson(path.join(poolDir, 'custom_story.json'), {
    text: 'Imported custom story.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
  });
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

test('startup prune removes retired managed starter files and their state entries', () => {
  const tempDir = makeTempDir();
  const snapshotsRootDir = path.join(tempDir, 'snapshots');
  const bundledSourceDir = path.join(tempDir, 'bundled');
  const stateFilePath = path.join(tempDir, 'reading_test_pool_state.json');
  const bundledFilePath = path.join(bundledSourceDir, 'starter.json');

  writeJson(bundledFilePath, {
    text: 'Retired starter.',
    tags: {
      language: 'en',
    },
  });

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
