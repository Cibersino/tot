'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');

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

function loadFreshTasksMain({ dialogResponse = 1 } = {}) {
  const electronModulePath = require.resolve('electron');
  const originalElectronModule = require.cache[electronModulePath];
  const menuBuilderModulePath = path.resolve(__dirname, '../../../electron/menu_builder.js');
  const originalMenuBuilderModule = require.cache[menuBuilderModulePath];
  const settingsModulePath = path.resolve(__dirname, '../../../electron/settings.js');
  const originalSettingsModule = require.cache[settingsModulePath];

  const dialogCalls = [];

  require.cache[electronModulePath] = {
    id: electronModulePath,
    filename: electronModulePath,
    loaded: true,
    exports: {
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
    },
  };

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
    if (originalElectronModule) {
      require.cache[electronModulePath] = originalElectronModule;
    } else {
      delete require.cache[electronModulePath];
    }
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

test('open-task-editor returns CONFIRM_DENIED when dirty Task Editor discard is cancelled', async () => {
  const { tasksMain, dialogCalls, restore } = loadFreshTasksMain({ dialogResponse: 1 });
  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  const taskEditorWin = createWindow('task-editor');
  let ensureCalls = 0;

  try {
    tasksMain.registerIpc(ipcMain, {
      getWindows: () => ({ mainWin, taskEditorWin }),
      ensureTaskEditorWindow: () => {
        ensureCalls += 1;
      },
    });

    ipcMain.emitChannel('task-editor-dirty-state', { sender: taskEditorWin.webContents }, { dirty: true });

    const result = await ipcMain.invoke(
      'open-task-editor',
      { sender: mainWin.webContents },
      { mode: 'new' }
    );

    assert.deepEqual(result, { ok: false, code: 'CONFIRM_DENIED' });
    assert.equal(ensureCalls, 0);
    assert.equal(taskEditorWin.sentMessages.length, 0);
    assert.equal(dialogCalls.length, 1);
    assert.equal(dialogCalls[0].owner, mainWin);
    assert.equal(dialogCalls[0].options.message, 'There are unsaved changes. Discard them?');
  } finally {
    restore();
  }
});

test('open-task-editor sends task-editor-init after dirty Task Editor discard is confirmed', async () => {
  const { tasksMain, dialogCalls, restore } = loadFreshTasksMain({ dialogResponse: 0 });
  const ipcMain = createIpcMainMock();
  const mainWin = createWindow('main');
  const taskEditorWin = createWindow('task-editor');
  let ensureCalls = 0;

  try {
    tasksMain.registerIpc(ipcMain, {
      getWindows: () => ({ mainWin, taskEditorWin }),
      ensureTaskEditorWindow: () => {
        ensureCalls += 1;
      },
    });

    ipcMain.emitChannel('task-editor-dirty-state', { sender: taskEditorWin.webContents }, { dirty: true });

    const result = await ipcMain.invoke(
      'open-task-editor',
      { sender: mainWin.webContents },
      { mode: 'new' }
    );

    assert.deepEqual(result, { ok: true });
    assert.equal(ensureCalls, 1);
    assert.equal(dialogCalls.length, 1);
    assert.equal(taskEditorWin.sentMessages.length, 1);
    assert.equal(taskEditorWin.sentMessages[0].channel, 'task-editor-init');
    assert.equal(taskEditorWin.sentMessages[0].payload.mode, 'new');
  } finally {
    restore();
  }
});
