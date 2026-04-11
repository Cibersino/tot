// electron/editor_text_size.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process controller for manual-editor textarea font size.
// Responsibilities:
// - Read and persist editorFontSizePx through shared settings.
// - Broadcast settings-updated after changes.
// - Expose feature-level actions for UI controls and editor shortcuts.

// =============================================================================
// Imports / logger
// =============================================================================
const Log = require('./log');
const {
  EDITOR_FONT_SIZE_DEFAULT_PX,
  EDITOR_FONT_SIZE_STEP_PX,
} = require('./constants_main');

const log = Log.get('editor-text-size');
log.debug('Editor text-size controller starting...');

// =============================================================================
// Controller factory
// =============================================================================
function createController({ settingsState, getWindows } = {}) {
  if (!settingsState || typeof settingsState.getSettings !== 'function' || typeof settingsState.saveSettings !== 'function') {
    throw new Error('[editor-text-size] createController requires settingsState with getSettings/saveSettings');
  }
  if (typeof settingsState.broadcastSettingsUpdated !== 'function') {
    throw new Error('[editor-text-size] createController requires settingsState.broadcastSettingsUpdated');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[editor-text-size] createController requires getWindows');
  }

  function broadcastSettings(settings) {
    try {
      settingsState.broadcastSettingsUpdated(settings, getWindows());
    } catch (err) {
      log.warnOnce(
        'editor_text_size.broadcast',
        'Editor text-size broadcast failed (ignored):',
        err
      );
    }
  }

  function set(fontSizePx) {
    try {
      let settings = settingsState.getSettings();
      settings.editorFontSizePx = fontSizePx;
      settings = settingsState.saveSettings(settings);
      broadcastSettings(settings);
      return { ok: true, editorFontSizePx: settings.editorFontSizePx };
    } catch (err) {
      log.error('Error setting editor font size:', err);
      return { ok: false, error: String(err) };
    }
  }

  function adjust(stepDeltaPx) {
    try {
      const settings = settingsState.getSettings();
      const current = Number(settings && settings.editorFontSizePx);
      const base = Number.isFinite(current) ? current : EDITOR_FONT_SIZE_DEFAULT_PX;
      return set(base + stepDeltaPx);
    } catch (err) {
      log.error('Error adjusting editor font size:', err);
      return { ok: false, error: String(err) };
    }
  }

  function increase() {
    return adjust(EDITOR_FONT_SIZE_STEP_PX);
  }

  function decrease() {
    return adjust(-EDITOR_FONT_SIZE_STEP_PX);
  }

  function reset() {
    return set(EDITOR_FONT_SIZE_DEFAULT_PX);
  }

  function getShortcutActions() {
    return {
      onIncreaseTextSize: () => increase(),
      onDecreaseTextSize: () => decrease(),
      onResetTextSize: () => reset(),
    };
  }

  return {
    set,
    adjust,
    increase,
    decrease,
    reset,
    getShortcutActions,
  };
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  createController,
};

// =============================================================================
// End of electron/editor_text_size.js
// =============================================================================
