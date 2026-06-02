'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - define the main-to-renderer channel for current-text processing state,
// - validate the collaborators required to bridge that state safely,
// - forward live state changes to the main window when live delivery is possible,
// - keep the pre-window bootstrap phase silent by contract,
// - seed the renderer with the authoritative controller snapshot after load.

// =============================================================================
// Constants
// =============================================================================

const CHANNEL = 'current-text-processing-state-changed';

// =============================================================================
// Bridge Factory
// =============================================================================

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

  // Live broadcasts are optional until the main window exists. That pre-window
  // phase stays silent because the renderer receives the authoritative seed.
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

  // Renderer load receives a fresh snapshot instead of replaying missed live
  // broadcasts from the pre-window bootstrap phase.
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

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  createBridge,
};

// End of electron/current_text_processing_main_bridge.js
