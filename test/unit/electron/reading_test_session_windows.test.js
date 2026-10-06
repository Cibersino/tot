'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');

function loadFreshReadingTestSessionWindows(t, electronOverrides = null) {
  const modulePath = path.resolve(__dirname, '../../../electron/reading_test_session_windows.js');
  t.after(installElectronModuleMock(electronOverrides));
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createModalWindowDouble() {
  const win = createWindowDouble({ visible: false, loading: false });
  const persistentListeners = new Map();
  const sent = [];
  win.setMenu = () => {};
  win.show = () => {
    win.visible = true;
  };
  win.loadFile = async () => {};
  win.on = (event, listener) => {
    persistentListeners.set(event, listener);
  };
  win.emit = (event) => {
    const onceListener = win.listeners.get(event);
    if (onceListener) onceListener();
    const persistentListener = persistentListeners.get(event);
    if (persistentListener) persistentListener();
  };
  win.webContents.send = (channel, payload) => {
    sent.push({ channel, payload });
  };
  win.getSent = () => sent.slice();
  return win;
}

function createWindowDouble({ visible = true, loading = false } = {}) {
  return {
    destroyed: false,
    visible,
    listeners: new Map(),
    isDestroyed() {
      return this.destroyed;
    },
    isVisible() {
      return this.visible;
    },
    once(event, listener) {
      this.listeners.set(event, listener);
    },
    removeListener(event, listener) {
      if (this.listeners.get(event) === listener) {
        this.listeners.delete(event);
      }
    },
    webContents: {
      destroyed: false,
      loading,
      isDestroyed() {
        return this.destroyed;
      },
      isLoadingMainFrame() {
        return this.loading;
      },
      isLoading() {
        return this.loading;
      },
      once() {},
      removeListener() {},
    },
  };
}

test('waitForWindowRendererLoad warns when it uses the broad loading fallback', async (t) => {
  const readingTestSessionWindows = loadFreshReadingTestSessionWindows(t);
  const win = createWindowDouble({ loading: false });
  const warnings = [];
  let isLoadingCalls = 0;
  delete win.webContents.isLoadingMainFrame;
  win.webContents.isLoading = () => {
    isLoadingCalls += 1;
    return false;
  };

  await readingTestSessionWindows.waitForWindowRendererLoad(win, 'EDITOR', {
    warn(...args) {
      warnings.push(args);
    },
  }, 5000);

  assert.equal(isLoadingCalls, 1);
  assert.deepEqual(warnings, [[
    'Reading-test renderer load: isLoadingMainFrame unavailable; using isLoading() fallback.',
  ]]);
});

test('openReadingSessionWindows starts a hidden maximized editor bootstrap and waits for base readiness', async (t) => {
  const readingTestSessionWindows = loadFreshReadingTestSessionWindows(t);
  const calls = [];
  const editorWin = createWindowDouble({ visible: false, loading: false });
  const flotanteWin = createWindowDouble({ visible: true, loading: false });
  let resolveBaseReady;
  let settled = false;

  const promise = readingTestSessionWindows.openReadingSessionWindows({
    resetCrono() {
      calls.push('resetCrono');
    },
    ensureEditorWindow(options) {
      calls.push(['ensureEditorWindow', options]);
      return {
        ok: true,
        editorWin,
        baseReadyPromise: new Promise((resolve) => {
          resolveBaseReady = resolve;
        }),
      };
    },
    ensureFlotanteWindow: async () => {
      calls.push('ensureFlotanteWindow');
      return flotanteWin;
    },
    log: {
      warn() {},
    },
    timeoutMs: 5000,
  });

  promise.then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(calls, [
    'resetCrono',
    [
      'ensureEditorWindow',
      {
        deferShow: true,
        waitForBasePresentationReady: true,
        startupOwner: 'reading-test',
        initialPresentationMode: 'maximized',
      },
    ],
    'ensureFlotanteWindow',
  ]);

  resolveBaseReady({ generation: 1 });
  const result = await promise;

  assert.equal(result.editorWin, editorWin);
  assert.equal(result.flotanteWin, flotanteWin);
});

test('openReadingSessionWindows retains a pre-existing lifecycle failure over its disposed Editor waiter', async (t) => {
  const readingTestSessionWindows = loadFreshReadingTestSessionWindows(t);
  const editorWin = createWindowDouble({ visible: false, loading: true });
  const flotanteWin = createWindowDouble({ visible: true, loading: false });
  const lifecycleError = Object.assign(new Error('EDITOR_INITIAL_DOCUMENT_LOAD_FAILED'), {
    code: 'EDITOR_INITIAL_DOCUMENT_LOAD_FAILED',
    editorStartupLifecycle: {
      cause: 'EDITOR_INITIAL_DOCUMENT_LOAD_FAILED',
      disclosure: 'main-native',
    },
  });
  let rejectBaseReady;
  let resolveFlotanteWindow;
  const baseReadyPromise = new Promise((_resolve, reject) => {
    rejectBaseReady = reject;
  });
  // The production lifecycle attaches its own disclosure observer immediately.
  baseReadyPromise.catch(() => {});

  const openPromise = readingTestSessionWindows.openReadingSessionWindows({
    resetCrono() {},
    ensureEditorWindow() {
      return {
        ok: true,
        editorWin,
        baseReadyPromise,
      };
    },
    ensureFlotanteWindow() {
      return new Promise((resolve) => {
        resolveFlotanteWindow = resolve;
      });
    },
    log: {
      warn() {},
    },
    timeoutMs: 5000,
  });

  await Promise.resolve();
  rejectBaseReady(lifecycleError);
  editorWin.destroyed = true;
  editorWin.webContents.destroyed = true;
  resolveFlotanteWindow(flotanteWin);

  await assert.rejects(openPromise, (err) => {
    assert.equal(err, lifecycleError);
    return true;
  });
});

test('openReadingSessionWindows retains a lifecycle failure when its disposal rejects an active Editor waiter', async (t) => {
  const readingTestSessionWindows = loadFreshReadingTestSessionWindows(t);
  const editorWin = createWindowDouble({ visible: false, loading: true });
  const flotanteWin = createWindowDouble({ visible: true, loading: false });
  const rendererLoadListeners = new Map();
  const lifecycleError = Object.assign(new Error('EDITOR_INITIAL_DOCUMENT_LOAD_FAILED'), {
    code: 'EDITOR_INITIAL_DOCUMENT_LOAD_FAILED',
    editorStartupLifecycle: {
      cause: 'EDITOR_INITIAL_DOCUMENT_LOAD_FAILED',
      disclosure: 'main-native',
    },
  });
  let rejectBaseReady;
  let resolveFlotanteWindow;
  const baseReadyPromise = new Promise((_resolve, reject) => {
    rejectBaseReady = reject;
  });
  baseReadyPromise.catch(() => {});
  editorWin.webContents.once = (event, listener) => {
    rendererLoadListeners.set(event, listener);
  };
  editorWin.webContents.removeListener = (event, listener) => {
    if (rendererLoadListeners.get(event) === listener) {
      rendererLoadListeners.delete(event);
    }
  };

  const openPromise = readingTestSessionWindows.openReadingSessionWindows({
    resetCrono() {},
    ensureEditorWindow() {
      return {
        ok: true,
        editorWin,
        baseReadyPromise,
      };
    },
    ensureFlotanteWindow() {
      return new Promise((resolve) => {
        resolveFlotanteWindow = resolve;
      });
    },
    log: {
      warn() {},
    },
    timeoutMs: 5000,
  });

  await Promise.resolve();
  resolveFlotanteWindow(flotanteWin);
  await Promise.resolve();
  assert.equal(typeof rendererLoadListeners.get('destroyed'), 'function');

  rejectBaseReady(lifecycleError);
  rendererLoadListeners.get('destroyed')();

  await assert.rejects(openPromise, (err) => {
    assert.equal(err, lifecycleError);
    return true;
  });
});

test('question and result modal windows register while live and deregister on close', async (t) => {
  const questionsWin = createModalWindowDouble();
  const resultWin = createModalWindowDouble();
  const windows = [questionsWin, resultWin];
  const readingTestSessionWindows = loadFreshReadingTestSessionWindows(t, {
    BrowserWindow: function BrowserWindowDouble() {
      return windows.shift();
    },
  });
  const mainWin = createWindowDouble({ visible: true, loading: false });
  const lifecycle = [];
  const commonOptions = {
    resolveMainWindow: () => mainWin,
    log: { warn() {} },
    onWindowCreated(win) {
      lifecycle.push(['created', win]);
    },
    onWindowClosed(win) {
      lifecycle.push(['closed', win]);
    },
  };

  const questionsPromise = readingTestSessionWindows.openQuestionsWindow([{ id: 'q1' }], {
    ...commonOptions,
    questionsWindowPreload: 'questions-preload.js',
    questionsWindowHtml: 'questions.html',
    developerEmail: 'support@example.test',
  });
  assert.deepEqual(lifecycle, [['created', questionsWin]]);
  questionsWin.emit('ready-to-show');
  assert.equal(questionsWin.isVisible(), true);
  assert.equal(questionsWin.getSent()[0].channel, 'reading-test-questions-init');
  questionsWin.emit('closed');
  assert.deepEqual(await questionsPromise, { ok: true });

  const resultPromise = readingTestSessionWindows.openResultWindow({ measuredWpm: 250 }, {
    ...commonOptions,
    resultWindowPreload: 'result-preload.js',
    resultWindowHtml: 'result.html',
  });
  assert.deepEqual(lifecycle, [
    ['created', questionsWin],
    ['closed', questionsWin],
    ['created', resultWin],
  ]);
  resultWin.emit('ready-to-show');
  assert.equal(resultWin.isVisible(), true);
  assert.equal(resultWin.getSent()[0].channel, 'reading-test-result-init');
  resultWin.emit('closed');
  assert.deepEqual(await resultPromise, { ok: true });
  assert.deepEqual(lifecycle, [
    ['created', questionsWin],
    ['closed', questionsWin],
    ['created', resultWin],
    ['closed', resultWin],
  ]);
});

test('question and result modal windows ignore and diagnose throwing optional lifecycle observers', async (t) => {
  const questionsWin = createModalWindowDouble();
  const resultWin = createModalWindowDouble();
  const windows = [questionsWin, resultWin];
  const readingTestSessionWindows = loadFreshReadingTestSessionWindows(t, {
    BrowserWindow: function BrowserWindowDouble() {
      return windows.shift();
    },
  });
  const mainWin = createWindowDouble({ visible: true, loading: false });
  const warnings = [];
  const commonOptions = {
    resolveMainWindow: () => mainWin,
    log: { warn(...args) { warnings.push(args); } },
    onWindowCreated() {
      throw new Error('created observer failed');
    },
    onWindowClosed() {
      throw new Error('closed observer failed');
    },
  };

  const questionsPromise = readingTestSessionWindows.openQuestionsWindow([{ id: 'q1' }], {
    ...commonOptions,
    questionsWindowPreload: 'questions-preload.js',
    questionsWindowHtml: 'questions.html',
    developerEmail: 'support@example.test',
  });
  questionsWin.emit('ready-to-show');
  questionsWin.emit('closed');
  assert.deepEqual(await questionsPromise, { ok: true });
  assert.equal(questionsWin.isVisible(), true);
  assert.equal(questionsWin.getSent()[0].channel, 'reading-test-questions-init');

  const resultPromise = readingTestSessionWindows.openResultWindow({ measuredWpm: 250 }, {
    ...commonOptions,
    resultWindowPreload: 'result-preload.js',
    resultWindowHtml: 'result.html',
  });
  resultWin.emit('ready-to-show');
  resultWin.emit('closed');
  assert.deepEqual(await resultPromise, { ok: true });
  assert.equal(resultWin.isVisible(), true);
  assert.equal(resultWin.getSent()[0].channel, 'reading-test-result-init');
  assert.deepEqual(
    warnings.map(([message]) => message),
    [
      'Reading-test questions window registration failed (ignored):',
      'Reading-test questions window close registration failed (ignored):',
      'Reading-test result window registration failed (ignored):',
      'Reading-test result window close registration failed (ignored):',
    ]
  );
});
