'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id) {
  const listeners = new Map();
  const attributes = {};

  return {
    id,
    attributes,
    focusCount: 0,
    textContent: '',
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter((candidate) => candidate !== handler));
    },
    dispatch(type, event = {}) {
      const handlers = listeners.get(type) || [];
      handlers.forEach((handler) => handler(event));
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    get dir() {
      return attributes.dir || '';
    },
    set dir(value) {
      attributes.dir = String(value);
    },
    focus() {
      this.focusCount += 1;
    },
  };
}

function createHarness({ languageDirection = 'rtl' } = {}) {
  const elements = {
    textExtractionOcrActivationDisclosureModal: createElement('textExtractionOcrActivationDisclosureModal'),
    textExtractionOcrActivationDisclosureBackdrop: createElement('textExtractionOcrActivationDisclosureBackdrop'),
    textExtractionOcrActivationDisclosurePanel: createElement('textExtractionOcrActivationDisclosurePanel'),
    textExtractionOcrActivationDisclosureTitle: createElement('textExtractionOcrActivationDisclosureTitle'),
    textExtractionOcrActivationDisclosureIntro: createElement('textExtractionOcrActivationDisclosureIntro'),
    textExtractionOcrActivationDisclosureSelectedFiles: createElement('textExtractionOcrActivationDisclosureSelectedFiles'),
    textExtractionOcrActivationDisclosureLocalStorage: createElement('textExtractionOcrActivationDisclosureLocalStorage'),
    textExtractionOcrActivationDisclosureRemoteCleanup: createElement('textExtractionOcrActivationDisclosureRemoteCleanup'),
    textExtractionOcrActivationDisclosureDisconnect: createElement('textExtractionOcrActivationDisclosureDisconnect'),
    textExtractionOcrActivationDisclosurePrivacy: createElement('textExtractionOcrActivationDisclosurePrivacy'),
    textExtractionOcrActivationDisclosureProceed: createElement('textExtractionOcrActivationDisclosureProceed'),
    textExtractionOcrActivationDisclosureCancel: createElement('textExtractionOcrActivationDisclosureCancel'),
    textExtractionOcrActivationDisclosureClose: createElement('textExtractionOcrActivationDisclosureClose'),
  };

  const windowListeners = new Map();
  const translations = {
    'renderer.text_extraction.ocr_activation_disclosure.title': 'Review Google OCR activation',
    'renderer.text_extraction.ocr_activation_disclosure.intro': 'toT uses Google services for OCR.',
    'renderer.text_extraction.ocr_activation_disclosure.selected_files': 'Only selected files are sent to Google OCR.',
    'renderer.text_extraction.ocr_activation_disclosure.local_storage': 'Google OAuth credentials are stored locally.',
    'renderer.text_extraction.ocr_activation_disclosure.remote_cleanup': 'The app attempts Google Drive cleanup after export.',
    'renderer.text_extraction.ocr_activation_disclosure.disconnect': 'Preferences > Disconnect Google OCR remains available later.',
    'renderer.text_extraction.ocr_activation_disclosure.privacy_link': 'Open privacy policy',
    'renderer.text_extraction.ocr_activation_disclosure.proceed_button': 'Continue with Google',
    'renderer.text_extraction.ocr_activation_disclosure.cancel_button': 'Cancel',
    'renderer.text_extraction.ocr_activation_disclosure.close_aria': 'Close Google OCR activation disclosure',
  };

  const sandbox = {
    window: {
      Notify: {},
      RendererI18n: {
        tRenderer(key) {
          return translations[key] || key;
        },
      },
      getLogger() {
        return {
          debug() {},
          info() {},
          warn() {},
          warnOnce() {},
          error() {},
        };
      },
      addEventListener(type, handler) {
        if (!windowListeners.has(type)) {
          windowListeners.set(type, []);
        }
        windowListeners.get(type).push(handler);
      },
      removeEventListener(type, handler) {
        if (!windowListeners.has(type)) return;
        windowListeners.set(type, windowListeners.get(type).filter((candidate) => candidate !== handler));
      },
    },
    document: {
      documentElement: {
        dataset: {
          languageDirection,
        },
      },
      getElementById(id) {
        return elements[id] || null;
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_ocr_activation_disclosure_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_ocr_activation_disclosure_modal.js' });

  return {
    elements,
    prompt: sandbox.window.Notify.promptTextExtractionOcrActivationDisclosure,
  };
}

test('OCR activation disclosure modal uses RTL surface direction for RTL locales', async () => {
  const harness = createHarness({ languageDirection: 'rtl' });

  const promptPromise = harness.prompt();

  assert.equal(
    harness.elements.textExtractionOcrActivationDisclosureModal.getAttribute('aria-hidden'),
    'false'
  );
  assert.equal(harness.elements.textExtractionOcrActivationDisclosureModal.dir, 'rtl');
  assert.equal(harness.elements.textExtractionOcrActivationDisclosurePanel.dir, 'rtl');
  assert.equal(
    harness.elements.textExtractionOcrActivationDisclosureTitle.textContent,
    'Review Google OCR activation'
  );
  assert.equal(
    harness.elements.textExtractionOcrActivationDisclosureDisconnect.textContent,
    'Preferences > Disconnect Google OCR remains available later.'
  );
  assert.equal(
    harness.elements.textExtractionOcrActivationDisclosureClose.getAttribute('aria-label'),
    'Close Google OCR activation disclosure'
  );
  assert.equal(harness.elements.textExtractionOcrActivationDisclosureProceed.focusCount, 1);

  harness.elements.textExtractionOcrActivationDisclosureCancel.dispatch('click');
  const accepted = await promptPromise;

  assert.equal(accepted, false);
  assert.equal(
    harness.elements.textExtractionOcrActivationDisclosureModal.getAttribute('aria-hidden'),
    'true'
  );
});

test('OCR activation disclosure modal falls back to LTR when the window locale is not RTL', async () => {
  const harness = createHarness({ languageDirection: 'ltr' });

  const promptPromise = harness.prompt();

  assert.equal(harness.elements.textExtractionOcrActivationDisclosureModal.dir, 'ltr');
  assert.equal(harness.elements.textExtractionOcrActivationDisclosurePanel.dir, 'ltr');
  assert.equal(
    harness.elements.textExtractionOcrActivationDisclosureProceed.textContent,
    'Continue with Google'
  );

  harness.elements.textExtractionOcrActivationDisclosureProceed.dispatch('click');
  const accepted = await promptPromise;

  assert.equal(accepted, true);
  assert.equal(
    harness.elements.textExtractionOcrActivationDisclosureModal.getAttribute('aria-hidden'),
    'true'
  );
});
