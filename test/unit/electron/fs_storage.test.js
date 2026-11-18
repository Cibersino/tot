'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Log = require('../../../electron/log');
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

function captureWarnings(action) {
  const previousLevel = Log.getLevel();
  const originalWarn = console.warn;
  const warnings = [];
  Log.setLevel('warn');
  console.warn = (...args) => warnings.push(args);
  try {
    action();
    return warnings;
  } finally {
    console.warn = originalWarn;
    Log.setLevel(previousLevel);
  }
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

test('saveJsonDirectStrict retains direct parent creation and JSON persistence', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'nested', 'state.json');
  const payload = { language: 'en' };

  fsStorage.saveJsonDirectStrict(targetPath, payload);

  assert.equal(fs.readFileSync(targetPath, 'utf8'), JSON.stringify(payload, null, 2));
});

test('saveJsonStrict removes its staged file and preserves the destination when replacement fails', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'state.json');
  const originalContents = '{"language":"es"}';
  const originalRenameSync = fs.renameSync;

  fs.writeFileSync(targetPath, originalContents, 'utf8');
  t.mock.method(fs, 'renameSync', (oldPath, newPath) => {
    if (newPath === targetPath) {
      const error = new Error('replacement denied');
      error.code = 'EACCES';
      throw error;
    }
    return originalRenameSync.call(fs, oldPath, newPath);
  });

  assert.throws(() => fsStorage.saveJsonStrict(targetPath, { language: 'en' }), {
    code: 'EACCES',
  });
  assert.equal(fs.readFileSync(targetPath, 'utf8'), originalContents);
  assert.deepEqual(fs.readdirSync(tempDir), ['state.json']);
});

test('saveJson suppresses a replacement failure without changing the destination', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'state.json');
  const originalContents = '{"language":"es"}';
  const originalRenameSync = fs.renameSync;

  fs.writeFileSync(targetPath, originalContents, 'utf8');
  t.mock.method(fs, 'renameSync', (oldPath, newPath) => {
    if (newPath === targetPath) {
      const error = new Error('replacement denied');
      error.code = 'EACCES';
      throw error;
    }
    return originalRenameSync.call(fs, oldPath, newPath);
  });

  assert.doesNotThrow(() => fsStorage.saveJson(targetPath, { language: 'en' }));
  assert.equal(fs.readFileSync(targetPath, 'utf8'), originalContents);
  assert.deepEqual(fs.readdirSync(tempDir), ['state.json']);
});

test('saveJsonStrict preserves a write failure when closing the staged file also fails', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'state.json');
  const originalContents = '{"language":"es"}';
  const originalWriteFileSync = fs.writeFileSync;
  const originalCloseSync = fs.closeSync;
  let temporaryFileDescriptor = null;

  fs.writeFileSync(targetPath, originalContents, 'utf8');
  t.mock.method(fs, 'writeFileSync', (filePath, ...args) => {
    if (typeof filePath === 'number') {
      temporaryFileDescriptor = filePath;
      const error = new Error('replacement staging failed');
      error.code = 'ENOSPC';
      throw error;
    }
    return originalWriteFileSync.call(fs, filePath, ...args);
  });
  t.mock.method(fs, 'closeSync', (fileDescriptor, ...args) => {
    const result = originalCloseSync.call(fs, fileDescriptor, ...args);
    if (fileDescriptor === temporaryFileDescriptor) {
      const error = new Error('temporary close failed');
      error.code = 'EIO';
      throw error;
    }
    return result;
  });

  assert.throws(() => fsStorage.saveJsonStrict(targetPath, { language: 'en' }), {
    code: 'ENOSPC',
  });
  assert.equal(fs.readFileSync(targetPath, 'utf8'), originalContents);
  assert.deepEqual(fs.readdirSync(tempDir), ['state.json']);
});

test('saveJsonStrict preserves ordinary POSIX permission bits on replacement', {
  skip: process.platform === 'win32',
}, (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'state.json');

  fs.writeFileSync(targetPath, '{"language":"es"}', 'utf8');
  fs.chmodSync(targetPath, 0o640);
  fsStorage.saveJsonStrict(targetPath, { language: 'en' });

  assert.equal(fs.statSync(targetPath).mode & 0o777, 0o640);
});

test('saveJsonStrict does not bypass ordinary POSIX file write restrictions', {
  skip: process.platform === 'win32' || process.getuid?.() === 0,
}, (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'state.json');
  const originalContents = '{"language":"es"}';

  fs.writeFileSync(targetPath, originalContents, 'utf8');
  fs.chmodSync(targetPath, 0o444);
  try {
    assert.throws(
      () => fsStorage.saveJsonStrict(targetPath, { language: 'en' }),
      (error) => error && (error.code === 'EACCES' || error.code === 'EPERM')
    );
  } finally {
    fs.chmodSync(targetPath, 0o600);
  }

  assert.equal(fs.readFileSync(targetPath, 'utf8'), originalContents);
});

test('saveJsonStrict keeps symbolic links on their direct-write semantics', {
  skip: process.platform === 'win32',
}, (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'target.json');
  const symlinkPath = path.join(tempDir, 'linked.json');

  fs.writeFileSync(targetPath, '{"language":"es"}', 'utf8');
  fs.symlinkSync(targetPath, symlinkPath);
  fsStorage.saveJsonStrict(symlinkPath, { language: 'en' });
  assert.equal(fs.lstatSync(symlinkPath).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(targetPath, 'utf8'), JSON.stringify({ language: 'en' }, null, 2));
});

test('saveJsonStrict keeps hard links on their direct-write semantics', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'target.json');
  const hardLinkPath = path.join(tempDir, 'hard-linked.json');

  fs.writeFileSync(targetPath, '{"language":"es"}', 'utf8');
  fs.linkSync(targetPath, hardLinkPath);
  const warnings = captureWarnings(() => {
    fsStorage.saveJsonStrict(hardLinkPath, { language: 'fr' });
  });

  assert.equal(fs.readFileSync(targetPath, 'utf8'), JSON.stringify({ language: 'fr' }, null, 2));
  assert.equal(fs.readFileSync(hardLinkPath, 'utf8'), JSON.stringify({ language: 'fr' }, null, 2));
  assert.deepEqual(warnings, [[
    '[WARN][fs-storage]',
    'JSON replacement skipped; using direct write for a destination that cannot be safely replaced:',
    hardLinkPath,
  ]]);
});

test('saveJsonStrict reports direct writing when sibling temporary-file access is unavailable', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'state.json');
  const originalAccessSync = fs.accessSync;
  const accessError = new Error('temporary-file creation denied');
  accessError.code = 'EACCES';

  fs.writeFileSync(targetPath, '{"language":"es"}', 'utf8');
  t.mock.method(fs, 'accessSync', (target, mode) => {
    if (target === tempDir && mode === (fs.constants.W_OK | fs.constants.X_OK)) {
      throw accessError;
    }
    return originalAccessSync.call(fs, target, mode);
  });

  const warnings = captureWarnings(() => {
    fsStorage.saveJsonStrict(targetPath, { language: 'en' });
  });

  assert.equal(fs.readFileSync(targetPath, 'utf8'), JSON.stringify({ language: 'en' }, null, 2));
  assert.deepEqual(warnings, [[
    '[WARN][fs-storage]',
    'JSON replacement skipped; using direct write after temporary-file creation access check failed:',
    tempDir,
    accessError,
  ]]);
});

test('saveJsonStrict does not replace a non-file destination', (t) => {
  const tempDir = createTempDir(t);
  const fsStorage = loadFreshFsStorage();
  const targetPath = path.join(tempDir, 'state.json');

  fs.mkdirSync(targetPath);
  assert.throws(() => fsStorage.saveJsonStrict(targetPath, { language: 'en' }));
  assert.equal(fs.statSync(targetPath).isDirectory(), true);
  assert.deepEqual(fs.readdirSync(tempDir), ['state.json']);
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
