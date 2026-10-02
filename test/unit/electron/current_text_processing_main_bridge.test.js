'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const currentTextProcessingMainBridge = require('../../../electron/current_text_processing_main_bridge');

function createLogDouble() {
  return {
    warnings: [],
    warn(...args) {
      this.warnings.push(args);
    },
  };
}

function createMainWindowDouble() {
  const sends = [];
  const mainWin = {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    webContents: {
      destroyed: false,
      send(channel, payload) {
        sends.push({ channel, payload });
      },
      isDestroyed() {
        return this.destroyed;
      },
    },
  };

  return { mainWin, sends };
}

test('handleStateChanged keeps pre-window delivery silent', () => {
  const log = createLogDouble();
  const bridge = currentTextProcessingMainBridge.createBridge({
    resolveMainWindow() {
      return null;
    },
    hasLiveWebContents() {
      return false;
    },
    log,
  });

  const delivered = bridge.handleStateChanged({ active: true, requestId: 1 });

  assert.equal(delivered, false);
  assert.deepEqual(log.warnings, []);
});

test('handleStateChanged warns when a main window exists but is unavailable for live delivery', () => {
  const log = createLogDouble();
  const { mainWin, sends } = createMainWindowDouble();
  const bridge = currentTextProcessingMainBridge.createBridge({
    resolveMainWindow() {
      return mainWin;
    },
    hasLiveWebContents() {
      return false;
    },
    log,
  });

  const delivered = bridge.handleStateChanged({ active: true, requestId: 2 });

  assert.equal(delivered, false);
  assert.deepEqual(sends, []);
  assert.deepEqual(log.warnings, [
    ['current-text-processing-state-changed broadcast failed (ignored): main window unavailable.'],
  ]);
});

test('handleStateChanged broadcasts live updates once the main window exists', () => {
  const log = createLogDouble();
  const { mainWin, sends } = createMainWindowDouble();
  const bridge = currentTextProcessingMainBridge.createBridge({
    resolveMainWindow() {
      return mainWin;
    },
    hasLiveWebContents() {
      return true;
    },
    log,
  });

  const state = {
    active: true,
    requestId: 3,
    sinceEpochMs: 123,
    source: 'main',
    action: 'initial_load',
  };
  const delivered = bridge.handleStateChanged(state);

  assert.equal(delivered, true);
  assert.deepEqual(sends, [
    {
      channel: 'current-text-processing-state-changed',
      payload: state,
    },
  ]);
  assert.deepEqual(log.warnings, []);
});
