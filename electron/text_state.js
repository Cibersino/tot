// electron/text_state.js
const fs = require('fs');

// Estado interno compartido
let currentText = '';

// Limite por defecto. El limite efectivo se inyecta desde main.js via init({ maxTextChars }).
let MAX_TEXT_CHARS = 10_000_000; 

// Dependencias inyectadas
let loadJson = null;
let saveJson = null;
let CURRENT_TEXT_FILE = null;
let SETTINGS_FILE = null;
let appRef = null;

// Resolver de ventanas (main/editor)
let getWindows = () => ({ mainWin: null, editorWin: null });

function persistCurrentTextOnQuit() {
  try {
    if (saveJson && CURRENT_TEXT_FILE) {
      saveJson(CURRENT_TEXT_FILE, { text: currentText || '' });
    }

    // Mantener comportamiento previo: asegurar que SETTINGS_FILE exista
    if (loadJson && saveJson && SETTINGS_FILE) {
      const settings = loadJson(SETTINGS_FILE, { language: 'es', presets: [] });
      if (!fs.existsSync(SETTINGS_FILE)) {
        saveJson(SETTINGS_FILE, settings);
      }
    }
  } catch (e) {
    console.error('Error persistiendo texto en quit:', e);
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

  // Carga inicial desde disco + truncado si excede MAX_TEXT_CHARS
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
        `Texto inicial excede MAX_TEXT_CHARS (${txt.length} > ${MAX_TEXT_CHARS}); truncando y guardando.`
      );
      txt = txt.slice(0, MAX_TEXT_CHARS);
      if (saveJson && CURRENT_TEXT_FILE) {
        saveJson(CURRENT_TEXT_FILE, { text: txt });
      }
    }

    currentText = txt;
  } catch (e) {
    console.error('Error cargando current_text.json:', e);
    currentText = '';
  }

  // Persistencia en before-quit
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

  // Devuelve el texto actual como string simple (compatibilidad)
  ipcMain.handle('get-current-text', async () => {
    return currentText || '';
  });

  // set-current-text: acepta { text, meta } o string simple
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
          'set-current-text: entrada truncada a ' + MAX_TEXT_CHARS + ' caracteres.'
        );
      }

      currentText = text;

      const { mainWin, editorWin } = getWindows() || {};

      // Notificar main window (para que renderer actualice preview/resultados)
      if (mainWin && !mainWin.isDestroyed()) {
        try {
          mainWin.webContents.send('current-text-updated', currentText);
        } catch (err) {
          console.error('Error enviando current-text-updated a mainWin:', err);
        }
      }

      // Notificar editor manual con objeto { text, meta }
      if (editorWin && !editorWin.isDestroyed()) {
        try {
          editorWin.webContents.send('manual-text-updated', {
            text: currentText,
            meta: incomingMeta || { source: 'main', action: 'set' },
          });
        } catch (err) {
          console.error(
            'Error enviando manual-text-updated a editorWin:',
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
      console.error('Error en set-current-text:', err);
      return { ok: false, error: String(err) };
    }
  });

  // Limpieza forzada del editor (invocada desde la pantalla principal)
  ipcMain.handle('force-clear-editor', async () => {
    try {
      const { mainWin, editorWin } = getWindows() || {};

      // Mantener estado interno
      currentText = '';

      // Notificar a la ventana principal (como en main.js estable)
      if (mainWin && !mainWin.isDestroyed()) {
        try {
          mainWin.webContents.send('current-text-updated', currentText);
        } catch (e) {
          console.error('Error enviando current-text-updated en force-clear-editor:', e);
        }
      }

      // Notificar al editor para que ejecute su logica de limpieza local
      if (editorWin && !editorWin.isDestroyed()) {
        try {
          editorWin.webContents.send('manual-force-clear', '');
        } catch (e) {
          console.error('Error enviando manual-force-clear:', e);
        }
      }

      return { ok: true };
    } catch (e) {
      console.error('Error en force-clear-editor:', e);
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
