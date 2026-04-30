'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createElement(id) {
  return {
    id,
    value: '',
    disabled: false,
    hidden: false,
    textContent: '',
    title: '',
    placeholder: '',
    maxLength: 0,
    attributes: {},
    listeners: {},
    focusCount: 0,
    selectCount: 0,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    focus() {
      this.focusCount += 1;
    },
    select() {
      this.selectCount += 1;
    },
  };
}

function createHarness({
  replaceCurrentResult = { ok: true, status: 'replaced' },
  replaceAllResult = { ok: true, status: 'replaced' },
} = {}) {
  const notifyCalls = [];
  const replaceCurrentCalls = [];
  const replaceAllCalls = [];
  const subscriptions = {};

  const elements = {
    findWrap: createElement('findWrap'),
    findToggle: createElement('findToggle'),
    findQuery: createElement('findQuery'),
    findPrev: createElement('findPrev'),
    findNext: createElement('findNext'),
    findClose: createElement('findClose'),
    findStatus: createElement('findStatus'),
    replaceRow: createElement('replaceRow'),
    findReplace: createElement('findReplace'),
    findReplaceOne: createElement('findReplaceOne'),
    findReplaceAll: createElement('findReplaceAll'),
  };

  const document = {
    title: '',
    body: {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
    },
    getElementById(id) {
      return elements[id] || null;
    },
  };

  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          warn() {},
          warnOnce() {},
          error() {},
          errorOnce() {},
        };
      },
      AppConstants: {
        DEFAULT_LANG: 'en',
        EDITOR_FIND_INPUT_MAX_CHARS: 512,
      },
      RendererI18n: {
        async loadRendererTranslations() {},
        tRenderer(key) {
          return key;
        },
        applyWindowLanguageAttributes(lang) {
          return lang;
        },
      },
      editorFindAPI: {
        setQuery: async () => {},
        next: async () => {},
        prev: async () => {},
        replaceCurrent: async (replacement) => {
          replaceCurrentCalls.push(String(replacement));
          return replaceCurrentResult;
        },
        replaceAll: async (replacement) => {
          replaceAllCalls.push(String(replacement));
          return replaceAllResult;
        },
        toggleExpanded: async () => {},
        close: async () => {},
        onInit(cb) {
          subscriptions.init = cb;
          return () => {};
        },
        onState(cb) {
          subscriptions.state = cb;
          return () => {};
        },
        onFocusTarget(cb) {
          subscriptions.focusTarget = cb;
          return () => {};
        },
        getSettings: async () => ({ language: 'en' }),
        onSettingsChanged(cb) {
          subscriptions.settingsChanged = cb;
          return () => {};
        },
      },
      Notify: {
        notifyEditor(key, options) {
          notifyCalls.push({ key, options });
        },
      },
    },
    document,
    console,
    setTimeout,
    clearTimeout,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/editor_find.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/editor_find.js' });

  return {
    elements,
    notifyCalls,
    replaceCurrentCalls,
    replaceAllCalls,
    subscriptions,
  };
}

async function bootstrapReady() {
  await tick();
  await tick();
}

test('replace-current timeout shows a toast in the find window', async () => {
  const harness = createHarness({
    replaceCurrentResult: { ok: false, status: 'timeout', operation: 'replace-current' },
  });

  await bootstrapReady();
  harness.subscriptions.state({
    query: 'demo',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: true,
    busy: false,
  });

  harness.elements.findReplace.value = 'cambio';
  harness.elements.findReplaceOne.listeners.click();
  await bootstrapReady();

  assert.deepEqual(harness.replaceCurrentCalls, ['cambio']);
  assert.equal(harness.notifyCalls.length, 1);
  assert.equal(harness.notifyCalls[0].key, 'renderer.editor_find.replace_timeout');
  assert.equal(harness.notifyCalls[0].options.type, 'error');
  assert.equal(harness.notifyCalls[0].options.duration, 5000);
});

test('replace-all timeout shows a toast in the find window', async () => {
  const harness = createHarness({
    replaceAllResult: { ok: false, status: 'timeout', operation: 'replace-all' },
  });

  await bootstrapReady();
  harness.subscriptions.state({
    query: 'demo',
    matches: 3,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: true,
    busy: false,
  });

  harness.elements.findReplace.value = 'cambio';
  harness.elements.findReplaceAll.listeners.click();
  await bootstrapReady();

  assert.deepEqual(harness.replaceAllCalls, ['cambio']);
  assert.equal(harness.notifyCalls.length, 1);
  assert.equal(harness.notifyCalls[0].key, 'renderer.editor_find.replace_timeout');
  assert.equal(harness.notifyCalls[0].options.type, 'error');
  assert.equal(harness.notifyCalls[0].options.duration, 5000);
});

test('successful replace does not show a timeout toast', async () => {
  const harness = createHarness({
    replaceCurrentResult: { ok: true, status: 'replaced', operation: 'replace-current' },
  });

  await bootstrapReady();
  harness.subscriptions.state({
    query: 'demo',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: true,
    busy: false,
  });

  harness.elements.findReplace.value = 'cambio';
  harness.elements.findReplaceOne.listeners.click();
  await bootstrapReady();

  assert.deepEqual(harness.replaceCurrentCalls, ['cambio']);
  assert.deepEqual(harness.notifyCalls, []);
});
