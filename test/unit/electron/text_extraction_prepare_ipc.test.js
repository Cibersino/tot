'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function createIpcMainDouble() {
  const handlers = new Map();

  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    async invoke(channel, event, ...args) {
      if (!handlers.has(channel)) {
        throw new Error(`Missing IPC handler: ${channel}`);
      }
      return handlers.get(channel)(event, ...args);
    },
  };
}

function loadPrepareIpcWithElectronMock(senderWin, coreOverrides = null) {
  const electronModulePath = require.resolve('electron');
  const coreModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/text_extraction_prepare_execute_core.js'
  );
  const prepareIpcModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/text_extraction_prepare_ipc.js'
  );
  const originalElectronModule = require.cache[electronModulePath];
  const originalCoreModule = require.cache[coreModulePath];

  require.cache[electronModulePath] = {
    id: electronModulePath,
    filename: electronModulePath,
    loaded: true,
    exports: {
      BrowserWindow: {
        fromWebContents(webContents) {
          return webContents === senderWin.webContents ? senderWin : null;
        },
      },
    },
  };

  delete require.cache[coreModulePath];
  const actualCoreModule = require(coreModulePath);
  require.cache[coreModulePath] = {
    id: coreModulePath,
    filename: coreModulePath,
    loaded: true,
    exports: coreOverrides
      ? {
        ...actualCoreModule,
        ...coreOverrides,
      }
      : actualCoreModule,
  };
  delete require.cache[prepareIpcModulePath];
  const prepareIpc = require(prepareIpcModulePath);

  function restore() {
    delete require.cache[prepareIpcModulePath];
    if (originalCoreModule) {
      require.cache[coreModulePath] = originalCoreModule;
    } else {
      delete require.cache[coreModulePath];
    }
    if (originalElectronModule) {
      require.cache[electronModulePath] = originalElectronModule;
    } else {
      delete require.cache[electronModulePath];
    }
  }

  return {
    prepareIpc,
    restore,
  };
}

test('prepare IPC forwards PDF selection and generated artifact policy into prepared state', async (t) => {
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { prepareIpc, restore } = loadPrepareIpcWithElectronMock(senderWin);
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  prepareIpc.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
    resolvePaths: () => ({
      credentialsPath: path.resolve(__dirname, '../../fixtures/missing-ocr-credentials.json'),
      tokenPath: path.resolve(__dirname, '../../fixtures/missing-ocr-token.json'),
      bundledCredentialsFailureCode: '',
      bundledCredentialsFailureReason: '',
      bundledCredentialsFailureDetailsSafeForLogs: {},
      retainedGeneratedPdfArtifactsDir: path.resolve(__dirname, '../../../tmp-generated-pdfs-test'),
    }),
  });

  const result = await ipcMain.invoke(
    'text-extraction-prepare-selected-file',
    { sender: senderWin.webContents },
    {
      filePath: path.resolve(__dirname, '../../../test/fixtures/pdf/selectable_text_fixture_12_pages.pdf'),
      ocrLanguage: 'es',
      planningMode: 'batch',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 2,
        toPage: 3,
      },
      generatedPdfArtifactPolicy: {
        mode: 'keep',
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.prepareReady, true);
  assert.equal(result.prepareFailed, false);
  assert.match(result.prepareId, /^[0-9a-f-]{36}$/i);
  assert.equal(result.planningMode, 'batch');
  assert.equal(result.fileInfo.fileName, 'selectable_text_fixture_12_pages.pdf');
  assert.equal(result.fileInfo.sourceFileKind, 'pdf');
  assert.deepEqual(result.pdfPageSelection, {
    mode: 'range',
    fromPage: 2,
    toPage: 3,
    selectedPageCount: 2,
    totalPages: 12,
  });
  assert.deepEqual(result.generatedPdfArtifactPolicy, {
    mode: 'keep',
  });
  assert.equal(result.processingInputFileName, 'selectable_text_fixture_12_pages_pages_02_03.pdf');
});

test('prepare IPC forwards forceHeavySplitFullSource into prepareSelectedFile and preserves it in the prepare result', async (t) => {
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  let capturedPrepareArgs = null;
  const { prepareIpc, restore } = loadPrepareIpcWithElectronMock(senderWin, {
    async prepareSelectedFile(args) {
      capturedPrepareArgs = args;
      return {
        ok: true,
        prepareReady: true,
        fileInfo: {
          filePath: args.filePath,
          fileName: 'heavy.pdf',
          sourceFileExt: 'pdf',
          sourceFileKind: 'pdf',
          sourceFileSizeBytes: 458 * 1024 * 1024,
        },
        planningMode: 'batch',
        forceHeavySplitFullSource: true,
        executionKind: 'google_drive',
        pdfPageSelection: {
          mode: 'all',
          fromPage: 1,
          toPage: 516,
          selectedPageCount: 516,
          totalPages: 516,
        },
        generatedPdfArtifactPolicy: {
          mode: 'keep',
        },
        processingInputFileName: 'heavy.pdf',
        routeMetadata: {
          fileKind: 'pdf',
          availableRoutes: ['native', 'ocr'],
          chosenRoute: null,
          executionKind: null,
          pdfTriage: 'both',
          triageReason: 'native_text_detected_and_ocr_ready_choice_required',
          ocrSetupState: 'ready',
          pdfPageSelection: {
            mode: 'all',
            fromPage: 1,
            toPage: 516,
            selectedPageCount: 516,
            totalPages: 516,
          },
          generatedPdfArtifactPolicyMode: 'keep',
          heavySplitEligible: true,
          heavySplitPreview: {
            ok: true,
            generatedInputs: [
              {
                inputIndex: 1,
                fromPage: 1,
                toPage: 42,
                pdfPageSelection: {
                  mode: 'range',
                  fromPage: 1,
                  toPage: 42,
                  selectedPageCount: 42,
                  totalPages: 516,
                },
                processingInputFileName: 'heavy_pages_001_042.pdf',
              },
            ],
          },
        },
        requiresRouteChoice: true,
        routeChoiceOptions: ['native', 'ocr'],
        preparedPayload: {
          fileInfo: {
            filePath: args.filePath,
            fileName: 'heavy.pdf',
            sourceFileExt: 'pdf',
            sourceFileKind: 'pdf',
            sourceFileSizeBytes: 458 * 1024 * 1024,
          },
          ocrLanguage: args.ocrLanguage,
          planningMode: 'batch',
          forceHeavySplitFullSource: true,
          pdfPageSelection: {
            mode: 'all',
            fromPage: 1,
            toPage: 516,
            selectedPageCount: 516,
            totalPages: 516,
          },
          generatedPdfArtifactPolicy: {
            mode: 'keep',
          },
          processingInputFileName: 'heavy.pdf',
          routeMetadata: {
            fileKind: 'pdf',
            availableRoutes: ['native', 'ocr'],
            chosenRoute: null,
            executionKind: null,
            pdfTriage: 'both',
            triageReason: 'native_text_detected_and_ocr_ready_choice_required',
            ocrSetupState: 'ready',
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 516,
              selectedPageCount: 516,
              totalPages: 516,
            },
            generatedPdfArtifactPolicyMode: 'keep',
            heavySplitEligible: true,
            heavySplitPreview: {
              ok: true,
              generatedInputs: [
                {
                  inputIndex: 1,
                  fromPage: 1,
                  toPage: 42,
                  pdfPageSelection: {
                    mode: 'range',
                    fromPage: 1,
                    toPage: 42,
                    selectedPageCount: 42,
                    totalPages: 516,
                  },
                  processingInputFileName: 'heavy_pages_001_042.pdf',
                },
              ],
            },
          },
          requiresRouteChoice: true,
          routeChoiceOptions: ['native', 'ocr'],
        },
      };
    },
  });
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  prepareIpc.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
    resolvePaths: () => ({
      credentialsPath: path.resolve(__dirname, '../../fixtures/missing-ocr-credentials.json'),
      tokenPath: path.resolve(__dirname, '../../fixtures/missing-ocr-token.json'),
      bundledCredentialsFailureCode: '',
      bundledCredentialsFailureReason: '',
      bundledCredentialsFailureDetailsSafeForLogs: {},
      retainedGeneratedPdfArtifactsDir: path.resolve(__dirname, '../../../tmp-generated-pdfs-test'),
    }),
  });

  const result = await ipcMain.invoke(
    'text-extraction-prepare-selected-file',
    { sender: senderWin.webContents },
    {
      filePath: path.resolve(__dirname, '../../../test/fixtures/pdf/selectable_text_fixture_12_pages.pdf'),
      ocrLanguage: 'es',
      planningMode: 'batch',
      forceHeavySplitFullSource: true,
      pdfPageSelection: {
        mode: 'range',
        fromPage: 100,
        toPage: 220,
      },
      generatedPdfArtifactPolicy: {
        mode: 'keep',
      },
    }
  );

  assert.equal(capturedPrepareArgs.forceHeavySplitFullSource, true);
  assert.equal(result.ok, true);
  assert.equal(result.prepareReady, true);
  assert.equal(result.forceHeavySplitFullSource, true);
  assert.deepEqual(result.pdfPageSelection, {
    mode: 'all',
    fromPage: 1,
    toPage: 516,
    selectedPageCount: 516,
    totalPages: 516,
  });
});
