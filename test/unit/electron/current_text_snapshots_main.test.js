'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

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

function loadSnapshotsMainWithMocks({
  senderWin,
  rootDir,
  currentText = 'Snapshot text',
  shellOpenPathResult = '',
  messageBoxResponse = 0,
}) {
  const electronModulePath = require.resolve('electron');
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

  const originalElectronModule = require.cache[electronModulePath];
  const originalSnapshotsModule = require.cache[snapshotsModulePath];
  const originalFsStorageModule = require.cache[fsStorageModulePath];
  const originalTextStateModule = require.cache[textStateModulePath];
  const originalSettingsModule = require.cache[settingsModulePath];
  const originalMenuBuilderModule = require.cache[menuBuilderModulePath];
  const openPathCalls = [];
  const showMessageBoxCalls = [];

  require.cache[electronModulePath] = {
    id: electronModulePath,
    filename: electronModulePath,
    loaded: true,
    exports: {
      dialog: {
        async showSaveDialog() {
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
    },
  };

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
      saveJson(targetPath, payload) {
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
        return { language: 'en' };
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

    if (originalElectronModule) {
      require.cache[electronModulePath] = originalElectronModule;
    } else {
      delete require.cache[electronModulePath];
    }

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
  };
}

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
      tags: {
        language: 'es',
      },
    }
  );

  assert.equal(firstSave.ok, true);
  assert.equal(firstSave.filename, 'Unit_1.json');
  const firstPayload = JSON.parse(fs.readFileSync(path.join(rootDir, firstSave.filename), 'utf8'));
  assert.equal(firstPayload.text, 'Batch snapshot text');
  assert.deepEqual(firstPayload.tags, { language: 'es' });

  const secondSave = await ipcMain.invoke(
    'current-text-snapshot-save',
    { sender: senderWin.webContents },
    {
      nonInteractive: true,
      autoFileBaseName: 'Unit 1',
      tags: null,
    }
  );

  assert.equal(secondSave.ok, true);
  assert.equal(secondSave.filename, 'Unit_1_2.json');
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
  fs.writeFileSync(snapshotPath, JSON.stringify({ text: 'Loaded snapshot text' }, null, 2));

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
  fs.writeFileSync(snapshotPath, JSON.stringify({ text: 'Loaded snapshot text' }, null, 2));

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
