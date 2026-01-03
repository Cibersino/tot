// electron/text_state.js
'use strict';

const fs = require('fs');
const Log = require('./log');

const log = Log.get('text-state');

// Default limit. The effective limit is injected from main.js via init({ maxTextChars }).
let MAX_TEXT_CHARS = 10_000_000; 

// Shared internal status
let currentText = '';

// Injected dependencies
let loadJson = null;
let saveJson = null;
let CURRENT_TEXT_FILE = null;
let SETTINGS_FILE = null;
let appRef = null;

// Window resolver (main/editor)
let getWindows = () => ({ mainWin: null, editorWin: null });

function safeSend(win, channel, payload, errorMessage) {
  if (!win || win.isDestroyed()) {
    return;
  }

  try {
    win.webContents.send(channel, payload);
  } catch (err) {
    log.error(errorMessage, err);
  }
}

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

/**
 * Initialize the text state:
 * -Load from CURRENT_TEXT_FILE
 * -Apply initial truncation by MAX_TEXT_CHARS
 * -Register persistence in app.before-quit
 */
function init(options) {
  const opts = options || {};

  loadJson = opts.loadJson;
  saveJson = opts.saveJson;
  CURRENT_TEXT_FILE = opts.currentTextFile;
  SETTINGS_FILE = opts.settingsFile;
  appRef = opts.app || null;

  if (typeof opts.maxTextChars === 'number' && opts.maxTextChars > 0) {
    MAX_TEXT_CHARS = opts.maxTextChars;
  }

  // Initial load from disk + truncated if MAX_TEXT_CHARS is exceeded
  try {
    let raw = loadJson
      ? loadJson(CURRENT_TEXT_FILE, { text: '' })
      : { text: '' };

    const hasTextProp =
      raw &&
      typeof raw === 'object' &&
      Object.prototype.hasOwnProperty.call(raw, 'text');
    let txt = hasTextProp ? String(raw.text || '') : '';
    if (!hasTextProp && typeof raw === 'string') {
      txt = raw;
    }

    if (txt.length > MAX_TEXT_CHARS) {
      log.warn(
        `Initial text exceeds MAX_TEXT_CHARS (${txt.length} > ${MAX_TEXT_CHARS}); truncated and saved.`
      );
      txt = txt.slice(0, MAX_TEXT_CHARS);
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
      const hasTextProp =
        payload &&
        typeof payload === 'object' &&
        Object.prototype.hasOwnProperty.call(payload, 'text');
      const incomingMeta = hasTextProp ? payload.meta || null : null;
      let text = hasTextProp ? String(payload.text || '') : String(payload || '');

      let truncated = false;
      if (text.length > MAX_TEXT_CHARS) {
        text = text.slice(0, MAX_TEXT_CHARS);
        truncated = true;
        log.warn(
          'set-current-text: entry truncated to ' + MAX_TEXT_CHARS + ' chars.'
        );
      }

      currentText = text;

      const { mainWin, editorWin } = getWindows() || {};

      // Notify main window (for renderer to update preview/results)
      safeSend(
        mainWin,
        'current-text-updated',
        currentText,
        'Error sending current-text-updated to mainWin:'
      );

      // Notify editor with object { text, meta }
      safeSend(
        editorWin,
        'editor-text-updated',
        {
          text: currentText,
          meta: incomingMeta || { source: 'main', action: 'set' },
        },
        'Error sending editor-text-updated to editorWin:'
      );

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
      safeSend(
        mainWin,
        'current-text-updated',
        currentText,
        'Error sending current-text-updated in force-clear-editor:'
      );

      // Notify the editor to run its local cleaning logic
      safeSend(
        editorWin,
        'editor-force-clear',
        '',
        'Error sending editor-force-clear:'
      );

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

module.exports = {
  init,
  registerIpc,
  getCurrentText,
};
