'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createTestTempDir } = require('../../helpers/test_temp_paths');
const { installElectronModuleMock } = require('../../helpers/electron_module_mock');

const DEFAULT_RECORD = Object.freeze({
  version: 1,
  widths: Object.freeze({
    tiempo: 70,
    percent: 55,
    falta: 55,
    enlace: 200,
    comentario: 82,
    acciones: 124,
  }),
});

function createIpcMainMock() {
  const handlers = new Map();
  const emitter = new EventEmitter();
  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    on(channel, handler) {
      emitter.on(channel, handler);
    },
    async invoke(channel, event, payload) {
      return handlers.get(channel)(event, payload);
    },
  };
}

function createWindow() {
  const webContents = { __mockWindow: null };
  const win = {
    webContents,
    isDestroyed() { return false; },
  };
  webContents.__mockWindow = win;
  return win;
}

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(value, null, 2), 'utf8');
}

function loadFreshTasksMain({ tempDir, saveJsonStrictImpl } = {}) {
  const modulePath = path.resolve(__dirname, '../../../electron/tasks_main.js');
  const menuBuilderPath = path.resolve(__dirname, '../../../electron/menu_builder.js');
  const settingsPath = path.resolve(__dirname, '../../../electron/settings.js');
  const snapshotsPath = path.resolve(__dirname, '../../../electron/current_text_snapshots_main.js');
  const fsStoragePath = path.resolve(__dirname, '../../../electron/fs_storage.js');
  const cachedModules = new Map([
    [menuBuilderPath, require.cache[menuBuilderPath]],
    [settingsPath, require.cache[settingsPath]],
    [snapshotsPath, require.cache[snapshotsPath]],
    [fsStoragePath, require.cache[fsStoragePath]],
  ]);
  const columnFile = path.join(tempDir, 'column_widths.json');

  const restoreElectron = installElectronModuleMock({
    dialog: {
      async showOpenDialog() { return { canceled: true, filePaths: [] }; },
      async showSaveDialog() { return { canceled: true }; },
      async showMessageBox() { return { response: 0 }; },
    },
    shell: {},
    BrowserWindow: {
      fromWebContents(webContents) {
        return webContents && webContents.__mockWindow ? webContents.__mockWindow : null;
      },
    },
  });

  require.cache[menuBuilderPath] = {
    id: menuBuilderPath,
    filename: menuBuilderPath,
    loaded: true,
    exports: {
      resolveDialogText(_texts, key) { return key; },
      getDialogTexts() { return {}; },
    },
  };
  require.cache[settingsPath] = {
    id: settingsPath,
    filename: settingsPath,
    loaded: true,
    exports: { getSettings() { return { language: 'en' }; } },
  };
  require.cache[snapshotsPath] = {
    id: snapshotsPath,
    filename: snapshotsPath,
    loaded: true,
    exports: { normalizeSnapshotRelPath(value) { return String(value || ''); } },
  };
  require.cache[fsStoragePath] = {
    id: fsStoragePath,
    filename: fsStoragePath,
    loaded: true,
    exports: {
      ensureTasksDirs() { fs.mkdirSync(tempDir, { recursive: true }); },
      getTasksListsDir() { return path.join(tempDir, 'lists'); },
      getTasksLibraryFile() { return path.join(tempDir, 'library.json'); },
      getTasksAllowedHostsFile() { return path.join(tempDir, 'allowed_hosts.json'); },
      getTasksColumnWidthsFile() { return columnFile; },
      saveJson() {},
      saveJsonStrict(targetPath, value) {
        if (saveJsonStrictImpl) return saveJsonStrictImpl(targetPath, value);
        writeJson(targetPath, value);
        return undefined;
      },
    },
  };

  delete require.cache[require.resolve(modulePath)];
  const tasksMain = require(modulePath);

  function restore() {
    delete require.cache[require.resolve(modulePath)];
    restoreElectron();
    cachedModules.forEach((cached, moduleFile) => {
      if (cached) require.cache[moduleFile] = cached;
      else delete require.cache[moduleFile];
    });
  }

  return { tasksMain, columnFile, restore };
}

function createRegisteredHarness(t, options = {}) {
  const tempDir = createTestTempDir('tasks-main-columns');
  const loaded = loadFreshTasksMain({ tempDir, ...options });
  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow();
  loaded.tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(loaded.restore);
  return {
    ...loaded,
    invoke(channel, payload) {
      return ipcMain.invoke(channel, { sender: taskEditorWin.webContents }, payload);
    },
  };
}

test('task column layout load returns an exact valid version-1 record', async (t) => {
  const harness = createRegisteredHarness(t);
  writeJson(harness.columnFile, DEFAULT_RECORD);

  assert.deepEqual(await harness.invoke('task-columns-load'), {
    ok: true,
    record: DEFAULT_RECORD,
  });
});

test('task column layout load signals fresh defaults for missing, malformed, and invalid data', async (t) => {
  const harness = createRegisteredHarness(t);
  assert.deepEqual(await harness.invoke('task-columns-load'), { ok: true, record: null });

  fs.writeFileSync(harness.columnFile, '{broken', 'utf8');
  assert.deepEqual(await harness.invoke('task-columns-load'), { ok: true, record: null });

  const invalidRecords = [
    DEFAULT_RECORD.widths,
    { ...DEFAULT_RECORD, extra: true },
    { version: 0, widths: DEFAULT_RECORD.widths },
    { version: 1, widths: { ...DEFAULT_RECORD.widths, texto: 200 } },
    { version: 1, widths: { ...DEFAULT_RECORD.widths, tiempo: '70' } },
    { version: 1, widths: { ...DEFAULT_RECORD.widths, comentario: 81 } },
    { version: 1, widths: { ...DEFAULT_RECORD.widths, acciones: 100_001 } },
  ];
  for (const record of invalidRecords) {
    writeJson(harness.columnFile, record);
    assert.deepEqual(await harness.invoke('task-columns-load'), { ok: true, record: null });
  }
});

test('task column layout read failure is reported without overwriting the target', async (t) => {
  const harness = createRegisteredHarness(t);
  fs.mkdirSync(harness.columnFile, { recursive: true });

  assert.deepEqual(await harness.invoke('task-columns-load'), {
    ok: false,
    code: 'READ_FAILED',
  });
  assert.equal(fs.statSync(harness.columnFile).isDirectory(), true);
});

test('task column layout save validates the complete record and uses strict persistence', async (t) => {
  const writes = [];
  const harness = createRegisteredHarness(t, {
    saveJsonStrictImpl(targetPath, value) {
      writes.push({ targetPath, value });
    },
  });

  assert.deepEqual(
    await harness.invoke('task-columns-save', { record: DEFAULT_RECORD }),
    { ok: true }
  );
  assert.deepEqual(writes, [{ targetPath: harness.columnFile, value: DEFAULT_RECORD }]);

  assert.deepEqual(
    await harness.invoke('task-columns-save', {
      record: { version: 1, widths: { ...DEFAULT_RECORD.widths, tiempo: 69 } },
    }),
    { ok: false, code: 'INVALID_SCHEMA' }
  );
  assert.equal(writes.length, 1);
});

test('task column layout strict write failures return WRITE_FAILED', async (t) => {
  const harness = createRegisteredHarness(t, {
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });

  assert.deepEqual(
    await harness.invoke('task-columns-save', { record: DEFAULT_RECORD }),
    { ok: false, code: 'WRITE_FAILED' }
  );
});
