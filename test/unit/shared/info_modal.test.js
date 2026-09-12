'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createElement(id = '') {
  const attributes = {};
  const listeners = new Map();
  return {
    id,
    dataset: {},
    focusCount: 0,
    hidden: false,
    innerHTML: '',
    scrollTop: 0,
    textContent: '',
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      (listeners.get(type) || []).forEach((listener) => listener({ target: this, ...event }));
    },
    focus() { this.focusCount += 1; },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute(name) { delete attributes[name]; },
    setAttribute(name, value) { attributes[name] = String(value); },
  };
}

function loadInfoModalHarness({ loadLocalizedDocument, fetchText, electronAPI = {} } = {}) {
  let language = 'en';
  const errors = [];
  const warnings = [];
  const keydownListeners = [];
  const documentRequests = [];
  const linkCalls = { bind: 0, enhance: 0, translations: 0 };
  const focusCalls = { activate: 0, deactivate: 0 };
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };
  const infoModal = getElement('infoModal');
  const infoModalClose = getElement('infoModalClose');
  const infoModalContent = getElement('infoModalContent');
  const infoModalPanel = createElement('infoModalPanel');
  const contentFocus = createElement('contentFocus');
  const sectionTarget = createElement('instrucciones');
  const sectionLink = createElement('instruccionesLink');
  sectionTarget.scrollIntoView = () => { sectionTarget.scrollCount += 1; };
  infoModalPanel.scrollHeight = 900;
  infoModalPanel.clientHeight = 400;
  infoModalPanel.getBoundingClientRect = () => ({ top: 0 });
  infoModalPanel.scrollTo = ({ top }) => { infoModalPanel.scrollTop = top; };
  infoModal.querySelector = (selector) => (selector === '.info-modal-panel' ? infoModalPanel : null);
  const aboutElements = new Map([
    ['#appVersion', createElement('appVersion')],
    ['#appEnv', createElement('appEnv')],
    ['#appRuntimeVersions', createElement('appRuntimeVersions')],
    ['#sharpRuntimeLicenseRow', createElement('sharpRuntimeLicenseRow')],
    ['#sharpRuntimeNoticeRow', createElement('sharpRuntimeNoticeRow')],
    ['#sharpRuntimePackageName', createElement('sharpRuntimePackageName')],
    ['#sharpRuntimeNoticePackageName', createElement('sharpRuntimeNoticePackageName')],
  ]);
  infoModalContent.contains = (node) => node === contentFocus;
  infoModalContent.querySelector = (selector) => {
    if (aboutElements.has(selector)) return aboutElements.get(selector);
    if (selector === '#instrucciones') return sectionTarget;
    if (selector === 'nav a[href="#instrucciones"]') return sectionLink;
    return null;
  };

  const document = {
    activeElement: null,
    getElementById: getElement,
  };
  document.activeElement = infoModalClose;
  const rendererI18n = {
    getLanguageDirection(value) { return value === 'ar' ? 'rtl' : 'ltr'; },
    async loadLocalizedDocument(documentId, requestedLanguage) {
      documentRequests.push({ documentId, language: requestedLanguage });
      return loadLocalizedDocument(documentId, requestedLanguage);
    },
    msgRenderer(key, params) {
      return `${key}:${params.name}`;
    },
    tRenderer(key) {
      const values = {
        'renderer.info.loading': language === 'es' ? 'Cargando...' : 'Loading...',
        'renderer.info.close_aria': language === 'es' ? 'Cerrar información' : 'Close information',
        'renderer.info.instrucciones.title': language === 'es' ? 'Instrucciones' : 'Instructions',
        'renderer.info.acerca_de.title': language === 'es' ? 'Acerca de' : 'About',
        'renderer.info.acerca_de.version.unavailable': 'N/A',
        'renderer.info.acerca_de.env.unavailable': 'N/A',
      };
      return values[key] || key;
    },
  };
  const window = {
    AppConstants: { DEFAULT_LANG: 'en' },
    InfoModalLinks: {
      applyTranslations() { linkCalls.translations += 1; },
      bindInfoModalLinks() { linkCalls.bind += 1; },
      enhanceInfoModalScreenshots() { linkCalls.enhance += 1; },
    },
    Notify: {
      activateModalFocus(_modal, { initialFocus }) {
        focusCalls.activate += 1;
        initialFocus.focus({ preventScroll: true });
      },
      deactivateModalFocus() { focusCalls.deactivate += 1; },
    },
    RendererI18n: rendererI18n,
    addEventListener(type, listener) {
      if (type === 'keydown') keydownListeners.push(listener);
    },
    electronAPI,
    getLogger() {
      return {
        debug() {},
        error(...args) { errors.push(args); },
        warn(...args) { warnings.push(args); },
      };
    },
  };
  const sandbox = {
    DOMParser: class {
      parseFromString(html) {
        return { body: { innerHTML: html }, querySelectorAll() { return []; } };
      }
    },
    Promise,
    document,
    fetch: async (resource) => ({
      ok: true,
      text: async () => fetchText(resource),
    }),
    requestAnimationFrame(callback) { callback(); },
    window,
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.resolve(__dirname, '../../../public/js/info_modal.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'public/js/info_modal.js' });
  const api = window.InfoModal;
  api.init({ getCurrentLanguage: () => language });

  return {
    aboutElements,
    api,
    contentFocus,
    documentRequests,
    errors,
    focusCalls,
    getElement,
    infoModalPanel,
    keydownListeners,
    linkCalls,
    setLanguage(value) { language = value; },
    setContentFocus() { document.activeElement = contentFocus; },
    warnings,
  };
}

test('InfoModal owns localized manual rendering, focus lifecycle, and language refresh', async () => {
  const harness = loadInfoModalHarness({
    async loadLocalizedDocument(_documentId, language) {
      return { html: `<article>${language} manual</article>`, language };
    },
    fetchText: async () => '',
  });

  await harness.api.open('instrucciones');
  const modal = harness.getElement('infoModal');
  const content = harness.getElement('infoModalContent');
  const close = harness.getElement('infoModalClose');
  assert.equal(modal.getAttribute('aria-hidden'), 'false');
  assert.equal(content.innerHTML, '<article>en manual</article>');
  assert.equal(content.getAttribute('lang'), 'en');
  assert.equal(content.getAttribute('dir'), 'ltr');
  assert.equal(harness.api.isOpen(), true);
  assert.equal(harness.focusCalls.activate, 1);
  assert.equal(harness.linkCalls.enhance, 1);
  assert.equal(harness.linkCalls.bind, 1);

  harness.infoModalPanel.scrollTop = 37;
  harness.setContentFocus();
  const closeFocusBeforeRefresh = close.focusCount;
  harness.setLanguage('es');
  harness.api.applyTranslations();
  await flushAsyncWork();
  await flushAsyncWork();

  assert.deepEqual(harness.documentRequests.map((request) => request.language), ['en', 'es']);
  assert.equal(content.innerHTML, '<article>es manual</article>');
  assert.equal(content.getAttribute('lang'), 'es');
  assert.equal(harness.infoModalPanel.scrollTop, 37);
  assert.equal(close.focusCount, closeFocusBeforeRefresh + 1);
  assert.equal(close.getAttribute('aria-label'), 'Cerrar información');
  assert.equal(harness.linkCalls.translations, 1);

  close.dispatch('click');
  assert.equal(modal.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.api.isOpen(), false);
  assert.equal(content.innerHTML, '<div id="infoModalLoading" class="info-loading">Cargando...</div>');
  assert.equal(harness.focusCalls.deactivate, 1);

  await harness.api.open('instrucciones');
  harness.getElement('infoModalBackdrop').dispatch('click');
  assert.equal(modal.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.focusCalls.deactivate, 2);

  await harness.api.open('instrucciones');
  harness.keydownListeners.forEach((listener) => listener({ key: 'Escape' }));
  assert.equal(modal.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.focusCalls.deactivate, 3);
  assert.equal(harness.errors.length, 0);
});

test('InfoModal ignores unsupported keys and invalidates a stale document render after close', async () => {
  let resolveDocument;
  const harness = loadInfoModalHarness({
    loadLocalizedDocument() {
      return new Promise((resolve) => { resolveDocument = resolve; });
    },
    fetchText: async () => '',
  });

  await harness.api.open('unsupported');
  assert.deepEqual(harness.documentRequests, []);
  assert.equal(harness.getElement('infoModal').getAttribute('aria-hidden'), null);

  const pendingOpen = harness.api.open('instrucciones');
  await flushAsyncWork();
  harness.getElement('infoModalClose').dispatch('click');
  resolveDocument({ html: '<article>stale content</article>', language: 'en' });
  await pendingOpen;

  assert.equal(harness.getElement('infoModal').getAttribute('aria-hidden'), 'true');
  assert.equal(
    harness.getElement('infoModalContent').innerHTML,
    '<div id="infoModalLoading" class="info-loading">Loading...</div>'
  );
  assert.ok(harness.warnings.some((args) => args[0] === 'InfoModal.open received unsupported key:'));
  assert.equal(harness.errors.length, 0);
});

test('InfoModal displays the localized missing-content state when RendererI18n cannot load a manual', async () => {
  const harness = loadInfoModalHarness({
    loadLocalizedDocument: async () => ({ html: null, language: '' }),
    fetchText: async () => '',
  });

  await harness.api.open('instrucciones');

  assert.equal(
    harness.getElement('infoModalContent').innerHTML,
    '<p class="info-modal-message">renderer.info.missing_content:Instructions</p>'
  );
  assert.equal(harness.getElement('infoModalClose').focusCount, 2);
  assert.equal(harness.errors.length, 0);
});

test('InfoModal latches an unavailable document for one open instance and retries only after reopen', async () => {
  let requests = 0;
  const harness = loadInfoModalHarness({
    loadLocalizedDocument: async () => {
      requests += 1;
      return { html: null, language: '' };
    },
    fetchText: async () => '',
  });

  await harness.api.open('instrucciones');
  harness.setLanguage('es');
  harness.api.applyTranslations();
  await flushAsyncWork();
  await flushAsyncWork();
  assert.equal(requests, 1);

  harness.getElement('infoModalClose').dispatch('click');
  await harness.api.open('instrucciones');
  assert.equal(requests, 2);
});

test('InfoModal projects cached About hydration across refresh and reacquires it only after close/reopen', async () => {
  const electronAPI = {
    async getAppVersion() { return ' 1.5.0 '; },
    async getAppRuntimeInfo() {
      return {
        platform: 'win32',
        arch: 'x64',
        electronVersion: '39.8.6',
        chromeVersion: '142.0.0',
        nodeVersion: '22.0.0',
      };
    },
    async getAppDocAvailability(key) { return { available: key.startsWith('license-') }; },
  };
  const harness = loadInfoModalHarness({
    electronAPI,
    loadLocalizedDocument: async () => ({ html: '<article>About</article>', language: 'es' }),
    fetchText: async () => '',
  });

  await harness.api.open('acerca_de');
  assert.equal(harness.aboutElements.get('#appVersion').textContent, '1.5.0');
  assert.equal(harness.aboutElements.get('#appEnv').textContent, 'Windows (x64)');
  assert.equal(
    harness.aboutElements.get('#appRuntimeVersions').textContent,
    'Electron 39.8.6 | Chromium 142.0.0 | Node.js 22.0.0'
  );
  assert.equal(harness.aboutElements.get('#sharpRuntimeLicenseRow').hidden, false);
  assert.equal(harness.aboutElements.get('#sharpRuntimeNoticeRow').hidden, true);

  electronAPI.getAppVersion = async () => { throw new Error('bridge failure'); };
  electronAPI.getAppRuntimeInfo = async () => { throw new Error('bridge failure'); };
  harness.setLanguage('es');
  await harness.api.open('acerca_de');
  assert.equal(harness.aboutElements.get('#appVersion').textContent, '1.5.0');
  assert.equal(harness.aboutElements.get('#appEnv').textContent, 'Windows (x64)');

  harness.getElement('infoModalClose').dispatch('click');
  await harness.api.open('acerca_de');
  assert.equal(harness.aboutElements.get('#appVersion').textContent, 'N/A');
  assert.equal(harness.aboutElements.get('#appEnv').textContent, 'N/A');
  assert.equal(harness.aboutElements.get('#appRuntimeVersions').textContent, 'N/A');
  assert.equal(
    harness.aboutElements.get('#sharpRuntimePackageName').textContent,
    '@img/sharp-<plataforma>-<arquitectura>@0.34.4'
  );
  assert.equal(harness.aboutElements.get('#sharpRuntimeLicenseRow').hidden, true);
  assert.equal(harness.aboutElements.get('#sharpRuntimeNoticeRow').hidden, true);
  assert.equal(harness.errors.length, 0);
});
