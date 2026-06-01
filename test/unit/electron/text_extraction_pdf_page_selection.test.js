'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');

const {
  canonicalizeGeneratedPdfArtifactPolicy,
  canonicalizePdfPageSelection,
  inspectPdfFile,
  materializePdfPageSelectionInput,
  resolveProcessingInputFileName,
} = require('../../../electron/text_extraction_platform/text_extraction_pdf_page_selection');
const {
  isInsideRuntimeTempRoot,
} = require('../../../electron/app_temp_paths');

const SELECTABLE_PDF_FIXTURE = path.resolve('test/fixtures/pdf/selectable_text_fixture_12_pages.pdf');
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
  getFileInfo,
} = loadCoreExports();

function loadPdfPageSelectionModuleWithMocks({
  fsOverrides = {},
  logDouble = null,
  appTempPathsOverrides = null,
} = {}) {
  const modulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/text_extraction_pdf_page_selection.js'
  );
  const fsModulePath = require.resolve('fs');
  const logModulePath = path.resolve(__dirname, '../../../electron/log.js');
  const appTempPathsModulePath = path.resolve(__dirname, '../../../electron/app_temp_paths.js');
  const originalTargetModule = require.cache[modulePath];
  const originalFsModule = require.cache[fsModulePath];
  const originalLogModule = require.cache[logModulePath];
  const originalAppTempPathsModule = require.cache[appTempPathsModulePath];
  const realFs = require('fs');
  const mockFs = { ...realFs, ...fsOverrides };
  const fakeLog = logDouble || {
    warn() {},
    warnOnce() {},
    error() {},
    errorOnce() {},
    debug() {},
    info() {},
  };

  require.cache[fsModulePath] = {
    id: fsModulePath,
    filename: fsModulePath,
    loaded: true,
    exports: mockFs,
  };
  require.cache[logModulePath] = {
    id: logModulePath,
    filename: logModulePath,
    loaded: true,
    exports: {
      get() {
        return fakeLog;
      },
    },
  };

  delete require.cache[appTempPathsModulePath];
  if (appTempPathsOverrides && typeof appTempPathsOverrides === 'object') {
    const actualAppTempPathsModule = require(appTempPathsModulePath);
    require.cache[appTempPathsModulePath] = {
      id: appTempPathsModulePath,
      filename: appTempPathsModulePath,
      loaded: true,
      exports: {
        ...actualAppTempPathsModule,
        ...appTempPathsOverrides,
      },
    };
  }

  delete require.cache[modulePath];
  const loadedModule = require(modulePath);

  function restore() {
    delete require.cache[modulePath];
    if (originalTargetModule) {
      require.cache[modulePath] = originalTargetModule;
    } else {
      delete require.cache[modulePath];
    }
    if (originalFsModule) {
      require.cache[fsModulePath] = originalFsModule;
    } else {
      delete require.cache[fsModulePath];
    }
    if (originalLogModule) {
      require.cache[logModulePath] = originalLogModule;
    } else {
      delete require.cache[logModulePath];
    }
    if (originalAppTempPathsModule) {
      require.cache[appTempPathsModulePath] = originalAppTempPathsModule;
    } else {
      delete require.cache[appTempPathsModulePath];
    }
  }

  return {
    loadedModule,
    restore,
  };
}

test('canonicalizePdfPageSelection normalizes all-pages and contiguous ranges', () => {
  assert.deepEqual(
    canonicalizePdfPageSelection(null, { totalPages: 12 }),
    {
      ok: true,
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }
  );

  assert.deepEqual(
    canonicalizePdfPageSelection(
      {
        mode: 'range',
        fromPage: 3,
        toPage: 5,
      },
      { totalPages: 12 }
    ),
    {
      ok: true,
      pdfPageSelection: {
        mode: 'range',
        fromPage: 3,
        toPage: 5,
        selectedPageCount: 3,
        totalPages: 12,
      },
    }
  );

  assert.equal(
    canonicalizePdfPageSelection(
      {
        mode: 'range',
        fromPage: 5,
        toPage: 3,
      },
      { totalPages: 12 }
    ).ok,
    false
  );
});

test('canonicalizeGeneratedPdfArtifactPolicy defaults to delete and accepts keep', () => {
  assert.deepEqual(canonicalizeGeneratedPdfArtifactPolicy(null), { mode: 'delete' });
  assert.deepEqual(canonicalizeGeneratedPdfArtifactPolicy({ mode: 'keep' }), { mode: 'keep' });
});

test('inspectPdfFile returns page count for selectable fixture', async () => {
  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);
  const inspection = await inspectPdfFile({ fileInfo });

  assert.equal(inspection.ok, true);
  assert.equal(inspection.isPdf, true);
  assert.equal(inspection.totalPages, 12);
  assert.equal(inspection.error, null);
});

test('materializePdfPageSelectionInput creates and cleans up a temporary subset PDF', async (t) => {
  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);
  const selection = canonicalizePdfPageSelection(
    {
      mode: 'range',
      fromPage: 2,
      toPage: 3,
    },
    { totalPages: 12 }
  ).pdfPageSelection;

  const materialized = await materializePdfPageSelectionInput({
    fileInfo,
    pdfPageSelection: selection,
    generatedPdfArtifactPolicy: { mode: 'delete' },
  });
  assert.equal(materialized.ok, true);
  assert.equal(materialized.materialized, true);
  assert.equal(materialized.processingInputSource, 'generated_pdf_subset');
  assert.equal(materialized.processingInputFileName, 'selectable_text_fixture_12_pages_pages_02_03.pdf');
  assert.equal(fs.existsSync(materialized.effectiveFilePath), true);
  assert.equal(isInsideRuntimeTempRoot(materialized.effectiveFilePath), true);

  const subsetInspection = await inspectPdfFile({
    fileInfo: getFileInfo(materialized.effectiveFilePath),
  });
  assert.equal(subsetInspection.totalPages, 2);
  assert.equal(resolveProcessingInputFileName({ fileInfo, pdfPageSelection: selection }), materialized.processingInputFileName);

  const cleanupWarning = materialized.cleanupGeneratedArtifact();
  assert.equal(cleanupWarning, null);
  assert.equal(fs.existsSync(materialized.effectiveFilePath), false);

  t.after(() => {
    const runDir = path.dirname(materialized.effectiveFilePath);
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  });
});

test('materializePdfPageSelectionInput retains subset PDFs under the caller-owned keep directory', async (t) => {
  const retainedDir = createTestTempDir('generated-pdf-keep');
  t.after(() => fs.rmSync(retainedDir, { recursive: true, force: true }));

  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);
  const selection = canonicalizePdfPageSelection(
    {
      mode: 'range',
      fromPage: 4,
      toPage: 4,
    },
    { totalPages: 12 }
  ).pdfPageSelection;

  const materialized = await materializePdfPageSelectionInput({
    fileInfo,
    pdfPageSelection: selection,
    generatedPdfArtifactPolicy: { mode: 'keep' },
    retainedArtifactsDir: retainedDir,
  });

  assert.equal(materialized.ok, true);
  assert.equal(materialized.materialized, true);
  assert.equal(materialized.generatedPdfArtifact.retained, true);
  assert.equal(materialized.generatedPdfArtifact.policyMode, 'keep');
  assert.equal(materialized.generatedPdfArtifact.retainedArtifactPath, materialized.retainedArtifactPath);
  assert.equal(materialized.retainedArtifactPath.endsWith(path.join('', 'selectable_text_fixture_12_pages_pages_04_04.pdf')), true);
  assert.equal(fs.existsSync(materialized.retainedArtifactPath), true);
  assert.equal(materialized.cleanupGeneratedArtifact(), null);
});

test('resolveProcessingInputFileName pads range bounds to the source PDF page-count width', () => {
  assert.equal(
    resolveProcessingInputFileName({
      fileInfo: {
        fileName: 'libro_pesado.pdf',
      },
      pdfPageSelection: {
        mode: 'range',
        fromPage: 1,
        toPage: 42,
        totalPages: 516,
      },
    }),
    'libro_pesado_pages_001_042.pdf'
  );

  assert.equal(
    resolveProcessingInputFileName({
      fileInfo: {
        fileName: 'libro_pesado.pdf',
      },
      pdfPageSelection: {
        mode: 'range',
        fromPage: 43,
        toPage: 84,
        totalPages: 2400,
      },
    }),
    'libro_pesado_pages_0043_0084.pdf'
  );
});

test('materializePdfPageSelectionInput keeps page-selection failure primary and logs cleanup failure details', async (t) => {
  const warnCalls = [];
  const logDouble = {
    warn(...args) {
      warnCalls.push(args);
    },
    warnOnce() {},
    error() {},
    errorOnce() {},
    debug() {},
    info() {},
  };
  const { loadedModule, restore } = loadPdfPageSelectionModuleWithMocks({
    appTempPathsOverrides: {
      cleanupRuntimeTempRunDir(runDir) {
        return {
          warningCode: 'cleanup:runtime_temp_run_dir_cleanup_failed',
          detailsSafeForLogs: {
            stage: 'cleanup_runtime_temp_run_dir',
            runDir,
            resolvedRunDir: runDir,
            runtimeTempRoot: path.join(os.tmpdir(), 'tot-temp'),
            errorName: 'Error',
            errorCode: 'EPERM',
            errorMessage: 'cleanup denied',
          },
        };
      },
    },
    logDouble,
  });
  t.after(restore);

  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);
  const result = await loadedModule.materializePdfPageSelectionInput({
    fileInfo,
    pdfPageSelection: {
      mode: 'range',
      fromPage: 1,
      toPage: 20,
      selectedPageCount: 20,
      totalPages: 20,
    },
    generatedPdfArtifactPolicy: { mode: 'delete' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'pdf_page_selection_invalid');
  assert.equal(result.error.detailsSafeForLogs.reason, 'bounds_out_of_range');
  assert.equal(result.error.detailsSafeForLogs.cleanupFailure.stage, 'cleanup_materialization_failure');
  assert.equal(result.error.detailsSafeForLogs.cleanupFailure.errorCode, 'EPERM');
  assert.equal(warnCalls.length, 1);
  assert.equal(warnCalls[0][0], 'Generated PDF materialization cleanup failed (ignored):');
});
