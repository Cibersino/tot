'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { installElectronModuleMock } = require('../../helpers/electron_module_mock');

const DEFAULT_RECORD = Object.freeze({
  widths: Object.freeze({
    comentario: 82,
    tiempo: 88,
    percent: 63,
    falta: 65,
    enlace: 250,
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

function loadFreshTasksMain(taskEditorState) {
  const modulePath = path.resolve(__dirname, '../../../electron/tasks_main.js');
  const menuBuilderPath = path.resolve(__dirname, '../../../electron/menu_builder.js');
  const settingsPath = path.resolve(__dirname, '../../../electron/settings.js');
  const snapshotsPath = path.resolve(__dirname, '../../../electron/current_text_snapshots_main.js');
  const fsStoragePath = path.resolve(__dirname, '../../../electron/fs_storage.js');
  const taskEditorStatePath = path.resolve(__dirname, '../../../electron/task_editor_state.js');
  const cachedModules = new Map([
    [menuBuilderPath, require.cache[menuBuilderPath]],
    [settingsPath, require.cache[settingsPath]],
    [snapshotsPath, require.cache[snapshotsPath]],
    [fsStoragePath, require.cache[fsStoragePath]],
    [taskEditorStatePath, require.cache[taskEditorStatePath]],
  ]);
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
      ensureTasksDirs() {},
      getTasksListsDir() { return ''; },
      getTasksLibraryFile() { return ''; },
      getTasksAllowedHostsFile() { return ''; },
      getTaskFilePickerStateFile() { return ''; },
      loadJson(_file, fallback) { return fallback; },
      saveJson() {},
      saveJsonStrict() {},
      createJsonStrict() {},
    },
  };
  require.cache[taskEditorStatePath] = {
    id: taskEditorStatePath,
    filename: taskEditorStatePath,
    loaded: true,
    exports: taskEditorState,
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

  return { tasksMain, restore };
}

function createRegisteredHarness(t, taskEditorState) {
  const loaded = loadFreshTasksMain(taskEditorState);
  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow();
  loaded.tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });
  t.after(loaded.restore);
  return {
    invoke(channel, payload) {
      return ipcMain.invoke(channel, { sender: taskEditorWin.webContents }, payload);
    },
    invokeUnauthorized(channel, payload) {
      return ipcMain.invoke(channel, { sender: {} }, payload);
    },
  };
}

test('task column layout load returns the Main-owned presentation snapshot', async (t) => {
  let loadCalls = 0;
  const harness = createRegisteredHarness(t, {
    getColumnLayout() {
      loadCalls += 1;
      return DEFAULT_RECORD;
    },
    saveColumnLayout() {
      throw new Error('Unexpected save');
    },
  });

  assert.deepEqual(await harness.invoke('task-columns-load'), {
    ok: true,
    record: DEFAULT_RECORD,
  });
  assert.equal(loadCalls, 1);
});

test('task column layout save delegates the complete record and preserves owner failure results', async (t) => {
  const received = [];
  const harness = createRegisteredHarness(t, {
    getColumnLayout() {
      return DEFAULT_RECORD;
    },
    saveColumnLayout(record) {
      received.push(record);
      return { ok: false, code: 'WRITE_FAILED' };
    },
  });

  assert.deepEqual(
    await harness.invoke('task-columns-save', { record: DEFAULT_RECORD }),
    { ok: false, code: 'WRITE_FAILED' }
  );
  assert.deepEqual(received, [DEFAULT_RECORD]);
});

test('task column layout handlers reject non-Task-Editor senders before consulting presentation state', async (t) => {
  let ownerCalls = 0;
  const harness = createRegisteredHarness(t, {
    getColumnLayout() {
      ownerCalls += 1;
      return DEFAULT_RECORD;
    },
    saveColumnLayout() {
      ownerCalls += 1;
      return { ok: true };
    },
  });

  assert.deepEqual(
    await harness.invokeUnauthorized('task-columns-load'),
    { ok: false, code: 'UNAUTHORIZED' }
  );
  assert.deepEqual(
    await harness.invokeUnauthorized('task-columns-save', { record: DEFAULT_RECORD }),
    { ok: false, code: 'UNAUTHORIZED' }
  );
  assert.equal(ownerCalls, 0);
});
