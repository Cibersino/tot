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

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
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
    markPoolEntryUsed() {
      return { ok: true };
    },
  };
}

function loadReadingTestSessionWithMocks(readingTestPoolMock, senderWin, {
  sessionWindowsMock = null,
  settingsStateMock = null,
} = {}) {
  const poolModulePath = require.resolve('../../../electron/reading_test_pool');
  const sessionModulePath = require.resolve('../../../electron/reading_test_session');
  const sessionWindowsModulePath = require.resolve('../../../electron/reading_test_session_windows');
  const settingsModulePath = require.resolve('../../../electron/settings');
  const originalPoolModule = require.cache[poolModulePath];
  const originalSessionWindowsModule = require.cache[sessionWindowsModulePath];
  const originalSettingsModule = require.cache[settingsModulePath];
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
  if (sessionWindowsMock) {
    require.cache[sessionWindowsModulePath] = {
      id: sessionWindowsModulePath,
      filename: sessionWindowsModulePath,
      loaded: true,
      exports: sessionWindowsMock,
    };
  }
  if (settingsStateMock) {
    require.cache[settingsModulePath] = {
      id: settingsModulePath,
      filename: settingsModulePath,
      loaded: true,
      exports: settingsStateMock,
    };
  }

  delete require.cache[sessionModulePath];
  const readingTestSession = require(sessionModulePath);

  function restore() {
    delete require.cache[sessionModulePath];
    if (originalPoolModule) {
      require.cache[poolModulePath] = originalPoolModule;
    } else {
      delete require.cache[poolModulePath];
    }
    if (originalSessionWindowsModule) {
      require.cache[sessionWindowsModulePath] = originalSessionWindowsModule;
    } else {
      delete require.cache[sessionWindowsModulePath];
    }
    if (originalSettingsModule) {
      require.cache[settingsModulePath] = originalSettingsModule;
    } else {
      delete require.cache[settingsModulePath];
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

test('live Questions and Result windows remain settings targets until their actual closed events', async (t) => {
  const senderWin = {
    isDestroyed() {
      return false;
    },
    webContents: {
      send() {},
    },
  };
  const editorWin = { isDestroyed() { return false; } };
  const flotanteWin = { isDestroyed() { return false; } };
  const resultWin = { isDestroyed() { return false; } };
  const questionsWin = { isDestroyed() { return false; } };
  const lifecycle = {};
  const sessionWindowsMock = {
    async openReadingSessionWindows() {
      return { editorWin, flotanteWin };
    },
    async openResultWindow(_resultInfo, { onWindowCreated, onWindowClosed }) {
      onWindowCreated(resultWin);
      lifecycle.closeResult = () => onWindowClosed(resultWin);
      return { ok: false, code: 'RESULT_WINDOW_LOAD_FAILED' };
    },
    async openQuestionsWindow(_questions, { onWindowCreated, onWindowClosed }) {
      onWindowCreated(questionsWin);
      lifecycle.closeQuestions = () => onWindowClosed(questionsWin);
      return { ok: false, code: 'QUESTIONS_WINDOW_LOAD_FAILED' };
    },
    setEditorPrestartVisible() {},
    async waitForWindowVisible() {},
  };
  const settingsStateMock = {
    deriveLangKey() {
      return 'en';
    },
    getSettings() {
      return {
        language: 'en',
        modeConteo: 'preciso',
        presets_by_language: {},
      };
    },
  };
  const readingTestPoolMock = createReadingTestPoolMock({
    entries: [
      {
        snapshotRelPath: '/reading_speed_test_pool/questions.json',
        fileName: 'questions.json',
        text: 'word '.repeat(200),
        tags: { language: 'en' },
        used: false,
        hasValidQuestions: true,
        questions: [{ id: 'q1' }],
      },
    ],
  });
  const { readingTestSession, restore } = loadReadingTestSessionWithMocks(
    readingTestPoolMock,
    senderWin,
    { sessionWindowsMock, settingsStateMock }
  );
  t.after(restore);

  const ipcMain = createIpcMainDouble();
  let elapsed = 0;
  let currentText = '';
  const controller = readingTestSession.createController({
    resolveMainWindow: () => senderWin,
    getPreconditionContext: () => ({ openSecondaryWindows: [], stopwatchRunning: false }),
    isProcessingModeActive: () => false,
    ensureEditorWindow: async () => editorWin,
    showEditorWindow() {},
    ensureFlotanteWindow: async () => flotanteWin,
    closeEditorWindow() {},
    closeFlotanteWindow() {},
    startCrono() {
      elapsed = 60000;
    },
    resetCrono() {},
    stopCrono() {},
    getCronoState: () => ({ elapsed }),
    getCurrentText: () => currentText,
    applyCurrentText(text) {
      currentText = text;
      return { ok: true };
    },
    openPresetWindow: () => null,
  });
  controller.registerIpc(ipcMain);

  const startResult = await ipcMain.invoke(
    'reading-test-start',
    { sender: senderWin.webContents },
    { sourceMode: 'pool', selection: {} }
  );
  assert.deepEqual(startResult, { ok: true });
  await flushAsyncWork();
  assert.equal(controller.getState().stage, 'arming');

  controller.handleFlotanteCommand({ cmd: 'toggle' });
  assert.equal(controller.getState().stage, 'running');
  controller.handleFlotanteCommand({ cmd: 'toggle' });
  await flushAsyncWork();
  await flushAsyncWork();

  assert.equal(controller.getState().stage, 'idle');
  assert.deepEqual(controller.getSettingsWindows(), {
    readingTestQuestionsWin: questionsWin,
    readingTestResultWin: resultWin,
  });

  lifecycle.closeResult();
  assert.deepEqual(controller.getSettingsWindows(), {
    readingTestQuestionsWin: questionsWin,
    readingTestResultWin: null,
  });
  lifecycle.closeQuestions();
  assert.deepEqual(controller.getSettingsWindows(), {
    readingTestQuestionsWin: null,
    readingTestResultWin: null,
  });
});
