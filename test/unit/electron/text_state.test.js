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
        throw new Error(`Missing IPC handler: ${channel}`);
      }
      return handlers.get(channel)(event, ...args);
    },
  };
}

function createWindowDouble(name) {
  const sends = [];
  const webContents = {
    __ownerName: name,
    send(channel, payload) {
      sends.push({ channel, payload });
    },
  };

  return {
    sends,
    win: {
      isDestroyed() {
        return false;
      },
      webContents,
    },
  };
}

function loadTextState() {
  const textStateModulePath = path.resolve(
    __dirname,
    '../../../electron/text_state.js'
  );
  const restoreElectronModule = installElectronModuleMock({
    clipboard: {
      readText() {
        return '';
      },
    },
    BrowserWindow: {
      fromWebContents(webContents) {
        return webContents && webContents.__ownerWindow ? webContents.__ownerWindow : null;
      },
    },
  });
  const originalTextStateModule = require.cache[textStateModulePath];
  delete require.cache[textStateModulePath];

  const textState = require(textStateModulePath);
  textState.init({
    app: {
      on() {},
    },
    currentTextFile: 'current_text.json',
    settingsFile: 'settings.json',
    loadJson() {
      return { text: '' };
    },
    saveJson() {},
    maxTextChars: 128,
    currentTextProcessingController: {
      begin() {
        return { requestId: 1 };
      },
    },
  });

  function restore() {
    delete require.cache[textStateModulePath];
    if (originalTextStateModule) {
      require.cache[textStateModulePath] = originalTextStateModule;
    }
    restoreElectronModule();
  }

  return {
    textState,
    restore,
  };
}

test('set-current-text accepts canonical payloads from authorized windows and rewrites sender source', async (t) => {
  const { textState, restore } = loadTextState();
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  const mainWindowDouble = createWindowDouble('main');
  const editorWindowDouble = createWindowDouble('editor');
  mainWindowDouble.win.webContents.__ownerWindow = mainWindowDouble.win;
  editorWindowDouble.win.webContents.__ownerWindow = editorWindowDouble.win;

  textState.registerIpc(ipcMain, () => ({
    mainWin: mainWindowDouble.win,
    editorWin: editorWindowDouble.win,
  }));

  const result = await ipcMain.invoke(
    'set-current-text',
    { sender: editorWindowDouble.win.webContents },
    {
      text: 'hello',
      meta: { source: 'spoofed-source', action: 'typing' },
    }
  );

  assert.deepEqual(result, {
    ok: true,
    requestId: 1,
    truncated: false,
    length: 5,
    text: 'hello',
  });
  assert.equal(textState.getCurrentText(), 'hello');
  assert.deepEqual(mainWindowDouble.sends, [
    {
      channel: 'current-text-updated',
      payload: {
        text: 'hello',
        requestId: 1,
        meta: { source: 'editor', action: 'typing' },
      },
    },
  ]);
  assert.deepEqual(editorWindowDouble.sends, [
    {
      channel: 'editor-text-updated',
      payload: {
        text: 'hello',
        requestId: 1,
        meta: { source: 'editor', action: 'typing' },
      },
    },
  ]);
});

test('set-current-text rejects legacy string payloads', async (t) => {
  const { textState, restore } = loadTextState();
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  const mainWindowDouble = createWindowDouble('main');
  const editorWindowDouble = createWindowDouble('editor');
  mainWindowDouble.win.webContents.__ownerWindow = mainWindowDouble.win;
  editorWindowDouble.win.webContents.__ownerWindow = editorWindowDouble.win;

  textState.registerIpc(ipcMain, () => ({
    mainWin: mainWindowDouble.win,
    editorWin: editorWindowDouble.win,
  }));

  const result = await ipcMain.invoke(
    'set-current-text',
    { sender: mainWindowDouble.win.webContents },
    'legacy text'
  );

  assert.deepEqual(result, { ok: false, error: 'invalid payload' });
  assert.equal(textState.getCurrentText(), '');
  assert.deepEqual(mainWindowDouble.sends, []);
  assert.deepEqual(editorWindowDouble.sends, []);
});

test('set-current-text rejects object payloads that omit text', async (t) => {
  const { textState, restore } = loadTextState();
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  const mainWindowDouble = createWindowDouble('main');
  const editorWindowDouble = createWindowDouble('editor');
  mainWindowDouble.win.webContents.__ownerWindow = mainWindowDouble.win;
  editorWindowDouble.win.webContents.__ownerWindow = editorWindowDouble.win;

  textState.registerIpc(ipcMain, () => ({
    mainWin: mainWindowDouble.win,
    editorWin: editorWindowDouble.win,
  }));

  const result = await ipcMain.invoke(
    'set-current-text',
    { sender: mainWindowDouble.win.webContents },
    { meta: { source: 'main-window', action: 'overwrite' } }
  );

  assert.deepEqual(result, { ok: false, error: 'invalid payload' });
  assert.equal(textState.getCurrentText(), '');
  assert.deepEqual(mainWindowDouble.sends, []);
  assert.deepEqual(editorWindowDouble.sends, []);
});
