'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadNotify() {
  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          info() {},
          warn() {},
          warnOnce() {},
          error() {},
          errorOnce() {},
        };
      },
      RendererI18n: {
        msgRenderer(key) {
          return key;
        },
      },
    },
    document: {},
    alert() {},
    confirm() {
      return true;
    },
    setTimeout(handler) {
      if (typeof handler === 'function') {
        handler();
      }
      return 0;
    },
    clearTimeout() {},
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/notify.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/notify.js' });
  return sandbox.window.Notify;
}

test('notify registerCustomPrompt owns public prompt registration and rejects collisions', () => {
  const notify = loadNotify();
  const promptHandler = async () => null;

  notify.registerCustomPrompt('promptExample', promptHandler);

  assert.equal(notify.promptExample, promptHandler);
  assert.throws(
    () => notify.registerCustomPrompt('promptExample', async () => null),
    /duplicate name: promptExample/
  );
});

test('notify registerCustomPrompt validates prompt names and handlers', () => {
  const notify = loadNotify();

  assert.throws(
    () => notify.registerCustomPrompt('example', async () => null),
    /prompt\* method name/
  );
  assert.throws(
    () => notify.registerCustomPrompt('promptExample', null),
    /function handler/
  );
});
