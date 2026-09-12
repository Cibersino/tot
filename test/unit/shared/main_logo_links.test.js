'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id) {
  const listeners = new Map();

  return {
    id,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type) {
      const listener = listeners.get(type);
      if (listener) listener();
    },
    setAttribute() {},
  };
}

function loadMainLogoLinksHarness() {
  const controls = new Map([
    ['devLogoLink', createElement('devLogoLink')],
    ['kofiLogoLink', createElement('kofiLogoLink')],
  ]);
  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          error() {},
          warn() {},
          warnOnce() {},
        };
      },
    },
    document: {
      getElementById(id) {
        return controls.get(id) || null;
      },
    },
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/main_logo_links.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/main_logo_links.js' });

  return {
    api: sandbox.window.MainLogoLinks,
    controls,
  };
}

test('main logo links open their normal external URLs while action admission is allowed', async () => {
  const harness = loadMainLogoLinksHarness();
  const openedUrls = [];

  harness.api.bindBrandLinks({
    electronAPI: {
      openExternalUrl(url) {
        openedUrls.push(url);
        return Promise.resolve({ ok: true });
      },
    },
    canAcceptBrandLinkAction() {
      return true;
    },
  });

  harness.controls.get('devLogoLink').dispatch('click');
  harness.controls.get('kofiLogoLink').dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(openedUrls, [
    'https://totapp.org/',
    'https://ko-fi.com/cibersino/',
  ]);
});

test('main logo links do not admit new external actions after terminal i18n failure', () => {
  const harness = loadMainLogoLinksHarness();
  const openedUrls = [];

  harness.api.bindBrandLinks({
    electronAPI: {
      openExternalUrl(url) {
        openedUrls.push(url);
        return Promise.resolve({ ok: true });
      },
    },
    canAcceptBrandLinkAction() {
      return false;
    },
  });

  harness.controls.get('devLogoLink').dispatch('click');
  harness.controls.get('kofiLogoLink').dispatch('click');

  assert.deepEqual(openedUrls, []);
});
