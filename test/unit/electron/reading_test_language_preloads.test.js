'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPreload(relativePath, apiName) {
  const listeners = new Map();
  let exposedApi = null;
  const ipcRenderer = {
    invoke() {},
    on(channel, listener) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(listener);
    },
    removeListener(channel, listener) {
      const channelListeners = listeners.get(channel);
      if (channelListeners) channelListeners.delete(listener);
    },
  };
  const sandbox = {
    console: { error() {} },
    require(request) {
      if (request === 'electron') {
        return {
          contextBridge: {
            exposeInMainWorld(name, api) {
              assert.equal(name, apiName);
              exposedApi = api;
            },
          },
          ipcRenderer,
        };
      }
      throw new Error(`Unexpected preload dependency: ${request}`);
    },
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.resolve(__dirname, '../../../', relativePath), 'utf8');
  vm.runInContext(source, sandbox, { filename: relativePath });
  return {
    api: exposedApi,
    emit(channel, payload) {
      const channelListeners = listeners.get(channel) || new Set();
      for (const listener of channelListeners) listener({}, payload);
    },
  };
}

for (const [relativePath, apiName] of [
  ['electron/reading_test_questions_preload.js', 'readingTestQuestionsAPI'],
  ['electron/reading_test_result_preload.js', 'readingTestResultAPI'],
]) {
  test(`${apiName} forwards settings-updated as a removable recurrent listener`, () => {
    const harness = loadPreload(relativePath, apiName);
    const received = [];
    const unsubscribe = harness.api.onSettingsChanged((settings) => received.push(settings));

    harness.emit('settings-updated', { language: 'en', modeConteo: 'preciso' });
    assert.deepEqual(received, [{ language: 'en', modeConteo: 'preciso' }]);

    unsubscribe();
    harness.emit('settings-updated', { language: 'es' });
    assert.deepEqual(received, [{ language: 'en', modeConteo: 'preciso' }]);
  });
}
