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
  const loadedWithRawBytes = fsStorage.loadJsonWithStatus(
    targetPath,
    fallback,
    { includeRawBytes: true }
  );
  assert.deepEqual(loadedWithRawBytes.value, { language: 'en' });
  assert.deepEqual(loadedWithRawBytes.rawBytes, Buffer.from('\uFEFF{"language":"en"}', 'utf8'));

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

test('createSettingsStartupBackup preserves raw bytes, advances arbitrary-size generations, and retains three files', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const settingsFile = path.join(tempDir, 'user_settings.json');
  const initialBytes = Buffer.from('\uFEFF{"language":"es"}\r\n', 'utf8');

  fsStorage.createSettingsStartupBackup(settingsFile, initialBytes);
  fsStorage.createSettingsStartupBackup(settingsFile, Buffer.from('{"language":"en"}', 'utf8'));
  fsStorage.createSettingsStartupBackup(settingsFile, Buffer.from('{"modeConteo":"simple"}', 'utf8'));
  fsStorage.createSettingsStartupBackup(settingsFile, Buffer.from('{"previewSpoilerEnabled":false}', 'utf8'));

  assert.deepEqual(
    fs.readdirSync(tempDir).sort(),
    [
      'user_settings.json.backup.2',
      'user_settings.json.backup.3',
      'user_settings.json.backup.4',
    ]
  );
  assert.deepEqual(
    fs.readFileSync(path.join(tempDir, 'user_settings.json.backup.2')),
    Buffer.from('{"language":"en"}', 'utf8')
  );

  const largeGeneration = '900719925474099312345678901234567890';
  fs.writeFileSync(path.join(tempDir, `user_settings.json.backup.${largeGeneration}`), initialBytes);
  fsStorage.createSettingsStartupBackup(settingsFile, initialBytes);
  assert.equal(
    fs.existsSync(path.join(tempDir, `user_settings.json.backup.${BigInt(largeGeneration) + 1n}`)),
    true
  );
});

test('createSettingsStartupBackup never replaces a colliding backup and exposes pruning failures', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const settingsFile = path.join(tempDir, 'user_settings.json');
  const originalBytes = Buffer.from('{"language":"es"}', 'utf8');
  const originalWriteFileSync = fs.writeFileSync;
  let writeOptions = null;

  t.mock.method(fs, 'writeFileSync', (filePath, data, options) => {
    if (filePath === path.join(tempDir, 'user_settings.json.backup.1')) {
      writeOptions = options;
      originalWriteFileSync.call(fs, filePath, Buffer.from('concurrent backup', 'utf8'), {
        flag: 'wx',
      });
      const error = new Error('backup appeared concurrently');
      error.code = 'EEXIST';
      throw error;
    }
    return originalWriteFileSync.call(fs, filePath, data, options);
  });
  assert.throws(
    () => fsStorage.createSettingsStartupBackup(settingsFile, originalBytes),
    { code: 'EEXIST' }
  );
  assert.deepEqual(writeOptions, { flag: 'wx' });
  assert.deepEqual(
    fs.readFileSync(path.join(tempDir, 'user_settings.json.backup.1')),
    Buffer.from('concurrent backup', 'utf8')
  );
  t.mock.restoreAll();

  for (const generation of ['1', '2', '3']) {
    fs.writeFileSync(
      path.join(tempDir, `user_settings.json.backup.${generation}`),
      originalBytes
    );
  }
  const originalUnlinkSync = fs.unlinkSync;
  t.mock.method(fs, 'unlinkSync', (filePath, ...args) => {
    if (filePath === path.join(tempDir, 'user_settings.json.backup.1')) {
      const error = new Error('backup pruning denied');
      error.code = 'EACCES';
      throw error;
    }
    return originalUnlinkSync.call(fs, filePath, ...args);
  });
  assert.throws(
    () => fsStorage.createSettingsStartupBackup(settingsFile, originalBytes),
    { code: 'EACCES' }
  );
  assert.equal(fs.existsSync(path.join(tempDir, 'user_settings.json.backup.4')), true);
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

test('getTaskEditorStateFile keeps combined Task Editor presentation state at the config root', (t) => {
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
    fsStorage.getTaskEditorStateFile(),
    path.join(tempDir, 'config', 'task_editor_state.json')
  );
});
