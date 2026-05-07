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

function loadPrepareIpcWithElectronMock(senderWin) {
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
      generatedPdfArtifactsDir: path.resolve(__dirname, '../../../tmp-generated-pdfs-test'),
    }),
  });

  const result = await ipcMain.invoke(
    'text-extraction-prepare-selected-file',
    { sender: senderWin.webContents },
    {
      filePath: path.resolve(__dirname, '../../../tools_local/smoke/prueba_pdf_original_12_paginas.pdf'),
      ocrLanguage: 'es',
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
  assert.match(result.prepareId, /^[0-9a-f-]{36}$/i);
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
  assert.equal(result.processingInputFileName, 'prueba_pdf_original_12_paginas_pages_2_3.pdf');
});
