'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createElement(id) {
  const listeners = new Map();
  const attributes = {};

  return {
    id,
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    focusCount: 0,
    selectCount: 0,
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
    select() {
      this.selectCount += 1;
    },
  };
}

function createHarness() {
  const registeredPromptNames = [];
  const notifiedKeys = [];
  const elements = {
    textExtractionApplyModal: createElement('textExtractionApplyModal'),
    textExtractionApplyModalBackdrop: createElement('textExtractionApplyModalBackdrop'),
    textExtractionApplyModalTitle: createElement('textExtractionApplyModalTitle'),
    textExtractionApplyModalMessage: createElement('textExtractionApplyModalMessage'),
    textExtractionApplyModalElapsed: createElement('textExtractionApplyModalElapsed'),
    textExtractionApplyModalSavedPdf: createElement('textExtractionApplyModalSavedPdf'),
    textExtractionApplyModalSavedPdfMessage: createElement('textExtractionApplyModalSavedPdfMessage'),
    textExtractionApplyModalSavedPdfFile: createElement('textExtractionApplyModalSavedPdfFile'),
    textExtractionApplyModalRevealSavedPdf: createElement('textExtractionApplyModalRevealSavedPdf'),
    textExtractionApplyModalRepeatLabel: createElement('textExtractionApplyModalRepeatLabel'),
    textExtractionApplyModalRepeatInput: createElement('textExtractionApplyModalRepeatInput'),
    textExtractionApplyModalOverwrite: createElement('textExtractionApplyModalOverwrite'),
    textExtractionApplyModalAppend: createElement('textExtractionApplyModalAppend'),
    textExtractionApplyModalCancel: createElement('textExtractionApplyModalCancel'),
    textExtractionApplyModalClose: createElement('textExtractionApplyModalClose'),
  };

  const windowListeners = new Map();
  const translations = {
    'renderer.text_extraction.apply_modal.title': 'Apply extracted text',
    'renderer.text_extraction.apply_modal.message': 'Choose how to apply the extracted text.',
    'renderer.text_extraction.apply_modal.elapsed': 'Elapsed: ',
    'renderer.text_extraction.apply_modal.repeat_label': 'Repeat count',
    'renderer.text_extraction.apply_modal.overwrite_button': 'Overwrite',
    'renderer.text_extraction.apply_modal.append_button': 'Append',
    'renderer.text_extraction.apply_modal.cancel_button': 'Cancel',
    'renderer.text_extraction.apply_modal.close_aria': 'Close apply modal',
    'renderer.text_extraction.apply_modal.saved_pdf_message': 'A generated PDF was retained.',
    'renderer.text_extraction.apply_modal.saved_pdf_label': 'Generated PDF: ',
    'renderer.text_extraction.apply_modal.reveal_saved_pdf_button': 'Reveal generated PDF',
    'renderer.text_extraction.alerts.generated_pdf_reveal_failed': 'Reveal failed',
  };

  const sandbox = {
    window: {
      Notify: {
        notifyMain(key) {
          notifiedKeys.push(key);
        },
        registerCustomPrompt(name, handler) {
          registeredPromptNames.push(name);
          this[name] = handler;
        },
      },
      RendererI18n: {
        tRenderer(key) {
          return translations[key] || key;
        },
        renderLocalizedLabelWithInvariantValue(element, { labelText, valueText }) {
          element.textContent = `${labelText}${valueText}`;
        },
      },
      TextApplyCanonical: {
        normalizeRepeat(rawValue, { maxRepeat } = {}) {
          const numeric = Number(rawValue);
          if (!Number.isInteger(numeric) || numeric < 1) return 1;
          return Math.min(numeric, Number(maxRepeat) || 1);
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
    path.resolve(__dirname, '../../../public/js/text_extraction_apply_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_apply_modal.js' });

  return {
    elements,
    notifiedKeys,
    getRegisteredPromptNames() {
      return registeredPromptNames.slice();
    },
    prompt: sandbox.window.Notify.promptTextExtractionApplyChoice,
  };
}

test('apply modal registers its public prompt through window.Notify.registerCustomPrompt', () => {
  const harness = createHarness();

  assert.deepEqual(harness.getRegisteredPromptNames(), [
    'promptTextExtractionApplyChoice',
  ]);
  assert.equal(typeof harness.prompt, 'function');
});

test('apply modal renders retained PDF details, normalizes repeat count, and resolves overwrite choice', async () => {
  const harness = createHarness();
  let revealCount = 0;

  const promptPromise = harness.prompt({
    elapsedValueText: '00:42',
    defaultRepeat: 3,
    maxRepeat: 5,
    retainedGeneratedPdf: { fileName: 'output.pdf' },
    async onRevealGeneratedPdf() {
      revealCount += 1;
    },
  });

  assert.equal(harness.elements.textExtractionApplyModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.textExtractionApplyModalTitle.textContent, 'Apply extracted text');
  assert.equal(harness.elements.textExtractionApplyModalElapsed.textContent, 'Elapsed: 00:42');
  assert.equal(harness.elements.textExtractionApplyModalSavedPdf.hidden, false);
  assert.equal(harness.elements.textExtractionApplyModalSavedPdfFile.textContent, 'Generated PDF: output.pdf');
  assert.equal(harness.elements.textExtractionApplyModalRepeatInput.value, '3');
  assert.equal(harness.elements.textExtractionApplyModalRepeatInput.focusCount, 1);
  assert.equal(harness.elements.textExtractionApplyModalRepeatInput.selectCount, 1);

  harness.elements.textExtractionApplyModalRepeatInput.value = '9';
  harness.elements.textExtractionApplyModalRepeatInput.dispatch('blur');
  assert.equal(harness.elements.textExtractionApplyModalRepeatInput.value, '5');

  harness.elements.textExtractionApplyModalRevealSavedPdf.dispatch('click');
  await flushMicrotasks();
  assert.equal(revealCount, 1);

  harness.elements.textExtractionApplyModalOverwrite.dispatch('click');
  const result = await promptPromise;

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { mode: 'overwrite', repetitions: 5 }
  );
});

test('apply modal reports retained PDF reveal failures through window.Notify.notifyMain', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({
    retainedGeneratedPdf: { fileName: 'output.pdf' },
    async onRevealGeneratedPdf() {
      throw new Error('reveal failed');
    },
  });

  harness.elements.textExtractionApplyModalRevealSavedPdf.dispatch('click');
  await flushMicrotasks();

  assert.deepEqual(harness.notifiedKeys, [
    'renderer.text_extraction.alerts.generated_pdf_reveal_failed',
  ]);

  harness.elements.textExtractionApplyModalCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});
