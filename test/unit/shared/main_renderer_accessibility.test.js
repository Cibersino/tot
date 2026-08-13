'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function readRendererValue(language, key) {
  const bundle = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, `../../../i18n/${language}/renderer.json`),
    'utf8'
  ));
  return key.split('.').reduce((value, segment) => value?.[segment], bundle);
}

function createClassList() {
  const names = new Set();
  return {
    add(...values) { values.forEach((value) => names.add(value)); },
    remove(...values) { values.forEach((value) => names.delete(value)); },
    contains(value) { return names.has(value); },
    toggle(value, force) {
      const enabled = typeof force === 'boolean' ? force : !names.has(value);
      if (enabled) names.add(value);
      else names.delete(value);
      return enabled;
    },
  };
}

function createElement(id = '') {
  const attributes = {};
  const listeners = new Map();
  const children = [];
  return {
    id,
    checked: false,
    classList: createClassList(),
    dataset: {},
    disabled: false,
    firstChild: null,
    hidden: false,
    innerHTML: '',
    parentNode: null,
    removed: false,
    style: { setProperty() {} },
    textContent: '',
    value: '',
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    closest() { return null; },
    focus() {},
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    remove() { this.removed = true; },
    removeAttribute(name) { delete attributes[name]; },
    setAttribute(name, value) { attributes[name] = String(value); },
  };
}

function createNoopSurface(overrides = {}) {
  const noOp = () => undefined;
  return new Proxy(overrides, {
    get(target, property) {
      if (Object.prototype.hasOwnProperty.call(target, property)) return target[property];
      return noOp;
    },
  });
}

async function createRendererHarness() {
  let activeLanguage = 'en';
  const errors = [];
  const pendingStates = [];
  const subscriptions = {};
  let selectorActions = null;

  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };

  const preciseWrapper = createElement('preciseWrapper');
  const preciseLabel = createElement('preciseLabel');
  preciseLabel.closest = (selector) => (selector === '.toggle-wrapper' ? preciseWrapper : null);
  const queryElements = new Map([
    ['.wpm-row span', createElement('wpmLabel')],
    ['.toggle-wrapper .toggle-label', preciseLabel],
    ['.realwpm', createElement('realWpmLabel')],
    ['.crono-controls', createElement('cronoControls')],
    ['.vf-switch-wrapper', createElement('floatingStopwatchGroup')],
  ]);

  const document = {
    body: createElement('body'),
    documentElement: createElement('documentElement'),
    createElement,
    getElementById: getElement,
    querySelector(selector) { return queryElements.get(selector) || null; },
  };

  const logger = {
    debug() {},
    error(...args) { errors.push(args); },
    errorOnce(...args) { errors.push(args); },
    warn() {},
    warnOnce() {},
  };
  const statusUi = createNoopSurface({
    getAbortButton() { return null; },
    isAbortFinalizationActive() { return false; },
    isCurrentTextAreaPendingActive() { return false; },
    isCurrentTextProcessingActive() { return false; },
    isProcessingModeActive() { return false; },
    isStandaloneFullRefreshPendingActive() { return false; },
  });
  const currentTextSelectorSection = createNoopSurface({
    bindActions(actions) { selectorActions = actions; },
    setEditorLaunchPending(value) { pendingStates.push(value); },
  });
  const readingSpeedTestUi = createNoopSurface({
    hasBlockingModalOpen() { return false; },
    isInteractionLocked() { return false; },
    isSessionActive() { return false; },
  });
  const presetsCombobox = createNoopSurface({
    getValue() { return ''; },
  });
  const wpmControls = createNoopSurface({
    getAllPresets() { return []; },
    getWpm() { return 200; },
    async loadPresets() { return { selectionOutcome: null }; },
  });

  const electronMethods = {
    async getAppConfig() { return {}; },
    async getCurrentText() { return ''; },
    async getCurrentTextProcessingState() {
      return {
        ok: true,
        state: { active: false, requestId: 0, sinceEpochMs: null, source: '', action: '' },
      };
    },
    async getSettings() { return { language: 'en', modeConteo: 'preciso' }; },
    async getTextExtractionProcessingMode() { return { ok: true, state: { active: false } }; },
    onEditorFirstShowState(callback) { subscriptions.editorFirstShowState = callback; },
    onSettingsChanged(callback) { subscriptions.settingsChanged = callback; },
    onStartupReady(callback) { subscriptions.startupReady = callback; },
    async openEditor() { return { ok: true, launchDisposition: 'first-show-pending' }; },
    resolveCurrentTextProcessing() {},
    sendStartupRendererCoreReady() {},
    sendStartupSplashRemoved() {},
  };
  const electronAPI = new Proxy(electronMethods, {
    get(target, property) {
      if (Object.prototype.hasOwnProperty.call(target, property)) return target[property];
      return () => undefined;
    },
  });

  const rendererI18n = {
    applyWindowLanguageAttributes() {},
    getRendererValue(key) { return readRendererValue(activeLanguage, key); },
    async loadRendererTranslations(language) { activeLanguage = language; },
    msgRenderer(key, params = {}) {
      return Object.entries(params).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        String(readRendererValue(activeLanguage, key) || key)
      );
    },
    tRenderer(key) { return readRendererValue(activeLanguage, key) || key; },
  };

  const window = {
    AppConstants: {
      DEFAULT_LANG: 'en',
      MAX_CLIPBOARD_REPEAT: 9999,
      MAX_TEXT_CHARS: 100000,
      applyConfig() { return 100000; },
    },
    BrowserExtensionModal: createNoopSurface({ hasBlockingModalOpen() { return false; } }),
    CountUtils: { contarTexto() { return { palabras: 0, caracteres: 0, caracteresSinEspacios: 0 }; } },
    CurrentTextRefreshPolicy: {
      createController() { return createNoopSurface(); },
    },
    CurrentTextRuntime: createNoopSurface({ getCurrentText() { return ''; } }),
    CurrentTextSelectorSection: currentTextSelectorSection,
    CurrentTextSnapshots: createNoopSurface(),
    FormatUtils: {
      formatearNumero(value) { return String(value); },
      obtenerSeparadoresDeNumeros() { return { decimal: '.', group: ',' }; },
    },
    InfoModalLinks: createNoopSurface(),
    MainLogoLinks: createNoopSurface(),
    Notify: createNoopSurface(),
    ReadingSpeedTestUi: readingSpeedTestUi,
    RendererCombobox: { create() { return presetsCombobox; } },
    RendererCrono: { createController() { return null; } },
    RendererI18n: rendererI18n,
    ResultsTimeMultiplier: createNoopSurface(),
    TextApplyCanonical: createNoopSurface(),
    TextExtractionBatchFlow: createNoopSurface(),
    TextExtractionDragDrop: createNoopSurface(),
    TextExtractionEntry: createNoopSurface(),
    TextExtractionOcrActivation: createNoopSurface(),
    TextExtractionOcrActivationFlow: createNoopSurface(),
    TextExtractionOcrActivationRecovery: createNoopSurface(),
    TextExtractionOcrDisconnect: createNoopSurface(),
    TextExtractionStatusUi: statusUi,
    TextTimeCalculatorLauncher: createNoopSurface(),
    WpmControls: { createController() { return wpmControls; } },
    addEventListener() {},
    electronAPI,
    getLogger() { return logger; },
    menuActions: createNoopSurface(),
    requestAnimationFrame(callback) { callback(); },
  };

  const sandbox = {
    clearTimeout,
    console,
    document,
    fetch: async () => ({ ok: true, text: async () => '' }),
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    window,
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/renderer.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/renderer.js' });

  assert.equal(typeof subscriptions.startupReady, 'function');
  subscriptions.startupReady();
  for (let index = 0; index < 4; index += 1) await flushAsyncWork();

  assert.ok(selectorActions, 'main renderer did not register selector actions');
  assert.equal(errors.length, 0, `main renderer logged initialization errors: ${String(errors[0] || '')}`);

  return {
    elements,
    errors,
    pendingStates,
    preciseLabel,
    preciseWrapper,
    selectorActions,
    subscriptions,
    getElement,
  };
}

test('main renderer settings lifecycle updates precise-mode description and visual help together', async () => {
  const harness = await createRendererHarness();
  const description = harness.getElement('preciseModeDescription');

  assert.equal(harness.preciseLabel.textContent, 'Precise mode');
  assert.equal(description.textContent, 'Based on Intl.Segmenter');
  assert.equal(harness.preciseWrapper.getAttribute('data-tot-tooltip'), 'Based on Intl.Segmenter');
  assert.equal(harness.preciseLabel.getAttribute('aria-label'), null);

  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'preciso' });

  assert.equal(harness.preciseLabel.textContent, 'Modo preciso');
  assert.equal(description.textContent, 'Basado en Intl.Segmenter');
  assert.equal(harness.preciseWrapper.getAttribute('data-tot-tooltip'), 'Basado en Intl.Segmenter');
  assert.equal(harness.preciseLabel.getAttribute('aria-label'), null);
  assert.equal(harness.errors.length, 0);
});

test('main markup exposes precise-mode help only through the explicit description relationship', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../../../public/index.html'), 'utf8');

  assert.match(
    markup,
    /id="toggleModoPreciso"[^>]*aria-describedby="preciseModeDescription"/
  );
  assert.doesNotMatch(markup, /id="toggleModoPreciso"[^>]*\stitle=/);
  assert.match(markup, /id="preciseModeDescription" class="main-accessible-description"/);
});

test('Editor launch lifecycle exposes, retranslates, and clears real live-region status text', async () => {
  const harness = await createRendererHarness();
  const editorLoader = harness.getElement('editorLoader');
  const editorLoaderStatus = harness.getElement('editorLoaderStatus');

  await harness.selectorActions.onOpenEditor();
  assert.equal(editorLoaderStatus.textContent, 'Loading Text Editor...');
  assert.equal(editorLoader.classList.contains('visible'), true);
  assert.deepEqual(harness.pendingStates, [true]);

  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'preciso' });
  assert.equal(editorLoaderStatus.textContent, 'Cargando Editor de Texto...');

  harness.subscriptions.editorFirstShowState({ state: 'ready' });
  assert.equal(editorLoaderStatus.textContent, '');
  assert.equal(editorLoader.classList.contains('visible'), false);
  assert.deepEqual(harness.pendingStates, [true, false]);
  assert.equal(harness.errors.length, 0);

  const markup = fs.readFileSync(path.resolve(__dirname, '../../../public/index.html'), 'utf8');
  assert.match(markup, /id="editorLoader"[^>]*aria-live="polite"/);
  assert.match(markup, /id="editorLoaderStatus" class="main-accessible-description"/);
});
