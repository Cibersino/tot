'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

const {
  IMPORT_CONFLICT_STRATEGY,
  importSelectedFiles,
} = require('../../../electron/reading_test_pool_import');

function makeTempDir() {
  return createTestTempDir('reading-test-import');
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function createSnapshotData({ text, tags = {}, readingTest } = {}) {
  const snapshot = {
    type: 'text snapshot',
    meta: {
      savedAt: '2026-08-03T00:00:00.000Z',
      savedWith: 'toT (totapp.org)',
    },
    text,
    tags,
  };
  if (readingTest !== undefined) {
    snapshot.readingTest = readingTest;
  }
  return snapshot;
}

function createIpcMainDouble() {
  const handlers = new Map();
  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    async invoke(channel, event, ...args) {
      if (!handlers.has(channel)) {
        throw new Error(`No ipcMain.handle registered for ${channel}`);
      }
      return handlers.get(channel)(event, ...args);
    },
  };
}

function loadFreshReadingTestPoolImportForIpc({
  statePath,
  poolDir,
  senderWin,
  openDialogResult,
  dialogOptions = null,
  clearImportedPoolEntriesStateImpl = null,
  settingsGet = null,
} = {}) {
  const modulePath = require.resolve('../../../electron/reading_test_pool_import');
  const poolModulePath = require.resolve('../../../electron/reading_test_pool');
  const fsStorageModulePath = require.resolve('../../../electron/fs_storage');
  const settingsModulePath = require.resolve('../../../electron/settings');
  const originalPoolModule = require.cache[poolModulePath];
  const originalFsStorageModule = require.cache[fsStorageModulePath];
  const originalSettingsModule = require.cache[settingsModulePath];
  const restoreElectronModule = installElectronModuleMock({
    dialog: {
      async showOpenDialog(_mainWin, options) {
        if (Array.isArray(dialogOptions)) dialogOptions.push(options);
        return openDialogResult;
      },
      async showMessageBox(_mainWin, options) {
        if (Array.isArray(dialogOptions)) dialogOptions.push(options);
        return { response: 0 };
      },
    },
    BrowserWindow: {
      fromWebContents(webContents) {
        return webContents === senderWin.webContents ? senderWin : null;
      },
    },
    app: {},
  });

  require.cache[poolModulePath] = {
    id: poolModulePath,
    filename: poolModulePath,
    loaded: true,
    exports: {
      sanitizePoolData(rawData) {
        if (!rawData || typeof rawData.text !== 'string' || !rawData.text.length) {
          return { ok: false, code: 'INVALID_TEXT' };
        }
        return { ok: true, data: rawData };
      },
      resolvePoolContext({ poolDir: requestedPoolDir } = {}) {
        const ok = !requestedPoolDir || requestedPoolDir === poolDir;
        if (ok) {
          fs.mkdirSync(poolDir, { recursive: true });
        }
        return {
          ok,
          poolDir,
        };
      },
      resolvePoolDestination(_context, destinationName) {
        const destinationPath = path.join(poolDir, destinationName);
        if (!fs.existsSync(destinationPath)) {
          return {
            ok: true,
            destinationPath,
            entry: { exists: false, kind: 'missing' },
          };
        }
        const stats = fs.lstatSync(destinationPath);
        return {
          ok: true,
          destinationPath,
          entry: {
            exists: true,
            kind: stats.isFile() ? 'file' : (stats.isDirectory() ? 'directory' : 'other'),
          },
        };
      },
      writePoolJsonEntry(_context, destinationName, payload, { replace = false } = {}) {
        const destinationPath = path.join(poolDir, destinationName);
        const exists = fs.existsSync(destinationPath);
        if (exists && !replace) {
          return { ok: false, code: 'DESTINATION_EXISTS' };
        }
        fs.writeFileSync(destinationPath, JSON.stringify(payload, null, 2), {
          encoding: 'utf8',
          ...(exists ? {} : { flag: 'wx' }),
        });
        return { ok: true };
      },
      buildPoolSnapshotRelPath(destinationName) {
        const normalizedName = String(destinationName || '').trim();
        return normalizedName ? `/reading_speed_test_pool/${normalizedName}` : '';
      },
      clearImportedPoolEntriesState(snapshotRelPaths) {
        if (typeof clearImportedPoolEntriesStateImpl === 'function') {
          return clearImportedPoolEntriesStateImpl(snapshotRelPaths);
        }
        return { ok: true, updated: Array.isArray(snapshotRelPaths) ? snapshotRelPaths.length : 0 };
      },
    },
  };

  require.cache[fsStorageModulePath] = {
    id: fsStorageModulePath,
    filename: fsStorageModulePath,
    loaded: true,
    exports: {
      getReadingTestPoolImportStateFile() {
        return statePath;
      },
      loadJson(filePath, fallbackValue) {
        if (!fs.existsSync(filePath)) return fallbackValue;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      },
      saveJson(filePath, value) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
      },
    },
  };

  if (typeof settingsGet === 'function') {
    require.cache[settingsModulePath] = {
      id: settingsModulePath,
      filename: settingsModulePath,
      loaded: true,
      exports: {
        getSettings: settingsGet,
      },
    };
  }

  delete require.cache[modulePath];
  const readingTestPoolImport = require(modulePath);

  function restore() {
    delete require.cache[modulePath];
    restoreElectronModule();

    if (originalPoolModule) {
      require.cache[poolModulePath] = originalPoolModule;
    } else {
      delete require.cache[poolModulePath];
    }

    if (originalFsStorageModule) {
      require.cache[fsStorageModulePath] = originalFsStorageModule;
    } else {
      delete require.cache[fsStorageModulePath];
    }

    if (originalSettingsModule) {
      require.cache[settingsModulePath] = originalSettingsModule;
    } else {
      delete require.cache[settingsModulePath];
    }
  }

  return { readingTestPoolImport, restore };
}

test('importSelectedFiles imports a valid canonical snapshot and preserves readingTest questions', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'sample.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(sourcePath, createSnapshotData({
    text: 'Sample reading text.',
    tags: {
      language: 'EN',
      type: 'Non fiction',
      difficulty: 'HARD',
    },
    readingTest: {
      questions: [
        {
          id: 'q1',
          prompt: 'What happened?',
          correctOptionId: 'a',
          options: [
            { id: 'a', text: 'One thing' },
            { id: 'b', text: 'Another thing' },
          ],
        },
      ],
    },
  }));

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.canceled, false);
  assert.equal(result.imported, 1);
  assert.equal(result.skippedDuplicates, 0);
  assert.equal(result.failedValidation, 0);
  assert.equal(result.failedArchiveEntries, 0);
  assert.equal(result.failedWrites, 0);

  const importedPath = path.join(poolDir, 'sample.json');
  const imported = JSON.parse(fs.readFileSync(importedPath, 'utf8'));
  assert.equal(imported.type, 'text snapshot');
  assert.deepEqual(imported.meta, {
    savedAt: '2026-08-03T00:00:00.000Z',
    savedWith: 'toT (totapp.org)',
  });
  assert.equal(imported.text, 'Sample reading text.');
  assert.deepEqual(imported.tags, {
    language: 'en',
    type: 'non_fiction',
    difficulty: 'hard',
  });
  assert.deepEqual(imported.readingTest, {
    questions: [
      {
        id: 'q1',
        prompt: 'What happened?',
        correctOptionId: 'a',
        options: [
          { id: 'a', text: 'One thing' },
          { id: 'b', text: 'Another thing' },
        ],
      },
    ],
  });
});

test('importSelectedFiles rejects imported json that contains invalid readingTest questions', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'invalid-reading-test.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(sourcePath, createSnapshotData({
    text: 'Invalid imported text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
    readingTest: {
      invalid: true,
    },
  }));

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.failedValidation, 1);
  assert.equal(fs.existsSync(path.join(poolDir, 'invalid-reading-test.json')), false);
});

test('importSelectedFiles rejects legacy snapshot JSON', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'legacy-snapshot.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(sourcePath, {
    text: 'Former snapshot shape.',
    tags: { language: 'en' },
  });

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.failedValidation, 1);
  assert.equal(fs.existsSync(path.join(poolDir, 'legacy-snapshot.json')), false);
});

test('importSelectedFiles imports valid zip entries and reports invalid json entries as failed validation', async () => {
  const tempDir = makeTempDir();
  const zipPath = path.join(tempDir, 'pack.zip');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  fs.mkdirSync(poolDir, { recursive: true });

  const zip = new AdmZip();
  zip.addFile('valid.json', Buffer.from(JSON.stringify(createSnapshotData({
    text: 'Zip reading text.',
    tags: {
      language: 'fr',
      type: 'fiction',
      difficulty: 'normal',
    },
  }), null, 2), 'utf8'));
  zip.addFile('invalid.json', Buffer.from('{invalid', 'utf8'));
  zip.addFile('notes.txt', Buffer.from('ignore me', 'utf8'));
  zip.writeZip(zipPath);

  const result = await importSelectedFiles({
    selectedPaths: [zipPath],
    poolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 1);
  assert.equal(result.skippedDuplicates, 0);
  assert.equal(result.failedValidation, 1);
  assert.equal(result.failedArchiveEntries, 0);
  assert.equal(result.failedWrites, 0);

  const importedPath = path.join(poolDir, 'valid.json');
  assert.equal(fs.existsSync(importedPath), true);
});

test('importSelectedFiles skips duplicate destination filenames when conflict strategy is skip', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'duplicate.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(path.join(poolDir, 'duplicate.json'), createSnapshotData({
    text: 'Existing text.',
    tags: {
      language: 'es',
      type: 'fiction',
      difficulty: 'easy',
    },
  }));
  writeJson(sourcePath, createSnapshotData({
    text: 'Imported text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
  }));

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
    resolveConflictStrategy: async () => IMPORT_CONFLICT_STRATEGY.SKIP,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.skippedDuplicates, 1);
  assert.equal(result.failedWrites, 0);

  const imported = JSON.parse(fs.readFileSync(path.join(poolDir, 'duplicate.json'), 'utf8'));
  assert.equal(imported.text, 'Existing text.');
});

test('importSelectedFiles replaces duplicate destination filenames when conflict strategy is replace', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'duplicate.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(path.join(poolDir, 'duplicate.json'), createSnapshotData({
    text: 'Existing text.',
    tags: {
      language: 'es',
      type: 'fiction',
      difficulty: 'easy',
    },
  }));
  writeJson(sourcePath, createSnapshotData({
    text: 'Replacement text.',
    tags: {
      language: 'pt',
      type: 'non_fiction',
      difficulty: 'normal',
    },
  }));

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
    resolveConflictStrategy: async () => IMPORT_CONFLICT_STRATEGY.REPLACE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 1);
  assert.equal(result.skippedDuplicates, 0);
  assert.equal(result.failedWrites, 0);

  const imported = JSON.parse(fs.readFileSync(path.join(poolDir, 'duplicate.json'), 'utf8'));
  assert.equal(imported.text, 'Replacement text.');
  assert.equal(imported.tags.language, 'pt');
});

test('importSelectedFiles rejects a redirected replacement destination', async (t) => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'duplicate.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  const destinationPath = path.join(poolDir, 'duplicate.json');
  const outsidePath = path.join(tempDir, 'outside.json');
  fs.mkdirSync(poolDir, { recursive: true });
  writeJson(sourcePath, createSnapshotData({ text: 'Imported replacement.' }));
  writeJson(outsidePath, createSnapshotData({ text: 'Outside content.' }));

  try {
    fs.symlinkSync(outsidePath, destinationPath, 'file');
  } catch (err) {
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
      t.skip('file symlinks are unavailable in this test environment');
      return;
    }
    throw err;
  }

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
    resolveConflictStrategy: async () => IMPORT_CONFLICT_STRATEGY.REPLACE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.failedWrites, 1);
  assert.equal(JSON.parse(fs.readFileSync(outsidePath, 'utf8')).text, 'Outside content.');
});

test('importSelectedFiles reports failed final writes explicitly', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'blocked.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(sourcePath, createSnapshotData({
    text: 'Blocked replacement text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
  }));

  const blockedDestinationPath = path.join(poolDir, 'blocked.json');
  fs.mkdirSync(blockedDestinationPath, { recursive: true });

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
    resolveConflictStrategy: async () => IMPORT_CONFLICT_STRATEGY.REPLACE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.skippedDuplicates, 0);
  assert.equal(result.failedValidation, 0);
  assert.equal(result.failedArchiveEntries, 0);
  assert.equal(result.failedWrites, 1);
});

test('importSelectedFiles keeps its summary contract when the pool context is unavailable', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'sample.json');
  const invalidPoolDir = path.join(tempDir, 'not_the_pool_directory');

  writeJson(sourcePath, createSnapshotData({ text: 'Imported text.' }));

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir: invalidPoolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.canceled, false);
  assert.equal(result.imported, 0);
  assert.equal(result.skippedDuplicates, 0);
  assert.equal(result.failedValidation, 0);
  assert.equal(result.failedArchiveEntries, 0);
  assert.equal(result.failedWrites, 1);
  assert.deepEqual(result.writtenDestinationNames, []);
  assert.equal(fs.existsSync(path.join(invalidPoolDir, 'sample.json')), false);
});

test('importSelectedFiles rejects imported json that contains unsupported tag keys', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'invalid.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(sourcePath, createSnapshotData({
    text: 'Invalid imported text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
      obsolete: false,
    },
  }));

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.failedValidation, 1);
  assert.equal(fs.existsSync(path.join(poolDir, 'invalid.json')), false);
});

test('registerIpc returns partial success when imported files are written but pool-state cleanup fails', async (t) => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'sample.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  const statePath = path.join(tempDir, 'picker_state.json');
  let cleanupDestinationNames = null;
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };

  writeJson(sourcePath, createSnapshotData({
    text: 'Imported text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
  }));

  const { readingTestPoolImport, restore } = loadFreshReadingTestPoolImportForIpc({
    statePath,
    poolDir,
    senderWin,
    openDialogResult: {
      canceled: false,
      filePaths: [sourcePath],
    },
    clearImportedPoolEntriesStateImpl(destinationNames) {
      cleanupDestinationNames = destinationNames;
      return { ok: false, code: 'WRITE_FAILED', message: 'disk full' };
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  readingTestPoolImport.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
    isReadingTestInteractionLocked: () => false,
  });

  const result = await ipcMain.invoke(
    'reading-test-import-pool-files',
    { sender: senderWin.webContents },
    {}
  );

  assert.equal(result.ok, true);
  assert.equal(result.imported, 1);
  assert.deepEqual(cleanupDestinationNames, ['sample.json']);
  assert.equal(result.partialSuccess, true);
  assert.equal(
    result.warningGuidanceKey,
    'renderer.reading_test.alerts.pool_import_state_cleanup_failed'
  );
  assert.equal(fs.existsSync(path.join(poolDir, 'sample.json')), true);
});

test('registerIpc resolves reading-test picker and conflict copy from main dialog translations', async (t) => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'duplicate.json');
  const poolDir = path.join(tempDir, 'reading_speed_test_pool');
  const statePath = path.join(tempDir, 'picker_state.json');
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const dialogOptions = [];

  fs.mkdirSync(poolDir, { recursive: true });
  writeJson(sourcePath, createSnapshotData({
    text: 'Replacement text.',
    tags: { language: 'en', type: 'fiction', difficulty: 'normal' },
  }));
  writeJson(path.join(poolDir, 'duplicate.json'), createSnapshotData({
    text: 'Existing text.',
    tags: { language: 'en', type: 'fiction', difficulty: 'normal' },
  }));

  const { readingTestPoolImport, restore } = loadFreshReadingTestPoolImportForIpc({
    statePath,
    poolDir,
    senderWin,
    dialogOptions,
    openDialogResult: {
      canceled: false,
      filePaths: [sourcePath],
    },
    settingsGet() {
      return { language: 'en' };
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  readingTestPoolImport.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
    isReadingTestInteractionLocked: () => false,
  });

  const result = await ipcMain.invoke(
    'reading-test-import-pool-files',
    { sender: senderWin.webContents }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(dialogOptions[0].filters.map((filter) => filter.name), [
    'Reading test files',
    'JSON',
    'ZIP',
    'All files',
  ]);
  assert.equal(dialogOptions[1].title, 'Import files');
  assert.equal(dialogOptions[1].message, 'Some imported files already exist in the pool. How should duplicates be handled?');
  assert.deepEqual(dialogOptions[1].buttons, [
    'Skip duplicates',
    'Replace duplicates',
    'Cancel import',
  ]);
});

test('registerIpc resolves reading-test picker copy through DEFAULT_LANG when settings are unavailable', async (t) => {
  const tempDir = makeTempDir();
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const dialogOptions = [];
  const { readingTestPoolImport, restore } = loadFreshReadingTestPoolImportForIpc({
    statePath: path.join(tempDir, 'picker_state.json'),
    poolDir: path.join(tempDir, 'reading_speed_test_pool'),
    senderWin,
    dialogOptions,
    openDialogResult: { canceled: true, filePaths: [] },
    settingsGet() {
      throw new Error('settings unavailable');
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  readingTestPoolImport.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
    isReadingTestInteractionLocked: () => false,
  });

  const result = await ipcMain.invoke(
    'reading-test-import-pool-files',
    { sender: senderWin.webContents }
  );

  assert.deepEqual(result, { ok: true, canceled: true });
  assert.deepEqual(dialogOptions[0].filters.map((filter) => filter.name), [
    'Archivos de test de lectura',
    'JSON',
    'ZIP',
    'Todos los archivos',
  ]);
});
