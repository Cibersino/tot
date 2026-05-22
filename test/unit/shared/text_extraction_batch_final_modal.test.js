'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let activeElementRef = null;

function escapeHtml(rawValue) {
  return String(rawValue || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function matchesAttributeSelector(element, selector) {
  const match = /^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (!match) return false;
  const [, attributeName, expectedValue] = match;
  const actualValue = element.getAttribute(attributeName);
  if (actualValue === null) return false;
  return expectedValue === undefined || actualValue === expectedValue;
}

function serializeAttributes(element) {
  const attributes = [];
  if (element.id) {
    attributes.push(`id="${escapeHtml(element.id)}"`);
  }
  if (element.className) {
    attributes.push(`class="${escapeHtml(element.className)}"`);
  }
  if (element.type) {
    attributes.push(`type="${escapeHtml(element.type)}"`);
  }
  if (element.name) {
    attributes.push(`name="${escapeHtml(element.name)}"`);
  }
  if (element.value !== '') {
    attributes.push(`value="${escapeHtml(element.value)}"`);
  }
  if (element.checked) {
    attributes.push('checked');
  }
  if (element.selected) {
    attributes.push('selected');
  }
  if (element.disabled) {
    attributes.push('disabled');
  }
  if (element.hidden) {
    attributes.push('hidden');
  }
  Object.entries(element._attributes).forEach(([name, value]) => {
    if (name === 'id' || name === 'class') return;
    attributes.push(`${name}="${escapeHtml(value)}"`);
  });
  return attributes.length ? ` ${attributes.join(' ')}` : '';
}

function serializeNode(element) {
  const tagName = String(element.tagName || 'div').toLowerCase();
  const attributes = serializeAttributes(element);
  const childrenHtml = element._children.map((child) => serializeNode(child)).join('');
  const textHtml = childrenHtml ? '' : escapeHtml(element._textContent);
  if (tagName === 'input') {
    return `<input${attributes}>`;
  }
  return `<${tagName}${attributes}>${childrenHtml || textHtml}</${tagName}>`;
}

function createElement(id, tagName = 'div') {
  let textContent = '';
  let manualInnerHtml = null;
  const listeners = new Map();
  const attributes = {};
  const children = [];

  return {
    id,
    tagName,
    hidden: false,
    disabled: false,
    checked: false,
    selected: false,
    value: '',
    title: '',
    type: '',
    name: '',
    className: '',
    scrollTop: 0,
    parentNode: null,
    _attributes: attributes,
    _children: children,
    _textContent: '',
    get firstChild() {
      return children[0] || null;
    },
    get textContent() {
      if (children.length) {
        return children.map((child) => child.textContent).join('');
      }
      return textContent;
    },
    set textContent(value) {
      textContent = String(value);
      manualInnerHtml = null;
      children.splice(0, children.length);
      this._textContent = textContent;
    },
    get innerHTML() {
      if (manualInnerHtml !== null) {
        return manualInnerHtml;
      }
      if (children.length) {
        return children.map((child) => serializeNode(child)).join('');
      }
      return escapeHtml(textContent);
    },
    set innerHTML(value) {
      manualInnerHtml = String(value);
      textContent = '';
      this._textContent = '';
      children.splice(0, children.length);
    },
    appendChild(child) {
      if (!child) return child;
      manualInnerHtml = null;
      textContent = '';
      this._textContent = '';
      child.parentNode = this;
      children.push(child);
      return child;
    },
    replaceChildren(...nextChildren) {
      manualInnerHtml = null;
      textContent = '';
      this._textContent = '';
      children.splice(0, children.length);
      nextChildren.forEach((child) => {
        if (!child) return;
        child.parentNode = this;
        children.push(child);
      });
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) {
        children.splice(index, 1);
        child.parentNode = null;
      }
      return child;
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
      if (name === 'id') {
        this.id = String(value);
      }
      if (name === 'class') {
        this.className = String(value);
      }
    },
    getAttribute(name) {
      if (name === 'id' && this.id) return this.id;
      if (name === 'class' && this.className) return this.className;
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (matchesAttributeSelector(current, selector)) {
          return current;
        }
        current = current.parentNode;
      }
      return null;
    },
    focus() {
      activeElementRef = this;
    },
  };
}

function findDescendantByAttribute(root, attributeName, attributeValue) {
  if (!root || !Array.isArray(root._children)) return null;
  for (const child of root._children) {
    if (child.getAttribute(attributeName) === attributeValue) {
      return child;
    }
    const nested = findDescendantByAttribute(child, attributeName, attributeValue);
    if (nested) return nested;
  }
  return null;
}

function createHarness() {
  activeElementRef = null;
  const elements = {
    outsideLauncher: createElement('outsideLauncher', 'button'),
    textExtractionBatchFinalModal: createElement('textExtractionBatchFinalModal'),
    textExtractionBatchFinalModalBackdrop: createElement('textExtractionBatchFinalModalBackdrop'),
    textExtractionBatchFinalModalPanel: createElement('textExtractionBatchFinalModalPanel'),
    textExtractionBatchFinalModalTitle: createElement('textExtractionBatchFinalModalTitle'),
    textExtractionBatchFinalModalSummary: createElement('textExtractionBatchFinalModalSummary'),
    textExtractionBatchFinalModalElapsed: createElement('textExtractionBatchFinalModalElapsed'),
    textExtractionBatchFinalModalBody: createElement('textExtractionBatchFinalModalBody'),
    textExtractionBatchFinalModalCopy: createElement('textExtractionBatchFinalModalCopy', 'button'),
    textExtractionBatchFinalModalOpenSnapshots: createElement('textExtractionBatchFinalModalOpenSnapshots', 'button'),
    textExtractionBatchFinalModalOk: createElement('textExtractionBatchFinalModalOk', 'button'),
    textExtractionBatchFinalModalClose: createElement('textExtractionBatchFinalModalClose', 'button'),
  };

  const windowListeners = new Map();
  const clipboardWrites = [];
  const notifiedKeys = [];
  const translations = {
    'renderer.text_extraction.batch_report.title': 'Batch extraction complete',
    'renderer.text_extraction.batch_report.single_file_title': 'Automatic PDF split complete',
    'renderer.text_extraction.batch_report.current_text_has_output': 'Current text was updated.',
    'renderer.text_extraction.batch_report.current_text_unchanged': 'Current text was not changed.',
    'renderer.text_extraction.batch_report.snapshot_load_guidance': 'Created JSON snapshots can be loaded later from the main window with the Load text snapshots button (📂).',
    'renderer.text_extraction.batch_report.elapsed': 'Execution time: ',
    'renderer.text_extraction.batch_report.copy_report': 'Copy report',
    'renderer.text_extraction.batch_report.open_snapshots_folder': 'Open snapshots folder',
    'renderer.text_extraction.batch_report.ok_button': 'OK',
    'renderer.text_extraction.batch_report.close_aria': 'Close final report',
    'renderer.text_extraction.batch_report.split_result_label': 'Split result:',
    'renderer.text_extraction.batch_report.reveal_generated_pdf': 'Reveal generated PDF',
    'renderer.text_extraction.batch_report.failed_fallback': 'FAILED',
    'renderer.text_extraction.batch_report.cancelled_fallback': 'cancelled',
    'renderer.text_extraction.batch_report.omitted': 'Omitted',
    'renderer.text_extraction.batch_report.snapshot_not_created': 'Snapshot not created',
    'renderer.text_extraction.batch_report.failed_with_code': 'failed: {code}',
    'renderer.text_extraction.batch_report.cancelled_with_code': 'cancelled: {code}',
    'renderer.text_extraction.single_file_heavy.source_file_label': 'Source file:',
    'renderer.alerts.text_extraction_generated_pdf_reveal_failed': 'Reveal failed',
  };

  const sandbox = {
    window: {
      Notify: {
        notifyMain(key) {
          notifiedKeys.push(key);
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
      get activeElement() {
        return activeElementRef;
      },
      getElementById(id) {
        return elements[id] || null;
      },
      createElement(tagName) {
        return createElement('', tagName);
      },
    },
    navigator: {
      clipboard: {
        async writeText(text) {
          clipboardWrites.push(String(text));
        },
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_batch_final_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_batch_final_modal.js' });

  return {
    elements,
    clipboardWrites,
    notifiedKeys,
    getActiveElement() {
      return activeElementRef;
    },
    prompt: sandbox.window.Notify.promptTextExtractionBatchFinalReport,
  };
}

test('batch final modal renders report rows with explicit DOM and exposes reveal/copy actions', async () => {
  const harness = createHarness();
  const revealedPaths = [];
  let snapshotsOpened = 0;

  const report = {
    flowKind: 'batch',
    hadOutput: true,
    units: [
      {
        unitTitle: 'unit_1',
        snapshotResult: {
          state: 'saved',
          text: '{"unit":"unit_1"}',
        },
        inputs: [
          {
            fileName: 'source_pages_1_4.pdf',
            state: 'success',
            generatedPdfArtifact: {
              retainedArtifactPath: 'C:\\tmp\\source_pages_1_4.pdf',
            },
          },
          {
            fileName: 'heavy.pdf',
            state: 'failed',
            generatedInputs: [
              {
                fileName: 'heavy_pages_1_2.pdf',
                state: 'failed',
                code: 'ocr_input_too_large',
                generatedPdfArtifact: {
                  retainedArtifactPath: 'C:\\tmp\\heavy_pages_1_2.pdf',
                },
              },
            ],
          },
        ],
      },
    ],
  };

  harness.elements.outsideLauncher.focus();
  harness.elements.textExtractionBatchFinalModalPanel.scrollTop = 210;
  const promptPromise = harness.prompt({
    report,
    elapsedValueText: '00:42',
    async onRevealGeneratedPdf(artifactPath) {
      revealedPaths.push(artifactPath);
    },
    async onOpenSnapshotsFolder() {
      snapshotsOpened += 1;
    },
  });

  assert.equal(harness.getActiveElement(), harness.elements.textExtractionBatchFinalModalClose);
  assert.equal(harness.elements.textExtractionBatchFinalModalPanel.scrollTop, 0);
  assert.match(harness.elements.textExtractionBatchFinalModalBody.innerHTML, /unit_1/);
  assert.match(harness.elements.textExtractionBatchFinalModalSummary.textContent, /Current text was updated\./);
  assert.match(harness.elements.textExtractionBatchFinalModalSummary.textContent, /Load text snapshots button/);
  assert.equal(harness.elements.textExtractionBatchFinalModalElapsed.textContent, 'Execution time: 00:42');
  assert.equal(harness.elements.textExtractionBatchFinalModalElapsed.hidden, false);
  assert.match(harness.elements.textExtractionBatchFinalModalBody.innerHTML, /source_pages_1_4\.pdf/);
  assert.match(harness.elements.textExtractionBatchFinalModalBody.innerHTML, /heavy\.pdf/);
  assert.match(
    harness.elements.textExtractionBatchFinalModalBody.innerHTML,
    /heavy_pages_1_2\.pdf \(failed: ocr_input_too_large\)/
  );
  const sourceRevealButton = findDescendantByAttribute(
    harness.elements.textExtractionBatchFinalModalBody,
    'data-artifact-path',
    'C:\\tmp\\source_pages_1_4.pdf'
  );
  const heavyChildRevealButton = findDescendantByAttribute(
    harness.elements.textExtractionBatchFinalModalBody,
    'data-artifact-path',
    'C:\\tmp\\heavy_pages_1_2.pdf'
  );
  assert.ok(sourceRevealButton);
  assert.ok(heavyChildRevealButton);
  assert.equal(sourceRevealButton.textContent, '⭧');
  assert.equal(sourceRevealButton.title, 'Reveal generated PDF');
  assert.equal(sourceRevealButton.getAttribute('aria-label'), 'Reveal generated PDF');
  assert.match(sourceRevealButton.className, /btn-standard--square-half/);
  assert.equal(
    findDescendantByAttribute(
      harness.elements.textExtractionBatchFinalModalBody,
      'data-artifact-path',
      'C:\\tmp\\heavy.pdf'
    ),
    null
  );
  harness.elements.textExtractionBatchFinalModalBody.dispatch('click', { target: sourceRevealButton });
  harness.elements.textExtractionBatchFinalModalBody.dispatch('click', { target: heavyChildRevealButton });
  await Promise.resolve();
  assert.deepEqual(revealedPaths, ['C:\\tmp\\source_pages_1_4.pdf', 'C:\\tmp\\heavy_pages_1_2.pdf']);

  harness.elements.textExtractionBatchFinalModalCopy.dispatch('click');
  await Promise.resolve();
  assert.equal(harness.clipboardWrites.length, 1);
  assert.match(harness.clipboardWrites[0], /Batch extraction complete/);
  assert.match(harness.clipboardWrites[0], /Execution time: 00:42/);
  assert.match(harness.clipboardWrites[0], /heavy_pages_1_2\.pdf \(failed: ocr_input_too_large\)/);

  harness.elements.textExtractionBatchFinalModalOpenSnapshots.dispatch('click');
  await Promise.resolve();
  assert.equal(snapshotsOpened, 1);

  harness.elements.textExtractionBatchFinalModalOk.dispatch('click');
  await promptPromise;
  assert.equal(harness.getActiveElement(), harness.elements.outsideLauncher);
});

test('batch final modal renders ordinary selected-page PDF rows with the range suffix in UI and copied text', async () => {
  const harness = createHarness();

  const report = {
    flowKind: 'batch',
    hadOutput: true,
    units: [
      {
        unitTitle: 'unit_1',
        snapshotResult: {
          state: 'not_created',
          text: 'Snapshot not created',
        },
        inputs: [
          {
            fileName: 'source.pdf',
            displayName: 'source.pdf (\u206612-18\u2069)',
            state: 'success',
            generatedPdfArtifact: {
              retainedArtifactPath: 'C:\\tmp\\source_pages_12_18.pdf',
            },
          },
        ],
      },
    ],
  };

  const promptPromise = harness.prompt({
    report,
    elapsedValueText: '00:42',
  });

  assert.match(
    harness.elements.textExtractionBatchFinalModalBody.textContent,
    /source\.pdf \(\u206612-18\u2069\)/
  );

  harness.elements.textExtractionBatchFinalModalCopy.dispatch('click');
  await Promise.resolve();
  assert.equal(harness.clipboardWrites.length, 1);
  assert.match(harness.clipboardWrites[0], /- source\.pdf \(\u206612-18\u2069\)/);

  harness.elements.textExtractionBatchFinalModalOk.dispatch('click');
  await promptPromise;
});

test('batch final modal renders ordinary failed, cancelled, and omitted rows consistently in UI and copied text', async () => {
  const harness = createHarness();

  const report = {
    flowKind: 'batch',
    hadOutput: false,
    units: [
      {
        unitTitle: 'unit_1',
        snapshotResult: {
          state: 'not_created',
          text: 'Snapshot not created',
        },
        inputs: [
          {
            fileName: 'failed.pdf',
            state: 'failed',
            code: 'native_extraction_failed',
          },
          {
            fileName: 'cancelled.pdf',
            state: 'cancelled',
            code: 'aborted_by_user',
          },
          {
            fileName: 'omitted.pdf',
            state: 'omitted',
            code: 'omitted',
          },
        ],
      },
    ],
  };

  const promptPromise = harness.prompt({
    report,
    elapsedValueText: '00:42',
  });

  const renderedHtml = harness.elements.textExtractionBatchFinalModalBody.innerHTML;
  assert.match(renderedHtml, /failed\.pdf \(failed: native_extraction_failed\)/);
  assert.match(renderedHtml, /cancelled\.pdf \(cancelled: aborted_by_user\)/);
  assert.match(renderedHtml, /omitted\.pdf \(Omitted\)/);

  harness.elements.textExtractionBatchFinalModalCopy.dispatch('click');
  await Promise.resolve();
  assert.equal(harness.clipboardWrites.length, 1);
  assert.match(harness.clipboardWrites[0], /- failed\.pdf \(failed: native_extraction_failed\)/);
  assert.match(harness.clipboardWrites[0], /- cancelled\.pdf \(cancelled: aborted_by_user\)/);
  assert.match(harness.clipboardWrites[0], /- omitted\.pdf \(Omitted\)/);

  harness.elements.textExtractionBatchFinalModalOk.dispatch('click');
  await promptPromise;
});

test('batch final modal renders heavy split success with custom unit title, source line, and child rows only', async () => {
  const harness = createHarness();

  const report = {
    flowKind: 'single_file_split',
    hadOutput: true,
    units: [
      {
        unitTitle: 'Chapter 3 OCR',
        exclusiveHeavy: true,
        sourceFileName: 'book.pdf',
        overallState: 'success',
        overallCode: '',
        heavyGeneratedInputRows: true,
        snapshotResult: {
          state: 'not_created',
          text: 'Snapshot not created',
        },
        inputs: [
          {
            fileName: 'book_pages_001_020.pdf',
            state: 'success',
            generatedPdfArtifact: {
              retainedArtifactPath: 'C:\\tmp\\book_pages_001_020.pdf',
            },
          },
          {
            fileName: 'book_pages_021_040.pdf',
            state: 'success',
            generatedPdfArtifact: {
              retainedArtifactPath: 'C:\\tmp\\book_pages_021_040.pdf',
            },
          },
        ],
      },
    ],
  };

  const promptPromise = harness.prompt({
    report,
    elapsedValueText: '00:42',
  });

  const renderedHtml = harness.elements.textExtractionBatchFinalModalBody.innerHTML;
  assert.match(renderedHtml, /Chapter 3 OCR/);
  assert.match(renderedHtml, /Source file: book\.pdf/);
  assert.doesNotMatch(renderedHtml, /Split result:/);
  assert.match(renderedHtml, /book_pages_001_020\.pdf/);
  assert.match(renderedHtml, /book_pages_021_040\.pdf/);

  harness.elements.textExtractionBatchFinalModalCopy.dispatch('click');
  await Promise.resolve();
  assert.equal(harness.clipboardWrites.length, 1);
  assert.match(harness.clipboardWrites[0], /Chapter 3 OCR/);
  assert.match(harness.clipboardWrites[0], /Source file: book\.pdf/);
  assert.doesNotMatch(harness.clipboardWrites[0], /- book\.pdf(?:\r?\n|$)/);

  harness.elements.textExtractionBatchFinalModalOk.dispatch('click');
  await promptPromise;
});

test('batch final modal renders heavy split overall status when child rows exist', async () => {
  const harness = createHarness();

  const report = {
    flowKind: 'single_file_split',
    hadOutput: false,
    units: [
      {
        unitTitle: 'book.pdf',
        exclusiveHeavy: true,
        sourceFileName: 'book.pdf',
        overallState: 'cancelled',
        overallCode: 'aborted_by_user',
        heavyGeneratedInputRows: true,
        snapshotResult: {
          state: 'not_created',
          text: 'Snapshot not created',
        },
        inputs: [
          {
            fileName: 'book_pages_001_020.pdf',
            state: 'cancelled',
            code: 'aborted_by_user',
          },
          {
            fileName: 'book_pages_021_040.pdf',
            state: 'omitted',
          },
        ],
      },
    ],
  };

  const promptPromise = harness.prompt({
    report,
    elapsedValueText: '00:42',
  });

  const renderedHtml = harness.elements.textExtractionBatchFinalModalBody.innerHTML;
  assert.match(renderedHtml, /book\.pdf/);
  assert.match(renderedHtml, /Split result: cancelled: aborted_by_user/);
  assert.doesNotMatch(renderedHtml, /Source file: book\.pdf/);
  assert.match(renderedHtml, /book_pages_001_020\.pdf \(cancelled: aborted_by_user\)/);
  assert.match(renderedHtml, /book_pages_021_040\.pdf \(Omitted\)/);

  harness.elements.textExtractionBatchFinalModalCopy.dispatch('click');
  await Promise.resolve();
  assert.equal(harness.clipboardWrites.length, 1);
  assert.match(harness.clipboardWrites[0], /Split result: cancelled: aborted_by_user/);
  assert.match(harness.clipboardWrites[0], /- book_pages_001_020\.pdf \(cancelled: aborted_by_user\)/);
  assert.doesNotMatch(harness.clipboardWrites[0], /- book\.pdf(?:\r?\n|$)/);

  harness.elements.textExtractionBatchFinalModalOk.dispatch('click');
  await promptPromise;
});
