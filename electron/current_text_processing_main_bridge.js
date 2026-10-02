// electron/current_text_processing_main_bridge.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - define the main-to-renderer channel for current-text processing state,
// - validate the collaborators required to bridge that state safely,
// - forward live state changes to the main window when live delivery is possible.

// =============================================================================
// Constants
// =============================================================================

const CHANNEL = 'current-text-processing-state-changed';

// =============================================================================
// Bridge Factory
// =============================================================================

function createBridge({
  resolveMainWindow,
  hasLiveWebContents,
  log,
} = {}) {
  if (typeof resolveMainWindow !== 'function') {
    throw new Error('[current_text_processing_main_bridge] createBridge requires resolveMainWindow()');
  }
  if (typeof hasLiveWebContents !== 'function') {
    throw new Error('[current_text_processing_main_bridge] createBridge requires hasLiveWebContents()');
  }
  // Live broadcasts are optional until the main window exists.
  function handleStateChanged(state) {
    try {
      const targetWin = resolveMainWindow();
      if (!targetWin) {
        return false;
      }
      if (!hasLiveWebContents(targetWin)) {
        log.warn(`${CHANNEL} broadcast failed (ignored): main window unavailable.`);
        return false;
      }
      targetWin.webContents.send(CHANNEL, state);
      return true;
    } catch (err) {
      log.warn('Current-text processing state broadcast failed (ignored):', err);
      return false;
    }
  }

  return {
    handleStateChanged,
  };
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  createBridge,
};

// =============================================================================
// End of electron/current_text_processing_main_bridge.js
// =============================================================================
