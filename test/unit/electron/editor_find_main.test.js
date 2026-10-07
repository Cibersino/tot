'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
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
    this.focusCount = 0;
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

  focus() {
    this.focusCount += 1;
  }

  close() {
    if (this._destroyed) return;
    this.emit('close');
    this._destroyed = true;
    this.emit('closed');
  }
}

class FakeFindWindow extends MockWindow {
  constructor() {
    super();
    FakeFindWindow.instances.push(this);
  }

  static reset({ initialLoadError = null, holdInitialLoad = false } = {}) {
    FakeFindWindow.instances = [];
    FakeFindWindow.initialLoadError = initialLoadError;
    FakeFindWindow.holdInitialLoad = holdInitialLoad;
  }

  setMenu() {}

  setMenuBarVisibility() {}

  loadFile() {
    this.webContents._loading = true;
    if (FakeFindWindow.initialLoadError) {
      return Promise.reject(FakeFindWindow.initialLoadError);
    }
    if (FakeFindWindow.holdInitialLoad) {
      return new Promise((resolve, reject) => {
        this.resolveInitialDocumentLoad = resolve;
        this.rejectInitialDocumentLoad = reject;
      });
    }
    return new Promise((resolve) => {
      setImmediate(() => {
        this.emit('ready-to-show');
        this.webContents.emit('did-finish-load');
        this.webContents._loading = false;
        resolve();
      });
    });
  }

  show() {}

  focus() {
    this.emit('focus');
  }
}

FakeFindWindow.instances = [];
FakeFindWindow.initialLoadError = null;
FakeFindWindow.holdInitialLoad = false;

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

function loadEditorFindMainWithMocks(options = {}) {
  FakeFindWindow.reset(options);
  const restoreElectronModule = installElectronModuleMock({
    BrowserWindow: FakeFindWindow,
    screen: {
      getDisplayNearestPoint() {
        return {
          workArea: { x: 0, y: 0, width: 1600, height: 900 },
        };
      },
    },
  });

  const modulePath = require.resolve('../../../electron/editor_find_main');
  delete require.cache[modulePath];
  const editorFindMain = require(modulePath);

  function restore() {
    delete require.cache[modulePath];
    restoreElectronModule();
  }

  return { editorFindMain, restore };
}

async function setupFindHarness() {
  const { editorFindMain, restore } = loadEditorFindMainWithMocks();
  const ipcMain = createIpcMainMock();
  const editorWin = new MockWindow();

  editorFindMain.registerIpc(ipcMain);
  editorFindMain.attachEditorWindow(editorWin, { shortcutActions: {} });

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

test('initial Find document failure discloses and closes the failed child', async () => {
  const initialLoadError = new Error('Find document unavailable');
  const { editorFindMain, restore } = loadEditorFindMainWithMocks({ initialLoadError });
  const editorWin = new MockWindow();
  const disclosedWindows = [];

  try {
    editorFindMain.attachEditorWindow(editorWin, {
      shortcutActions: {},
      showInitialDocumentFailureDisclosure(findWindow) {
        disclosedWindows.push(findWindow);
      },
    });

    editorWin.webContents.emit('before-input-event', { preventDefault() {} }, {
      type: 'keyDown',
      control: true,
      meta: false,
      alt: false,
      key: 'h',
      code: 'KeyH',
    });

    const [failedFindWindow] = FakeFindWindow.instances;
    assert.ok(failedFindWindow, 'expected Find window creation');

    await tick();
    await tick();

    assert.deepEqual(disclosedWindows, [failedFindWindow]);
    assert.equal(failedFindWindow.isDestroyed(), true);
    assert.equal(editorFindMain.getFindWindow(), null);
    assert.deepEqual(editorWin.webContents.stopFindCalls, ['clearSelection']);
    assert.equal(editorWin.focusCount, 1);
  } finally {
    restore();
  }
});

test('coordinated Find closure suppresses initial document failure disclosure', async () => {
  const { editorFindMain, restore } = loadEditorFindMainWithMocks({ holdInitialLoad: true });
  const editorWin = new MockWindow();
  const disclosedWindows = [];

  try {
    editorFindMain.attachEditorWindow(editorWin, {
      shortcutActions: {},
      showInitialDocumentFailureDisclosure(findWindow) {
        disclosedWindows.push(findWindow);
      },
    });

    editorWin.webContents.emit('before-input-event', { preventDefault() {} }, {
      type: 'keyDown',
      control: true,
      meta: false,
      alt: false,
      key: 'h',
      code: 'KeyH',
    });

    const findWin = editorFindMain.getFindWindow();
    assert.ok(findWin, 'expected Find window creation');
    assert.equal(typeof findWin.rejectInitialDocumentLoad, 'function');

    editorWin.emit('close');
    findWin.rejectInitialDocumentLoad(new Error('Load aborted by close'));
    await tick();

    assert.deepEqual(disclosedWindows, []);
    assert.equal(findWin.isDestroyed(), true);
    assert.equal(editorFindMain.getFindWindow(), null);
  } finally {
    restore();
  }
});

test('Find direct post-load delivery sends state before the opening focus target', async () => {
  const { findWin, restore } = await setupFindHarness();

  try {
    const findMessages = findWin.webContents.sentMessages.filter(({ channel }) => (
      channel === 'editor-find-init' ||
      channel === 'editor-find-state' ||
      channel === 'editor-find-focus-target'
    ));

    assert.deepEqual(
      findMessages.map(({ channel }) => channel),
      [
        'editor-find-init',
        'editor-find-state',
        'editor-find-focus-target',
      ]
    );
    assert.deepEqual(findMessages[2].payload, {
      target: 'query',
      selectAll: true,
    });
  } finally {
    restore();
  }
});

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

test('find-window Escape is left for renderer-owned window closure', async () => {
  const { editorFindMain, findWin, restore } = await setupFindHarness();

  try {
    let prevented = false;
    findWin.webContents.emit('before-input-event', {
      preventDefault() { prevented = true; },
    }, {
      type: 'keyDown',
      control: false,
      meta: false,
      alt: false,
      key: 'Escape',
      code: 'Escape',
    });

    assert.equal(prevented, false);
    assert.equal(findWin.isDestroyed(), false);
    assert.equal(editorFindMain.getFindWindow(), findWin);
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

    editorWin.webContents.emit('found-in-page', {}, {
      requestId: resyncRequestId,
      matches: 2,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });
    await tick();

    const replaceRequestMessage = getLastMessage(
      editorWin.webContents.sentMessages,
      'editor-replace-request'
    );
    assert.ok(replaceRequestMessage, 'expected editor replace request to be sent');
    assert.equal(replaceRequestMessage.payload.activeMatchOrdinal, 1);
    assert.deepEqual(editorWin.webContents.stopFindCalls, []);

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

test('replace-current preserves the active match ordinal across resync before requesting the replace', async () => {
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
      activeMatchOrdinal: 2,
      finalUpdate: true,
    });

    const replacePromise = ipcMain.invoke('editor-find-replace-current', findEvent, 'cambio');
    const resyncRequestId = editorWin.webContents.findCalls.at(-1).requestId;

    editorWin.webContents.emit('found-in-page', {}, {
      requestId: resyncRequestId,
      matches: 3,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });
    await tick();

    const restoreOrdinalRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    assert.notEqual(restoreOrdinalRequestId, resyncRequestId);
    assert.deepEqual(editorWin.webContents.findCalls.at(-1).options, {
      forward: true,
      findNext: false,
      matchCase: false,
    });

    editorWin.webContents.emit('found-in-page', {}, {
      requestId: restoreOrdinalRequestId,
      matches: 3,
      activeMatchOrdinal: 2,
      finalUpdate: true,
    });
    await tick();

    const replaceRequestMessage = getLastMessage(
      editorWin.webContents.sentMessages,
      'editor-replace-request'
    );
    assert.ok(replaceRequestMessage, 'expected editor replace request to be sent');
    assert.equal(replaceRequestMessage.payload.activeMatchOrdinal, 2);

    ipcMain.emitChannel('editor-replace-response', { sender: editorWin.webContents }, {
      requestId: replaceRequestMessage.payload.requestId,
      ok: true,
      status: 'replaced',
      operation: 'replace-current',
      replacements: 1,
    });
    await tick();

    const refreshRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    editorWin.webContents.emit('found-in-page', {}, {
      requestId: refreshRequestId,
      matches: 2,
      activeMatchOrdinal: 1,
      finalUpdate: true,
    });
    await tick();

    const refreshOrdinalRequestId = editorWin.webContents.findCalls.at(-1).requestId;
    assert.notEqual(refreshOrdinalRequestId, refreshRequestId);
    assert.deepEqual(editorWin.webContents.findCalls.at(-1).options, {
      forward: true,
      findNext: false,
      matchCase: false,
    });

    editorWin.webContents.emit('found-in-page', {}, {
      requestId: refreshOrdinalRequestId,
      matches: 2,
      activeMatchOrdinal: 2,
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
