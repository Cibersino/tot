'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');

function createIpcMainDouble() {
  const handlers = new Map();
  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    async invoke(channel, event) {
      if (!handlers.has(channel)) {
        throw new Error(`No ipcMain.handle registered for ${channel}`);
      }
      return handlers.get(channel)(event);
    },
  };
}

function createHarness(preconditionContext) {
  const mainWin = {
    isDestroyed() {
      return false;
    },
    webContents: {},
  };
  const restoreElectronModule = installElectronModuleMock({
    BrowserWindow: {
      fromWebContents(webContents) {
        return webContents === mainWin.webContents ? mainWin : null;
      },
    },
  });
  const modulePath = require.resolve('../../../electron/text_extraction_platform/text_extraction_preconditions_ipc');
  delete require.cache[modulePath];
  const textExtractionPreconditionsIpc = require(modulePath);
  const ipcMain = createIpcMainDouble();

  textExtractionPreconditionsIpc.registerIpc(ipcMain, {
    getWindows: () => ({ mainWin }),
    getPreconditionContext: () => preconditionContext,
  });

  return {
    ipcMain,
    senderEvent: { sender: mainWin.webContents },
    restore() {
      delete require.cache[modulePath];
      restoreElectronModule();
    },
  };
}

test('text extraction preconditions reject when the text time calculator window is open', async () => {
  const harness = createHarness({
    openSecondaryWindows: [{ id: 'text_time_calculator', label: 'text_time_calculator', isOpen: true }],
    stopwatchRunning: false,
  });

  try {
    const result = await harness.ipcMain.invoke(
      'text-extraction-check-preconditions',
      harness.senderEvent
    );

    assert.equal(result.ok, true);
    assert.equal(result.canStart, false);
    assert.deepEqual(result.reasons, ['secondary_windows_open']);
    assert.deepEqual(result.detailsSafeForLogs.openSecondaryWindowIds, ['text_time_calculator']);
  } finally {
    harness.restore();
  }
});
