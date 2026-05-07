'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

function loadRevealIpcWithElectronMock(senderWin) {
  const electronModulePath = require.resolve('electron');
  const coreModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/text_extraction_prepare_execute_core.js'
  );
  const revealIpcModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/text_extraction_generated_pdf_reveal_ipc.js'
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
  delete require.cache[revealIpcModulePath];
  const revealIpc = require(revealIpcModulePath);

  function restore() {
    delete require.cache[revealIpcModulePath];
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
    revealIpc,
    restore,
  };
}

test('generated PDF reveal IPC reveals retained artifacts inside the allowed root', async (t) => {
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { revealIpc, restore } = loadRevealIpcWithElectronMock(senderWin);
  t.after(restore);

  const retainedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tot-generated-pdfs-root-'));
  t.after(() => fs.rmSync(retainedRoot, { recursive: true, force: true }));
  const runDir = path.join(retainedRoot, 'run-123');
  fs.mkdirSync(runDir, { recursive: true });
  const artifactPath = path.join(runDir, 'saved_subset.pdf');
  fs.writeFileSync(artifactPath, 'fixture');

  const revealedPaths = [];
  const ipcMain = createIpcMainDouble();
  revealIpc.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
    resolvePaths: () => ({
      generatedPdfArtifactsDir: retainedRoot,
    }),
    shellApi: {
      showItemInFolder(filePath) {
        revealedPaths.push(filePath);
      },
    },
  });

  const result = await ipcMain.invoke(
    'text-extraction-reveal-generated-pdf',
    { sender: senderWin.webContents },
    { artifactPath }
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(revealedPaths, [artifactPath]);
});

test('generated PDF reveal IPC rejects artifacts outside the allowed root', async (t) => {
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const { revealIpc, restore } = loadRevealIpcWithElectronMock(senderWin);
  t.after(restore);

  const retainedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tot-generated-pdfs-root-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tot-generated-pdfs-outside-'));
  t.after(() => fs.rmSync(retainedRoot, { recursive: true, force: true }));
  t.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  const outsideArtifactPath = path.join(outsideRoot, 'saved_subset.pdf');
  fs.writeFileSync(outsideArtifactPath, 'fixture');

  const revealedPaths = [];
  const ipcMain = createIpcMainDouble();
  revealIpc.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin: senderWin }),
    resolvePaths: () => ({
      generatedPdfArtifactsDir: retainedRoot,
    }),
    shellApi: {
      showItemInFolder(filePath) {
        revealedPaths.push(filePath);
      },
    },
  });

  const result = await ipcMain.invoke(
    'text-extraction-reveal-generated-pdf',
    { sender: senderWin.webContents },
    { artifactPath: outsideArtifactPath }
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'ARTIFACT_OUTSIDE_ALLOWED_ROOT',
  });
  assert.deepEqual(revealedPaths, []);
});
