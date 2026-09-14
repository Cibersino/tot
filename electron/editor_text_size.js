// electron/editor_text_size.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process controller for Text Editor font size.
// Responsibilities:
// - Own Text Editor font-size actions and their IPC boundary.
// - Persist and publish through the shared settings contract.
// - Expose actions for native Text Editor shortcuts.

// =============================================================================
// Imports / logger
// =============================================================================
const Log = require('./log');
const {
  EDITOR_FONT_SIZE_DEFAULT_PX,
  EDITOR_FONT_SIZE_STEP_PX,
} = require('./constants_main');

const log = Log.get('editor-text-size');
log.debug('Text Editor text-size controller starting...');

// =============================================================================
// Controller factory
// =============================================================================
function createController({ settingsState } = {}) {
  if (!settingsState || typeof settingsState.getSettings !== 'function' || typeof settingsState.saveSettingsStrict !== 'function') {
    throw new Error('[editor-text-size] createController requires settingsState with getSettings/saveSettingsStrict');
  }
  if (typeof settingsState.normalizeEditorFontSizePx !== 'function') {
    throw new Error('[editor-text-size] createController requires settingsState.normalizeEditorFontSizePx');
  }
  if (typeof settingsState.publishSettingsUpdated !== 'function') {
    throw new Error('[editor-text-size] createController requires settingsState.publishSettingsUpdated');
  }

  function applyFontSize(fontSizePx, settings) {
    const parsed = Number(fontSizePx);
    if (!Number.isFinite(parsed)) {
      log.warn(
        'Text Editor font-size action received a non-finite value (ignored):',
        { value: fontSizePx }
      );
      return { ok: false, error: 'invalid' };
    }

    const currentSettings = settings || settingsState.getSettings();
    const nextEditorFontSizePx = settingsState.normalizeEditorFontSizePx(parsed);
    if (currentSettings.editorFontSizePx === nextEditorFontSizePx) {
      return { ok: true, editorFontSizePx: nextEditorFontSizePx };
    }

    const nextSettings = {
      ...currentSettings,
      editorFontSizePx: nextEditorFontSizePx,
    };
    const savedSettings = settingsState.saveSettingsStrict(nextSettings);
    settingsState.publishSettingsUpdated(savedSettings);
    return { ok: true, editorFontSizePx: savedSettings.editorFontSizePx };
  }

  function set(fontSizePx) {
    return applyFontSize(fontSizePx);
  }

  function adjust(stepDeltaPx) {
    const settings = settingsState.getSettings();
    const current = Number(settings && settings.editorFontSizePx);
    const base = Number.isFinite(current) ? current : EDITOR_FONT_SIZE_DEFAULT_PX;
    return applyFontSize(base + stepDeltaPx, settings);
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

  // =============================================================================
  // IPC registration
  // =============================================================================
  function registerIpc(ipcMain) {
    if (!ipcMain || typeof ipcMain.handle !== 'function') {
      throw new Error('[editor-text-size] registerIpc requires ipcMain');
    }

    ipcMain.handle('set-editor-font-size-px', async (_event, fontSizePx) => {
      try {
        return set(fontSizePx);
      } catch (err) {
        log.error('IPC set-editor-font-size-px failed:', err);
        throw err;
      }
    });
  }

  return {
    registerIpc,
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
