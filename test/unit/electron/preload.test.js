'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMainPreload() {
  const subscriptions = [];
  const removed = [];
  const invoked = [];
  const sent = [];
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
          webUtils: {
            getPathForFile() {
              return '';
            },
          },
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
    path.resolve(__dirname, '../../../electron/preload.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'electron/preload.js' });

  return {
    exposedApi,
    invoked,
    sent,
    subscriptions,
    removed,
  };
}

test('main preload exposes editor first-show listener and removes the old editor-ready listener surface', () => {
  const { exposedApi } = loadMainPreload();

  assert.equal(typeof exposedApi.api.onEditorFirstShowState, 'function');
  assert.equal(Object.prototype.hasOwnProperty.call(exposedApi.api, 'onEditorReady'), false);
});

test('main preload keeps editor-first-show-state as an unsubscribe-based listener', () => {
  const { exposedApi, subscriptions, removed } = loadMainPreload();
  let payloadSeen = null;

  const unsubscribe = exposedApi.api.onEditorFirstShowState((payload) => {
    payloadSeen = payload;
  });

  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].channel, 'editor-first-show-state');

  subscriptions[0].listener(null, { generation: 4, state: 'ready' });
  assert.deepEqual(payloadSeen, { generation: 4, state: 'ready' });

  unsubscribe();
  assert.equal(removed.length, 1);
  assert.equal(removed[0].channel, 'editor-first-show-state');
  assert.equal(removed[0].listener, subscriptions[0].listener);
});

test('main preload forwards preset reconciliation payloads and supports unsubscribe', () => {
  const { exposedApi, subscriptions, removed } = loadMainPreload();
  const payload = {
    preset: { name: 'Quick', wpm: 300 },
    preferenceScopeId: 'en',
    settingsSnapshot: { language: 'en', presetsByScope: { en: [{ name: 'Quick', wpm: 300 }] } },
  };
  let received;
  const unsubscribe = exposedApi.api.onPresetCreated((value) => { received = value; });
  const subscription = subscriptions.at(-1);
  assert.equal(subscription.channel, 'preset-created');
  subscription.listener(null, payload);
  assert.equal(received, payload);
  unsubscribe();
  assert.equal(removed.at(-1).listener, subscription.listener);
});

test('main preload forwards setCurrentText canonical payloads unchanged', () => {
  const { exposedApi, invoked } = loadMainPreload();
  const payload = {
    text: 'xyz',
    meta: { source: 'main-window', action: 'overwrite' },
  };

  exposedApi.api.setCurrentText(payload);

  assert.deepEqual(invoked, [
    {
      channel: 'set-current-text',
      payload,
    },
  ]);
});

test('main preload forwards preview Spoiler preference updates unchanged', () => {
  const { exposedApi, invoked } = loadMainPreload();

  exposedApi.api.setPreviewSpoilerEnabled(false);

  assert.deepEqual(invoked, [
    {
      channel: 'set-preview-spoiler-enabled',
      payload: false,
    },
  ]);
});

test('main preload reports required renderer startup failures through the dedicated startup channel', () => {
  const { exposedApi, sent } = loadMainPreload();
  const payload = { kind: 'renderer-core-ready' };

  exposedApi.api.reportRendererStartupFailure(payload);

  assert.deepEqual(sent, [{
    channel: 'startup:renderer-failed',
    payload,
  }]);
});

test('main preload forwards Precise-counting failures and exposes an unsubscribe listener for the fallback notice', () => {
  const { exposedApi, invoked, subscriptions, removed } = loadMainPreload();
  const payload = {
    code: 'PRECISE_SEGMENTER_UNAVAILABLE',
    stage: 'availability',
  };
  let notices = 0;

  exposedApi.api.reportPreciseCountingFailure(payload);
  const unsubscribe = exposedApi.api.onPreciseCountingFallback(() => {
    notices += 1;
  });

  assert.deepEqual(invoked, [{ channel: 'precise-counting-failed', payload }]);
  assert.equal(subscriptions.at(-1).channel, 'precise-counting-fallback');
  subscriptions.at(-1).listener({}, { persistenceFailed: true });
  assert.equal(notices, 1);

  unsubscribe();
  assert.equal(removed.at(-1).channel, 'precise-counting-fallback');
});

test('main preload exposes an unsubscribe listener for spellcheck availability failures', () => {
  const { exposedApi, subscriptions, removed } = loadMainPreload();
  let notices = 0;

  const unsubscribe = exposedApi.api.onSpellcheckAvailabilityFailed(() => {
    notices += 1;
  });

  assert.equal(subscriptions.at(-1).channel, 'spellcheck-availability-failed');
  subscriptions.at(-1).listener();
  assert.equal(notices, 1);

  unsubscribe();
  assert.equal(removed.at(-1).channel, 'spellcheck-availability-failed');
});

test('main preload exposes openTextTimeCalculator through electronAPI', () => {
  const { exposedApi, invoked } = loadMainPreload();

  exposedApi.api.openTextTimeCalculator();

  assert.deepEqual(invoked, [
    {
      channel: 'text-time-calculator-open',
      payload: undefined,
    },
  ]);
});
