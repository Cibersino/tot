// electron/presets_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Seed missing user-configured default-preset files from bundled JSON.
// - Load user-configured preset defaults (general + per-language).
// - Validate and sanitize preset payloads from IPC.
// - Persist preset changes into settings and broadcast updates.
// - Show native confirmation dialogs for preset delete, restore, and edit actions.
// - Register preset-related IPC handlers and emit preset-created notifications.

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const { dialog, shell } = require('electron');
const Log = require('./log');

const log = Log.get('presets-main');
log.debug('Presets main starting...');
const {
  DEFAULT_LANG,
  PRESET_NAME_MAX,
  PRESET_DESC_MAX,
  PRESET_WPM_MIN,
  PRESET_WPM_MAX
} = require('./constants_main');
const { getConfigPresetsDir, ensureConfigPresetsDir } = require('./fs_storage');
const settingsState = require('./settings');
const { normalizeLangTag, normalizeLangBase } = settingsState;
const menuBuilder = require('./menu_builder');

// =============================================================================
// Constants / config
// =============================================================================
// Default presets source folder (bundled JSON seeds).
const PRESETS_SOURCE_DIR = path.join(__dirname, 'presets'); // original folder: electron/presets

// =============================================================================
// Helpers
// =============================================================================
function isAuthorizedSender(event, expectedWin, channelName) {
  try {
    const senderWin = event && event.sender
      ? require('electron').BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!expectedWin) {
      log.warn(
        `${channelName} rejected (ignored): expected owner window unavailable.`
      );
      return false;
    }
    if (!senderWin) {
      log.warn(
        `${channelName} rejected (ignored): sender window could not be resolved.`
      );
      return false;
    }
    if (senderWin !== expectedWin) {
      log.warn(`${channelName} unauthorized (ignored).`);
      return false;
    }
    return true;
  } catch (err) {
    log.warn('Preset sender validation failed:', err);
    return false;
  }
}

const resolveDialogText = (dialogTexts, key, fallback) =>
  menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log
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

  if (name.length > PRESET_NAME_MAX) {
    return { ok: false, error: 'preset name too long', code: 'PRESET_NAME_TOO_LONG' };
  }

  if (description.length > PRESET_DESC_MAX) {
    return { ok: false, error: 'preset description too long', code: 'PRESET_DESCRIPTION_TOO_LONG' };
  }

  if (!Number.isFinite(wpmNum)) {
    return { ok: false, error: 'invalid preset payload', code: 'INVALID_PRESET' };
  }

  const roundedWpm = Math.round(wpmNum);
  if (roundedWpm < PRESET_WPM_MIN || roundedWpm > PRESET_WPM_MAX) {
    return { ok: false, error: 'invalid preset payload', code: 'INVALID_PRESET' };
  }

  return {
    ok: true,
    preset: {
      name,
      wpm: roundedWpm,
      description,
    },
  };
}

function sanitizePresetArray(entries, filePath) {
  const presets = [];
  let invalidCount = 0;

  entries.forEach((entry) => {
    const result = sanitizePresetInput(entry);
    if (result.ok) {
      presets.push(result.preset);
    } else {
      invalidCount += 1;
    }
  });

  if (invalidCount) {
    log.warn(
      '[presets_main] Preset JSON contains invalid entries; ignoring:',
      filePath,
      { invalidCount }
    );
  }

  return presets;
}

function readConfiguredPresetArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) {
      log.warn(
        '[presets_main] Preset JSON is not an array; configured catalog is empty:',
        filePath
      );
      return [];
    }
    return sanitizePresetArray(arr, filePath);
  } catch (err) {
    log.warn(
      '[presets_main] Preset JSON load failed; configured catalog is empty:',
      filePath,
      err
    );
    return [];
  }
}

/**
 * Loads the configured default-preset catalog. When a language is supplied,
 * only that language's configured defaults are read. Bundled files seed
 * missing configuration files at startup, but do not substitute for runtime
 * reads.
 */
function loadConfiguredDefaultPresetCatalog(lang) {
  const unavailableCatalog = {
    available: false,
    general: [],
    languagePresets: {},
  };
  let entries;
  let presetsDir;

  try {
    ensureConfigPresetsDir();
    presetsDir = getConfigPresetsDir();
    entries = fs.readdirSync(presetsDir);
  } catch (err) {
    log.error(
      '[presets_main] Configured default-preset catalog is unavailable:',
      err
    );
    return unavailableCatalog;
  }

  const generalFile = entries.find(
    (name) => name.toLowerCase() === 'defaults_presets.json'
  );
  const general = generalFile
    ? readConfiguredPresetArray(path.join(presetsDir, generalFile))
    : [];
  const languagePresets = {};
  const langCode = typeof lang === 'undefined'
    ? null
    : normalizeLangBase(lang);

  entries
    .filter((name) => /^defaults_presets_([a-z0-9-]+)\.json$/i.test(name))
    .forEach((name) => {
      const match = /^defaults_presets_([a-z0-9-]+)\.json$/i.exec(name);
      if (!match || !match[1]) return;
      const fileLang = match[1].toLowerCase();
      if (langCode && fileLang !== langCode) return;
      languagePresets[fileLang] = readConfiguredPresetArray(
        path.join(presetsDir, name)
      );
    });

  return { available: true, general, languagePresets };
}

/**
 * Resolves the effective configured defaults for one language using the same
 * general-then-language precedence as the renderer.
 */
function loadDefaultPresetsCombined(lang) {
  const langCode = normalizeLangBase(lang);
  const catalog = loadConfiguredDefaultPresetCatalog(langCode);
  if (!catalog.available) {
    return { available: false, presets: [] };
  }

  const { general, languagePresets } = catalog;
  const combinedByName = new Map();

  general.forEach((preset) => combinedByName.set(preset.name, preset));

  const languageDefaults = langCode ? languagePresets[langCode] : [];
  if (Array.isArray(languageDefaults)) {
    languageDefaults.forEach((preset) => combinedByName.set(preset.name, preset));
  }

  return { available: true, presets: Array.from(combinedByName.values()) };
}

/**
 * Initial copy of default presets from electron/presets/*.json
 * to userData config presets_defaults JSON (only if they do not exist).
 */
function copyDefaultPresetsIfMissing() {
  try {
    ensureConfigPresetsDir();
    const presetsDir = getConfigPresetsDir();

    if (!fs.existsSync(PRESETS_SOURCE_DIR)) {
      log.warn(
        '[presets_main] Presets source dir missing; defaults copy skipped (ignored):',
        PRESETS_SOURCE_DIR
      );
      return;
    }

    const entries = fs.readdirSync(PRESETS_SOURCE_DIR);
    entries
      .filter((name) => /^defaults_presets.*\.json$/i.test(name))
      .forEach((fname) => {
        const src = path.join(PRESETS_SOURCE_DIR, fname);
        const dest = path.join(
          presetsDir,
          fname
        );

        // Seed user config without overwriting existing files.
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          try {
            const raw = fs.readFileSync(src, 'utf8');
            fs.writeFileSync(dest, raw, 'utf8');
            log.info(
              '[presets_main] Default preset copied to user config:',
              { src, dest }
            );
          } catch (err) {
            log.warn(
              '[presets_main] Copy default preset failed (ignored):',
              { src, dest },
              err
            );
          }
        }
      });
  } catch (err) {
    log.warn('[presets_main] copyDefaultPresetsIfMissing failed (ignored):', err);
  }
}

// =============================================================================
// IPC registration / handlers
// =============================================================================
/**
 * Registration of IPC handlers related to presets.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} opts
 * @param {Function} opts.getWindows - Returns window references; this module reads mainWin and presetWin.
 */
function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[presets_main] registerIpc requires ipcMain');
  }

  const resolveWindows =
    typeof getWindows === 'function'
      ? () => getWindows() || {}
      : () => getWindows || {};

  const resolveMainWin = () => resolveWindows().mainWin || null;
  const resolvePresetWin = () => resolveWindows().presetWin || null;

  // Best-effort: seed user config defaults on startup.
  copyDefaultPresetsIfMissing();

  function broadcast(settings) {
    try {
      settingsState.publishSettingsUpdated(settings);
    } catch (err) {
      log.warn(
        '[presets_main] settings-updated notify failed (ignored):',
        err
      );
    }
  }

  // Best-effort after persistence: this refreshes Main's preset list and attempts auto-selection. If it is lost, the preset remains saved, but Main may stay stale; a later reload does not replay auto-selection.
  function notifyMainPresetCreated(preset, settingsSnapshot, language) {
    try {
      const { mainWin } = resolveWindows();
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('preset-created', {
          preset,
          settingsSnapshot,
          language,
        });
      } else {
        log.warn(
          '[presets_main] preset-created notify failed (ignored): main window unavailable.'
        );
      }
    } catch (err) {
      log.warn(
        '[presets_main] preset-created notify failed (ignored):',
        err
      );
    }
  }

  // Normalize settings language to a base tag with a safe fallback.
  function getEffectiveLang(settings) {
    const s = settings || settingsState.getSettings();
    const lang =
      s.language && typeof s.language === 'string' && s.language.trim()
        ? s.language.trim()
        : DEFAULT_LANG;
    return normalizeLangBase(lang) || DEFAULT_LANG;
  }

  function clonePresetSettings(settings, lang) {
    const presetsByLanguage = { ...settings.presets_by_language };
    const disabledDefaults = { ...settings.disabled_default_presets };
    if (Array.isArray(presetsByLanguage[lang])) {
      presetsByLanguage[lang] = presetsByLanguage[lang].slice();
    }
    if (Array.isArray(disabledDefaults[lang])) {
      disabledDefaults[lang] = disabledDefaults[lang].slice();
    }
    return {
      ...settings,
      presets_by_language: presetsByLanguage,
      disabled_default_presets: disabledDefaults,
    };
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

  function getConfirmButtonLabels(dialogTexts) {
    return {
      continueLabel: resolveDialogText(dialogTexts, 'continue_button'),
      cancelLabel: resolveDialogText(dialogTexts, 'cancel_button'),
    };
  }

  // IPC: return the configured default-preset catalog.
  ipcMain.handle('get-default-presets', () => {
    try {
      const { general, languagePresets } = loadConfiguredDefaultPresetCatalog();
      return { general, languagePresets };
    } catch (err) {
      log.error(
        '[presets_main] Error providing default presets (get-default-presets):',
        err
      );
      return { general: [], languagePresets: {} };
    }
  });

  // IPC: open the config presets folder in the OS file manager.
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

  // IPC: create or overwrite a user preset and broadcast changes.
  ipcMain.handle('create-preset', (event, preset) => {
    try {
      const presetWin = resolvePresetWin();
      if (
        !isAuthorizedSender(
          event,
          presetWin,
          'create-preset'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      const sanitized = sanitizePresetInput(preset);
      if (!sanitized.ok) {
        log.warn(
          '[presets_main] create-preset invalid payload (ignored).'
        );
        return { ok: false, error: sanitized.error, code: sanitized.code };
      }

      const sanitizedPreset = sanitized.preset;
      let settings = settingsState.getSettings();
      const lang = getEffectiveLang(settings);
      settings = clonePresetSettings(settings, lang);
      const userPresets = getUserPresets(settings, lang);

      // Preset names are treated as unique keys; overwrite on match.
      const idx = userPresets.findIndex((p) => p.name === sanitizedPreset.name);
      if (idx >= 0) {
        userPresets[idx] = sanitizedPreset;
      } else {
        userPresets.push(sanitizedPreset);
      }

      settings = settingsState.saveSettingsStrict(settings);
      broadcast(settings);
      notifyMainPresetCreated(sanitizedPreset, settings, lang);

      return { ok: true };
    } catch (err) {
      log.error('[presets_main] Error creating preset:', err);
      return { ok: false, error: String(err) };
    }
  });

  // IPC: confirm deletion with a native dialog, then persist changes.
  ipcMain.handle('request-delete-preset', async (event, name) => {
    try {
      const mainWin = resolveMainWin();
      if (
        !isAuthorizedSender(
          event,
          mainWin,
          'request-delete-preset'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      if (typeof name !== 'undefined' && name !== null && typeof name !== 'string') {
        log.warn(
          '[presets_main] request-delete-preset invalid name (ignored).'
        );
        return { ok: false, error: 'invalid name', code: 'INVALID_NAME' };
      }
      if (typeof name === 'string') {
        const trimmed = name.trim();
        if (trimmed.length > PRESET_NAME_MAX) {
          log.warn(
            '[presets_main] request-delete-preset name too large (ignored).'
          );
          return { ok: false, error: 'invalid name', code: 'INVALID_NAME' };
        }
        name = trimmed;
      }

      // Load settings and dialog texts before any message
      let settings = settingsState.getSettings();
      const { lang, dialogTexts } = getDialogContext(settings);
      const { continueLabel, cancelLabel } = getConfirmButtonLabels(dialogTexts);

      if (!name) {
        log.warn('[presets_main] request-delete-preset called without a preset name (ignored).');
        return { ok: false, error: 'invalid name', code: 'INVALID_NAME' };
      }

      // Ask confirmation (native dialog)
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [continueLabel, cancelLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          interpolateDialogText(dialogTexts.delete_preset_confirm, { name }) ||
          resolveDialogText(dialogTexts, 'delete_preset_confirm'),
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      // Resolve defaults from the same configured catalog returned to the renderer.
      const defaultCatalog = loadDefaultPresetsCombined(lang);
      if (!defaultCatalog.available) {
        return { ok: false, code: 'DEFAULT_CATALOG_UNAVAILABLE' };
      }
      const defaultsCombined = defaultCatalog.presets;
      settings = clonePresetSettings(settings, lang);

      // Ensure per-language preset buckets exist before edits.
      const userPresets = getUserPresets(settings, lang);
      const idxUser = userPresets.findIndex((p) => p.name === name);
      const isDefault = defaultsCombined.find((p) => p.name === name);

      // Ensure disabled_default_presets bucket exists for this language.
      const disabledDefaults = ensureDisabledDefaultPresets(settings, lang);

      if (idxUser >= 0) {
        // Custom preset exists; if it shadows a default, also disable that default.
        if (isDefault) {
          userPresets.splice(idxUser, 1);
          if (!disabledDefaults.includes(name)) {
            disabledDefaults.push(name);
          }
          settings = settingsState.saveSettingsStrict(settings);
          broadcast(settings);

          return { ok: true, action: 'deleted_and_ignored', settingsSnapshot: settings, language: lang };
        } else {
          // Custom-only entry; remove it and keep defaults intact.
          userPresets.splice(idxUser, 1);
          settings = settingsState.saveSettingsStrict(settings);
          broadcast(settings);

          return { ok: true, action: 'deleted_custom', settingsSnapshot: settings, language: lang };
        }
      } else {
        // No custom preset; if a default exists, disable it for this language.
        if (isDefault) {
          if (!disabledDefaults.includes(name)) {
            disabledDefaults.push(name);
          }
          settings = settingsState.saveSettingsStrict(settings);
          broadcast(settings);

          return { ok: true, action: 'ignored_default', settingsSnapshot: settings, language: lang };
        }
      }

      return { ok: false, code: 'NOT_FOUND' };
    } catch (err) {
      log.error('[presets_main] Error in request-delete-preset:', err);
      return { ok: false, error: String(err) };
    }
  });

  // IPC: confirm and restore defaults for the current language.
  ipcMain.handle('request-restore-defaults', async (event) => {
    try {
      const mainWin = resolveMainWin();
      if (
        !isAuthorizedSender(
          event,
          mainWin,
          'request-restore-defaults'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      let settings = settingsState.getSettings();
      const { lang, dialogLang, dialogTexts } = getDialogContext(settings);
      const { continueLabel, cancelLabel } = getConfirmButtonLabels(dialogTexts);

      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [continueLabel, cancelLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          interpolateDialogText(dialogTexts.restore_defaults_confirm, { lang: dialogLang }) ||
          resolveDialogText(dialogTexts, 'restore_defaults_confirm'),
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      const defaultCatalog = loadDefaultPresetsCombined(lang);
      if (!defaultCatalog.available) {
        return { ok: false, code: 'DEFAULT_CATALOG_UNAVAILABLE' };
      }
      const defaultsCombined = defaultCatalog.presets;
      settings = clonePresetSettings(settings, lang);
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

      settings = settingsState.saveSettingsStrict(settings);
      broadcast(settings);

      return { ok: true, action: 'restored', removedCustom, unignored, settingsSnapshot: settings, language: lang };
    } catch (err) {
      log.error(
        '[presets_main] Error restoring default presets:',
        err
      );
      return { ok: false, error: String(err) };
    }
  });

  // IPC: confirm edit, replace preset, and broadcast.
  ipcMain.handle('edit-preset', async (event, payload) => {
    try {
      const presetWin = resolvePresetWin();
      const mainWin = resolveMainWin();
      if (
        !isAuthorizedSender(
          event,
          presetWin,
          'edit-preset'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      const originalName =
        isPlainObject(payload) && Object.prototype.hasOwnProperty.call(payload, 'originalName')
          ? String(payload.originalName || '').trim()
          : '';
      if (!originalName) {
        log.warn('[presets_main] edit-preset missing originalName (ignored).');
        return { ok: false, code: 'NO_ORIGINAL_NAME', error: 'invalid originalName' };
      }

      const sanitized = sanitizePresetInput(
        isPlainObject(payload) ? payload.newPreset : null
      );
      if (!sanitized.ok) {
        log.warn(
          '[presets_main] edit-preset invalid payload (ignored).'
        );
        return { ok: false, error: sanitized.error, code: sanitized.code };
      }

      const sanitizedPreset = sanitized.preset;
      let settings = settingsState.getSettings();
      const { lang, dialogTexts } = getDialogContext(settings);

      const { continueLabel, cancelLabel } = getConfirmButtonLabels(dialogTexts);
      const conf = await dialog.showMessageBox(mainWin || null, {
        type: 'none',
        buttons: [continueLabel, cancelLabel],
        defaultId: 1,
        cancelId: 1,
        message:
          interpolateDialogText(dialogTexts.edit_preset_confirm, { name: originalName }) ||
          resolveDialogText(dialogTexts, 'edit_preset_confirm'),
      });
      if (conf.response === 1) {
        return { ok: false, code: 'CANCELLED' };
      }

      const defaultCatalog = loadDefaultPresetsCombined(lang);
      if (!defaultCatalog.available) {
        return { ok: false, code: 'DEFAULT_CATALOG_UNAVAILABLE' };
      }
      const defaultsCombined = defaultCatalog.presets;
      settings = clonePresetSettings(settings, lang);
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

      settings = settingsState.saveSettingsStrict(settings);
      broadcast(settings);
      notifyMainPresetCreated(sanitizedPreset, settings, lang);

      return { ok: true, action: 'edited', deletedAction };
    } catch (err) {
      log.error('[presets_main] Error editing preset:', err);
      return { ok: false, error: String(err) };
    }
  });
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  registerIpc,
  sanitizePresetInput,
};

// =============================================================================
// End of electron/presets_main.js
// =============================================================================
