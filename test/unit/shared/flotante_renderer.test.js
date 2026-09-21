const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id, onFocus = null) {
  const listeners = new Map();
  const attributes = {};
  const element = {
    id,
    textContent: '',
    disabled: false,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    dispatch(type, event = {}) {
      const callbacks = listeners.get(type) || [];
      callbacks.forEach((callback) => callback(event));
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
  };
  if (typeof onFocus === 'function') {
    element.focus = (...args) => onFocus({ args, id });
  }
  return element;
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('Floating Stopwatch startup has no programmatic initial DOM focus', async () => {
  const focusCalls = [];
  const recordFocus = (focusCall) => focusCalls.push(focusCall);
  const elements = {
    crono: createElement('crono', recordFocus),
    toggle: createElement('toggle', recordFocus),
    reset: createElement('reset', recordFocus),
  };

  const sandbox = {
    window: {
      AppConstants: { DEFAULT_LANG: 'en' },
      RendererIcons: {
        applyIconToElement() {},
      },
      RendererI18n: {
        async transitionRendererTranslations(language, { applyTranslations } = {}) {
          if (typeof applyTranslations === 'function') await applyTranslations({ language });
        },
        tRenderer(key) {
          return key;
        },
      },
      flotanteAPI: {
        getSettings() {
          return Promise.resolve({ language: 'en' });
        },
        onSettingsChanged() {},
        onState() {},
        reportRendererI18nFailure() {},
        sendCommand() {},
      },
      getLogger() {
        return {
          debug() {},
          error() {},
          errorOnce() {},
          warn() {},
          warnOnce() {},
        };
      },
      addEventListener() {},
    },
    document: {
      title: '',
      getElementById(id) {
        return elements[id] || null;
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/flotante.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/flotante.js' });
  await tick();
  await tick();

  assert.equal(elements.toggle.disabled, false);
  assert.deepEqual(focusCalls, []);
});

test('Floating Stopwatch admits live language settings after its initial settings snapshot', async () => {
  const elements = {
    crono: createElement('crono'),
    toggle: createElement('toggle'),
    reset: createElement('reset'),
  };
  const transitionLanguages = [];
  const subscriptions = {};
  const commandCalls = [];
  let releaseInitialSettings;
  let markInitialSettingsRequested;
  const initialSettings = new Promise((resolve) => {
    releaseInitialSettings = resolve;
  });
  const initialSettingsRequested = new Promise((resolve) => {
    markInitialSettingsRequested = resolve;
  });

  const sandbox = {
    window: {
      AppConstants: { DEFAULT_LANG: 'en' },
      RendererIcons: {
        applyIconToElement(element, iconName) {
          element.setAttribute('data-tot-icon', iconName);
        },
      },
      RendererI18n: {
        async transitionRendererTranslations(language, { applyTranslations } = {}) {
          transitionLanguages.push(language);
          if (typeof applyTranslations === 'function') {
            await applyTranslations({ language });
          }
        },
        tRenderer(key) {
          return key;
        },
      },
      flotanteAPI: {
        getSettings() {
          markInitialSettingsRequested();
          return initialSettings;
        },
        onSettingsChanged(callback) {
          subscriptions.settingsChanged = callback;
        },
        onState(callback) {
          subscriptions.stateChanged = callback;
        },
        reportRendererI18nFailure() {},
        sendCommand(command) {
          commandCalls.push(command);
        },
      },
      getLogger() {
        return {
          debug() {},
          error() {},
          errorOnce() {},
          warn() {},
          warnOnce() {},
        };
      },
      addEventListener(type, callback) {
        if (type === 'keydown') subscriptions.keydown = callback;
      },
    },
    document: {
      title: '',
      getElementById(id) {
        return elements[id] || null;
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/flotante.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/flotante.js' });

  assert.equal(typeof subscriptions.settingsChanged, 'function');
  await initialSettingsRequested;
  subscriptions.stateChanged({ elapsed: 1000, running: true, display: '00:00:01' });
  assert.equal(elements.crono.textContent, '00:00:01');
  assert.equal(elements.toggle.disabled, true);
  assert.equal(elements.reset.disabled, true);
  assert.equal(subscriptions.keydown, undefined);
  elements.toggle.dispatch('click');
  assert.deepEqual(commandCalls, []);

  subscriptions.settingsChanged({ language: 'es' });
  assert.deepEqual(transitionLanguages, []);

  releaseInitialSettings({ language: 'en' });
  await tick();
  await tick();

  assert.deepEqual(transitionLanguages, ['en', 'es']);
  assert.equal(sandbox.document.title, 'renderer.main.names.floating_window');
  assert.equal(elements.toggle.getAttribute('aria-label'), 'renderer.main.names.crono_toggle');
  assert.equal(elements.toggle.getAttribute('data-tot-tooltip'), null);
  assert.equal(elements.reset.getAttribute('aria-label'), 'renderer.main.names.crono_reset');
  assert.equal(elements.reset.getAttribute('data-tot-tooltip'), null);
  assert.equal(elements.toggle.disabled, false);
  assert.equal(elements.reset.disabled, false);
  assert.equal(typeof subscriptions.keydown, 'function');
  elements.toggle.dispatch('click');
  subscriptions.keydown({ key: 'r' });
  assert.deepEqual(commandCalls.map((command) => ({ cmd: command.cmd })), [
    { cmd: 'toggle' },
    { cmd: 'reset' },
  ]);
});

test('Floating Stopwatch stops state, settings, and commands after terminal i18n failure', async () => {
  const elements = {
    crono: createElement('crono'),
    toggle: createElement('toggle'),
    reset: createElement('reset'),
  };
  const subscriptions = {};
  const transitionLanguages = [];
  let reporterCalls = 0;
  let commandCalls = 0;
  const terminalFailure = new Error('Cannot establish renderer translation state');
  terminalFailure.rendererI18nTransition = {
    hadEstablishedState: false,
    restorationFailed: false,
  };

  const sandbox = {
    window: {
      AppConstants: { DEFAULT_LANG: 'en' },
      RendererIcons: {
        applyIconToElement(element, iconName) {
          element.setAttribute('data-tot-icon', iconName);
        },
      },
      RendererI18n: {
        async transitionRendererTranslations(language) {
          transitionLanguages.push(language);
          throw terminalFailure;
        },
        tRenderer(key) {
          return key;
        },
      },
      flotanteAPI: {
        getSettings() {
          return Promise.resolve({ language: 'en' });
        },
        onSettingsChanged(callback) {
          subscriptions.settingsChanged = callback;
        },
        onState(callback) {
          subscriptions.stateChanged = callback;
        },
        reportRendererI18nFailure() {
          reporterCalls += 1;
        },
        sendCommand() {
          commandCalls += 1;
        },
      },
      getLogger() {
        return {
          debug() {},
          error() {},
          errorOnce() {},
          warn() {},
          warnOnce() {},
        };
      },
      addEventListener() {},
    },
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/flotante.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/flotante.js' });
  await tick();
  await tick();

  subscriptions.settingsChanged({ language: 'es' });
  subscriptions.stateChanged({ elapsed: 1000, display: '00:00:01' });
  elements.toggle.dispatch('click');
  await tick();

  assert.deepEqual(transitionLanguages, ['en']);
  assert.equal(reporterCalls, 1);
  assert.equal(commandCalls, 0);
  assert.equal(elements.crono.textContent, '');
  assert.equal(elements.toggle.disabled, true);
});
