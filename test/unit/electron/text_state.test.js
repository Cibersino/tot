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

function loadTextState({ clipboardReadText = () => '', logDouble = null, ...options } = {}) {
  const textStateModulePath = path.resolve(
    __dirname,
    '../../../electron/text_state.js'
  );
  const logModulePath = path.resolve(__dirname, '../../../electron/log.js');
  const restoreElectronModule = installElectronModuleMock({
    clipboard: {
      readText() {
        return clipboardReadText();
      },
    },
    BrowserWindow: {
      fromWebContents(webContents) {
        return webContents && webContents.__ownerWindow ? webContents.__ownerWindow : null;
      },
    },
  });
  const originalTextStateModule = require.cache[textStateModulePath];
  const originalLogModule = require.cache[logModulePath];
  if (logDouble) {
    require.cache[logModulePath] = {
      exports: {
        get() {
          return logDouble;
        },
      },
    };
  }
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
    ...options,
  });

  function restore() {
    delete require.cache[textStateModulePath];
    if (originalTextStateModule) {
      require.cache[textStateModulePath] = originalTextStateModule;
    }
    if (originalLogModule) {
      require.cache[logModulePath] = originalLogModule;
    } else {
      delete require.cache[logModulePath];
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

test('set-current-text rejects non-string text without converting it to empty text', async (t) => {
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
    { text: false, meta: { source: 'main-window', action: 'set' } }
  );

  assert.deepEqual(result, { ok: false, error: 'invalid payload' });
  assert.equal(textState.getCurrentText(), '');
  assert.deepEqual(mainWindowDouble.sends, []);
  assert.deepEqual(editorWindowDouble.sends, []);
});

test('clipboard-read-text rejects a malformed native value instead of returning empty text', async (t) => {
  const { textState, restore } = loadTextState({
    clipboardReadText() {
      return false;
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  const mainWindowDouble = createWindowDouble('main');
  mainWindowDouble.win.webContents.__ownerWindow = mainWindowDouble.win;
  textState.registerIpc(ipcMain, () => ({ mainWin: mainWindowDouble.win }));

  const result = await ipcMain.invoke(
    'clipboard-read-text',
    { sender: mainWindowDouble.win.webContents }
  );

  assert.deepEqual(result, { ok: false, error: 'clipboard read returned a non-string value' });
});

test('applyCurrentText leaves an absent editor window as a normal no-op', (t) => {
  const warnOnceCalls = [];
  const { textState, restore } = loadTextState({
    logDouble: {
      debug() {},
      warn() {},
      warnOnce(...args) {
        warnOnceCalls.push(args);
      },
      error() {},
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  const mainWindowDouble = createWindowDouble('main');
  textState.registerIpc(ipcMain, () => ({
    mainWin: mainWindowDouble.win,
    editorWin: null,
  }));

  textState.applyCurrentText('hello', { source: 'main-window', action: 'set' });

  assert.deepEqual(warnOnceCalls, []);
  assert.deepEqual(mainWindowDouble.sends, [
    {
      channel: 'current-text-updated',
      payload: {
        text: 'hello',
        requestId: 1,
        meta: { source: 'main-window', action: 'set' },
      },
    },
  ]);
});

test('applyCurrentText keeps destroyed-window diagnostics separate from send failures', (t) => {
  const warnOnceCalls = [];
  const { textState, restore } = loadTextState({
    logDouble: {
      debug() {},
      warn() {},
      warnOnce(...args) {
        warnOnceCalls.push(args);
      },
      error() {},
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  const destroyedMainWindow = {
    isDestroyed() {
      return true;
    },
  };
  const throwingEditorWindow = {
    isDestroyed() {
      return false;
    },
    webContents: {
      send() {
        throw new Error('editor renderer unavailable');
      },
    },
  };
  textState.registerIpc(ipcMain, () => ({
    mainWin: destroyedMainWindow,
    editorWin: throwingEditorWindow,
  }));

  textState.applyCurrentText('hello', { source: 'main-window', action: 'set' });

  assert.equal(warnOnceCalls.length, 2);
  assert.deepEqual(warnOnceCalls[0], [
    'text_state.safeSend.destroyed:current-text-updated',
    "webContents.send('current-text-updated') failed (ignored): target window destroyed.",
  ]);
  assert.equal(warnOnceCalls[1][0], 'text_state.safeSend:editor-text-updated');
  assert.equal(
    warnOnceCalls[1][1],
    "webContents.send('editor-text-updated') failed (ignored):"
  );
  assert.equal(warnOnceCalls[1][2].message, 'editor renderer unavailable');
});

test('set-current-text notifies empty transition only when authoritative text becomes empty', async (t) => {
  const emptyTransitions = [];
  const { textState, restore } = loadTextState({
    onCurrentTextDidBecomeEmpty(payload) {
      emptyTransitions.push(payload);
    },
  });
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

  await ipcMain.invoke(
    'set-current-text',
    { sender: mainWindowDouble.win.webContents },
    {
      text: 'texto',
      meta: { source: 'main-window', action: 'overwrite' },
    }
  );
  await ipcMain.invoke(
    'set-current-text',
    { sender: mainWindowDouble.win.webContents },
    {
      text: '',
      meta: { source: 'main-window', action: 'clear' },
    }
  );
  await ipcMain.invoke(
    'set-current-text',
    { sender: mainWindowDouble.win.webContents },
    {
      text: '',
      meta: { source: 'main-window', action: 'clear' },
    }
  );

  assert.deepEqual(emptyTransitions, [
    {
      previousText: 'texto',
      nextText: '',
      requestId: 1,
      meta: { source: 'main-window', action: 'clear' },
    },
  ]);
});
