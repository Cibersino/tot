'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

  env.window.ReadingSpeedTestUi.configure();
  env.elements.readingTestEntryModalClose.dispatch('click');
  assert.equal(env.document.activeElement, env.elements.readingTestOpener);
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
    assert.match(markup, new RegExp(`id="${descriptionId}" class="main-accessible-description"`));
  });
});
