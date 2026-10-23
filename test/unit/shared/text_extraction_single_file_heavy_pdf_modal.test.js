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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness({ missingElementIds = [] } = {}) {
  const registeredPromptNames = [];
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
  missingElementIds.forEach((id) => {
    delete elements[id];
  });

  const windowListeners = new Map();
  const notifiedKeys = [];
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
        activateModalFocus(_modal, { initialFocus }) {
          initialFocus.focus();
        },
        deactivateModalFocus() {},
        notifyMain(key) {
          notifiedKeys.push(key);
        },
        registerCustomPrompt(name, handler) {
          registeredPromptNames.push(name);
          this[name] = handler;
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
    notifiedKeys,
    translations,
    applyTranslations: sandbox.window.TextExtractionSingleFileHeavyPdfModal.applyTranslations,
    getRegisteredPromptNames() {
      return registeredPromptNames.slice();
    },
    prompt: sandbox.window.Notify.promptTextExtractionSingleFileHeavyPdf,
  };
}

test('single-file heavy PDF modal registers its public prompt through window.Notify.registerCustomPrompt', () => {
  const harness = createHarness();

  assert.deepEqual(harness.getRegisteredPromptNames(), [
    'promptTextExtractionSingleFileHeavyPdf',
  ]);
  assert.equal(typeof harness.prompt, 'function');
});

test('single-file heavy PDF modal rejects when required DOM is unavailable', async () => {
  const harness = createHarness({
    missingElementIds: ['textExtractionSingleFileHeavyPdfModalClose'],
  });

  await assert.rejects(
    harness.prompt(),
    /Single-file heavy PDF modal DOM elements missing/
  );
});

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

test('single-file heavy PDF modal leaves missing provider-limit placeholders malformed on the normal structural path', async () => {
  const cases = [
    {
      key: 'renderer.text_extraction.single_file_heavy.case_a_message',
      caseKind: 'case_a',
      template: 'The full PDF exceeds the OCR provider limit.',
      options: {
        totalPages: 516,
      },
    },
    {
      key: 'renderer.text_extraction.single_file_heavy.case_b_message',
      caseKind: 'case_b',
      template: 'The generated PDF exceeds the OCR provider limit.',
      options: {
        selectedRangeFromPage: 100,
        selectedRangeToPage: 220,
        generatedPdfFileName: 'book_pages_100_220.pdf',
        generatedPdfSizeBytes: 72.4 * 1024 * 1024,
      },
    },
  ];

  for (const scenario of cases) {
    const harness = createHarness();
    harness.translations[scenario.key] = scenario.template;

    const promptPromise = harness.prompt({
      caseKind: scenario.caseKind,
      sourceFileName: 'book.pdf',
      sourceFileSizeBytes: 458 * 1024 * 1024,
      providerLimitBytes: 50 * 1024 * 1024,
      ...scenario.options,
    });

    assert.equal(
      harness.elements.textExtractionSingleFileHeavyPdfModalMessage.textContent,
      scenario.template,
      `${scenario.caseKind} preserves the malformed translated message`
    );
    assert.doesNotMatch(
      harness.elements.textExtractionSingleFileHeavyPdfModalMessage.innerHTML,
      /50 MB/,
      `${scenario.caseKind} does not relocate the value when its placeholder is absent`
    );

    harness.elements.textExtractionSingleFileHeavyPdfModalCancel.dispatch('click');
    assert.equal(await promptPromise, 'cancel');
  }
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

test('single-file heavy PDF modal prevents concurrent reveals and allows retry after failure', async () => {
  const harness = createHarness();
  const firstReveal = createDeferred();
  const secondReveal = createDeferred();
  let revealCount = 0;

  const promptPromise = harness.prompt({
    caseKind: 'case_b',
    retainedGeneratedPdf: {
      fileName: 'book_pages_100_220.pdf',
      artifactPath: 'C:\\tmp\\book_pages_100_220.pdf',
    },
    onRevealGeneratedPdf() {
      revealCount += 1;
      return revealCount === 1 ? firstReveal.promise : secondReveal.promise;
    },
  });

  harness.elements.textExtractionSingleFileHeavyPdfModalReveal.dispatch('click');
  harness.elements.textExtractionSingleFileHeavyPdfModalReveal.dispatch('click');

  assert.equal(revealCount, 1);
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.disabled, true);

  firstReveal.reject(new Error('reveal failed'));
  await flushMicrotasks();

  assert.deepEqual(harness.notifiedKeys, [
    'renderer.text_extraction.alerts.generated_pdf_reveal_failed',
  ]);
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.disabled, false);

  harness.elements.textExtractionSingleFileHeavyPdfModalReveal.dispatch('click');
  assert.equal(revealCount, 2);
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.disabled, true);

  secondReveal.resolve();
  await flushMicrotasks();
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.disabled, false);

  harness.elements.textExtractionSingleFileHeavyPdfModalCancel.dispatch('click');
  assert.equal(await promptPromise, 'cancel');
});

test('single-file heavy PDF modal ignores a settled prompt\'s late reveal completion after reopening', async () => {
  const harness = createHarness();
  const firstReveal = createDeferred();
  const secondReveal = createDeferred();

  const firstPrompt = harness.prompt({
    caseKind: 'case_b',
    retainedGeneratedPdf: {
      fileName: 'first.pdf',
      artifactPath: 'C:\\tmp\\first.pdf',
    },
    onRevealGeneratedPdf() {
      return firstReveal.promise;
    },
  });

  harness.elements.textExtractionSingleFileHeavyPdfModalReveal.dispatch('click');
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.disabled, true);

  harness.elements.textExtractionSingleFileHeavyPdfModalSplit.dispatch('click');
  assert.equal(await firstPrompt, 'split');

  const secondPrompt = harness.prompt({
    caseKind: 'case_b',
    retainedGeneratedPdf: {
      fileName: 'second.pdf',
      artifactPath: 'C:\\tmp\\second.pdf',
    },
    onRevealGeneratedPdf() {
      return secondReveal.promise;
    },
  });

  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.disabled, false);
  harness.elements.textExtractionSingleFileHeavyPdfModalReveal.dispatch('click');
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.disabled, true);

  firstReveal.resolve();
  await flushMicrotasks();
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.disabled, true);

  secondReveal.resolve();
  await flushMicrotasks();
  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalReveal.disabled, false);

  harness.elements.textExtractionSingleFileHeavyPdfModalCancel.dispatch('click');
  assert.equal(await secondPrompt, 'cancel');
});

test('single-file heavy PDF modal refreshes active copy through its canonical render path', async () => {
  const harness = createHarness();
  const promptPromise = harness.prompt({
    caseKind: 'case_a',
    sourceFileName: 'book.pdf',
    sourceFileSizeBytes: 458 * 1024 * 1024,
    totalPages: 516,
    providerLimitBytes: 50 * 1024 * 1024,
  });

  harness.translations['renderer.text_extraction.single_file_heavy.case_a_title'] = 'PDF demasiado grande';
  harness.translations['renderer.text_extraction.single_file_heavy.total_pages_label'] = 'Páginas totales:';
  harness.applyTranslations();

  assert.equal(harness.elements.textExtractionSingleFileHeavyPdfModalTitle.textContent, 'PDF demasiado grande');
  assert.match(
    harness.elements.textExtractionSingleFileHeavyPdfModalDetailsRows.innerHTML,
    /<strong>Páginas totales:<\/strong> <bdi dir="ltr">516<\/bdi>/
  );

  harness.elements.textExtractionSingleFileHeavyPdfModalCancel.dispatch('click');
  assert.equal(await promptPromise, 'cancel');
});
