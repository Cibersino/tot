'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const readingTestSessionFlow = require('../../../electron/reading_test_session_flow');

function createLoggerDouble() {
  return {
    warn() {},
    warnOnce() {},
    error() {},
  };
}

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
    ['failArmingSession', 'reading_speed_test_pool/sample.json', 'renderer.alerts.reading_test_start_failed'],
  ]);
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
