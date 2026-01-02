// electron/settings.js
// Centralized management of user_settings.json: language, modeCount, numberFormatting, etc.
'use strict';

const fs = require('fs');
const path = require('path');
const Log = require('./log');

const log = Log.get('settings');

const normalizeLangTag = (lang) =>
  (lang || '').trim().toLowerCase().replace(/_/g, '-');

const getLangBase = (lang) => {
  const tag = normalizeLangTag(lang);
  if (!tag) return '';
  const idx = tag.indexOf('-');
  return idx > 0 ? tag.slice(0, idx) : tag;
};

// Dependencies injected from main.js
let _loadJson = null;
let _saveJson = null;
let _settingsFile = null;

// Cache in memory of the last normalized settings
let _currentSettings = null;

/**
 * Load the number format defaults from i18n/<lang>/numberFormat.json
 * Returns { thousands, decimal } or null if the load failed.
 */
function loadNumberFormatDefaults(lang) {
  try {
    const langCode = getLangBase(lang) || 'es';
    const filePath = path.join(__dirname, '..', 'i18n', langCode, 'numberFormat.json');
    if (!fs.existsSync(filePath)) return null;

    let raw = fs.readFileSync(filePath, 'utf8');
    if (!raw) return null;

    // Remove UTF-8 BOM if exists
    raw = raw.replace(/^\uFEFF/, '');

    const json = JSON.parse(raw);

    const thousands =
      json.thousands ||
      json.thousandsSeparator ||
      json.separadorMiles ||
      json.sepMiles ||
      '.';

    const decimal =
      json.decimal ||
      json.decimalSeparator ||
      json.separadorDecimal ||
      json.sepDecimal ||
      ',';

    return { thousands, decimal };
  } catch (err) {
    log.error('[settings] Error loading numberFormat defaults for', lang, err);
    return null;
  }
}

function ensureNumberFormattingForBase(settings, base) {
  if (!settings || typeof settings !== 'object') return;

  const langBase = getLangBase(base) || 'es';

  if (
    typeof settings.numberFormatting !== 'object' ||
    Array.isArray(settings.numberFormatting) ||
    settings.numberFormatting === null
  ) {
    log.warnOnce(
      'settings.ensureNumberFormattingForBase.invalidNumberFormatting',
      'Invalid numberFormatting; resetting to empty object:',
      { type: typeof settings.numberFormatting, isArray: Array.isArray(settings.numberFormatting) }
    );
    settings.numberFormatting = {};
  }

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

/**
 * Normalize settings: ensure default fields without overwriting existing ones.
 * Maintains the previous main.js logic.
 */
function normalizeSettings(s) {
  s = s || {};

  if (typeof s.language !== 'string') s.language = '';

  if (
    typeof s.presets_by_language !== 'object' ||
    Array.isArray(s.presets_by_language) ||
    s.presets_by_language === null
  ) {
    s.presets_by_language = {};
  }

  // Ensure numberFormatting is a plain object (settings may contain null/array/invalid types).
  if (
    typeof s.numberFormatting !== 'object' ||
    Array.isArray(s.numberFormatting) ||
    s.numberFormatting === null
  ) {
    s.numberFormatting = {};
  }

  // Persist default count mode: 'precise'
  if (!s.modeConteo || (s.modeConteo !== 'preciso' && s.modeConteo !== 'simple')) {
    s.modeConteo = 'preciso';
  }

  // Ensure numberFormatting has defaults for current language (from i18n if available)
  const langTag =
    s.language && typeof s.language === 'string' && s.language.trim()
      ? normalizeLangTag(s.language)
      : '';

  const langBase = getLangBase(langTag) || 'es';
  if (langTag) s.language = langTag;

  // If legacy presets exist, migrate them once into the bucket of the current language and drop the old field.
  if (Array.isArray(s.presets)) {
    if (!Array.isArray(s.presets_by_language[langBase])) {
      s.presets_by_language[langBase] = s.presets.slice();
    }
    delete s.presets;
  }

  if (!Array.isArray(s.presets_by_language[langBase])) {
    s.presets_by_language[langBase] = [];
  }

  ensureNumberFormattingForBase(s, langBase);

  return s;
}

/**
 * Initialization from main.js
 * -Inject loadJson/saveJson and SETTINGS_FILE path.
 * -Read, normalize and persist user_settings.json.
 * -Leave _currentSettings cached.
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
    log.error('[settings] Error persisting settings in init:', err);
  }

  return _currentSettings;
}

/**
 * Returns the current settings normalized from cache or disk.
 */
function getSettings() {
  if (!_loadJson || !_settingsFile) {
    throw new Error('[settings] getSettings llamado antes de init');
  }

  // Always reload from disk to reflect changes made outside settingsState
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

/**
 * Centralized broadcast of 'settings-updated' to the main window.
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

/**
 * Fallback for the case where the language modal closes without selecting anything.
 * If settings.language is empty, force fallbackLang (default 'es')
 * and ensures numberFormatting[fallbackLang].
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

      ensureNumberFormattingForBase(settings, base);

      saveSettings(settings);
    }
  } catch (err) {
    log.error('[settings] Error applying fallback language:', err);
  }
}

/**
 * Registers IPC related to general configuration:
 * -get-settings
 * -set-language
 * -set-mode-count
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
      log.errorOnce('settings.ipc.get-settings', 'IPC get-settings failed (using safe fallback):', err);
      return { language: 'es', presets_by_language: {}, disabled_default_presets: {} };
    }
  });

  // set-language: saves language, ensures numberFormatting and rebuilds menu
  ipcMain.handle('set-language', async (_event, lang) => {
    try {
      const chosenRaw = String(lang || '');
      const chosen = normalizeLangTag(chosenRaw);
      const effectiveLang = chosen || '';
      const base = getLangBase(effectiveLang) || 'es';

      let settings = getSettings();
      settings.language = chosen;

      ensureNumberFormattingForBase(settings, base);

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
          log.warn('[settings] Error rebuilding menu:', err);
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
        log.warn('[settings] Error hiding menu in secondary windows:', err);
      }

      broadcastSettingsUpdated(settings, windows);

      return { ok: true, language: chosen };
    } catch (err) {
      log.error('Error saving language:', err);
      return { ok: false, error: String(err) };
    }
  });

  // set-mode-count: simple/precise + broadcast
  ipcMain.handle('set-mode-conteo', async (_event, mode) => {
    try {
      let settings = getSettings();
      settings.modeConteo = mode === 'simple' ? 'simple' : 'preciso';
      settings = saveSettings(settings);

      const windows = typeof getWindows === 'function' ? getWindows() : {};
      broadcastSettingsUpdated(settings, windows);

      return { ok: true, mode: settings.modeConteo };
    } catch (err) {
      log.error('Error in set-mode-conteo:', err);
      return { ok: false, error: String(err) };
    }
  });
}

module.exports = {
  init,
  registerIpc,
  getSettings,
  saveSettings,
  applyFallbackLanguageIfUnset,
  broadcastSettingsUpdated,
};
