'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id) {
  const listeners = new Map();
  const attributes = {};
  const childNodes = [];

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clearChildren() {
    childNodes.length = 0;
  }

  function appendChild(node) {
    childNodes.push(node);
    return node;
  }

  function serializeNode(node) {
    if (!node) return '';
    if (node.nodeType === 3) {
      return escapeHtml(node.textContent);
    }
    const serializedAttributes = Object.entries(node.attributes || {})
      .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
      .join('');
    return `<${node.tagName}${serializedAttributes}>${node.childNodes.map(serializeNode).join('')}</${node.tagName}>`;
  }

  function getTextFromNode(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.textContent;
    return (node.childNodes || []).map(getTextFromNode).join('');
  }

  return {
    nodeType: 1,
    id,
    tagName: 'div',
    attributes,
    childNodes,
    hidden: false,
    disabled: false,
    value: '',
    appendChild,
    get textContent() {
      return childNodes.map(getTextFromNode).join('');
    },
    set textContent(value) {
      clearChildren();
      appendChild({
        nodeType: 3,
        textContent: String(value),
      });
    },
    get innerHTML() {
      return childNodes.map(serializeNode).join('');
    },
    set innerHTML(value) {
      clearChildren();
      appendChild({
        nodeType: 3,
        textContent: String(value),
      });
    },
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
    focus() {},
  };
}

function createHarness() {
  const elements = {
    textExtractionSingleFileHeavyPdfModal: createElement('textExtractionSingleFileHeavyPdfModal'),
    textExtractionSingleFileHeavyPdfModalBackdrop: createElement('textExtractionSingleFileHeavyPdfModalBackdrop'),
    textExtractionSingleFileHeavyPdfModalTitle: createElement('textExtractionSingleFileHeavyPdfModalTitle'),
    textExtractionSingleFileHeavyPdfModalMessage: createElement('textExtractionSingleFileHeavyPdfModalMessage'),
    textExtractionSingleFileHeavyPdfModalDetails: createElement('textExtractionSingleFileHeavyPdfModalDetails'),
    textExtractionSingleFileHeavyPdfModalDetailsRows: createElement('textExtractionSingleFileHeavyPdfModalDetailsRows'),
    textExtractionSingleFileHeavyPdfModalRevealActions: createElement('textExtractionSingleFileHeavyPdfModalRevealActions'),
    textExtractionSingleFileHeavyPdfModalSplit: createElement('textExtractionSingleFileHeavyPdfModalSplit'),
    textExtractionSingleFileHeavyPdfModalReturnToPages: createElement('textExtractionSingleFileHeavyPdfModalReturnToPages'),
    textExtractionSingleFileHeavyPdfModalUseNative: createElement('textExtractionSingleFileHeavyPdfModalUseNative'),
    textExtractionSingleFileHeavyPdfModalReveal: createElement('textExtractionSingleFileHeavyPdfModalReveal'),
    textExtractionSingleFileHeavyPdfModalCancel: createElement('textExtractionSingleFileHeavyPdfModalCancel'),
    textExtractionSingleFileHeavyPdfModalClose: createElement('textExtractionSingleFileHeavyPdfModalClose'),
  };

  const windowListeners = new Map();
  const translations = {
    'renderer.text_extraction.single_file_heavy.case_a_title': 'Full PDF too large for OCR',
    'renderer.text_extraction.single_file_heavy.case_a_message': 'The full PDF exceeds the OCR provider limit ({providerLimitMb} MB).',
    'renderer.text_extraction.single_file_heavy.case_b_title': 'Generated range too large for OCR',
    'renderer.text_extraction.single_file_heavy.case_b_message': 'The generated PDF for the selected range exceeds the OCR provider limit ({providerLimitMb} MB). It was not uploaded. You can return to page selection, use native, or open the shared planner to split the full PDF.',
    'renderer.text_extraction.single_file_heavy.source_file_label': 'Source file:',
    'renderer.text_extraction.single_file_heavy.selected_range_label': 'Selected range:',
    'renderer.text_extraction.single_file_heavy.generated_pdf_label': 'Generated PDF:',
    'renderer.text_extraction.single_file_heavy.generated_pdf_size_label': 'Generated PDF size:',
    'renderer.text_extraction.single_file_heavy.source_size_label': 'Source file size:',
    'renderer.text_extraction.single_file_heavy.total_pages_label': 'Total pages:',
    'renderer.text_extraction.single_file_heavy.split_button': 'Split and plan the full PDF',
    'renderer.text_extraction.single_file_heavy.return_to_pages_button': 'Back to pages',
    'renderer.text_extraction.single_file_heavy.use_native_button': 'Use native',
    'renderer.text_extraction.single_file_heavy.reveal_generated_pdf_button': 'Reveal generated PDF',
    'renderer.text_extraction.single_file_heavy.cancel_button': 'Cancel',
    'renderer.text_extraction.single_file_heavy.close_aria': 'Close heavy PDF for OCR dialog',
    'renderer.text_extraction.alerts.generated_pdf_reveal_failed': 'Reveal failed',
  };

  const sandbox = {
    window: {
      Notify: {
        notifyMain() {},
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
      RendererI18n: {
        tRenderer(key) {
          return translations[key] || key;
        },
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
          languageDirection: 'rtl',
        },
      },
      getElementById(id) {
        return elements[id] || null;
      },
      createElement(tagName) {
        const element = createElement('');
        element.tagName = String(tagName || 'div').toLowerCase();
        return element;
      },
      createTextNode(text) {
        return {
          nodeType: 3,
          textContent: String(text ?? ''),
        };
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_single_file_heavy_pdf_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_single_file_heavy_pdf_modal.js' });

  return {
    elements,
    prompt: sandbox.window.Notify.promptTextExtractionSingleFileHeavyPdf,
  };
}

test('single-file heavy PDF modal moves provider limit into Case B intro and removes detail noise', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({
    caseKind: 'case_b',
    sourceFileName: 'book.pdf',
    sourceFileSizeBytes: 458 * 1024 * 1024,
    selectedRangeFromPage: 100,
    selectedRangeToPage: 220,
    generatedPdfFileName: 'book_pages_100_220.pdf',
    generatedPdfSizeBytes: 72.4 * 1024 * 1024,
    providerLimitBytes: 50 * 1024 * 1024,
    canUseNative: true,
  });

  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalMessage.textContent,
    /50 MB/
  );
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalMessage.innerHTML,
    /<bdi dir="ltr">50 MB<\/bdi>/
  );
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /<strong>Source file:<\/strong> <bdi dir="ltr">book\.pdf<\/bdi>/
  );
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /<strong>Selected range:<\/strong> <bdi dir="ltr">100-220<\/bdi>/
  );
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /<strong>Source file size:<\/strong> <bdi dir="ltr">458 MB<\/bdi>/
  );
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /<strong>Generated PDF size:<\/strong> <bdi dir="ltr">72\.4 MB<\/bdi>/
  );
  assert.doesNotMatch(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /<strong>Generated PDF:<\/strong>/
  );
  assert.doesNotMatch(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /Generated PDF:[^<]*\([^)]+ MB\)/
  );
  assert.doesNotMatch(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /Provider limit:/
  );
  assert.doesNotMatch(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /Upload status:/
  );
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalRevealActions.hidden, true);
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.hidden, true);

  harness.elements.textExtractionSingleFileHeavyPdfModalCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, 'cancel');
});

test('single-file heavy PDF modal includes provider limit in Case A intro', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({
    caseKind: 'case_a',
    sourceFileName: 'book.pdf',
    sourceFileSizeBytes: 458 * 1024 * 1024,
    totalPages: 516,
    providerLimitBytes: 50 * 1024 * 1024,
    canUseNative: false,
  });

  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalMessage.textContent,
    /50 MB/
  );
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalMessage.innerHTML,
    /<bdi dir="ltr">50 MB<\/bdi>/
  );
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /<strong>Source file size:<\/strong> <bdi dir="ltr">458 MB<\/bdi>/
  );
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /<strong>Total pages:<\/strong> <bdi dir="ltr">516<\/bdi>/
  );
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReturnToPages.hidden, false);
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalRevealActions.hidden, true);
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.hidden, true);
  assert.doesNotMatch(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /Generated PDF:/
  );

  harness.elements.textExtractionSingleFileHeavyPdfModalReturnToPages.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, 'return_to_pages');
});

test('single-file heavy PDF modal shows generated PDF filename only when a retained generated PDF exists', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({
    caseKind: 'case_b',
    sourceFileName: 'book.pdf',
    sourceFileSizeBytes: 458 * 1024 * 1024,
    selectedRangeFromPage: 100,
    selectedRangeToPage: 220,
    generatedPdfFileName: 'book_pages_100_220.pdf',
    generatedPdfSizeBytes: 72.4 * 1024 * 1024,
    providerLimitBytes: 50 * 1024 * 1024,
    canUseNative: true,
    retainedGeneratedPdf: {
      fileName: 'book_pages_100_220.pdf',
      artifactPath: 'C:\\tmp\\book_pages_100_220.pdf',
    },
    async onRevealGeneratedPdf() {},
  });

  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /<strong>Generated PDF:<\/strong> <bdi dir="ltr">book_pages_100_220\.pdf<\/bdi>/
  );
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /book_pages_100_220\.pdf/
  );
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalRevealActions.hidden, false);
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.hidden, false);

  harness.elements.textExtractionSingleFileHeavyPdfModalCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, 'cancel');
});
