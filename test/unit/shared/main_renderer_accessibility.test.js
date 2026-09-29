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

function createMockElement(id = '', onFocus = null) {
  const attributes = {};
  const listeners = new Map();
  const children = [];
  const element = {
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
    dispatch(type, event = {}) {
      const safeEvent = { target: this, ...event };
      (listeners.get(type) || []).forEach((listener) => listener(safeEvent));
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
  if (typeof onFocus === 'function') {
    element.focus = (...args) => onFocus({ args, id });
  }
  return element;
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

async function createRendererHarness({
  currentTextRuntimeOverrides = {},
  deferStartupReady = false,
  electronMethodOverrides = {},
  expectStartupError = false,
  focusCalls = null,
  loadLocalizedDocument = null,
  browserExtensionModalOverrides = {},
  mainLogoLinksAvailable = true,
  mainLogoLinksOverride = null,
  statusUiOverrides = {},
  transitionFailureLanguage = '',
  transitionFailure = null,
} = {}) {
  const createElement = Array.isArray(focusCalls)
    ? (id = '') => createMockElement(id, (focusCall) => focusCalls.push(focusCall))
    : createMockElement;
  let activeLanguage = 'en';
  const errors = [];
  const notifications = [];
  const pendingStates = [];
  const subscriptions = {};
  const currentTextRuntimeCalls = {
    bootstrapStates: [],
    copiedProcessingStates: [],
    currentTextSubscriptionArmedAtBootstrapSync: null,
    processingStates: [],
    terminalPresentationUnavailableCount: 0,
    textUpdates: [],
  };
  const statusUiCalls = {
    currentTextProcessingStates: [],
    processingModeStates: [],
  };
  const textApplyCalls = [];
  let selectorActions = null;
  const activeCustomPromptTranslationRefreshCounts = new Map([
    'SnapshotSaveTagsModal',
    'TextExtractionApplyModal',
    'TextExtractionBatchFinalModal',
    'TextExtractionBatchPlanningModal',
    'TextExtractionOcrActivationDisclosureModal',
    'TextExtractionPdfOptionsModal',
    'TextExtractionRouteChoiceModal',
    'TextExtractionSingleFileHeavyPdfModal',
  ].map((owner) => [owner, 0]));
  const infoModalLinkCalls = {
    boundContents: [],
    enhancedContents: [],
  };
  const menuActionHandlers = new Map();

  const recordActiveCustomPromptTranslationRefresh = (owner) => {
    activeCustomPromptTranslationRefreshCounts.set(
      owner,
      activeCustomPromptTranslationRefreshCounts.get(owner) + 1
    );
  };

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
    activeElement: null,
    createElement,
    getElementById: getElement,
    querySelector(selector) { return queryElements.get(selector) || null; },
  };
  document.activeElement = document.body;

  const infoModal = getElement('infoModal');
  const infoModalContent = getElement('infoModalContent');
  const infoModalClose = getElement('infoModalClose');
  const infoModalPanel = createElement('infoModalPanel');
  const infoContentFocusTarget = createElement('infoContentFocusTarget');
  infoModalPanel.scrollTop = 0;
  infoModal.querySelector = (selector) => (selector === '.info-modal-panel' ? infoModalPanel : null);
  infoModalContent.contains = (node) => node === infoContentFocusTarget;
  if (Array.isArray(focusCalls)) {
    const focusInfoModalClose = infoModalClose.focus;
    infoModalClose.focus = (...args) => {
      focusInfoModalClose(...args);
      infoModalClose.focusCount = (infoModalClose.focusCount || 0) + 1;
      document.activeElement = infoModalClose;
    };
  } else {
    infoModalClose.focus = () => {
      infoModalClose.focusCount = (infoModalClose.focusCount || 0) + 1;
      document.activeElement = infoModalClose;
    };
  }

  const logger = {
    debug() {},
    error(...args) { errors.push(args); },
    errorOnce(...args) { errors.push(args); },
    warn() {},
    warnOnce() {},
  };
  const statusUi = createNoopSurface({
    applyCurrentTextProcessingState(state) {
      statusUiCalls.currentTextProcessingStates.push(state);
    },
    applyProcessingModeState(state) {
      statusUiCalls.processingModeStates.push(state);
    },
    getAbortButton() { return null; },
    isAbortFinalizationActive() { return false; },
    isCurrentTextAreaPendingActive() { return false; },
    isCurrentTextProcessingActive() { return false; },
    isProcessingModeActive() { return false; },
    isStandaloneFullRefreshPendingActive() { return false; },
    ...statusUiOverrides,
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
  const presetComboboxUpdates = [];
  let presetCreatedCalls = 0;
  const presetsCombobox = createNoopSurface({
    getValue() { return ''; },
    update(options) {
      presetComboboxUpdates.push({
        hostHidden: getElement('presets').hidden,
        options,
      });
    },
  });
  const wpmControls = createNoopSurface({
    getAllPresets() { return []; },
    getWpm() { return 200; },
    async handlePresetCreated() {
      presetCreatedCalls += 1;
      return { selectionOutcome: null };
    },
    async loadPresets() { return { selectionOutcome: null }; },
  });
  const currentTextRuntime = createNoopSurface({
    applyCurrentTextProcessingState(state, options) {
      currentTextRuntimeCalls.processingStates.push({
        state: { ...state },
        options: { ...options },
      });
    },
    copyCurrentTextProcessingState(state) {
      currentTextRuntimeCalls.copiedProcessingStates.push(state);
      return { ...state };
    },
    getCurrentText() { return ''; },
    handleCurrentTextUpdated(payload, options) {
      currentTextRuntimeCalls.textUpdates.push({
        payload: { ...payload },
        options: { ...options },
      });
    },
    setTerminalPresentationUnavailable() {
      currentTextRuntimeCalls.terminalPresentationUnavailableCount += 1;
    },
    syncBootstrapState(state) {
      currentTextRuntimeCalls.bootstrapStates.push({
        initialText: state.initialText,
        processingState: { ...state.processingState },
      });
      currentTextRuntimeCalls.currentTextSubscriptionArmedAtBootstrapSync = (
        typeof subscriptions.currentTextUpdated === 'function'
      );
    },
    ...currentTextRuntimeOverrides,
  });
  const textApplyCanonical = createNoopSurface({
    async applyTextWithMode(payload) {
      textApplyCalls.push(payload);
      return { ok: true, truncated: false };
    },
  });
  const infoModalLinks = createNoopSurface({
    bindInfoModalLinks(container) {
      infoModalLinkCalls.boundContents.push(container.innerHTML);
    },
    enhanceInfoModalScreenshots(container) {
      infoModalLinkCalls.enhancedContents.push(container.innerHTML);
    },
  });
  const browserExtensionModal = createNoopSurface({
    hasBlockingModalOpen() { return false; },
    ...browserExtensionModalOverrides,
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
    onEditorFirstShowState(callback) { subscriptions.editorFirstShowState = callback; },
    onCurrentTextProcessingStateChanged(callback) {
      subscriptions.currentTextProcessingStateChanged = callback;
    },
    onTextExtractionProcessingModeChanged(callback) {
      subscriptions.textExtractionProcessingModeChanged = callback;
    },
    onCurrentTextUpdated(callback) { subscriptions.currentTextUpdated = callback; },
    onPresetCreated(callback) { subscriptions.presetCreated = callback; },
    onSettingsChanged(callback) { subscriptions.settingsChanged = callback; },
    onPreciseCountingFallback(callback) { subscriptions.preciseCountingFallback = callback; },
    onStartupReady(callback) { subscriptions.startupReady = callback; },
    async openEditor() { return { ok: true, launchDisposition: 'first-show-pending' }; },
    resolveCurrentTextProcessing() {},
    reportRendererI18nFailure() {},
    sendStartupRendererCoreReady() {
      currentTextRuntimeCalls.currentTextSubscriptionArmedAtRendererCoreReady = (
        typeof subscriptions.currentTextUpdated === 'function'
      );
    },
    sendStartupSplashRemoved() {},
    ...electronMethodOverrides,
  };
  const electronAPI = new Proxy(electronMethods, {
    get(target, property) {
      if (Object.prototype.hasOwnProperty.call(target, property)) return target[property];
      return () => undefined;
    },
  });

  const rendererI18n = {
    getLanguageDirection(language) { return String(language || '').startsWith('ar') ? 'rtl' : 'ltr'; },
    getRendererValue(key) { return readRendererValue(activeLanguage, key); },
    async loadLocalizedDocument(documentId, language) {
      if (typeof loadLocalizedDocument === 'function') {
        return loadLocalizedDocument(documentId, language);
      }
      return { html: null, language: '' };
    },
    async transitionRendererTranslations(language, { applyTranslations } = {}) {
      if (language === transitionFailureLanguage) {
        throw transitionFailure || new Error(`Cannot prepare ${language} translations`);
      }
      activeLanguage = language;
      if (typeof applyTranslations === 'function') await applyTranslations({ language, restoring: false });
    },
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
    BrowserExtensionModal: browserExtensionModal,
    CountUtils: {
      contarTexto() { return { palabras: 0, caracteres: 0, caracteresSinEspacios: 0 }; },
      isPreciseCountFailure() { return false; },
    },
    CurrentTextRefreshPolicy: {
      createController() { return createNoopSurface(); },
    },
    CurrentTextRuntime: currentTextRuntime,
    CurrentTextSelectorSection: currentTextSelectorSection,
    CurrentTextSnapshots: createNoopSurface(),
    FormatUtils: {
      formatearNumero(value) { return String(value); },
      obtenerSeparadoresDeNumeros() { return { decimal: '.', group: ',' }; },
    },
    InfoModalLinks: infoModalLinks,
    MainLogoLinks: mainLogoLinksAvailable
      ? (mainLogoLinksOverride || createNoopSurface())
      : null,
    Notify: createNoopSurface({
      activateModalFocus(_modal, { initialFocus }) {
        initialFocus.focus({ preventScroll: true });
      },
      deactivateModalFocus() {},
      notifyMain(key) { notifications.push(key); },
      toastMain(key) { notifications.push(key); },
    }),
    ReadingSpeedTestUi: readingSpeedTestUi,
    RendererCombobox: { create() { return presetsCombobox; } },
    RendererCrono: { createController() { return null; } },
    RendererI18n: rendererI18n,
    ResultsTimeMultiplier: createNoopSurface(),
    SnapshotSaveTagsModal: {
      applyTranslations() { recordActiveCustomPromptTranslationRefresh('SnapshotSaveTagsModal'); },
    },
    TextApplyCanonical: textApplyCanonical,
    TextExtractionApplyModal: {
      applyTranslations() { recordActiveCustomPromptTranslationRefresh('TextExtractionApplyModal'); },
    },
    TextExtractionBatchFinalModal: {
      applyTranslations() { recordActiveCustomPromptTranslationRefresh('TextExtractionBatchFinalModal'); },
    },
    TextExtractionBatchFlow: createNoopSurface(),
    TextExtractionBatchPlanningModal: {
      applyTranslations() { recordActiveCustomPromptTranslationRefresh('TextExtractionBatchPlanningModal'); },
    },
    TextExtractionDragDrop: createNoopSurface(),
    TextExtractionEntry: createNoopSurface(),
    TextExtractionOcrActivationDisclosureModal: {
      applyTranslations() { recordActiveCustomPromptTranslationRefresh('TextExtractionOcrActivationDisclosureModal'); },
    },
    TextExtractionOcrActivation: createNoopSurface(),
    TextExtractionOcrActivationFlow: createNoopSurface(),
    TextExtractionOcrActivationRecovery: createNoopSurface(),
    TextExtractionOcrDisconnect: createNoopSurface(),
    TextExtractionPdfOptionsModal: {
      applyTranslations() { recordActiveCustomPromptTranslationRefresh('TextExtractionPdfOptionsModal'); },
    },
    TextExtractionRouteChoiceModal: {
      applyTranslations() { recordActiveCustomPromptTranslationRefresh('TextExtractionRouteChoiceModal'); },
    },
    TextExtractionSingleFileHeavyPdfModal: {
      applyTranslations() { recordActiveCustomPromptTranslationRefresh('TextExtractionSingleFileHeavyPdfModal'); },
    },
    TextExtractionStatusUi: statusUi,
    TextTimeCalculatorLauncher: createNoopSurface(),
    WpmControls: { createController() { return wpmControls; } },
    addEventListener() {},
    electronAPI,
    getLogger() { return logger; },
    menuActions: {
      registerMenuAction(actionId, handler) {
        menuActionHandlers.set(actionId, handler);
      },
    },
    requestAnimationFrame(callback) { callback(); },
  };

  const sandbox = {
    clearTimeout,
    console,
    DOMParser: class DOMParser {
      parseFromString(html) {
        return {
          body: { innerHTML: String(html || '') },
          querySelectorAll() { return []; },
        };
      }
    },
    document,
    fetch: async () => ({ ok: true, text: async () => '' }),
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    window,
  };
  vm.createContext(sandbox);
  const infoModalSource = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/info_modal.js'),
    'utf8'
  );
  vm.runInContext(infoModalSource, sandbox, { filename: 'public/js/info_modal.js' });
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/renderer.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/renderer.js' });

  assert.equal(typeof subscriptions.startupReady, 'function');
  const completeStartupReady = async () => {
    subscriptions.startupReady();
    for (let index = 0; index < 4; index += 1) await flushAsyncWork();
  };

  if (!deferStartupReady) {
    await completeStartupReady();
  }

  if (!expectStartupError) {
    assert.ok(selectorActions, 'main renderer did not register selector actions');
    assert.equal(errors.length, 0, `main renderer logged initialization errors: ${String(errors[0] || '')}`);
  }

  return {
    currentTextRuntimeCalls,
    statusUiCalls,
    elements,
    errors,
    getActiveCustomPromptTranslationRefreshCounts() {
      return Object.fromEntries(activeCustomPromptTranslationRefreshCounts);
    },
    getInfoModalLinkCalls() {
      return {
        boundContents: infoModalLinkCalls.boundContents.slice(),
        enhancedContents: infoModalLinkCalls.enhancedContents.slice(),
      };
    },
    infoModalPanel,
    invokeMenuAction(actionId) {
      const handler = menuActionHandlers.get(actionId);
      assert.ok(handler, `main renderer did not register ${actionId}`);
      return handler();
    },
    pendingStates,
    presetComboboxUpdates,
    getPresetCreatedCalls() {
      return presetCreatedCalls;
    },
    completeStartupReady,
    preciseLabel,
    preciseWrapper,
    selectorActions,
    setInfoContentFocus() {
      document.activeElement = infoContentFocusTarget;
    },
    subscriptions,
    notifications,
    textApplyCalls,
    getElement,
  };
}

test('Main startup has no programmatic initial DOM focus', async () => {
  const focusCalls = [];

  await createRendererHarness({ focusCalls });

  assert.deepEqual(focusCalls, []);
});

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

test('main renderer keeps the Precise toggle disabled while persistence is pending and a global lock is active', async () => {
  let processingActive = false;
  let resolveModePersistence = null;
  const modePersistence = new Promise((resolve) => {
    resolveModePersistence = resolve;
  });
  const harness = await createRendererHarness({
    statusUiOverrides: {
      isProcessingModeActive() { return processingActive; },
    },
    electronMethodOverrides: {
      setModeConteo() { return modePersistence; },
    },
  });
  const toggle = harness.getElement('toggleModoPreciso');

  toggle.checked = false;
  toggle.dispatch('change');
  await flushAsyncWork();

  assert.equal(toggle.checked, true);
  assert.equal(toggle.getAttribute('aria-checked'), 'true');
  assert.equal(toggle.disabled, true);
  assert.equal(toggle.getAttribute('aria-disabled'), 'true');

  processingActive = true;
  harness.subscriptions.textExtractionProcessingModeChanged({ active: true });
  assert.equal(toggle.disabled, true);
  assert.equal(toggle.getAttribute('aria-disabled'), 'true');

  resolveModePersistence({ ok: true, mode: 'simple' });
  await flushAsyncWork();

  assert.equal(toggle.disabled, true);
  assert.equal(toggle.getAttribute('aria-disabled'), 'true');

  processingActive = false;
  harness.subscriptions.textExtractionProcessingModeChanged({ active: false });
  assert.equal(toggle.disabled, false);
  assert.equal(toggle.getAttribute('aria-disabled'), 'false');
});

test('main renderer applies independent settings after a recoverable language transition failure', async () => {
  const transitionFailure = new Error('Cannot prepare Spanish translations');
  transitionFailure.rendererI18nTransition = {
    hadEstablishedState: true,
    restorationFailed: false,
  };
  const harness = await createRendererHarness({
    transitionFailureLanguage: 'es',
    transitionFailure,
  });

  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'simple' });

  assert.equal(harness.preciseLabel.textContent, 'Precise mode');
  assert.equal(harness.getElement('toggleModoPreciso').checked, false);
  assert.equal(harness.errors.length, 1);
});

test('main renderer does not admit later settings semantics after a terminal language failure', async () => {
  const transitionFailure = new Error('Cannot restore renderer translations');
  transitionFailure.rendererI18nTransition = {
    hadEstablishedState: true,
    restorationFailed: true,
  };
  const harness = await createRendererHarness({
    transitionFailureLanguage: 'es',
    transitionFailure,
  });

  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'simple' });
  await harness.subscriptions.settingsChanged({ language: 'en', modeConteo: 'simple' });
  await harness.subscriptions.presetCreated({ name: 'Ignored after terminal failure' });

  assert.equal(harness.getElement('toggleModoPreciso').checked, true);
  assert.equal(harness.getPresetCreatedCalls(), 0);
});

test('main renderer withdraws brand-logo action admission after terminal i18n failure', async () => {
  let canAcceptBrandLinkAction = null;
  const transitionFailure = new Error('Cannot restore renderer translations');
  transitionFailure.rendererI18nTransition = {
    hadEstablishedState: true,
    restorationFailed: true,
  };
  const harness = await createRendererHarness({
    mainLogoLinksOverride: {
      applyTranslations() {},
      bindBrandLinks(options) {
        canAcceptBrandLinkAction = options.canAcceptBrandLinkAction;
      },
    },
    transitionFailureLanguage: 'es',
    transitionFailure,
  });

  assert.equal(typeof canAcceptBrandLinkAction, 'function');
  assert.equal(canAcceptBrandLinkAction(), true);

  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'preciso' });

  assert.equal(canAcceptBrandLinkAction(), false);
});

test('main renderer locks brand-logo controls when their optional owner is unavailable', async () => {
  const harness = await createRendererHarness({ mainLogoLinksAvailable: false });

  assert.equal(harness.getElement('devLogoLink').disabled, true);
  assert.equal(harness.getElement('devLogoLink').getAttribute('aria-disabled'), 'true');
  assert.equal(harness.getElement('kofiLogoLink').disabled, true);
  assert.equal(harness.getElement('kofiLogoLink').getAttribute('aria-disabled'), 'true');
  assert.equal(harness.errors.length, 0);
});

test('main renderer retains Runtime state and matching-text ingestion after terminal i18n failure', async () => {
  const transitionFailure = new Error('Cannot restore renderer translations');
  transitionFailure.rendererI18nTransition = {
    hadEstablishedState: true,
    restorationFailed: true,
  };
  const harness = await createRendererHarness({
    transitionFailureLanguage: 'es',
    transitionFailure,
  });
  const processingStateCount = harness.statusUiCalls.processingModeStates.length;
  const currentTextStateCount = harness.statusUiCalls.currentTextProcessingStates.length;
  const runtimeStateCount = harness.currentTextRuntimeCalls.processingStates.length;
  const runtimeTextUpdateCount = harness.currentTextRuntimeCalls.textUpdates.length;

  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'preciso' });
  harness.subscriptions.textExtractionProcessingModeChanged({
    active: true,
    lockId: 42,
    sinceEpochMs: 4200,
  });
  harness.subscriptions.currentTextProcessingStateChanged({
    active: true,
    requestId: 42,
    sinceEpochMs: 4200,
  });
  harness.subscriptions.currentTextUpdated({
    text: 'authoritative terminal text',
    requestId: 42,
  });

  assert.equal(harness.currentTextRuntimeCalls.terminalPresentationUnavailableCount, 1);
  assert.equal(harness.statusUiCalls.processingModeStates.length, processingStateCount + 1);
  assert.equal(harness.statusUiCalls.currentTextProcessingStates.length, currentTextStateCount + 1);
  assert.equal(harness.currentTextRuntimeCalls.processingStates.length, runtimeStateCount + 1);
  assert.equal(harness.currentTextRuntimeCalls.textUpdates.length, runtimeTextUpdateCount + 1);
  assert.equal(harness.statusUiCalls.processingModeStates.at(-1).lockId, 42);
  assert.equal(harness.statusUiCalls.currentTextProcessingStates.at(-1).requestId, 42);
  assert.equal(harness.currentTextRuntimeCalls.processingStates.at(-1).state.requestId, 42);
  assert.equal(harness.currentTextRuntimeCalls.textUpdates.at(-1).payload.requestId, 42);
  assert.equal(harness.currentTextRuntimeCalls.textUpdates.at(-1).payload.text, 'authoritative terminal text');
});

test('main renderer admits brand-logo actions only after READY', async () => {
  let canAcceptBrandLinkAction = null;
  const harness = await createRendererHarness({
    deferStartupReady: true,
    mainLogoLinksOverride: {
      applyTranslations() {},
      bindBrandLinks(options) {
        canAcceptBrandLinkAction = options.canAcceptBrandLinkAction;
      },
    },
  });

  assert.equal(typeof canAcceptBrandLinkAction, 'function');
  assert.equal(canAcceptBrandLinkAction(), false);

  await harness.completeStartupReady();

  assert.equal(canAcceptBrandLinkAction(), true);
});

test('speed presets become visible with their localized accessible name after startup translation', async () => {
  const harness = await createRendererHarness();
  const ariaUpdate = harness.presetComboboxUpdates.find(
    (update) => Object.prototype.hasOwnProperty.call(update.options, 'ariaLabel')
  );

  assert.equal(ariaUpdate && ariaUpdate.hostHidden, true);
  assert.equal(harness.getElement('presets').hidden, false);
  assert.equal(
    ariaUpdate && ariaUpdate.options.ariaLabel,
    readRendererValue('en', 'renderer.main.aria.speed_presets')
  );
});

test('main renderer delegates language refresh to each feature-owned active custom prompt', async () => {
  const harness = await createRendererHarness();
  const before = harness.getActiveCustomPromptTranslationRefreshCounts();

  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'preciso' });

  const after = harness.getActiveCustomPromptTranslationRefreshCounts();
  assert.deepEqual(
    Object.fromEntries(Object.keys(before).map((owner) => [owner, after[owner] - before[owner]])),
    Object.fromEntries(Object.keys(before).map((owner) => [owner, 1]))
  );
  assert.equal(harness.errors.length, 0);
});

test('main renderer keeps the optional Browser Extension capability unavailable after translation failure', async () => {
  const interactionLocks = [];
  const harness = await createRendererHarness({
    browserExtensionModalOverrides: {
      applyTranslations() {
        throw new Error('extension translation failure');
      },
      setInteractionLocked(value) {
        interactionLocks.push(value);
      },
    },
  });

  assert.equal(interactionLocks.at(-1), true);
  assert.equal(harness.getElement('browserExtensionLogoLink').disabled, false);
  assert.equal(harness.errors.length, 0);
});

test('open Info Modal refresh uses the effective document language and preserves modal state safely', async () => {
  const documentRequests = [];
  const harness = await createRendererHarness({
    async loadLocalizedDocument(_documentId, language) {
      documentRequests.push(language);
      if (language === 'es') {
        return { html: '<article>Fallback English instructions</article>', language: 'en' };
      }
      return { html: '<article>English instructions</article>', language: 'en' };
    },
  });

  harness.invokeMenuAction('instrucciones_completas');
  for (let index = 0; index < 3; index += 1) await flushAsyncWork();

  const infoModal = harness.getElement('infoModal');
  const infoModalContent = harness.getElement('infoModalContent');
  const infoModalClose = harness.getElement('infoModalClose');
  assert.equal(infoModal.getAttribute('aria-hidden'), 'false');
  assert.equal(infoModalContent.getAttribute('lang'), 'en');

  harness.infoModalPanel.scrollTop = 37;
  harness.setInfoContentFocus();
  const focusBeforeRefresh = infoModalClose.focusCount;
  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'preciso' });
  for (let index = 0; index < 3; index += 1) await flushAsyncWork();

  assert.deepEqual(documentRequests, ['en', 'es']);
  assert.equal(infoModal.getAttribute('aria-hidden'), 'false');
  assert.equal(infoModalContent.innerHTML, '<article>Fallback English instructions</article>');
  assert.equal(infoModalContent.getAttribute('lang'), 'en');
  assert.equal(infoModalContent.getAttribute('dir'), 'ltr');
  assert.equal(harness.infoModalPanel.scrollTop, 37);
  assert.equal(infoModalClose.focusCount, focusBeforeRefresh + 1);
  assert.equal(harness.errors.length, 0);
});

test('main renderer enhances and binds Info Modal content after each completed render', async () => {
  const harness = await createRendererHarness({
    async loadLocalizedDocument(_documentId, language) {
      return {
        html: `<article><figure class="instrucciones-media"><img src="${language}.png"></figure></article>`,
        language,
      };
    },
  });

  harness.invokeMenuAction('instrucciones_completas');
  for (let index = 0; index < 3; index += 1) await flushAsyncWork();

  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'preciso' });
  for (let index = 0; index < 3; index += 1) await flushAsyncWork();

  harness.getElement('infoModalClose').dispatch('click');
  harness.invokeMenuAction('instrucciones_completas');
  for (let index = 0; index < 3; index += 1) await flushAsyncWork();

  const renderedContents = [
    '<article><figure class="instrucciones-media"><img src="en.png"></figure></article>',
    '<article><figure class="instrucciones-media"><img src="es.png"></figure></article>',
    '<article><figure class="instrucciones-media"><img src="es.png"></figure></article>',
  ];
  const infoModalLinkCalls = harness.getInfoModalLinkCalls();
  assert.deepEqual(infoModalLinkCalls.enhancedContents, renderedContents);
  assert.deepEqual(infoModalLinkCalls.boundContents, renderedContents);
  assert.equal(harness.errors.length, 0);
});

test('open Info Modal discards a stale localized-document refresh after a later language change', async () => {
  let resolveSpanishDocument;
  const harness = await createRendererHarness({
    async loadLocalizedDocument(_documentId, language) {
      if (language === 'es') {
        return new Promise((resolve) => {
          resolveSpanishDocument = resolve;
        });
      }
      return { html: `<article>${language} instructions</article>`, language };
    },
  });

  harness.invokeMenuAction('instrucciones_completas');
  for (let index = 0; index < 3; index += 1) await flushAsyncWork();

  await harness.subscriptions.settingsChanged({ language: 'es', modeConteo: 'preciso' });
  await flushAsyncWork();
  assert.equal(typeof resolveSpanishDocument, 'function');

  await harness.subscriptions.settingsChanged({ language: 'en', modeConteo: 'preciso' });
  for (let index = 0; index < 3; index += 1) await flushAsyncWork();
  resolveSpanishDocument({ html: '<article>stale Spanish instructions</article>', language: 'es' });
  for (let index = 0; index < 3; index += 1) await flushAsyncWork();

  const infoModalContent = harness.getElement('infoModalContent');
  assert.equal(infoModalContent.innerHTML, '<article>en instructions</article>');
  assert.equal(infoModalContent.getAttribute('lang'), 'en');
  assert.equal(harness.errors.length, 0);
});

test('main renderer delegates every supported Info menu action to the Info modal owner', async () => {
  const manualRequests = [];
  const harness = await createRendererHarness({
    async loadLocalizedDocument(_documentId, language) {
      manualRequests.push(language);
      return { html: `<article>${language} instructions</article>`, language };
    },
  });

  ['guia_basica', 'instrucciones_completas', 'faq', 'links_interes', 'acerca_de'].forEach((actionId) => {
    harness.invokeMenuAction(actionId);
  });
  for (let index = 0; index < 4; index += 1) await flushAsyncWork();

  assert.deepEqual(manualRequests, ['en', 'en', 'en', 'en']);
  assert.equal(harness.getElement('infoModal').getAttribute('aria-hidden'), 'false');
  assert.equal(harness.errors.length, 0);
});

test('main markup exposes precise-mode help only through the explicit description relationship', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../../../public/index.html'), 'utf8');

  assert.match(
    markup,
    /id="toggleModoPreciso"[^>]*aria-describedby="preciseModeDescription"/
  );
  assert.doesNotMatch(markup, /id="toggleModoPreciso"[^>]*\stitle=/);
  assert.match(markup, /id="preciseModeDescription"\s+class="main-accessible-description"/);
});

test('main markup reaches primary controls before the fixed brand-link actions', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../../../public/index.html'), 'utf8');
  const bodyStart = markup.indexOf('<body>');
  const appTitle = markup.indexOf('<h1 class="main-accessible-title">toT</h1>');
  const textExtractionAction = markup.indexOf('id="btnTextExtraction"');
  const textExtractionButtonStart = markup.lastIndexOf('<button', textExtractionAction);
  const browserExtensionLink = markup.indexOf('id="browserExtensionLogoLink"');

  assert.ok(bodyStart >= 0);
  assert.ok(appTitle > bodyStart);
  assert.ok(textExtractionAction > bodyStart);
  assert.ok(textExtractionButtonStart > bodyStart);
  assert.ok(browserExtensionLink > textExtractionAction);
  assert.match(markup, /<div\s+class="app-title"\s+aria-hidden="true"\s*>\s*<img\s+id="appLogo"[^>]*alt=""/);
  assert.doesNotMatch(
    markup.slice(bodyStart, textExtractionButtonStart),
    /<(?:a|button|input|select|textarea)\b/i
  );
  assert.doesNotMatch(markup.slice(bodyStart, textExtractionButtonStart), /\btabindex\s*=/i);
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
  assert.match(markup, /id="editorLoaderStatus"\s+class="main-accessible-description"/);
});

test('main renderer installs live current-text updates after the authoritative snapshot and before core readiness', async () => {
  const harness = await createRendererHarness();

  assert.deepEqual(harness.currentTextRuntimeCalls.bootstrapStates, [{
    initialText: '',
    processingState: { active: false, requestId: 0, sinceEpochMs: null, source: '', action: '' },
  }]);
  assert.equal(harness.currentTextRuntimeCalls.currentTextSubscriptionArmedAtBootstrapSync, false);
  assert.equal(harness.currentTextRuntimeCalls.currentTextSubscriptionArmedAtRendererCoreReady, true);
  assert.equal(typeof harness.subscriptions.currentTextUpdated, 'function');
});

test('main renderer aborts bootstrap instead of synthesizing current-text or processing state after required-query failures', async (t) => {
  const canonicalProcessingState = {
    active: false,
    requestId: 0,
    sinceEpochMs: null,
    source: '',
    action: '',
  };
  const cases = [
    {
      name: 'getCurrentText is unavailable',
      electronMethodOverrides: { getCurrentText: undefined },
    },
    {
      name: 'getCurrentText rejects',
      electronMethodOverrides: {
        async getCurrentText() {
          throw new Error('current text unavailable');
        },
      },
    },
    {
      name: 'getCurrentText returns a non-string',
      electronMethodOverrides: {
        async getCurrentText() { return false; },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns documented failure',
      expectedDiagnostic: 'getCurrentTextProcessingState failed: STATE_READ_FAILED',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() { return { ok: false, code: 'STATE_READ_FAILED' }; },
      },
    },
    {
      name: 'getCurrentTextProcessingState rejects',
      expectedDiagnostic: 'current text processing state unavailable',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() {
          throw new Error('current text processing state unavailable');
        },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns a malformed envelope',
      expectedDiagnostic: 'getCurrentTextProcessingState returned an invalid result envelope',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() { return null; },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns an array result',
      expectedDiagnostic: 'getCurrentTextProcessingState returned an invalid result envelope',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() { return []; },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns an envelope without ok',
      expectedDiagnostic: 'getCurrentTextProcessingState returned an invalid result envelope',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() { return {}; },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns an envelope with a non-boolean ok',
      expectedDiagnostic: 'getCurrentTextProcessingState returned an invalid result envelope',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() { return { ok: 'true' }; },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns a failed result without code',
      expectedDiagnostic: 'getCurrentTextProcessingState returned an invalid failed result',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() { return { ok: false }; },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns a failed result with an invalid code',
      expectedDiagnostic: 'getCurrentTextProcessingState returned an invalid failed result',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() { return { ok: false, code: 0 }; },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns a failed result with an empty code',
      expectedDiagnostic: 'getCurrentTextProcessingState returned an invalid failed result',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() { return { ok: false, code: '' }; },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns a successful result without state',
      expectedDiagnostic: 'getCurrentTextProcessingState returned an invalid successful result',
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() { return { ok: true }; },
      },
    },
    {
      name: 'getCurrentTextProcessingState returns an invalid state',
      currentTextRuntimeOverrides: {
        copyCurrentTextProcessingState() {
          throw new Error('processing state invalid');
        },
      },
      electronMethodOverrides: {
        async getCurrentText() { return 'authoritative text'; },
        async getCurrentTextProcessingState() {
          return { ok: true, state: canonicalProcessingState };
        },
      },
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const harness = await createRendererHarness({
        ...testCase,
        expectStartupError: true,
      });

      assert.equal(harness.currentTextRuntimeCalls.bootstrapStates.length, 0);
      assert.equal(harness.errors.length > 0, true);
      if (testCase.expectedDiagnostic) {
        assert.equal(harness.errors[0][1].message, testCase.expectedDiagnostic);
      }
    });
  }
});

test('main renderer accepts clipboard text only from an explicit successful envelope', async () => {
  const malformedHarness = await createRendererHarness({
    electronMethodOverrides: {
      async readClipboard() { return { ok: null, text: '' }; },
    },
  });

  await malformedHarness.selectorActions.onOverwriteClipboard();
  assert.equal(malformedHarness.textApplyCalls.length, 0);
  assert.deepEqual(malformedHarness.notifications, ['renderer.main.alerts.overwrite_clipboard_error']);
  assert.equal(malformedHarness.errors.length, 1);

  const canonicalHarness = await createRendererHarness({
    electronMethodOverrides: {
      async readClipboard() { return { ok: true, text: 'clipboard text' }; },
    },
  });

  await canonicalHarness.selectorActions.onOverwriteClipboard();
  assert.equal(canonicalHarness.textApplyCalls.length, 1);
  assert.equal(canonicalHarness.textApplyCalls[0].textToApply, 'clipboard text');
  assert.deepEqual(canonicalHarness.notifications, []);
  assert.equal(canonicalHarness.errors.length, 0);
});
