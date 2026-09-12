'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadLanguagePreload() {
  const invoked = [];
  const sent = [];
  let exposedApi = null;

  const ipcRenderer = {
    invoke(channel, payload) {
      invoked.push({ channel, payload });
      if (channel === 'get-current-language') return Promise.resolve('ar');
      if (channel === 'get-available-languages') {
        return Promise.resolve([{ tag: 'ar', label: 'العربية' }]);
      }
      return Promise.resolve({ ok: true });
    },
    send(channel, payload) {
      sent.push({ channel, payload });
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
    path.resolve(__dirname, '../../../electron/language_preload.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'electron/language_preload.js' });

  return { exposedApi, invoked, sent };
}

test('language preload exposes narrow reads for available and current languages', async () => {
  const { exposedApi, invoked } = loadLanguagePreload();

  assert.equal(exposedApi.name, 'languageAPI');
  const availableLanguages = await exposedApi.api.getAvailableLanguages();
  const currentLanguage = await exposedApi.api.getCurrentLanguage();

  assert.deepEqual(invoked, [
    { channel: 'get-available-languages', payload: undefined },
    { channel: 'get-current-language', payload: undefined },
  ]);
  assert.deepEqual(availableLanguages, [{ tag: 'ar', label: 'العربية' }]);
  assert.equal(currentLanguage, 'ar');
});

test('language preload normalizes and forwards a selected language', async () => {
  const { exposedApi, invoked, sent } = loadLanguagePreload();

  await exposedApi.api.setLanguage(' EN_us ');

  assert.deepEqual(invoked, [
    { channel: 'set-language', payload: 'en-us' },
  ]);
  assert.deepEqual(sent, [
    { channel: 'language-selected', payload: 'en-us' },
  ]);
});
