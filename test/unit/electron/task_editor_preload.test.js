'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadTaskEditorPreload() {
  const invoked = [];
  let exposedApi = null;

  const ipcRenderer = {
    invoke(channel, payload) {
      invoked.push({ channel, payload });
    },
    send() {},
    on() {},
    removeListener() {},
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
    setTimeout,
    clearTimeout,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../electron/task_editor_preload.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'electron/task_editor_preload.js' });

  return {
    exposedApi,
    invoked,
  };
}

test('task editor preload exposes selectTaskFiles through taskEditorAPI', () => {
  const { exposedApi, invoked } = loadTaskEditorPreload();

  exposedApi.api.selectTaskFiles();

  assert.deepEqual(invoked, [
    {
      channel: 'task-files-select',
      payload: undefined,
    },
  ]);
});

test('task editor preload exposes selectTaskFile through taskEditorAPI', () => {
  const { exposedApi, invoked } = loadTaskEditorPreload();

  exposedApi.api.selectTaskFile();

  assert.deepEqual(invoked, [
    {
      channel: 'task-file-select',
      payload: undefined,
    },
  ]);
});
