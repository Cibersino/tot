'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const readingTestSessionFlow = require('../../../electron/reading_test_session_flow');
const editorWindowLifecycle = require('../../../electron/editor_window_lifecycle');
const readingTestSessionWindows = require('../../../electron/reading_test_session_windows');

function createLoggerDouble() {
  return {
    debug() {},
    warn() {},
    warnOnce() {},
    error() {},
  };
}

test('computeCurrentWpm retries only the final count after canonical Precise fallback', () => {
  const preciseFailure = Object.assign(new Error('Segmenter unavailable'), {
    name: 'PreciseCountError',
    code: 'PRECISE_SEGMENTER_UNAVAILABLE',
    stage: 'availability',
  });
  const calls = [];
  let fallbackCalls = 0;

  const result = readingTestSessionFlow.computeCurrentWpm({
    getCronoState: () => ({ elapsed: 60000 }),
    getCurrentText: () => 'one two',
    getSettingsSnapshot: () => ({ language: 'en', modeConteo: 'preciso' }),
    countUtils: {
      contarTexto(_text, options) {
        calls.push(options);
        if (options.modoConteo === 'preciso') throw preciseFailure;
        return { palabras: 2 };
      },
      isPreciseCountFailure: (error) => error === preciseFailure,
    },
    fallbackPreciseCountingToSimple(failure) {
      fallbackCalls += 1;
      assert.deepEqual(failure, {
        source: 'reading-test',
        code: 'PRECISE_SEGMENTER_UNAVAILABLE',
        stage: 'availability',
      });
      return { ok: true, changed: true, mode: 'simple' };
    },
    DEFAULT_LANG: 'en',
    PRESET_WPM_MIN: 1,
    PRESET_WPM_MAX: 1000,
    log: createLoggerDouble(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.wordCount, 2);
  assert.equal(fallbackCalls, 1);
  assert.deepEqual(calls, [
    { modoConteo: 'preciso', idioma: 'en' },
    { modoConteo: 'simple' },
  ]);
});

test('computeCurrentWpm does not retry Simple counting when the global fallback cannot persist', () => {
  const preciseFailure = Object.assign(new Error('Segmenter unavailable'), {
    name: 'PreciseCountError',
    code: 'PRECISE_SEGMENTER_UNAVAILABLE',
    stage: 'availability',
  });
  let countCalls = 0;

  const result = readingTestSessionFlow.computeCurrentWpm({
    getCronoState: () => ({ elapsed: 60000 }),
    getCurrentText: () => 'one two',
    getSettingsSnapshot: () => ({ language: 'en', modeConteo: 'preciso' }),
    countUtils: {
      contarTexto() {
        countCalls += 1;
        throw preciseFailure;
      },
      isPreciseCountFailure: (error) => error === preciseFailure,
    },
    fallbackPreciseCountingToSimple: () => ({ ok: false, code: 'PERSIST_FAILED' }),
    DEFAULT_LANG: 'en',
    PRESET_WPM_MIN: 1,
    PRESET_WPM_MAX: 1000,
    log: createLoggerDouble(),
  });

  assert.deepEqual(result, {
    ok: false,
    guidanceKey: 'renderer.reading_test.alerts.result_invalid',
    code: 'PRECISE_FALLBACK_FAILED',
  });
  assert.equal(countCalls, 1);
});

test('Reading arming suppresses its renderer notice when Editor creation is lifecycle-owned', async () => {
  const disclosures = [];
  const controller = editorWindowLifecycle.createController({
    editorState: {
      notifyWindowState() {},
    },
    showStartupFailureDisclosure(details) {
      disclosures.push(details);
    },
  });
  const selectedEntry = { sourceMode: 'current_text' };
  const state = {
    active: true,
    stage: 'arming',
    selectedEntry,
  };
  const failed = [];

  await readingTestSessionFlow.continueArmingSession(selectedEntry, {
    state,
    openReadingSessionWindows() {
      return readingTestSessionWindows.openReadingSessionWindows({
        resetCrono() {},
        ensureEditorWindow(options) {
          return controller.ensureEditorWindowOpen({
            editorWin: null,
            mainWin: null,
            createEditorWindow() {
              throw new Error('EDITOR_CREATE_FAILED');
            },
            options,
            logContext: 'test.readingCreationFailure',
          });
        },
        ensureFlotanteWindow: async () => {
          throw new Error('SHOULD_NOT_OPEN_FLOTANTE');
        },
        log: createLoggerDouble(),
        timeoutMs: 1000,
      });
    },
    setActiveSessionWindows() {},
    showEditorPrestart() {},
    setArmingReady() {},
    showEditorWindow() {},
    waitForWindowVisible: async () => {},
    failArmingSession(_entry, noticeKey) {
      failed.push(noticeKey);
    },
    log: createLoggerDouble(),
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(disclosures, [{
    cause: 'EDITOR_STARTUP_CREATE_FAILED',
    disclosure: 'main-native',
  }]);
  assert.deepEqual(failed, [null]);
});

test('Reading arming preserves its existing cleanup route for an Editor document-load lifecycle failure', async () => {
  const disclosures = [];
  const controller = editorWindowLifecycle.createController({
    editorState: {
      notifyWindowState() {},
    },
    showStartupFailureDisclosure(details) {
      disclosures.push(details);
    },
  });
  const editorWin = {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    webContents: {
      destroyed: false,
      isDestroyed() {
        return this.destroyed;
      },
    },
    destroy() {
      this.destroyed = true;
      this.webContents.destroyed = true;
    },
  };
  const startup = controller.ensureEditorWindowOpen({
    editorWin: null,
    mainWin: null,
    createEditorWindow() {
      return editorWin;
    },
    options: {
      deferShow: true,
      waitForBasePresentationReady: true,
      startupOwner: 'reading-test',
      initialPresentationMode: 'maximized',
    },
    logContext: 'test.readingDocumentLoadFailure',
  });
  controller.handleInitialDocumentLoadFailure({
    editorWin,
    mainWin: null,
    firstShowGeneration: 1,
    error: new Error('EDITOR_DOCUMENT_LOAD_FAILED'),
    logContext: 'test.readingDocumentLoadFailure',
  });

  const selectedEntry = { sourceMode: 'current_text' };
  const state = {
    active: true,
    stage: 'arming',
    selectedEntry,
  };
  const failed = [];

  await readingTestSessionFlow.continueArmingSession(selectedEntry, {
    state,
    openReadingSessionWindows() {
      return startup.baseReadyPromise;
    },
    setActiveSessionWindows() {},
    showEditorPrestart() {},
    setArmingReady() {},
    showEditorWindow() {},
    waitForWindowVisible: async () => {},
    failArmingSession(_entry, noticeKey) {
      failed.push(noticeKey);
    },
    log: createLoggerDouble(),
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(disclosures, [{
    cause: 'EDITOR_INITIAL_DOCUMENT_LOAD_FAILED',
    disclosure: 'main-native',
  }]);
  assert.deepEqual(failed, [null]);
});

test('startArmedSession marks pool entry used only when play starts the session', () => {
  const calls = [];
  const state = {
    active: true,
    stage: 'arming',
    armingReady: true,
    selectedEntry: {
      sourceMode: 'pool',
      snapshotRelPath: 'reading_speed_test_pool/sample.json',
    },
  };

  readingTestSessionFlow.startArmedSession({
    state,
    getActiveSessionWindows: () => ({ editorWin: {}, flotanteWin: {} }),
    isAliveWindow: () => true,
    readingTestPool: {
      markPoolEntryUsed(snapshotRelPath, used) {
        calls.push(['markPoolEntryUsed', snapshotRelPath, used]);
        return { ok: true };
      },
    },
    showEditorPrestart(_editorWin, visible) {
      calls.push(['showEditorPrestart', visible]);
    },
    startCrono() {
      calls.push(['startCrono']);
    },
    setStage(stage, { selectedEntry }) {
      calls.push(['setStage', stage, selectedEntry.sourceMode]);
      state.stage = stage;
      state.selectedEntry = selectedEntry;
    },
    setArmingReady(ready) {
      calls.push(['setArmingReady', ready]);
      state.armingReady = ready;
    },
    failArmingSession() {
      calls.push(['failArmingSession']);
    },
    log: createLoggerDouble(),
  });

  assert.deepEqual(calls, [
    ['markPoolEntryUsed', 'reading_speed_test_pool/sample.json', true],
    ['showEditorPrestart', false],
    ['startCrono'],
    ['setArmingReady', false],
    ['setStage', 'running', 'pool'],
  ]);
  assert.equal(state.stage, 'running');
  assert.equal(state.armingReady, false);
});

test('startArmedSession rolls back pool usage if start fails after committing usage', () => {
  const calls = [];
  const state = {
    active: true,
    stage: 'arming',
    armingReady: true,
    selectedEntry: {
      sourceMode: 'pool',
      snapshotRelPath: 'reading_speed_test_pool/sample.json',
    },
  };

  readingTestSessionFlow.startArmedSession({
    state,
    getActiveSessionWindows: () => ({ editorWin: {}, flotanteWin: {} }),
    isAliveWindow: () => true,
    readingTestPool: {
      markPoolEntryUsed(snapshotRelPath, used) {
        calls.push(['markPoolEntryUsed', snapshotRelPath, used]);
        return { ok: true };
      },
    },
    showEditorPrestart() {
      calls.push(['showEditorPrestart', false]);
    },
    startCrono() {
      throw new Error('START_FAILED');
    },
    setStage() {
      calls.push(['setStage']);
    },
    setArmingReady(ready) {
      calls.push(['setArmingReady', ready]);
      state.armingReady = ready;
    },
    failArmingSession(selectedEntry, noticeKey) {
      calls.push(['failArmingSession', selectedEntry.snapshotRelPath, noticeKey]);
    },
    log: createLoggerDouble(),
  });

  assert.deepEqual(calls, [
    ['markPoolEntryUsed', 'reading_speed_test_pool/sample.json', true],
    ['showEditorPrestart', false],
    ['markPoolEntryUsed', 'reading_speed_test_pool/sample.json', false],
    ['failArmingSession', 'reading_speed_test_pool/sample.json', 'renderer.reading_test.alerts.start_failed'],
  ]);
});

test('startArmedSession blocks session start when pool usage persistence fails', () => {
  const calls = [];
  const state = {
    active: true,
    stage: 'arming',
    armingReady: true,
    selectedEntry: {
      sourceMode: 'pool',
      snapshotRelPath: 'reading_speed_test_pool/sample.json',
    },
  };

  readingTestSessionFlow.startArmedSession({
    state,
    getActiveSessionWindows: () => ({ editorWin: {}, flotanteWin: {} }),
    isAliveWindow: () => true,
    readingTestPool: {
      markPoolEntryUsed(snapshotRelPath, used) {
        calls.push(['markPoolEntryUsed', snapshotRelPath, used]);
        return { ok: false, code: 'WRITE_FAILED' };
      },
    },
    showEditorPrestart() {
      calls.push(['showEditorPrestart']);
    },
    startCrono() {
      calls.push(['startCrono']);
    },
    setStage(stage) {
      calls.push(['setStage', stage]);
    },
    setArmingReady(ready) {
      calls.push(['setArmingReady', ready]);
    },
    failArmingSession(selectedEntry, noticeKey) {
      calls.push(['failArmingSession', selectedEntry.snapshotRelPath, noticeKey]);
    },
    log: createLoggerDouble(),
  });

  assert.deepEqual(calls, [
    ['markPoolEntryUsed', 'reading_speed_test_pool/sample.json', true],
    ['failArmingSession', 'reading_speed_test_pool/sample.json', 'renderer.reading_test.alerts.start_failed'],
  ]);
  assert.equal(state.stage, 'arming');
  assert.equal(state.armingReady, true);
});

test('handleFlotanteCommand starts the session from arming on toggle', () => {
  const calls = [];

  const handled = readingTestSessionFlow.handleFlotanteCommand(
    { cmd: 'toggle' },
    {
      state: {
        active: true,
        stage: 'arming',
        selectedEntry: { sourceMode: 'current_text' },
      },
      startArmedSession() {
        calls.push('startArmedSession');
      },
      cancelActiveSession() {
        calls.push('cancelActiveSession');
      },
      finishRunningSession() {
        calls.push('finishRunningSession');
      },
      log: createLoggerDouble(),
    }
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ['startArmedSession']);
});

test('handleFlotanteCommand logs ignored invalid active-session commands', () => {
  const warnings = [];
  const options = {
    state: {
      active: true,
      stage: 'arming',
      selectedEntry: { sourceMode: 'current_text' },
    },
    startArmedSession() {},
    cancelActiveSession() {},
    finishRunningSession() {},
    log: {
      warn(...args) {
        warnings.push(args);
      },
    },
  };

  assert.equal(readingTestSessionFlow.handleFlotanteCommand({}, options), true);
  assert.deepEqual(warnings, [[
    'Reading-test floating command ignored: payload missing a string cmd (ignored).',
  ]]);

  warnings.length = 0;
  assert.equal(readingTestSessionFlow.handleFlotanteCommand({ cmd: 'pause' }, options), true);
  assert.deepEqual(warnings, [[
    'Reading-test floating command ignored during arming: unknown cmd (ignored):',
    'pause',
  ]]);
});
