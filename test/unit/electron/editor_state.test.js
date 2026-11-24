'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');

const FS_STORAGE_PATH = path.resolve(__dirname, '../../../electron/fs_storage.js');
const EDITOR_STATE_PATH = path.resolve(__dirname, '../../../electron/editor_state.js');
const APP_ROOT_DIR = path.resolve(__dirname, '../../..');

function loadFreshModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createStorageHarness(t, initialState) {
  const userDataDir = createTestTempDir('editor-state');
  t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));
  t.after(installElectronModuleMock());

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
  bounds = { width: 1200, height: 800, x: 20, y: 20 },
  emitOnSetBounds = false,
} = {}) {
  const sentMessages = [];
  const sentEvents = [];
  const listeners = new Map();

  return {
    sentMessages,
    sentEvents,
    on(eventName, listener) {
      listeners.set(eventName, listener);
    },
    emit(eventName) {
      const listener = listeners.get(eventName);
      if (listener) listener();
    },
    isDestroyed() {
      return destroyed;
    },
    isMaximized() {
      return maximized;
    },
    getBounds() {
      return { ...bounds };
    },
    setBounds(nextBounds) {
      Object.assign(bounds, nextBounds);
      if (emitOnSetBounds) {
        const resizeListener = listeners.get('resize');
        const moveListener = listeners.get('move');
        if (resizeListener) resizeListener();
        if (moveListener) moveListener();
      }
    },
    webContents: {
      send(...args) {
        const [channel, payload] = args;
        sentEvents.push(args);
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

test('loadInitialState normalizes persisted editor preferences and maximized text width', (t) => {
  const { editorState } = createStorageHarness(t, {
    maximized: 'bad',
    reduced: null,
    spellcheckEnabled: 'bad',
    editorFontSizePx: 999,
    maximizedTextWidthPx: 9999,
  });

  const normalized = editorState.loadInitialState();

  assert.equal(normalized.maximized, true);
  assert.equal(normalized.reduced, null);
  assert.equal(normalized.spellcheckEnabled, true);
  assert.equal(normalized.editorFontSizePx, 36);
  assert.equal(normalized.maximizedTextWidthPx, 1600);
});

test('Text Editor state remains cache-authoritative across backing-file changes and reopening', (t) => {
  const initialState = {
    maximized: false,
    reduced: { width: 1100, height: 760, x: 20, y: 20 },
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 900,
  };
  const { editorState, fsStorage } = createStorageHarness(t, initialState);
  const editorStateFile = fsStorage.getEditorStateFile();

  assert.deepEqual(editorState.loadInitialState(), initialState);
  fsStorage.saveJson(editorStateFile, {
    maximized: true,
    reduced: { width: 1500, height: 900, x: 80, y: 90 },
    spellcheckEnabled: true,
    editorFontSizePx: 30,
    maximizedTextWidthPx: 1200,
  });

  const firstEditorWin = createEditorWindowDouble({
    maximized: false,
    bounds: { width: 1100, height: 760, x: 20, y: 20 },
  });
  editorState.attachTo(firstEditorWin);
  firstEditorWin.emit('close');

  const reopenedEditorWin = createEditorWindowDouble({ maximized: false });
  editorState.attachTo(reopenedEditorWin);

  assert.deepEqual(editorState.loadInitialState(), initialState);
  assert.deepEqual(editorState.getEditorState(reopenedEditorWin), {
    maximized: false,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 900,
  });
});

test('getEditorState reflects live maximized state and persisted editor preferences', (t) => {
  const { editorState } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 880,
  });

  assert.deepEqual(editorState.getEditorState(null), {
    maximized: false,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 880,
  });
  assert.deepEqual(
    editorState.getEditorState(createEditorWindowDouble({ maximized: true })),
    {
      maximized: true,
      spellcheckEnabled: false,
      editorFontSizePx: 24,
      maximizedTextWidthPx: 880,
    }
  );
});

test('notifyEditorState sends persisted editor preferences through the editor bridge', (t) => {
  const { editorState } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: false,
    editorFontSizePx: 22,
    maximizedTextWidthPx: 920,
  });
  const editorWin = createEditorWindowDouble({ maximized: true });

  const ok = editorState.notifyEditorState(editorWin, 'test.notifyEditorState');

  assert.equal(ok, true);
  assert.deepEqual(editorWin.sentMessages, [
    {
      channel: 'editor-state-changed',
      payload: {
        maximized: true,
        spellcheckEnabled: false,
        editorFontSizePx: 22,
        maximizedTextWidthPx: 920,
      },
    },
  ]);
});

test('registerIpc authorizes only the editor renderer for get-editor-state', async (t) => {
  const { editorState } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 900,
  });
  const ipcMain = new MockIpcMain();
  const editorWin = createEditorWindowDouble({ maximized: true });

  editorState.registerIpc(ipcMain, {
    getEditorWindow: () => editorWin,
  });

  const authorized = await ipcMain.invoke('get-editor-state', {
    sender: editorWin.webContents,
  });
  assert.deepEqual(authorized, {
    ok: true,
    maximized: true,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 900,
  });

  const unauthorized = await ipcMain.invoke('get-editor-state', {
    sender: {},
  });
  assert.deepEqual(unauthorized, {
    ok: false,
    error: 'unauthorized',
    maximized: false,
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  });
});

test('registerIpc persists editor preferences in editor_state.json and notifies only the editor', async (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  });
  const ipcMain = new MockIpcMain();
  const editorWin = createEditorWindowDouble({ maximized: true });

  editorState.registerIpc(ipcMain, {
    getEditorWindow: () => editorWin,
  });

  assert.deepEqual(
    await ipcMain.invoke(
      'set-editor-spellcheck-enabled',
      { sender: editorWin.webContents },
      false
    ),
    { ok: true, enabled: false }
  );
  assert.deepEqual(
    await ipcMain.invoke(
      'set-editor-font-size-px',
      { sender: editorWin.webContents },
      200
    ),
    { ok: true, editorFontSizePx: 36 }
  );

  assert.deepEqual(
    fsStorage.loadJson(fsStorage.getEditorStateFile(), {}),
    {
      maximized: true,
      reduced: null,
      spellcheckEnabled: false,
      editorFontSizePx: 36,
      maximizedTextWidthPx: 960,
    }
  );
  assert.equal(editorWin.sentMessages.length, 2);
  assert.equal(editorWin.sentMessages[0].channel, 'editor-state-changed');
  assert.equal(editorWin.sentMessages[1].channel, 'editor-state-changed');
});

test('maximized-width persistence preserves the other editor preferences', async (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
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
    persisted: true,
  });
  assert.deepEqual(
    fsStorage.loadJson(fsStorage.getEditorStateFile(), {}),
    {
      maximized: true,
      reduced: null,
      spellcheckEnabled: false,
      editorFontSizePx: 24,
      maximizedTextWidthPx: 1600,
    }
  );
});

test('window-state writes preserve editor preferences', (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: false,
    reduced: { width: 1100, height: 760, x: 20, y: 20 },
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 960,
  });
  const editorWin = createEditorWindowDouble({ maximized: true });

  editorState.attachTo(editorWin);
  editorWin.emit('maximize');

  const savedState = fsStorage.loadJson(fsStorage.getEditorStateFile(), {});
  assert.equal(savedState.maximized, true);
  assert.equal(savedState.spellcheckEnabled, false);
  assert.equal(savedState.editorFontSizePx, 24);
  assert.equal(savedState.maximizedTextWidthPx, 960);
});

test('maximize retains the actual window state in the cache when persistence fails', (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: false,
    reduced: { width: 1100, height: 760, x: 20, y: 20 },
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 960,
  });
  const editorWin = createEditorWindowDouble({ maximized: true });
  const editorStateFile = fsStorage.getEditorStateFile();

  editorState.attachTo(editorWin);
  fs.rmSync(editorStateFile);
  fs.mkdirSync(editorStateFile);
  editorWin.emit('maximize');

  assert.equal(editorState.loadInitialState().maximized, true);
  assert.deepEqual(editorWin.sentEvents, [
    [
      'editor-state-changed',
      {
        maximized: true,
        spellcheckEnabled: false,
        editorFontSizePx: 24,
        maximizedTextWidthPx: 960,
      },
    ],
  ]);
});

test('window geometry writes persist the complete Text Editor state without replacement', (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: false,
    reduced: null,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 900,
  });
  const editorWin = createEditorWindowDouble({
    bounds: { width: 1300, height: 820, x: 40, y: 60 },
  });
  const originalRenameSync = fs.renameSync;
  let renameCalls = 0;

  t.mock.method(fs, 'renameSync', (oldPath, newPath) => {
    renameCalls += 1;
    return originalRenameSync.call(fs, oldPath, newPath);
  });

  editorState.attachTo(editorWin);
  editorWin.emit('move');

  assert.equal(renameCalls, 0);
  assert.deepEqual(fsStorage.loadJson(fsStorage.getEditorStateFile(), {}), {
    maximized: false,
    reduced: { width: 1300, height: 820, x: 40, y: 60 },
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 900,
  });
});

test('shortcut actions persist editor font size without publishing global settings', (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  });
  const editorWin = createEditorWindowDouble({ maximized: true });
  const actions = editorState.getTextSizeShortcutActions({
    getEditorWindow: () => editorWin,
  });

  assert.deepEqual(actions.onIncreaseTextSize(), {
    ok: true,
    editorFontSizePx: 22,
  });
  assert.deepEqual(actions.onResetTextSize(), {
    ok: true,
    editorFontSizePx: 20,
  });
  assert.equal(
    fsStorage.loadJson(fsStorage.getEditorStateFile(), {}).editorFontSizePx,
    20
  );
  assert.equal(editorWin.sentMessages.length, 2);
});

test('strict spellcheck and font writes retain the authoritative cache when persistence fails', async (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: false,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  });
  const ipcMain = new MockIpcMain();
  const editorWin = createEditorWindowDouble({ maximized: true });
  const editorStateFile = fsStorage.getEditorStateFile();

  editorState.loadInitialState();
  fs.rmSync(editorStateFile);
  fs.mkdirSync(editorStateFile);

  editorState.registerIpc(ipcMain, {
    getEditorWindow: () => editorWin,
  });

  const fontResult = await ipcMain.invoke(
    'set-editor-font-size-px',
    { sender: editorWin.webContents },
    22
  );
  const spellcheckResult = await ipcMain.invoke(
    'set-editor-spellcheck-enabled',
    { sender: editorWin.webContents },
    true
  );

  assert.equal(fontResult.ok, false);
  assert.equal(typeof fontResult.error, 'string');
  assert.equal(spellcheckResult.ok, false);
  assert.equal(typeof spellcheckResult.error, 'string');
  assert.equal(editorWin.sentMessages.length, 0);
  assert.deepEqual(editorState.getEditorState(editorWin), {
    maximized: true,
    spellcheckEnabled: false,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  });
});

test('maximized text width retains cache and editor rendering state when persistence fails', async (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  });
  const ipcMain = new MockIpcMain();
  const editorWin = createEditorWindowDouble({ maximized: true });
  const editorStateFile = fsStorage.getEditorStateFile();

  editorState.loadInitialState();
  fs.rmSync(editorStateFile);
  fs.mkdirSync(editorStateFile);
  editorState.registerIpc(ipcMain, {
    getEditorWindow: () => editorWin,
  });

  assert.deepEqual(
    await ipcMain.invoke(
      'set-editor-maximized-text-width-px',
      { sender: editorWin.webContents },
      880
    ),
    {
      ok: true,
      maximizedTextWidthPx: 880,
      persisted: false,
    }
  );
  assert.equal(editorState.getEditorState(editorWin).maximizedTextWidthPx, 880);
  assert.equal(editorWin.sentMessages.length, 1);
  assert.equal(editorWin.sentMessages[0].channel, 'editor-state-changed');

  fs.rmSync(editorStateFile, { recursive: true, force: true });
  assert.deepEqual(
    await ipcMain.invoke(
      'set-editor-maximized-text-width-px',
      { sender: editorWin.webContents },
      880
    ),
    {
      ok: true,
      maximizedTextWidthPx: 880,
      persisted: true,
    }
  );
  assert.equal(
    fsStorage.loadJson(editorStateFile, {}).maximizedTextWidthPx,
    880
  );
  assert.equal(editorWin.sentMessages.length, 1);
});

test('native font shortcut failure emits only the narrow failure notification', (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  });
  const editorWin = createEditorWindowDouble({ maximized: true });
  const editorStateFile = fsStorage.getEditorStateFile();

  editorState.loadInitialState();
  fs.rmSync(editorStateFile);
  fs.mkdirSync(editorStateFile);

  const actions = editorState.getTextSizeShortcutActions({
    getEditorWindow: () => editorWin,
  });
  assert.equal(actions.onIncreaseTextSize().ok, false);

  assert.deepEqual(editorWin.sentEvents, [['editor-font-size-persistence-failed']]);
  assert.equal(editorState.getEditorState(editorWin).editorFontSizePx, 20);
});

test('geometry updates retain actual cache state despite a persistence failure', (t) => {
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: false,
    reduced: { width: 1100, height: 760, x: 20, y: 20 },
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  });
  const editorStateFile = fsStorage.getEditorStateFile();
  const editorWin = createEditorWindowDouble({
    maximized: false,
    bounds: { width: 1300, height: 820, x: 40, y: 60 },
  });

  editorState.loadInitialState();
  fs.rmSync(editorStateFile);
  fs.mkdirSync(editorStateFile);
  editorState.attachTo(editorWin);
  editorWin.emit('move');

  assert.deepEqual(editorState.loadInitialState(), {
    maximized: false,
    reduced: { width: 1300, height: 820, x: 40, y: 60 },
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  });
  assert.deepEqual(editorWin.sentMessages, []);
});

test('native move or resize before first unmaximize preserves the unestablished maximized state', (t) => {
  const initialState = {
    maximized: true,
    reduced: null,
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    maximizedTextWidthPx: 960,
  };
  const { editorState, fsStorage } = createStorageHarness(t, initialState);
  const editorStateFile = fsStorage.getEditorStateFile();
  const editorWin = createEditorWindowDouble({
    maximized: false,
    bounds: { width: 1300, height: 820, x: 40, y: 60 },
  });

  editorState.loadInitialState();
  editorState.attachTo(editorWin);
  editorWin.emit('resize');
  editorWin.emit('move');

  assert.deepEqual(editorState.loadInitialState(), initialState);
  assert.deepEqual(fsStorage.loadJson(editorStateFile, null), initialState);
});

test('unmaximize establishes cached restored bounds before setBounds native events', (t) => {
  const restoredBounds = { width: 1100, height: 760, x: 20, y: 20 };
  const { editorState, fsStorage } = createStorageHarness(t, {
    maximized: true,
    reduced: restoredBounds,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 900,
  });
  const editorStateFile = fsStorage.getEditorStateFile();
  const editorWin = createEditorWindowDouble({
    maximized: false,
    bounds: { width: 1500, height: 900, x: 80, y: 90 },
    emitOnSetBounds: true,
  });

  editorState.loadInitialState();
  fsStorage.saveJson(editorStateFile, {
    maximized: true,
    reduced: null,
    spellcheckEnabled: true,
    editorFontSizePx: 30,
    maximizedTextWidthPx: 1200,
  });
  editorState.attachTo(editorWin);
  editorWin.emit('unmaximize');

  assert.deepEqual(editorState.loadInitialState(), {
    maximized: false,
    reduced: restoredBounds,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 900,
  });
  assert.equal(editorWin.sentMessages.length, 1);
  assert.equal(editorWin.sentMessages[0].channel, 'editor-state-changed');
});
