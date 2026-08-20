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
    placeholder: '',
    maxLength: 0,
    attributes: {},
    listeners: {},
    focusCount: 0,
    selectCount: 0,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
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
  const closeCalls = [];
  const subscriptions = {};
  const windowListeners = {};

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
    findReplaceOneDescription: createElement('findReplaceOneDescription'),
    findReplaceAll: createElement('findReplaceAll'),
    findReplaceAllDescription: createElement('findReplaceAllDescription'),
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
      RendererIcons: {
        applyIconToElement(element, iconName) {
          element.setAttribute('data-tot-icon', iconName);
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
        close: async () => {
          closeCalls.push(true);
        },
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
      addEventListener(type, listener) {
        if (!windowListeners[type]) windowListeners[type] = [];
        windowListeners[type].push(listener);
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
    closeCalls,
    subscriptions,
    dispatchWindow(type, event) {
      (windowListeners[type] || []).forEach((listener) => listener(event));
    },
  };
}

async function bootstrapReady() {
  await tick();
  await tick();
}

test('find controls apply explicit names and replace descriptions without visual-tooltip data', async () => {
  const harness = createHarness();

  await bootstrapReady();

  [
    ['findToggle', 'renderer.editor.editor_find.names.show_replace'],
    ['findPrev', 'renderer.editor.editor_find.names.previous_match'],
    ['findNext', 'renderer.editor.editor_find.names.next_match'],
    ['findClose', 'renderer.editor.editor_find.names.close'],
  ].forEach(([id, key]) => {
    assert.equal(harness.elements[id].getAttribute('aria-label'), key);
  });
  assert.equal(
    harness.elements.findReplaceOneDescription.textContent,
    'renderer.editor.editor_find.help.replace_current'
  );
  assert.equal(
    harness.elements.findReplaceAllDescription.textContent,
    'renderer.editor.editor_find.help.replace_all'
  );

  [
    'findToggle',
    'findPrev',
    'findNext',
    'findClose',
    'findReplaceOne',
    'findReplaceAll',
  ].forEach((id) => {
    assert.equal(harness.elements[id].getAttribute('data-tot-tooltip'), null);
  });

  harness.subscriptions.state({
    query: 'demo',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: true,
    busy: false,
  });
  assert.equal(
    harness.elements.findToggle.getAttribute('aria-label'),
    'renderer.editor.editor_find.names.hide_replace'
  );
  assert.equal(harness.elements.findToggle.getAttribute('data-tot-tooltip'), null);
});

test('Escape requests Find-window closure', async () => {
  const harness = createHarness();
  let prevented = false;

  await bootstrapReady();
  harness.dispatchWindow('keydown', {
    key: 'Escape',
    preventDefault() { prevented = true; },
  });
  await bootstrapReady();

  assert.equal(prevented, true);
  assert.deepEqual(harness.closeCalls, [true]);
});

test('find window does not load or declare visual-tooltip integration', () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../../public/editor_find.html'),
    'utf8'
  );

  assert.doesNotMatch(html, /tooltips\.(?:css|js)/);
  assert.doesNotMatch(html, /data-tot-tooltip/);
  assert.doesNotMatch(html, /\s+title\s*=/);
  assert.match(
    html,
    /id="findReplaceOne"[\s\S]*?aria-describedby="findReplaceOneDescription"/
  );
  assert.match(
    html,
    /id="findReplaceAll"[\s\S]*?aria-describedby="findReplaceAllDescription"/
  );
});

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
  assert.equal(harness.notifyCalls[0].key, 'renderer.editor.editor_find.replace_timeout');
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
  assert.equal(harness.notifyCalls[0].key, 'renderer.editor.editor_find.replace_timeout');
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
