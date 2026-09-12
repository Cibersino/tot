'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
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
    emitChannel(channel, event, ...args) {
      emitter.emit(channel, event, ...args);
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

function createTaskEditorLifecycle({ allowReplacement = true } = {}) {
  let nextInitId = 0;
  const dirtyPayloads = [];
  return {
    dirtyPayloads,
    acceptDirtyState(_event, payload) {
      dirtyPayloads.push(payload);
      return true;
    },
    async confirmReplacement() {
      return allowReplacement;
    },
    prepareInitialization(_win, payload) {
      nextInitId += 1;
      return { ...payload, initId: nextInitId };
    },
    acceptInitializationIssued() {
      return true;
    },
  };
}

function loadFreshTasksMain({ dialogResponse = 1 } = {}) {
  const menuBuilderModulePath = path.resolve(__dirname, '../../../electron/menu_builder.js');
  const originalMenuBuilderModule = require.cache[menuBuilderModulePath];
  const settingsModulePath = path.resolve(__dirname, '../../../electron/settings.js');
  const originalSettingsModule = require.cache[settingsModulePath];

  const dialogCalls = [];
  const restoreElectronModule = installElectronModuleMock({
    dialog: {
      async showMessageBox(owner, options) {
        dialogCalls.push({ owner, options });
        return { response: dialogResponse };
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
      resolveDialogText(dialogTexts, key, fallback = key) {
        if (dialogTexts && typeof dialogTexts[key] === 'string') return dialogTexts[key];
        return fallback;
      },
      getDialogTexts() {
        return {
          continue_button: 'Yes, continue',
          cancel_button: 'No, cancel',
          task_discard_changes_confirm: 'There are unsaved changes. Discard them?',
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
        return { language: 'en' };
      },
    },
  };

  const modulePath = path.resolve(__dirname, '../../../electron/tasks_main.js');
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
  }

  return { tasksMain, dialogCalls, restore };
}

test('open-task-editor returns CONFIRM_DENIED when the Task lifecycle denies replacement', async () => {
  const { tasksMain, dialogCalls, restore } = loadFreshTasksMain({ dialogResponse: 1 });
  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  const taskEditorWin = createWindow('task-editor');
  const taskEditorLifecycle = createTaskEditorLifecycle({ allowReplacement: false });
  let ensureCalls = 0;

  try {
    tasksMain.registerIpc(ipcMain, {
      getWindows: () => ({ mainWin, taskEditorWin }),
      ensureTaskEditorWindow: () => {
        ensureCalls += 1;
      },
      taskEditorLifecycle,
    });

    const result = await ipcMain.invoke(
      'open-task-editor',
      { sender: mainWin.webContents },
      { mode: 'new' }
    );

    assert.deepEqual(result, { ok: false, code: 'CONFIRM_DENIED' });
    assert.equal(ensureCalls, 0);
    assert.equal(taskEditorWin.sentMessages.length, 0);
    assert.equal(dialogCalls.length, 0);
  } finally {
    restore();
  }
});

test('open-task-editor issues a correlated task-editor-init after replacement is authorized', async () => {
  const { tasksMain, dialogCalls, restore } = loadFreshTasksMain({ dialogResponse: 0 });
  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  const taskEditorWin = createWindow('task-editor');
  const taskEditorLifecycle = createTaskEditorLifecycle({ allowReplacement: true });
  let ensureCalls = 0;

  try {
    tasksMain.registerIpc(ipcMain, {
      getWindows: () => ({ mainWin, taskEditorWin }),
      ensureTaskEditorWindow: () => {
        ensureCalls += 1;
      },
      taskEditorLifecycle,
    });

    const result = await ipcMain.invoke(
      'open-task-editor',
      { sender: mainWin.webContents },
      { mode: 'new' }
    );

    assert.deepEqual(result, { ok: true });
    assert.equal(ensureCalls, 1);
    assert.equal(dialogCalls.length, 0);
    assert.equal(taskEditorWin.sentMessages.length, 1);
    assert.equal(taskEditorWin.sentMessages[0].channel, 'task-editor-init');
    assert.equal(taskEditorWin.sentMessages[0].payload.mode, 'new');
    assert.equal(taskEditorWin.sentMessages[0].payload.task.type, 'task');
    assert.equal(taskEditorWin.sentMessages[0].payload.initId, 1);
    assert.equal(taskEditorWin.sentMessages[0].payload.task.meta.savedWith, 'toT (totapp.org)');
    assert.equal(
      taskEditorWin.sentMessages[0].payload.task.meta.createdAt,
      taskEditorWin.sentMessages[0].payload.task.meta.updatedAt
    );
  } finally {
    restore();
  }
});

test('task-editor-dirty-state delegates its payload to the Task lifecycle owner', async () => {
  const { tasksMain, restore } = loadFreshTasksMain({ dialogResponse: 1 });
  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  const taskEditorWin = createWindow('task-editor');
  const taskEditorLifecycle = createTaskEditorLifecycle();

  try {
    tasksMain.registerIpc(ipcMain, {
      getWindows: () => ({ mainWin, taskEditorWin }),
      ensureTaskEditorWindow() {},
      taskEditorLifecycle,
    });

    const payload = { dirty: true, initId: 3 };
    ipcMain.emitChannel('task-editor-dirty-state', { sender: taskEditorWin.webContents }, payload);
    assert.deepEqual(taskEditorLifecycle.dirtyPayloads, [payload]);
  } finally {
    restore();
  }
});

test('open-task-editor rejects an invalid mode instead of treating it as a new task', async () => {
  const { tasksMain, restore } = loadFreshTasksMain({ dialogResponse: 0 });
  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  const taskEditorWin = createWindow('task-editor');
  const taskEditorLifecycle = createTaskEditorLifecycle();
  let ensureCalls = 0;

  try {
    tasksMain.registerIpc(ipcMain, {
      getWindows: () => ({ mainWin, taskEditorWin }),
      ensureTaskEditorWindow() {
        ensureCalls += 1;
      },
      taskEditorLifecycle,
    });

    const result = await ipcMain.invoke(
      'open-task-editor',
      { sender: mainWin.webContents },
      { mode: false }
    );

    assert.deepEqual(result, { ok: false, code: 'INVALID_REQUEST' });
    assert.equal(ensureCalls, 0);
    assert.equal(taskEditorWin.sentMessages.length, 0);
  } finally {
    restore();
  }
});
