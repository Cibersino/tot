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

function runFlotante(sandbox) {
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/flotante.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/flotante.js' });
}

function createBootstrapHarness() {
  const elements = {
    crono: createElement('crono'),
    toggle: createElement('toggle'),
    reset: createElement('reset'),
  };
  const errors = [];
  let closeCalls = 0;
  const sandbox = {
    window: {
      AppConstants: { DEFAULT_LANG: 'en' },
      RendererIcons: {
        applyIconToElement() {},
      },
      RendererI18n: {
        async transitionRendererTranslations() {},
        tRenderer(key) { return key; },
      },
      flotanteAPI: {
        getSettings() { return Promise.resolve({ language: 'en' }); },
        onSettingsChanged() {},
        onState() {},
        reportRendererI18nFailure() {},
        sendCommand() {},
      },
      getLogger() {
        return {
          debug() {},
          error(...args) { errors.push(args); },
          errorOnce() {},
          warn() {},
          warnOnce() {},
        };
      },
      addEventListener() {},
      close() { closeCalls += 1; },
    },
    document: {
      title: '',
      getElementById(id) {
        return elements[id] || null;
      },
    },
    console,
  };

  return {
    elements,
    errors,
    sandbox,
    getCloseCalls: () => closeCalls,
  };
}

test('Floating Stopwatch fail-closes direct required bootstrap failures', () => {
  const cases = [
    {
      name: 'missing logger',
      configure(harness) {
        delete harness.sandbox.window.getLogger;
      },
      error: /window\.getLogger unavailable/,
    },
    {
      name: 'logger acquisition failure',
      configure(harness) {
        harness.sandbox.window.getLogger = () => {
          throw new Error('logger unavailable');
        };
      },
      error: /window\.getLogger acquisition failed/,
    },
    {
      name: 'missing icon bridge',
      configure(harness) {
        delete harness.sandbox.window.RendererIcons;
      },
      error: /RendererIcons\.applyIconToElement unavailable/,
    },
    {
      name: 'missing constants',
      configure(harness) {
        delete harness.sandbox.window.AppConstants;
      },
      error: /AppConstants unavailable/,
    },
    {
      name: 'missing Floating bridge',
      configure(harness) {
        delete harness.sandbox.window.flotanteAPI;
      },
      error: /flotanteAPI unavailable/,
    },
    {
      name: 'missing state listener',
      configure(harness) {
        delete harness.sandbox.window.flotanteAPI.onState;
      },
      error: /flotanteAPI\.onState unavailable/,
    },
    {
      name: 'missing command sender',
      configure(harness) {
        delete harness.sandbox.window.flotanteAPI.sendCommand;
      },
      error: /flotanteAPI\.sendCommand unavailable/,
    },
    {
      name: 'state-listener registration failure',
      configure(harness) {
        harness.sandbox.window.flotanteAPI.onState = () => {
          throw new Error('listener registration failed');
        };
      },
      error: /flotanteAPI\.onState registration failed/,
    },
  ];

  for (const failure of cases) {
    const harness = createBootstrapHarness();
    failure.configure(harness);

    assert.throws(() => runFlotante(harness.sandbox), failure.error, failure.name);
    assert.equal(harness.getCloseCalls(), 1, failure.name);
  }
});

test('Floating Stopwatch fail-closes only missing required controls', async () => {
  for (const controlId of ['toggle', 'reset']) {
    const harness = createBootstrapHarness();
    harness.elements[controlId] = null;

    assert.throws(
      () => runFlotante(harness.sandbox),
      /required Floating Stopwatch controls unavailable/,
      controlId
    );
    assert.equal(harness.getCloseCalls(), 1, controlId);
    assert.deepEqual(harness.errors[0], [`element #${controlId} not found`], controlId);
  }

  const harness = createBootstrapHarness();
  harness.elements.crono = null;
  runFlotante(harness.sandbox);
  await tick();
  await tick();

  assert.equal(harness.getCloseCalls(), 0);
  assert.equal(harness.elements.toggle.disabled, false);
  assert.equal(harness.elements.reset.disabled, false);
});

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

test('Floating Stopwatch closes before normal interaction when live settings registration is unavailable', () => {
  const elements = {
    crono: createElement('crono'),
    toggle: createElement('toggle'),
    reset: createElement('reset'),
  };
  let reporterCalls = 0;
  const sandbox = {
    window: {
      AppConstants: { DEFAULT_LANG: 'en' },
      RendererIcons: { applyIconToElement() {} },
      RendererI18n: {
        async transitionRendererTranslations() {},
        tRenderer(key) { return key; },
      },
      flotanteAPI: {
        getSettings() { return Promise.resolve({ language: 'en' }); },
        onState() {},
        reportRendererI18nFailure() { reporterCalls += 1; },
        sendCommand() {},
      },
      getLogger() {
        return { debug() {}, error() {}, errorOnce() {}, warn() {}, warnOnce() {} };
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

  assert.equal(reporterCalls, 1);
  assert.equal(elements.toggle.disabled, true);
  assert.equal(elements.reset.disabled, true);
});

test('Floating Stopwatch closes before normal interaction when live settings registration throws', () => {
  const elements = {
    crono: createElement('crono'),
    toggle: createElement('toggle'),
    reset: createElement('reset'),
  };
  let reporterCalls = 0;
  const sandbox = {
    window: {
      AppConstants: { DEFAULT_LANG: 'en' },
      RendererIcons: { applyIconToElement() {} },
      RendererI18n: {
        async transitionRendererTranslations() {},
        tRenderer(key) { return key; },
      },
      flotanteAPI: {
        getSettings() { return Promise.resolve({ language: 'en' }); },
        onSettingsChanged() {
          throw new Error('settings listener registration failed');
        },
        onState() {},
        reportRendererI18nFailure() { reporterCalls += 1; },
        sendCommand() {},
      },
      getLogger() {
        return { debug() {}, error() {}, errorOnce() {}, warn() {}, warnOnce() {} };
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

  assert.equal(reporterCalls, 1);
  assert.equal(elements.toggle.disabled, true);
  assert.equal(elements.reset.disabled, true);
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
