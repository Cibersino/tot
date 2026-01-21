// electron/presets_main.js
// Presets logic in the main process: defaults, settings.presets_by_language, native dialogs and associated IPC handlers.
'use strict';

const fs = require('fs');
const path = require('path');
const { dialog, shell } = require('electron');
const Log = require('./log');

const log = Log.get('presets-main');
const { DEFAULT_LANG, MAX_PRESET_STR_CHARS } = require('./constants_main');
const { getConfigPresetsDir, ensureConfigPresetsDir } = require('./fs_storage');
const settingsState = require('./settings');
const { normalizeLangTag, normalizeLangBase } = settingsState;
const menuBuilder = require('./menu_builder');

// Default presets source folder (.js)
const PRESETS_SOURCE_DIR = path.join(__dirname, 'presets'); // original folder: electron/presets

const resolveDialogText = (dialogTexts, key, fallback) =>
  menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log,
    warnPrefix: 'presets_main.dialog.missing'
  });

function isPlainObject(x) {
  if (!x || typeof x !== 'object') return false;
  return Object.getPrototypeOf(x) === Object.prototype;
}

function sanitizePresetInput(raw) {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'invalid preset payload', code: 'INVALID_PRESET_SHAPE' };
  }

  const name = String(raw.name || '').trim();
  const description = String(raw.description || '').trim();
  const wpmNum = Number(raw.wpm);

  if (!name) {
    return { ok: false, error: 'invalid preset payload', code: 'INVALID_PRESET' };
  }

  if (name.length > MAX_PRESET_STR_CHARS || description.length > MAX_PRESET_STR_CHARS) {
    return { ok: false, error: 'preset payload too large', code: 'PAYLOAD_TOO_LARGE' };
  }

  if (!Number.isFinite(wpmNum)) {
    return { ok: false, error: 'invalid preset payload', code: 'INVALID_PRESET' };
  }

  return {
    ok: true,
    preset: {
      name,
      wpm: Math.round(wpmNum),
      description,
    },
  };
}

function loadPresetArrayFromJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    log.error(`[presets_main] Error loading preset JSON ${filePath}:`, err);
    return [];
  }
}

/**
 * Loads combined default presets (general + per language).
 * Source: userData config presets_defaults JSON (fallback to bundled JSON only if missing)
 */
function loadDefaultPresetsCombined(lang) {
  ensureConfigPresetsDir();
  const presetsDir = getConfigPresetsDir();

  const combined =
    loadPresetArrayFromJson(path.join(presetsDir, 'defaults_presets.json')).slice();
  if (!combined.length) {
    combined.push(
      ...loadPresetArrayFromJson(path.join(PRESETS_SOURCE_DIR, 'defaults_presets.json'))
    );
  }

  const langCode = normalizeLangBase(lang);
  if (langCode) {
    const langPresets =
      loadPresetArrayFromJson(
        path.join(presetsDir, `defaults_presets_${langCode}.json`)
      ).slice();
    if (!langPresets.length) {
      langPresets.push(
        ...loadPresetArrayFromJson(
          path.join(PRESETS_SOURCE_DIR, `defaults_presets_${langCode}.json`)
        )
      );
    }
    if (langPresets.length) combined.push(...langPresets);
  }
  return combined;
}

/**
 * Initial copy of default presets from electron/presets/*.json
 * to userData config presets_defaults JSON (only if they do not exist).
 */
function copyDefaultPresetsIfMissing() {
  try {
    ensureConfigPresetsDir();
    const presetsDir = getConfigPresetsDir();

    if (!fs.existsSync(PRESETS_SOURCE_DIR)) return;

    const entries = fs.readdirSync(PRESETS_SOURCE_DIR);
    entries
      .filter((name) => /^defaults_presets.*\.json$/i.test(name))
      .forEach((fname) => {
        const src = path.join(PRESETS_SOURCE_DIR, fname);
        const dest = path.join(
          presetsDir,
          fname
        );

        // Only copy if the source JSON exists and the destination does not yet exist
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          try {
            const raw = fs.readFileSync(src, 'utf8');
            fs.writeFileSync(dest, raw, 'utf8');
            log.warnOnce(
              'presets_main:defaults:copied',
              '[presets_main] Default presets copied to user config (may be normal on first run).'
            );
            log.debug(
              `[presets_main] Copied default preset: ${src} -> ${dest}`
            );
          } catch (err) {
            log.error(
              `[presets_main] Error copying preset ${src} a JSON:`,
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
        : DEFAULT_LANG;
    return normalizeLangBase(lang) || DEFAULT_LANG;
  }

  function getUserPresets(settings, lang) {
    const langCode = normalizeLangBase(lang) || DEFAULT_LANG;
    if (typeof settings.presets_by_language !== 'object' || settings.presets_by_language === null || Array.isArray(settings.presets_by_language)) {
      settings.presets_by_language = {};
    }
    if (!Array.isArray(settings.presets_by_language[langCode])) {
      settings.presets_by_language[langCode] = [];
    }
    return settings.presets_by_language[langCode];
  }

  function ensureDisabledDefaultPresets(settings, lang) {
    settings.disabled_default_presets =
      settings.disabled_default_presets || {};
    if (!Array.isArray(settings.disabled_default_presets[lang])) {
      settings.disabled_default_presets[lang] = [];
    }
    return settings.disabled_default_presets[lang];
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

  function getDialogContext(settings) {
    const lang = getEffectiveLang(settings);
    const dialogLang = normalizeLangTag(settings.language) || lang;
    const dialogTexts = menuBuilder.getDialogTexts(dialogLang);
    return { lang, dialogLang, dialogTexts };
  }

  function getYesNoLabels(dialogTexts) {
    return {
      yesLabel: resolveDialogText(dialogTexts, 'yes', 'Yes, continue'),
      noLabel: resolveDialogText(dialogTexts, 'no', 'No, cancel'),
    };
  }

  // Provide default presets
  ipcMain.handle('get-default-presets', () => {
    try {
      ensureConfigPresetsDir();
      const presetsDir = getConfigPresetsDir();

      let general = [];
      const languagePresets = {};

      const entries = fs.existsSync(presetsDir)
        ? fs.readdirSync(presetsDir)
        : [];

      // Load general defaults
      const generalJson = entries.find(
        (n) => n.toLowerCase() === 'defaults_presets.json'
      );
      if (generalJson) {
        try {
          general = JSON.parse(
            fs.readFileSync(path.join(presetsDir, generalJson), 'utf8')
          );
        } catch (err) {
          log.error('[presets_main] Error parsing', generalJson, err);
          general = [];
        }
      }
      if (!Array.isArray(general) || general.length === 0) {
        general = loadPresetArrayFromJson(
          path.join(PRESETS_SOURCE_DIR, 'defaults_presets.json')
        );
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
              fs.readFileSync(path.join(presetsDir, n), 'utf8')
            );
            if (Array.isArray(arr)) languagePresets[lang] = arr;
          } catch (err) {
            log.error('[presets_main] Error parsing', n, err);
          }
        });

      // If any language is missing in JSON, try to load from the bundled JSON seeds
      const srcEntries = fs.existsSync(PRESETS_SOURCE_DIR)
        ? fs.readdirSync(PRESETS_SOURCE_DIR)
        : [];
      srcEntries
        .filter((n) => /^defaults_presets_([a-z0-9-]+)\.json$/i.test(n))
        .forEach((n) => {
          const match = /^defaults_presets_([a-z0-9-]+)\.json$/i.exec(n);
          if (!match || !match[1]) return;
          const lang = match[1].toLowerCase();
          if (languagePresets[lang]) return; // already loaded from config JSON
          try {
            const arr = loadPresetArrayFromJson(path.join(PRESETS_SOURCE_DIR, n));
            if (Array.isArray(arr)) languagePresets[lang] = arr;
          } catch (err) {
            log.error('[presets_main] Error loading bundled preset', n, err);
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
      const presetsDir = getConfigPresetsDir();
      // shell.openPath returns '' on success, or an error string
      const result = await shell.openPath(presetsDir);
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
      const sanitized = sanitizePresetInput(preset);
      if (!sanitized.ok) {
        log.warnOnce(
          'presets_main.create-preset.invalid',
          '[presets_main] create-preset invalid payload (ignored).'
        );
        return { ok: false, error: sanitized.error, code: sanitized.code };
      }

      const sanitizedPreset = sanitized.preset;
      let settings = settingsState.getSettings();
      const lang = getEffectiveLang(settings);
      const userPresets = getUserPresets(settings, lang);

      // If preset name already exists in user's presets, overwrite that one
      const idx = userPresets.findIndex((p) => p.name === sanitizedPreset.name);
      if (idx >= 0) {
        userPresets[idx] = sanitizedPreset;
      } else {
        userPresets.push(sanitizedPreset);
      }

      settings = settingsState.saveSettings(settings);
      broadcast(settings);

      // Notify main window renderer that a preset was created/updated
      const { mainWin } = resolveWindows();
      try {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('preset-created', sanitizedPreset);
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
      if (typeof name !== 'undefined' && name !== null && typeof name !== 'string') {
        log.warnOnce(
          'presets_main.request-delete-preset.invalid_name',
          '[presets_main] request-delete-preset invalid name (ignored).'
        );
        return { ok: false, error: 'invalid name', code: 'INVALID_NAME' };
      }
      if (typeof name === 'string') {
        const trimmed = name.trim();
        if (trimmed.length > MAX_PRESET_STR_CHARS) {
          log.warnOnce(
            'presets_main.request-delete-preset.name_too_large',
            '[presets_main] request-delete-preset name too large (ignored).'
          );
          return { ok: false, error: 'invalid name', code: 'INVALID_NAME' };
        }
        name = trimmed;
      }

      // Load settings and dialog texts before any message
      let settings = settingsState.getSettings();
      const { lang, dialogTexts } = getDialogContext(settings);
      const { yesLabel, noLabel } = getYesNoLabels(dialogTexts);

      // If no name provided, show information dialog and exit
      if (!name) {
        try {
          const { mainWin } = resolveWindows();
          await dialog.showMessageBox(mainWin || null, {
            type: 'none',
            buttons: [resolveDialogText(dialogTexts, 'ok', 'OK')],
            defaultId: 0,
            message:
              resolveDialogText(
                dialogTexts,
                'delete_preset_none',
                'No preset selected to delete'
              ),
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
          resolveDialogText(
            dialogTexts,
            'delete_preset_confirm',
            'Are you sure you want to delete this preset?'
          ),
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
      const disabledDefaults = ensureDisabledDefaultPresets(settings, lang);

      if (idxUser >= 0) {
        // There is a personalized preset with that name
        if (isDefault) {
          // Remove personalized preset and mark default as ignored
          userPresets.splice(idxUser, 1);
          if (!disabledDefaults.includes(name)) {
            disabledDefaults.push(name);
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
          if (!disabledDefaults.includes(name)) {
            disabledDefaults.push(name);
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
      const { lang, dialogLang, dialogTexts } = getDialogContext(settings);
      const { yesLabel, noLabel } = getYesNoLabels(dialogTexts);

      const { mainWin } = resolveWindows();
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          interpolateDialogText(dialogTexts.restore_defaults_confirm, { lang: dialogLang }) ||
          resolveDialogText(
            dialogTexts,
            'restore_defaults_confirm',
            'Restore default presets to original?'
          ),
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
      const disabledDefaults = ensureDisabledDefaultPresets(settings, lang);

      settings.disabled_default_presets[lang] =
        disabledDefaults.filter((n) => {
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
      const { dialogTexts } = getDialogContext(settings);

      const { mainWin } = resolveWindows();
      await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [resolveDialogText(dialogTexts, 'ok', 'OK')],
        defaultId: 0,
        message:
          resolveDialogText(
            dialogTexts,
            'edit_preset_none',
            'No preset selected to edit'
          ),
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
  ipcMain.handle('edit-preset', async (_event, payload) => {
    try {
      const originalName =
        isPlainObject(payload) && Object.prototype.hasOwnProperty.call(payload, 'originalName')
          ? String(payload.originalName || '').trim()
          : '';
      if (!originalName) {
        return { ok: false, code: 'NO_ORIGINAL_NAME', error: 'invalid originalName' };
      }

      const sanitized = sanitizePresetInput(
        isPlainObject(payload) ? payload.newPreset : null
      );
      if (!sanitized.ok) {
        log.warnOnce(
          'presets_main.edit-preset.invalid',
          '[presets_main] edit-preset invalid payload (ignored).'
        );
        return { ok: false, error: sanitized.error, code: sanitized.code };
      }

      const sanitizedPreset = sanitized.preset;
      let settings = settingsState.getSettings();
      const { lang, dialogTexts } = getDialogContext(settings);

      const { yesLabel, noLabel } = getYesNoLabels(dialogTexts);
      const { mainWin } = resolveWindows();
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          interpolateDialogText(dialogTexts.edit_preset_confirm, { name: originalName }) ||
          resolveDialogText(
            dialogTexts,
            'edit_preset_confirm',
            'Are you sure you want to edit the preset?'
          ),
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

      const disabledDefaults = ensureDisabledDefaultPresets(settings, lang);

      let deletedAction = null;

      if (idxUser >= 0) {
        if (isDefault) {
          userPresets.splice(idxUser, 1);
          if (
            !disabledDefaults.includes(originalName)
          ) {
            disabledDefaults.push(originalName);
          }
          deletedAction = 'deleted_and_ignored';
        } else {
          userPresets.splice(idxUser, 1);
          deletedAction = 'deleted_custom';
        }
      } else if (isDefault) {
        if (
          !disabledDefaults.includes(originalName)
        ) {
          disabledDefaults.push(originalName);
        }
        deletedAction = 'ignored_default';
      }

      const idxNew = userPresets.findIndex((p) => p.name === sanitizedPreset.name);
      if (idxNew >= 0) {
        userPresets[idxNew] = sanitizedPreset;
      } else {
        userPresets.push(sanitizedPreset);
      }

      settings = settingsState.saveSettings(settings);
      broadcast(settings);

      try {
        const windows = resolveWindows();
        const { mainWin } = windows;
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('preset-created', sanitizedPreset);
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
  sanitizePresetInput,
};
