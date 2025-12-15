// electron/text_state.js
const fs = require('fs');

// Shared internal status
let currentText = '';

// Default limit. The effective limit is injected from main.js via init({ maxTextChars }).
let MAX_TEXT_CHARS = 10_000_000; 

// Injected dependencies
let loadJson = null;
let saveJson = null;
let CURRENT_TEXT_FILE = null;
let SETTINGS_FILE = null;
let appRef = null;

// Window resolver (main/editor)
let getWindows = () => ({ mainWin: null, editorWin: null });

function persistCurrentTextOnQuit() {
  try {
    if (saveJson && CURRENT_TEXT_FILE) {
      saveJson(CURRENT_TEXT_FILE, { text: currentText || '' });
    }

    // Maintain previous behavior: ensure SETTINGS_FILE exists
    if (loadJson && saveJson && SETTINGS_FILE) {
      const settings = loadJson(SETTINGS_FILE, { language: 'es', presets: [] });
      if (!fs.existsSync(SETTINGS_FILE)) {
        saveJson(SETTINGS_FILE, settings);
      }
    }
  } catch (e) {
    console.error('Error persisting text in quit:', e);
  }
}

/**
 * Inicializa el estado de texto:
 * - Carga desde CURRENT_TEXT_FILE
 * - Aplica truncado inicial por MAX_TEXT_CHARS
 * - Registra persistencia en app.before-quit
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

    let txt = '';
    if (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'text')) {
      txt = String(raw.text || '');
    } else if (typeof raw === 'string') {
      txt = raw;
    } else {
      txt = '';
    }

    if (txt.length > MAX_TEXT_CHARS) {
      console.warn(
        `Initial text exceeds MAX_TEXT_CHARS (${txt.length} > ${MAX_TEXT_CHARS}); truncated and saved.`
      );
      txt = txt.slice(0, MAX_TEXT_CHARS);
      if (saveJson && CURRENT_TEXT_FILE) {
        saveJson(CURRENT_TEXT_FILE, { text: txt });
      }
    }

    currentText = txt;
  } catch (e) {
    console.error('Error loading current_text.json:', e);
    currentText = '';
  }

  // Persistence in before-quit
  if (appRef && typeof appRef.on === 'function') {
    appRef.on('before-quit', persistCurrentTextOnQuit);
  }
}

/**
 * Registra los handlers IPC relacionados con currentText:
 * - get-current-text
 * - set-current-text
 * - force-clear-editor
 * y maneja el broadcast al editor manual.
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
      let incomingMeta = null;
      let text = '';

      if (
        payload &&
        typeof payload === 'object' &&
        Object.prototype.hasOwnProperty.call(payload, 'text')
      ) {
        text = String(payload.text || '');
        incomingMeta = payload.meta || null;
      } else {
        text = String(payload || '');
      }

      let truncated = false;
      if (text.length > MAX_TEXT_CHARS) {
        text = text.slice(0, MAX_TEXT_CHARS);
        truncated = true;
        console.warn(
          'set-current-text: entry truncated to ' + MAX_TEXT_CHARS + ' chars.'
        );
      }

      currentText = text;

      const { mainWin, editorWin } = getWindows() || {};

      // Notify main window (for renderer to update preview/results)
      if (mainWin && !mainWin.isDestroyed()) {
        try {
          mainWin.webContents.send('current-text-updated', currentText);
        } catch (err) {
          console.error('Error sending current-text-updated to mainWin:', err);
        }
      }

      // Notify manual editor with object { text, meta }
      if (editorWin && !editorWin.isDestroyed()) {
        try {
          editorWin.webContents.send('manual-text-updated', {
            text: currentText,
            meta: incomingMeta || { source: 'main', action: 'set' },
          });
        } catch (err) {
          console.error(
            'Error sending manual-text-updated to editorWin:',
            err
          );
        }
      }

      return {
        ok: true,
        truncated,
        length: currentText.length,
        text: currentText,
      };
    } catch (err) {
      console.error('Error in set-current-text:', err);
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
      if (mainWin && !mainWin.isDestroyed()) {
        try {
          mainWin.webContents.send('current-text-updated', currentText);
        } catch (e) {
          console.error('Error sending current-text-updated in force-clear-editor:', e);
        }
      }

      // Notify the editor to run its local cleaning logic
      if (editorWin && !editorWin.isDestroyed()) {
        try {
          editorWin.webContents.send('manual-force-clear', '');
        } catch (e) {
          console.error('Error sending manual-force-clear:', e);
        }
      }

      return { ok: true };
    } catch (e) {
      console.error('Error in force-clear-editor:', e);
      return { ok: false, error: String(e) };
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
