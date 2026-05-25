'use strict';

// =============================================================================
// Overview
// =============================================================================
// Bridges authoritative current-text processing state from main to the main
// renderer. During bootstrap, state may become active before the main window
// exists; that pre-window phase is a contractually normal no-op for live
// broadcasts because the renderer receives the authoritative seed on load.

const CHANNEL = 'current-text-processing-state-changed';

function createBridge({
  controller,
  resolveMainWindow,
  hasLiveWebContents,
  log,
} = {}) {
  if (!controller || typeof controller.getState !== 'function') {
    throw new Error('[current_text_processing_main_bridge] createBridge requires controller.getState()');
  }
  if (typeof resolveMainWindow !== 'function') {
    throw new Error('[current_text_processing_main_bridge] createBridge requires resolveMainWindow()');
  }
  if (typeof hasLiveWebContents !== 'function') {
    throw new Error('[current_text_processing_main_bridge] createBridge requires hasLiveWebContents()');
  }
  if (!log || typeof log.warn !== 'function') {
    throw new Error('[current_text_processing_main_bridge] createBridge requires log.warn()');
  }

  function handleStateChanged(state) {
    try {
      const targetWin = resolveMainWindow();
      if (!targetWin) {
        return false;
      }
      if (!hasLiveWebContents(targetWin)) {
        log.warn(`${CHANNEL} broadcast skipped (ignored): main window unavailable.`);
        return false;
      }
      targetWin.webContents.send(CHANNEL, state);
      return true;
    } catch (err) {
      log.warn('Failed to broadcast current-text processing state (ignored):', err);
      return false;
    }
  }

  function seedMainWindow(mainWin) {
    try {
      if (!hasLiveWebContents(mainWin)) {
        log.warn('Main did-finish-load current-text-processing-state seed skipped (ignored): main window unavailable.');
        return false;
      }
      mainWin.webContents.send(CHANNEL, controller.getState());
      return true;
    } catch (err) {
      log.warn('Failed to seed current-text processing state on renderer load (ignored):', err);
      return false;
    }
  }

  return {
    handleStateChanged,
    seedMainWindow,
  };
}

module.exports = {
  createBridge,
};
