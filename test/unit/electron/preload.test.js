'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMainPreload() {
  const subscriptions = [];
  const removed = [];
  let exposedApi = null;

  const ipcRenderer = {
    invoke() {},
    send() {},
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
