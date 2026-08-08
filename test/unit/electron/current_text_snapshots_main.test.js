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
  saveJsonStrictImpl = null,
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
  const restoreElectronModule = installElectronModuleMock({
    dialog: {
      async showSaveDialog(ownerWin, options) {
        showSaveDialogCalls.push({ ownerWin, options });
        if (saveDialogResult) return saveDialogResult;
        throw new Error('showSaveDialog should not be used in non-interactive snapshot tests');
      },
      async showOpenDialog() {
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
      resolveDialogText(_dialogTexts, _key, fallback) {
        return fallback || '';
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
  };
}

test('task-row snapshot inspection returns the canonical reading metrics', async (t) => {
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
  fs.writeFileSync(
    path.join(rootDir, 'with-estimate.json'),
    JSON.stringify(createSnapshotWithReadingEstimate('Estimated snapshot'), null, 2)
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
      autoFileBaseName: 'Unit 1',
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
  assert.equal(firstSave.filename, 'Unit_1.json');
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
      autoFileBaseName: 'Unit 1',
      includeCount: true,
      includeReading: false,
      tags: null,
    }
  );

  assert.equal(secondSave.ok, true);
  assert.equal(secondSave.filename, 'Unit_1_2.json');
  const secondPayload = JSON.parse(fs.readFileSync(path.join(rootDir, secondSave.filename), 'utf8'));
  assert.deepEqual(secondPayload.tags, {});
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
      locale: 'es-CL',
    },
    reading: {
      estimatedSeconds: 1,
      wpm: 180,
    },
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
      name: 'Lectura ñ',
      sourceComment: 'texto importado',
      includeCount: false,
      includeReading: false,
    }
  );

  assert.equal(result.ok, true);
  assert.equal(showSaveDialogCalls.length, 1);
  assert.equal(showSaveDialogCalls[0].options.defaultPath, path.join(rootDir, 'Lectura ñ.json'));
  const saved = JSON.parse(fs.readFileSync(path.join(rootDir, 'selected.json'), 'utf8'));
  assert.equal(saved.name, 'Lectura ñ');
  assert.equal(saved.sourceComment, 'texto importado');
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

test('snapshot save maps saveJsonStrict failures to WRITE_FAILED', async (t) => {
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
    saveJsonStrictImpl() {
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
