'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const snapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');

const BUNDLED_POOL_DIR = path.resolve(__dirname, '../../../electron/reading_test_pool');

function createIpcMainDouble() {
  const handlers = new Map();

  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    async invoke(channel, event, ...args) {
      if (!handlers.has(channel)) {
        throw new Error(`Missing IPC handler: ${channel}`);
      }
      return handlers.get(channel)(event, ...args);
    },
  };
}

function createSnapshotFileData(text, tags = {}) {
  return {
    type: 'text snapshot',
    meta: {
      savedAt: '2026-01-02T03:04:05.000Z',
      savedWith: 'toT (totapp.org)',
    },
    text,
    tags,
  };
}

function createSnapshotWithReadingEstimate(text) {
  return {
    ...createSnapshotFileData(text),
    metrics: {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'en',
      },
      reading: {
        estimatedSeconds: 30,
        wpm: 200,
      },
    },
  };
}

function loadSnapshotsMainWithMocks({
  senderWin,
  rootDir,
  currentText = 'Snapshot text',
  settings = { language: 'en' },
  shellOpenPathResult = '',
  messageBoxResponse = 0,
  saveDialogResult = null,
  openDialogResult = null,
  saveJsonStrictImpl = null,
  createJsonStrictImpl = null,
}) {
  const snapshotsModulePath = path.resolve(
    __dirname,
    '../../../electron/current_text_snapshots_main.js'
  );
  const fsStorageModulePath = path.resolve(
    __dirname,
    '../../../electron/fs_storage.js'
  );
  const textStateModulePath = path.resolve(
    __dirname,
    '../../../electron/text_state.js'
  );
  const settingsModulePath = path.resolve(
    __dirname,
    '../../../electron/settings.js'
  );
  const menuBuilderModulePath = path.resolve(
    __dirname,
    '../../../electron/menu_builder.js'
  );

  const originalSnapshotsModule = require.cache[snapshotsModulePath];
  const originalFsStorageModule = require.cache[fsStorageModulePath];
  const originalTextStateModule = require.cache[textStateModulePath];
  const originalSettingsModule = require.cache[settingsModulePath];
  const originalMenuBuilderModule = require.cache[menuBuilderModulePath];
  const openPathCalls = [];
  const showMessageBoxCalls = [];
  const showSaveDialogCalls = [];
  const showOpenDialogCalls = [];
  const restoreElectronModule = installElectronModuleMock({
    dialog: {
      async showSaveDialog(ownerWin, options) {
        showSaveDialogCalls.push({ ownerWin, options });
        if (typeof saveDialogResult === 'function') {
          return saveDialogResult(ownerWin, options);
        }
        if (saveDialogResult) return saveDialogResult;
        throw new Error('showSaveDialog should not be used in non-interactive snapshot tests');
      },
      async showOpenDialog(ownerWin, options) {
        showOpenDialogCalls.push({ ownerWin, options });
        if (typeof openDialogResult === 'function') {
          return openDialogResult(ownerWin, options);
        }
        if (openDialogResult) return openDialogResult;
        throw new Error('showOpenDialog should not be used in this snapshot test');
      },
      async showMessageBox(ownerWin, options) {
        showMessageBoxCalls.push({ ownerWin, options });
        return { response: messageBoxResponse };
      },
    },
    BrowserWindow: {
      fromWebContents(webContents) {
        return webContents === senderWin.webContents ? senderWin : null;
      },
    },
    shell: {
      async openPath(targetPath) {
        openPathCalls.push(targetPath);
        return shellOpenPathResult;
      },
    },
  });

  require.cache[fsStorageModulePath] = {
    id: fsStorageModulePath,
    filename: fsStorageModulePath,
    loaded: true,
    exports: {
      getCurrentTextSnapshotsDir() {
        return rootDir;
      },
      ensureCurrentTextSnapshotsDir() {
        fs.mkdirSync(rootDir, { recursive: true });
      },
      saveJsonStrict(targetPath, payload) {
        if (typeof saveJsonStrictImpl === 'function') {
          return saveJsonStrictImpl(targetPath, payload);
        }
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));
      },
      createJsonStrict(targetPath, payload) {
        if (typeof createJsonStrictImpl === 'function') {
          return createJsonStrictImpl(targetPath, payload);
        }
        fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), {
          flag: 'wx',
        });
      },
    },
  };

  require.cache[textStateModulePath] = {
    id: textStateModulePath,
    filename: textStateModulePath,
    loaded: true,
    exports: {
      getCurrentText() {
        return currentText;
      },
      applyCurrentText(text) {
        return {
          length: String(text).length,
          truncated: false,
        };
      },
    },
  };

  require.cache[settingsModulePath] = {
    id: settingsModulePath,
    filename: settingsModulePath,
    loaded: true,
    exports: {
      getSettings() {
        return settings;
      },
    },
  };

  require.cache[menuBuilderModulePath] = {
    id: menuBuilderModulePath,
    filename: menuBuilderModulePath,
    loaded: true,
    exports: {
      resolveDialogText(_dialogTexts, key, fallback) {
        return fallback || key;
      },
      getDialogTexts() {
        return {};
      },
    },
  };

  delete require.cache[snapshotsModulePath];
  const snapshotsMain = require(snapshotsModulePath);

  function restore() {
    delete require.cache[snapshotsModulePath];
    if (originalSnapshotsModule) {
      require.cache[snapshotsModulePath] = originalSnapshotsModule;
    } else {
      delete require.cache[snapshotsModulePath];
    }
    restoreElectronModule();

    if (originalFsStorageModule) {
      require.cache[fsStorageModulePath] = originalFsStorageModule;
    } else {
      delete require.cache[fsStorageModulePath];
    }

    if (originalTextStateModule) {
      require.cache[textStateModulePath] = originalTextStateModule;
    } else {
      delete require.cache[textStateModulePath];
    }

    if (originalSettingsModule) {
      require.cache[settingsModulePath] = originalSettingsModule;
    } else {
      delete require.cache[settingsModulePath];
    }

    if (originalMenuBuilderModule) {
      require.cache[menuBuilderModulePath] = originalMenuBuilderModule;
    } else {
      delete require.cache[menuBuilderModulePath];
    }
  }

  return {
    snapshotsMain,
    restore,
    openPathCalls,
    showMessageBoxCalls,
    showSaveDialogCalls,
    showOpenDialogCalls,
  };
}

test('task-row snapshot inspection returns canonical optional metadata and reading metrics', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-inspect');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({ senderWin, rootDir });
  t.after(restore);

  fs.mkdirSync(rootDir, { recursive: true });
  const estimatedSnapshot = createSnapshotWithReadingEstimate('Estimated snapshot');
  estimatedSnapshot.name = 'Estimated reading';
  estimatedSnapshot.sourceComment = 'chapter-1.pdf';
  fs.writeFileSync(
    path.join(rootDir, 'with-estimate.json'),
    JSON.stringify(estimatedSnapshot, null, 2)
  );
  fs.writeFileSync(
    path.join(rootDir, 'without-estimate.json'),
    JSON.stringify(createSnapshotFileData('Unestimated snapshot'), null, 2)
  );
  fs.writeFileSync(
    path.join(rootDir, 'legacy.json'),
    JSON.stringify({ text: 'Legacy snapshot', tags: {} }, null, 2)
  );

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const withEstimate = await ipcMain.invoke(
    'current-text-snapshot-inspect',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/with-estimate.json' }
  );
  assert.deepEqual(withEstimate, {
    ok: true,
    name: 'Estimated reading',
    sourceComment: 'chapter-1.pdf',
    estimatedSeconds: 30,
    wpm: 200,
  });

  const withoutEstimate = await ipcMain.invoke(
    'current-text-snapshot-inspect',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/without-estimate.json' }
  );
  assert.deepEqual(withoutEstimate, {
    ok: true,
    name: null,
    sourceComment: null,
    estimatedSeconds: null,
    wpm: null,
  });

  const legacy = await ipcMain.invoke(
    'current-text-snapshot-inspect',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/legacy.json' }
  );
  assert.deepEqual(legacy, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'invalid snapshot schema',
  });

  const noncanonicalPath = await ipcMain.invoke(
    'current-text-snapshot-inspect',
    { sender: senderWin.webContents },
    { snapshotRelPath: 'with-estimate.json' }
  );
  assert.deepEqual(noncanonicalPath, {
    ok: false,
    code: 'INVALID_SNAPSHOT_PATH',
  });

  const malformedPath = await ipcMain.invoke(
    'current-text-snapshot-inspect',
    { sender: senderWin.webContents },
    { snapshotRelPath: false }
  );
  assert.deepEqual(malformedPath, {
    ok: false,
    code: 'INVALID_SNAPSHOT_PATH',
  });

  const malformedLoadPath = await ipcMain.invoke(
    'current-text-snapshot-load',
    { sender: senderWin.webContents },
    { snapshotRelPath: false }
  );
  assert.deepEqual(malformedLoadPath, {
    ok: false,
    code: 'INVALID_SNAPSHOT_PATH',
  });
});

test('non-interactive snapshot save creates deterministic collision-safe files and preserves tags', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: 'Batch snapshot text',
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const firstSave = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Lección ñ / Unit 1',
      name: 'Reading',
      sourceComment: 'chapter-1.pdf, Unit 1',
      includeCount: true,
      includeReading: false,
      tags: {
        language: 'es',
      },
    }
  );

  assert.equal(firstSave.ok, true);
  assert.equal(firstSave.filename, 'Lección_ñ_Unit_1.json');
  const firstPayload = JSON.parse(fs.readFileSync(path.join(rootDir, firstSave.filename), 'utf8'));
  assert.equal(firstPayload.type, 'text snapshot');
  assert.equal(firstPayload.meta.savedWith, 'toT (totapp.org)');
  assert.equal(new Date(firstPayload.meta.savedAt).toISOString(), firstPayload.meta.savedAt);
  assert.equal(firstPayload.text, 'Batch snapshot text');
  assert.equal(firstPayload.name, 'Reading');
  assert.equal(firstPayload.sourceComment, 'chapter-1.pdf, Unit 1');
  assert.deepEqual(firstPayload.tags, { language: 'es' });
  assert.deepEqual(firstPayload.metrics, {
    count: {
      words: 3,
      mode: 'preciso',
      locale: 'en',
    },
  });

  const secondSave = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Lección ñ / Unit 1',
      includeCount: true,
      includeReading: false,
      tags: null,
    }
  );

  assert.equal(secondSave.ok, true);
  assert.equal(secondSave.filename, 'Lección_ñ_Unit_1_2.json');
  const secondPayload = JSON.parse(fs.readFileSync(path.join(rootDir, secondSave.filename), 'utf8'));
  assert.deepEqual(secondPayload.tags, {});
});

test('non-interactive snapshot save normalizes reserved and fallback filename stems', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-derived-filenames');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({ senderWin, rootDir });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const reservedResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'COM1',
      includeCount: false,
      includeReading: false,
    }
  );
  assert.equal(reservedResult.filename, '_COM1.json');

  const fallbackResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: '///',
      includeCount: false,
      includeReading: false,
    }
  );
  assert.equal(fallbackResult.filename, 'current_text.json');
});

test('non-interactive snapshot save keeps the default sequence when no filename stem is supplied', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-default-filename');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({ senderWin, rootDir });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      includeCount: false,
      includeReading: false,
    }
  );

  assert.equal(result.filename, 'current_text_1.json');
});

test('non-interactive snapshot save retries the next suffix after exclusive creation reports EEXIST', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-exclusive-create-retry');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const createCalls = [];
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    createJsonStrictImpl(targetPath, payload) {
      createCalls.push(targetPath);
      if (createCalls.length === 1) {
        const error = new Error('appeared after candidate selection');
        error.code = 'EEXIST';
        throw error;
      }
      fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), { flag: 'wx' });
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Batch Unit',
      includeCount: false,
      includeReading: false,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.filename, 'Batch_Unit_2.json');
  assert.deepEqual(createCalls, [
    path.join(rootDir, 'Batch_Unit.json'),
    path.join(rootDir, 'Batch_Unit_2.json'),
  ]);
});

test('snapshot save derives count and reading metrics from exact text and settings', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-metrics');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: 'uno dos tres',
    settings: { language: 'es-cl', modeConteo: 'simple' },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Metrics',
      includeCount: true,
      includeReading: true,
      wpm: 180,
    }
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(fs.readFileSync(path.join(rootDir, result.filename), 'utf8'));
  assert.deepEqual(payload.metrics, {
    count: {
      words: 3,
      mode: 'simple',
    },
    reading: {
      estimatedSeconds: 1,
      wpm: 180,
    },
  });
});

test('simple snapshot metrics save without Intl locale canonicalization', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-simple-no-locale-canonicalization');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const originalGetCanonicalLocales = Intl.getCanonicalLocales;
  Intl.getCanonicalLocales = undefined;
  t.after(() => {
    Intl.getCanonicalLocales = originalGetCanonicalLocales;
  });

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: 'uno dos tres',
    settings: { language: 'invalid_locale!', modeConteo: 'simple' },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Simple metrics',
      includeCount: true,
      includeReading: false,
    }
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(fs.readFileSync(path.join(rootDir, result.filename), 'utf8'));
  assert.deepEqual(payload.metrics, {
    count: {
      words: 3,
      mode: 'simple',
    },
  });
});

test('snapshot save rounds exact half-second reading estimates upward', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-half-second-metrics');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: Array.from({ length: 123 }, () => 'word').join(' '),
    settings: { language: 'en', modeConteo: 'simple' },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Half second metrics',
      includeCount: true,
      includeReading: true,
      wpm: 120,
    }
  );

  assert.equal(result.ok, true);
  const payload = JSON.parse(fs.readFileSync(path.join(rootDir, result.filename), 'utf8'));
  assert.deepEqual(payload.metrics.reading, {
    estimatedSeconds: 62,
    wpm: 120,
  });
});

test('snapshot save accepts an intentional no-metrics request and rejects reading without count', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-no-metrics');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({ senderWin, rootDir });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const noMetricsResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'No Metrics',
      includeCount: false,
      includeReading: false,
    }
  );
  assert.equal(noMetricsResult.ok, true);
  const noMetricsPayload = JSON.parse(
    fs.readFileSync(path.join(rootDir, noMetricsResult.filename), 'utf8')
  );
  assert.equal(Object.prototype.hasOwnProperty.call(noMetricsPayload, 'metrics'), false);

  const invalidResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Invalid Metrics',
      includeCount: false,
      includeReading: true,
      wpm: 180,
    }
  );
  assert.deepEqual(invalidResult, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'snapshot reading requires count',
  });

  const invalidWpmResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Invalid WPM',
      includeCount: true,
      includeReading: true,
      wpm: 9,
    }
  );
  assert.deepEqual(invalidWpmResult, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'snapshot WPM invalid',
  });
});

test('manual snapshot save uses the optional name as its default filename and persists metadata', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-manual-metadata');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore, showSaveDialogCalls } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    saveDialogResult: { canceled: false, filePath: path.join(rootDir, 'selected.json') },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      name: 'Lectura ñ / Unit 1',
      sourceComment: 'texto importado',
      includeCount: false,
      includeReading: false,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(showSaveDialogCalls.length, 1);
  assert.equal(
    showSaveDialogCalls[0].options.defaultPath,
    path.join(rootDir, 'Lectura_ñ_Unit_1.json')
  );
  const saved = JSON.parse(fs.readFileSync(path.join(rootDir, 'selected.json'), 'utf8'));
  assert.equal(saved.name, 'Lectura ñ / Unit 1');
  assert.equal(saved.sourceComment, 'texto importado');
});

test('manual snapshot save preserves the valid native selected filename', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-native-selected-name');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const selectedPath = path.join(rootDir, 'Lección, №1.json');
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    saveDialogResult: { canceled: false, filePath: selectedPath },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      includeCount: false,
      includeReading: false,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.path, path.resolve(selectedPath));
  assert.equal(result.filename, path.basename(selectedPath));
  assert.equal(fs.existsSync(selectedPath), true);
});

test('manual snapshot save requires an existing destination parent', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-missing-parent');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const selectedPath = path.join(rootDir, 'new-folder', 'Plan.json');
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    saveDialogResult: { canceled: false, filePath: selectedPath },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    { includeCount: false, includeReading: false }
  );

  assert.deepEqual(result, { ok: false, code: 'WRITE_FAILED' });
  assert.equal(fs.existsSync(path.dirname(selectedPath)), false);
  assert.equal(fs.existsSync(selectedPath), false);
});

test('manual snapshot save overwrites an existing validated destination', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-existing-destination');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const selectedPath = path.join(rootDir, 'Existing.json');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(selectedPath, 'existing snapshot');
  const writeTargets = [];
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    saveDialogResult: { canceled: false, filePath: selectedPath },
    saveJsonStrictImpl(targetPath, payload) {
      writeTargets.push(targetPath);
      fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    { includeCount: false, includeReading: false }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(writeTargets, [path.resolve(selectedPath)]);
  assert.equal(result.path, path.resolve(selectedPath));
});

test('manual snapshot save rejects an existing destination whose canonical target is not a file', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-existing-non-file-target');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const selectedPath = path.join(rootDir, 'Plan.json');
  const canonicalPath = path.join(rootDir, 'snapshot-directory');
  fs.mkdirSync(canonicalPath, { recursive: true });
  fs.writeFileSync(selectedPath, 'selected alias remains unchanged');
  const writeTargets = [];
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    saveDialogResult: { canceled: false, filePath: selectedPath },
    saveJsonStrictImpl(targetPath, payload) {
      writeTargets.push(targetPath);
      fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2));
    },
  });
  const originalRealpathSync = fs.realpathSync;
  fs.realpathSync = (targetPath, ...args) => {
    if (path.resolve(targetPath) === path.resolve(selectedPath)) return canonicalPath;
    return originalRealpathSync(targetPath, ...args);
  };
  t.after(() => {
    fs.realpathSync = originalRealpathSync;
    restore();
  });

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    { includeCount: false, includeReading: false }
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'snapshot destination is not a file',
  });
  assert.deepEqual(writeTargets, []);
  assert.equal(fs.readFileSync(selectedPath, 'utf8'), 'selected alias remains unchanged');
  assert.equal(fs.statSync(canonicalPath).isDirectory(), true);
});

test('Snapshot Save, Select, Inspect, and Load retain an in-root canonical identity without a JSON suffix', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-canonical-non-json-identity');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const selectedPath = path.join(rootDir, 'Plan.json');
  const canonicalPath = path.join(rootDir, 'target.txt');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(selectedPath, 'selected alias remains unchanged');
  fs.writeFileSync(canonicalPath, 'existing canonical target');

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const {
    snapshotsMain,
    restore,
    showOpenDialogCalls,
  } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: 'Current text before loading',
    saveDialogResult: { canceled: false, filePath: selectedPath },
    openDialogResult: { canceled: false, filePaths: [selectedPath] },
  });
  const originalRealpathSync = fs.realpathSync;
  fs.realpathSync = (targetPath, ...args) => {
    if (path.resolve(targetPath) === path.resolve(selectedPath)) return canonicalPath;
    return originalRealpathSync(targetPath, ...args);
  };
  t.after(() => {
    fs.realpathSync = originalRealpathSync;
    restore();
  });

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const saveResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    { includeCount: false, includeReading: false }
  );
  assert.equal(saveResult.ok, true);
  assert.equal(saveResult.path, canonicalPath);
  assert.equal(saveResult.filename, 'target.txt');
  assert.equal(
    JSON.parse(fs.readFileSync(canonicalPath, 'utf8')).text,
    'Current text before loading'
  );
  assert.equal(fs.readFileSync(selectedPath, 'utf8'), 'selected alias remains unchanged');

  const selectResult = await ipcMain.invoke(
    'current-text-snapshot-select',
    { sender: senderWin.webContents }
  );
  assert.deepEqual(selectResult, { ok: true, snapshotRelPath: '/target.txt' });
  assert.equal(showOpenDialogCalls.length, 1);

  const inspectResult = await ipcMain.invoke(
    'current-text-snapshot-inspect',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/target.txt' }
  );
  assert.deepEqual(inspectResult, {
    ok: true,
    name: null,
    sourceComment: null,
    estimatedSeconds: null,
    wpm: null,
  });

  const loadResult = await ipcMain.invoke(
    'current-text-snapshot-load',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/target.txt' }
  );
  assert.equal(loadResult.ok, true);
  assert.equal(loadResult.path, canonicalPath);
  assert.equal(loadResult.snapshotRelPath, '/target.txt');
});

test('manual snapshot save retries invalid filenames without rewriting the selected path', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-invalid-filename-retry');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const invalidNoExtension = path.join(rootDir, 'Plan A');
  const invalidExistingUppercase = path.join(rootDir, 'Plan A.JSON');
  const selectedPath = path.join(rootDir, 'Plan B.json');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(invalidExistingUppercase, 'existing snapshot must remain untouched');
  const responses = [
    { canceled: false, filePath: invalidNoExtension },
    { canceled: false, filePath: invalidExistingUppercase },
    { canceled: false, filePath: selectedPath },
  ];
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const {
    snapshotsMain,
    restore,
    showMessageBoxCalls,
    showSaveDialogCalls,
  } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    saveDialogResult() {
      return responses.shift();
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    { includeCount: false, includeReading: false }
  );

  assert.equal(result.ok, true);
  assert.equal(result.path, path.resolve(selectedPath));
  assert.equal(fs.existsSync(invalidNoExtension), false);
  assert.equal(fs.readFileSync(invalidExistingUppercase, 'utf8'), 'existing snapshot must remain untouched');
  assert.equal(showSaveDialogCalls.length, 3);
  for (const { options } of showSaveDialogCalls) {
    assert.equal(options.defaultPath, path.join(rootDir, 'current_text_1.json'));
    assert.deepEqual(options.filters, [{ name: 'JSON', extensions: ['json'] }]);
    assert.deepEqual(options.properties, ['showOverwriteConfirmation']);
  }
  assert.equal(showMessageBoxCalls.length, 2);
  for (const { options } of showMessageBoxCalls) {
    assert.equal(options.message, 'snapshot_invalid_filename');
    assert.deepEqual(options.buttons, ['ok']);
  }
});

test('manual snapshot save returns CANCELLED after an invalid filename retry', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-invalid-filename-cancel');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const responses = [
    { canceled: false, filePath: path.join(rootDir, 'Plan A') },
    { canceled: true },
  ];
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const {
    snapshotsMain,
    restore,
    showMessageBoxCalls,
    showSaveDialogCalls,
  } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    saveDialogResult() {
      return responses.shift();
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    { includeCount: false, includeReading: false }
  );

  assert.deepEqual(result, { ok: false, code: 'CANCELLED' });
  assert.equal(showSaveDialogCalls.length, 2);
  assert.equal(showMessageBoxCalls.length, 1);
  assert.equal(fs.existsSync(rootDir), true);
  assert.deepEqual(fs.readdirSync(rootDir), []);
});

test('snapshot save rejects invalid optional name and source-comment values', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-metadata-limit');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const invalidNameResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'source-filename',
      name: 'x'.repeat(121),
      includeCount: true,
      includeReading: false,
      tags: null,
    }
  );

  assert.deepEqual(invalidNameResult, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'snapshot name invalid',
  });

  const invalidSourceCommentResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'source-filename',
      sourceComment: 'source\ncomment',
      includeCount: true,
      includeReading: false,
      tags: null,
    }
  );
  assert.deepEqual(invalidSourceCommentResult, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'snapshot source comment invalid',
  });
  assert.deepEqual(fs.readdirSync(rootDir), []);
});

test('non-interactive snapshot save accepts permitted custom tag values', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-custom-save');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: 'Custom-tag snapshot text',
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const customLanguage = snapshotTagCatalog.buildCustomTagValue('language', 'Plain text');
  const customType = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');
  const saveResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Custom Unit',
      includeCount: true,
      includeReading: false,
      tags: {
        language: customLanguage,
        type: customType,
      },
    }
  );

  assert.equal(saveResult.ok, true);
  const payload = JSON.parse(fs.readFileSync(path.join(rootDir, saveResult.filename), 'utf8'));
  assert.deepEqual(payload.tags, {
    language: customLanguage,
    type: customType,
  });
});

test('non-interactive snapshot save accepts valid non-catalog language tags', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-open-language-save');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: 'Open-language snapshot text',
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const saveResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Open Language Unit',
      includeCount: true,
      includeReading: false,
      tags: {
        language: 'es-cl',
      },
    }
  );

  assert.equal(saveResult.ok, true);
  const payload = JSON.parse(fs.readFileSync(path.join(rootDir, saveResult.filename), 'utf8'));
  assert.deepEqual(payload.tags, {
    language: 'es-cl',
  });
});

test('snapshot save maps strict creation failures to WRITE_FAILED', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-write-failure');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    createJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const saveResult = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Failure Unit',
      includeCount: true,
      includeReading: false,
      tags: null,
    }
  );

  assert.equal(saveResult.ok, false);
  assert.equal(saveResult.code, 'WRITE_FAILED');
  assert.match(String(saveResult.message || ''), /disk full/i);
});

test('snapshot save rejects a non-string current-text state instead of saving an empty snapshot', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-invalid-current-text');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: false,
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      includeCount: false,
      includeReading: false,
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRITE_FAILED');
  assert.deepEqual(fs.readdirSync(rootDir), []);
});

test('open snapshots folder delegates to shell.openPath using the snapshots root', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-open');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore, openPathCalls } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-open-folder',
    { sender: senderWin.webContents }
  );

  assert.deepEqual(result, {
    ok: true,
    path: rootDir,
  });
  assert.deepEqual(openPathCalls, [rootDir]);
});

test('snapshot load skips overwrite confirmation when current text is empty', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-load-empty');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const snapshotPath = path.join(rootDir, 'empty-target.json');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(createSnapshotFileData('Loaded snapshot text'), null, 2));

  const { snapshotsMain, restore, showMessageBoxCalls } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: '',
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-load',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/empty-target.json' }
  );

  assert.equal(result.ok, true);
  assert.equal(result.filename, 'empty-target.json');
  assert.equal(showMessageBoxCalls.length, 0);
});

test('snapshot load still asks for overwrite confirmation when current text is not empty', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-load-confirm');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const snapshotPath = path.join(rootDir, 'confirm-target.json');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(createSnapshotFileData('Loaded snapshot text'), null, 2));

  const { snapshotsMain, restore, showMessageBoxCalls } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: 'Existing text',
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-load',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/confirm-target.json' }
  );

  assert.equal(result.ok, true);
  assert.equal(showMessageBoxCalls.length, 1);
});

test('snapshot load accepts custom snapshot tags that are unknown to the current editable catalog', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-load-custom');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const customLanguage = snapshotTagCatalog.buildCustomTagValue('language', 'Plain text');
  const snapshotPath = path.join(rootDir, 'custom-tags.json');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(createSnapshotFileData('Loaded custom snapshot text', {
      language: customLanguage,
    }), null, 2)
  );

  const { snapshotsMain, restore, showMessageBoxCalls } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: '',
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-load',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/custom-tags.json' }
  );

  assert.equal(result.ok, true);
  assert.equal(result.filename, 'custom-tags.json');
  assert.equal(showMessageBoxCalls.length, 0);
});

test('snapshot load accepts valid non-catalog language tags', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-load-open-language');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const snapshotPath = path.join(rootDir, 'open-language-tags.json');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(createSnapshotFileData('Loaded open-language snapshot text', {
      language: 'fr-CA',
    }), null, 2)
  );

  const { snapshotsMain, restore, showMessageBoxCalls } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: '',
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-load',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/open-language-tags.json' }
  );

  assert.equal(result.ok, true);
  assert.equal(result.filename, 'open-language-tags.json');
  assert.equal(showMessageBoxCalls.length, 0);
});

test('snapshot load rejects files without the canonical text-snapshot shape', async (t) => {
  const rootDir = createTestTempDir('current-text-snapshots-load-missing-canonical-fields');
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const snapshotPath = path.join(rootDir, 'incomplete.json');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify({ text: 'Incomplete snapshot' }, null, 2));
  const originalFile = fs.readFileSync(snapshotPath, 'utf8');

  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir,
    currentText: '',
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const result = await ipcMain.invoke(
    'current-text-snapshot-load',
    { sender: senderWin.webContents },
    { snapshotRelPath: '/incomplete.json' }
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'invalid snapshot schema',
  });
  assert.equal(fs.readFileSync(snapshotPath, 'utf8'), originalFile);
});

test('normal snapshot loading accepts every built-in reading-test snapshot', async (t) => {
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { snapshotsMain, restore } = loadSnapshotsMainWithMocks({
    senderWin,
    rootDir: BUNDLED_POOL_DIR,
    currentText: '',
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  snapshotsMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
  });

  const fileNames = fs.readdirSync(BUNDLED_POOL_DIR)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));
  assert.equal(fileNames.length, 13);

  for (const fileName of fileNames) {
    const result = await ipcMain.invoke(
      'current-text-snapshot-load',
      { sender: senderWin.webContents },
      { snapshotRelPath: `/${fileName}` }
    );
    assert.equal(result.ok, true, fileName);
  }
});
