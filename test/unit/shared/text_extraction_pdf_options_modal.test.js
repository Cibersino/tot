'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function toPositiveIntegerOrNull(rawValue) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

function buildAllPagesSelection(totalPages) {
  const safeTotalPages = toPositiveIntegerOrNull(totalPages) || 1;
  return {
    mode: 'all',
    fromPage: 1,
    toPage: safeTotalPages,
    selectedPageCount: safeTotalPages,
    totalPages: safeTotalPages,
  };
}

function createElement(id) {
  const listeners = new Map();
  const attributes = {};

  return {
    id,
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    textContent: '',
    title: '',
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
    textExtractionPdfOptionsModal: createElement('textExtractionPdfOptionsModal'),
    textExtractionPdfOptionsModalBackdrop: createElement('textExtractionPdfOptionsModalBackdrop'),
    textExtractionPdfOptionsModalTitle: createElement('textExtractionPdfOptionsModalTitle'),
    textExtractionPdfOptionsModalMessage: createElement('textExtractionPdfOptionsModalMessage'),
    textExtractionPdfOptionsModalFileLabel: createElement('textExtractionPdfOptionsModalFileLabel'),
    textExtractionPdfOptionsModalFileName: createElement('textExtractionPdfOptionsModalFileName'),
    textExtractionPdfOptionsModalTotalPages: createElement('textExtractionPdfOptionsModalTotalPages'),
    textExtractionPdfOptionsModalSelectionLegend: createElement('textExtractionPdfOptionsModalSelectionLegend'),
    textExtractionPdfOptionsModalAllPages: createElement('textExtractionPdfOptionsModalAllPages'),
    textExtractionPdfOptionsModalAllPagesLabel: createElement('textExtractionPdfOptionsModalAllPagesLabel'),
    textExtractionPdfOptionsModalRange: createElement('textExtractionPdfOptionsModalRange'),
    textExtractionPdfOptionsModalRangeLabel: createElement('textExtractionPdfOptionsModalRangeLabel'),
    textExtractionPdfOptionsModalRangeFields: createElement('textExtractionPdfOptionsModalRangeFields'),
    textExtractionPdfOptionsModalFromLabel: createElement('textExtractionPdfOptionsModalFromLabel'),
    textExtractionPdfOptionsModalFromInput: createElement('textExtractionPdfOptionsModalFromInput'),
    textExtractionPdfOptionsModalToLabel: createElement('textExtractionPdfOptionsModalToLabel'),
    textExtractionPdfOptionsModalToInput: createElement('textExtractionPdfOptionsModalToInput'),
    textExtractionPdfOptionsModalSelectedCount: createElement('textExtractionPdfOptionsModalSelectedCount'),
    textExtractionPdfOptionsModalKeepWrap: createElement('textExtractionPdfOptionsModalKeepWrap'),
    textExtractionPdfOptionsModalKeepGeneratedPdf: createElement('textExtractionPdfOptionsModalKeepGeneratedPdf'),
    textExtractionPdfOptionsModalKeepLabel: createElement('textExtractionPdfOptionsModalKeepLabel'),
    textExtractionPdfOptionsModalValidation: createElement('textExtractionPdfOptionsModalValidation'),
    textExtractionPdfOptionsModalContinue: createElement('textExtractionPdfOptionsModalContinue'),
    textExtractionPdfOptionsModalCancel: createElement('textExtractionPdfOptionsModalCancel'),
    textExtractionPdfOptionsModalClose: createElement('textExtractionPdfOptionsModalClose'),
  };

  const windowListeners = new Map();
  const translations = {
    'renderer.text_extraction.pdf_options.title': 'PDF options',
    'renderer.text_extraction.pdf_options.message': 'Choose the pages to process.',
    'renderer.text_extraction.pdf_options.file_label': 'File',
    'renderer.text_extraction.pdf_options.total_pages_label': 'Total pages: ',
    'renderer.text_extraction.pdf_options.selection_legend': 'Selection',
    'renderer.text_extraction.pdf_options.all_pages_label': 'All pages',
    'renderer.text_extraction.pdf_options.range_label': 'Page range',
    'renderer.text_extraction.pdf_options.from_page_label': 'From',
    'renderer.text_extraction.pdf_options.to_page_label': 'To',
    'renderer.text_extraction.pdf_options.keep_generated_pdf_label': 'Keep generated PDF',
    'renderer.text_extraction.pdf_options.continue_button': 'Continue',
    'renderer.text_extraction.pdf_options.cancel_button': 'Cancel',
    'renderer.text_extraction.pdf_options.close_aria': 'Close PDF options',
    'renderer.text_extraction.pdf_options.selected_page_count_label': 'Selected pages: ',
    'renderer.text_extraction.pdf_options.invalid_range': 'Enter a valid page range.',
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
        renderLocalizedLabelWithInvariantValue(element, { labelText, valueText }) {
          element.textContent = `${labelText}${valueText}`;
        },
      },
      TextExtractionPdfPageSelection: {
        buildPageSelectionDraft({ pdfPageSelection = null, totalPages } = {}) {
          const safeTotalPages = toPositiveIntegerOrNull(totalPages)
            || toPositiveIntegerOrNull(pdfPageSelection && pdfPageSelection.totalPages)
            || 1;
          if (pdfPageSelection && pdfPageSelection.mode === 'range') {
            return {
              mode: 'range',
              fromPage: String(pdfPageSelection.fromPage),
              toPage: String(pdfPageSelection.toPage),
              totalPages: safeTotalPages,
            };
          }
          return {
            mode: 'all',
            fromPage: '1',
            toPage: String(safeTotalPages),
            totalPages: safeTotalPages,
          };
        },
        getPageSelectionUiState(pageSelectionDraft) {
          const safeDraft = pageSelectionDraft && typeof pageSelectionDraft === 'object' ? pageSelectionDraft : {};
          const totalPages = toPositiveIntegerOrNull(safeDraft.totalPages) || 1;
          if (safeDraft.mode !== 'range') {
            return {
              showRange: false,
              totalPages,
              selectedCountText: '',
              validationText: '',
              invalidInputKey: '',
              submitDisabled: false,
              pdfPageSelection: buildAllPagesSelection(totalPages),
            };
          }

          const fromPage = toPositiveIntegerOrNull(safeDraft.fromPage);
          const toPage = toPositiveIntegerOrNull(safeDraft.toPage);
          if (!fromPage || !toPage || fromPage > toPage || toPage > totalPages) {
            return {
              showRange: true,
              totalPages,
              selectedCountText: '',
              validationText: translations['renderer.text_extraction.pdf_options.invalid_range'],
              invalidInputKey: !fromPage ? 'fromPage' : 'toPage',
              submitDisabled: true,
              pdfPageSelection: null,
            };
          }

          return {
            showRange: true,
            totalPages,
            selectedCountText: `${translations['renderer.text_extraction.pdf_options.selected_page_count_label']}${(toPage - fromPage) + 1}`,
            validationText: '',
            invalidInputKey: '',
            submitDisabled: false,
            pdfPageSelection: {
              mode: 'range',
              fromPage,
              toPage,
              selectedPageCount: (toPage - fromPage) + 1,
              totalPages,
            },
          };
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
    path.resolve(__dirname, '../../../public/js/text_extraction_pdf_options_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_pdf_options_modal.js' });

  return {
    elements,
    getRegisteredPromptNames() {
      return registeredPromptNames.slice();
    },
    prompt: sandbox.window.Notify.promptTextExtractionPdfOptions,
  };
}

test('PDF options modal registers its public prompt through window.Notify.registerCustomPrompt', () => {
  const harness = createHarness();

  assert.deepEqual(harness.getRegisteredPromptNames(), [
    'promptTextExtractionPdfOptions',
  ]);
  assert.equal(typeof harness.prompt, 'function');
});

test('PDF options modal returns range selection and keep intent through the public prompt', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({
    inspection: {
      totalPages: 12,
      fileInfo: {
        fileName: 'book.pdf',
      },
    },
  });

  assert.equal(harness.elements.textExtractionPdfOptionsModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.textExtractionPdfOptionsModalTitle.textContent, 'PDF options');
  assert.equal(harness.elements.textExtractionPdfOptionsModalFileName.textContent, 'book.pdf');
  assert.equal(harness.elements.textExtractionPdfOptionsModalTotalPages.textContent, 'Total pages: 12');
  assert.equal(harness.elements.textExtractionPdfOptionsModalAllPages.focusCount, 1);

  harness.elements.textExtractionPdfOptionsModalRange.checked = true;
  harness.elements.textExtractionPdfOptionsModalRange.dispatch('change');
  harness.elements.textExtractionPdfOptionsModalFromInput.value = '3';
  harness.elements.textExtractionPdfOptionsModalFromInput.dispatch('input');
  harness.elements.textExtractionPdfOptionsModalToInput.value = '5';
  harness.elements.textExtractionPdfOptionsModalToInput.dispatch('input');
  harness.elements.textExtractionPdfOptionsModalKeepGeneratedPdf.checked = true;

  assert.equal(harness.elements.textExtractionPdfOptionsModalSelectedCount.textContent, 'Selected pages: 3');
  assert.equal(harness.elements.textExtractionPdfOptionsModalValidation.textContent, '');
  assert.equal(harness.elements.textExtractionPdfOptionsModalContinue.disabled, false);

  harness.elements.textExtractionPdfOptionsModalContinue.dispatch('click');
  const result = await promptPromise;

  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      pdfPageSelection: {
        mode: 'range',
        fromPage: 3,
        toPage: 5,
        selectedPageCount: 3,
        totalPages: 12,
      },
      generatedPdfArtifactPolicy: {
        mode: 'keep',
      },
    }
  );
});
