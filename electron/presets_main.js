// electron/presets_main.js
// Logica de presets en el proceso principal: defaults, settings.presets,
// dialogos nativos y handlers IPC asociados.

const fs = require('fs');
const path = require('path');
const { dialog, shell } = require('electron');

const { CONFIG_PRESETS_DIR, ensureConfigPresetsDir } = require('./fs_storage');
const settingsState = require('./settings');
const menuBuilder = require('./menu_builder');

// Carpeta fuente de presets por defecto (.js)
const PRESETS_SOURCE_DIR = path.join(__dirname, 'presets'); // carpeta original: electron/presets

// Helpers: presets defaults (general + por idioma si existe)
function sanitizeLangCode(lang) {
  if (typeof lang !== 'string') return '';
  const base = lang.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z0-9]+$/.test(base) ? base : '';
}

function loadPresetArrayFromJs(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    let data = require(filePath);
    if (!Array.isArray(data) && data && Array.isArray(data.default)) {
      data = data.default;
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[presets_main] Error loading preset file ${filePath}:`, err);
    return [];
  }
}

/**
 * Carga presets por defecto combinados (generales + por idioma).
 * Fuente: electron/presets/defaults_presets.js + defaults_presets_<lang>.js
 */
function loadDefaultPresetsCombined(lang) {
  const presetsDir = PRESETS_SOURCE_DIR;
  const combined = loadPresetArrayFromJs(path.join(presetsDir, 'defaults_presets.js')).slice();
  const langCode = sanitizeLangCode(lang);
  if (langCode) {
    const langFile = path.join(presetsDir, `defaults_presets_${langCode}.js`);
    const langPresets = loadPresetArrayFromJs(langFile);
    if (langPresets.length) combined.push(...langPresets);
  }
  return combined;
}

/**
 * Copia inicial de presets por defecto desde electron/presets/*.js
 * hacia config/presets_defaults/*.json (solo si no existen).
 */
function copyDefaultPresetsIfMissing() {
  try {
    ensureConfigPresetsDir();

    if (!fs.existsSync(PRESETS_SOURCE_DIR)) return;

    const entries = fs.readdirSync(PRESETS_SOURCE_DIR);
    entries
      .filter((name) => /^defaults_presets.*\.js$/i.test(name))
      .forEach((fname) => {
        const src = path.join(PRESETS_SOURCE_DIR, fname);
        const dest = path.join(
          CONFIG_PRESETS_DIR,
          fname.replace(/\.js$/i, '.json')
        );

        // Solo copiar si existe el JS fuente y no existe todavia el JSON
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          try {
            let arr = require(src);
            if (
              !Array.isArray(arr) &&
              arr &&
              Array.isArray(arr.default)
            ) {
              arr = arr.default;
            }
            if (!Array.isArray(arr)) arr = [];
            fs.writeFileSync(dest, JSON.stringify(arr, null, 2), 'utf8');
            console.debug(
              `[presets_main] Copied default preset: ${src} -> ${dest}`
            );
          } catch (err) {
            console.error(
              `[presets_main] Error convirtiendo preset ${src} a JSON:`,
              err
            );
          }
        }
      });
  } catch (err) {
    console.error('[presets_main] Error en copyDefaultPresetsIfMissing:', err);
  }
}

/**
 * Registro de handlers IPC relacionados con presets.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} opts
 * @param {Function} opts.getWindows - () => ({ mainWin, editorWin, presetWin, floatingWin, langWin })
 */
function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain) {
    throw new Error('[presets_main] registerIpc requiere ipcMain');
  }

  const resolveWindows =
    typeof getWindows === 'function'
      ? () => getWindows() || {}
      : () => getWindows || {};

  // Copia inicial JS -> JSON (no sobreescribe archivos existentes)
  copyDefaultPresetsIfMissing();

  function broadcast(settings) {
    try {
      const windows = resolveWindows();
      if (typeof settingsState.broadcastSettingsUpdated === 'function') {
        settingsState.broadcastSettingsUpdated(settings, windows);
      } else {
        // Fallback defensivo si por alguna razon no esta exportado
        const { mainWin, editorWin, presetWin, floatingWin } = windows;
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('settings-updated', settings);
        }
        if (editorWin && !editorWin.isDestroyed()) {
          editorWin.webContents.send('settings-updated', settings);
        }
        if (presetWin && !presetWin.isDestroyed()) {
          presetWin.webContents.send('settings-updated', settings);
        }
        if (floatingWin && !floatingWin.isDestroyed()) {
          floatingWin.webContents.send('settings-updated', settings);
        }
      }
    } catch (err) {
      console.error('[presets_main] Error en broadcast settings-updated:', err);
    }
  }

  // Helper local para obtener idioma efectivo
  function getEffectiveLang(settings) {
    const s = settings || settingsState.getSettings();
    const lang =
      s.language && typeof s.language === 'string' && s.language.trim()
        ? s.language.trim()
        : 'es';
    return sanitizeLangCode(lang) || 'es';
  }

  // Provide default presets
  ipcMain.handle('get-default-presets', () => {
    try {
      ensureConfigPresetsDir();

      let general = [];
      const languagePresets = {};

      const entries = fs.existsSync(CONFIG_PRESETS_DIR)
        ? fs.readdirSync(CONFIG_PRESETS_DIR)
        : [];

      // Cargar defaults generales
      const generalJson = entries.find(
        (n) => n.toLowerCase() === 'defaults_presets.json'
      );
      if (generalJson) {
        try {
          general = JSON.parse(
            fs.readFileSync(path.join(CONFIG_PRESETS_DIR, generalJson), 'utf8')
          );
        } catch (err) {
          console.error('[presets_main] Error parseando', generalJson, err);
          general = [];
        }
      } else {
        const n = path.join(PRESETS_SOURCE_DIR, 'defaults_presets.js');
        general = fs.existsSync(n) ? require(n) : [];
      }

      // Cargar defaults por idioma desde JSON: defaults_presets_<lang>.json
      entries
        .filter((n) => /^defaults_presets_([a-z0-9-]+)\.json$/i.test(n))
        .forEach((n) => {
          const match = /^defaults_presets_([a-z0-9-]+)\.json$/i.exec(n);
          if (!match || !match[1]) return;
          const lang = match[1].toLowerCase();
          try {
            const arr = JSON.parse(
              fs.readFileSync(path.join(CONFIG_PRESETS_DIR, n), 'utf8')
            );
            if (Array.isArray(arr)) languagePresets[lang] = arr;
          } catch (err) {
            console.error('[presets_main] Error parseando', n, err);
          }
        });

      // Si falta algun idioma en JSON, intentar cargar desde los JS fuente
      const srcEntries = fs.existsSync(PRESETS_SOURCE_DIR)
        ? fs.readdirSync(PRESETS_SOURCE_DIR)
        : [];
      srcEntries
        .filter((n) => /^defaults_presets_([a-z0-9-]+)\.js$/i.test(n))
        .forEach((n) => {
          const match = /^defaults_presets_([a-z0-9-]+)\.js$/i.exec(n);
          if (!match || !match[1]) return;
          const lang = match[1].toLowerCase();
          if (languagePresets[lang]) return; // ya cargado desde JSON
          try {
            let arr = require(path.join(PRESETS_SOURCE_DIR, n));
            if (
              !Array.isArray(arr) &&
              arr &&
              Array.isArray(arr.default)
            ) {
              arr = arr.default;
            }
            if (Array.isArray(arr)) languagePresets[lang] = arr;
          } catch (err) {
            console.error('[presets_main] Error cargando', n, err);
          }
        });

      return {
        general: Array.isArray(general) ? general : [],
        languagePresets,
      };
    } catch (e) {
      console.error(
        '[presets_main] Error proporcionando default presets (get-default-presets):',
        e
      );
      return { general: [], languagePresets: {} };
    }
  });

  // Abrir carpeta presets_defaults editable
  ipcMain.handle('open-default-presets-folder', async () => {
    try {
      ensureConfigPresetsDir();
      // shell.openPath returns '' on success, or an error string
      const result = await shell.openPath(CONFIG_PRESETS_DIR);
      if (typeof result === 'string' && result.length > 0) {
        console.error(
          '[presets_main] shell.openPath() returned error:',
          result
        );
        return { ok: false, error: String(result) };
      }
      return { ok: true };
    } catch (err) {
      console.error(
        '[presets_main] Error opening presets_defaults folder:',
        err
      );
      return { ok: false, error: String(err) };
    }
  });

  // Handle preset creation request from preset modal
  ipcMain.handle('create-preset', (_event, preset) => {
    try {
      let settings = settingsState.getSettings();
      settings.presets = settings.presets || [];

      // If preset name already exists in user's presets, overwrite that one
      const idx = settings.presets.findIndex((p) => p.name === preset.name);
      if (idx >= 0) {
        settings.presets[idx] = preset;
      } else {
        settings.presets.push(preset);
      }

      settings = settingsState.saveSettings(settings);
      broadcast(settings);

      // Notify main window renderer that a preset was created/updated
      const { mainWin } = resolveWindows();
      try {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('preset-created', preset);
        }
      } catch (e) {
        console.error('[presets_main] Error enviando preset-created:', e);
      }

      return { ok: true };
    } catch (e) {
      console.error('[presets_main] Error creando preset:', e);
      return { ok: false, error: String(e) };
    }
  });

  // Request to delete a preset (handles native dialogs + persistence)
  ipcMain.handle('request-delete-preset', async (_event, name) => {
    try {
      // Cargar settings y textos de dialogo antes de cualquier mensaje
      let settings = settingsState.getSettings();
      const lang = getEffectiveLang(settings);
      const dialogTexts = menuBuilder.getDialogTexts(lang);
      const yesLabel = dialogTexts.yes || 'Si, continuar';
      const noLabel = dialogTexts.no || 'No, cancelar';

      // If no name provided, show information dialog and exit
      if (!name) {
        try {
          const { mainWin } = resolveWindows();
          await dialog.showMessageBox(mainWin || null, {
            type: 'none',
            buttons: [dialogTexts.ok || 'Aceptar'],
            defaultId: 0,
            message:
              dialogTexts.delete_preset_none ||
              'No hay ningun preset seleccionado para borrar',
          });
        } catch (e) {
          console.error(
            '[presets_main] Error mostrando dialog delete none:',
            e
          );
        }
        return { ok: false, code: 'NO_NAME' };
      }

      // Ask confirmation (native dialog)
      const { mainWin } = resolveWindows();
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          dialogTexts.delete_preset_confirm ||
          '¿Seguro que quieres borrar este preset?',
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      // Load default presets (same sources as get-default-presets)
      const defaultsCombined = loadDefaultPresetsCombined(lang);

      // Normalize structures
      settings.presets = settings.presets || [];
      const idxUser = settings.presets.findIndex((p) => p.name === name);
      const isDefault = defaultsCombined.find((p) => p.name === name);

      // Ensure disabled_default_presets structure
      settings.disabled_default_presets =
        settings.disabled_default_presets || {};
      if (!Array.isArray(settings.disabled_default_presets[lang])) {
        settings.disabled_default_presets[lang] = [];
      }

      if (idxUser >= 0) {
        // There is a personalized preset with that name
        if (isDefault) {
          // Remove personalized preset and mark default as ignored
          settings.presets.splice(idxUser, 1);
          if (!settings.disabled_default_presets[lang].includes(name)) {
            settings.disabled_default_presets[lang].push(name);
          }
          settings = settingsState.saveSettings(settings);
          broadcast(settings);

          try {
            if (mainWin && !mainWin.isDestroyed()) {
              mainWin.webContents.send('preset-deleted', {
                name,
                action: 'deleted_and_ignored',
              });
            }
          } catch (e) {
            console.error(
              '[presets_main] Error enviando preset-deleted (deleted_and_ignored):',
              e
            );
          }
          return { ok: true, action: 'deleted_and_ignored' };
        } else {
          // Personalized only: delete it
          settings.presets.splice(idxUser, 1);
          settings = settingsState.saveSettings(settings);
          broadcast(settings);

          try {
            if (mainWin && !mainWin.isDestroyed()) {
              mainWin.webContents.send('preset-deleted', {
                name,
                action: 'deleted_custom',
              });
            }
          } catch (e) {
            console.error(
              '[presets_main] Error enviando preset-deleted (deleted_custom):',
              e
            );
          }
          return { ok: true, action: 'deleted_custom' };
        }
      } else {
        // Not personalized; could be a default preset
        if (isDefault) {
          // Mark default as ignored for this language
          if (!settings.disabled_default_presets[lang].includes(name)) {
            settings.disabled_default_presets[lang].push(name);
          }
          settings = settingsState.saveSettings(settings);
          broadcast(settings);

          try {
            if (mainWin && !mainWin.isDestroyed()) {
              mainWin.webContents.send('preset-deleted', {
                name,
                action: 'ignored_default',
              });
            }
          } catch (e) {
            console.error(
              '[presets_main] Error enviando preset-deleted (ignored_default):',
              e
            );
          }
          return { ok: true, action: 'ignored_default' };
        }
      }

      // Not found in user presets or default presets
      return { ok: false, code: 'NOT_FOUND' };
    } catch (e) {
      console.error('[presets_main] Error en request-delete-preset:', e);
      return { ok: false, error: String(e) };
    }
  });

  // Request to restore default presets
  ipcMain.handle('request-restore-defaults', async () => {
    try {
      let settings = settingsState.getSettings();
      const lang = getEffectiveLang(settings);
      const dialogTexts = menuBuilder.getDialogTexts(lang);
      const yesLabel = dialogTexts.yes || 'Si, continuar';
      const noLabel = dialogTexts.no || 'No, cancelar';

      const { mainWin } = resolveWindows();
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          dialogTexts.restore_defaults_confirm ||
          '¿Seguro que quieres restaurar los presets por defecto?',
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      const defaultsCombined = loadDefaultPresetsCombined(lang);
      settings.presets = settings.presets || [];

      const defaultNames = new Set(
        defaultsCombined.map((p) => p && p.name).filter(Boolean)
      );
      const removedCustom = [];
      const unignored = [];

      // Remove or keep user presets depending on whether they shadow defaults
      settings.presets = settings.presets.filter((p) => {
        if (!p || !p.name) return false;
        if (defaultNames.has(p.name)) {
          removedCustom.push(p.name);
          return false; // drop custom that shadows a default
        }
        return true; // keep non-shadowing custom presets
      });

      // Clear disabled_default_presets entries that match existing default names
      settings.disabled_default_presets =
        settings.disabled_default_presets || {};
      if (!Array.isArray(settings.disabled_default_presets[lang])) {
        settings.disabled_default_presets[lang] = [];
      }

      settings.disabled_default_presets[lang] =
        settings.disabled_default_presets[lang].filter((n) => {
          const keep = !defaultNames.has(n);
          if (!keep) {
            unignored.push(n);
          }
          return keep;
        });

      if (
        Array.isArray(settings.disabled_default_presets[lang]) &&
        settings.disabled_default_presets[lang].length === 0
      ) {
        delete settings.disabled_default_presets[lang];
      }
      if (
        settings.disabled_default_presets &&
        Object.keys(settings.disabled_default_presets).length === 0
      ) {
        delete settings.disabled_default_presets;
      }

      settings = settingsState.saveSettings(settings);
      broadcast(settings);

      try {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('preset-restored', {
            removedCustom,
            unignored,
            language: lang,
          });
        }
      } catch (e) {
        console.error(
          '[presets_main] Error enviando preset-restored:',
          e
        );
      }

      return { ok: true, action: 'restored', removedCustom, unignored };
    } catch (e) {
      console.error(
        '[presets_main] Error restaurando presets por defecto:',
        e
      );
      return { ok: false, error: String(e) };
    }
  });

  // Notify for edit-no-selection (simple info dialog)
  ipcMain.handle('notify-no-selection-edit', async () => {
    try {
      const settings = settingsState.getSettings();
      const lang = getEffectiveLang(settings);
      const dialogTexts = menuBuilder.getDialogTexts(lang);

      const { mainWin } = resolveWindows();
      await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [(dialogTexts && dialogTexts.ok) || 'Aceptar'],
        defaultId: 0,
        message:
          (dialogTexts && dialogTexts.edit_preset_none) ||
          'No hay ningun preset seleccionado para editar',
      });
      return { ok: true };
    } catch (e) {
      console.error(
        '[presets_main] Error mostrando dialog no-selection-edit:',
        e
      );
      return { ok: false, error: String(e) };
    }
  });

  // Edit-preset handler (confirmation + silent delete + create)
  ipcMain.handle('edit-preset', async (_event, { originalName, newPreset }) => {
    try {
      if (!originalName) {
        return { ok: false, code: 'NO_ORIGINAL_NAME' };
      }

      let settings = settingsState.getSettings();
      const lang = getEffectiveLang(settings);
      const dialogTexts = menuBuilder.getDialogTexts(lang);

      const yesLabel = dialogTexts.yes || 'Si, continuar';
      const noLabel = dialogTexts.no || 'No, cancelar';
      const { mainWin } = resolveWindows();
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          dialogTexts.edit_preset_confirm ||
          '¿Seguro que quieres editar este preset?',
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      const defaultsCombined = loadDefaultPresetsCombined(lang);
      settings.presets = settings.presets || [];

      const idxUser = settings.presets.findIndex(
        (p) => p.name === originalName
      );
      const isDefault = defaultsCombined.find(
        (p) => p.name === originalName
      );

      settings.disabled_default_presets =
        settings.disabled_default_presets || {};
      if (!Array.isArray(settings.disabled_default_presets[lang])) {
        settings.disabled_default_presets[lang] = [];
      }

      let deletedAction = null;

      if (idxUser >= 0) {
        if (isDefault) {
          settings.presets.splice(idxUser, 1);
          if (
            !settings.disabled_default_presets[lang].includes(originalName)
          ) {
            settings.disabled_default_presets[lang].push(originalName);
          }
          deletedAction = 'deleted_and_ignored';
        } else {
          settings.presets.splice(idxUser, 1);
          deletedAction = 'deleted_custom';
        }
      } else if (isDefault) {
        if (
          !settings.disabled_default_presets[lang].includes(originalName)
        ) {
          settings.disabled_default_presets[lang].push(originalName);
        }
        deletedAction = 'ignored_default';
      }

      const newList = settings.presets || [];
      const idxNew = newList.findIndex((p) => p.name === newPreset.name);
      if (idxNew >= 0) {
        newList[idxNew] = newPreset;
      } else {
        newList.push(newPreset);
      }
      settings.presets = newList;

      settings = settingsState.saveSettings(settings);
      broadcast(settings);

      try {
        const windows = resolveWindows();
        const { mainWin } = windows;
        if (mainWin && !mainWin.isDestroyed()) {
          if (deletedAction) {
            mainWin.webContents.send('preset-deleted', {
              name: originalName,
              action: deletedAction,
            });
          }
          mainWin.webContents.send('preset-created', newPreset);
        }
      } catch (e) {
        console.error(
          '[presets_main] Error enviando eventos tras edit-preset:',
          e
        );
      }

      return { ok: true, action: 'edited', deletedAction };
    } catch (e) {
      console.error('[presets_main] Error editando preset:', e);
      return { ok: false, error: String(e) };
    }
  });
}

module.exports = {
  registerIpc,
  loadDefaultPresetsCombined,
};
