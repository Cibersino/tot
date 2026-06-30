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
    textContent: '',
    focusCount: 0,
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
    focus() {
      this.focusCount += 1;
    },
  };
}

function createHarness() {
  const registeredPromptNames = [];
  const elements = {
    textExtractionRouteModal: createElement('textExtractionRouteModal'),
    textExtractionRouteModalBackdrop: createElement('textExtractionRouteModalBackdrop'),
    textExtractionRouteModalTitle: createElement('textExtractionRouteModalTitle'),
    textExtractionRouteModalMessage: createElement('textExtractionRouteModalMessage'),
    textExtractionRouteModalNative: createElement('textExtractionRouteModalNative'),
    textExtractionRouteModalOcr: createElement('textExtractionRouteModalOcr'),
    textExtractionRouteModalCancel: createElement('textExtractionRouteModalCancel'),
    textExtractionRouteModalClose: createElement('textExtractionRouteModalClose'),
  };

  const windowListeners = new Map();
  const translations = {
    'renderer.text_extraction.route_choice.title': 'Choose extraction route',
    'renderer.text_extraction.route_choice.message': 'Select which extraction route to use.',
    'renderer.text_extraction.route_choice.native_button': 'Use native',
    'renderer.text_extraction.route_choice.ocr_button': 'Use OCR',
    'renderer.text_extraction.route_choice.cancel_button': 'Cancel',
    'renderer.text_extraction.route_choice.close_aria': 'Close route choice',
  };

  const sandbox = {
    window: {
      Notify: {
        registerCustomPrompt(name, handler) {
          registeredPromptNames.push(name);
          this[name] = handler;
        },
      },
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
      getElementById(id) {
        return elements[id] || null;
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_route_choice_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_route_choice_modal.js' });

  return {
    elements,
    getRegisteredPromptNames() {
      return registeredPromptNames.slice();
    },
    prompt: sandbox.window.Notify.promptTextExtractionRouteChoice,
  };
}

test('route-choice modal registers its public prompt through window.Notify.registerCustomPrompt', () => {
  const harness = createHarness();

  assert.deepEqual(harness.getRegisteredPromptNames(), [
    'promptTextExtractionRouteChoice',
  ]);
  assert.equal(typeof harness.prompt, 'function');
});

test('route-choice modal returns the selected OCR route when both routes are available', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({
    preparation: {
      routeChoiceOptions: ['native', 'ocr'],
    },
  });

  assert.equal(harness.elements.textExtractionRouteModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.textExtractionRouteModalTitle.textContent, 'Choose extraction route');
  assert.equal(harness.elements.textExtractionRouteModalOcr.textContent, 'Use OCR');
  assert.equal(harness.elements.textExtractionRouteModalNative.focusCount, 1);

  harness.elements.textExtractionRouteModalOcr.dispatch('click');
  const result = await promptPromise;

  assert.equal(result, 'ocr');
});

test('route-choice modal skips prompting when there is no real route choice', async () => {
  const harness = createHarness();

  const result = await harness.prompt({
    preparation: {
      routeChoiceOptions: ['ocr'],
    },
  });

  assert.equal(result, '');
  assert.equal(harness.elements.textExtractionRouteModal.getAttribute('aria-hidden'), null);
});
