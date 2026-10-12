'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness({
  inspectResult = null,
  pdfOptionsResponses = null,
  singleFileHeavyResponses = null,
  requestPreparedImportResult = null,
  executePreparedTextExtractionResult = null,
  applyChoice = null,
  applyTextViaCanonicalPathResult = null,
} = {}) {
  let capturedSingleFileHeavyOptions = null;
  let capturedApplyPromptOptions = null;
  const applyPayloads = [];
  const notifications = [];
  let pdfOptionsPromptCount = 0;
  let singleFileHeavyPromptCount = 0;
  let executePreparedTextExtractionCallCount = 0;
  let syncMainInteractionLockUiCallCount = 0;
  let abortFinalizationActive = false;
  const nextPdfOptionsResponses = Array.isArray(pdfOptionsResponses)
    ? [...pdfOptionsResponses]
    : null;
  const nextSingleFileHeavyResponses = Array.isArray(singleFileHeavyResponses)
    ? [...singleFileHeavyResponses]
    : null;

  const sandbox = {
    window: {
      AppConstants: {
        MAX_CLIPBOARD_REPEAT: 100,
      },
      Notify: {
        notifyMain(key) {
          notifications.push(key);
        },
        async promptTextExtractionPdfOptions() {
          pdfOptionsPromptCount += 1;
          if (nextPdfOptionsResponses && nextPdfOptionsResponses.length) {
            return nextPdfOptionsResponses.shift();
          }
          return {
            pdfPageSelection: {
              mode: 'range',
              fromPage: 100,
              toPage: 220,
              selectedPageCount: 121,
              totalPages: 516,
            },
            generatedPdfArtifactPolicy: {
              mode: 'delete',
            },
          };
        },
        async promptTextExtractionSingleFileHeavyPdf(options) {
          capturedSingleFileHeavyOptions = options;
          singleFileHeavyPromptCount += 1;
          if (nextSingleFileHeavyResponses && nextSingleFileHeavyResponses.length) {
            return nextSingleFileHeavyResponses.shift();
          }
          return 'cancel';
        },
        async promptTextExtractionApplyChoice(options) {
          capturedApplyPromptOptions = options;
          return applyChoice;
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
          return key;
        },
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_entry.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_entry.js' });

  const entry = sandbox.window.TextExtractionEntry;
  const textExtractionStatusUi = {
    applyProcessingModeState() {},
    beginAbortFinalization() {
      abortFinalizationActive = true;
    },
    clearPendingExecutionContext() {},
    endAbortFinalization() {
      abortFinalizationActive = false;
    },
    getFinalElapsedValueText() {
      return '0:01';
    },
    isAbortFinalizationActive() {
      return abortFinalizationActive;
    },
    setPendingExecutionContext() {},
  };
  entry.configure({
    getClipboardRepeatCount() {
      return 1;
    },
    async applyTextViaCanonicalPath(payload) {
      applyPayloads.push(payload);
      return applyTextViaCanonicalPathResult || { ok: true };
    },
    getOcrLanguage() {
      return 'en';
    },
    getOptionalElectronMethod(methodName) {
      if (methodName === 'checkTextExtractionPreconditions') {
        return async () => ({ ok: true, canStart: true });
      }
      if (methodName === 'inspectTextExtractionSelectedFile') {
        return async () => (inspectResult || {
          ok: true,
          isPdf: true,
          totalPages: 516,
          fileInfo: {
            fileName: 'book.pdf',
          },
        });
      }
      if (methodName === 'prepareTextExtractionSelectedFile') {
        return async () => ({ ok: true });
      }
      if (methodName === 'executePreparedTextExtraction') {
        return async () => {
          executePreparedTextExtractionCallCount += 1;
          return executePreparedTextExtractionResult || {
            ok: true,
            result: {
              state: 'failure',
              processingInputFileName: 'book_pages_100_220.pdf',
              pdfPageSelection: {
                mode: 'range',
                fromPage: 100,
                toPage: 220,
              },
              error: {
                code: 'ocr_input_too_large',
                detailsSafeForLogs: {
                  effectiveInputSizeBytes: 72.4 * 1024 * 1024,
                  providerLimitBytes: 50 * 1024 * 1024,
                },
              },
            },
          };
        };
      }
      return null;
    },
    guardUserAction() {
      return true;
    },
    hasBlockingModalOpen() {
      return false;
    },
    hasCurrentTextSubscription() {
      return true;
    },
    syncMainInteractionLockUi() {
      syncMainInteractionLockUiCallCount += 1;
    },
    textExtractionStatusUi,
    textExtractionBatchFlow: {
      async startFromSelectedFiles() {},
      async startSyntheticSingleFileHeavySplit() {},
    },
    isLatestTextExtractionPrepareAttempt() {
      return true;
    },
    async maybeRecoverTextExtractionOcrSetupAndRetry({ preparation }) {
      return { preparation };
    },
    async requestPreparedImport() {
      return requestPreparedImportResult || {
        attemptId: 1,
        preparation: {
          ok: true,
          prepareReady: true,
          prepareFailed: false,
          prepareId: 'prepare-1',
          fileInfo: {
            fileName: 'book.pdf',
            sourceFileSizeBytes: 458 * 1024 * 1024,
          },
          routeChoiceOptions: ['native', 'ocr'],
          routeMetadata: {
            chosenRoute: 'ocr',
            availableRoutes: ['native', 'ocr'],
            heavySplitEligible: false,
          },
        },
      };
    },
  });

  return {
    entry,
    notifications,
    getCapturedSingleFileHeavyOptions() {
      return capturedSingleFileHeavyOptions;
    },
    getCapturedApplyPromptOptions() {
      return capturedApplyPromptOptions;
    },
    getApplyPayloads() {
      return applyPayloads.map((payload) => ({ ...payload }));
    },
    getPdfOptionsPromptCount() {
      return pdfOptionsPromptCount;
    },
    getSingleFileHeavyPromptCount() {
      return singleFileHeavyPromptCount;
    },
    getExecutePreparedTextExtractionCallCount() {
      return executePreparedTextExtractionCallCount;
    },
    getSyncMainInteractionLockUiCallCount() {
      return syncMainInteractionLockUiCallCount;
    },
    isAbortFinalizationActive() {
      return abortFinalizationActive;
    },
    textExtractionStatusUi,
  };
}

test('single-file entry passes source file size into the Case B heavy-PDF modal payload', async () => {
  const harness = createHarness();

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });

  assert.deepEqual(harness.notifications, []);
  const modalOptions = harness.getCapturedSingleFileHeavyOptions();
  assert.ok(modalOptions);
  assert.equal(modalOptions.caseKind, 'case_b');
  assert.equal(modalOptions.sourceFileName, 'book.pdf');
  assert.equal(modalOptions.sourceFileSizeBytes, 458 * 1024 * 1024);
  assert.equal(modalOptions.selectedRangeFromPage, 100);
  assert.equal(modalOptions.selectedRangeToPage, 220);
  assert.equal(modalOptions.generatedPdfFileName, 'book_pages_100_220.pdf');
  assert.equal(modalOptions.generatedPdfSizeBytes, 72.4 * 1024 * 1024);
  assert.equal(modalOptions.providerLimitBytes, 50 * 1024 * 1024);
  assert.equal(modalOptions.canUseNative, true);
  assert.equal(modalOptions.retainedGeneratedPdf, null);
  assert.equal(modalOptions.onRevealGeneratedPdf, null);
});

test('single-file entry returns to PDF options from the Case A heavy-PDF modal', async () => {
  const harness = createHarness({
    pdfOptionsResponses: [
      {
        pdfPageSelection: {
          mode: 'all',
          fromPage: 1,
          toPage: 516,
          selectedPageCount: 516,
          totalPages: 516,
        },
        generatedPdfArtifactPolicy: {
          mode: 'delete',
        },
      },
      null,
    ],
    singleFileHeavyResponses: ['return_to_pages'],
    requestPreparedImportResult: {
      attemptId: 1,
      preparation: {
        ok: true,
        prepareReady: true,
        prepareFailed: false,
        prepareId: 'prepare-1',
        fileInfo: {
          fileName: 'book.pdf',
          sourceFileSizeBytes: 458 * 1024 * 1024,
        },
        routeChoiceOptions: ['native', 'ocr'],
        routeMetadata: {
          chosenRoute: 'ocr',
          availableRoutes: ['native', 'ocr'],
          pdfTotalPages: 516,
          ocrProviderLimitBytes: 50 * 1024 * 1024,
          heavySplitEligible: true,
        },
      },
    },
  });

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });

  assert.deepEqual(harness.notifications, []);
  assert.equal(harness.getPdfOptionsPromptCount(), 2);
  assert.equal(harness.getSingleFileHeavyPromptCount(), 1);
  assert.equal(harness.getExecutePreparedTextExtractionCallCount(), 0);
  const modalOptions = harness.getCapturedSingleFileHeavyOptions();
  assert.ok(modalOptions);
  assert.equal(modalOptions.caseKind, 'case_a');
  assert.equal(modalOptions.sourceFileName, 'book.pdf');
  assert.equal(modalOptions.sourceFileSizeBytes, 458 * 1024 * 1024);
  assert.equal(modalOptions.totalPages, 516);
  assert.equal(modalOptions.providerLimitBytes, 50 * 1024 * 1024);
});

test('single-file cancellation finishes abort finalization only after execution settles', async () => {
  const harness = createHarness({
    executePreparedTextExtractionResult: {
      ok: true,
      primaryAlertKey: 'renderer.text_extraction.alerts.ocr.cancelled',
      result: {
        state: 'cancelled',
        text: '',
        error: {
          code: 'aborted_by_user',
        },
      },
    },
  });

  harness.textExtractionStatusUi.beginAbortFinalization();
  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });

  assert.equal(harness.isAbortFinalizationActive(), false);
  assert.equal(harness.getSyncMainInteractionLockUiCallCount(), 1);
  assert.deepEqual(
    harness.notifications,
    ['renderer.text_extraction.alerts.cancellation_complete']
  );
});

test('single-file no-text success opens the informational prompt but never applies text', async () => {
  const harness = createHarness({
    applyChoice: { mode: 'overwrite', repetitions: 1 },
    executePreparedTextExtractionResult: {
      ok: true,
      result: {
        state: 'success',
        text: ' \n\t ',
        textApplicability: 'no_text',
        error: null,
      },
    },
  });

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });

  assert.equal(harness.getCapturedApplyPromptOptions().textApplicability, 'no_text');
  assert.deepEqual(harness.getApplyPayloads(), []);
  assert.deepEqual(harness.notifications, []);
});

test('single-file malformed nominal success fails closed instead of opening no-text prompt', async () => {
  const harness = createHarness({
    executePreparedTextExtractionResult: {
      ok: true,
      result: {
        state: 'success',
        text: '',
        error: null,
      },
    },
  });

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });

  assert.equal(harness.getCapturedApplyPromptOptions(), null);
  assert.deepEqual(harness.getApplyPayloads(), []);
  assert.deepEqual(harness.notifications, ['renderer.text_extraction.alerts.apply_error']);
});

test('single-file rejects a success whose applicability contradicts its text', async () => {
  const harness = createHarness({
    executePreparedTextExtractionResult: {
      ok: true,
      result: {
        state: 'success',
        text: ' \n\t ',
        textApplicability: 'applicable',
        error: null,
      },
    },
  });

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });

  assert.equal(harness.getCapturedApplyPromptOptions(), null);
  assert.deepEqual(harness.getApplyPayloads(), []);
  assert.deepEqual(harness.notifications, ['renderer.text_extraction.alerts.apply_error']);
});

test('single-file entry shows the OCR image-upload alert without opening the heavy-PDF modal', async () => {
  const harness = createHarness({
    inspectResult: {
      ok: true,
      isPdf: false,
      fileInfo: {
        fileName: 'scan.png',
      },
    },
    requestPreparedImportResult: {
      attemptId: 1,
      preparation: {
        ok: true,
        prepareReady: true,
        prepareFailed: false,
        prepareId: 'prepare-1',
        fileInfo: {
          fileName: 'scan.png',
          sourceFileSizeBytes: 8 * 1024 * 1024,
        },
        routeChoiceOptions: ['ocr'],
        routeMetadata: {
          chosenRoute: 'ocr',
          availableRoutes: ['ocr'],
          heavySplitEligible: false,
        },
      },
    },
    executePreparedTextExtractionResult: {
      ok: true,
      primaryAlertKey: 'renderer.text_extraction.alerts.ocr.image_upload_too_large',
      result: {
        state: 'failure',
        processingInputFileName: 'scan.png',
        error: {
          code: 'ocr_image_upload_too_large',
          detailsSafeForLogs: {
            effectiveInputSizeBytes: 10 * 1024 * 1024,
            providerLimitBytes: 10 * 1024 * 1024,
          },
        },
      },
    },
  });

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\scan.png',
    source: 'test',
  });

  assert.deepEqual(
    harness.notifications,
    ['renderer.text_extraction.alerts.ocr.image_upload_too_large']
  );
  assert.equal(harness.getCapturedSingleFileHeavyOptions(), null);
  assert.equal(harness.getExecutePreparedTextExtractionCallCount(), 1);
});
