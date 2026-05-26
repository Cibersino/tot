'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEditorPreload() {
  const subscriptions = [];
  const removed = [];
  const sent = [];
  let exposedApi = null;

  const ipcRenderer = {
    invoke() {},
    send(channel, payload) {
      sent.push({ channel, payload });
    },
    on(channel, listener) {
      subscriptions.push({ channel, listener });
    },
    removeListener(channel, listener) {
      removed.push({ channel, listener });
    },
  };

  const sandbox = {
    require(request) {
      if (request === 'electron') {
        return {
          contextBridge: {
            exposeInMainWorld(name, api) {
              exposedApi = { name, api };
            },
          },
          ipcRenderer,
        };
      }
      return require(request);
    },
    module: { exports: {} },
    exports: {},
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../electron/editor_preload.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'electron/editor_preload.js' });

  return {
    exposedApi,
    subscriptions,
    removed,
    sent,
  };
}

test('editor preload exposes the expected editor API surface', () => {
  const { exposedApi } = loadEditorPreload();

  assert.equal(exposedApi.name, 'editorAPI');
  assert.deepEqual(
    Object.keys(exposedApi.api).sort(),
    [
      'getAppConfig',
      'getCurrentText',
      'getSettings',
      'getWindowState',
      'onExternalUpdate',
      'onReadingTestPrestartStateChanged',
      'onReplaceRequest',
      'onSettingsChanged',
      'onWindowStateChanged',
      'reportBasePresentationState',
      'sendReplaceResponse',
      'setCurrentText',
      'setEditorFontSizePx',
      'setMaximizedTextWidthPx',
      'setSpellcheckEnabled',
    ]
  );
});

test('editor preload keeps editor-text-updated as an unsubscribe-based recurrent listener', () => {
  const { exposedApi, subscriptions, removed } = loadEditorPreload();
  let payloadSeen = null;

  const unsubscribe = exposedApi.api.onExternalUpdate((payload) => {
    payloadSeen = payload;
  });

  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].channel, 'editor-text-updated');

  subscriptions[0].listener(null, { text: 'live update' });
  assert.deepEqual(payloadSeen, { text: 'live update' });

  unsubscribe();
  assert.equal(removed.length, 1);
  assert.equal(removed[0].channel, 'editor-text-updated');
  assert.equal(removed[0].listener, subscriptions[0].listener);
});

test('editor preload reports base presentation state through the main bridge', () => {
  const { exposedApi, sent } = loadEditorPreload();

  exposedApi.api.reportBasePresentationState({
    generation: 7,
    status: 'ready',
  });

  assert.deepEqual(sent, [
    {
      channel: 'editor-report-base-presentation-state',
      payload: {
        generation: 7,
        status: 'ready',
      },
    },
  ]);
});
