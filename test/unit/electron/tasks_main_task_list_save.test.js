'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');
const {
  normalizeSnapshotRelPath,
} = require('../../../electron/current_text_snapshots_main');

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
    async invoke(channel, event, ...args) {
      if (!handlers.has(channel)) {
        throw new Error(`No ipcMain.handle registered for ${channel}`);
      }
      return handlers.get(channel)(event, ...args);
    },
  };
}

function createWindow(name) {
  const sentMessages = [];
  const webContents = {
    __mockWindow: null,
    send(channel, payload) {
      sentMessages.push({ channel, payload });
    },
  };
  const win = {
    name,
    webContents,
    isDestroyed() {
      return false;
    },
  };
  webContents.__mockWindow = win;
  win.sentMessages = sentMessages;
  return win;
}

function createTaskEditorLifecycle() {
  let nextInitId = 0;
  return {
    acceptDirtyState() { return true; },
    async confirmReplacement() { return true; },
    prepareInitialization(_win, payload) {
      nextInitId += 1;
      return { ...payload, initId: nextInitId };
    },
    acceptInitializationIssued() { return true; },
  };
}

function getLibraryFilePath(tasksRoot) {
  return path.resolve(path.join(tasksRoot, '..', 'library.json'));
}

function writeJsonFile(targetPath, payload) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
}

function createTaskMeta(name = 'Session Plan') {
  return {
    name,
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
    savedWith: 'toT (totapp.org)',
  };
}

function createTaskRow(overrides = {}) {
  return {
    texto: 'Read chapter 1',
    tiempoSeconds: 120,
    percentComplete: 0,
    enlace: '',
    comentario: '',
    snapshotRelPath: '',
    ...overrides,
  };
}

function createLibraryEntry(overrides = {}) {
  return {
    texto: 'Read chapter 1',
    tiempoSeconds: 120,
    enlace: '',
    ...overrides,
  };
}

function loadFreshTasksMainForSave({
  tasksRoot,
  saveDialogPath,
  saveDialogResponses = null,
  saveJsonStrictImpl = null,
  createJsonStrictImpl = null,
  openDialogResponse = null,
  openDialogResponses = null,
  appPaths = {},
} = {}) {
  const modulePath = path.resolve(__dirname, '../../../electron/tasks_main.js');
  const menuBuilderModulePath = path.resolve(__dirname, '../../../electron/menu_builder.js');
  const settingsModulePath = path.resolve(__dirname, '../../../electron/settings.js');
  const snapshotsModulePath = path.resolve(__dirname, '../../../electron/current_text_snapshots_main.js');
  const fsStorageModulePath = path.resolve(__dirname, '../../../electron/fs_storage.js');

  const originalMenuBuilderModule = require.cache[menuBuilderModulePath];
  const originalSettingsModule = require.cache[settingsModulePath];
  const originalSnapshotsModule = require.cache[snapshotsModulePath];
  const originalFsStorageModule = require.cache[fsStorageModulePath];
  const taskFilePickerStatePath = path.join(tasksRoot, '..', 'task_file_picker_state.json');
  const openDialogCalls = [];
  const saveDialogCalls = [];
  const messageBoxCalls = [];
  const saveJsonCalls = [];
  const createJsonCalls = [];
  const pendingOpenDialogResponses = Array.isArray(openDialogResponses)
    ? [...openDialogResponses]
    : null;
  const pendingSaveDialogResponses = Array.isArray(saveDialogResponses)
    ? [...saveDialogResponses]
    : null;
  let persistedTaskFilePickerState = null;

  const restoreElectronModule = installElectronModuleMock({
    dialog: {
      async showOpenDialog(owner, options) {
        openDialogCalls.push({ owner, options });
        if (pendingOpenDialogResponses && pendingOpenDialogResponses.length) {
          return pendingOpenDialogResponses.shift();
        }
        if (openDialogResponse) return openDialogResponse;
        return { canceled: true, filePaths: [] };
      },
      async showSaveDialog(owner, options) {
        saveDialogCalls.push({ owner, options });
        if (pendingSaveDialogResponses && pendingSaveDialogResponses.length) {
          return pendingSaveDialogResponses.shift();
        }
        return { canceled: false, filePath: saveDialogPath };
      },
      async showMessageBox(owner, options) {
        messageBoxCalls.push({ owner, options });
        return { response: 0 };
      },
    },
    shell: {},
    app: {
      getPath(key) {
        return appPaths[key] || '';
      },
    },
    BrowserWindow: {
      fromWebContents(webContents) {
        return webContents && webContents.__mockWindow ? webContents.__mockWindow : null;
      },
    },
  });

  require.cache[menuBuilderModulePath] = {
    id: menuBuilderModulePath,
    filename: menuBuilderModulePath,
    loaded: true,
    exports: {
      resolveDialogText(_dialogTexts, key, fallback = key) {
        return fallback;
      },
      getDialogTexts() {
        return {};
      },
    },
  };

  require.cache[settingsModulePath] = {
    id: settingsModulePath,
    filename: settingsModulePath,
    loaded: true,
    exports: {
      getSettings() {
        return { language: 'en' };
      },
    },
  };

  require.cache[snapshotsModulePath] = {
    id: snapshotsModulePath,
    filename: snapshotsModulePath,
    loaded: true,
    exports: {
      normalizeSnapshotRelPath,
    },
  };

  require.cache[fsStorageModulePath] = {
    id: fsStorageModulePath,
    filename: fsStorageModulePath,
    loaded: true,
    exports: {
      ensureTasksDirs() {
        fs.mkdirSync(tasksRoot, { recursive: true });
      },
      getTasksListsDir() {
        return tasksRoot;
      },
      getTasksLibraryFile() {
        return path.join(tasksRoot, '..', 'library.json');
      },
      getTasksAllowedHostsFile() {
        return path.join(tasksRoot, '..', 'allowed_hosts.json');
      },
      getTasksColumnWidthsFile() {
        return path.join(tasksRoot, '..', 'column_widths.json');
      },
      getTaskFilePickerStateFile() {
        return taskFilePickerStatePath;
      },
      loadJson(targetPath, fallback) {
        if (path.resolve(targetPath) === path.resolve(taskFilePickerStatePath)
          && persistedTaskFilePickerState) {
          return persistedTaskFilePickerState;
        }
        return fallback;
      },
      saveJson(targetPath, payload) {
        saveJsonCalls.push({ targetPath, payload });
        if (path.resolve(targetPath) === path.resolve(taskFilePickerStatePath)) {
          persistedTaskFilePickerState = payload;
        }
      },
      saveJsonStrict(targetPath, payload) {
        if (typeof saveJsonStrictImpl === 'function') {
          return saveJsonStrictImpl(targetPath, payload);
        }
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
      },
      createJsonStrict(targetPath, payload) {
        createJsonCalls.push({ targetPath, payload });
        if (typeof createJsonStrictImpl === 'function') {
          return createJsonStrictImpl(targetPath, payload);
        }
        fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), {
          encoding: 'utf8',
          flag: 'wx',
        });
      },
    },
  };

  delete require.cache[require.resolve(modulePath)];
  const tasksMain = require(modulePath);

  function restore() {
    delete require.cache[require.resolve(modulePath)];
    restoreElectronModule();

    if (originalMenuBuilderModule) {
      require.cache[menuBuilderModulePath] = originalMenuBuilderModule;
    } else {
      delete require.cache[menuBuilderModulePath];
    }

    if (originalSettingsModule) {
      require.cache[settingsModulePath] = originalSettingsModule;
    } else {
      delete require.cache[settingsModulePath];
    }

    if (originalSnapshotsModule) {
      require.cache[snapshotsModulePath] = originalSnapshotsModule;
    } else {
      delete require.cache[snapshotsModulePath];
    }

    if (originalFsStorageModule) {
      require.cache[fsStorageModulePath] = originalFsStorageModule;
    } else {
      delete require.cache[fsStorageModulePath];
    }
  }

  return {
    tasksMain,
    restore,
    openDialogCalls,
    saveDialogCalls,
    messageBoxCalls,
    saveJsonCalls,
    createJsonCalls,
  };
}

test('Task Editor handlers reject non-Task-Editor senders', async (t) => {
  const tempDir = createTestTempDir('tasks-main-unauthorized-sender');
  const tasksRoot = path.join(tempDir, 'lists');
  const { tasksMain, restore } = loadFreshTasksMainForSave({ tasksRoot });
  t.after(() => {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  const otherWin = createWindow('other');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
    taskEditorLifecycle: createTaskEditorLifecycle(),
  });

  const channels = [
    'task-list-save',
    'task-list-delete',
    'task-library-list',
    'task-library-save',
    'task-library-delete',
    'task-columns-load',
    'task-columns-save',
    'task-file-select',
    'task-files-select',
    'task-open-link',
  ];
  for (const channel of channels) {
    const result = await ipcMain.invoke(channel, { sender: otherWin.webContents });
    assert.deepEqual(result, { ok: false, code: 'UNAUTHORIZED' });
  }
});

test('task-list-save creates task data at a new destination', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save');
  const tasksRoot = path.join(tempDir, 'lists');
  const saveDialogPath = path.join(tasksRoot, 'Session Plan.json');
  const { tasksMain, restore, createJsonCalls } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath,
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    {
      meta: createTaskMeta(),
      rows: [createTaskRow({ percentComplete: 25 })],
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.path, path.resolve(saveDialogPath));
  assert.equal(result.meta.name, 'Session Plan');
  assert.equal(createJsonCalls.length, 1);
  assert.equal(createJsonCalls[0].targetPath, path.resolve(saveDialogPath));

  const savedPayload = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.equal(savedPayload.type, 'task');
  assert.equal(savedPayload.meta.name, 'Session Plan');
  assert.equal(savedPayload.meta.savedWith, 'toT (totapp.org)');
  assert.deepEqual(savedPayload.summary, {
    estimatedTotalSeconds: 120,
    estimatedRemainingSeconds: 90,
  });
  assert.equal(savedPayload.rows.length, 1);
  assert.equal(savedPayload.rows[0].texto, 'Read chapter 1');
});

test('task-list-save writes an existing destination through its verified canonical path', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-existing-canonical-path');
  const tasksRoot = path.join(tempDir, 'lists');
  const selectedPath = path.join(tasksRoot, 'selected-link.json');
  const canonicalPath = path.join(tasksRoot, 'canonical-target.json');
  fs.mkdirSync(tasksRoot, { recursive: true });
  fs.writeFileSync(selectedPath, 'selected entry unchanged', 'utf8');
  fs.writeFileSync(canonicalPath, '{"before":true}', 'utf8');

  const { tasksMain, restore, createJsonCalls } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: selectedPath,
  });
  const originalRealpathSync = fs.realpathSync;
  fs.realpathSync = (targetPath, ...args) => {
    if (path.resolve(targetPath) === path.resolve(selectedPath)) return canonicalPath;
    return originalRealpathSync(targetPath, ...args);
  };
  t.after(() => {
    fs.realpathSync = originalRealpathSync;
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    { meta: createTaskMeta(), rows: [createTaskRow()] }
  );

  assert.equal(result.ok, true);
  assert.equal(result.path, canonicalPath);
  assert.equal(createJsonCalls.length, 0);
  assert.equal(fs.readFileSync(selectedPath, 'utf8'), 'selected entry unchanged');
  assert.equal(JSON.parse(fs.readFileSync(canonicalPath, 'utf8')).meta.name, 'Session Plan');
});

test('task-list-save rejects an existing destination whose canonical path is outside the tasks root', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-existing-outside-canonical-path');
  const tasksRoot = path.join(tempDir, 'lists');
  const selectedPath = path.join(tasksRoot, 'selected-link.json');
  const outsidePath = path.join(tempDir, 'outside.json');
  fs.mkdirSync(tasksRoot, { recursive: true });
  fs.writeFileSync(selectedPath, 'selected entry unchanged', 'utf8');
  fs.writeFileSync(outsidePath, 'outside entry unchanged', 'utf8');

  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: selectedPath,
  });
  const originalRealpathSync = fs.realpathSync;
  fs.realpathSync = (targetPath, ...args) => {
    if (path.resolve(targetPath) === path.resolve(selectedPath)) return outsidePath;
    return originalRealpathSync(targetPath, ...args);
  };
  t.after(() => {
    fs.realpathSync = originalRealpathSync;
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    { meta: createTaskMeta(), rows: [createTaskRow()] }
  );

  assert.deepEqual(result, { ok: false, code: 'PATH_OUTSIDE_TASKS' });
  assert.equal(fs.readFileSync(selectedPath, 'utf8'), 'selected entry unchanged');
  assert.equal(fs.readFileSync(outsidePath, 'utf8'), 'outside entry unchanged');
});

test('task-list-save aborts when an existing destination cannot be canonicalized', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-existing-realpath-failure');
  const tasksRoot = path.join(tempDir, 'lists');
  const selectedPath = path.join(tasksRoot, 'selected-link.json');
  fs.mkdirSync(tasksRoot, { recursive: true });
  fs.writeFileSync(selectedPath, 'selected entry unchanged', 'utf8');

  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: selectedPath,
  });
  const originalRealpathSync = fs.realpathSync;
  fs.realpathSync = (targetPath, ...args) => {
    if (path.resolve(targetPath) === path.resolve(selectedPath)) {
      throw new Error('destination realpath failed');
    }
    return originalRealpathSync(targetPath, ...args);
  };
  t.after(() => {
    fs.realpathSync = originalRealpathSync;
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    { meta: createTaskMeta(), rows: [createTaskRow()] }
  );

  assert.deepEqual(result, { ok: false, code: 'WRITE_FAILED' });
  assert.equal(fs.readFileSync(selectedPath, 'utf8'), 'selected entry unchanged');
});

test('task-list-save does not create a destination under a missing parent directory', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-missing-parent');
  const tasksRoot = path.join(tempDir, 'lists');
  const missingParent = path.join(tasksRoot, 'missing-parent');
  const selectedPath = path.join(missingParent, 'plan.json');
  const { tasksMain, restore, createJsonCalls } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: selectedPath,
  });
  t.after(() => {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    { meta: createTaskMeta(), rows: [createTaskRow()] }
  );

  assert.deepEqual(result, { ok: false, code: 'WRITE_FAILED' });
  assert.equal(fs.existsSync(missingParent), false);
  assert.equal(createJsonCalls.length, 0);
});

test('task-list-save maps an exclusive-create collision to WRITE_FAILED without overwriting', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-exclusive-create-collision');
  const tasksRoot = path.join(tempDir, 'lists');
  const selectedPath = path.join(tasksRoot, 'raced-destination.json');
  const { tasksMain, restore, createJsonCalls } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: selectedPath,
    createJsonStrictImpl() {
      const err = new Error('destination already exists');
      err.code = 'EEXIST';
      throw err;
    },
  });
  t.after(() => {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    { meta: createTaskMeta(), rows: [createTaskRow()] }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRITE_FAILED');
  assert.equal(createJsonCalls.length, 1);
  assert.equal(fs.existsSync(selectedPath), false);
});

test('task-list-save retries invalid filenames without rewriting the selected destination', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-invalid-filename-retry');
  const tasksRoot = path.join(tempDir, 'lists');
  const invalidNoExtension = path.join(tasksRoot, 'Plan A');
  const invalidOtherExtension = path.join(tasksRoot, 'Plan A.txt');
  const selectedPath = path.join(tasksRoot, 'Plan A.json');
  const {
    tasksMain,
    restore,
    saveDialogCalls,
    messageBoxCalls,
  } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogResponses: [
      { canceled: false, filePath: invalidNoExtension },
      { canceled: false, filePath: invalidOtherExtension },
      { canceled: false, filePath: selectedPath },
    ],
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    { meta: createTaskMeta(), rows: [createTaskRow()] }
  );

  const expectedDefaultPath = path.join(tasksRoot, 'Session_Plan.json');
  assert.equal(result.path, path.resolve(selectedPath));
  assert.equal(fs.existsSync(selectedPath), true);
  assert.equal(fs.existsSync(path.join(tasksRoot, 'Plan_A.json')), false);
  assert.equal(saveDialogCalls.length, 3);
  for (const { options } of saveDialogCalls) {
    assert.equal(options.defaultPath, expectedDefaultPath);
    assert.deepEqual(options.filters, [{ name: 'JSON', extensions: ['json'] }]);
    assert.deepEqual(options.properties, ['showOverwriteConfirmation']);
  }
  assert.equal(messageBoxCalls.length, 2);
  for (const { options } of messageBoxCalls) {
    assert.equal(options.message, 'task_list_invalid_filename');
    assert.deepEqual(options.buttons, ['ok']);
  }
});

test('task-list-save returns CANCELLED when cancellation follows an invalid filename', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-invalid-filename-cancel');
  const tasksRoot = path.join(tempDir, 'lists');
  const {
    tasksMain,
    restore,
    saveDialogCalls,
    messageBoxCalls,
  } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogResponses: [
      { canceled: false, filePath: path.join(tasksRoot, 'Plan A') },
      { canceled: true },
    ],
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    { meta: createTaskMeta(), rows: [createTaskRow()] }
  );

  assert.deepEqual(result, { ok: false, code: 'CANCELLED' });
  assert.equal(fs.existsSync(tasksRoot), true);
  assert.deepEqual(fs.readdirSync(tasksRoot), []);
  assert.equal(saveDialogCalls.length, 2);
  assert.equal(messageBoxCalls.length, 1);
});

test('task-list-save aggregates exact Task Editor remaining hundredths before flooring', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-exact-remaining');
  const tasksRoot = path.join(tempDir, 'lists');
  const saveDialogPath = path.join(tasksRoot, 'Exact remaining.json');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath,
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    {
      meta: createTaskMeta('Exact remaining'),
      rows: [
        createTaskRow({ tiempoSeconds: 1, percentComplete: 1 }),
        createTaskRow({ texto: 'Read chapter 2', tiempoSeconds: 29, percentComplete: 31 }),
      ],
    }
  );

  assert.equal(result.ok, true);
  const savedPayload = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.deepEqual(savedPayload.summary, {
    estimatedTotalSeconds: 30,
    estimatedRemainingSeconds: 21,
  });
});

test('task-list-save omits the summary when the total estimate is zero', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-zero-summary');
  const tasksRoot = path.join(tempDir, 'lists');
  const saveDialogPath = path.join(tasksRoot, 'Zero Plan.json');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath,
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    {
      meta: createTaskMeta('Zero Plan'),
      rows: [createTaskRow({ tiempoSeconds: 0, percentComplete: 100 })],
    }
  );

  assert.equal(result.ok, true);
  const savedPayload = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(savedPayload, 'summary'), false);
});

test('task-list-save maps existing-destination write failures to WRITE_FAILED', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-failure');
  const tasksRoot = path.join(tempDir, 'lists');
  const saveDialogPath = path.join(tasksRoot, 'Failure Plan.json');
  fs.mkdirSync(tasksRoot, { recursive: true });
  fs.writeFileSync(saveDialogPath, '{}', 'utf8');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath,
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    {
      meta: createTaskMeta('Failure Plan'),
      rows: [createTaskRow({ texto: 'Read chapter 2', tiempoSeconds: 240 })],
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRITE_FAILED');
  assert.match(String(result.message || ''), /disk full/i);
});

test('task-list-save keeps outside-path rejection ahead of destination parent canonicalization failure', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-outside-parent-realpath-failure');
  const tasksRoot = path.join(tempDir, 'lists');
  const outsideParent = path.join(tempDir, 'outside');
  const saveDialogPath = path.join(outsideParent, 'Outside plan.json');
  fs.mkdirSync(outsideParent, { recursive: true });

  const { tasksMain, restore } = loadFreshTasksMainForSave({ tasksRoot, saveDialogPath });
  const originalRealpathSync = fs.realpathSync;
  fs.realpathSync = (targetPath, ...args) => {
    if (path.resolve(targetPath) === path.resolve(outsideParent)) {
      throw new Error('outside destination parent realpath failed');
    }
    return originalRealpathSync(targetPath, ...args);
  };

  t.after(() => {
    fs.realpathSync = originalRealpathSync;
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    { meta: createTaskMeta(), rows: [createTaskRow()] }
  );

  assert.deepEqual(result, { ok: false, code: 'PATH_OUTSIDE_TASKS' });
  assert.equal(fs.existsSync(saveDialogPath), false);
});

test('task-list-save aborts when an inside destination parent cannot be canonicalized', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-parent-realpath-failure');
  const tasksRoot = path.join(tempDir, 'lists');
  const selectedParent = path.join(tasksRoot, 'selected-parent');
  const saveDialogPath = path.join(selectedParent, 'Parent failure.json');
  fs.mkdirSync(selectedParent, { recursive: true });

  const { tasksMain, restore } = loadFreshTasksMainForSave({ tasksRoot, saveDialogPath });
  const originalRealpathSync = fs.realpathSync;
  fs.realpathSync = (targetPath, ...args) => {
    if (path.resolve(targetPath) === path.resolve(selectedParent)) {
      throw new Error('inside destination parent realpath failed');
    }
    return originalRealpathSync(targetPath, ...args);
  };

  t.after(() => {
    fs.realpathSync = originalRealpathSync;
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    { meta: createTaskMeta(), rows: [createTaskRow()] }
  );

  assert.deepEqual(result, { ok: false, code: 'WRITE_FAILED' });
  assert.equal(fs.existsSync(saveDialogPath), false);
});

test('task-list-delete maps root and target canonicalization failures to WRITE_FAILED', async (t) => {
  const tempDir = createTestTempDir('tasks-main-delete-realpath-failure');
  const tasksRoot = path.join(tempDir, 'lists');
  const targetPath = path.join(tasksRoot, 'Delete me.json');
  fs.mkdirSync(tasksRoot, { recursive: true });
  fs.writeFileSync(targetPath, '{}', 'utf8');

  const { tasksMain, restore } = loadFreshTasksMainForSave({ tasksRoot });
  const originalRealpathSync = fs.realpathSync;
  let failedPath = tasksRoot;
  fs.realpathSync = (candidatePath, ...args) => {
    if (path.resolve(candidatePath) === path.resolve(failedPath)) {
      throw new Error('realpath failed');
    }
    return originalRealpathSync(candidatePath, ...args);
  };

  t.after(() => {
    fs.realpathSync = originalRealpathSync;
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const event = { sender: taskEditorWin.webContents };
  const rootFailure = await ipcMain.invoke('task-list-delete', event, { path: targetPath });
  assert.deepEqual(rootFailure, { ok: false, code: 'WRITE_FAILED' });
  assert.equal(fs.existsSync(targetPath), true);

  failedPath = targetPath;
  const targetFailure = await ipcMain.invoke('task-list-delete', event, { path: targetPath });
  assert.deepEqual(targetFailure, { ok: false, code: 'WRITE_FAILED' });
  assert.equal(fs.existsSync(targetPath), true);
});

test('task-list-save rejects noncanonical task-row values without writing a file', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-invalid-schema');
  const tasksRoot = path.join(tempDir, 'lists');
  const saveDialogPath = path.join(tasksRoot, 'Invalid Plan.json');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath,
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const decimalResult = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    {
      meta: createTaskMeta('Invalid Plan'),
      rows: [createTaskRow({ tiempoSeconds: 12.5 })],
    }
  );

  assert.deepEqual(decimalResult, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'INVALID_TIEMPO',
  });
  const unknownPropertyResult = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    {
      meta: createTaskMeta('Invalid Plan'),
      rows: [createTaskRow({ unexpected: true })],
    }
  );
  assert.deepEqual(unknownPropertyResult, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'INVALID_ROW',
  });
  assert.equal(fs.existsSync(path.join(tasksRoot, 'Invalid_Plan.json')), false);
});

test('task-list-save rejects a valid-row aggregate outside the canonical summary range', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-invalid-summary');
  const tasksRoot = path.join(tempDir, 'lists');
  const saveDialogPath = path.join(tasksRoot, 'Invalid summary.json');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath,
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-list-save',
    { sender: taskEditorWin.webContents },
    {
      meta: createTaskMeta('Invalid summary'),
      rows: [
        createTaskRow({ tiempoSeconds: Number.MAX_SAFE_INTEGER }),
        createTaskRow({ texto: 'Read chapter 2', tiempoSeconds: 1 }),
      ],
    }
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'INVALID_SUMMARY',
  });
  assert.equal(fs.existsSync(path.join(tasksRoot, 'Invalid_summary.json')), false);
});

test('open-task-editor rejects invalid persisted task data without rewriting it', async (t) => {
  const tempDir = createTestTempDir('tasks-main-load-invalid-schema');
  const tasksRoot = path.join(tempDir, 'lists');
  const taskPath = path.join(tasksRoot, 'invalid.json');
  const invalidTask = {
    type: 'task',
    meta: createTaskMeta('Invalid task'),
    rows: [createTaskRow({ percentComplete: 25.5 })],
  };
  writeJsonFile(taskPath, invalidTask);
  const originalFile = fs.readFileSync(taskPath, 'utf8');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    openDialogResponse: {
      canceled: false,
      filePaths: [taskPath],
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin, taskEditorWin: null }),
    ensureTaskEditorWindow() {},
  });

  const result = await ipcMain.invoke(
    'open-task-editor',
    { sender: mainWin.webContents },
    { mode: 'load' }
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'INVALID_PERCENT',
  });
  assert.equal(fs.readFileSync(taskPath, 'utf8'), originalFile);
});

test('open-task-editor loads a canonical task file with its validated summary', async (t) => {
  const tempDir = createTestTempDir('tasks-main-load-canonical-summary');
  const tasksRoot = path.join(tempDir, 'lists');
  const taskPath = path.join(tasksRoot, 'canonical.json');
  writeJsonFile(taskPath, {
    type: 'task',
    meta: createTaskMeta('Canonical task'),
    summary: {
      estimatedTotalSeconds: 120,
      estimatedRemainingSeconds: 90,
    },
    rows: [createTaskRow({ percentComplete: 25 })],
  });
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    openDialogResponse: {
      canceled: false,
      filePaths: [taskPath],
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  let taskEditorWin = null;
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin, taskEditorWin }),
    ensureTaskEditorWindow() {
      taskEditorWin = createWindow('task-editor');
    },
    taskEditorLifecycle: createTaskEditorLifecycle(),
  });

  const result = await ipcMain.invoke(
    'open-task-editor',
    { sender: mainWin.webContents },
    { mode: 'load' }
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(taskEditorWin.sentMessages, [{
    channel: 'task-editor-init',
    payload: {
      mode: 'load',
      initId: 1,
      task: {
        type: 'task',
        meta: createTaskMeta('Canonical task'),
        summary: {
          estimatedTotalSeconds: 120,
          estimatedRemainingSeconds: 90,
        },
        rows: [createTaskRow({ percentComplete: 25 })],
      },
      sourcePath: path.resolve(taskPath),
    },
  }]);
});

test('open-task-editor rejects task files that omit canonical metadata without rewriting them', async (t) => {
  const tempDir = createTestTempDir('tasks-main-load-missing-producer');
  const tasksRoot = path.join(tempDir, 'lists');
  const taskPath = path.join(tasksRoot, 'missing-producer.json');
  const meta = createTaskMeta('Missing producer');
  delete meta.savedWith;
  writeJsonFile(taskPath, {
    type: 'task',
    meta,
    rows: [createTaskRow()],
  });
  const originalFile = fs.readFileSync(taskPath, 'utf8');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    openDialogResponse: {
      canceled: false,
      filePaths: [taskPath],
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin, taskEditorWin: null }),
    ensureTaskEditorWindow() {},
  });

  const result = await ipcMain.invoke(
    'open-task-editor',
    { sender: mainWin.webContents },
    { mode: 'load' }
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'INVALID_META',
  });
  assert.equal(fs.readFileSync(taskPath, 'utf8'), originalFile);
});

test('open-task-editor rejects task files that omit the task type without rewriting them', async (t) => {
  const tempDir = createTestTempDir('tasks-main-load-missing-task-type');
  const tasksRoot = path.join(tempDir, 'lists');
  const taskPath = path.join(tasksRoot, 'missing-type.json');
  writeJsonFile(taskPath, {
    meta: createTaskMeta('Missing task type'),
    summary: {
      estimatedTotalSeconds: 120,
      estimatedRemainingSeconds: 120,
    },
    rows: [createTaskRow()],
  });
  const originalFile = fs.readFileSync(taskPath, 'utf8');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    openDialogResponse: {
      canceled: false,
      filePaths: [taskPath],
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin, taskEditorWin: null }),
    ensureTaskEditorWindow() {},
  });

  const result = await ipcMain.invoke(
    'open-task-editor',
    { sender: mainWin.webContents },
    { mode: 'load' }
  );

  assert.deepEqual(result, { ok: false, code: 'INVALID_SCHEMA', message: undefined });
  assert.equal(fs.readFileSync(taskPath, 'utf8'), originalFile);
});

test('open-task-editor rejects task files with a missing required summary without rewriting them', async (t) => {
  const tempDir = createTestTempDir('tasks-main-load-missing-summary');
  const tasksRoot = path.join(tempDir, 'lists');
  const taskPath = path.join(tasksRoot, 'missing-summary.json');
  writeJsonFile(taskPath, {
    type: 'task',
    meta: createTaskMeta('Missing summary'),
    rows: [createTaskRow()],
  });
  const originalFile = fs.readFileSync(taskPath, 'utf8');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    openDialogResponse: {
      canceled: false,
      filePaths: [taskPath],
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin, taskEditorWin: null }),
    ensureTaskEditorWindow() {},
  });

  const result = await ipcMain.invoke(
    'open-task-editor',
    { sender: mainWin.webContents },
    { mode: 'load' }
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'INVALID_SUMMARY',
  });
  assert.equal(fs.readFileSync(taskPath, 'utf8'), originalFile);
});

test('task-library-save persists library entries through saveJsonStrict', async (t) => {
  const tempDir = createTestTempDir('tasks-main-library-save');
  const tasksRoot = path.join(tempDir, 'lists');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-library-save',
    { sender: taskEditorWin.webContents },
    {
      entry: createLibraryEntry({
        tiempoSeconds: 180,
        enlace: 'https://example.com/read',
        comentario: 'Review key ideas',
        snapshotRelPath: '/snapshots/chapter-1.json',
      }),
    }
  );

  assert.equal(result.ok, true);

  const savedLibrary = JSON.parse(fs.readFileSync(getLibraryFilePath(tasksRoot), 'utf8'));
  assert.deepEqual(savedLibrary, [{
    texto: 'Read chapter 1',
    tiempoSeconds: 180,
    enlace: 'https://example.com/read',
    comentario: 'Review key ideas',
    snapshotRelPath: '/snapshots/chapter-1.json',
  }]);
});

test('task-library-list returns canonical library entries without materializing absent optional fields', async (t) => {
  const tempDir = createTestTempDir('tasks-main-library-list-canonical-shape');
  const tasksRoot = path.join(tempDir, 'lists');
  writeJsonFile(getLibraryFilePath(tasksRoot), [{
    texto: 'Read chapter 1',
    tiempoSeconds: 180,
    enlace: '',
  }, {
    texto: 'Read chapter 2',
    tiempoSeconds: 240,
    enlace: 'https://example.com/read',
    comentario: 'Review key ideas',
    snapshotRelPath: '/snapshots/chapter-2.json',
  }]);
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-library-list',
    { sender: taskEditorWin.webContents }
  );

  assert.deepEqual(result, {
    ok: true,
    items: [{
      texto: 'Read chapter 1',
      tiempoSeconds: 180,
      enlace: '',
    }, {
      texto: 'Read chapter 2',
      tiempoSeconds: 240,
      enlace: 'https://example.com/read',
      comentario: 'Review key ideas',
      snapshotRelPath: '/snapshots/chapter-2.json',
    }],
  });
});

test('task-library-save rejects payloads that are not exact library entries', async (t) => {
  const tempDir = createTestTempDir('tasks-main-library-invalid-payload');
  const tasksRoot = path.join(tempDir, 'lists');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const legacyPayloadResult = await ipcMain.invoke(
    'task-library-save',
    { sender: taskEditorWin.webContents },
    { row: createTaskRow(), includeComment: true }
  );
  assert.deepEqual(legacyPayloadResult, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'INVALID_LIBRARY_SAVE_PAYLOAD',
  });

  const uiFieldResult = await ipcMain.invoke(
    'task-library-save',
    { sender: taskEditorWin.webContents },
    { entry: createLibraryEntry({ percentComplete: 0 }) }
  );
  assert.deepEqual(uiFieldResult, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'INVALID_LIBRARY_ENTRY',
  });
  assert.equal(fs.existsSync(tasksRoot), false);
  assert.equal(fs.existsSync(getLibraryFilePath(tasksRoot)), false);
});

test('task-library-save rejects noncanonical snapshot paths without writing the library', async (t) => {
  const tempDir = createTestTempDir('tasks-main-library-invalid-snapshot-path');
  const tasksRoot = path.join(tempDir, 'lists');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-library-save',
    { sender: taskEditorWin.webContents },
    {
      entry: createLibraryEntry({ snapshotRelPath: 'snapshots/chapter-1.json' }),
    }
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'INVALID_SNAPSHOT_PATH',
  });
  assert.equal(fs.existsSync(getLibraryFilePath(tasksRoot)), false);
});

test('task-library-save maps saveJsonStrict failures to WRITE_FAILED', async (t) => {
  const tempDir = createTestTempDir('tasks-main-library-save-failure');
  const tasksRoot = path.join(tempDir, 'lists');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-library-save',
    { sender: taskEditorWin.webContents },
    {
      entry: createLibraryEntry({ texto: 'Read chapter 2', tiempoSeconds: 240 }),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRITE_FAILED');
  assert.match(String(result.message || ''), /disk full/i);
  assert.equal(fs.existsSync(getLibraryFilePath(tasksRoot)), false);
});

test('task-library-list rejects invalid persisted entries without rewriting the library', async (t) => {
  const tempDir = createTestTempDir('tasks-main-library-invalid-schema');
  const tasksRoot = path.join(tempDir, 'lists');
  const libraryFile = getLibraryFilePath(tasksRoot);
  writeJsonFile(libraryFile, [
    {
      texto: 'Read chapter 1',
      tiempoSeconds: 180.5,
      enlace: '',
    },
  ]);
  const originalFile = fs.readFileSync(libraryFile, 'utf8');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-library-list',
    { sender: taskEditorWin.webContents }
  );

  assert.deepEqual(result, { ok: false, code: 'INVALID_SCHEMA' });
  assert.equal(fs.readFileSync(libraryFile, 'utf8'), originalFile);
});

test('task-library-delete rejects a malformed texto request without changing the library', async (t) => {
  const tempDir = createTestTempDir('tasks-main-library-delete-invalid-request');
  const tasksRoot = path.join(tempDir, 'lists');
  const libraryFile = getLibraryFilePath(tasksRoot);
  writeJsonFile(libraryFile, [createLibraryEntry()]);
  const originalFile = fs.readFileSync(libraryFile, 'utf8');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-library-delete',
    { sender: taskEditorWin.webContents },
    { texto: false }
  );

  assert.deepEqual(result, { ok: false, code: 'INVALID_REQUEST' });
  assert.equal(fs.readFileSync(libraryFile, 'utf8'), originalFile);
});

test('task-library-delete persists library removals through saveJsonStrict', async (t) => {
  const tempDir = createTestTempDir('tasks-main-library-delete');
  const tasksRoot = path.join(tempDir, 'lists');
  const libraryFile = getLibraryFilePath(tasksRoot);
  writeJsonFile(libraryFile, [
    {
      texto: 'Read chapter 1',
      tiempoSeconds: 180,
      enlace: '',
    },
    {
      texto: 'Read chapter 2',
      tiempoSeconds: 240,
      enlace: '',
    },
  ]);
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-library-delete',
    { sender: taskEditorWin.webContents },
    { texto: 'Read chapter 1' }
  );

  assert.equal(result.ok, true);

  const savedLibrary = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
  assert.deepEqual(savedLibrary, [{
    texto: 'Read chapter 2',
    tiempoSeconds: 240,
    enlace: '',
  }]);
});

test('task-library-delete maps saveJsonStrict failures to WRITE_FAILED', async (t) => {
  const tempDir = createTestTempDir('tasks-main-library-delete-failure');
  const tasksRoot = path.join(tempDir, 'lists');
  const libraryFile = getLibraryFilePath(tasksRoot);
  writeJsonFile(libraryFile, [{
    texto: 'Read chapter 3',
    tiempoSeconds: 300,
    enlace: '',
  }]);
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-library-delete',
    { sender: taskEditorWin.webContents },
    { texto: 'Read chapter 3' }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRITE_FAILED');
  assert.match(String(result.message || ''), /disk full/i);
  assert.deepEqual(JSON.parse(fs.readFileSync(libraryFile, 'utf8')), [{
    texto: 'Read chapter 3',
    tiempoSeconds: 300,
    enlace: '',
  }]);
});

test('task-files-select returns selected local file paths for Task Editor senders', async (t) => {
  const tempDir = createTestTempDir('tasks-main-file-select');
  const tasksRoot = path.join(tempDir, 'lists');
  const selectedA = path.join(tempDir, 'docs', 'chapter-1.pdf');
  const selectedB = path.join(tempDir, 'notes', 'chapter-2.txt');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    openDialogResponse: {
      canceled: false,
      filePaths: [selectedA, selectedB],
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-files-select',
    { sender: taskEditorWin.webContents }
  );

  assert.deepEqual(result, {
    ok: true,
    filePaths: [path.resolve(selectedA), path.resolve(selectedB)],
  });
});

test('task-files-select rejects a malformed native selection instead of discarding invalid paths', async (t) => {
  const tempDir = createTestTempDir('tasks-main-file-select-invalid-path');
  const tasksRoot = path.join(tempDir, 'lists');
  const selectedPath = path.join(tempDir, 'docs', 'chapter-1.pdf');
  const { tasksMain, restore, saveJsonCalls } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    openDialogResponse: {
      canceled: false,
      filePaths: [selectedPath, false],
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-files-select',
    { sender: taskEditorWin.webContents }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'READ_FAILED');
  assert.equal(saveJsonCalls.length, 0);
});

test('task-file-select returns the selected local file path for Task Editor senders', async (t) => {
  const tempDir = createTestTempDir('tasks-main-single-file-select');
  const tasksRoot = path.join(tempDir, 'lists');
  const selectedPath = path.join(tempDir, 'docs', 'chapter-3.pdf');
  const { tasksMain, restore } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    openDialogResponse: {
      canceled: false,
      filePaths: [selectedPath],
    },
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const result = await ipcMain.invoke(
    'task-file-select',
    { sender: taskEditorWin.webContents }
  );

  assert.deepEqual(result, {
    ok: true,
    filePath: path.resolve(selectedPath),
  });
});

test('Task Editor local-file pickers use the first-use folder and share their persisted directory', async (t) => {
  const tempDir = createTestTempDir('tasks-main-file-picker-state');
  const tasksRoot = path.join(tempDir, 'lists');
  const documentsDir = path.join(tempDir, 'Documents');
  const firstSelectionDir = path.join(tempDir, 'course-materials');
  const secondSelectionDir = path.join(tempDir, 'reference-files');
  fs.mkdirSync(documentsDir, { recursive: true });
  fs.mkdirSync(firstSelectionDir, { recursive: true });
  fs.mkdirSync(secondSelectionDir, { recursive: true });

  const firstSelection = path.join(firstSelectionDir, 'chapter-1.pdf');
  const secondSelection = path.join(secondSelectionDir, 'chapter-2.pdf');
  const { tasksMain, restore, openDialogCalls, saveJsonCalls } = loadFreshTasksMainForSave({
    tasksRoot,
    saveDialogPath: path.join(tasksRoot, 'unused.json'),
    appPaths: { documents: documentsDir },
    openDialogResponses: [
      { canceled: false, filePaths: [firstSelection] },
      { canceled: false, filePaths: [secondSelection] },
    ],
  });
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  t.after(restore);

  const ipcMain = createIpcMainMock();
  const taskEditorWin = createWindow('task-editor');
  tasksMain.registerIpc(ipcMain, {
    getWindows: () => ({ taskEditorWin }),
  });

  const firstResult = await ipcMain.invoke(
    'task-file-select',
    { sender: taskEditorWin.webContents }
  );
  assert.deepEqual(firstResult, { ok: true, filePath: path.resolve(firstSelection) });
  assert.equal(openDialogCalls[0].options.defaultPath, documentsDir);
  assert.deepEqual(openDialogCalls[0].options.properties, ['openFile']);
  assert.equal(saveJsonCalls[0].targetPath, path.join(tempDir, 'task_file_picker_state.json'));
  assert.deepEqual(saveJsonCalls[0].payload, { lastDirectory: firstSelectionDir });

  openDialogCalls.length = 0;
  saveJsonCalls.length = 0;

  const secondResult = await ipcMain.invoke(
    'task-files-select',
    { sender: taskEditorWin.webContents }
  );
  assert.deepEqual(secondResult, { ok: true, filePaths: [path.resolve(secondSelection)] });
  assert.equal(openDialogCalls[0].options.defaultPath, firstSelectionDir);
  assert.deepEqual(openDialogCalls[0].options.properties, ['openFile', 'multiSelections']);
  assert.equal(saveJsonCalls[0].targetPath, path.join(tempDir, 'task_file_picker_state.json'));
  assert.deepEqual(saveJsonCalls[0].payload, { lastDirectory: secondSelectionDir });
});
