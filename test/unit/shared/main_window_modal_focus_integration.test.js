'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const READING_TEST_ENTRY_ELEMENT_IDS = [
  'readingTestEntryModal',
  'readingTestEntryModalBackdrop',
  'readingTestEntryModalTitle',
  'readingTestEntryModalIntroToggle',
  'readingTestEntryModalIntro',
  'readingTestEntryModalWarning',
  'readingTestEntryModalEligibleCount',
  'readingTestEntryModalEligibleCountLabel',
  'readingTestEntryModalEligibleCountNumber',
  'readingTestEntryModalShowBundledLabel',
  'readingTestEntryModalShowBundled',
  'readingTestEntryModalShowBundledText',
  'readingTestEntryModalShowBundledDescription',
  'readingTestEntryModalGetMoreFiles',
  'readingTestEntryModalGetMoreFilesDescription',
  'readingTestEntryModalImport',
  'readingTestEntryModalImportDescription',
  'readingTestEntryModalReset',
  'readingTestEntryModalStart',
  'readingTestEntryModalStartDescription',
  'readingTestEntryModalStartCurrentText',
  'readingTestEntryModalStartCurrentTextDescription',
  'readingTestEntryModalClose',
  'readingTestEntryLanguageSection',
  'readingTestEntryLanguageHeading',
  'readingTestEntryLanguageOptions',
  'readingTestEntryTypeSection',
  'readingTestEntryTypeHeading',
  'readingTestEntryTypeOptions',
  'readingTestEntryDifficultySection',
  'readingTestEntryDifficultyHeading',
  'readingTestEntryDifficultyOptions',
];

function createElement(id = '') {
  const attributes = {};
  const listeners = new Map();
  const children = [];
  return {
    id,
    dataset: {},
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    href: '',
    title: '',
    textContent: '',
    scrollTop: 0,
    parentNode: null,
    panel: null,
    get _children() {
      return children;
    },
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter((candidate) => candidate !== handler));
    },
    dispatch(type, event = {}) {
      const safeEvent = {
        target: this,
        preventDefault() {},
        ...event,
      };
      (listeners.get(type) || []).forEach((handler) => handler(safeEvent));
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name)
        ? attributes[name]
        : null;
    },
    querySelector() {
      return this.panel;
    },
    focus() {
      this.ownerDocument.activeElement = this;
    },
  };
}

function createEnvironment(ids) {
  const elements = {};
  const modalOpeners = new Map();
  const windowListeners = new Map();
  const document = {
    activeElement: null,
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      const element = createElement();
      element.ownerDocument = document;
      return element;
    },
    contains(element) {
      return !!element;
    },
  };
  ids.forEach((id) => {
    elements[id] = createElement(id);
    elements[id].ownerDocument = document;
  });

  const Notify = {
    activateModalFocus(modal, { initialFocus }) {
      modalOpeners.set(modal, document.activeElement);
      initialFocus.focus();
    },
    deactivateModalFocus(modal) {
      const opener = modalOpeners.get(modal);
      modalOpeners.delete(modal);
      if (opener) opener.focus();
    },
    confirmMain() {
      return true;
    },
    notifyMain() {},
    toastMain() {},
  };

  const window = {
    Notify,
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
      tRenderer(key) { return key; },
      msgRenderer(key) { return key; },
    },
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!windowListeners.has(type)) return;
      windowListeners.set(type, windowListeners.get(type).filter((candidate) => candidate !== handler));
    },
  };

  function run(relativePath) {
    const sandbox = { window, document, console };
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
    vm.runInContext(source, sandbox, { filename: relativePath });
  }

  return { document, elements, run, window };
}

test('browser-extension modal focuses Close and restores its per-open trigger', () => {
  const env = createEnvironment([
    'browserExtensionLogoLink',
    'browserExtensionModal',
    'browserExtensionModalBackdrop',
    'browserExtensionModalClose',
    'browserExtensionModalTitle',
    'browserExtensionModalSubtitle',
    'browserExtensionChromeStoreLink',
    'browserExtensionModalAvailability',
  ]);
  env.elements.browserExtensionModal.setAttribute('aria-hidden', 'true');
  env.elements.browserExtensionModal.panel = createElement('browserExtensionPanel');
  env.elements.browserExtensionModal.panel.ownerDocument = env.document;
  env.run('../../../public/js/browser_extension_modal.js');
  env.window.BrowserExtensionModal.configure({ hasBlockingModalOpen: () => false });
  env.window.BrowserExtensionModal.applyTranslations();

  assert.equal(
    env.elements.browserExtensionLogoLink.getAttribute('aria-label'),
    'renderer.main.aria.browser_extension'
  );
  assert.equal(
    env.elements.browserExtensionLogoLink.getAttribute('data-tot-tooltip'),
    'renderer.main.tooltips.browser_extension'
  );
  assert.equal(env.elements.browserExtensionLogoLink.title, '');
  assert.equal(
    env.elements.browserExtensionChromeStoreLink.getAttribute('aria-label'),
    'renderer.browser_extension.chrome_store_aria'
  );
  assert.equal(env.elements.browserExtensionChromeStoreLink.getAttribute('data-tot-tooltip'), null);

  env.elements.browserExtensionLogoLink.focus();
  env.elements.browserExtensionLogoLink.dispatch('click');
  assert.equal(env.document.activeElement, env.elements.browserExtensionModalClose);

  env.elements.browserExtensionModalClose.dispatch('click');
  assert.equal(env.document.activeElement, env.elements.browserExtensionLogoLink);
});

test('reading-test entry modal focuses Show instructions and restores its opener', async () => {
  const env = createEnvironment([
    ...READING_TEST_ENTRY_ELEMENT_IDS,
    'readingTestOpener',
  ]);
  env.elements.readingTestEntryModal.setAttribute('aria-hidden', 'true');
  env.elements.readingTestEntryModal.panel = createElement('readingTestPanel');
  env.elements.readingTestEntryModal.panel.ownerDocument = env.document;
  env.window.ReadingTestFiltersCore = {
    normalizeSelection(selection) {
      return {
        language: Array.isArray(selection && selection.language) ? selection.language : [],
        type: Array.isArray(selection && selection.type) ? selection.type : [],
        difficulty: Array.isArray(selection && selection.difficulty) ? selection.difficulty : [],
      };
    },
    computeFilterState(entries) {
      return {
        eligibleCount: entries.length,
        options: { language: [], type: [], difficulty: [] },
      };
    },
  };
  env.window.SnapshotTagCatalog = {
    LANGUAGE_OPTIONS: [],
    TYPE_OPTIONS: [],
    DIFFICULTY_OPTIONS: [],
    resolveTagLabel() { return ''; },
  };
  env.window.electronAPI = {
    onReadingTestStateChanged() { return () => {}; },
    async getReadingTestState() { return { active: false }; },
    async getReadingTestEntryData() {
      return {
        ok: true,
        canOpen: true,
        entries: [{}],
        poolExhausted: false,
        currentTextAvailable: true,
        showBundledEntries: true,
        entryEmptyState: 'none',
      };
    },
  };
  env.run('../../../public/js/reading_speed_test.js');
  env.window.ReadingSpeedTestUi.configure();

  env.elements.readingTestOpener.focus();
  await env.window.ReadingSpeedTestUi.openEntryFlow();
  assert.equal(env.document.activeElement, env.elements.readingTestEntryModalIntroToggle);
  [
    ['readingTestEntryModalShowBundledLabel', 'readingTestEntryModalShowBundledDescription',
      'renderer.reading_test.entry.help.show_bundled_entries'],
    ['readingTestEntryModalGetMoreFiles', 'readingTestEntryModalGetMoreFilesDescription',
      'renderer.reading_test.entry.help.get_more_files'],
    ['readingTestEntryModalImport', 'readingTestEntryModalImportDescription',
      'renderer.reading_test.entry.help.import_files'],
    ['readingTestEntryModalStart', 'readingTestEntryModalStartDescription',
      'renderer.reading_test.entry.help.start_random_text'],
    ['readingTestEntryModalStartCurrentText', 'readingTestEntryModalStartCurrentTextDescription',
      'renderer.reading_test.entry.help.start_current_text'],
  ].forEach(([visualTargetId, descriptionId, key]) => {
    assert.equal(env.elements[visualTargetId].getAttribute('data-tot-tooltip'), key);
    assert.equal(env.elements[descriptionId].textContent, key);
  });
  assert.equal(
    env.elements.readingTestEntryModalReset.getAttribute('aria-label'),
    'renderer.reading_test.entry.names.reset_pool'
  );
  assert.equal(
    env.elements.readingTestEntryModalReset.getAttribute('data-tot-tooltip'),
    'renderer.reading_test.entry.names.reset_pool'
  );

  env.elements.readingTestEntryModalClose.dispatch('click');
  assert.equal(env.document.activeElement, env.elements.readingTestOpener);
});

test('reading-test setup and early session state do not resolve translated copy', () => {
  const env = createEnvironment(READING_TEST_ENTRY_ELEMENT_IDS);
  let stateChangedHandler = null;
  let translationCalls = 0;
  env.elements.readingTestEntryModal.setAttribute('aria-hidden', 'true');
  env.window.ReadingTestFiltersCore = {
    normalizeSelection(selection) {
      return {
        language: Array.isArray(selection && selection.language) ? selection.language : [],
        type: Array.isArray(selection && selection.type) ? selection.type : [],
        difficulty: Array.isArray(selection && selection.difficulty) ? selection.difficulty : [],
      };
    },
    computeFilterState(entries) {
      return {
        eligibleCount: entries.length,
        options: { language: [], type: [], difficulty: [] },
      };
    },
  };
  env.window.SnapshotTagCatalog = {
    LANGUAGE_OPTIONS: [],
    TYPE_OPTIONS: [],
    DIFFICULTY_OPTIONS: [],
    resolveTagLabel() { return ''; },
  };
  env.window.electronAPI = {
    onReadingTestStateChanged(handler) {
      stateChangedHandler = handler;
    },
  };
  env.window.RendererI18n.tRenderer = () => {
    translationCalls += 1;
    throw new Error('renderer translation state is not established');
  };
  env.run('../../../public/js/reading_speed_test.js');

  assert.doesNotThrow(() => env.window.ReadingSpeedTestUi.configure());
  assert.equal(translationCalls, 0);
  assert.equal(typeof stateChangedHandler, 'function');

  assert.doesNotThrow(() => stateChangedHandler({ active: false, stage: 'idle', blocked: false }));
  assert.equal(translationCalls, 0);

  assert.throws(
    () => env.window.ReadingSpeedTestUi.applyTranslations(),
    /renderer translation state is not established/
  );
  assert.equal(translationCalls, 1);
});

test('reading-test entry markup relates material help to each actual control', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../../../public/index.html'), 'utf8');
  [
    ['readingTestEntryModalShowBundled', 'readingTestEntryModalShowBundledDescription'],
    ['readingTestEntryModalGetMoreFiles', 'readingTestEntryModalGetMoreFilesDescription'],
    ['readingTestEntryModalImport', 'readingTestEntryModalImportDescription'],
    ['readingTestEntryModalStart', 'readingTestEntryModalStartDescription'],
    ['readingTestEntryModalStartCurrentText', 'readingTestEntryModalStartCurrentTextDescription'],
  ].forEach(([controlId, descriptionId]) => {
    assert.match(
      markup,
      new RegExp(`id="${controlId}"[^>]*aria-describedby="${descriptionId}"`)
    );
    assert.match(
      markup,
      new RegExp(`id="${descriptionId}"[^>]*class="main-accessible-description"`)
    );
  });
});

function createReadingTestEnvironment({ registration = 'success', getState } = {}) {
  const env = createEnvironment(READING_TEST_ENTRY_ELEMENT_IDS);
  const starts = [];
  const notices = [];
  const warnings = [];
  let stateChanged;
  env.elements.readingTestEntryModal.setAttribute('aria-hidden', 'true');
  env.window.ReadingTestFiltersCore = require('../../../public/js/lib/reading_test_filters_core');
  env.window.SnapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');
  env.window.Notify.notifyMain = (key) => notices.push(key);
  env.window.getLogger = () => ({
    debug() {},
    warn(...args) { warnings.push(args); },
    warnOnce(...args) { warnings.push(args); },
    error() {},
  });
  env.window.electronAPI = {
    getReadingTestState: getState || (async () => ({ active: false })),
    async getReadingTestEntryData() {
      return {
        ok: true, canOpen: true, entries: [{ used: false, tags: {} }],
        poolExhausted: false, currentTextAvailable: true,
        showBundledEntries: true, entryEmptyState: 'none',
      };
    },
    async startReadingTest(payload) {
      starts.push(payload.sourceMode);
      return { ok: true };
    },
    onReadingTestNotice() {},
  };
  if (registration !== 'missing') {
    env.window.electronAPI.onReadingTestStateChanged = (handler) => {
      stateChanged = handler;
      if (registration === 'throws') throw new Error('registration failed');
      return () => {};
    };
  }
  env.run('../../../public/js/reading_speed_test.js');
  return { ...env, starts, notices, warnings, emitState: (state) => stateChanged(state) };
}

async function flushReadingTestWork() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('reading-test registration preserves both start paths and live session locking', async () => {
  for (const [button, mode] of [
    ['readingTestEntryModalStart', 'pool'],
    ['readingTestEntryModalStartCurrentText', 'current_text'],
  ]) {
    const env = createReadingTestEnvironment();
    const ui = env.window.ReadingSpeedTestUi;
    ui.configure();
    await flushReadingTestWork();
    await ui.openEntryFlow();
    assert.equal(env.elements.readingTestEntryModal.getAttribute('aria-hidden'), 'false');
    env.elements[button].dispatch('click');
    await flushReadingTestWork();
    assert.deepEqual(env.starts, [mode]);
    env.emitState({ active: true });
    assert.equal(ui.isInteractionLocked(), true);
    env.emitState({ active: false });
    assert.equal(ui.isInteractionLocked(), false);
  }
});

test('invalid reading-test state events preserve an active session lock and report the anomaly', async () => {
  const env = createReadingTestEnvironment();
  const ui = env.window.ReadingSpeedTestUi;
  ui.configure();
  await flushReadingTestWork();
  ui.applyTranslations();
  env.emitState({ active: true });

  const invalidStates = [null, [], {}, { active: null }, { active: 0 }, { active: 'false' }];
  for (const state of invalidStates) {
    const warningsBefore = env.warnings.length;
    env.emitState(state);
    assert.equal(ui.isSessionActive(), true);
    assert.equal(ui.isInteractionLocked(), true);
    assert.equal(env.warnings.length, warningsBefore + 1);
  }

  env.emitState({ active: false });
  assert.equal(ui.isSessionActive(), false);
  assert.equal(ui.isInteractionLocked(), false);
});

test('invalid truthy reading-test state does not close an inactive entry modal', async () => {
  const env = createReadingTestEnvironment();
  const ui = env.window.ReadingSpeedTestUi;
  ui.configure();
  await flushReadingTestWork();
  await ui.openEntryFlow();
  assert.equal(env.elements.readingTestEntryModal.getAttribute('aria-hidden'), 'false');

  env.emitState({ active: 'false' });
  assert.equal(ui.isSessionActive(), false);
  assert.equal(env.elements.readingTestEntryModal.getAttribute('aria-hidden'), 'false');
  assert.ok(env.warnings.some((args) => args.some((arg) => String(arg).includes('state-changed payload invalid'))));

  env.emitState({ active: true });
  assert.equal(ui.isSessionActive(), true);
  assert.equal(env.elements.readingTestEntryModal.getAttribute('aria-hidden'), 'true');
});

test('invalid initial reading-test state preserves an observed active session and is diagnosed', async () => {
  for (const invalidState of [null, [], {}, { active: null }, { active: 0 }]) {
    let resolveState;
    const env = createReadingTestEnvironment({
      getState: () => new Promise((resolve) => { resolveState = resolve; }),
    });
    const ui = env.window.ReadingSpeedTestUi;
    ui.configure();
    env.emitState({ active: true });
    resolveState(invalidState);
    await flushReadingTestWork();
    assert.equal(ui.isSessionActive(), true);
    assert.equal(ui.isInteractionLocked(), true);
    assert.ok(env.warnings.some((args) => args.some((arg) => String(arg).includes('initial session state'))));
  }
});

test('invalid initial truthy state preserves inactivity and valid snapshots remain effective', async () => {
  for (const [initialState, expectedActive] of [
    [{ active: 'false' }, false],
    [{ active: true }, true],
    [{ active: false }, false],
  ]) {
    const env = createReadingTestEnvironment({ getState: async () => initialState });
    const ui = env.window.ReadingSpeedTestUi;
    ui.configure();
    await flushReadingTestWork();
    assert.equal(ui.isSessionActive(), expectedActive);
    assert.equal(ui.isInteractionLocked(), expectedActive);
    assert.equal(env.warnings.length, typeof initialState.active === 'boolean' ? 0 : 1);
  }
});

for (const registration of ['missing', 'throws']) {
  test(`reading-test ${registration} subscription prevents entry and both start actions`, async () => {
    const env = createReadingTestEnvironment({ registration });
    const ui = env.window.ReadingSpeedTestUi;
    ui.configure();
    assert.equal(ui.isInteractionLocked(), false);
    await flushReadingTestWork();
    assert.equal(ui.isInteractionLocked(), false);
    await ui.openEntryFlow();
    env.elements.readingTestEntryModalStart.dispatch('click');
    env.elements.readingTestEntryModalStartCurrentText.dispatch('click');
    await flushReadingTestWork();
    assert.deepEqual(env.starts, []);
    assert.deepEqual(env.notices, ['renderer.reading_test.alerts.unavailable']);
    assert.ok(env.warnings.some((args) => args.some((arg) => String(arg).includes('onReadingTestStateChanged'))));
  });
}

test('failed subscription leaves Main unlocked when the initial session state is unknown', async () => {
  for (const getState of [
    async () => ({}),
    async () => { throw new Error('state unavailable'); },
    () => new Promise(() => {}),
  ]) {
    const env = createReadingTestEnvironment({ registration: 'missing', getState });
    const ui = env.window.ReadingSpeedTestUi;
    ui.configure();
    await flushReadingTestWork();
    assert.equal(ui.isSessionActive(), false);
    assert.equal(ui.isInteractionLocked(), false);
    ui.applyTranslations();
    assert.deepEqual(env.notices, []);
    await ui.openEntryFlow();
    assert.deepEqual(env.notices, ['renderer.reading_test.alerts.unavailable']);
    assert.deepEqual(env.starts, []);
  }
  const missingQuery = createReadingTestEnvironment({ registration: 'missing' });
  delete missingQuery.window.electronAPI.getReadingTestState;
  missingQuery.window.ReadingSpeedTestUi.configure();
  await flushReadingTestWork();
  assert.equal(missingQuery.window.ReadingSpeedTestUi.isInteractionLocked(), false);
});

test('failed subscription locks Main when an active initial session is observed', async () => {
  const env = createReadingTestEnvironment({
    registration: 'missing',
    getState: async () => ({ active: true }),
  });
  const ui = env.window.ReadingSpeedTestUi;
  ui.configure();
  await flushReadingTestWork();
  assert.equal(ui.isSessionActive(), true);
  assert.equal(ui.isInteractionLocked(), true);
  ui.applyTranslations();
  assert.deepEqual(env.notices, []);
  await ui.openEntryFlow();
  assert.deepEqual(env.starts, []);
});

test('a failed partial registration cannot release an observed active session using an older snapshot', async () => {
  let resolveState;
  const env = createReadingTestEnvironment({
    registration: 'throws',
    getState: () => new Promise((resolve) => { resolveState = resolve; }),
  });
  const ui = env.window.ReadingSpeedTestUi;
  ui.configure();
  assert.equal(ui.isInteractionLocked(), false);
  env.emitState({ active: true });
  assert.equal(ui.isInteractionLocked(), true);
  resolveState({ active: false });
  await flushReadingTestWork();
  env.emitState({ active: false });
  assert.equal(ui.isInteractionLocked(), true);
});
