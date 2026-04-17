'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
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

class MockWebContents extends EventEmitter {
  constructor() {
    super();
    this._loading = false;
    this._nextFindRequestId = 1;
    this.sentMessages = [];
    this.findCalls = [];
    this.stopFindCalls = [];
  }

  isLoadingMainFrame() {
    return this._loading;
  }

  isLoading() {
    return this._loading;
  }

  send(channel, payload) {
    this.sentMessages.push({ channel, payload });
  }

  findInPage(text, options) {
    const requestId = this._nextFindRequestId;
    this._nextFindRequestId += 1;
    this.findCalls.push({ text, options, requestId });
    return requestId;
  }

  stopFindInPage(action) {
    this.stopFindCalls.push(action);
  }

  focus() {}
}

class MockWindow extends EventEmitter {
  constructor() {
    super();
    this.webContents = new MockWebContents();
    this._destroyed = false;
    this.bounds = [];
  }

  isDestroyed() {
    return this._destroyed;
  }

  getContentBounds() {
    return { x: 0, y: 0, width: 1280, height: 720 };
  }

  setBounds(bounds) {
    this.bounds.push(bounds);
  }

  focus() {}

  close() {
    this._destroyed = true;
    this.emit('closed');
  }
}

class FakeFindWindow extends MockWindow {
  constructor() {
    super();
    FakeFindWindow.instances.push(this);
  }

  static reset() {
    FakeFindWindow.instances = [];
  }

  setMenu() {}

  setMenuBarVisibility() {}

  loadFile() {
    this.webContents._loading = true;
    setImmediate(() => {
      this.webContents._loading = false;
      this.emit('ready-to-show');
      this.webContents.emit('did-finish-load');
    });
  }

  show() {}

  focus() {
    this.emit('focus');
  }
}

FakeFindWindow.instances = [];

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function getLastMessage(sentMessages, channel) {
  for (let index = sentMessages.length - 1; index >= 0; index -= 1) {
    if (sentMessages[index].channel === channel) {
      return sentMessages[index];
    }
  }
  return null;
}

function loadEditorFindMainWithMocks() {
  const electronModulePath = require.resolve('electron');
  const originalElectronModule = require.cache[electronModulePath];

  FakeFindWindow.reset();
  require.cache[electronModulePath] = {
    id: electronModulePath,
    filename: electronModulePath,
    loaded: true,
    exports: {
      BrowserWindow: FakeFindWindow,
      screen: {
        getDisplayNearestPoint() {
          return {
            workArea: { x: 0, y: 0, width: 1600, height: 900 },
          };
        },
      },
    },
  };

  const modulePath = require.resolve('../../../electron/editor_find_main');
  delete require.cache[modulePath];
  const editorFindMain = require(modulePath);

  function restore() {
    delete require.cache[modulePath];
    if (originalElectronModule) {
      require.cache[electronModulePath] = originalElectronModule;
      return;
    }
    delete require.cache[electronModulePath];
  }

  return { editorFindMain, restore };
}

async function setupFindHarness() {
  const { editorFindMain, restore } = loadEditorFindMainWithMocks();
  const ipcMain = createIpcMainMock();
  const editorWin = new MockWindow();

  editorFindMain.registerIpc(ipcMain);
  editorFindMain.attachEditorWindow(editorWin, {});

  const openEvent = { preventDefault() {} };
  editorWin.webContents.emit('before-input-event', openEvent, {
    type: 'keyDown',
    control: true,
    meta: false,
    alt: false,
    key: 'h',
    code: 'KeyH',
  });

  await tick();
  await tick();

  const findWin = editorFindMain.getFindWindow();
  assert.ok(findWin, 'expected find window to open');

  const findEvent = { sender: findWin.webContents };

  return {
    editorFindMain,
    ipcMain,
    editorWin,
    findWin,
    findEvent,
    restore,
  };
}

test('editor-find-replace-current rejects unauthorized find-window senders', async () => {
  const { ipcMain, restore } = await setupFindHarness();

  try {
    const result = await ipcMain.invoke(
      'editor-find-replace-current',
      { sender: {} },
      'demo'
    );

    assert.deepEqual(result, {
      ok: false,
      error: 'unauthorized',
    });
  } finally {
    restore();
  }
});

test('find window focus reruns the current query on current editor text', async () => {
  const {
    ipcMain,
    editorWin,
    findEvent,
    findWin,
    restore,
  } = await setupFindHarness();

  try {
    await ipcMain.invoke('editor-find-set-query', findEvent, 'prueba');
    const initialRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    editorWin.webContents.emit('found-in-page', {}, {
      requestId: initialRequestId,
      matches: 2,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });

    findWin.emit('focus');
    await tick();

    const resyncCall = editorWin.webContents.findCalls.at(-1);
    assert.notEqual(resyncCall.requestId, initialRequestId);
    assert.equal(resyncCall.text, 'prueba');
    assert.deepEqual(resyncCall.options, {
      forward: true,
      findNext: true,
      matchCase: false,
    });
  } finally {
    restore();
  }
});

test('replace-current waits for matching search completion and authorized matching replace response', async () => {
  const {
    ipcMain,
    editorWin,
    findEvent,
    restore,
  } = await setupFindHarness();

  try {
    await ipcMain.invoke('editor-find-set-query', findEvent, 'prueba');
    const initialRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    editorWin.webContents.emit('found-in-page', {}, {
      requestId: initialRequestId,
      matches: 2,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });

    const replacePromise = ipcMain.invoke('editor-find-replace-current', findEvent, 'cambio');
    const resyncRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    assert.notEqual(resyncRequestId, initialRequestId);

    editorWin.webContents.emit('found-in-page', {}, {
      requestId: initialRequestId,
      matches: 2,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });
    await tick();
    assert.equal(editorWin.webContents.stopFindCalls.length, 0);

    editorWin.webContents.emit('found-in-page', {}, {
      requestId: resyncRequestId,
      matches: 2,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });
    await tick();

    assert.deepEqual(editorWin.webContents.stopFindCalls, ['keepSelection']);

    const replaceRequestMessage = getLastMessage(
      editorWin.webContents.sentMessages,
      'editor-replace-request'
    );
    assert.ok(replaceRequestMessage, 'expected editor replace request to be sent');

    ipcMain.emitChannel('editor-replace-response', { sender: {} }, {
      requestId: replaceRequestMessage.payload.requestId,
      ok: true,
      status: 'replaced',
      operation: 'replace-current',
      replacements: 1,
    });
    let settledState = await Promise.race([
      replacePromise.then(() => 'resolved'),
      tick().then(() => 'pending'),
    ]);
    assert.equal(settledState, 'pending');

    ipcMain.emitChannel('editor-replace-response', { sender: editorWin.webContents }, {
      requestId: replaceRequestMessage.payload.requestId + 99,
      ok: true,
      status: 'replaced',
      operation: 'replace-current',
      replacements: 1,
    });
    settledState = await Promise.race([
      replacePromise.then(() => 'resolved'),
      tick().then(() => 'pending'),
    ]);
    assert.equal(settledState, 'pending');

    ipcMain.emitChannel('editor-replace-response', { sender: editorWin.webContents }, {
      requestId: replaceRequestMessage.payload.requestId,
      ok: true,
      status: 'replaced',
      operation: 'replace-current',
      replacements: 1,
    });
    await tick();

    const refreshRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    assert.notEqual(refreshRequestId, resyncRequestId);

    editorWin.webContents.emit('found-in-page', {}, {
      requestId: refreshRequestId,
      matches: 1,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });

    const result = await replacePromise;
    assert.equal(result.status, 'replaced');
    assert.equal(result.replacements, 1);
  } finally {
    restore();
  }
});

test('replace-all waits for matching search completion and authorized matching replace response', async () => {
  const {
    ipcMain,
    editorWin,
    findEvent,
    restore,
  } = await setupFindHarness();

  try {
    await ipcMain.invoke('editor-find-set-query', findEvent, 'prueba');
    const initialRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    editorWin.webContents.emit('found-in-page', {}, {
      requestId: initialRequestId,
      matches: 3,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });

    ipcMain.emitChannel('editor-replace-status', { sender: editorWin.webContents }, {
      replaceAllAllowedByLength: true,
    });
    await tick();

    const replacePromise = ipcMain.invoke('editor-find-replace-all', findEvent, 'cambio');
    const resyncRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    assert.notEqual(resyncRequestId, initialRequestId);

    editorWin.webContents.emit('found-in-page', {}, {
      requestId: resyncRequestId,
      matches: 3,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });
    await tick();

    assert.deepEqual(editorWin.webContents.stopFindCalls, []);

    const replaceRequestMessage = getLastMessage(
      editorWin.webContents.sentMessages,
      'editor-replace-request'
    );
    assert.ok(replaceRequestMessage, 'expected editor replace-all request to be sent');
    assert.equal(replaceRequestMessage.payload.operation, 'replace-all');

    ipcMain.emitChannel('editor-replace-response', { sender: editorWin.webContents }, {
      requestId: replaceRequestMessage.payload.requestId,
      ok: true,
      status: 'replaced',
      operation: 'replace-all',
      replacements: 3,
    });
    await tick();

    const refreshRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    assert.notEqual(refreshRequestId, resyncRequestId);

    editorWin.webContents.emit('found-in-page', {}, {
      requestId: refreshRequestId,
      matches: 0,
      activeMatchOrdinal: 0,
      finalUpdate: true,
    });

    const result = await replacePromise;
    assert.equal(result.status, 'replaced');
    assert.equal(result.replacements, 3);
  } finally {
    restore();
  }
});

test('replace-current aborts when the editor window closes during pending resync', async () => {
  const {
    ipcMain,
    editorWin,
    findEvent,
    restore,
  } = await setupFindHarness();

  try {
    await ipcMain.invoke('editor-find-set-query', findEvent, 'prueba');
    const replacePromise = ipcMain.invoke('editor-find-replace-current', findEvent, 'cambio');

    editorWin.emit('close');

    const result = await replacePromise;
    assert.equal(result.ok, false);
    assert.equal(result.status, 'editor-window-closed');
  } finally {
    restore();
  }
});

test('authorized replace-all length status is relayed to the find window and unauthorized status is ignored', async () => {
  const {
    ipcMain,
    editorWin,
    findWin,
    restore,
  } = await setupFindHarness();

  try {
    ipcMain.emitChannel('editor-replace-status', { sender: {} }, {
      replaceAllAllowedByLength: true,
    });
    await tick();

    let lastStateMessage = getLastMessage(findWin.webContents.sentMessages, 'editor-find-state');
    assert.equal(
      !!(lastStateMessage && lastStateMessage.payload && lastStateMessage.payload.replaceAllAllowedByLength),
      false
    );

    ipcMain.emitChannel('editor-replace-status', { sender: editorWin.webContents }, {
      replaceAllAllowedByLength: true,
    });
    await tick();

    lastStateMessage = getLastMessage(findWin.webContents.sentMessages, 'editor-find-state');
    assert.equal(lastStateMessage.payload.replaceAllAllowedByLength, true);
  } finally {
    restore();
  }
});
