'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness({
  inspectResult = null,
  pdfOptionsImpl = null,
  pdfOptionsResponses = null,
  routeChoiceImpl = null,
  singleFileHeavyImpl = null,
  singleFileHeavyResponses = null,
  requestPreparedImportResult = null,
  requestPreparedImportImpl = null,
  executePreparedTextExtractionResult = null,
  applyChoice = null,
  applyChoiceImpl = null,
  applyTextViaCanonicalPathResult = null,
  checkTextExtractionPreconditionsImpl = null,
  openTextExtractionPickerImpl = null,
  resolveDroppedFilePathImpl = null,
  startFromSelectedFilesImpl = null,
  startSyntheticSingleFileHeavySplitImpl = null,
  maybeRecoverTextExtractionOcrSetupAndRetryImpl = null,
} = {}) {
  let capturedSingleFileHeavyOptions = null;
  let capturedApplyPromptOptions = null;
  const applyPayloads = [];
  const notifications = [];
  const toasts = [];
  let pdfOptionsPromptCount = 0;
  let singleFileHeavyPromptCount = 0;
  let executePreparedTextExtractionCallCount = 0;
  let checkTextExtractionPreconditionsCallCount = 0;
  let openTextExtractionPickerCallCount = 0;
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
        toastMain(key) {
          toasts.push(key);
        },
        async promptTextExtractionPdfOptions(options) {
          pdfOptionsPromptCount += 1;
          if (typeof pdfOptionsImpl === 'function') {
            return pdfOptionsImpl({
              options,
              promptCount: pdfOptionsPromptCount,
            });
          }
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
        async promptTextExtractionRouteChoice(options) {
          if (typeof routeChoiceImpl === 'function') {
            return routeChoiceImpl(options);
          }
          return null;
        },
        async promptTextExtractionSingleFileHeavyPdf(options) {
          capturedSingleFileHeavyOptions = options;
          singleFileHeavyPromptCount += 1;
          if (typeof singleFileHeavyImpl === 'function') {
            return singleFileHeavyImpl(options);
          }
          if (nextSingleFileHeavyResponses && nextSingleFileHeavyResponses.length) {
            return nextSingleFileHeavyResponses.shift();
          }
          return 'cancel';
        },
        async promptTextExtractionApplyChoice(options) {
          capturedApplyPromptOptions = options;
          if (typeof applyChoiceImpl === 'function') {
            return applyChoiceImpl(options);
          }
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
        return async () => {
          checkTextExtractionPreconditionsCallCount += 1;
          if (typeof checkTextExtractionPreconditionsImpl === 'function') {
            return checkTextExtractionPreconditionsImpl();
          }
          return { ok: true, canStart: true };
        };
      }
      if (methodName === 'openTextExtractionPicker') {
        return async () => {
          openTextExtractionPickerCallCount += 1;
          if (typeof openTextExtractionPickerImpl === 'function') {
            return openTextExtractionPickerImpl();
          }
          return { ok: true, canceled: true };
        };
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
      async startFromSelectedFiles(payload) {
        if (typeof startFromSelectedFilesImpl === 'function') {
          return startFromSelectedFilesImpl(payload);
        }
      },
      async startSyntheticSingleFileHeavySplit(payload) {
        if (typeof startSyntheticSingleFileHeavySplitImpl === 'function') {
          return startSyntheticSingleFileHeavySplitImpl(payload);
        }
      },
    },
    isLatestTextExtractionPrepareAttempt() {
      return true;
    },
    async maybeRecoverTextExtractionOcrSetupAndRetry(options) {
      if (typeof maybeRecoverTextExtractionOcrSetupAndRetryImpl === 'function') {
        return maybeRecoverTextExtractionOcrSetupAndRetryImpl(options);
      }
      const { preparation } = options;
      return { preparation };
    },
    async requestPreparedImport(options) {
      if (typeof requestPreparedImportImpl === 'function') {
        return requestPreparedImportImpl(options);
      }
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
    resolveDroppedFilePath(file) {
      if (typeof resolveDroppedFilePathImpl === 'function') {
        return resolveDroppedFilePathImpl(file);
      }
      return '';
    },
  });

  return {
    entry,
    notifications,
    toasts,
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
    getCheckTextExtractionPreconditionsCallCount() {
      return checkTextExtractionPreconditionsCallCount;
    },
    getOpenTextExtractionPickerCallCount() {
      return openTextExtractionPickerCallCount;
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

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('entry admits one independent file operation until preflight and terminal handling settle', async () => {
  const preconditions = createDeferred();
  const harness = createHarness({
    checkTextExtractionPreconditionsImpl() {
      return preconditions.promise;
    },
  });
  assert.equal(harness.entry.isCurrentOperation(null), false);

  const first = harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\first.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 1);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\second.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 1);
  assert.deepEqual(harness.toasts, ['renderer.text_extraction.alerts.operation_in_progress']);

  preconditions.resolve({ ok: true, canStart: true });
  await first;

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\third.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 2);
});

test('picker cancellation releases admission after its native-picker promise settles', async () => {
  const picker = createDeferred();
  const harness = createHarness({
    openTextExtractionPickerImpl() {
      return picker.promise;
    },
  });

  const first = harness.entry.startFromPicker();
  assert.equal(harness.getOpenTextExtractionPickerCallCount(), 1);

  await harness.entry.startFromPicker();
  assert.equal(harness.getOpenTextExtractionPickerCallCount(), 1);
  assert.deepEqual(harness.toasts, ['renderer.text_extraction.alerts.operation_in_progress']);

  picker.resolve({ ok: true, canceled: true });
  await first;
  await harness.entry.startFromPicker();
  assert.equal(harness.getOpenTextExtractionPickerCallCount(), 2);
});

test('dropped-file admission begins before asynchronous path resolution', async () => {
  const droppedPath = createDeferred();
  let resolverCallCount = 0;
  const harness = createHarness({
    resolveDroppedFilePathImpl() {
      resolverCallCount += 1;
      return droppedPath.promise;
    },
  });

  const first = harness.entry.startFromDroppedFiles({
    files: [{ name: 'first.pdf' }],
    source: 'drop',
  });
  assert.equal(resolverCallCount, 1);

  await harness.entry.startFromDroppedFiles({
    files: [{ name: 'second.pdf' }],
    source: 'drop',
  });
  assert.equal(resolverCallCount, 1);
  assert.deepEqual(harness.toasts, ['renderer.text_extraction.alerts.operation_in_progress']);

  droppedPath.resolve('C:\\docs\\first.pdf');
  await first;
});

test('batch handoff retains the admitted operation until Batch settles', async () => {
  const batchCompletion = createDeferred();
  let batchOperation = null;
  const harness = createHarness({
    startFromSelectedFilesImpl({ operation }) {
      batchOperation = operation;
      return batchCompletion.promise;
    },
  });

  const first = harness.entry.startFromFilePaths({
    filePaths: ['C:\\docs\\first.pdf', 'C:\\docs\\second.pdf'],
    source: 'test',
  });
  assert.ok(batchOperation);
  assert.equal(harness.entry.isCurrentOperation(batchOperation), true);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\third.pdf',
    source: 'test',
  });
  assert.deepEqual(harness.toasts, ['renderer.text_extraction.alerts.operation_in_progress']);

  batchCompletion.resolve();
  await first;
  assert.equal(harness.entry.isCurrentOperation(batchOperation), false);
});

test('single-file apply-choice dismissal retains admission until the terminal prompt closes', async () => {
  const applyChoiceOpened = createDeferred();
  const applyChoiceDismissal = createDeferred();
  const harness = createHarness({
    applyChoiceImpl(options) {
      applyChoiceOpened.resolve(options);
      return applyChoiceDismissal.promise;
    },
    executePreparedTextExtractionResult: {
      ok: true,
      result: {
        state: 'success',
        text: 'Extracted text',
        textApplicability: 'applicable',
        error: null,
      },
    },
  });

  const first = harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\first.pdf',
    source: 'test',
  });
  await applyChoiceOpened.promise;
  assert.equal(harness.entry.isOperationActive(), true);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\second.pdf',
    source: 'test',
  });
  assert.deepEqual(harness.toasts, ['renderer.text_extraction.alerts.operation_in_progress']);

  applyChoiceDismissal.resolve(null);
  await first;
  assert.equal(harness.entry.isOperationActive(), false);
  assert.deepEqual(harness.getApplyPayloads(), []);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\third.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 2);
});

test('stale preparation discard releases admission for the next independent request', async () => {
  const harness = createHarness({
    requestPreparedImportResult: {
      attemptId: 1,
      stale: true,
      preparation: null,
    },
  });

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\first.pdf',
    source: 'test',
  });
  assert.equal(harness.entry.isOperationActive(), false);
  assert.equal(harness.getExecutePreparedTextExtractionCallCount(), 0);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\second.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 2);
});

test('route-choice prompt failure is reported instead of treated as cancellation', async () => {
  const routeChoiceError = new Error('Route-choice modal DOM elements missing.');
  const harness = createHarness({
    routeChoiceImpl() {
      throw routeChoiceError;
    },
    requestPreparedImportResult: {
      attemptId: 1,
      preparation: {
        ok: true,
        prepareReady: true,
        prepareFailed: false,
        prepareId: 'prepare-1',
        requiresRouteChoice: true,
        fileInfo: {
          fileName: 'book.pdf',
          sourceFileSizeBytes: 0,
        },
        routeChoiceOptions: ['native', 'ocr'],
        routeMetadata: {
          chosenRoute: null,
          availableRoutes: ['native', 'ocr'],
          heavySplitEligible: false,
        },
      },
    },
  });

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });

  assert.deepEqual(harness.notifications, ['renderer.text_extraction.alerts.route_choice_error']);
  assert.equal(harness.getExecutePreparedTextExtractionCallCount(), 0);
});

test('PDF-options and apply prompt failures are reported instead of treated as cancellation', async () => {
  const pdfOptionsHarness = createHarness({
    pdfOptionsImpl() {
      throw new Error('PDF options modal DOM elements missing.');
    },
  });
  await pdfOptionsHarness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });
  assert.deepEqual(pdfOptionsHarness.notifications, ['renderer.text_extraction.alerts.start_error']);
  assert.equal(pdfOptionsHarness.getExecutePreparedTextExtractionCallCount(), 0);

  const applyHarness = createHarness({
    applyChoiceImpl() {
      throw new Error('Apply modal DOM elements missing.');
    },
    executePreparedTextExtractionResult: {
      ok: true,
      result: {
        state: 'success',
        text: 'Extracted text',
        textApplicability: 'applicable',
        error: null,
      },
    },
  });
  await applyHarness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });
  assert.deepEqual(applyHarness.notifications, ['renderer.text_extraction.alerts.apply_error']);
  assert.deepEqual(applyHarness.getApplyPayloads(), []);
});

test('Case B heavy-PDF recovery prompt failures use recovery-specific reporting', async () => {
  const harness = createHarness({
    singleFileHeavyImpl() {
      throw new Error('Single-file heavy PDF modal DOM elements missing.');
    },
  });

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });

  assert.deepEqual(harness.notifications, ['renderer.text_extraction.alerts.heavy_pdf_recovery_error']);
  assert.equal(harness.getSingleFileHeavyPromptCount(), 1);
});

test('entry releases admission when an unexpected Batch continuation rejection escapes', async () => {
  const harness = createHarness({
    startFromSelectedFilesImpl() {
      return Promise.reject(new Error('Batch continuation failed unexpectedly'));
    },
  });

  await assert.rejects(
    harness.entry.startFromFilePaths({
      filePaths: ['C:\\docs\\first.pdf', 'C:\\docs\\second.pdf'],
      source: 'test',
    }),
    /Batch continuation failed unexpectedly/
  );
  assert.equal(harness.entry.isOperationActive(), false);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\third.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 1);
});

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

test('recursive PDF page re-entry retains admission until the returned-to prompt is dismissed', async () => {
  const returnedToPdfOptions = createDeferred();
  const returnedToPdfOptionsOpened = createDeferred();
  const allPagesPdfOptions = {
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
  };
  const harness = createHarness({
    pdfOptionsImpl({ promptCount }) {
      if (promptCount === 1) {
        return allPagesPdfOptions;
      }
      returnedToPdfOptionsOpened.resolve();
      return returnedToPdfOptions.promise;
    },
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

  const first = harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });
  await returnedToPdfOptionsOpened.promise;
  assert.equal(harness.entry.isOperationActive(), true);
  assert.equal(harness.getPdfOptionsPromptCount(), 2);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\second.pdf',
    source: 'test',
  });
  assert.deepEqual(harness.toasts, ['renderer.text_extraction.alerts.operation_in_progress']);

  returnedToPdfOptions.resolve(null);
  await first;
  assert.equal(harness.entry.isOperationActive(), false);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\third.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 3);
});

test('OCR recovery retry retains the original admission through route recovery', async () => {
  const recoveryStarted = createDeferred();
  const recoveryCompletion = createDeferred();
  const recoveryCalls = [];
  const initialPreparation = {
    ok: true,
    prepareReady: true,
    prepareFailed: false,
    prepareId: 'prepare-1',
    requiresRouteChoice: true,
    fileInfo: {
      fileName: 'book.pdf',
      sourceFileSizeBytes: 458 * 1024 * 1024,
    },
    routeChoiceOptions: ['native', 'ocr'],
    routeMetadata: {
      chosenRoute: '',
      availableRoutes: ['native', 'ocr'],
      heavySplitEligible: false,
    },
  };
  const recoveredPreparation = {
    ...initialPreparation,
    prepareId: 'prepare-2',
    requiresRouteChoice: false,
    routeMetadata: {
      ...initialPreparation.routeMetadata,
      chosenRoute: 'ocr',
    },
  };
  const harness = createHarness({
    routeChoiceImpl() {
      return 'ocr';
    },
    maybeRecoverTextExtractionOcrSetupAndRetryImpl(options) {
      recoveryCalls.push(options);
      if (options.routePreference === 'ocr') {
        recoveryStarted.resolve();
        return recoveryCompletion.promise;
      }
      return { preparation: options.preparation };
    },
    requestPreparedImportResult: {
      attemptId: 1,
      preparation: initialPreparation,
    },
  });

  const first = harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });
  await recoveryStarted.promise;
  assert.equal(harness.entry.isOperationActive(), true);
  assert.equal(recoveryCalls.length, 2);
  assert.equal(recoveryCalls[1].routePreference, 'ocr');

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\second.pdf',
    source: 'test',
  });
  assert.deepEqual(harness.toasts, ['renderer.text_extraction.alerts.operation_in_progress']);

  recoveryCompletion.resolve({
    preparationRun: {
      attemptId: 2,
      preparation: recoveredPreparation,
    },
  });
  await first;
  assert.equal(harness.entry.isOperationActive(), false);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\third.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 2);
});

test('single-file heavy-split handoff retains the admitted operation until Batch returns', async () => {
  const batchCompletion = createDeferred();
  const batchStarted = createDeferred();
  let batchOperation = null;
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
    ],
    singleFileHeavyResponses: ['split'],
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
    startSyntheticSingleFileHeavySplitImpl({ operation }) {
      batchOperation = operation;
      batchStarted.resolve();
      return batchCompletion.promise;
    },
  });

  const first = harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\book.pdf',
    source: 'test',
  });
  await batchStarted.promise;
  assert.ok(batchOperation);
  assert.equal(harness.entry.isCurrentOperation(batchOperation), true);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\second.pdf',
    source: 'test',
  });
  assert.deepEqual(harness.toasts, ['renderer.text_extraction.alerts.operation_in_progress']);

  batchCompletion.resolve();
  await first;
  assert.equal(harness.entry.isCurrentOperation(batchOperation), false);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\third.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 2);
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
  assert.equal(harness.entry.isOperationActive(), false);

  await harness.entry.startFromFilePath({
    filePath: 'C:\\docs\\second.pdf',
    source: 'test',
  });
  assert.equal(harness.getCheckTextExtractionPreconditionsCallCount(), 2);
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
