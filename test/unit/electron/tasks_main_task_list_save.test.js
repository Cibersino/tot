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
  const webContents = {
    __mockWindow: null,
  };
  const win = {
    name,
    webContents,
    isDestroyed() {
      return false;
    },
  };
  webContents.__mockWindow = win;
  return win;
}

function getLibraryFilePath(tasksRoot) {
  return path.resolve(path.join(tasksRoot, '..', 'library.json'));
}

function writeJsonFile(targetPath, payload) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
}

function loadFreshTasksMainForSave({
  tasksRoot,
  saveDialogPath,
  saveJsonStrictImpl = null,
  openDialogResponse = null,
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

  const restoreElectronModule = installElectronModuleMock({
    dialog: {
      async showOpenDialog() {
        if (openDialogResponse) return openDialogResponse;
        return { canceled: true, filePaths: [] };
      },
      async showSaveDialog() {
        return { canceled: false, filePath: saveDialogPath };
      },
      async showMessageBox() {
        return { response: 0 };
      },
    },
    shell: {},
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
      normalizeSnapshotRelPath(rawValue) {
        return typeof rawValue === 'string' ? rawValue.trim() : '';
      },
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
      saveJson() {},
      saveJsonStrict(targetPath, payload) {
        if (typeof saveJsonStrictImpl === 'function') {
          return saveJsonStrictImpl(targetPath, payload);
        }
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
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

  return { tasksMain, restore };
}

test('task-list-save persists task data through saveJsonStrict', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save');
  const tasksRoot = path.join(tempDir, 'lists');
  const saveDialogPath = path.join(tasksRoot, 'Session Plan.json');
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
      meta: { name: 'Session Plan' },
      rows: [
        {
          texto: 'Read chapter 1',
          tiempoSeconds: 120,
          percentComplete: 25,
          enlace: '',
          comentario: '',
          snapshotRelPath: '',
        },
      ],
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.path, path.resolve(path.join(tasksRoot, 'Session_Plan.json')));
  assert.equal(result.meta.name, 'Session Plan');

  const savedPayload = JSON.parse(fs.readFileSync(result.path, 'utf8'));
  assert.equal(savedPayload.meta.name, 'Session Plan');
  assert.equal(savedPayload.rows.length, 1);
  assert.equal(savedPayload.rows[0].texto, 'Read chapter 1');
});

test('task-list-save maps saveJsonStrict failures to WRITE_FAILED', async (t) => {
  const tempDir = createTestTempDir('tasks-main-save-failure');
  const tasksRoot = path.join(tempDir, 'lists');
  const saveDialogPath = path.join(tasksRoot, 'Failure Plan.json');
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
      meta: { name: 'Failure Plan' },
      rows: [
        {
          texto: 'Read chapter 2',
          tiempoSeconds: 240,
          percentComplete: 0,
          enlace: '',
          comentario: '',
          snapshotRelPath: '',
        },
      ],
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRITE_FAILED');
  assert.match(String(result.message || ''), /disk full/i);
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
      includeComment: true,
      row: {
        texto: 'Read chapter 1',
        tiempoSeconds: 180,
        enlace: 'https://example.com/read',
        comentario: 'Review key ideas',
        snapshotRelPath: 'snapshots/chapter-1.json',
      },
    }
  );

  assert.equal(result.ok, true);

  const savedLibrary = JSON.parse(fs.readFileSync(getLibraryFilePath(tasksRoot), 'utf8'));
  assert.deepEqual(savedLibrary, [{
    texto: 'Read chapter 1',
    tiempoSeconds: 180,
    enlace: 'https://example.com/read',
    comentario: 'Review key ideas',
    snapshotRelPath: 'snapshots/chapter-1.json',
  }]);
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
      row: {
        texto: 'Read chapter 2',
        tiempoSeconds: 240,
        enlace: '',
        comentario: '',
        snapshotRelPath: '',
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WRITE_FAILED');
  assert.match(String(result.message || ''), /disk full/i);
  assert.equal(fs.existsSync(getLibraryFilePath(tasksRoot)), false);
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
