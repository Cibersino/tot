'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness({
  preparationsByPath,
  ocrAvailabilityResult = { ok: true, available: true, state: 'ready', code: '' },
}) {
  let capturedViewModel = null;
  let capturedController = null;
  const notifications = [];
  let snapshotTagsPromptOptions = null;
  let ocrAvailabilityCallCount = 0;

  const sandbox = {
    window: {
      Notify: {
        notifyMain(key) {
          notifications.push(key);
        },
        async promptTextExtractionBatchPlan({ controller }) {
          capturedViewModel = controller.getViewModel();
          capturedController = controller;
          return null;
        },
        async promptSnapshotSaveTags(options) {
          snapshotTagsPromptOptions = options;
          return { tags: { language: 'en' } };
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
            'renderer.text_extraction.batch_plan.pages_range': 'Pages {fromPage}-{toPage}',
            'renderer.text_extraction.batch_plan.tags_none': 'No tags',
            'renderer.text_extraction.batch_plan.unit_label': 'Unit {index}',
          };
          return translations[key] || key;
        },
      },
      SnapshotTagCatalog: {
        LANGUAGE_OPTIONS: [],
        TYPE_OPTIONS: [],
        DIFFICULTY_OPTIONS: [],
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
      return null;
    },
    requestPreparedImport: async ({ preparationRequest }) => ({
      preparation: preparationsByPath[preparationRequest.filePath] || null,
    }),
    getOcrLanguage() {
      return 'en';
    },
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
