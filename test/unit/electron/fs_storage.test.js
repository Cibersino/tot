'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

const FS_STORAGE_PATH = path.resolve(__dirname, '../../../electron/fs_storage.js');

function loadFreshFsStorage() {
  delete require.cache[require.resolve(FS_STORAGE_PATH)];
  return require(FS_STORAGE_PATH);
}

function createTempDir(t) {
  const tempDir = createTestTempDir('fs-storage');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  return tempDir;
}

test('saveJsonStrict creates parent directories and persists JSON content', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'nested', 'state.json');
  const payload = {
    language: 'en',
    modeConteo: 'preciso',
  };

  fsStorage.saveJsonStrict(targetPath, payload);

  assert.equal(fs.existsSync(targetPath), true);
  assert.equal(
    fs.readFileSync(targetPath, 'utf8'),
    `${JSON.stringify(payload, null, 2)}`
  );
});

test('saveJson swallows write/setup failures while saveJsonStrict throws them', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const blockingPath = path.join(tempDir, 'not-a-dir');
  const targetPath = path.join(blockingPath, 'state.json');

  fs.writeFileSync(blockingPath, 'blocking file', 'utf8');

  assert.doesNotThrow(() => {
    fsStorage.saveJson(targetPath, { ok: true });
  });
  assert.equal(fs.existsSync(targetPath), false);

  let strictError = null;
  try {
    fsStorage.saveJsonStrict(targetPath, { ok: true });
  } catch (err) {
    strictError = err;
  }

  assert.ok(strictError instanceof Error);
  assert.equal(fs.existsSync(targetPath), false);
});
