'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id) {
  let textContent = '';

  return {
    id,
    hidden: false,
    disabled: false,
    title: '',
    tabIndex: 0,
    attributes: {},
    textContentWriteCount: 0,
    get textContent() {
      return textContent;
    },
    set textContent(value) {
      textContent = String(value);
      this.textContentWriteCount += 1;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function createHarness() {
  let nowMs = 0;
  let nextIntervalId = 1;
  const intervals = new Map();

  const elements = {
    selectorControlsNormal: createElement('selectorControlsNormal'),
    selectorControlsProcessing: createElement('selectorControlsProcessing'),
    textExtractionProcessingLabel: createElement('textExtractionProcessingLabel'),
    textExtractionProcessingFilenameSeparator: createElement('textExtractionProcessingFilenameSeparator'),
    textExtractionProcessingFilename: createElement('textExtractionProcessingFilename'),
    textExtractionProcessingElapsed: createElement('textExtractionProcessingElapsed'),
    btnTextExtractionAbort: createElement('btnTextExtractionAbort'),
  };

  const translations = {
    'renderer.main.processing.text_extraction_placeholder': 'Extracting text...',
    'renderer.main.processing.text_extraction_preparing': 'Preparing extraction route...',
    'renderer.main.processing.text_extraction_waiting_native': 'Extracting text from file...',
    'renderer.main.processing.text_extraction_waiting_ocr': 'Running OCR extraction...',
    'renderer.main.processing.text_extraction_waiting_ocr_delayed': 'Running OCR. Some files take longer.',
    'renderer.main.processing.text_extraction_elapsed': 'Elapsed: ',
    'renderer.main.tooltips.text_extraction_abort': 'Abort extraction',
    'renderer.main.aria.text_extraction_abort': 'Abort text extraction',
  };

  const sandbox = {
    window: {
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
        renderLocalizedLabelWithInvariantValue(container, { labelText, valueText }) {
          container.textContent = `${labelText}${valueText}`;
        },
      },
      setInterval(callback, delayMs) {
        const intervalId = nextIntervalId;
        nextIntervalId += 1;
        intervals.set(intervalId, {
          callback,
          delayMs,
        });
        return intervalId;
      },
      clearInterval(intervalId) {
        intervals.delete(intervalId);
      },
    },
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    Date: {
      now() {
        return nowMs;
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_status_ui.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_status_ui.js' });

  const api = sandbox.window.TextExtractionStatusUi;
  if (!api) {
    throw new Error('TextExtractionStatusUi unavailable in test harness');
  }

  return {
    api,
    elements,
    setNowMs(value) {
      nowMs = value;
    },
    tickElapsedTimer() {
      const activeIntervals = Array.from(intervals.values());
      assert.equal(activeIntervals.length, 1);
      activeIntervals[0].callback();
    },
  };
}

test('prepare state shows row 1 status plus filename and hides elapsed row', () => {
  const harness = createHarness();

  harness.api.beginPrepare({
    filePath: 'C:\\docs\\quarterly report.pdf',
  });

  assert.equal(harness.elements.selectorControlsNormal.hidden, true);
  assert.equal(harness.elements.selectorControlsProcessing.hidden, false);
  assert.equal(
    harness.elements.textExtractionProcessingLabel.textContent,
    'Preparing extraction route...'
  );
  assert.equal(harness.elements.textExtractionProcessingFilenameSeparator.hidden, false);
  assert.equal(harness.elements.textExtractionProcessingFilename.hidden, false);
  assert.equal(
    harness.elements.textExtractionProcessingFilename.textContent,
    'quarterly report.pdf'
  );
  assert.equal(
    harness.elements.textExtractionProcessingFilename.title,
    'quarterly report.pdf'
  );
  assert.equal(harness.elements.textExtractionProcessingElapsed.hidden, true);
  assert.equal(harness.elements.btnTextExtractionAbort.hidden, true);
});

test('prepared payload filename refreshes the displayed basename and missing filename hides separator', () => {
  const harness = createHarness();

  harness.api.beginPrepare({
    filePath: 'C:\\docs\\draft-name.pdf',
  });

  assert.equal(
    harness.elements.textExtractionProcessingFilename.textContent,
    'draft-name.pdf'
  );

  harness.api.setPendingExecutionContext({
    routePreference: 'native',
    preparation: {
      preparedPayload: {
        fileInfo: {
          fileName: 'C:\\docs\\report-final.pdf',
        },
      },
    },
  });

  assert.equal(harness.elements.textExtractionProcessingFilenameSeparator.hidden, false);
  assert.equal(
    harness.elements.textExtractionProcessingFilename.textContent,
    'report-final.pdf'
  );

  harness.api.endPrepare();
  harness.api.clearPendingExecutionContext();
  harness.api.beginPrepare({});

  assert.equal(harness.elements.textExtractionProcessingFilenameSeparator.hidden, true);
  assert.equal(harness.elements.textExtractionProcessingFilename.hidden, true);
  assert.equal(harness.elements.textExtractionProcessingFilename.textContent, '');
});

test('execution state shows route-aware row 1 and elapsed-only row 2', () => {
  const harness = createHarness();

  harness.api.beginPrepare({
    filePath: 'C:\\docs\\scan.png',
  });
  harness.api.endPrepare();
  harness.api.setPendingExecutionContext({
    routePreference: 'ocr',
    fileName: 'scan.png',
  });
  harness.setNowMs(1000);
  harness.api.applyProcessingModeState({
    active: true,
    lockId: 7,
    sinceEpochMs: 1000,
  }, { source: 'test' });

  assert.equal(
    harness.elements.textExtractionProcessingLabel.textContent,
    'Running OCR extraction...'
  );
  assert.equal(harness.elements.textExtractionProcessingFilename.textContent, 'scan.png');
  assert.equal(harness.elements.textExtractionProcessingElapsed.hidden, false);
  assert.equal(harness.elements.textExtractionProcessingElapsed.textContent, 'Elapsed: 00:00');
  assert.equal(harness.elements.btnTextExtractionAbort.hidden, false);
  assert.equal(harness.elements.btnTextExtractionAbort.disabled, false);
});

test('explicit fileName path-like input is constrained to basename before display', () => {
  const harness = createHarness();

  harness.api.beginPrepare({
    fileName: '  /tmp/nested/folder/mixed-name.docx  ',
  });

  assert.equal(
    harness.elements.textExtractionProcessingFilename.textContent,
    'mixed-name.docx'
  );
  assert.equal(
    harness.elements.textExtractionProcessingFilename.title,
    'mixed-name.docx'
  );
});

test('elapsed timer updates only row 2 until delayed OCR copy threshold is reached', () => {
  const harness = createHarness();

  harness.api.beginPrepare({
    filePath: 'C:\\docs\\very-long-name.tiff',
  });
  harness.api.endPrepare();
  harness.api.setPendingExecutionContext({
    routePreference: 'ocr',
    fileName: 'very-long-name.tiff',
  });
  harness.setNowMs(1000);
  harness.api.applyProcessingModeState({
    active: true,
    lockId: 1,
    sinceEpochMs: 1000,
  }, { source: 'test' });

  const initialLabelWrites = harness.elements.textExtractionProcessingLabel.textContentWriteCount;
  const initialFilenameWrites = harness.elements.textExtractionProcessingFilename.textContentWriteCount;
  const initialElapsedWrites = harness.elements.textExtractionProcessingElapsed.textContentWriteCount;

  harness.setNowMs(2250);
  harness.tickElapsedTimer();

  assert.equal(
    harness.elements.textExtractionProcessingLabel.textContent,
    'Running OCR extraction...'
  );
  assert.equal(
    harness.elements.textExtractionProcessingLabel.textContentWriteCount,
    initialLabelWrites
  );
  assert.equal(
    harness.elements.textExtractionProcessingFilename.textContentWriteCount,
    initialFilenameWrites
  );
  assert.ok(
    harness.elements.textExtractionProcessingElapsed.textContentWriteCount > initialElapsedWrites
  );
  assert.equal(harness.elements.textExtractionProcessingElapsed.textContent, 'Elapsed: 00:01');

  harness.setNowMs(61000);
  harness.tickElapsedTimer();

  assert.equal(
    harness.elements.textExtractionProcessingLabel.textContent,
    'Running OCR. Some files take longer.'
  );
  assert.ok(
    harness.elements.textExtractionProcessingLabel.textContentWriteCount > initialLabelWrites
  );
  assert.equal(
    harness.elements.textExtractionProcessingFilename.textContentWriteCount,
    initialFilenameWrites
  );
});

test('terminal states clear filename context and hide the bar', () => {
  const harness = createHarness();

  harness.api.beginPrepare({
    filePath: 'C:\\docs\\failure.pdf',
  });
  harness.api.endPrepare();
  harness.api.clearPendingExecutionContext();

  assert.equal(harness.elements.selectorControlsProcessing.hidden, true);
  assert.equal(harness.elements.textExtractionProcessingFilename.hidden, true);
  assert.equal(harness.elements.textExtractionProcessingFilename.textContent, '');

  harness.api.beginPrepare({
    filePath: 'C:\\docs\\success.pdf',
  });
  harness.api.endPrepare();
  harness.api.setPendingExecutionContext({
    routePreference: 'native',
    fileName: 'success.pdf',
  });
  harness.setNowMs(5000);
  harness.api.applyProcessingModeState({
    active: true,
    lockId: 9,
    sinceEpochMs: 2000,
  }, { source: 'test' });
  harness.api.applyProcessingModeState({
    active: false,
    lockId: 9,
    sinceEpochMs: null,
  }, { source: 'test_complete' });

  assert.equal(harness.elements.selectorControlsProcessing.hidden, true);
  assert.equal(harness.elements.textExtractionProcessingFilename.hidden, true);
  assert.equal(harness.elements.textExtractionProcessingFilename.textContent, '');
  assert.equal(harness.elements.textExtractionProcessingElapsed.hidden, true);
});
