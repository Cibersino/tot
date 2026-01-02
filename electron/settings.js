// electron/settings.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Load, normalize, and persist user settings (user_settings.json) via injected loadJson/saveJson.
// - Keep language tags consistent (normalize language tag + base language).
// - Ensure numberFormatting[langBase] exists (from i18n/<lang>/numberFormat.json or safe defaults).
// - Expose a small state API (init/getSettings/saveSettings) with an in-memory cache.
// - Register IPC handlers (get-settings, set-language, set-mode-conteo) and broadcast settings-updated.
// - Apply a logged fallback language when the language modal closes without a selection.
// =============================================================================

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const Log = require('./log');

const log = Log.get('settings');

// =============================================================================
// Language helpers
// =============================================================================
const normalizeLangTag = (lang) =>
  (lang || '').trim().toLowerCase().replace(/_/g, '-');

const getLangBase = (lang) => {
  const tag = normalizeLangTag(lang);
  if (!tag) return '';
  const idx = tag.indexOf('-');
  return idx > 0 ? tag.slice(0, idx) : tag;
};

// =============================================================================
// Injected dependencies + cache
// =============================================================================
// Dependencies injected from main.js
let _loadJson = null;
let _saveJson = null;
let _settingsFile = null;

// Cache in memory of the last normalized settings
let _currentSettings = null;

// =============================================================================
// Number format defaults loader
// =============================================================================
/**
 * Loads i18n/<langBase>/numberFormat.json and extracts separators.
 * Returns { thousands, decimal } or null if unavailable/invalid.
 */
function loadNumberFormatDefaults(lang) {
  const langCode = getLangBase(lang) || 'es';
  const filePath = path.join(__dirname, '..', 'i18n', langCode, 'numberFormat.json');

  try {
    if (!fs.existsSync(filePath)) return null;

    let raw = fs.readFileSync(filePath, 'utf8');
    if (!raw) return null;

    // Remove UTF-8 BOM if present (some editors may add it).
    raw = raw.replace(/^\uFEFF/, '');

    const json = JSON.parse(raw);

    const thousands = typeof json.thousands === 'string' ? json.thousands : '';
    const decimal = typeof json.decimal === 'string' ? json.decimal : '';

    if (!thousands || !decimal) {
      log.warnOnce(
        `settings.loadNumberFormatDefaults.invalidSchema:${langCode}`,
        'numberFormat.json schema invalid (expected non-empty thousands/decimal strings):',
        { langCode, filePath, keys: json && typeof json === 'object' ? Object.keys(json) : [] }
      );
      return null;
    }

    return { thousands, decimal };
  } catch (err) {
    // Recoverable: caller will apply default separators (fallback).
    log.warnOnce(
      `settings.loadNumberFormatDefaults.read:${langCode}`,
      'numberFormat defaults load failed (using fallback):',
      { langCode, filePath },
      err
    );
    return null;
  }
}

// =============================================================================
// Number formatting normalization helper
// =============================================================================
/**
 * Ensures settings.numberFormatting[langBase] exists.
 * If missing, populate from i18n; otherwise use safe defaults and log once.
 */
function ensureNumberFormattingForBase(settings, base) {
  if (!settings || typeof settings !== 'object') return;

  const langBase = getLangBase(base) || 'es';

  if (settings.numberFormatting[langBase]) return;

  const nf = loadNumberFormatDefaults(langBase);
  if (nf && nf.thousands && nf.decimal) {
    settings.numberFormatting[langBase] = {
      separadorMiles: nf.thousands,
      separadorDecimal: nf.decimal,
    };
  } else {
    log.warnOnce(
      `settings.ensureNumberFormattingForBase.default:${langBase}`,
      'Using default number formatting (fallback):',
      langBase,
      { separadorMiles: '.', separadorDecimal: ',' }
    );
    settings.numberFormatting[langBase] = {
      separadorMiles: '.',
      separadorDecimal: ',',
    };
  }
}

// =============================================================================
// Settings normalization
// =============================================================================
/**
 * Normalizes settings without overwriting existing valid values.
 * Notes:
 * - numberFormatting is enforced via ensureNumberFormattingForBase().
 */
function normalizeSettings(s) {
  s = s || {};

  if (typeof s.language !== 'string') s.language = '';

  // presets_by_language:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof s.presets_by_language === 'undefined') {
    s.presets_by_language = {};
  } else if (
    typeof s.presets_by_language !== 'object' ||
    Array.isArray(s.presets_by_language) ||
    s.presets_by_language === null
  ) {
    log.warnOnce(
      'settings.normalizeSettings.invalidPresetsByLanguage',
      'Invalid presets_by_language; resetting to empty object:',
      { type: typeof s.presets_by_language, isArray: Array.isArray(s.presets_by_language) }
    );
    s.presets_by_language = {};
  }

  // Ensure numberFormatting is a plain object (may be missing/null/array/invalid types).
  if (typeof s.numberFormatting === 'undefined') {
    s.numberFormatting = {};
  } else if (
    typeof s.numberFormatting !== 'object' ||
    Array.isArray(s.numberFormatting) ||
    s.numberFormatting === null
  ) {
    log.warnOnce(
      'settings.normalizeSettings.invalidNumberFormatting',
      'Invalid numberFormatting; resetting to empty object:',
      { type: typeof s.numberFormatting, isArray: Array.isArray(s.numberFormatting) }
    );
    s.numberFormatting = {};
  }

  // Ensure disabled_default_presets is a plain object (may be missing/null/array/invalid types).
  if (typeof s.disabled_default_presets === 'undefined') {
    s.disabled_default_presets = {};
  } else if (
    typeof s.disabled_default_presets !== 'object' ||
    Array.isArray(s.disabled_default_presets) ||
    s.disabled_default_presets === null
  ) {
    log.warnOnce(
      'settings.normalizeSettings.invalidDisabledDefaultPresets',
      'Invalid disabled_default_presets; resetting to empty object:',
      { type: typeof s.disabled_default_presets, isArray: Array.isArray(s.disabled_default_presets) }
    );
    s.disabled_default_presets = {};
  }

  // modeConteo:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof s.modeConteo === 'undefined') {
    s.modeConteo = 'preciso';
  } else if (s.modeConteo !== 'preciso' && s.modeConteo !== 'simple') {
    log.warnOnce(
      'settings.normalizeSettings.invalidModeConteo',
      'Invalid modeConteo; forcing default:',
      { value: s.modeConteo }
    );
    s.modeConteo = 'preciso';
  }

  // Normalize language tag and compute its base (e.g., "en-US" -> "en").
  const langTag =
    s.language && typeof s.language === 'string' && s.language.trim()
      ? normalizeLangTag(s.language)
      : '';

  const langBase = getLangBase(langTag) || 'es';
  if (langTag) s.language = langTag;

  // presets_by_language[langBase]:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof s.presets_by_language[langBase] === 'undefined') {
    s.presets_by_language[langBase] = [];
  } else if (!Array.isArray(s.presets_by_language[langBase])) {
    log.warnOnce(
      'settings.normalizeSettings.invalidPresetsByLanguageEntry',
      'Invalid presets_by_language entry; forcing empty array:',
      {
        langBase,
        type: typeof s.presets_by_language[langBase],
        isArray: Array.isArray(s.presets_by_language[langBase]),
      }
    );
    s.presets_by_language[langBase] = [];
  }

  ensureNumberFormattingForBase(s, langBase);

  return s;
}

// =============================================================================
// State API: init / getSettings / saveSettings
// =============================================================================
/**
 * Initializes the module (called from main.js).
 * - Injects loadJson/saveJson and settingsFile path.
 * - Reads, normalizes, caches, and persists settings.
 */
function init({ loadJson, saveJson, settingsFile }) {
  if (typeof loadJson !== 'function' || typeof saveJson !== 'function') {
    throw new Error('[settings] init requiere loadJson y saveJson');
  }
  if (!settingsFile) {
    throw new Error('[settings] init requiere settingsFile');
  }

  _loadJson = loadJson;
  _saveJson = saveJson;
  _settingsFile = settingsFile;

  const raw = _loadJson(_settingsFile, {
    language: '',
    presets_by_language: {},
    disabled_default_presets: {},
  });

  const normalized = normalizeSettings(raw);
  _currentSettings = normalized;

  try {
    _saveJson(_settingsFile, _currentSettings);
  } catch (err) {
    log.error('init failed to persist settings:', _settingsFile, err);
  }

  return _currentSettings;
}

/**
 * Returns the current settings, always normalized.
 * Note: it reloads from disk to reflect external changes.
 */
function getSettings() {
  if (!_loadJson || !_settingsFile) {
    throw new Error('[settings] getSettings llamado antes de init');
  }

  const raw = _loadJson(_settingsFile, {
    language: '',
    presets_by_language: {},
    disabled_default_presets: {},
  });

  _currentSettings = normalizeSettings(raw);
  return _currentSettings;
}

/**
 * Normalizes and persists settings, updating the cache.
 */
function saveSettings(nextSettings) {
  if (!nextSettings) return getSettings();

  const normalized = normalizeSettings(nextSettings);
  _currentSettings = normalized;

  try {
    if (_saveJson && _settingsFile) {
      _saveJson(_settingsFile, normalized);
    }
  } catch (err) {
    log.errorOnce(
      `settings.saveSettings.persist:${String(_settingsFile)}`,
      'saveSettings failed (not persisted):',
      _settingsFile,
      err
    );
  }

  return _currentSettings;
}

// =============================================================================
// Broadcast
// =============================================================================
/**
 * Sends 'settings-updated' to the main window (best-effort).
 */
function broadcastSettingsUpdated(settings, windows) {
  if (!windows) return;
  const { mainWin } = windows;

  try {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('settings-updated', settings);
    }
  } catch (err) {
    log.warnOnce(
      'settings.broadcastSettingsUpdated',
      'settings-updated notify failed (ignored):',
      err
    );
  }
}

// =============================================================================
// Fallback language
// =============================================================================
/**
 * If the language modal closes without selecting anything, apply a logged fallback language.
 * This is intentionally non-silent: it changes settings.language and persists it.
 */
function applyFallbackLanguageIfUnset(fallbackLang = 'es') {
  try {
    let settings = getSettings();
    if (!settings.language || settings.language === '') {
      const lang = normalizeLangTag(fallbackLang);
      const base = getLangBase(lang) || 'es';
      settings.language = lang;

      log.warnOnce(
        `settings.applyFallbackLanguageIfUnset.applied:${base}`,
        'Language was unset; applying fallback language:',
        lang
      );
      saveSettings(settings);
    }
  } catch (err) {
    log.error('applyFallbackLanguageIfUnset failed:', err);
  }
}

// =============================================================================
// IPC
// =============================================================================
/**
 * Registers IPC related to settings:
 * - get-settings
 * - set-language
 * - set-mode-conteo
 */
function registerIpc(
  ipcMain,
  {
    getWindows, // () => ({ mainWin, editorWin, presetWin, langWin, flotanteWin })
    buildAppMenu, // function(lang)
    setCurrentLanguage, // (lang) => void
  }
) {
  if (!ipcMain) {
    throw new Error('[settings] registerIpc requiere ipcMain');
  }

  // get-settings: returns the current settings object (normalized)
  ipcMain.handle('get-settings', async () => {
    try {
      return getSettings();
    } catch (err) {
      log.errorOnce(
        'settings.ipc.get-settings',
        'IPC get-settings failed (using safe fallback):',
        err
      );
      return normalizeSettings({
        language: 'es',
        presets_by_language: {},
        disabled_default_presets: {},
      });
    }
  });

  // set-language: saves language, ensures numberFormatting, rebuilds menu, broadcasts
  ipcMain.handle('set-language', async (_event, lang) => {
    try {
      const chosenRaw = String(lang || '');
      const chosen = normalizeLangTag(chosenRaw);
      const effectiveLang = chosen || '';

      let settings = getSettings();
      settings.language = chosen;

      settings = saveSettings(settings);

      if (typeof setCurrentLanguage === 'function') {
        setCurrentLanguage(effectiveLang || 'es');
      }

      const windows = typeof getWindows === 'function' ? getWindows() : {};

      // Rebuild menu with the new language
      if (typeof buildAppMenu === 'function') {
        try {
          buildAppMenu(effectiveLang);
        } catch (err) {
          log.warn('menu rebuild failed (ignored):', effectiveLang, err);
        }
      }

      // Hide the toolbar in secondary windows (editor, preset, language)
      try {
        const { editorWin, presetWin, langWin } = windows;

        if (editorWin && !editorWin.isDestroyed()) {
          editorWin.setMenu(null);
          editorWin.setMenuBarVisibility(false);
        }

        if (presetWin && !presetWin.isDestroyed()) {
          presetWin.setMenu(null);
          presetWin.setMenuBarVisibility(false);
        }

        if (langWin && !langWin.isDestroyed()) {
          langWin.setMenu(null);
          langWin.setMenuBarVisibility(false);
        }
      } catch (err) {
        log.warn('hide menu in secondary windows failed (ignored):', err);
      }

      broadcastSettingsUpdated(settings, windows);

      return { ok: true, language: chosen };
    } catch (err) {
      log.error('IPC set-language failed:', err);
      return { ok: false, error: String(err) };
    }
  });

  // set-mode-conteo: simple/preciso + broadcast
  ipcMain.handle('set-mode-conteo', async (_event, mode) => {
    try {
      let settings = getSettings();
      settings.modeConteo = mode === 'simple' ? 'simple' : 'preciso';
      settings = saveSettings(settings);

      const windows = typeof getWindows === 'function' ? getWindows() : {};
      broadcastSettingsUpdated(settings, windows);

      return { ok: true, mode: settings.modeConteo };
    } catch (err) {
      log.error('IPC set-mode-conteo failed:', err);
      return { ok: false, error: String(err) };
    }
  });
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  init,
  registerIpc,
  getSettings,
  saveSettings,
  applyFallbackLanguageIfUnset,
  broadcastSettingsUpdated,
};

// =============================================================================
// End of settings.js
// =============================================================================
