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

async function createRendererHarness({ loadLocalizedDocument = null } = {}) {
  let activeLanguage = 'en';
  const errors = [];
  const pendingStates = [];
  const subscriptions = {};
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
  infoModalClose.focus = () => {
    infoModalClose.focusCount = (infoModalClose.focusCount || 0) + 1;
    document.activeElement = infoModalClose;
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
  const presetComboboxUpdates = [];
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
    async loadPresets() { return { selectionOutcome: null }; },
  });
  const infoModalLinks = createNoopSurface({
    bindInfoModalLinks(container) {
      infoModalLinkCalls.boundContents.push(container.innerHTML);
    },
    enhanceInfoModalScreenshots(container) {
      infoModalLinkCalls.enhancedContents.push(container.innerHTML);
    },
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
    getLanguageDirection(language) { return String(language || '').startsWith('ar') ? 'rtl' : 'ltr'; },
    getRendererValue(key) { return readRendererValue(activeLanguage, key); },
    async loadLocalizedDocument(documentId, language) {
      if (typeof loadLocalizedDocument === 'function') {
        return loadLocalizedDocument(documentId, language);
      }
      return { html: null, language: '' };
    },
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
    InfoModalLinks: infoModalLinks,
    MainLogoLinks: createNoopSurface(),
    Notify: createNoopSurface({
      activateModalFocus(_modal, { initialFocus }) {
        initialFocus.focus({ preventScroll: true });
      },
      deactivateModalFocus() {},
    }),
    ReadingSpeedTestUi: readingSpeedTestUi,
    RendererCombobox: { create() { return presetsCombobox; } },
    RendererCrono: { createController() { return null; } },
    RendererI18n: rendererI18n,
    ResultsTimeMultiplier: createNoopSurface(),
    SnapshotSaveTagsModal: {
      applyTranslations() { recordActiveCustomPromptTranslationRefresh('SnapshotSaveTagsModal'); },
    },
    TextApplyCanonical: createNoopSurface(),
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
  subscriptions.startupReady();
  for (let index = 0; index < 4; index += 1) await flushAsyncWork();

  assert.ok(selectorActions, 'main renderer did not register selector actions');
  assert.equal(errors.length, 0, `main renderer logged initialization errors: ${String(errors[0] || '')}`);

  return {
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
    preciseLabel,
    preciseWrapper,
    selectorActions,
    setInfoContentFocus() {
      document.activeElement = infoContentFocusTarget;
    },
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

  assert.deepEqual(manualRequests, ['en', 'en', 'en']);
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
