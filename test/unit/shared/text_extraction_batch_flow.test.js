'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness({
  preparationsByPath,
  ocrAvailabilityResult = { ok: true, available: true, state: 'ready', code: '' },
  promptBatchPlanResult = null,
  onPromptBatchPlan = null,
  executionResultsByProcessingInputFileName = {},
}) {
  let capturedViewModel = null;
  let capturedController = null;
  let capturedFinalReport = null;
  const notifications = [];
  let snapshotTagsPromptOptions = null;
  let ocrAvailabilityCallCount = 0;
  let savedSnapshotPayload = null;

  function buildAllPagesSelection(totalPages) {
    const safeTotalPages = Number(totalPages) || 1;
    return {
      mode: 'all',
      fromPage: 1,
      toPage: safeTotalPages,
      selectedPageCount: safeTotalPages,
      totalPages: safeTotalPages,
    };
  }

  const textExtractionStatusUi = {
    beginPrepare() {},
    endPrepare() {},
    setPendingExecutionContext() {},
    clearPendingExecutionContext() {},
    getFinalElapsedValueText() {
      return '00:42';
    },
  };

  const sandbox = {
    window: {
      Notify: {
        notifyMain(key) {
          notifications.push(key);
        },
        async promptTextExtractionBatchPlan({ controller }) {
          capturedViewModel = controller.getViewModel();
          capturedController = controller;
          if (typeof onPromptBatchPlan === 'function') {
            await onPromptBatchPlan(controller);
          }
          return promptBatchPlanResult;
        },
        async promptSnapshotSaveTags(options) {
          snapshotTagsPromptOptions = options;
          return { tags: { language: 'en' } };
        },
        async promptTextExtractionBatchFinalReport({ report }) {
          capturedFinalReport = report;
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
          const translations = {
            'renderer.text_extraction.batch_plan.pages_all': 'All pages',
            'renderer.text_extraction.batch_plan.tags_none': 'No tags',
            'renderer.text_extraction.batch_plan.unit_label': 'Unit {index}',
          };
          return translations[key] || key;
        },
      },
      TextExtractionPdfPageSelection: {
        buildAllPagesSelection,
        canonicalizePageSelection(selection, { totalPages } = {}) {
          const safeTotalPages = Number(totalPages) || 1;
          if (!selection || selection.mode !== 'range') {
            return buildAllPagesSelection(safeTotalPages);
          }
          const fromPage = Number(selection.fromPage);
          const toPage = Number(selection.toPage);
          if (!Number.isInteger(fromPage)
            || !Number.isInteger(toPage)
            || fromPage < 1
            || toPage < fromPage
            || toPage > safeTotalPages) {
            return null;
          }
          return {
            mode: 'range',
            fromPage,
            toPage,
            selectedPageCount: (toPage - fromPage) + 1,
            totalPages: safeTotalPages,
          };
        },
      },
      SnapshotTagCatalog: {
        LANGUAGE_OPTIONS: [],
        TYPE_OPTIONS: [],
        DIFFICULTY_OPTIONS: [],
      },
      electronAPI: {
        async saveCurrentTextSnapshot(payload) {
          savedSnapshotPayload = payload;
          return { ok: true, filename: 'snapshot.json' };
        },
        async openCurrentTextSnapshotsFolder() {
          return { ok: true };
        },
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_batch_flow.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_batch_flow.js' });

  const batchFlow = sandbox.window.TextExtractionBatchFlow;
  batchFlow.configure({
    guardUserAction() {
      return true;
    },
    hasBlockingModalOpen() {
      return false;
    },
    getOptionalElectronMethod(methodName) {
      if (methodName === 'checkTextExtractionPreconditions') {
        return async () => ({ ok: true, canStart: true });
      }
      if (methodName === 'prepareTextExtractionSelectedFile') {
        return async () => ({ ok: true });
      }
      if (methodName === 'checkTextExtractionOcrAvailability') {
        return async () => {
          ocrAvailabilityCallCount += 1;
          return ocrAvailabilityResult;
        };
      }
      if (methodName === 'executePreparedTextExtraction') {
        return async ({ processingContext }) => {
          const processingInputFileName = processingContext && processingContext.processingInputFileName
            ? processingContext.processingInputFileName
            : '';
          return executionResultsByProcessingInputFileName[processingInputFileName] || null;
        };
      }
      if (methodName === 'getTextExtractionProcessingMode') {
        return async () => ({ ok: true, state: { active: true } });
      }
      if (methodName === 'enterTextExtractionProcessingSession') {
        return async () => ({ ok: true });
      }
      if (methodName === 'updateTextExtractionProcessingSession') {
        return async () => ({ ok: true });
      }
      if (methodName === 'exitTextExtractionProcessingSession') {
        return async () => ({ ok: true });
      }
      return null;
    },
    requestPreparedImport: async ({ preparationRequest }) => ({
      preparation: preparationsByPath[preparationRequest.filePath] || null,
    }),
    getOcrLanguage() {
      return 'en';
    },
    applyTextViaCanonicalPath: async () => ({ ok: true }),
    hasCurrentTextSubscription() {
      return true;
    },
    textExtractionStatusUi,
  });

  return {
    batchFlow,
    getCapturedViewModel() {
      return capturedViewModel;
    },
    getCapturedController() {
      return capturedController;
    },
    getSnapshotTagsPromptOptions() {
      return snapshotTagsPromptOptions;
    },
    getOcrAvailabilityCallCount() {
      return ocrAvailabilityCallCount;
    },
    getCapturedFinalReport() {
      return capturedFinalReport;
    },
    getSavedSnapshotPayload() {
      return savedSnapshotPayload;
    },
    notifications,
  };
}

function createPreparation({
  fileName,
  chosenRoute,
  pdfPageSelection,
  heavySplitEligible = false,
  routeChoiceOptions = null,
  fileKind = 'pdf',
}) {
  const options = Array.isArray(routeChoiceOptions)
    ? routeChoiceOptions
    : [chosenRoute];
  const isPdf = fileKind === 'pdf';
  return {
    ok: true,
    prepareReady: true,
    prepareFailed: false,
    fileInfo: {
      fileName,
      sourceFileKind: fileKind,
    },
    routeChoiceOptions: options,
    pdfPageSelection,
    generatedPdfArtifactPolicy: isPdf ? { mode: 'delete' } : null,
    routeMetadata: {
      fileKind,
      chosenRoute,
      availableRoutes: options,
      pdfTotalPages: 12,
      heavySplitEligible,
      heavySplitPreview: heavySplitEligible
        ? {
          generatedInputs: [
            { processingInputFileName: `${fileName}_pages_01_06.pdf` },
          ],
        }
        : null,
    },
  };
}

test('batch flow shows generated-PDF keep toggle only for range-selected ordinary PDFs and heavy split PDFs', async () => {
  const preparationsByPath = {
    'C:\\docs\\ordinary-all.pdf': createPreparation({
      fileName: 'ordinary-all.pdf',
      chosenRoute: 'native',
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
    'C:\\docs\\ordinary-range.pdf': createPreparation({
      fileName: 'ordinary-range.pdf',
      chosenRoute: 'native',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 3,
        toPage: 5,
        selectedPageCount: 3,
        totalPages: 12,
      },
    }),
    'C:\\docs\\heavy.pdf': createPreparation({
      fileName: 'heavy.pdf',
      chosenRoute: 'ocr',
      heavySplitEligible: true,
      routeChoiceOptions: ['native', 'ocr'],
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
  };

  const harness = createHarness({ preparationsByPath });
  await harness.batchFlow.startFromSelectedFiles({
    filePaths: Object.keys(preparationsByPath),
    source: 'picker',
    actionId: 'test-batch-flow',
  });

  assert.deepEqual(harness.notifications, []);
  const viewModel = harness.getCapturedViewModel();
  assert.ok(viewModel);

  const inputs = viewModel.units.flatMap((unit) => unit.inputs);
  const byFileName = Object.fromEntries(inputs.map((input) => [input.fileName, input]));

  assert.equal(byFileName['ordinary-all.pdf'].canToggleKeep, false);
  assert.equal(byFileName['ordinary-range.pdf'].canToggleKeep, true);
  assert.equal(byFileName['heavy.pdf'].canToggleKeep, true);
  assert.equal(byFileName['heavy.pdf'].heavySplitActive, true);
  assert.equal(byFileName['heavy.pdf'].canEditPages, false);
  assert.equal(viewModel.units[0].displayLabel, 'Unit 1');
  assert.equal(viewModel.units[0].customName, '');
  assert.equal(viewModel.units[0].inputs[0].groupOptions[0].label, 'Unit 1');
});

test('batch flow opens shared tags modal with batch-planning copy overrides', async () => {
  const preparationsByPath = {
    'C:\\docs\\ordinary-a.pdf': createPreparation({
      fileName: 'ordinary-a.pdf',
      chosenRoute: 'native',
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
    'C:\\docs\\ordinary-b.pdf': createPreparation({
      fileName: 'ordinary-b.pdf',
      chosenRoute: 'native',
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 9,
        selectedPageCount: 9,
        totalPages: 9,
      },
    }),
  };

  const harness = createHarness({ preparationsByPath });
  await harness.batchFlow.startFromSelectedFiles({
    filePaths: Object.keys(preparationsByPath),
    source: 'picker',
    actionId: 'test-batch-flow-tags',
  });

  const controller = harness.getCapturedController();
  assert.ok(controller);
  await controller.editUnitTags('batch-unit-1');

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.getSnapshotTagsPromptOptions())),
    {
      initialTags: null,
      copy: {
        titleKey: 'renderer.text_extraction.batch_plan.tags_modal.title',
        messageKey: 'renderer.text_extraction.batch_plan.tags_modal.message',
        confirmKey: 'renderer.text_extraction.batch_plan.tags_modal.confirm_button',
        cancelKey: 'renderer.snapshot_save_tags.buttons.cancel',
        closeAriaKey: 'renderer.text_extraction.batch_plan.tags_modal.close_aria',
      },
    }
  );
});

test('batch flow keeps page summary for heavy PDFs and omits it for non-PDF inputs', async () => {
  const preparationsByPath = {
    'C:\\docs\\heavy.pdf': createPreparation({
      fileName: 'heavy.pdf',
      chosenRoute: 'ocr',
      heavySplitEligible: true,
      routeChoiceOptions: ['native', 'ocr'],
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
    'C:\\docs\\notes.txt': createPreparation({
      fileName: 'notes.txt',
      chosenRoute: 'native',
      fileKind: 'txt',
      pdfPageSelection: null,
    }),
  };

  const harness = createHarness({ preparationsByPath });
  await harness.batchFlow.startFromSelectedFiles({
    filePaths: Object.keys(preparationsByPath),
    source: 'picker',
    actionId: 'test-batch-flow-pages-summary',
  });

  const viewModel = harness.getCapturedViewModel();
  assert.ok(viewModel);

  const inputs = viewModel.units.flatMap((unit) => unit.inputs);
  const byFileName = Object.fromEntries(inputs.map((input) => [input.fileName, input]));

  assert.equal(byFileName['heavy.pdf'].canEditPages, false);
  assert.equal(byFileName['heavy.pdf'].pagesSummary, 'All pages');
  assert.equal(byFileName['notes.txt'].canEditPages, false);
  assert.equal(byFileName['notes.txt'].pagesSummary, '');
});

test('batch start validation skips OCR availability checks when the final planned routes contain no OCR inputs', async () => {
  const preparationsByPath = {
    'C:\\docs\\mixed.pdf': createPreparation({
      fileName: 'mixed.pdf',
      chosenRoute: null,
      routeChoiceOptions: ['native', 'ocr'],
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
  };

  const harness = createHarness({ preparationsByPath });
  await harness.batchFlow.startFromSelectedFiles({
    filePaths: Object.keys(preparationsByPath),
    source: 'picker',
    actionId: 'test-batch-flow-native-only-start-validation',
  });

  const controller = harness.getCapturedController();
  assert.ok(controller);

  const viewModel = controller.getViewModel();
  const mixedInput = viewModel.units[0].inputs[0];
  controller.applyAction({
    type: 'set_input_route',
    inputId: mixedInput.inputId,
    route: 'native',
  });

  const canStart = await controller.validateStart();
  assert.equal(canStart, true);
  assert.equal(harness.getOcrAvailabilityCallCount(), 0);
  assert.deepEqual(harness.notifications, []);
});

test('batch start validation blocks OCR routes before execution when Google OCR is unavailable', async () => {
  const preparationsByPath = {
    'C:\\docs\\mixed.pdf': createPreparation({
      fileName: 'mixed.pdf',
      chosenRoute: null,
      routeChoiceOptions: ['native', 'ocr'],
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
  };

  const harness = createHarness({
    preparationsByPath,
    ocrAvailabilityResult: {
      ok: true,
      available: false,
      state: 'failure',
      code: 'ocr_activation_required',
    },
  });
  await harness.batchFlow.startFromSelectedFiles({
    filePaths: Object.keys(preparationsByPath),
    source: 'picker',
    actionId: 'test-batch-flow-ocr-start-validation',
  });

  const controller = harness.getCapturedController();
  assert.ok(controller);

  const canStart = await controller.validateStart();
  assert.equal(canStart, false);
  assert.equal(harness.getOcrAvailabilityCallCount(), 1);
  assert.deepEqual(
    harness.notifications,
    ['renderer.alerts.text_extraction_batch_ocr_activation_required']
  );
});

test('batch execution final report keeps the canonical title and flattens heavy child rows on split success', async () => {
  const preparationsByPath = {
    'C:\\docs\\book.pdf': createPreparation({
      fileName: 'book.pdf',
      chosenRoute: 'ocr',
      heavySplitEligible: true,
      routeChoiceOptions: ['native', 'ocr'],
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 120,
        selectedPageCount: 120,
        totalPages: 120,
      },
    }),
  };

  const harness = createHarness({
    preparationsByPath,
    promptBatchPlanResult: { action: 'start' },
    async onPromptBatchPlan(controller) {
      const viewModel = controller.getViewModel();
      controller.applyAction({
        type: 'rename_unit',
        unitKey: viewModel.units[0].unitKey,
        name: 'Chapter 3 OCR',
      });
    },
    executionResultsByProcessingInputFileName: {
      'book.pdf': {
        ok: true,
        result: {
          state: 'success',
          text: '',
          generatedPdfArtifact: null,
          heavySplitExecution: {
            generatedInputs: [
              {
                fileName: 'book_pages_001_020.pdf',
                state: 'success',
                errorCode: '',
                generatedPdfArtifact: {
                  retainedArtifactPath: 'C:\\tmp\\book_pages_001_020.pdf',
                },
              },
              {
                fileName: 'book_pages_021_040.pdf',
                state: 'success',
                errorCode: '',
                generatedPdfArtifact: {
                  retainedArtifactPath: 'C:\\tmp\\book_pages_021_040.pdf',
                },
              },
            ],
          },
        },
      },
    },
  });

  await harness.batchFlow.startSyntheticSingleFileHeavySplit({
    filePath: 'C:\\docs\\book.pdf',
  });

  const report = JSON.parse(JSON.stringify(harness.getCapturedFinalReport()));
  assert.ok(report);
  assert.equal(report.units.length, 1);
  assert.equal(report.units[0].unitTitle, 'Chapter 3 OCR');
  assert.equal(report.units[0].sourceFileName, 'book.pdf');
  assert.equal(report.units[0].overallState, 'success');
  assert.equal(report.units[0].overallCode, '');
  assert.equal(report.units[0].heavyGeneratedInputRows, true);
  assert.deepEqual(
    report.units[0].inputs.map((input) => ({
      fileName: input.fileName,
      displayName: input.displayName,
    })),
    [
      { fileName: 'book_pages_001_020.pdf', displayName: 'book_pages_001_020.pdf' },
      { fileName: 'book_pages_021_040.pdf', displayName: 'book_pages_021_040.pdf' },
    ]
  );
  assert.equal(report.units[0].inputs.some((input) => input.fileName === 'book.pdf'), false);
  assert.equal(harness.getSavedSnapshotPayload(), null);
});

test('batch execution final report keeps heavy parent outcome metadata when child rows exist', async () => {
  const preparationsByPath = {
    'C:\\docs\\book.pdf': createPreparation({
      fileName: 'book.pdf',
      chosenRoute: 'ocr',
      heavySplitEligible: true,
      routeChoiceOptions: ['native', 'ocr'],
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 120,
        selectedPageCount: 120,
        totalPages: 120,
      },
    }),
  };

  const harness = createHarness({
    preparationsByPath,
    promptBatchPlanResult: { action: 'start' },
    executionResultsByProcessingInputFileName: {
      'book.pdf': {
        ok: true,
        result: {
          state: 'cancelled',
          text: '',
          error: {
            code: 'aborted_by_user',
          },
          generatedPdfArtifact: null,
          heavySplitExecution: {
            generatedInputs: [
              {
                fileName: 'book_pages_001_020.pdf',
                state: 'success',
                errorCode: '',
                generatedPdfArtifact: null,
              },
              {
                fileName: 'book_pages_021_040.pdf',
                state: 'omitted',
                errorCode: '',
                generatedPdfArtifact: null,
              },
            ],
          },
        },
      },
    },
  });

  await harness.batchFlow.startSyntheticSingleFileHeavySplit({
    filePath: 'C:\\docs\\book.pdf',
  });

  const report = JSON.parse(JSON.stringify(harness.getCapturedFinalReport()));
  assert.ok(report);
  assert.equal(report.units[0].unitTitle, 'book.pdf');
  assert.equal(report.units[0].sourceFileName, 'book.pdf');
  assert.equal(report.units[0].overallState, 'cancelled');
  assert.equal(report.units[0].overallCode, 'aborted_by_user');
  assert.equal(report.units[0].heavyGeneratedInputRows, true);
  assert.deepEqual(
    report.units[0].inputs.map((input) => ({
      fileName: input.fileName,
      displayName: input.displayName,
      state: input.state,
    })),
    [
      { fileName: 'book_pages_001_020.pdf', displayName: 'book_pages_001_020.pdf', state: 'success' },
      { fileName: 'book_pages_021_040.pdf', displayName: 'book_pages_021_040.pdf', state: 'omitted' },
    ]
  );
});

test('batch execution final report keeps ordinary cancelled rows distinct from omitted rows across units', async () => {
  const preparationsByPath = {
    'C:\\docs\\part-1.pdf': createPreparation({
      fileName: 'part-1.pdf',
      chosenRoute: 'native',
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
    'C:\\docs\\part-2.pdf': createPreparation({
      fileName: 'part-2.pdf',
      chosenRoute: 'native',
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
    'C:\\docs\\part-3.pdf': createPreparation({
      fileName: 'part-3.pdf',
      chosenRoute: 'native',
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
    'C:\\docs\\part-4.pdf': createPreparation({
      fileName: 'part-4.pdf',
      chosenRoute: 'native',
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }),
  };

  const harness = createHarness({
    preparationsByPath,
    promptBatchPlanResult: { action: 'start' },
    async onPromptBatchPlan(controller) {
      controller.applyAction({ type: 'apply_preset_all' });
      const viewModel = controller.getViewModel();
      controller.applyAction({
        type: 'assign_input_group',
        inputId: viewModel.units[0].inputs[3].inputId,
        groupKey: '__new__',
      });
    },
    executionResultsByProcessingInputFileName: {
      'part-1.pdf': {
        ok: true,
        result: {
          state: 'success',
          text: 'Extracted text',
          error: null,
          generatedPdfArtifact: null,
        },
      },
      'part-2.pdf': {
        ok: true,
        result: {
          state: 'cancelled',
          text: '',
          error: {
            code: 'aborted_by_user',
          },
          generatedPdfArtifact: null,
        },
      },
    },
  });

  await harness.batchFlow.startFromSelectedFiles({
    filePaths: Object.keys(preparationsByPath),
    source: 'picker',
    actionId: 'test-batch-flow-cancelled-report-taxonomy',
  });

  const report = JSON.parse(JSON.stringify(harness.getCapturedFinalReport()));
  assert.ok(report);
  assert.equal(report.hadOutput, true);
  assert.equal(report.units.length, 2);
  assert.deepEqual(
    report.units[0].inputs.map((input) => ({
      fileName: input.fileName,
      state: input.state,
      code: input.code,
    })),
    [
      { fileName: 'part-1.pdf', state: 'success', code: '' },
      { fileName: 'part-2.pdf', state: 'cancelled', code: 'aborted_by_user' },
      { fileName: 'part-3.pdf', state: 'omitted', code: 'omitted' },
    ]
  );
  assert.deepEqual(
    report.units[1].inputs.map((input) => ({
      fileName: input.fileName,
      state: input.state,
      code: input.code,
    })),
    [
      { fileName: 'part-4.pdf', state: 'omitted', code: 'omitted' },
    ]
  );
});

test('batch execution final report preserves cancelled heavy child rows when split aborts', async () => {
  const preparationsByPath = {
    'C:\\docs\\book.pdf': createPreparation({
      fileName: 'book.pdf',
      chosenRoute: 'ocr',
      heavySplitEligible: true,
      routeChoiceOptions: ['native', 'ocr'],
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 120,
        selectedPageCount: 120,
        totalPages: 120,
      },
    }),
  };

  const harness = createHarness({
    preparationsByPath,
    promptBatchPlanResult: { action: 'start' },
    executionResultsByProcessingInputFileName: {
      'book.pdf': {
        ok: true,
        result: {
          state: 'cancelled',
          text: '',
          error: {
            code: 'aborted_by_user',
          },
          generatedPdfArtifact: null,
          heavySplitExecution: {
            generatedInputs: [
              {
                fileName: 'book_pages_001_020.pdf',
                state: 'cancelled_before_route_dispatch',
                errorCode: 'aborted_by_user',
                generatedPdfArtifact: null,
              },
              {
                fileName: 'book_pages_021_040.pdf',
                state: 'omitted',
                errorCode: '',
                generatedPdfArtifact: null,
              },
            ],
          },
        },
      },
    },
  });

  await harness.batchFlow.startSyntheticSingleFileHeavySplit({
    filePath: 'C:\\docs\\book.pdf',
  });

  const report = JSON.parse(JSON.stringify(harness.getCapturedFinalReport()));
  assert.ok(report);
  assert.equal(report.units[0].overallState, 'cancelled');
  assert.equal(report.units[0].overallCode, 'aborted_by_user');
  assert.equal(report.units[0].heavyGeneratedInputRows, true);
  assert.deepEqual(
    report.units[0].inputs.map((input) => ({
      fileName: input.fileName,
      state: input.state,
      code: input.code,
    })),
    [
      { fileName: 'book_pages_001_020.pdf', state: 'cancelled', code: 'aborted_by_user' },
      { fileName: 'book_pages_021_040.pdf', state: 'omitted', code: '' },
    ]
  );
});

test('batch execution final report keeps the source row when heavy split produces no child rows', async () => {
  const preparationsByPath = {
    'C:\\docs\\book.pdf': createPreparation({
      fileName: 'book.pdf',
      chosenRoute: 'ocr',
      heavySplitEligible: true,
      routeChoiceOptions: ['native', 'ocr'],
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 120,
        selectedPageCount: 120,
        totalPages: 120,
      },
    }),
  };

  const harness = createHarness({
    preparationsByPath,
    promptBatchPlanResult: { action: 'start' },
    executionResultsByProcessingInputFileName: {
      'book.pdf': {
        ok: true,
        result: {
          state: 'failure',
          text: '',
          error: {
            code: 'heavy_split_plan_invalid',
          },
          generatedPdfArtifact: null,
          heavySplitExecution: {
            generatedInputs: [],
          },
        },
      },
    },
  });

  await harness.batchFlow.startSyntheticSingleFileHeavySplit({
    filePath: 'C:\\docs\\book.pdf',
  });

  const report = JSON.parse(JSON.stringify(harness.getCapturedFinalReport()));
  assert.ok(report);
  assert.equal(report.units[0].heavyGeneratedInputRows, false);
  assert.deepEqual(
    report.units[0].inputs.map((input) => ({
      fileName: input.fileName,
      displayName: input.displayName,
      state: input.state,
      code: input.code,
    })),
    [
      {
        fileName: 'book.pdf',
        displayName: 'book.pdf',
        state: 'failed',
        code: 'heavy_split_plan_invalid',
      },
    ]
  );
});

test('batch execution final report annotates ordinary selected-page PDF rows with the chosen range', async () => {
  const preparationsByPath = {
    'C:\\docs\\source.pdf': createPreparation({
      fileName: 'source.pdf',
      chosenRoute: 'native',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 12,
        toPage: 18,
        selectedPageCount: 7,
        totalPages: 48,
      },
    }),
  };

  const harness = createHarness({
    preparationsByPath,
    promptBatchPlanResult: { action: 'start' },
    executionResultsByProcessingInputFileName: {
      'source.pdf': {
        ok: true,
        result: {
          state: 'success',
          text: 'Extracted text',
          error: null,
          generatedPdfArtifact: {
            retainedArtifactPath: 'C:\\tmp\\source_pages_12_18.pdf',
          },
        },
      },
    },
  });

  await harness.batchFlow.startFromSelectedFiles({
    filePaths: ['C:\\docs\\source.pdf'],
    source: 'picker',
    actionId: 'test-batch-flow-range-report',
  });

  const report = JSON.parse(JSON.stringify(harness.getCapturedFinalReport()));
  assert.ok(report);
  assert.equal(report.units.length, 1);
  assert.deepEqual(
    report.units[0].inputs,
    [
      {
        fileName: 'source.pdf',
        displayName: 'source.pdf (\u206612-18\u2069)',
        state: 'success',
        code: '',
        generatedInputs: [],
        generatedPdfArtifact: {
          retainedArtifactPath: 'C:\\tmp\\source_pages_12_18.pdf',
        },
      },
    ]
  );
});
