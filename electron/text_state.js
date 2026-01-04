// electron/text_state.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own in-memory current text and enforce max length.
// - Load/save current_text.json on startup and before-quit.
// - Ensure settings file exists on quit (compatibility behavior).
// - Register IPC handlers for get-current-text, set-current-text, force-clear-editor.
// - Broadcast text updates to main and editor windows (best-effort).

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const Log = require('./log');
const { MAX_TEXT_CHARS } = require('./constants_main');

const log = Log.get('text-state');

// =============================================================================
// Shared state and injected dependencies
// =============================================================================
// Default limit. The effective limit is injected from main.js via init({ maxTextChars }).
let maxTextChars = MAX_TEXT_CHARS;

// Current text held in memory; persisted on quit (also saved during init if it is truncated).
let currentText = '';

// Injected dependencies and file paths (set in init).
let loadJson = null;
let saveJson = null;
let CURRENT_TEXT_FILE = null;
let SETTINGS_FILE = null;
let appRef = null;

// Window resolver for best-effort UI notifications.
let getWindows = () => ({ mainWin: null, editorWin: null });

// =============================================================================
// Helpers
// =============================================================================
// Best-effort window send; avoids throwing during shutdown races.
function safeSend(win, channel, payload) {
  if (!win || win.isDestroyed()) {
    return;
  }

  try {
    win.webContents.send(channel, payload);
  } catch (err) {
    log.warnOnce(
      `text_state.safeSend:${channel}`,
      `webContents.send('${channel}') failed (ignored):`,
      err
    );
  }
}

// Persist current text and ensure settings file exists (compatibility behavior).
function persistCurrentTextOnQuit() {
  try {
    if (saveJson && CURRENT_TEXT_FILE) {
      saveJson(CURRENT_TEXT_FILE, { text: currentText || '' });
    }

    // Maintain previous behavior: ensure SETTINGS_FILE exists
    if (loadJson && saveJson && SETTINGS_FILE) {
      const settingsDefaults = {
        language: 'es',
        presets_by_language: {},
        disabled_default_presets: {},
      };
      const settings = loadJson(SETTINGS_FILE, settingsDefaults);
      if (!fs.existsSync(SETTINGS_FILE)) {
        saveJson(SETTINGS_FILE, settings);
      }
    }
  } catch (err) {
    log.error('Error persisting text in quit:', err);
  }
}

// =============================================================================
// Entrypoints
// =============================================================================
/**
 * Initialize the text state:
 * - Load from CURRENT_TEXT_FILE
 * - Apply initial truncation using the effective hard cap
 * - Register persistence in app.before-quit
 */
function init(options) {
  const opts = options || {};

  loadJson = opts.loadJson;
  saveJson = opts.saveJson;
  CURRENT_TEXT_FILE = opts.currentTextFile;
  SETTINGS_FILE = opts.settingsFile;
  appRef = opts.app || null;

  if (typeof opts.maxTextChars === 'number' && opts.maxTextChars > 0) {
    maxTextChars = opts.maxTextChars;
  }

  // Initial load from disk + truncated if hard cap is exceeded
  try {
    let raw = loadJson
      ? loadJson(CURRENT_TEXT_FILE, { text: '' })
      : { text: '' };

    const isRawObject = raw && typeof raw === 'object';
    const hasTextProp = isRawObject && Object.prototype.hasOwnProperty.call(raw, 'text');
    const isRawString = typeof raw === 'string';
    let txt = hasTextProp ? String(raw.text || '') : '';
    if (!hasTextProp && isRawString) {
      txt = raw;
    }
    if (!hasTextProp && !isRawString && typeof raw !== 'undefined') {
      log.warnOnce(
        'text_state.init.unexpectedShape',
        'current_text.json has unexpected shape; using empty string.'
      );
    }

    if (txt.length > maxTextChars) {
      log.warn(
        `Initial text exceeds effective hard cap (${txt.length} > ${maxTextChars}); truncated and saved.`
      );
      txt = txt.slice(0, maxTextChars);
      if (saveJson && CURRENT_TEXT_FILE) {
        saveJson(CURRENT_TEXT_FILE, { text: txt });
      }
    }

    currentText = txt;
  } catch (err) {
    log.error('Error loading current_text.json:', err);
    currentText = '';
  }

  // Persistence in before-quit
  if (appRef && typeof appRef.on === 'function') {
    appRef.on('before-quit', persistCurrentTextOnQuit);
  }
}

/**
 * Register the IPC handlers related to currentText:
 * -get-current-text
 * -set-current-text
 * -force-clear-editor
 * and handles the broadcast to the editor.
 */
function registerIpc(ipcMain, windowsResolver) {
  if (typeof windowsResolver === 'function') {
    getWindows = windowsResolver;
  } else if (windowsResolver && typeof windowsResolver === 'object') {
    getWindows = () => windowsResolver;
  }

  // Returns the current text as a simple string (compatibility)
  ipcMain.handle('get-current-text', async () => {
    return currentText || '';
  });

  // set-current-text: accept { text, meta } or simple string
  ipcMain.handle('set-current-text', (_event, payload) => {
    try {
      const isPayloadObject = payload && typeof payload === 'object';
      const hasTextProp =
        isPayloadObject &&
        Object.prototype.hasOwnProperty.call(payload, 'text');
      if (isPayloadObject && !hasTextProp) {
        log.warnOnce(
          'text_state.setCurrentText.missingText',
          'set-current-text payload missing text; using String(payload).'
        );
      }
      const incomingMeta = hasTextProp ? payload.meta || null : null;
      let text = hasTextProp ? String(payload.text || '') : String(payload || '');

      let truncated = false;
      if (text.length > maxTextChars) {
        text = text.slice(0, maxTextChars);
        truncated = true;
        log.warnOnce(
          'text_state.setCurrentText.truncated',
          'set-current-text: entry truncated to effective hard cap of ' + maxTextChars + ' chars.'
        );
      }

      currentText = text;

      const { mainWin, editorWin } = getWindows() || {};

      // Notify main window (for renderer to update preview/results)
      safeSend(mainWin, 'current-text-updated', currentText);

      // Notify editor with object { text, meta }
      safeSend(editorWin, 'editor-text-updated', {
        text: currentText,
        meta: incomingMeta || { source: 'main', action: 'set' },
      });

      return {
        ok: true,
        truncated,
        length: currentText.length,
        text: currentText,
      };
    } catch (err) {
      log.error('Error in set-current-text:', err);
      return { ok: false, error: String(err) };
    }
  });

  // Forced cleaning of the editor (invoked from the main screen)
  ipcMain.handle('force-clear-editor', async () => {
    try {
      const { mainWin, editorWin } = getWindows() || {};

      // Maintain internal status
      currentText = '';

      // Notify main window (as in main.js stable)
      safeSend(mainWin, 'current-text-updated', currentText);

      // Notify the editor to run its local cleaning logic
      safeSend(editorWin, 'editor-force-clear', '');

      return { ok: true };
    } catch (err) {
      log.error('Error in force-clear-editor:', err);
      return { ok: false, error: String(err) };
    }
  });
}

function getCurrentText() {
  return currentText || '';
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  init,
  registerIpc,
  getCurrentText,
};

// =============================================================================
// End of text_state.js
// =============================================================================
