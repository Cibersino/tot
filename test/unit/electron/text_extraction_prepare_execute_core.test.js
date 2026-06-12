'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const {
  createTestTempDir,
  getTestTempDir,
} = require('../../helpers/test_temp_paths');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');
const {
  inspectPdfFile,
} = require('../../../electron/text_extraction_platform/text_extraction_pdf_selection_pipeline');

const SELECTABLE_PDF_FIXTURE = path.resolve('test/fixtures/pdf/selectable_text_fixture_12_pages.pdf');
const SCANNED_PDF_FIXTURE = path.resolve('test/fixtures/pdf/image_only_fixture_12_pages.pdf');
const ENCRYPTED_PDF_FIXTURE = path.resolve('test/fixtures/pdf/encrypted_selectable_text_fixture.pdf');
const RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR = path.join(
  getTestTempDir('retained-generated-pdfs'),
  'tests'
);
const GENERATED_PDF_SUBSET_FIXTURE_DIR = getTestTempDir('generated-pdf-subset-fixtures');
const CORE_MODULE_PATH = path.resolve(
  __dirname,
  '../../../electron/text_extraction_platform/text_extraction_prepare_execute_core.js'
);

function loadCoreExports() {
  const restoreElectronModule = installElectronModuleMock();
  delete require.cache[CORE_MODULE_PATH];
  try {
    return require(CORE_MODULE_PATH);
  } finally {
    delete require.cache[CORE_MODULE_PATH];
    restoreElectronModule();
  }
}

const {
  executePreparedImport,
  getFileInfo,
  inspectSelectedFile,
  prepareSelectedFile,
  resolveExecutePayload,
  resolveInspectPayload,
  resolvePreparePayload,
  resolvePreparedRoute,
} = loadCoreExports();

function loadCoreWithMocks({
  mockRunNativeExtractionRoute = null,
  mockRunGoogleDriveOcrRoute = null,
  mockValidateGoogleDriveOcrSetup = null,
  mockProbeNativePdfSelectableText = null,
  heavyPdfSplitCoreOverrides = null,
  pdfPageSelectionOverrides = null,
  electronOverrides = null,
  mockLog = null,
} = {}) {
  const coreModulePath = CORE_MODULE_PATH;
  const nativeRouteModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/native_extraction_route.js'
  );
  const ocrRouteModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/ocr_google_drive_route.js'
  );
  const ocrSetupValidationModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/ocr_google_drive_setup_validation.js'
  );
  const nativePdfProbeModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/native_pdf_selectable_text_probe.js'
  );
  const heavyPdfSplitCoreModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/text_extraction_heavy_pdf_split_core.js'
  );
  const pdfPageSelectionModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/text_extraction_pdf_selection_pipeline.js'
  );
  const logModulePath = path.resolve(
    __dirname,
    '../../../electron/log.js'
  );
  const originalCoreModule = require.cache[coreModulePath];
  const originalNativeRouteModule = require.cache[nativeRouteModulePath];
  const originalOcrRouteModule = require.cache[ocrRouteModulePath];
  const originalOcrSetupValidationModule = require.cache[ocrSetupValidationModulePath];
  const originalNativePdfProbeModule = require.cache[nativePdfProbeModulePath];
  const originalHeavyPdfSplitCoreModule = require.cache[heavyPdfSplitCoreModulePath];
  const originalPdfPageSelectionModule = require.cache[pdfPageSelectionModulePath];
  const originalLogModule = require.cache[logModulePath];
  const restoreElectronModule = installElectronModuleMock(electronOverrides);

  if (typeof mockRunNativeExtractionRoute === 'function') {
    require.cache[nativeRouteModulePath] = {
      id: nativeRouteModulePath,
      filename: nativeRouteModulePath,
      loaded: true,
      exports: {
        runNativeExtractionRoute: mockRunNativeExtractionRoute,
      },
    };
  }

  if (typeof mockRunGoogleDriveOcrRoute === 'function') {
    require.cache[ocrRouteModulePath] = {
      id: ocrRouteModulePath,
      filename: ocrRouteModulePath,
      loaded: true,
      exports: {
        runGoogleDriveOcrRoute: mockRunGoogleDriveOcrRoute,
      },
    };
  }

  if (typeof mockValidateGoogleDriveOcrSetup === 'function') {
    require.cache[ocrSetupValidationModulePath] = {
      id: ocrSetupValidationModulePath,
      filename: ocrSetupValidationModulePath,
      loaded: true,
      exports: {
        validateGoogleDriveOcrSetup: mockValidateGoogleDriveOcrSetup,
      },
    };
  }

  if (typeof mockProbeNativePdfSelectableText === 'function') {
    require.cache[nativePdfProbeModulePath] = {
      id: nativePdfProbeModulePath,
      filename: nativePdfProbeModulePath,
      loaded: true,
      exports: {
        probeNativePdfSelectableText: mockProbeNativePdfSelectableText,
      },
    };
  }

  if (heavyPdfSplitCoreOverrides && typeof heavyPdfSplitCoreOverrides === 'object') {
    const actualHeavyPdfSplitCoreModule = require(heavyPdfSplitCoreModulePath);
    require.cache[heavyPdfSplitCoreModulePath] = {
      id: heavyPdfSplitCoreModulePath,
      filename: heavyPdfSplitCoreModulePath,
      loaded: true,
      exports: {
        ...actualHeavyPdfSplitCoreModule,
        ...heavyPdfSplitCoreOverrides,
      },
    };
  }

  if (pdfPageSelectionOverrides && typeof pdfPageSelectionOverrides === 'object') {
    const actualPdfPageSelectionModule = require(pdfPageSelectionModulePath);
    require.cache[pdfPageSelectionModulePath] = {
      id: pdfPageSelectionModulePath,
      filename: pdfPageSelectionModulePath,
      loaded: true,
      exports: {
        ...actualPdfPageSelectionModule,
        ...pdfPageSelectionOverrides,
      },
    };
  }

  if (mockLog && typeof mockLog === 'object') {
    require.cache[logModulePath] = {
      id: logModulePath,
      filename: logModulePath,
      loaded: true,
      exports: {
        get() {
          return mockLog;
        },
      },
    };
  }

  delete require.cache[coreModulePath];
  const core = require(coreModulePath);

  function restore() {
    delete require.cache[coreModulePath];
    if (originalCoreModule) {
      require.cache[coreModulePath] = originalCoreModule;
    } else {
      delete require.cache[coreModulePath];
    }
    if (typeof mockRunNativeExtractionRoute === 'function' && originalNativeRouteModule) {
      require.cache[nativeRouteModulePath] = originalNativeRouteModule;
    } else if (typeof mockRunNativeExtractionRoute === 'function') {
      delete require.cache[nativeRouteModulePath];
    }
    if (typeof mockRunGoogleDriveOcrRoute === 'function' && originalOcrRouteModule) {
      require.cache[ocrRouteModulePath] = originalOcrRouteModule;
    } else if (typeof mockRunGoogleDriveOcrRoute === 'function') {
      delete require.cache[ocrRouteModulePath];
    }
    if (typeof mockValidateGoogleDriveOcrSetup === 'function' && originalOcrSetupValidationModule) {
      require.cache[ocrSetupValidationModulePath] = originalOcrSetupValidationModule;
    } else if (typeof mockValidateGoogleDriveOcrSetup === 'function') {
      delete require.cache[ocrSetupValidationModulePath];
    }
    if (typeof mockProbeNativePdfSelectableText === 'function' && originalNativePdfProbeModule) {
      require.cache[nativePdfProbeModulePath] = originalNativePdfProbeModule;
    } else if (typeof mockProbeNativePdfSelectableText === 'function') {
      delete require.cache[nativePdfProbeModulePath];
    }
    if (heavyPdfSplitCoreOverrides && typeof heavyPdfSplitCoreOverrides === 'object' && originalHeavyPdfSplitCoreModule) {
      require.cache[heavyPdfSplitCoreModulePath] = originalHeavyPdfSplitCoreModule;
    } else if (heavyPdfSplitCoreOverrides && typeof heavyPdfSplitCoreOverrides === 'object') {
      delete require.cache[heavyPdfSplitCoreModulePath];
    }
    if (pdfPageSelectionOverrides && typeof pdfPageSelectionOverrides === 'object' && originalPdfPageSelectionModule) {
      require.cache[pdfPageSelectionModulePath] = originalPdfPageSelectionModule;
    } else if (pdfPageSelectionOverrides && typeof pdfPageSelectionOverrides === 'object') {
      delete require.cache[pdfPageSelectionModulePath];
    }
    if (mockLog && typeof mockLog === 'object' && originalLogModule) {
      require.cache[logModulePath] = originalLogModule;
    } else if (mockLog && typeof mockLog === 'object') {
      delete require.cache[logModulePath];
    }
    restoreElectronModule();
  }

  return {
    core,
    restore,
  };
}

function loadCoreWithNativeRouteMock(mockRunNativeExtractionRoute) {
  return loadCoreWithMocks({ mockRunNativeExtractionRoute });
}

function createIdleController({ changed = true, active = false, lockId = active ? 1 : 0, state = null } = {}) {
  const currentState = state && typeof state === 'object'
    ? { ...state }
    : {
      active,
      lockId,
      sinceEpochMs: active ? 1000 : null,
      source: active ? 'test_execution' : '',
      reason: active ? 'processing' : '',
    };
  return {
    enterCalls: [],
    exitCalls: [],
    enter(payload) {
      this.enterCalls.push(payload);
      return { changed, state: { ...currentState } };
    },
    exit(payload) {
      this.exitCalls.push(payload);
      currentState.active = false;
      currentState.sinceEpochMs = null;
    },
    isActive() {
      return currentState.active === true;
    },
    getState() {
      return { ...currentState };
    },
  };
}

function createExecutingController() {
  let active = false;
  let lockId = 0;

  return {
    enterCalls: [],
    exitCalls: [],
    enter(payload) {
      this.enterCalls.push(payload);
      active = true;
      lockId += 1;
      return { changed: true, state: this.getState() };
    },
    exit(payload) {
      this.exitCalls.push(payload);
      active = false;
    },
    isActive() {
      return active;
    },
    getState() {
      return {
        active,
        lockId,
        sinceEpochMs: active ? 1000 : null,
        source: active ? 'text_extraction_execution' : '',
        reason: active ? 'run_pdf_route' : '',
      };
    },
    cancelCurrent() {
      active = false;
    },
    activateReplacement(nextLockId) {
      active = true;
      lockId = nextLockId;
    },
  };
}

const silentLog = {
  warn() {},
  warnOnce() {},
  error() {},
  errorOnce() {},
  debug() {},
  info() {},
};

async function createMixedPdfFixture(t) {
  const dir = createTestTempDir('issue-271-mixed-pdf');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const sourcePdf = await PDFDocument.create();
  const scannedPdf = await PDFDocument.load(fs.readFileSync(SCANNED_PDF_FIXTURE));
  const selectablePdf = await PDFDocument.load(fs.readFileSync(SELECTABLE_PDF_FIXTURE));
  const [scannedPage] = await sourcePdf.copyPages(scannedPdf, [0]);
  const [selectablePage] = await sourcePdf.copyPages(selectablePdf, [0]);
  sourcePdf.addPage(scannedPage);
  sourcePdf.addPage(selectablePage);

  const outputPath = path.join(dir, 'mixed_scan_then_selectable.pdf');
  fs.writeFileSync(outputPath, await sourcePdf.save());
  return outputPath;
}

test('resolvePreparePayload trims supported fields and drops invalid values', () => {
  assert.deepEqual(
    resolvePreparePayload({
      filePath: '  C:\\temp\\sample.pdf  ',
      ocrLanguage: '  es  ',
      planningMode: '  BATCH  ',
      forceHeavySplitFullSource: true,
      pdfPageSelection: {
        mode: 'range',
        fromPage: 3,
        toPage: 5,
      },
      generatedPdfArtifactPolicy: {
        mode: 'keep',
      },
      ignored: true,
    }),
    {
      filePath: 'C:\\temp\\sample.pdf',
      ocrLanguage: 'es',
      planningMode: 'batch',
      forceHeavySplitFullSource: true,
      pdfPageSelection: {
        mode: 'range',
        fromPage: 3,
        toPage: 5,
      },
      generatedPdfArtifactPolicy: {
        mode: 'keep',
      },
    }
  );

  assert.deepEqual(
    resolvePreparePayload(null),
    {
      filePath: '',
      ocrLanguage: '',
      planningMode: 'single',
      forceHeavySplitFullSource: false,
      pdfPageSelection: null,
      generatedPdfArtifactPolicy: null,
    }
  );
});

test('resolveInspectPayload trims filePath and drops invalid values', () => {
  assert.deepEqual(
    resolveInspectPayload({
      filePath: '  C:\\temp\\sample.pdf  ',
      ignored: true,
    }),
    {
      filePath: 'C:\\temp\\sample.pdf',
    }
  );

  assert.deepEqual(
    resolveInspectPayload({ filePath: 123 }),
    {
      filePath: '',
    }
  );
});

test('resolveExecutePayload trims ids and only accepts native or ocr route preferences', () => {
  assert.deepEqual(
    resolveExecutePayload({
      prepareId: '  abc-123  ',
      routePreference: ' Native ',
      processingContext: {
        unitIndex: 1,
        unitCount: 2,
      },
      reuseActiveProcessingLock: true,
      heavySplitFailurePolicy: 'omit_failed_and_continue',
    }),
    {
      prepareId: 'abc-123',
      routePreference: 'native',
      processingContext: {
        unitIndex: 1,
        unitCount: 2,
      },
      reuseActiveProcessingLock: true,
      heavySplitFailurePolicy: 'omit_failed_and_continue',
    }
  );

  assert.deepEqual(
    resolveExecutePayload({
      prepareId: 123,
      routePreference: 'invalid',
    }),
    {
      prepareId: '',
      routePreference: '',
      processingContext: null,
      reuseActiveProcessingLock: false,
      heavySplitFailurePolicy: 'finish_unit_after_last_success',
    }
  );
});

test('getFileInfo classifies text, image, and pdf inputs from extension', () => {
  const txtInfo = getFileInfo('  notes.md  ');
  assert.equal(txtInfo.fileName, 'notes.md');
  assert.equal(txtInfo.sourceFileExt, 'md');
  assert.equal(txtInfo.sourceFileKind, 'text_document');

  const imageInfo = getFileInfo('scan.TIFF');
  assert.equal(imageInfo.fileName, 'scan.TIFF');
  assert.equal(imageInfo.sourceFileExt, 'tiff');
  assert.equal(imageInfo.sourceFileKind, 'image');

  const pdfInfo = getFileInfo(path.join('docs', 'sample.pdf'));
  assert.equal(pdfInfo.fileName, 'sample.pdf');
  assert.equal(pdfInfo.sourceFileExt, 'pdf');
  assert.equal(pdfInfo.sourceFileKind, 'pdf');
});

test('resolvePreparedRoute prefers explicit chosenRoute and otherwise enforces route rules', () => {
  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: 'native' },
        routeChoiceOptions: ['native', 'ocr'],
      },
      'ocr'
    ),
    { ok: true, productRoute: 'native' }
  );

  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: null },
        routeChoiceOptions: ['native', 'ocr'],
      },
      'ocr'
    ),
    { ok: true, productRoute: 'ocr' }
  );

  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: null },
        routeChoiceOptions: ['native'],
      },
      'ocr'
    ),
    { ok: false, reason: 'requested_route_unavailable' }
  );

  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: null },
        routeChoiceOptions: ['native', 'ocr'],
        requiresRouteChoice: true,
      },
      ''
    ),
    { ok: false, reason: 'route_choice_required' }
  );

  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: null },
        routeChoiceOptions: [],
        requiresRouteChoice: false,
      },
      ''
    ),
    { ok: false, reason: 'route_resolution_failed' }
  );
});

test('prepareSelectedFile returns a native-ready result for plain text inputs', async () => {
  const result = await prepareSelectedFile({
    filePath: 'sample.txt',
    ocrLanguage: 'es',
    resolvePaths: () => {
      throw new Error('resolvePaths should not be used for native text preparation');
    },
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.prepareReady, true);
  assert.equal(result.executionKind, 'native');
  assert.equal(result.routeMetadata.fileKind, 'text_document');
  assert.deepEqual(result.routeMetadata.availableRoutes, ['native']);
  assert.equal(result.routeMetadata.chosenRoute, 'native');
  assert.equal(result.routeMetadata.pdfTriage, 'not_pdf');
  assert.equal(result.processingInputFileName, 'sample.txt');
  assert.equal(result.pdfPageSelection, null);
  assert.equal(result.generatedPdfArtifactPolicy, null);
});

test('prepareSelectedFile returns a native-ready result for EPUB inputs', async () => {
  const result = await prepareSelectedFile({
    filePath: 'novel.epub',
    ocrLanguage: 'es',
    resolvePaths: () => {
      throw new Error('resolvePaths should not be used for EPUB native preparation');
    },
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.prepareReady, true);
  assert.equal(result.executionKind, 'native');
  assert.equal(result.routeMetadata.fileKind, 'text_document');
  assert.deepEqual(result.routeMetadata.availableRoutes, ['native']);
  assert.equal(result.routeMetadata.chosenRoute, 'native');
  assert.equal(result.routeMetadata.pdfTriage, 'not_pdf');
  assert.equal(result.processingInputFileName, 'novel.epub');
  assert.equal(result.pdfPageSelection, null);
  assert.equal(result.generatedPdfArtifactPolicy, null);
});

test('prepareSelectedFile returns a structured unsupported-format failure when no route exists', async () => {
  const result = await prepareSelectedFile({
    filePath: 'archive.zip',
    ocrLanguage: 'es',
    resolvePaths: () => {
      throw new Error('resolvePaths should not be used for unsupported-format preparation');
    },
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.prepareFailed, true);
  assert.equal(result.executionKind, null);
  assert.equal(result.routeMetadata.triageReason, 'unsupported_format');
  assert.deepEqual(result.routeMetadata.availableRoutes, []);
  assert.equal(result.primaryAlertKey, 'renderer.text_extraction.alerts.unsupported_format');
  assert.equal(result.error.code, 'unsupported_format');
});

test('executePreparedImport treats execution-time unsupported format as a native runtime error', async (t) => {
  const { core, restore } = loadCoreWithNativeRouteMock(async () => ({
    state: 'failure',
    executedRoute: 'native',
    text: '',
    warnings: [],
    summary: 'Native route blocked: unsupported format.',
    provenance: {
      sourceFileName: 'sample.txt',
      sourceFileExt: 'txt',
      sourceFileKind: 'text_document',
      ocrProvider: null,
      metadataSafeForLogs: {
        parserType: 'plain_text',
      },
    },
    error: {
      code: 'unsupported_format',
      message: 'Selected file format is not supported by native extraction route.',
      detailsSafeForLogs: {
        stage: 'preflight',
        reason: 'unsupported_extension',
      },
    },
  }));
  t.after(restore);

  const controller = createExecutingController();
  const result = await core.executePreparedImport({
    preparedRecord: {
      fileInfo: getFileInfo('sample.txt'),
      ocrLanguage: 'es',
      pdfPageSelection: null,
      generatedPdfArtifactPolicy: null,
      processingInputFileName: 'sample.txt',
      routeMetadata: {
        fileKind: 'text_document',
        availableRoutes: ['native'],
        chosenRoute: 'native',
        executedRoute: null,
        executionKind: 'native',
        pdfTriage: 'not_pdf',
        triageReason: 'non_pdf',
        ocrSetupState: 'not_checked',
      },
      requiresRouteChoice: false,
      routeChoiceOptions: [],
    },
    routePreference: '',
    resolvePaths: () => ({
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionKind, 'native');
  assert.equal(result.result.state, 'failure');
  assert.equal(result.result.error.code, 'unsupported_format');
  assert.equal(result.primaryAlertKey, 'renderer.text_extraction.alerts.native.runtime_error');
});

test('inspectSelectedFile returns PDF page-count metadata for selectable fixture', async () => {
  const result = await inspectSelectedFile({
    filePath: SELECTABLE_PDF_FIXTURE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.isPdf, true);
  assert.equal(result.fileInfo.fileName, 'selectable_text_fixture_12_pages.pdf');
  assert.equal(result.totalPages, 12);
  assert.equal(result.error, null);
  assert.equal(result.primaryAlertKey, '');
});

test('inspectSelectedFile returns neutral PDF alert keys for encrypted PDFs', async () => {
  const result = await inspectSelectedFile({
    filePath: ENCRYPTED_PDF_FIXTURE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.isPdf, true);
  assert.equal(result.totalPages, null);
  assert.equal(result.error.code, 'native_encrypted_or_password_protected');
  assert.equal(
    result.primaryAlertKey,
    'renderer.text_extraction.alerts.pdf.encrypted_or_password_protected'
  );
});

test('prepareSelectedFile triages the selected PDF range instead of the whole document', async (t) => {
  const mixedPdfPath = await createMixedPdfFixture(t);
  const resolvePaths = () => ({
    credentialsPath: path.join('missing', 'credentials.json'),
    tokenPath: path.join('missing', 'token.json'),
    bundledCredentialsFailureCode: 'credentials_missing',
    bundledCredentialsFailureReason: 'bundled_credentials_missing',
    bundledCredentialsFailureDetailsSafeForLogs: {},
    retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
  });

  const scannedRangePreparation = await prepareSelectedFile({
    filePath: mixedPdfPath,
    ocrLanguage: 'es',
    pdfPageSelection: {
      mode: 'range',
      fromPage: 1,
      toPage: 1,
    },
    generatedPdfArtifactPolicy: {
      mode: 'delete',
    },
    resolvePaths,
    log: silentLog,
  });

  assert.equal(scannedRangePreparation.ok, true);
  assert.equal(scannedRangePreparation.prepareFailed, true);
  assert.equal(scannedRangePreparation.error.code, 'credentials_missing');
  assert.equal(scannedRangePreparation.routeMetadata.pdfPageSelection.mode, 'range');
  assert.equal(scannedRangePreparation.routeMetadata.pdfPageSelection.fromPage, 1);
  assert.equal(scannedRangePreparation.routeMetadata.pdfPageSelection.toPage, 1);

  const selectableRangePreparation = await prepareSelectedFile({
    filePath: mixedPdfPath,
    ocrLanguage: 'es',
    pdfPageSelection: {
      mode: 'range',
      fromPage: 2,
      toPage: 2,
    },
    generatedPdfArtifactPolicy: {
      mode: 'delete',
    },
    resolvePaths,
    log: silentLog,
  });

  assert.equal(selectableRangePreparation.ok, true);
  assert.equal(selectableRangePreparation.prepareReady, true);
  assert.equal(selectableRangePreparation.requiresRouteChoice, true);
  assert.deepEqual(selectableRangePreparation.routeChoiceOptions, ['native', 'ocr']);
  assert.equal(selectableRangePreparation.pdfPageSelection.mode, 'range');
  assert.equal(selectableRangePreparation.pdfPageSelection.selectedPageCount, 1);
  assert.equal(selectableRangePreparation.generatedPdfArtifactPolicy.mode, 'delete');
  assert.equal(selectableRangePreparation.processingInputFileName, 'mixed_scan_then_selectable_pages_2_2.pdf');
});

test('prepareSelectedFile uses source-PDF triage in batch planning mode even when the selected range is image-only', async (t) => {
  const mixedPdfPath = await createMixedPdfFixture(t);
  const resolvePaths = () => ({
    credentialsPath: path.join('missing', 'credentials.json'),
    tokenPath: path.join('missing', 'token.json'),
    bundledCredentialsFailureCode: 'credentials_missing',
    bundledCredentialsFailureReason: 'bundled_credentials_missing',
    bundledCredentialsFailureDetailsSafeForLogs: {},
    retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
  });

  const batchPlanningPreparation = await prepareSelectedFile({
    filePath: mixedPdfPath,
    ocrLanguage: 'es',
    planningMode: 'batch',
    pdfPageSelection: {
      mode: 'range',
      fromPage: 1,
      toPage: 1,
    },
    generatedPdfArtifactPolicy: {
      mode: 'delete',
    },
    resolvePaths,
    log: silentLog,
  });

  assert.equal(batchPlanningPreparation.ok, true);
  assert.equal(batchPlanningPreparation.prepareReady, true);
  assert.equal(batchPlanningPreparation.planningMode, 'batch');
  assert.equal(batchPlanningPreparation.requiresRouteChoice, true);
  assert.deepEqual(batchPlanningPreparation.routeChoiceOptions, ['native', 'ocr']);
  assert.equal(batchPlanningPreparation.routeMetadata.pdfPageSelection.fromPage, 1);
  assert.equal(batchPlanningPreparation.routeMetadata.pdfPageSelection.toPage, 1);
  assert.equal(batchPlanningPreparation.processingInputFileName, 'mixed_scan_then_selectable_pages_1_1.pdf');
});

test('prepareSelectedFile preserves forced full-source heavy split as main-owned all-pages execution state', async (t) => {
  const { core, restore } = loadCoreWithMocks({
    mockValidateGoogleDriveOcrSetup: () => ({ ok: true }),
    mockProbeNativePdfSelectableText: async () => ({
      state: 'success',
      selectableText: 'present',
      metadataSafeForLogs: {
        pagesScanned: 12,
        totalPages: 12,
        foundAtPage: 1,
        probedFromPage: 1,
        probedToPage: 12,
        selectedPageCount: 12,
        elapsedMs: 1,
      },
    }),
    heavyPdfSplitCoreOverrides: {
      isHeavyPdfBySourceSize: () => true,
      buildHeavyPdfSplitPlan: () => ({
        ok: true,
        sourceTotalPages: 12,
        sourceFileSizeBytes: 458 * 1024 * 1024,
        generatedInputs: [
          {
            inputIndex: 1,
            fromPage: 1,
            toPage: 6,
            pdfPageSelection: {
              mode: 'range',
              fromPage: 1,
              toPage: 6,
              selectedPageCount: 6,
              totalPages: 12,
            },
            processingInputFileName: 'selectable_text_fixture_12_pages_pages_01_06.pdf',
          },
          {
            inputIndex: 2,
            fromPage: 7,
            toPage: 12,
            pdfPageSelection: {
              mode: 'range',
              fromPage: 7,
              toPage: 12,
              selectedPageCount: 6,
              totalPages: 12,
            },
            processingInputFileName: 'selectable_text_fixture_12_pages_pages_07_12.pdf',
          },
        ],
      }),
    },
  });
  t.after(restore);

  const result = await core.prepareSelectedFile({
    filePath: SELECTABLE_PDF_FIXTURE,
    ocrLanguage: 'es',
    planningMode: 'batch',
    forceHeavySplitFullSource: true,
    pdfPageSelection: {
      mode: 'range',
      fromPage: 2,
      toPage: 3,
    },
    generatedPdfArtifactPolicy: {
      mode: 'delete',
    },
    resolvePaths: () => ({
      credentialsPath: '',
      tokenPath: '',
      bundledCredentialsFailureCode: '',
      bundledCredentialsFailureReason: '',
      bundledCredentialsFailureDetailsSafeForLogs: {},
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.prepareReady, true);
  assert.equal(result.forceHeavySplitFullSource, true);
  assert.equal(result.preparedPayload.forceHeavySplitFullSource, true);
  assert.deepEqual(result.pdfPageSelection, {
    mode: 'all',
    fromPage: 1,
    toPage: 12,
    selectedPageCount: 12,
    totalPages: 12,
  });
  assert.deepEqual(result.preparedPayload.pdfPageSelection, {
    mode: 'all',
    fromPage: 1,
    toPage: 12,
    selectedPageCount: 12,
    totalPages: 12,
  });
  assert.equal(result.processingInputFileName, 'selectable_text_fixture_12_pages.pdf');
  assert.equal(result.routeMetadata.heavySplitEligible, true);
  assert.equal(result.routeMetadata.heavySplitPreview.generatedInputs.length, 2);
});

test('prepareSelectedFile fails instead of silently demoting a forced full-source heavy split when the source no longer requires it', async (t) => {
  const { core, restore } = loadCoreWithMocks({
    mockValidateGoogleDriveOcrSetup: () => ({ ok: true }),
    mockProbeNativePdfSelectableText: async () => ({
      state: 'success',
      selectableText: 'present',
      metadataSafeForLogs: {
        pagesScanned: 12,
        totalPages: 12,
        foundAtPage: 1,
        probedFromPage: 1,
        probedToPage: 12,
        selectedPageCount: 12,
        elapsedMs: 1,
      },
    }),
    heavyPdfSplitCoreOverrides: {
      isHeavyPdfBySourceSize: () => false,
    },
  });
  t.after(restore);

  const result = await core.prepareSelectedFile({
    filePath: SELECTABLE_PDF_FIXTURE,
    ocrLanguage: 'es',
    planningMode: 'batch',
    forceHeavySplitFullSource: true,
    pdfPageSelection: {
      mode: 'range',
      fromPage: 2,
      toPage: 3,
    },
    generatedPdfArtifactPolicy: {
      mode: 'delete',
    },
    resolvePaths: () => ({
      credentialsPath: '',
      tokenPath: '',
      bundledCredentialsFailureCode: '',
      bundledCredentialsFailureReason: '',
      bundledCredentialsFailureDetailsSafeForLogs: {},
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.prepareFailed, true);
  assert.equal(result.error.code, 'heavy_split_plan_invalid');
  assert.equal(result.routeMetadata.heavySplitEligible, false);
  assert.deepEqual(result.pdfPageSelection, {
    mode: 'all',
    fromPage: 1,
    toPage: 12,
    selectedPageCount: 12,
    totalPages: 12,
  });
});

test('prepareSelectedFile returns neutral PDF alert keys for encrypted PDFs', async () => {
  const result = await prepareSelectedFile({
    filePath: ENCRYPTED_PDF_FIXTURE,
    ocrLanguage: 'es',
    resolvePaths: () => {
      throw new Error('resolvePaths should not run after encrypted PDF inspect failure');
    },
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.prepareFailed, true);
  assert.equal(result.error.code, 'native_encrypted_or_password_protected');
  assert.equal(
    result.primaryAlertKey,
    'renderer.text_extraction.alerts.pdf.encrypted_or_password_protected'
  );
});

test('executePreparedImport rejects unresolved route choice before starting work', async () => {
  const controller = createIdleController({ changed: true, active: false, state: 'idle' });

  const result = await executePreparedImport({
    preparedRecord: {
      fileInfo: { sourceFileKind: 'pdf', filePath: 'sample.pdf' },
      routeMetadata: { chosenRoute: null },
      requiresRouteChoice: true,
      routeChoiceOptions: ['native', 'ocr'],
      ocrLanguage: 'es',
    },
    routePreference: '',
    resolvePaths: () => ({}),
    controller,
    log: silentLog,
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'ROUTE_CHOICE_REQUIRED',
    primaryAlertKey: 'renderer.text_extraction.alerts.route_choice_error',
  });
  assert.deepEqual(controller.enterCalls, []);
  assert.deepEqual(controller.exitCalls, []);
});

test('executePreparedImport returns ALREADY_ACTIVE when the controller stays active', async () => {
  const controller = createIdleController({ changed: false, active: true, lockId: 3 });

  const result = await executePreparedImport({
    preparedRecord: {
      fileInfo: { sourceFileKind: 'text_document', filePath: 'sample.txt' },
      routeMetadata: { chosenRoute: 'native' },
      requiresRouteChoice: false,
      routeChoiceOptions: [],
      ocrLanguage: 'es',
    },
    routePreference: '',
    resolvePaths: () => ({}),
    controller,
    log: silentLog,
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'ALREADY_ACTIVE',
    state: {
      active: true,
      lockId: 3,
      sinceEpochMs: 1000,
      source: 'test_execution',
      reason: 'processing',
    },
  });
  assert.deepEqual(controller.enterCalls, [
    {
      source: 'text_extraction_execution',
      reason: 'run_route',
      unitIndex: null,
      unitCount: null,
      inputIndex: null,
      inputCount: null,
      selectedRoute: 'native',
      processingInputFileName: '',
      processingInputSource: 'original_selected_file',
    },
  ]);
  assert.deepEqual(controller.exitCalls, []);
});

test('executePreparedImport materializes the selected PDF range for native success and preserves original provenance', async (t) => {
  const nativeRouteCalls = [];
  const { core, restore } = loadCoreWithNativeRouteMock(async (args) => {
    assert.equal(Object.hasOwn(args, 'log'), false);
    const { filePath } = args;
    nativeRouteCalls.push(filePath);
    assert.equal(path.basename(filePath), 'selectable_text_fixture_12_pages_pages_02_03.pdf');
    assert.notEqual(path.resolve(filePath), path.resolve(SELECTABLE_PDF_FIXTURE));

    const subsetInspection = await inspectPdfFile({
      fileInfo: getFileInfo(filePath),
    });
    assert.equal(subsetInspection.ok, true);
    assert.equal(subsetInspection.totalPages, 2);

    return {
      state: 'success',
      executedRoute: 'native',
      text: 'Synthetic extracted text',
      warnings: [],
      provenance: {
        metadataSafeForLogs: {
          parserType: 'pdf_text_layer',
        },
      },
    };
  });
  t.after(restore);

  const controller = createExecutingController();
  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);

  const result = await core.executePreparedImport({
    preparedRecord: {
      fileInfo,
      ocrLanguage: 'es',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 2,
        toPage: 3,
        selectedPageCount: 2,
        totalPages: 12,
      },
      generatedPdfArtifactPolicy: {
        mode: 'delete',
      },
      processingInputFileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
      routeMetadata: {
        fileKind: 'pdf',
        availableRoutes: ['native'],
        chosenRoute: 'native',
        executedRoute: null,
        executionKind: 'native',
        pdfTriage: 'native_only',
        triageReason: 'native_text_detected',
        ocrSetupState: 'not_checked',
      },
      requiresRouteChoice: false,
      routeChoiceOptions: [],
    },
    routePreference: '',
    resolvePaths: () => ({
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionKind, 'native');
  assert.equal(result.result.state, 'success');
  assert.equal(result.result.text, 'Synthetic extracted text');
  assert.equal(result.result.processingInputFileName, 'selectable_text_fixture_12_pages_pages_02_03.pdf');
  assert.equal(result.result.pdfPageSelection.mode, 'range');
  assert.equal(result.result.generatedPdfArtifactPolicy.mode, 'delete');
  assert.equal(result.result.generatedPdfArtifact.fileName, 'selectable_text_fixture_12_pages_pages_02_03.pdf');
  assert.equal(result.result.generatedPdfArtifact.retained, false);
  assert.equal(result.result.provenance.sourceFileName, 'selectable_text_fixture_12_pages.pdf');
  assert.equal(result.result.provenance.metadataSafeForLogs.processingInputSource, 'generated_pdf_subset');
  assert.equal(result.result.provenance.metadataSafeForLogs.generatedPdfArtifactRetained, false);
  assert.equal(result.primaryAlertKey, '');
  assert.deepEqual(result.warningAlertKeys, []);
  assert.deepEqual(controller.enterCalls, [
    {
      source: 'text_extraction_execution',
      reason: 'run_pdf_route',
      unitIndex: null,
      unitCount: null,
      inputIndex: null,
      inputCount: null,
      selectedRoute: 'native',
      processingInputFileName: 'selectable_text_fixture_12_pages.pdf',
      processingInputSource: 'original_selected_file',
    },
  ]);
  assert.deepEqual(controller.exitCalls, [
    {
      source: 'text_extraction_execution',
      reason: 'text_extraction_native_success',
    },
  ]);
  assert.equal(nativeRouteCalls.length, 1);
});

test('executePreparedImport skips route dispatch after cancellation during subset materialization', async (t) => {
  let cleanupCalls = 0;
  let nativeRouteCalls = 0;
  const controller = createExecutingController();
  const { core, restore } = loadCoreWithMocks({
    mockRunNativeExtractionRoute: async () => {
      nativeRouteCalls += 1;
      throw new Error('native route should not run after ownership loss');
    },
    pdfPageSelectionOverrides: {
      materializePdfPageSelectionInput: async () => {
        controller.cancelCurrent();
        return {
          ok: true,
          materialized: true,
          effectiveFilePath: path.join(GENERATED_PDF_SUBSET_FIXTURE_DIR, 'aborted_subset.pdf'),
          processingInputFileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
          processingInputSource: 'generated_pdf_subset',
          generatedPdfArtifact: {
            fileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
            policyMode: 'delete',
            retained: false,
          },
          retainedArtifactPath: '',
          cleanupGeneratedArtifact: () => {
            cleanupCalls += 1;
            return null;
          },
        };
      },
    },
  });
  t.after(restore);

  const result = await core.executePreparedImport({
    preparedRecord: {
      fileInfo: getFileInfo(SELECTABLE_PDF_FIXTURE),
      ocrLanguage: 'es',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 2,
        toPage: 3,
        selectedPageCount: 2,
        totalPages: 12,
      },
      generatedPdfArtifactPolicy: {
        mode: 'delete',
      },
      processingInputFileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
      routeMetadata: {
        fileKind: 'pdf',
        availableRoutes: ['native'],
        chosenRoute: 'native',
        executedRoute: null,
        executionKind: 'native',
        pdfTriage: 'native_only',
        triageReason: 'native_text_detected',
        ocrSetupState: 'not_checked',
      },
      requiresRouteChoice: false,
      routeChoiceOptions: [],
    },
    routePreference: '',
    resolvePaths: () => ({
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionKind, 'native');
  assert.equal(result.result.state, 'cancelled');
  assert.equal(result.result.error.code, 'aborted_by_user');
  assert.equal(result.result.error.detailsSafeForLogs.stage, 'pre_route_dispatch');
  assert.equal(result.result.error.detailsSafeForLogs.reason, 'execution_ownership_lost');
  assert.equal(result.primaryAlertKey, 'renderer.text_extraction.alerts.native.cancelled');
  assert.equal(nativeRouteCalls, 0);
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(controller.exitCalls, []);
});

test('executePreparedImport does not release a replacement processing lock after cancellation during subset materialization', async (t) => {
  let cleanupCalls = 0;
  let nativeRouteCalls = 0;
  const controller = createExecutingController();
  const { core, restore } = loadCoreWithMocks({
    mockRunNativeExtractionRoute: async () => {
      nativeRouteCalls += 1;
      throw new Error('native route should not run after replacement lock takes ownership');
    },
    pdfPageSelectionOverrides: {
      materializePdfPageSelectionInput: async () => {
        controller.cancelCurrent();
        controller.activateReplacement(99);
        return {
          ok: true,
          materialized: true,
          effectiveFilePath: path.join(GENERATED_PDF_SUBSET_FIXTURE_DIR, 'replacement_subset.pdf'),
          processingInputFileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
          processingInputSource: 'generated_pdf_subset',
          generatedPdfArtifact: {
            fileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
            policyMode: 'delete',
            retained: false,
          },
          retainedArtifactPath: '',
          cleanupGeneratedArtifact: () => {
            cleanupCalls += 1;
            return null;
          },
        };
      },
    },
  });
  t.after(restore);

  const result = await core.executePreparedImport({
    preparedRecord: {
      fileInfo: getFileInfo(SELECTABLE_PDF_FIXTURE),
      ocrLanguage: 'es',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 2,
        toPage: 3,
        selectedPageCount: 2,
        totalPages: 12,
      },
      generatedPdfArtifactPolicy: {
        mode: 'delete',
      },
      processingInputFileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
      routeMetadata: {
        fileKind: 'pdf',
        availableRoutes: ['native'],
        chosenRoute: 'native',
        executedRoute: null,
        executionKind: 'native',
        pdfTriage: 'native_only',
        triageReason: 'native_text_detected',
        ocrSetupState: 'not_checked',
      },
      requiresRouteChoice: false,
      routeChoiceOptions: [],
    },
    routePreference: '',
    resolvePaths: () => ({
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.state, 'cancelled');
  assert.equal(result.result.error.detailsSafeForLogs.executionLockId, 1);
  assert.equal(result.result.error.detailsSafeForLogs.currentLockId, 99);
  assert.equal(nativeRouteCalls, 0);
  assert.equal(cleanupCalls, 1);
  assert.deepEqual(controller.exitCalls, []);
  assert.equal(controller.isActive(), true);
  assert.equal(controller.getState().lockId, 99);
});

test('executePreparedImport logs structured generated-PDF cleanup warnings and preserves warning codes on the final cleanup boundary', async (t) => {
  const warnCalls = [];
  const mockLog = {
    warn(...args) {
      warnCalls.push(args);
    },
    warnOnce() {},
    error() {},
    errorOnce() {},
    debug() {},
    info() {},
  };
  const { core, restore } = loadCoreWithMocks({
    mockRunNativeExtractionRoute: async () => ({
      state: 'success',
      executedRoute: 'native',
      text: 'Extracted text',
      warnings: [],
      summary: 'Native route succeeded.',
      provenance: {
        metadataSafeForLogs: {},
      },
      error: null,
    }),
    pdfPageSelectionOverrides: {
      materializePdfPageSelectionInput: async () => ({
        ok: true,
        materialized: true,
        effectiveFilePath: path.join(GENERATED_PDF_SUBSET_FIXTURE_DIR, 'cleanup-warning-final.pdf'),
        processingInputFileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
        processingInputSource: 'generated_pdf_subset',
        generatedPdfArtifact: {
          fileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
          policyMode: 'delete',
          retained: false,
        },
        retainedArtifactPath: '',
        cleanupGeneratedArtifact: () => ({
          warningCode: 'cleanup:pdf_subset_cleanup_failed',
          detailsSafeForLogs: {
            stage: 'cleanup_generated_subset',
            runDir: 'C:\\temp\\tot-run',
            fileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
          },
        }),
      }),
    },
    mockLog,
  });
  t.after(restore);

  const controller = createExecutingController();
  const result = await core.executePreparedImport({
    preparedRecord: {
      fileInfo: getFileInfo(SELECTABLE_PDF_FIXTURE),
      ocrLanguage: 'es',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 2,
        toPage: 3,
        selectedPageCount: 2,
        totalPages: 12,
      },
      generatedPdfArtifactPolicy: {
        mode: 'delete',
      },
      processingInputFileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
      routeMetadata: {
        fileKind: 'pdf',
        availableRoutes: ['native'],
        chosenRoute: 'native',
        executedRoute: null,
        executionKind: 'native',
        pdfTriage: 'native_only',
        triageReason: 'native_text_detected',
        ocrSetupState: 'not_checked',
      },
      requiresRouteChoice: false,
      routeChoiceOptions: [],
    },
    routePreference: '',
    resolvePaths: () => ({
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.state, 'success');
  assert.deepEqual(result.result.warnings, ['cleanup:pdf_subset_cleanup_failed']);
  assert.deepEqual(result.warningAlertKeys, [
    'renderer.text_extraction.alerts.generated_pdf_cleanup_warning',
  ]);
  assert.equal(warnCalls.length, 1);
  assert.equal(warnCalls[0][0], 'Generated PDF subset cleanup failed (ignored):');
  assert.deepEqual(warnCalls[0][1], {
    warningCode: 'cleanup:pdf_subset_cleanup_failed',
    stage: 'cleanup_generated_subset',
    runDir: 'C:\\temp\\tot-run',
    fileName: 'selectable_text_fixture_12_pages_pages_02_03.pdf',
  });
});

test('executePreparedImport processes heavy split through generated child PDFs instead of uploading the full source PDF', async (t) => {
  const ocrRouteCalls = [];
  const { core, restore } = loadCoreWithMocks({
    mockRunGoogleDriveOcrRoute: async (args) => {
      assert.equal(Object.hasOwn(args, 'log'), false);
      const { filePath } = args;
      ocrRouteCalls.push(path.basename(filePath));
      return {
        state: 'success',
        executedRoute: 'ocr',
        text: `Extracted from ${path.basename(filePath)}`,
        warnings: [],
        provenance: {
          metadataSafeForLogs: {},
        },
        error: null,
      };
    },
  });
  t.after(restore);

  const controller = createExecutingController();
  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);

  const result = await core.executePreparedImport({
    preparedRecord: {
      fileInfo,
      ocrLanguage: 'es',
      planningMode: 'batch',
      forceHeavySplitFullSource: true,
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
      generatedPdfArtifactPolicy: {
        mode: 'delete',
      },
      processingInputFileName: 'selectable_text_fixture_12_pages.pdf',
      routeMetadata: {
        fileKind: 'pdf',
        availableRoutes: ['native', 'ocr'],
        chosenRoute: null,
        executedRoute: null,
        executionKind: null,
        pdfTriage: 'both',
        triageReason: 'native_text_detected_and_ocr_ready_choice_required',
        ocrSetupState: 'ready',
        heavySplitEligible: true,
        heavySplitPreview: {
          ok: true,
          generatedInputs: [
            {
              inputIndex: 1,
              fromPage: 1,
              toPage: 2,
              pdfPageSelection: {
                mode: 'range',
                fromPage: 1,
                toPage: 2,
                selectedPageCount: 2,
                totalPages: 12,
              },
              processingInputFileName: 'selectable_text_fixture_12_pages_pages_01_02.pdf',
            },
            {
              inputIndex: 2,
              fromPage: 3,
              toPage: 4,
              pdfPageSelection: {
                mode: 'range',
                fromPage: 3,
                toPage: 4,
                selectedPageCount: 2,
                totalPages: 12,
              },
              processingInputFileName: 'selectable_text_fixture_12_pages_pages_03_04.pdf',
            },
          ],
        },
      },
      requiresRouteChoice: true,
      routeChoiceOptions: ['native', 'ocr'],
    },
    routePreference: 'ocr',
    resolvePaths: () => ({
      credentialsPath: '',
      tokenPath: '',
      bundledCredentialsFailureCode: '',
      bundledCredentialsFailureReason: '',
      bundledCredentialsFailureDetailsSafeForLogs: {},
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionKind, 'google_drive');
  assert.equal(result.result.state, 'success');
  assert.match(result.result.text, /pages_01_02\.pdf/);
  assert.match(result.result.text, /pages_03_04\.pdf/);
  assert.deepEqual(ocrRouteCalls, [
    'selectable_text_fixture_12_pages_pages_01_02.pdf',
    'selectable_text_fixture_12_pages_pages_03_04.pdf',
  ]);
  assert.equal(ocrRouteCalls.includes('selectable_text_fixture_12_pages.pdf'), false);
  assert.equal(result.result.processingInputFileName, 'selectable_text_fixture_12_pages.pdf');
  assert.equal(result.result.generatedPdfArtifact, null);
  assert.equal(result.result.provenance.sourceFileName, 'selectable_text_fixture_12_pages.pdf');
  assert.equal(result.result.provenance.metadataSafeForLogs.processingInputSource, 'original_selected_file');
  assert.equal(result.result.provenance.metadataSafeForLogs.generatedPdfArtifactRetained, false);
  assert.deepEqual(
    result.result.heavySplitExecution.generatedInputs.map((generatedInput) => ({
      fileName: generatedInput.fileName,
      state: generatedInput.state,
    })),
    [
      {
        fileName: 'selectable_text_fixture_12_pages_pages_01_02.pdf',
        state: 'success',
      },
      {
        fileName: 'selectable_text_fixture_12_pages_pages_03_04.pdf',
        state: 'success',
      },
    ]
  );
});

test('executePreparedImport preserves heavy split child statuses on cancellation', async (t) => {
  const ocrRouteCalls = [];
  let callIndex = 0;
  const { core, restore } = loadCoreWithMocks({
    mockRunGoogleDriveOcrRoute: async (args) => {
      assert.equal(Object.hasOwn(args, 'log'), false);
      const { filePath } = args;
      const fileName = path.basename(filePath);
      ocrRouteCalls.push(fileName);
      callIndex += 1;
      if (callIndex === 1) {
        return {
          state: 'success',
          executedRoute: 'ocr',
          text: `Extracted from ${fileName}`,
          warnings: [],
          provenance: {
            metadataSafeForLogs: {},
          },
          error: null,
        };
      }
      return {
        state: 'cancelled',
        executedRoute: 'ocr',
        text: '',
        warnings: [],
        provenance: {
          metadataSafeForLogs: {},
        },
        error: {
          code: 'aborted_by_user',
          message: 'Cancelled by user.',
          detailsSafeForLogs: {
            uploadStatus: 'in_progress',
          },
        },
      };
    },
  });
  t.after(restore);

  const controller = createExecutingController();
  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);

  const result = await core.executePreparedImport({
    preparedRecord: {
      fileInfo,
      ocrLanguage: 'es',
      planningMode: 'batch',
      forceHeavySplitFullSource: true,
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
      generatedPdfArtifactPolicy: {
        mode: 'delete',
      },
      processingInputFileName: 'selectable_text_fixture_12_pages.pdf',
      routeMetadata: {
        fileKind: 'pdf',
        availableRoutes: ['native', 'ocr'],
        chosenRoute: null,
        executedRoute: null,
        executionKind: null,
        pdfTriage: 'both',
        triageReason: 'native_text_detected_and_ocr_ready_choice_required',
        ocrSetupState: 'ready',
        heavySplitEligible: true,
        heavySplitPreview: {
          ok: true,
          generatedInputs: [
            {
              inputIndex: 1,
              fromPage: 1,
              toPage: 2,
              pdfPageSelection: {
                mode: 'range',
                fromPage: 1,
                toPage: 2,
                selectedPageCount: 2,
                totalPages: 12,
              },
              processingInputFileName: 'selectable_text_fixture_12_pages_pages_01_02.pdf',
            },
            {
              inputIndex: 2,
              fromPage: 3,
              toPage: 4,
              pdfPageSelection: {
                mode: 'range',
                fromPage: 3,
                toPage: 4,
                selectedPageCount: 2,
                totalPages: 12,
              },
              processingInputFileName: 'selectable_text_fixture_12_pages_pages_03_04.pdf',
            },
          ],
        },
      },
      requiresRouteChoice: true,
      routeChoiceOptions: ['native', 'ocr'],
    },
    routePreference: 'ocr',
    resolvePaths: () => ({
      credentialsPath: '',
      tokenPath: '',
      bundledCredentialsFailureCode: '',
      bundledCredentialsFailureReason: '',
      bundledCredentialsFailureDetailsSafeForLogs: {},
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionKind, 'google_drive');
  assert.equal(result.result.state, 'cancelled');
  assert.equal(result.result.error.code, 'aborted_by_user');
  assert.deepEqual(ocrRouteCalls, [
    'selectable_text_fixture_12_pages_pages_01_02.pdf',
    'selectable_text_fixture_12_pages_pages_03_04.pdf',
  ]);
  assert.ok(result.result.heavySplitExecution);
  assert.deepEqual(
    result.result.heavySplitExecution.generatedInputs.map((generatedInput) => ({
      fileName: generatedInput.fileName,
      state: generatedInput.state,
      errorCode: generatedInput.errorCode,
    })),
    [
      {
        fileName: 'selectable_text_fixture_12_pages_pages_01_02.pdf',
        state: 'success',
        errorCode: '',
      },
      {
        fileName: 'selectable_text_fixture_12_pages_pages_03_04.pdf',
        state: 'cancelled_before_route_dispatch',
        errorCode: 'aborted_by_user',
      },
    ]
  );
});

test('executePreparedImport logs structured generated-PDF cleanup warnings and preserves warning codes on heavy split cleanup boundaries', async (t) => {
  const warnCalls = [];
  const mockLog = {
    warn(...args) {
      warnCalls.push(args);
    },
    warnOnce() {},
    error() {},
    errorOnce() {},
    debug() {},
    info() {},
  };
  const { core, restore } = loadCoreWithMocks({
    mockRunGoogleDriveOcrRoute: async (args) => ({
      state: 'success',
      executedRoute: 'ocr',
      text: `Extracted from ${path.basename(args.filePath)}`,
      warnings: [],
      provenance: {
        metadataSafeForLogs: {},
      },
      error: null,
    }),
    pdfPageSelectionOverrides: {
      materializePdfPageSelectionInput: async ({ pdfPageSelection }) => {
        const fromPage = pdfPageSelection && pdfPageSelection.fromPage;
        const toPage = pdfPageSelection && pdfPageSelection.toPage;
        return {
          ok: true,
          materialized: true,
          effectiveFilePath: path.join(
            GENERATED_PDF_SUBSET_FIXTURE_DIR,
            `heavy-split-${String(fromPage).padStart(2, '0')}-${String(toPage).padStart(2, '0')}.pdf`
          ),
          processingInputFileName: `selectable_text_fixture_12_pages_pages_${String(fromPage).padStart(2, '0')}_${String(toPage).padStart(2, '0')}.pdf`,
          processingInputSource: 'generated_pdf_split_input',
          generatedPdfArtifact: {
            fileName: `selectable_text_fixture_12_pages_pages_${String(fromPage).padStart(2, '0')}_${String(toPage).padStart(2, '0')}.pdf`,
            policyMode: 'delete',
            retained: false,
          },
          retainedArtifactPath: '',
          cleanupGeneratedArtifact: () => ({
            warningCode: 'cleanup:pdf_subset_cleanup_failed',
            detailsSafeForLogs: {
              stage: 'cleanup_generated_subset',
              runDir: `C:\\temp\\tot-run-${fromPage}-${toPage}`,
              fileName: `selectable_text_fixture_12_pages_pages_${String(fromPage).padStart(2, '0')}_${String(toPage).padStart(2, '0')}.pdf`,
            },
          }),
        };
      },
    },
    mockLog,
  });
  t.after(restore);

  const controller = createExecutingController();
  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);

  const result = await core.executePreparedImport({
    preparedRecord: {
      fileInfo,
      ocrLanguage: 'es',
      planningMode: 'batch',
      forceHeavySplitFullSource: true,
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
      generatedPdfArtifactPolicy: {
        mode: 'delete',
      },
      processingInputFileName: 'selectable_text_fixture_12_pages.pdf',
      routeMetadata: {
        fileKind: 'pdf',
        availableRoutes: ['native', 'ocr'],
        chosenRoute: null,
        executedRoute: null,
        executionKind: null,
        pdfTriage: 'both',
        triageReason: 'native_text_detected_and_ocr_ready_choice_required',
        ocrSetupState: 'ready',
        heavySplitEligible: true,
        heavySplitPreview: {
          ok: true,
          generatedInputs: [
            {
              inputIndex: 1,
              fromPage: 1,
              toPage: 2,
              pdfPageSelection: {
                mode: 'range',
                fromPage: 1,
                toPage: 2,
                selectedPageCount: 2,
                totalPages: 12,
              },
              processingInputFileName: 'selectable_text_fixture_12_pages_pages_01_02.pdf',
            },
            {
              inputIndex: 2,
              fromPage: 3,
              toPage: 4,
              pdfPageSelection: {
                mode: 'range',
                fromPage: 3,
                toPage: 4,
                selectedPageCount: 2,
                totalPages: 12,
              },
              processingInputFileName: 'selectable_text_fixture_12_pages_pages_03_04.pdf',
            },
          ],
        },
      },
      requiresRouteChoice: true,
      routeChoiceOptions: ['native', 'ocr'],
    },
    routePreference: 'ocr',
    resolvePaths: () => ({
      credentialsPath: '',
      tokenPath: '',
      bundledCredentialsFailureCode: '',
      bundledCredentialsFailureReason: '',
      bundledCredentialsFailureDetailsSafeForLogs: {},
      retainedGeneratedPdfArtifactsDir: RETAINED_GENERATED_PDF_ARTIFACTS_TEST_DIR,
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.result.state, 'success');
  assert.deepEqual(result.result.warnings, [
    'cleanup:pdf_subset_cleanup_failed',
    'cleanup:pdf_subset_cleanup_failed',
  ]);
  assert.deepEqual(result.warningAlertKeys, [
    'renderer.text_extraction.alerts.generated_pdf_cleanup_warning',
  ]);
  assert.equal(warnCalls.length, 2);
  assert.deepEqual(warnCalls[0], [
    'Generated PDF subset cleanup failed (ignored):',
    {
      warningCode: 'cleanup:pdf_subset_cleanup_failed',
      stage: 'cleanup_generated_subset',
      runDir: 'C:\\temp\\tot-run-1-2',
      fileName: 'selectable_text_fixture_12_pages_pages_01_02.pdf',
    },
  ]);
  assert.deepEqual(warnCalls[1], [
    'Generated PDF subset cleanup failed (ignored):',
    {
      warningCode: 'cleanup:pdf_subset_cleanup_failed',
      stage: 'cleanup_generated_subset',
      runDir: 'C:\\temp\\tot-run-3-4',
      fileName: 'selectable_text_fixture_12_pages_pages_03_04.pdf',
    },
  ]);
});

test('executePreparedImport keeps retained generated PDFs only on heavy split child statuses', async (t) => {
  const retainedArtifactsDir = createTestTempDir('heavy-split-retained');
  t.after(() => fs.rmSync(retainedArtifactsDir, { recursive: true, force: true }));

  const ocrRouteCalls = [];
  const { core, restore } = loadCoreWithMocks({
    mockRunGoogleDriveOcrRoute: async (args) => {
      assert.equal(Object.hasOwn(args, 'log'), false);
      const { filePath } = args;
      ocrRouteCalls.push(path.basename(filePath));
      return {
        state: 'success',
        executedRoute: 'ocr',
        text: `Extracted from ${path.basename(filePath)}`,
        warnings: [],
        provenance: {
          metadataSafeForLogs: {},
        },
        error: null,
      };
    },
  });
  t.after(restore);

  const controller = createExecutingController();
  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);

  const result = await core.executePreparedImport({
    preparedRecord: {
      fileInfo,
      ocrLanguage: 'es',
      planningMode: 'batch',
      forceHeavySplitFullSource: true,
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
      generatedPdfArtifactPolicy: {
        mode: 'keep',
      },
      processingInputFileName: 'selectable_text_fixture_12_pages.pdf',
      routeMetadata: {
        fileKind: 'pdf',
        availableRoutes: ['native', 'ocr'],
        chosenRoute: null,
        executedRoute: null,
        executionKind: null,
        pdfTriage: 'both',
        triageReason: 'native_text_detected_and_ocr_ready_choice_required',
        ocrSetupState: 'ready',
        heavySplitEligible: true,
        heavySplitPreview: {
          ok: true,
          generatedInputs: [
            {
              inputIndex: 1,
              fromPage: 1,
              toPage: 2,
              pdfPageSelection: {
                mode: 'range',
                fromPage: 1,
                toPage: 2,
                selectedPageCount: 2,
                totalPages: 12,
              },
              processingInputFileName: 'selectable_text_fixture_12_pages_pages_01_02.pdf',
            },
          ],
        },
      },
      requiresRouteChoice: true,
      routeChoiceOptions: ['native', 'ocr'],
    },
    routePreference: 'ocr',
    resolvePaths: () => ({
      credentialsPath: '',
      tokenPath: '',
      bundledCredentialsFailureCode: '',
      bundledCredentialsFailureReason: '',
      bundledCredentialsFailureDetailsSafeForLogs: {},
      retainedGeneratedPdfArtifactsDir: retainedArtifactsDir,
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionKind, 'google_drive');
  assert.deepEqual(ocrRouteCalls, [
    'selectable_text_fixture_12_pages_pages_01_02.pdf',
  ]);
  assert.equal(result.result.generatedPdfArtifact, null);
  assert.equal(result.result.processingInputFileName, 'selectable_text_fixture_12_pages.pdf');
  assert.equal(result.result.provenance.metadataSafeForLogs.processingInputSource, 'original_selected_file');
  assert.equal(result.result.provenance.metadataSafeForLogs.generatedPdfArtifactRetained, false);
  assert.equal(result.result.heavySplitExecution.generatedInputs.length, 1);
  assert.equal(result.result.heavySplitExecution.generatedInputs[0].generatedPdfArtifact.retained, true);
  assert.ok(result.result.heavySplitExecution.generatedInputs[0].generatedPdfArtifact.retainedArtifactPath);
});
