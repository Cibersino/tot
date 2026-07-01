'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadTextTimeCalculatorPreload() {
  const subscriptions = [];
  const removed = [];
  const invoked = [];
  let exposedApi = null;

  const ipcRenderer = {
    invoke(channel, payload) {
      invoked.push({ channel, payload });
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
    path.resolve(__dirname, '../../../electron/text_time_calculator_preload.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'electron/text_time_calculator_preload.js' });

  return {
    exposedApi,
    invoked,
    removed,
    subscriptions,
  };
}

test('text time calculator preload exposes getSettings through textTimeCalculatorAPI', () => {
  const { exposedApi, invoked } = loadTextTimeCalculatorPreload();

  exposedApi.api.getSettings();

  assert.deepEqual(invoked, [
    {
      channel: 'get-settings',
      payload: undefined,
    },
  ]);
});

test('text time calculator preload exposes settings-updated listener with unsubscribe', () => {
  const { exposedApi, subscriptions, removed } = loadTextTimeCalculatorPreload();
  let payloadSeen = null;

  const unsubscribe = exposedApi.api.onSettingsChanged((payload) => {
    payloadSeen = payload;
  });

  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].channel, 'settings-updated');

  subscriptions[0].listener(null, { language: 'en' });
  assert.deepEqual(payloadSeen, { language: 'en' });

  unsubscribe();
  assert.equal(removed.length, 1);
  assert.equal(removed[0].channel, 'settings-updated');
  assert.equal(removed[0].listener, subscriptions[0].listener);
});
