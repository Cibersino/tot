'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const {
  inspectPdfFile,
} = require('../../../electron/text_extraction_platform/text_extraction_pdf_page_selection');

const {
  executePreparedImport,
  getFileInfo,
  inspectSelectedFile,
  prepareSelectedFile,
  resolveExecutePayload,
  resolveInspectPayload,
  resolvePreparePayload,
  resolvePreparedRoute,
} = require('../../../electron/text_extraction_platform/text_extraction_prepare_execute_core');

const SELECTABLE_PDF_FIXTURE = path.resolve('test/fixtures/pdf/selectable_text_fixture_12_pages.pdf');
const SCANNED_PDF_FIXTURE = path.resolve('test/fixtures/pdf/image_only_fixture_12_pages.pdf');
const ENCRYPTED_PDF_FIXTURE = path.resolve('test/fixtures/pdf/encrypted_selectable_text_fixture.pdf');

function loadCoreWithMocks({
  mockRunNativeExtractionRoute = null,
  pdfPageSelectionOverrides = null,
} = {}) {
  const coreModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/text_extraction_prepare_execute_core.js'
  );
  const nativeRouteModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/native_extraction_route.js'
  );
  const pdfPageSelectionModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/text_extraction_pdf_page_selection.js'
  );
  const originalCoreModule = require.cache[coreModulePath];
  const originalNativeRouteModule = require.cache[nativeRouteModulePath];
  const originalPdfPageSelectionModule = require.cache[pdfPageSelectionModulePath];

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
    if (pdfPageSelectionOverrides && typeof pdfPageSelectionOverrides === 'object' && originalPdfPageSelectionModule) {
      require.cache[pdfPageSelectionModulePath] = originalPdfPageSelectionModule;
    } else if (pdfPageSelectionOverrides && typeof pdfPageSelectionOverrides === 'object') {
      delete require.cache[pdfPageSelectionModulePath];
    }
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tot-issue-271-mixed-pdf-'));
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
    }),
    {
      prepareId: 'abc-123',
      routePreference: 'native',
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
  assert.equal(result.primaryAlertKey, 'renderer.alerts.text_extraction_native_unsupported_format');
  assert.equal(result.error.code, 'unsupported_format');
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
    'renderer.alerts.text_extraction_pdf_encrypted_or_password_protected'
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
    generatedPdfArtifactsDir: path.join(os.tmpdir(), 'tot-generated-pdfs-tests'),
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
    'renderer.alerts.text_extraction_pdf_encrypted_or_password_protected'
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
    primaryAlertKey: 'renderer.alerts.text_extraction_route_choice_required',
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
    },
  ]);
  assert.deepEqual(controller.exitCalls, []);
});

test('executePreparedImport materializes the selected PDF range for native success and preserves original provenance', async (t) => {
  const nativeRouteCalls = [];
  const { core, restore } = loadCoreWithNativeRouteMock(async ({ filePath }) => {
    nativeRouteCalls.push(filePath);
    assert.equal(path.basename(filePath), 'selectable_text_fixture_12_pages_pages_2_3.pdf');
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
      processingInputFileName: 'selectable_text_fixture_12_pages_pages_2_3.pdf',
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
      generatedPdfArtifactsDir: path.join(os.tmpdir(), 'tot-generated-pdfs-tests'),
    }),
    controller,
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionKind, 'native');
  assert.equal(result.result.state, 'success');
  assert.equal(result.result.text, 'Synthetic extracted text');
  assert.equal(result.result.processingInputFileName, 'selectable_text_fixture_12_pages_pages_2_3.pdf');
  assert.equal(result.result.pdfPageSelection.mode, 'range');
  assert.equal(result.result.generatedPdfArtifactPolicy.mode, 'delete');
  assert.equal(result.result.generatedPdfArtifact.fileName, 'selectable_text_fixture_12_pages_pages_2_3.pdf');
  assert.equal(result.result.generatedPdfArtifact.retained, false);
  assert.equal(result.result.provenance.sourceFileName, 'selectable_text_fixture_12_pages.pdf');
  assert.equal(result.result.provenance.metadataSafeForLogs.processingInputSource, 'generated_pdf_subset');
  assert.equal(result.result.provenance.metadataSafeForLogs.generatedPdfArtifactRetained, false);
  assert.equal(result.primaryAlertKey, 'renderer.alerts.text_extraction_native_apply_pending');
  assert.deepEqual(result.warningAlertKeys, []);
  assert.deepEqual(controller.enterCalls, [
    {
      source: 'text_extraction_execution',
      reason: 'run_pdf_route',
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
          effectiveFilePath: path.join(os.tmpdir(), 'aborted_subset.pdf'),
          processingInputFileName: 'selectable_text_fixture_12_pages_pages_2_3.pdf',
          processingInputSource: 'generated_pdf_subset',
          generatedPdfArtifact: {
            fileName: 'selectable_text_fixture_12_pages_pages_2_3.pdf',
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
      processingInputFileName: 'selectable_text_fixture_12_pages_pages_2_3.pdf',
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
      generatedPdfArtifactsDir: path.join(os.tmpdir(), 'tot-generated-pdfs-tests'),
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
  assert.equal(result.primaryAlertKey, 'renderer.alerts.text_extraction_native_cancelled');
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
          effectiveFilePath: path.join(os.tmpdir(), 'replacement_subset.pdf'),
          processingInputFileName: 'selectable_text_fixture_12_pages_pages_2_3.pdf',
          processingInputSource: 'generated_pdf_subset',
          generatedPdfArtifact: {
            fileName: 'selectable_text_fixture_12_pages_pages_2_3.pdf',
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
      processingInputFileName: 'selectable_text_fixture_12_pages_pages_2_3.pdf',
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
      generatedPdfArtifactsDir: path.join(os.tmpdir(), 'tot-generated-pdfs-tests'),
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
