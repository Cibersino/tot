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
  replaceCurrentImpl = null,
  rejectTransitionLanguage = '',
  transitionFailure = null,
  holdTransitionLanguage = '',
  holdInitialSettings = false,
  includeRendererI18n = true,
  expectStartupThrow = false,
  loggerMode = 'available',
  missingElementId = '',
  omittedFindApiMethod = '',
  initListenerMode = 'available',
  stateListenerMode = 'available',
  focusListenerMode = 'available',
  settingsListenerMode = 'available',
} = {}) {
  const notifyCalls = [];
  const replaceCurrentCalls = [];
  const replaceAllCalls = [];
  const closeCalls = [];
  const localCloseCalls = [];
  const queryCalls = [];
  const subscriptions = {};
  const windowListeners = {};
  const transitionLanguages = [];
  let reporterCalls = 0;
  let releaseHeldTransition = null;
  let resolveHeldTransitionReached = null;
  const heldTransition = holdTransitionLanguage
    ? new Promise((resolve) => { releaseHeldTransition = resolve; })
    : null;
  const heldTransitionReached = holdTransitionLanguage
    ? new Promise((resolve) => { resolveHeldTransitionReached = resolve; })
    : null;
  let releaseInitialSettings;
  let markInitialSettingsRequested;
  const initialSettings = holdInitialSettings
    ? new Promise((resolve) => { releaseInitialSettings = resolve; })
    : null;
  const initialSettingsRequested = holdInitialSettings
    ? new Promise((resolve) => { markInitialSettingsRequested = resolve; })
    : null;

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
      if (id === missingElementId) return null;
      return elements[id] || null;
    },
  };

  const sandbox = {
    window: {
      getLogger() {
        if (loggerMode === 'throw') {
          throw new Error('logger acquisition failed');
        }
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
      RendererI18n: includeRendererI18n ? {
        async transitionRendererTranslations(language, { applyTranslations } = {}) {
          transitionLanguages.push(language);
          if (language === rejectTransitionLanguage) {
            throw transitionFailure || new Error(`Cannot apply ${language} translations`);
          }
          if (language === holdTransitionLanguage) {
            resolveHeldTransitionReached();
            await heldTransition;
          }
          if (typeof applyTranslations === 'function') await applyTranslations({ language, restoring: false });
        },
        tRenderer(key) {
          return key;
        },
      } : undefined,
      RendererIcons: {
        applyIconToElement(element, iconName) {
          element.setAttribute('data-tot-icon', iconName);
        },
      },
      editorFindAPI: {
        reportRendererI18nFailure() {
          reporterCalls += 1;
        },
        setQuery: async (query) => {
          queryCalls.push(String(query));
        },
        next: async () => {},
        prev: async () => {},
        replaceCurrent: async (replacement) => {
          replaceCurrentCalls.push(String(replacement));
          if (typeof replaceCurrentImpl === 'function') {
            return replaceCurrentImpl(String(replacement));
          }
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
          if (initListenerMode === 'throw') {
            throw new Error('init listener registration failed');
          }
          subscriptions.init = cb;
          return () => {};
        },
        onState(cb) {
          if (stateListenerMode === 'throw') {
            throw new Error('state listener registration failed');
          }
          subscriptions.state = cb;
          return () => {};
        },
        onFocusTarget(cb) {
          subscriptions.focusTarget = cb;
          if (focusListenerMode === 'throw-after-register') {
            cb({ target: 'query', selectAll: true });
            throw new Error('focus listener registration failed');
          }
          return () => {};
        },
        async getSettings() {
          if (initialSettings) {
            markInitialSettingsRequested();
            await initialSettings;
          }
          return { language: 'en' };
        },
        ...(settingsListenerMode === 'missing' ? {} : {
          onSettingsChanged(cb) {
            if (settingsListenerMode === 'throw') {
              throw new Error('settings listener registration failed');
            }
            subscriptions.settingsChanged = cb;
            return () => {};
          },
        }),
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
      close() {
        localCloseCalls.push(true);
      },
    },
    document,
    console,
    setTimeout,
    clearTimeout,
  };

  if (loggerMode === 'missing') {
    delete sandbox.window.getLogger;
  }
  if (omittedFindApiMethod) {
    delete sandbox.window.editorFindAPI[omittedFindApiMethod];
  }

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/editor_find.js'),
    'utf8'
  );
  let startupError = null;
  try {
    vm.runInContext(source, sandbox, { filename: 'public/editor_find.js' });
  } catch (err) {
    startupError = err;
    if (!expectStartupThrow) throw err;
  }

  return {
    elements,
    notifyCalls,
    replaceCurrentCalls,
    replaceAllCalls,
    closeCalls,
    localCloseCalls,
    queryCalls,
    subscriptions,
    transitionLanguages,
    startupError,
    getReporterCalls() {
      return reporterCalls;
    },
    releaseHeldTransition() {
      if (releaseHeldTransition) releaseHeldTransition();
    },
    waitForHeldTransition() {
      return heldTransitionReached || Promise.resolve();
    },
    releaseInitialSettings() {
      if (releaseInitialSettings) releaseInitialSettings();
    },
    waitForInitialSettingsRequest() {
      return initialSettingsRequested || Promise.resolve();
    },
    dispatchWindow(type, event) {
      (windowListeners[type] || []).forEach((listener) => listener(event));
    },
  };
}

test('find reports earliest required i18n failure before dynamic control setup', () => {
  const harness = createHarness({
    includeRendererI18n: false,
    expectStartupThrow: true,
  });

  assert.match(harness.startupError && harness.startupError.message, /RendererI18n unavailable/);
  assert.equal(harness.getReporterCalls(), 1);
});

test('find fail-closes direct non-i18n bootstrap aborts before close wiring', () => {
  const cases = [
    {
      label: 'missing logger',
      options: { loggerMode: 'missing' },
      message: /window\.getLogger unavailable/,
    },
    {
      label: 'missing required Find API method',
      options: { omittedFindApiMethod: 'onState' },
      message: /required methods unavailable/,
    },
    {
      label: 'missing required Find control',
      options: { missingElementId: 'findClose' },
      message: /Missing required DOM elements/,
    },
  ];

  for (const { label, options, message } of cases) {
    const harness = createHarness({ ...options, expectStartupThrow: true });

    assert.match(harness.startupError && harness.startupError.message, message, label);
    assert.deepEqual(harness.localCloseCalls, [true], label);
    assert.equal(harness.subscriptions.init, undefined, label);
    assert.equal(harness.elements.findClose.listeners.click, undefined, label);
  }
});

test('find fail-closes required init/state listener registration aborts after Close wiring', () => {
  for (const listenerMode of ['initListenerMode', 'stateListenerMode']) {
    const harness = createHarness({
      [listenerMode]: 'throw',
      expectStartupThrow: true,
    });

    assert.match(harness.startupError && harness.startupError.message, /listener registration failed/, listenerMode);
    assert.deepEqual(harness.localCloseCalls, [true], listenerMode);
    assert.equal(typeof harness.elements.findClose.listeners.click, 'function', listenerMode);
    assert.equal(harness.getReporterCalls(), 0, listenerMode);
    assert.equal(harness.subscriptions.settingsChanged, undefined, listenerMode);
  }
});

test('find closes before normal interaction when live settings registration is unavailable or throws', () => {
  for (const settingsListenerMode of ['missing', 'throw']) {
    const harness = createHarness({ settingsListenerMode });

    assert.equal(harness.getReporterCalls(), 1, settingsListenerMode);
    assert.equal(harness.subscriptions.settingsChanged, undefined, settingsListenerMode);
    assert.equal(harness.elements.findQuery.disabled, true, settingsListenerMode);
    assert.equal(harness.elements.findNext.disabled, true, settingsListenerMode);
  }
});

test('find disables focus sync when focus-listener registration throws after retaining its callback', async () => {
  const harness = createHarness({ focusListenerMode: 'throw-after-register' });

  await bootstrapReady();

  assert.equal(harness.startupError, null);
  assert.equal(harness.getReporterCalls(), 0);
  harness.subscriptions.focusTarget({ target: 'query', selectAll: true });
  assert.equal(harness.elements.findQuery.focusCount, 0);
  assert.equal(typeof harness.subscriptions.settingsChanged, 'function');
  assert.equal(harness.elements.findQuery.disabled, false);
});

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

test('find window serializes overlapping language settings updates', async () => {
  const harness = createHarness({ holdTransitionLanguage: 'es' });
  await bootstrapReady();
  harness.transitionLanguages.length = 0;

  const spanishUpdate = harness.subscriptions.settingsChanged({ language: 'es' });
  await harness.waitForHeldTransition();
  const englishUpdate = harness.subscriptions.settingsChanged({ language: 'en' });
  harness.releaseHeldTransition();

  await Promise.all([spanishUpdate, englishUpdate]);

  assert.deepEqual(harness.transitionLanguages, ['es', 'en']);
});

test('find window admits live language settings after its initial settings snapshot', async () => {
  const harness = createHarness({ holdInitialSettings: true });
  await harness.waitForInitialSettingsRequest();
  harness.subscriptions.settingsChanged({ language: 'es' });
  assert.deepEqual(harness.transitionLanguages, []);

  harness.releaseInitialSettings();
  await tick();
  await tick();

  assert.deepEqual(harness.transitionLanguages, ['en', 'es']);
});

test('initial Main state is projected before a bootstrap-pending focus intent is applied', async () => {
  const harness = createHarness({ holdInitialSettings: true });
  await harness.waitForInitialSettingsRequest();

  harness.subscriptions.init({
    query: 'needle',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: false,
    busy: false,
  });
  harness.subscriptions.focusTarget({ target: 'query', selectAll: true });

  assert.equal(harness.elements.findQuery.focusCount, 0);

  harness.releaseInitialSettings();
  await bootstrapReady();

  assert.equal(harness.elements.findQuery.value, 'needle');
  assert.equal(harness.elements.findQuery.focusCount, 1);
  assert.equal(harness.elements.findQuery.selectCount, 1);
});

test('busy focus requests are latest-wins until the requested input is enabled', async () => {
  const harness = createHarness();
  await bootstrapReady();

  harness.subscriptions.state({
    query: 'needle',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: true,
    busy: true,
  });
  harness.subscriptions.focusTarget({ target: 'query', selectAll: true });
  harness.subscriptions.focusTarget({ target: 'replace', selectAll: true });

  assert.equal(harness.elements.findQuery.focusCount, 0);
  assert.equal(harness.elements.findReplace.focusCount, 0);
  assert.equal(harness.elements.findReplace.disabled, true);

  harness.subscriptions.state({
    query: 'needle',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: true,
    busy: false,
  });

  assert.equal(harness.elements.findQuery.value, 'needle');
  assert.equal(harness.elements.findQuery.focusCount, 0);
  assert.equal(harness.elements.findReplace.focusCount, 1);
  assert.equal(harness.elements.findReplace.selectCount, 1);
});

test('a hidden Replace target waits for Main expanded state before it is focused', async () => {
  const harness = createHarness();
  await bootstrapReady();

  harness.subscriptions.state({
    query: 'needle',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: false,
    busy: false,
  });
  harness.subscriptions.focusTarget({ target: 'replace', selectAll: true });

  assert.equal(harness.elements.replaceRow.hidden, true);
  assert.equal(harness.elements.findReplace.focusCount, 0);

  harness.subscriptions.state({
    query: 'needle',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: true,
    busy: false,
  });

  assert.equal(harness.elements.replaceRow.hidden, false);
  assert.equal(harness.elements.findReplace.focusCount, 1);
  assert.equal(harness.elements.findReplace.selectCount, 1);
});

test('later translation presentation preserves an in-progress query until Main publishes state', async () => {
  const harness = createHarness({ holdTransitionLanguage: 'es' });
  await bootstrapReady();

  harness.elements.findQuery.value = 'needle';
  harness.elements.findQuery.listeners.input();
  const transition = harness.subscriptions.settingsChanged({ language: 'es' });
  await harness.waitForHeldTransition();
  harness.releaseHeldTransition();
  await transition;

  assert.deepEqual(harness.queryCalls, ['needle']);
  assert.equal(harness.elements.findQuery.value, 'needle');

  harness.subscriptions.state({
    query: 'authoritative query',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: false,
    busy: false,
  });

  assert.equal(harness.elements.findQuery.value, 'authoritative query');
});

test('find window does not apply init or state after terminal i18n failure', async () => {
  const transitionFailure = new Error('Cannot restore Find translations');
  transitionFailure.rendererI18nTransition = {
    hadEstablishedState: true,
    restorationFailed: true,
  };
  const harness = createHarness({
    rejectTransitionLanguage: 'es',
    transitionFailure,
  });
  await bootstrapReady();

  await harness.subscriptions.settingsChanged({ language: 'es' });
  harness.subscriptions.init({
    query: 'ignored init',
    matches: 1,
    activeMatchOrdinal: 1,
    finalUpdate: true,
    expanded: true,
    busy: false,
  });
  harness.subscriptions.state({
    query: 'ignored state',
    matches: 2,
    activeMatchOrdinal: 2,
    finalUpdate: true,
    expanded: true,
    busy: false,
  });
  harness.subscriptions.focusTarget({ target: 'replace', selectAll: true });

  assert.equal(harness.elements.findQuery.value, '');
  assert.equal(harness.elements.findWrap.getAttribute('data-expanded'), null);
  assert.equal(harness.elements.findReplace.focusCount, 0);
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

test('an admitted replace timeout does not publish after terminal Find failure', async () => {
  let resolveReplace = null;
  const transitionFailure = new Error('Cannot restore Find translations');
  transitionFailure.rendererI18nTransition = {
    hadEstablishedState: true,
    restorationFailed: true,
  };
  const harness = createHarness({
    rejectTransitionLanguage: 'es',
    transitionFailure,
    replaceCurrentImpl() {
      return new Promise((resolve) => {
        resolveReplace = resolve;
      });
    },
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
  harness.elements.findReplaceOne.listeners.click();
  assert.equal(harness.replaceCurrentCalls.length, 1);
  assert.equal(typeof resolveReplace, 'function');

  await harness.subscriptions.settingsChanged({ language: 'es' });
  resolveReplace({ ok: false, status: 'timeout', operation: 'replace-current' });
  await bootstrapReady();

  assert.deepEqual(harness.notifyCalls, []);
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
