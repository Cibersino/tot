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
  const invoked = [];
  let exposedApi = null;

  const ipcRenderer = {
    invoke(channel, payload) {
      invoked.push({ channel, payload });
    },
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
    invoked,
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
      'getEditorState',
      'getInitialCurrentTextSnapshot',
      'getSettings',
      'onEditorFontSizePersistenceFailed',
      'onEditorStateChanged',
      'onExternalUpdate',
      'onReadingTestPrestartStateChanged',
      'onReplaceRequest',
      'onSettingsChanged',
      'reportBasePresentationState',
      'reportRendererI18nFailure',
      'sendReplaceResponse',
      'setCurrentText',
      'setEditorFontSizePx',
      'setMaximizedTextWidthPx',
      'setSpellcheckEnabled',
    ]
  );
});

test('editor preload requests the versioned initial current-text snapshot', () => {
  const { exposedApi, invoked } = loadEditorPreload();

  exposedApi.api.getInitialCurrentTextSnapshot();

  assert.deepEqual(invoked, [
    { channel: 'get-editor-current-text-snapshot', payload: undefined },
  ]);
});

test('editor preload uses the editor-state IPC owner for editor preferences', () => {
  const { exposedApi, invoked } = loadEditorPreload();

  exposedApi.api.getEditorState();
  exposedApi.api.setSpellcheckEnabled(false);
  exposedApi.api.setEditorFontSizePx(24);
  exposedApi.api.setMaximizedTextWidthPx(880);

  assert.deepEqual(invoked, [
    { channel: 'get-editor-state', payload: undefined },
    { channel: 'set-editor-spellcheck-enabled', payload: false },
    { channel: 'set-editor-font-size-px', payload: 24 },
    { channel: 'set-editor-maximized-text-width-px', payload: 880 },
  ]);
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

test('editor preload keeps editor-state-changed as an unsubscribe-based recurrent listener', () => {
  const { exposedApi, subscriptions, removed } = loadEditorPreload();
  let stateSeen = null;

  const unsubscribe = exposedApi.api.onEditorStateChanged((payload) => {
    stateSeen = payload;
  });

  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].channel, 'editor-state-changed');

  const state = { maximized: true, spellcheckEnabled: false, editorFontSizePx: 24 };
  subscriptions[0].listener(null, state);
  assert.deepEqual(stateSeen, state);

  unsubscribe();
  assert.equal(removed.length, 1);
  assert.equal(removed[0].channel, 'editor-state-changed');
  assert.equal(removed[0].listener, subscriptions[0].listener);
});

test('editor preload keeps the shortcut font-size failure notice payload-free and unsubscribe-based', () => {
  const { exposedApi, subscriptions, removed } = loadEditorPreload();
  let calls = 0;

  const unsubscribe = exposedApi.api.onEditorFontSizePersistenceFailed(() => {
    calls += 1;
  });

  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].channel, 'editor-font-size-persistence-failed');

  subscriptions[0].listener(null);
  assert.equal(calls, 1);

  unsubscribe();
  assert.equal(removed.length, 1);
  assert.equal(removed[0].channel, 'editor-font-size-persistence-failed');
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

test('editor preload reports terminal renderer i18n failure through the main bridge', () => {
  const { exposedApi, sent } = loadEditorPreload();

  exposedApi.api.reportRendererI18nFailure({ kind: 'startup' });

  assert.deepEqual(sent, [
    {
      channel: 'renderer-i18n-failed',
      payload: { kind: 'startup' },
    },
  ]);
});

test('editor preload forwards setCurrentText canonical payloads unchanged', () => {
  const { exposedApi, invoked } = loadEditorPreload();
  const payload = {
    text: 'abc',
    meta: { source: 'editor', action: 'typing' },
  };

  exposedApi.api.setCurrentText(payload);

  assert.deepEqual(invoked, [
    {
      channel: 'set-current-text',
      payload,
    },
  ]);
});
