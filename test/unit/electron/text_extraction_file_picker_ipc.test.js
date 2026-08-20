'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');

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

function loadPickerWithUnavailableSettings(dialogOptions) {
  const pickerModulePath = require.resolve('../../../electron/text_extraction_platform/text_extraction_file_picker_ipc');
  const settingsModulePath = require.resolve('../../../electron/settings');
  const fsStorageModulePath = require.resolve('../../../electron/fs_storage');
  const originalSettingsModule = require.cache[settingsModulePath];
  const originalFsStorageModule = require.cache[fsStorageModulePath];
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const restoreElectronModule = installElectronModuleMock({
    app: {
      getPath() {
        return process.cwd();
      },
    },
    dialog: {
      async showOpenDialog(_mainWin, options) {
        dialogOptions.push(options);
        return { canceled: true, filePaths: [] };
      },
    },
    BrowserWindow: {
      fromWebContents(webContents) {
        return webContents === senderWin.webContents ? senderWin : null;
      },
    },
  });

  require.cache[settingsModulePath] = {
    id: settingsModulePath,
    filename: settingsModulePath,
    loaded: true,
    exports: {
      getSettings() {
        throw new Error('settings unavailable');
      },
    },
  };
  require.cache[fsStorageModulePath] = {
    id: fsStorageModulePath,
    filename: fsStorageModulePath,
    loaded: true,
    exports: {
      getTextExtractionStateFile() {
        return path.join(process.cwd(), 'unused-picker-state.json');
      },
      loadJson(_filePath, fallback) {
        return fallback;
      },
      saveJson() {},
    },
  };

  delete require.cache[pickerModulePath];
  const picker = require(pickerModulePath);

  function restore() {
    delete require.cache[pickerModulePath];
    if (originalSettingsModule) {
      require.cache[settingsModulePath] = originalSettingsModule;
    } else {
      delete require.cache[settingsModulePath];
    }
    if (originalFsStorageModule) {
      require.cache[fsStorageModulePath] = originalFsStorageModule;
    } else {
      delete require.cache[fsStorageModulePath];
    }
    restoreElectronModule();
  }

  return { picker, senderWin, restore };
}

test('text-extraction picker resolves native dialog copy through DEFAULT_LANG when settings are unavailable', async (t) => {
  const dialogOptions = [];
  const { picker, senderWin, restore } = loadPickerWithUnavailableSettings(dialogOptions);
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  picker.registerIpc(ipcMain, {
    getWindows() {
      return { mainWin: senderWin };
    },
  });

  const result = await ipcMain.invoke(
    'text-extraction-open-picker',
    { sender: senderWin.webContents }
  );

  assert.deepEqual(result, { ok: true, canceled: true });
  assert.deepEqual(dialogOptions[0].filters.map((filter) => filter.name), [
    'Archivos compatibles',
    'Todos los archivos',
  ]);
});
