'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');

function createIpcMainDouble() {
  const handlers = new Map();

  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    async invoke(channel, event, ...args) {
      if (!handlers.has(channel)) {
        throw new Error(`No ipcMain.handle registered for ${channel}`);
      }
      return handlers.get(channel)(event, ...args);
    },
  };
}

function createReadingTestPoolMock({
  entries,
  initialShowBundledEntries = true,
} = {}) {
  let showBundledEntries = initialShowBundledEntries;

  function serializePoolEntryMeta(entry) {
    return {
      snapshotRelPath: entry.snapshotRelPath,
      fileName: entry.fileName,
      hasValidQuestions: !!entry.hasValidQuestions,
      tags: { ...(entry.tags || {}) },
      used: entry.used === true,
    };
  }

  function getVisiblePoolEntries(list, nextShowBundledEntries) {
    if (nextShowBundledEntries !== false) {
      return list.slice();
    }
    return list.filter((entry) => entry.isBundled !== true);
  }

  function hasHiddenBundledUnusedEntries(list, nextShowBundledEntries) {
    if (nextShowBundledEntries !== false) return false;
    return list.some((entry) => entry.isBundled === true && entry.used === false);
  }

  return {
    POOL_DIR_NAME: 'reading_speed_test_pool',
    listPoolEntries() {
      return { ok: true, entries: entries.slice() };
    },
    getShowBundledEntries() {
      return showBundledEntries;
    },
    setShowBundledEntries(nextValue) {
      if (typeof nextValue !== 'boolean') {
        return { ok: false, code: 'INVALID_SHOW_BUNDLED_ENTRIES' };
      }
      showBundledEntries = nextValue;
      return { ok: true, showBundledEntries };
    },
    getVisiblePoolEntries,
    hasHiddenBundledUnusedEntries,
    serializePoolEntryMeta,
    resetPoolUsageState() {
      for (const entry of entries) {
        entry.used = false;
      }
      return { ok: true, updated: entries.length, failed: 0 };
    },
  };
}

function loadReadingTestSessionWithMocks(readingTestPoolMock, senderWin) {
  const electronModulePath = require.resolve('electron');
  const poolModulePath = require.resolve('../../../electron/reading_test_pool');
  const sessionModulePath = require.resolve('../../../electron/reading_test_session');
  const originalElectronModule = require.cache[electronModulePath];
  const originalPoolModule = require.cache[poolModulePath];

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

  require.cache[poolModulePath] = {
    id: poolModulePath,
    filename: poolModulePath,
    loaded: true,
    exports: readingTestPoolMock,
  };

  delete require.cache[sessionModulePath];
  const readingTestSession = require(sessionModulePath);

  function restore() {
    delete require.cache[sessionModulePath];
    if (originalPoolModule) {
      require.cache[poolModulePath] = originalPoolModule;
    } else {
      delete require.cache[poolModulePath];
    }
    if (originalElectronModule) {
      require.cache[electronModulePath] = originalElectronModule;
    } else {
      delete require.cache[electronModulePath];
    }
  }

  return { readingTestSession, restore };
}

function createControllerHarness({
  entries,
  showBundledEntries = true,
  currentText = '',
} = {}) {
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {
      send() {},
    },
  };
  const readingTestPoolMock = createReadingTestPoolMock({
    entries,
    initialShowBundledEntries: showBundledEntries,
  });
  const { readingTestSession, restore } = loadReadingTestSessionWithMocks(readingTestPoolMock, senderWin);
  const ipcMain = createIpcMainDouble();
  const controller = readingTestSession.createController({
    resolveMainWindow: () => senderWin,
    getPreconditionContext: () => ({
      openSecondaryWindows: [],
      stopwatchRunning: false,
    }),
    isProcessingModeActive: () => false,
    ensureEditorWindow: async () => senderWin,
    showEditorWindow() {},
    ensureFlotanteWindow: async () => senderWin,
    closeEditorWindow() {},
    closeFlotanteWindow() {},
    startCrono() {},
    resetCrono() {},
    stopCrono() {},
    getCronoState: () => ({ elapsed: 0 }),
    getCurrentText: () => currentText,
    applyCurrentText: () => ({ ok: true }),
    openPresetWindow: () => null,
  });

  controller.registerIpc(ipcMain);

  return {
    ipcMain,
    senderEvent: { sender: senderWin.webContents },
    restore,
  };
}

test('reading-test entry data reports hidden bundled unused entries as a distinct empty state', async () => {
  const harness = createControllerHarness({
    showBundledEntries: false,
    entries: [
      {
        snapshotRelPath: '/reading_speed_test_pool/bundled.json',
        fileName: 'bundled.json',
        text: 'Bundled text.',
        tags: { language: 'en' },
        used: false,
        isBundled: true,
      },
      {
        snapshotRelPath: '/reading_speed_test_pool/imported.json',
        fileName: 'imported.json',
        text: 'Imported text.',
        tags: { language: 'en' },
        used: true,
        isBundled: false,
      },
    ],
  });

  try {
    const result = await harness.ipcMain.invoke('reading-test-get-entry-data', harness.senderEvent);
    assert.equal(result.ok, true);
    assert.equal(result.canOpen, true);
    assert.equal(result.showBundledEntries, false);
    assert.equal(result.poolExhausted, false);
    assert.equal(result.entryEmptyState, 'visible_empty_bundled_hidden');
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].fileName, 'imported.json');
  } finally {
    harness.restore();
  }
});

test('reading-test entry data keeps poolExhausted semantic for full-pool exhaustion', async () => {
  const harness = createControllerHarness({
    showBundledEntries: false,
    entries: [
      {
        snapshotRelPath: '/reading_speed_test_pool/bundled.json',
        fileName: 'bundled.json',
        text: 'Bundled text.',
        tags: { language: 'en' },
        used: true,
        isBundled: true,
      },
      {
        snapshotRelPath: '/reading_speed_test_pool/imported.json',
        fileName: 'imported.json',
        text: 'Imported text.',
        tags: { language: 'en' },
        used: true,
        isBundled: false,
      },
    ],
  });

  try {
    const result = await harness.ipcMain.invoke('reading-test-get-entry-data', harness.senderEvent);
    assert.equal(result.ok, true);
    assert.equal(result.poolExhausted, true);
    assert.equal(result.entryEmptyState, 'pool_exhausted');
  } finally {
    harness.restore();
  }
});

test('reading-test start returns hidden-bundled guidance when no visible unused entries remain', async () => {
  const harness = createControllerHarness({
    showBundledEntries: false,
    entries: [
      {
        snapshotRelPath: '/reading_speed_test_pool/bundled.json',
        fileName: 'bundled.json',
        text: 'Bundled text.',
        tags: { language: 'en' },
        used: false,
        isBundled: true,
      },
      {
        snapshotRelPath: '/reading_speed_test_pool/imported.json',
        fileName: 'imported.json',
        text: 'Imported text.',
        tags: { language: 'en' },
        used: true,
        isBundled: false,
      },
    ],
  });

  try {
    const result = await harness.ipcMain.invoke(
      'reading-test-start',
      harness.senderEvent,
      { sourceMode: 'pool', selection: {} }
    );
    assert.deepEqual(result, {
      ok: false,
      guidanceKey: 'renderer.alerts.reading_test_visible_empty_bundled_hidden',
      code: 'VISIBLE_EMPTY_BUNDLED_HIDDEN',
    });
  } finally {
    harness.restore();
  }
});

test('reading-test start keeps no-matching guidance for ordinary filter mismatch', async () => {
  const harness = createControllerHarness({
    showBundledEntries: false,
    entries: [
      {
        snapshotRelPath: '/reading_speed_test_pool/imported.json',
        fileName: 'imported.json',
        text: 'Imported text.',
        tags: { language: 'en', type: 'fiction' },
        used: false,
        isBundled: false,
      },
    ],
  });

  try {
    const result = await harness.ipcMain.invoke(
      'reading-test-start',
      harness.senderEvent,
      { sourceMode: 'pool', selection: { language: ['es'] } }
    );
    assert.deepEqual(result, {
      ok: false,
      guidanceKey: 'renderer.alerts.reading_test_no_matching_files',
      code: 'NO_MATCHING_FILES',
    });
  } finally {
    harness.restore();
  }
});

test('reading-test bundled visibility setter updates persisted entry data contract', async () => {
  const harness = createControllerHarness({
    showBundledEntries: true,
    entries: [
      {
        snapshotRelPath: '/reading_speed_test_pool/bundled.json',
        fileName: 'bundled.json',
        text: 'Bundled text.',
        tags: { language: 'en' },
        used: false,
        isBundled: true,
      },
      {
        snapshotRelPath: '/reading_speed_test_pool/imported.json',
        fileName: 'imported.json',
        text: 'Imported text.',
        tags: { language: 'en' },
        used: false,
        isBundled: false,
      },
    ],
  });

  try {
    const result = await harness.ipcMain.invoke(
      'reading-test-set-show-bundled-entries',
      harness.senderEvent,
      false
    );
    assert.equal(result.ok, true);
    assert.equal(result.showBundledEntries, false);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].fileName, 'imported.json');
    assert.equal(result.entryEmptyState, 'none');
  } finally {
    harness.restore();
  }
});
