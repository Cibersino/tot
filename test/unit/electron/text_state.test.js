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
        revision: 2,
        requestId: 1,
        meta: { source: 'editor', action: 'typing' },
      },
    },
  ]);
});

test('Editor receives an authorized versioned current-text bootstrap snapshot', async (t) => {
  const { textState, restore } = loadTextState();
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  const mainWindowDouble = createWindowDouble('main');
  const editorWindowDouble = createWindowDouble('editor');
  mainWindowDouble.win.webContents.__ownerWindow = mainWindowDouble.win;
  editorWindowDouble.win.webContents.__ownerWindow = editorWindowDouble.win;
  textState.applyCurrentText('authoritative text', {
    source: 'main-window',
    action: 'overwrite',
  });

  textState.registerIpc(ipcMain, () => ({
    mainWin: mainWindowDouble.win,
    editorWin: editorWindowDouble.win,
  }));

  const snapshot = await ipcMain.invoke(
    'get-editor-current-text-snapshot',
    { sender: editorWindowDouble.win.webContents }
  );

  assert.deepEqual(snapshot, {
    ok: true,
    text: 'authoritative text',
    revision: 2,
  });
});

test('Editor current-text revision remains available when processing begin fails', async (t) => {
  let beginCalls = 0;
  const { textState, restore } = loadTextState({
    currentTextProcessingController: {
      begin() {
        beginCalls += 1;
        if (beginCalls === 1) return { requestId: 5 };
        throw new Error('processing begin failed');
      },
      getState() {
        return { requestId: 5 };
      },
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

  const result = textState.applyCurrentText('committed despite processing failure', {
    source: 'main-window',
    action: 'overwrite',
  });
  const snapshot = await ipcMain.invoke(
    'get-editor-current-text-snapshot',
    { sender: editorWindowDouble.win.webContents }
  );

  assert.equal(result.requestId, null);
  assert.deepEqual(editorWindowDouble.sends.at(-1), {
    channel: 'editor-text-updated',
    payload: {
      text: 'committed despite processing failure',
      revision: 2,
      requestId: null,
      meta: { source: 'main-window', action: 'overwrite' },
    },
  });
  assert.deepEqual(snapshot, {
    ok: true,
    text: 'committed despite processing failure',
    revision: 2,
  });
});

test('Editor current-text bootstrap snapshot rejects a non-Editor sender', async (t) => {
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

  const snapshot = await ipcMain.invoke(
    'get-editor-current-text-snapshot',
    { sender: mainWindowDouble.win.webContents }
  );

  assert.deepEqual(snapshot, { ok: false, error: 'unauthorized' });
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

test('bootstrap fallback diagnostics use a normal warning', (t) => {
  const warnCalls = [];
  const warnOnceCalls = [];
  const { restore } = loadTextState({
    logDouble: {
      debug() {},
      warn(...args) {
        warnCalls.push(args);
      },
      warnOnce(...args) {
        warnOnceCalls.push(args);
      },
      error() {},
    },
    loadJson() {
      return [];
    },
  });
  t.after(restore);

  assert.deepEqual(warnCalls, [
    ['BOOTSTRAP: Current text file has unexpected shape; using empty string.'],
  ]);
  assert.deepEqual(warnOnceCalls, []);
});

test('set-current-text logs each distinct invalid action and oversized payload', async (t) => {
  const warnCalls = [];
  const warnOnceCalls = [];
  const { textState, restore } = loadTextState({
    logDouble: {
      debug() {},
      warn(...args) {
        warnCalls.push(args);
      },
      warnOnce(...args) {
        warnOnceCalls.push(args);
      },
      error() {},
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  const mainWindowDouble = createWindowDouble('main');
  mainWindowDouble.win.webContents.__ownerWindow = mainWindowDouble.win;
  textState.registerIpc(ipcMain, () => ({ mainWin: mainWindowDouble.win }));

  await ipcMain.invoke(
    'set-current-text',
    { sender: mainWindowDouble.win.webContents },
    { text: 'one', meta: { action: 'unexpected-one' } }
  );
  await ipcMain.invoke(
    'set-current-text',
    { sender: mainWindowDouble.win.webContents },
    { text: 'two', meta: { action: 'unexpected-two' } }
  );
  await ipcMain.invoke(
    'set-current-text',
    { sender: mainWindowDouble.win.webContents },
    { text: 'x'.repeat(513) }
  );
  await ipcMain.invoke(
    'set-current-text',
    { sender: mainWindowDouble.win.webContents },
    { text: 'x'.repeat(514) }
  );

  assert.deepEqual(warnCalls, [
    ["set-current-text invalid action 'unexpected-one'; using 'set'."],
    ["set-current-text invalid action 'unexpected-two'; using 'set'."],
    ['set-current-text payload too large (513 > 512); rejecting.'],
    ['set-current-text payload too large (514 > 512); rejecting.'],
  ]);
  assert.deepEqual(warnOnceCalls, []);
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
  const warnCalls = [];
  const warnOnceCalls = [];
  const { textState, restore } = loadTextState({
    logDouble: {
      debug() {},
      warn(...args) {
        warnCalls.push(args);
      },
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

  assert.equal(warnOnceCalls.length, 1);
  assert.deepEqual(warnOnceCalls[0], [
    'text_state.safeSend.destroyed:current-text-updated',
    "webContents.send('current-text-updated') failed (ignored): target window destroyed.",
  ]);
  assert.equal(warnCalls.length, 1);
  assert.equal(warnCalls[0][0], "webContents.send('editor-text-updated') failed (ignored):");
  assert.equal(warnCalls[0][1].message, 'editor renderer unavailable');
});

test('applyCurrentText logs each distinct send exception on the same channel', (t) => {
  const warnCalls = [];
  const { textState, restore } = loadTextState({
    logDouble: {
      debug() {},
      warn(...args) {
        warnCalls.push(args);
      },
      warnOnce() {},
      error() {},
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  const mainWindowDouble = createWindowDouble('main');
  let sendAttempt = 0;
  const throwingEditorWindow = {
    isDestroyed() {
      return false;
    },
    webContents: {
      send() {
        sendAttempt += 1;
        throw new Error(`editor send failure ${sendAttempt}`);
      },
    },
  };
  textState.registerIpc(ipcMain, () => ({
    mainWin: mainWindowDouble.win,
    editorWin: throwingEditorWindow,
  }));

  textState.applyCurrentText('one', { source: 'main-window', action: 'set' });
  textState.applyCurrentText('two', { source: 'main-window', action: 'set' });

  assert.equal(warnCalls.length, 2);
  assert.equal(warnCalls[0][0], "webContents.send('editor-text-updated') failed (ignored):");
  assert.equal(warnCalls[0][1].message, 'editor send failure 1');
  assert.equal(warnCalls[1][0], "webContents.send('editor-text-updated') failed (ignored):");
  assert.equal(warnCalls[1][1].message, 'editor send failure 2');
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

test('loadInitialCurrentText recovers a noncanonical root string and reports it', (t) => {
  const warnCalls = [];
  const { textState, restore } = loadTextState({
    loadJson() {
      return 'recovered text';
    },
    logDouble: {
      debug() {},
      warn(...args) {
        warnCalls.push(args);
      },
      warnOnce() {},
      error() {},
    },
  });
  t.after(restore);

  assert.equal(textState.getCurrentText(), 'recovered text');
  assert.deepEqual(warnCalls, [[
    'BOOTSTRAP: Current text file uses noncanonical root-string form; recovering text.',
  ]]);
});
