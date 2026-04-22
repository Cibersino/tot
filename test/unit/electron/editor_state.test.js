'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FS_STORAGE_PATH = path.resolve(__dirname, '../../../electron/fs_storage.js');
const EDITOR_STATE_PATH = path.resolve(__dirname, '../../../electron/editor_state.js');
const APP_ROOT_DIR = path.resolve(__dirname, '../../..');

function loadFreshModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createStorageHarness(t, initialState) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tot-editor-state-test-'));
  t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));

  const fsStorage = loadFreshModule(FS_STORAGE_PATH);
  fsStorage.initStorage({
    isReady() {
      return true;
    },
    getPath(name) {
      if (name !== 'userData') {
        throw new Error(`Unexpected path request: ${name}`);
      }
      return userDataDir;
    },
    getAppPath() {
      return APP_ROOT_DIR;
    },
  });
  fsStorage.ensureConfigDir();

  if (typeof initialState !== 'undefined') {
    fsStorage.saveJson(fsStorage.getEditorStateFile(), initialState);
  }

  const editorState = loadFreshModule(EDITOR_STATE_PATH);
  return { editorState, fsStorage };
}

function createEditorWindowDouble({
  maximized = false,
  destroyed = false,
  webContentsDestroyed = false,
} = {}) {
  const sentMessages = [];

  return {
    sentMessages,
    isDestroyed() {
      return destroyed;
    },
    isMaximized() {
      return maximized;
    },
    webContents: {
      send(channel, payload) {
        sentMessages.push({ channel, payload });
      },
      isDestroyed() {
        return webContentsDestroyed;
      },
    },
  };
}

class MockIpcMain {
  constructor() {
    this.handlers = new Map();
  }

  handle(channel, handler) {
    this.handlers.set(channel, handler);
  }

  async invoke(channel, event, ...args) {
    if (!this.handlers.has(channel)) {
      throw new Error(`Missing handler for ${channel}`);
    }
    return this.handlers.get(channel)(event, ...args);
  }
}

test('loadInitialState normalizes persisted maximized text width from editor_state.json', (t) => {
  const { editorState } = createStorageHarness(t, {
    maximized: 'bad',
    reduced: null,
    maximizedTextWidthPx: 9999,
  });

  const normalized = editorState.loadInitialState();

  assert.equal(normalized.maximized, true);
  assert.equal(normalized.reduced, null);
  assert.equal(normalized.maximizedTextWidthPx, 1600);
});

test('getWindowState reflects live maximized state and persisted maximized text width', (t) => {
  const { editorState } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    maximizedTextWidthPx: 880,
  });

  assert.deepEqual(editorState.getWindowState(null), {
    maximized: false,
    maximizedTextWidthPx: 880,
  });
  assert.deepEqual(
    editorState.getWindowState(createEditorWindowDouble({ maximized: true })),
    {
      maximized: true,
      maximizedTextWidthPx: 880,
    }
  );
});

test('notifyWindowState sends maximized text width through the editor window bridge', (t) => {
  const { editorState } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    maximizedTextWidthPx: 920,
  });
  const editorWin = createEditorWindowDouble({ maximized: true });

  const ok = editorState.notifyWindowState(editorWin, 'test.notifyWindowState');

  assert.equal(ok, true);
  assert.deepEqual(editorWin.sentMessages, [
    {
      channel: 'editor-window-state-changed',
      payload: { maximized: true, maximizedTextWidthPx: 920 },
    },
  ]);
});

test('registerIpc authorizes only the editor renderer for get-editor-window-state', async (t) => {
  const { editorState } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    maximizedTextWidthPx: 900,
  });
  const ipcMain = new MockIpcMain();
  const editorWin = createEditorWindowDouble({ maximized: true });

  editorState.registerIpc(ipcMain, {
    getEditorWindow: () => editorWin,
  });

  const authorized = await ipcMain.invoke('get-editor-window-state', {
    sender: editorWin.webContents,
  });
  assert.deepEqual(authorized, {
    ok: true,
    maximized: true,
    maximizedTextWidthPx: 900,
  });

  const unauthorized = await ipcMain.invoke('get-editor-window-state', {
    sender: {},
  });
  assert.deepEqual(unauthorized, {
    ok: false,
    error: 'unauthorized',
    maximized: false,
    maximizedTextWidthPx: 960,
  });
});

test('registerIpc persists maximized text width in editor_state.json and notifies the renderer', async (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    maximizedTextWidthPx: 960,
  });
  const ipcMain = new MockIpcMain();
  const editorWin = createEditorWindowDouble({ maximized: true });

  editorState.registerIpc(ipcMain, {
    getEditorWindow: () => editorWin,
  });

  const result = await ipcMain.invoke(
    'set-editor-maximized-text-width-px',
    { sender: editorWin.webContents },
    2000
  );

  assert.deepEqual(result, {
    ok: true,
    maximizedTextWidthPx: 1600,
  });
  assert.equal(
    fsStorage.loadJson(fsStorage.getEditorStateFile(), {}).maximizedTextWidthPx,
    1600
  );
  assert.deepEqual(editorWin.sentMessages, [
    {
      channel: 'editor-window-state-changed',
      payload: { maximized: true, maximizedTextWidthPx: 1600 },
    },
  ]);
});
