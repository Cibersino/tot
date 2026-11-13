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

test('loadJsonWithStatus preserves status, fallback, and BOM behavior across startup-relevant reads', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const fallback = { language: 'es' };
  const targetPath = path.join(tempDir, 'state.json');

  assert.deepEqual(
    fsStorage.loadJsonWithStatus(targetPath, fallback),
    { status: 'missing', value: fallback }
  );

  fs.writeFileSync(targetPath, '\uFEFF{"language":"en"}', 'utf8');
  assert.deepEqual(
    fsStorage.loadJsonWithStatus(targetPath, fallback),
    { status: 'loaded', value: { language: 'en' } }
  );

  fs.writeFileSync(targetPath, '   ', 'utf8');
  assert.deepEqual(
    fsStorage.loadJsonWithStatus(targetPath, fallback),
    { status: 'empty', value: fallback }
  );

  fs.writeFileSync(targetPath, '{not-json', 'utf8');
  const invalidJsonResult = fsStorage.loadJsonWithStatus(targetPath, fallback);
  assert.equal(invalidJsonResult.status, 'failed');
  assert.equal(invalidJsonResult.value, fallback);

  fs.writeFileSync(targetPath, '{"language":"en"}', 'utf8');
  assert.deepEqual(
    fsStorage.loadJsonWithStatus(targetPath, fallback),
    { status: 'loaded', value: { language: 'en' } }
  );
});

test('loadJsonWithStatus treats only ENOENT as missing and preserves non-ENOENT failures as failed', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'user_settings.json');
  const fallback = { language: 'es' };
  const originalReadFileSync = fs.readFileSync;
  const inaccessible = new Error('access denied');
  inaccessible.code = 'EACCES';

  t.mock.method(fs, 'readFileSync', (filePath, ...args) => {
    if (filePath === targetPath) throw inaccessible;
    return originalReadFileSync.call(fs, filePath, ...args);
  });

  const result = fsStorage.loadJsonWithStatus(targetPath, fallback);
  assert.deepEqual(result, { status: 'failed', value: fallback });
  assert.equal(fsStorage.loadJson(targetPath, fallback), fallback);
});

test('createJsonStrict creates only a new file in an existing parent directory', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'state.json');
  const payload = { language: 'en' };

  fsStorage.createJsonStrict(targetPath, payload);

  assert.equal(fs.readFileSync(targetPath, 'utf8'), JSON.stringify(payload, null, 2));
  assert.throws(() => fsStorage.createJsonStrict(targetPath, payload), { code: 'EEXIST' });
  assert.throws(
    () => fsStorage.createJsonStrict(path.join(tempDir, 'missing', 'state.json'), payload),
    { code: 'ENOENT' }
  );
});

test('createJsonStrict can prepare a missing parent without replacing an appearing file', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'new-parent', 'user_settings.json');
  const payload = { language: 'en' };

  fsStorage.createJsonStrict(targetPath, payload, { ensureParent: true });
  assert.equal(fs.readFileSync(targetPath, 'utf8'), JSON.stringify(payload, null, 2));

  fs.writeFileSync(targetPath, '{"language":"es"}', 'utf8');
  assert.throws(
    () => fsStorage.createJsonStrict(targetPath, payload, { ensureParent: true }),
    { code: 'EEXIST' }
  );
  assert.equal(fs.readFileSync(targetPath, 'utf8'), '{"language":"es"}');
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

test('getTaskFilePickerStateFile keeps Task Editor picker state under the task config directory', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  fsStorage.initStorage({
    getPath(key) {
      return key === 'userData' ? tempDir : '';
    },
    getAppPath() {
      return tempDir;
    },
    isReady() {
      return true;
    },
  });

  assert.equal(
    fsStorage.getTaskFilePickerStateFile(),
    path.join(tempDir, 'config', 'tasks', 'task_file_picker_state.json')
  );
});
