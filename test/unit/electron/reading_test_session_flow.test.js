'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const readingTestSessionFlow = require('../../../electron/reading_test_session_flow');
const editorWindowLifecycle = require('../../../electron/editor_window_lifecycle');
const readingTestSessionWindows = require('../../../electron/reading_test_session_windows');

function createLoggerDouble() {
  return {
    warn() {},
    warnOnce() {},
    error() {},
  };
}

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
