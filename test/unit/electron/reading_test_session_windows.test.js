'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');

function loadFreshReadingTestSessionWindows(t) {
  const modulePath = path.resolve(__dirname, '../../../electron/reading_test_session_windows.js');
  t.after(installElectronModuleMock());
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
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
