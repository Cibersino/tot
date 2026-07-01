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
  resetPoolUsageStateImpl = null,
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
      if (typeof resetPoolUsageStateImpl === 'function') {
        return resetPoolUsageStateImpl(entries);
      }
      for (const entry of entries) {
        entry.used = false;
      }
      return { ok: true, updated: entries.length, failed: 0 };
    },
  };
}

function loadReadingTestSessionWithMocks(readingTestPoolMock, senderWin) {
  const poolModulePath = require.resolve('../../../electron/reading_test_pool');
  const sessionModulePath = require.resolve('../../../electron/reading_test_session');
  const originalPoolModule = require.cache[poolModulePath];
  const restoreElectronModule = installElectronModuleMock({
    BrowserWindow: {
      fromWebContents(webContents) {
        return webContents === senderWin.webContents ? senderWin : null;
      },
    },
  });

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
    restoreElectronModule();
  }

  return { readingTestSession, restore };
}

function createControllerHarness({
  entries,
  showBundledEntries = true,
  currentText = '',
  preconditionContext = null,
  resetPoolUsageStateImpl = null,
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
    resetPoolUsageStateImpl,
  });
  const { readingTestSession, restore } = loadReadingTestSessionWithMocks(readingTestPoolMock, senderWin);
  const ipcMain = createIpcMainDouble();
  let ensureEditorWindowCalls = 0;
  const controller = readingTestSession.createController({
    resolveMainWindow: () => senderWin,
    getPreconditionContext: () => (preconditionContext || {
      openSecondaryWindows: [],
      stopwatchRunning: false,
    }),
    isProcessingModeActive: () => false,
    ensureEditorWindow: async () => {
      ensureEditorWindowCalls += 1;
      return senderWin;
    },
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
    getEnsureEditorWindowCalls: () => ensureEditorWindowCalls,
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
      guidanceKey: 'renderer.reading_test.alerts.visible_empty_bundled_hidden',
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
      guidanceKey: 'renderer.reading_test.alerts.no_matching_files',
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

test('reading-test reset reports pool_error when pool usage persistence fails', async () => {
  const harness = createControllerHarness({
    entries: [
      {
        snapshotRelPath: '/reading_speed_test_pool/imported.json',
        fileName: 'imported.json',
        text: 'Imported text.',
        tags: { language: 'en' },
        used: true,
        isBundled: false,
      },
    ],
    resetPoolUsageStateImpl() {
      return { ok: false, code: 'WRITE_FAILED' };
    },
  });

  try {
    const result = await harness.ipcMain.invoke(
      'reading-test-reset-pool',
      harness.senderEvent
    );
    assert.deepEqual(result, {
      ok: false,
      code: 'WRITE_FAILED',
      guidanceKey: 'renderer.reading_test.alerts.pool_error',
    });
  } finally {
    harness.restore();
  }
});

test('reading-test start stays on the existing blocked path when the editor window is already open', async () => {
  const harness = createControllerHarness({
    entries: [
      {
        snapshotRelPath: '/reading_speed_test_pool/imported.json',
        fileName: 'imported.json',
        text: 'Imported text.',
        tags: { language: 'en' },
        used: false,
        isBundled: false,
      },
    ],
    preconditionContext: {
      openSecondaryWindows: [{ id: 'editor', label: 'editor', isOpen: true }],
      stopwatchRunning: false,
    },
  });

  try {
    const result = await harness.ipcMain.invoke(
      'reading-test-start',
      harness.senderEvent,
      { sourceMode: 'pool', selection: {} }
    );
    assert.deepEqual(result, {
      ok: false,
      code: 'PRECONDITION_BLOCKED',
      guidanceKey: 'renderer.reading_test.alerts.precondition_blocked',
    });
    assert.equal(harness.getEnsureEditorWindowCalls(), 0);
  } finally {
    harness.restore();
  }
});

test('reading-test start stays blocked when the text time calculator window is already open', async () => {
  const harness = createControllerHarness({
    entries: [
      {
        snapshotRelPath: '/reading_speed_test_pool/imported.json',
        fileName: 'imported.json',
        text: 'Imported text.',
        tags: { language: 'en' },
        used: false,
        isBundled: false,
      },
    ],
    preconditionContext: {
      openSecondaryWindows: [{ id: 'text_time_calculator', label: 'text_time_calculator', isOpen: true }],
      stopwatchRunning: false,
    },
  });

  try {
    const result = await harness.ipcMain.invoke(
      'reading-test-start',
      harness.senderEvent,
      { sourceMode: 'pool', selection: {} }
    );
    assert.deepEqual(result, {
      ok: false,
      code: 'PRECONDITION_BLOCKED',
      guidanceKey: 'renderer.reading_test.alerts.precondition_blocked',
    });
    assert.equal(harness.getEnsureEditorWindowCalls(), 0);
  } finally {
    harness.restore();
  }
});
