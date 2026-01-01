// electron/presets_main.js
// Presets logic in the main process: defaults, settings.presets_by_language, native dialogs and associated IPC handlers.
'use strict';

const fs = require('fs');
const path = require('path');
const { dialog, shell } = require('electron');
const Log = require('./log');

const log = Log.get('presets-main');
const { CONFIG_PRESETS_DIR, ensureConfigPresetsDir } = require('./fs_storage');
const settingsState = require('./settings');
const menuBuilder = require('./menu_builder');

// Default presets source folder (.js)
const PRESETS_SOURCE_DIR = path.join(__dirname, 'presets'); // original folder: electron/presets

// Helpers: presets defaults (general + per language if exists)
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
    log.error(`[presets_main] Error loading preset file ${filePath}:`, err);
    return [];
  }
}

/**
 * Loads combined default presets (general + per language).
 * Source: electron/presets/defaults_presets.js + defaults_presets_<lang>.js
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
 * Initial copy of default presets from electron/presets/*.js
 * to config/presets_defaults/*.json (only if they do not exist).
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

        // Only copy if the source JS exists and the JSON does not yet exist
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
            log.debug(
              `[presets_main] Copied default preset: ${src} -> ${dest}`
            );
          } catch (err) {
            log.error(
              `[presets_main] Error converting preset ${src} a JSON:`,
              err
            );
          }
        }
      });
  } catch (err) {
    log.error('[presets_main] Error in copyDefaultPresetsIfMissing:', err);
  }
}

/**
 * Registration of IPC handlers related to presets.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} opts
 * @param {Function} opts.getWindows -() => ({ mainWin, editorWin, presetWin, floatingWin, langWin })
 */
function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain) {
    throw new Error('[presets_main] registerIpc requiere ipcMain');
  }

  const resolveWindows =
    typeof getWindows === 'function'
      ? () => getWindows() || {}
      : () => getWindows || {};

  // Initial copy JS -> JSON (does not overwrite existing files)
  copyDefaultPresetsIfMissing();

  function broadcast(settings) {
    try {
      const windows = resolveWindows();
      if (typeof settingsState.broadcastSettingsUpdated === 'function') {
        settingsState.broadcastSettingsUpdated(settings, windows);
      } else {
        // Defensive fallback if for some reason it is not exported
        const { mainWin } = windows;
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('settings-updated', settings);
        }
      }
    } catch (err) {
      log.error('[presets_main] Error in broadcast settings-updated:', err);
    }
  }

  // Local helper to obtain effective language
  function getEffectiveLang(settings) {
    const s = settings || settingsState.getSettings();
    const lang =
      s.language && typeof s.language === 'string' && s.language.trim()
        ? s.language.trim()
        : 'es';
    return sanitizeLangCode(lang) || 'es';
  }

  function getUserPresets(settings, lang) {
    const langCode = sanitizeLangCode(lang) || 'es';
    if (typeof settings.presets_by_language !== 'object' || settings.presets_by_language === null || Array.isArray(settings.presets_by_language)) {
      settings.presets_by_language = {};
    }
    if (!Array.isArray(settings.presets_by_language[langCode])) {
      settings.presets_by_language[langCode] = [];
    }
    return settings.presets_by_language[langCode];
  }

  // Replace {placeholders} in i18n dialog strings.
  // If a key is missing, keep the placeholder unchanged (useful for debugging).
  function interpolateDialogText(template, vars = {}) {
    if (typeof template !== 'string' || !template) return '';
    return template.replace(/\{(\w+)\}/g, (m, key) => {
      if (!Object.prototype.hasOwnProperty.call(vars, key)) return m;
      const v = vars[key];
      return v === undefined || v === null ? m : String(v);
    });
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

      // Load general defaults
      const generalJson = entries.find(
        (n) => n.toLowerCase() === 'defaults_presets.json'
      );
      if (generalJson) {
        try {
          general = JSON.parse(
            fs.readFileSync(path.join(CONFIG_PRESETS_DIR, generalJson), 'utf8')
          );
        } catch (err) {
          log.error('[presets_main] Error parsing', generalJson, err);
          general = [];
        }
      } else {
        const n = path.join(PRESETS_SOURCE_DIR, 'defaults_presets.js');
        general = fs.existsSync(n) ? require(n) : [];
      }

      // Load defaults by language from JSON: defaults_presets_<lang>.json
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
            log.error('[presets_main] Error parsing', n, err);
          }
        });

      // If any language is missing in JSON, try to load from the source JS
      const srcEntries = fs.existsSync(PRESETS_SOURCE_DIR)
        ? fs.readdirSync(PRESETS_SOURCE_DIR)
        : [];
      srcEntries
        .filter((n) => /^defaults_presets_([a-z0-9-]+)\.js$/i.test(n))
        .forEach((n) => {
          const match = /^defaults_presets_([a-z0-9-]+)\.js$/i.exec(n);
          if (!match || !match[1]) return;
          const lang = match[1].toLowerCase();
          if (languagePresets[lang]) return; // already loaded from JSON
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
            log.error('[presets_main] Error loading', n, err);
          }
        });

      return {
        general: Array.isArray(general) ? general : [],
        languagePresets,
      };
    } catch (err) {
      log.error(
        '[presets_main] Error providing default presets (get-default-presets):',
        err
      );
      return { general: [], languagePresets: {} };
    }
  });

  // Open editable presets_defaults folder
  ipcMain.handle('open-default-presets-folder', async () => {
    try {
      ensureConfigPresetsDir();
      // shell.openPath returns '' on success, or an error string
      const result = await shell.openPath(CONFIG_PRESETS_DIR);
      if (typeof result === 'string' && result.length > 0) {
        log.error(
          '[presets_main] shell.openPath() returned error:',
          result
        );
        return { ok: false, error: String(result) };
      }
      return { ok: true };
    } catch (err) {
      log.error(
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
      const lang = getEffectiveLang(settings);
      const userPresets = getUserPresets(settings, lang);

      // If preset name already exists in user's presets, overwrite that one
      const idx = userPresets.findIndex((p) => p.name === preset.name);
      if (idx >= 0) {
        userPresets[idx] = preset;
      } else {
        userPresets.push(preset);
      }

      settings = settingsState.saveSettings(settings);
      broadcast(settings);

      // Notify main window renderer that a preset was created/updated
      const { mainWin } = resolveWindows();
      try {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('preset-created', preset);
        }
      } catch (err) {
        log.error('[presets_main] Error sending preset-created:', err);
      }

      return { ok: true };
    } catch (err) {
      log.error('[presets_main] Error creating preset:', err);
      return { ok: false, error: String(err) };
    }
  });

  // Request to delete a preset (handles native dialogs + persistence)
  ipcMain.handle('request-delete-preset', async (_event, name) => {
    try {
      // Load settings and dialog texts before any message
      let settings = settingsState.getSettings();
      const lang = getEffectiveLang(settings);
      const dialogTexts = menuBuilder.getDialogTexts(lang);
      const yesLabel = dialogTexts.yes || 'FALLBACK: Yes, continue';
      const noLabel = dialogTexts.no || 'FALLBACK: No, cancel';

      // If no name provided, show information dialog and exit
      if (!name) {
        try {
          const { mainWin } = resolveWindows();
          await dialog.showMessageBox(mainWin || null, {
            type: 'none',
            buttons: [dialogTexts.ok || 'FALLBACK: OK'],
            defaultId: 0,
            message:
              dialogTexts.delete_preset_none ||
              'FALLBACK: No preset selected to delete',
          });
        } catch (err) {
          log.error(
            '[presets_main] Error showing dialog delete none:',
            err
          );
        }
        return { ok: false, code: 'NO_SELECTION' };
      }

      // Ask confirmation (native dialog)
      const { mainWin } = resolveWindows();
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          interpolateDialogText(dialogTexts.delete_preset_confirm, { name }) ||
          'FALLBACK: Are you sure you want to delete this preset?',
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      // Load default presets (same sources as get-default-presets)
      const defaultsCombined = loadDefaultPresetsCombined(lang);

      // Normalize structures
      const userPresets = getUserPresets(settings, lang);
      const idxUser = userPresets.findIndex((p) => p.name === name);
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
          userPresets.splice(idxUser, 1);
          if (!settings.disabled_default_presets[lang].includes(name)) {
            settings.disabled_default_presets[lang].push(name);
          }
          settings = settingsState.saveSettings(settings);
          broadcast(settings);

          return { ok: true, action: 'deleted_and_ignored' };
        } else {
          // Personalized only: delete it
          userPresets.splice(idxUser, 1);
          settings = settingsState.saveSettings(settings);
          broadcast(settings);

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

          return { ok: true, action: 'ignored_default' };
        }
      }

      // Not found in user presets or default presets
      return { ok: false, code: 'NOT_FOUND' };
    } catch (err) {
      log.error('[presets_main] Error in request-delete-preset:', err);
      return { ok: false, error: String(err) };
    }
  });

  // Request to restore default presets
  ipcMain.handle('request-restore-defaults', async () => {
    try {
      let settings = settingsState.getSettings();
      const lang = getEffectiveLang(settings);
      const dialogTexts = menuBuilder.getDialogTexts(lang);
      const yesLabel = dialogTexts.yes || 'FALLBACK: Yes, continue';
      const noLabel = dialogTexts.no || 'FALLBACK: No, cancel';

      const { mainWin } = resolveWindows();
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          interpolateDialogText(dialogTexts.restore_defaults_confirm, { lang }) ||
          'FALLBACK: Restore default presets to original?',
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      const defaultsCombined = loadDefaultPresetsCombined(lang);
      const userPresets = getUserPresets(settings, lang);

      const defaultNames = new Set(
        defaultsCombined.map((p) => p && p.name).filter(Boolean)
      );
      const removedCustom = [];
      const unignored = [];

      // Remove or keep user presets depending on whether they shadow defaults
      settings.presets_by_language[lang] = userPresets.filter((p) => {
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

      return { ok: true, action: 'restored', removedCustom, unignored };
    } catch (err) {
      log.error(
        '[presets_main] Error restoring default presets:',
        err
      );
      return { ok: false, error: String(err) };
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
        buttons: [(dialogTexts && dialogTexts.ok) || 'FALLBACK: OK'],
        defaultId: 0,
        message:
          (dialogTexts && dialogTexts.edit_preset_none) ||
          'FALLBACK: No preset selected to edit',
      });
      return { ok: true };
    } catch (err) {
      log.error(
        '[presets_main] Error showing dialog no-selection-edit:',
        err
      );
      return { ok: false, error: String(err) };
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

      const yesLabel = dialogTexts.yes || 'FALLBACK: Yes, continue';
      const noLabel = dialogTexts.no || 'FALLBACK: No, cancel';
      const { mainWin } = resolveWindows();
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          interpolateDialogText(dialogTexts.edit_preset_confirm, { name: originalName }) ||
          'FALLBACK: Are you sure you want to edit the preset?',
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      const defaultsCombined = loadDefaultPresetsCombined(lang);
      const userPresets = getUserPresets(settings, lang);

      const idxUser = userPresets.findIndex(
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
          userPresets.splice(idxUser, 1);
          if (
            !settings.disabled_default_presets[lang].includes(originalName)
          ) {
            settings.disabled_default_presets[lang].push(originalName);
          }
          deletedAction = 'deleted_and_ignored';
        } else {
          userPresets.splice(idxUser, 1);
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

      const idxNew = userPresets.findIndex((p) => p.name === newPreset.name);
      if (idxNew >= 0) {
        userPresets[idxNew] = newPreset;
      } else {
        userPresets.push(newPreset);
      }

      settings = settingsState.saveSettings(settings);
      broadcast(settings);

      try {
        const windows = resolveWindows();
        const { mainWin } = windows;
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('preset-created', newPreset);
        }
      } catch (err) {
        log.error(
          '[presets_main] Error sending events after edit-preset:',
          err
        );
      }

      return { ok: true, action: 'edited', deletedAction };
    } catch (err) {
      log.error('[presets_main] Error editing preset:', err);
      return { ok: false, error: String(err) };
    }
  });
}

module.exports = {
  registerIpc,
};
