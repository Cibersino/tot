// electron/settings.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// This module owns persisted user settings.
//
// Responsibilities:
// - Load settings from disk (via injected loadJson/saveJson) and normalize shape/types.
// - Keep language tags consistent (normalize language tag + base language).
// - Ensure numberFormatting[langBase] exists (from i18n/<lang>/numberFormat.json or safe defaults).
// - Provide a small state API (init/getSettings/saveSettings) backed by an in-memory cache.
// - Register IPC handlers (get-settings, set-language, set-mode-conteo, set-selected-preset,
//   set-spellcheck-enabled, set-editor-font-size-px)
//   and broadcast settings-updated.
// - Apply a logged fallback language when the language modal closes without a selection.
// =============================================================================

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const Log = require('./log');
const {
  DEFAULT_LANG,
  EDITOR_FONT_SIZE_MIN_PX,
  EDITOR_FONT_SIZE_MAX_PX,
  EDITOR_FONT_SIZE_DEFAULT_PX,
} = require('./constants_main');

const log = Log.get('settings');
log.debug('Settings starting...');

// =============================================================================
// Language helpers
// =============================================================================
// Language tags are normalized to lowercase and use '-' as separator (e.g., "en-US" -> "en-us").
// The "base" is the first part (e.g., "en-us" -> "en").
const normalizeLangTag = (lang) =>
  (lang || '').trim().toLowerCase().replace(/_/g, '-');

const normalizeLangBase = (lang) => {
  if (typeof lang !== 'string') return DEFAULT_LANG;
  const base = lang.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z0-9]+$/.test(base) ? base : DEFAULT_LANG;
};

const getLangBase = (lang) => {
  const tag = normalizeLangTag(lang);
  return normalizeLangBase(tag);
};

// Canonical key for language-indexed buckets (presets, numberFormatting, etc.).
const deriveLangKey = (langTag) => getLangBase(langTag);

// =============================================================================
// Settings defaults
// =============================================================================
const createDefaultSettings = (language = '') => ({
  language,
  spellcheckEnabled: true,
  editorFontSizePx: EDITOR_FONT_SIZE_DEFAULT_PX,
  presets_by_language: {},
  selected_preset_by_language: {},
  disabled_default_presets: {},
});

function normalizeEditorFontSizePx(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return EDITOR_FONT_SIZE_DEFAULT_PX;
  const rounded = Math.round(parsed);
  return Math.min(
    EDITOR_FONT_SIZE_MAX_PX,
    Math.max(EDITOR_FONT_SIZE_MIN_PX, rounded)
  );
}

function isPlainObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// =============================================================================
// Injected dependencies + cache
// =============================================================================
// Dependencies injected from main.js (centralized file I/O).
let _loadJson = null;
let _saveJson = null;
let _settingsFile = null;

// Last normalized settings kept in memory.
let _currentSettings = null;

// =============================================================================
// Number format defaults loader
// =============================================================================
/**
 * Reads i18n/<langBase>/numberFormat.json and returns separators.
 * Returns { thousands, decimal } or null if unavailable/invalid.
 */
function loadNumberFormatDefaults(lang) {
  const langCode = deriveLangKey(lang);
  const filePath = path.join(__dirname, '..', 'i18n', langCode, 'numberFormat.json');

  try {
    if (!fs.existsSync(filePath)) return null;

    let raw = fs.readFileSync(filePath, 'utf8');
    if (!raw) return null;

    // Some editors may add a UTF-8 BOM.
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
 * If missing, load separators from i18n; otherwise use safe defaults and log once.
 */
function ensureNumberFormattingForBase(settings, base) {
  if (!settings || typeof settings !== 'object') return;

  const langKey = deriveLangKey(base);

  if (settings.numberFormatting[langKey]) return;

  const nf = loadNumberFormatDefaults(langKey);
  if (nf && nf.thousands && nf.decimal) {
    settings.numberFormatting[langKey] = {
      separadorMiles: nf.thousands,
      separadorDecimal: nf.decimal,
    };
  } else {
    log.warnOnce(
      `settings.ensureNumberFormattingForBase.default:${langKey}`,
      'Using default number formatting (fallback):',
      langKey,
      { separadorMiles: '.', separadorDecimal: ',' }
    );
    settings.numberFormatting[langKey] = {
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
 *
 * Goals:
 * - Keep the persisted schema stable even if the file is missing/edited externally.
 * - Convert invalid shapes to safe defaults (and log once).
 * - Ensure language-dependent buckets exist for the current language base.
 */
function normalizeSettings(s) {
  if (!isPlainObjectRecord(s)) {
    log.warnOnce(
      'settings.normalizeSettings.invalidRoot',
      'Settings root is invalid; using empty object:',
      { type: typeof s, isArray: Array.isArray(s), isNull: s === null }
    );
    s = {};
  }

  // language must be a string; empty string means "unset".
  if (typeof s.language !== 'string') {
    log.warnOnce(
      'settings.normalizeSettings.invalidLanguage',
      'Invalid settings.language; forcing empty string:',
      { type: typeof s.language }
    );
    s.language = '';
  }

  // presets_by_language:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof s.presets_by_language === 'undefined') {
    s.presets_by_language = {};
  } else if (!isPlainObjectRecord(s.presets_by_language)) {
    log.warnOnce(
      'settings.normalizeSettings.invalidPresetsByLanguage',
      'Invalid presets_by_language; resetting to empty object:',
      { type: typeof s.presets_by_language, isArray: Array.isArray(s.presets_by_language) }
    );
    s.presets_by_language = {};
  }

  // selected_preset_by_language:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof s.selected_preset_by_language === 'undefined') {
    s.selected_preset_by_language = {};
  } else if (!isPlainObjectRecord(s.selected_preset_by_language)) {
    log.warnOnce(
      'settings.normalizeSettings.invalidSelectedPresetByLanguage',
      'Invalid selected_preset_by_language; resetting to empty object:',
      { type: typeof s.selected_preset_by_language, isArray: Array.isArray(s.selected_preset_by_language) }
    );
    s.selected_preset_by_language = {};
  }

  // numberFormatting must be a plain object (may be missing/null/array/invalid types).
  if (typeof s.numberFormatting === 'undefined') {
    s.numberFormatting = {};
  } else if (!isPlainObjectRecord(s.numberFormatting)) {
    log.warnOnce(
      'settings.normalizeSettings.invalidNumberFormatting',
      'Invalid numberFormatting; resetting to empty object:',
      { type: typeof s.numberFormatting, isArray: Array.isArray(s.numberFormatting) }
    );
    s.numberFormatting = {};
  }

  // disabled_default_presets must be a plain object (may be missing/null/array/invalid types).
  if (typeof s.disabled_default_presets === 'undefined') {
    s.disabled_default_presets = {};
  } else if (!isPlainObjectRecord(s.disabled_default_presets)) {
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

  // spellcheckEnabled:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof s.spellcheckEnabled === 'undefined') {
    s.spellcheckEnabled = true;
  } else if (typeof s.spellcheckEnabled !== 'boolean') {
    log.warnOnce(
      'settings.normalizeSettings.invalidSpellcheckEnabled',
      'Invalid spellcheckEnabled; forcing default:',
      { type: typeof s.spellcheckEnabled }
    );
    s.spellcheckEnabled = true;
  }

  // editorFontSizePx:
  // - missing -> default (silent)
  // - invalid/out of range -> warnOnce + normalized value
  if (typeof s.editorFontSizePx === 'undefined') {
    s.editorFontSizePx = EDITOR_FONT_SIZE_DEFAULT_PX;
  } else {
    const nextEditorFontSizePx = normalizeEditorFontSizePx(s.editorFontSizePx);
    if (!Number.isFinite(Number(s.editorFontSizePx))) {
      log.warnOnce(
        'settings.normalizeSettings.invalidEditorFontSizePx',
        'Invalid editorFontSizePx; forcing default:',
        { value: s.editorFontSizePx }
      );
    } else if (nextEditorFontSizePx !== Math.round(Number(s.editorFontSizePx))) {
      log.warnOnce(
        'settings.normalizeSettings.outOfRangeEditorFontSizePx',
        'Out-of-range editorFontSizePx; clamping:',
        {
          value: s.editorFontSizePx,
          min: EDITOR_FONT_SIZE_MIN_PX,
          max: EDITOR_FONT_SIZE_MAX_PX,
        }
      );
    }
    s.editorFontSizePx = nextEditorFontSizePx;
  }

  // Normalize language tag and compute its base (e.g., "en-US" -> "en").
  const langTag =
    s.language && typeof s.language === 'string' && s.language.trim()
      ? normalizeLangTag(s.language)
      : '';

  if (!langTag) {
    log.warnOnce(
      'settings.normalizeSettings.emptyLanguage',
      `settings.language is empty; language-dependent buckets will use fallback "${DEFAULT_LANG}" (may be normal on first run).`
    );
  }

  const langBase = deriveLangKey(langTag);
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

  const selectedPreset = s.selected_preset_by_language[langBase];
  if (typeof selectedPreset !== 'undefined') {
    if (typeof selectedPreset !== 'string') {
      log.warnOnce(
        'settings.normalizeSettings.invalidSelectedPresetEntry',
        'Invalid selected_preset_by_language entry; removing:',
        { langBase, type: typeof selectedPreset }
      );
      delete s.selected_preset_by_language[langBase];
    } else if (!selectedPreset.trim()) {
      delete s.selected_preset_by_language[langBase];
    } else {
      s.selected_preset_by_language[langBase] = selectedPreset.trim();
    }
  }

  // Ensure number formatting exists for the current base language.
  ensureNumberFormattingForBase(s, langBase);

  return s;
}

// =============================================================================
// State API: init / getSettings / saveSettings
// =============================================================================
/**
 * Initializes the module (called from main.js).
 * - Stores injected dependencies and settings file path.
 * - Loads, normalizes, caches, and persists settings once on startup.
 */
function init({ loadJson, saveJson, settingsFile }) {
  if (typeof loadJson !== 'function' || typeof saveJson !== 'function') {
    throw new Error('[settings] init requires loadJson and saveJson');
  }
  if (!settingsFile) {
    throw new Error('[settings] init requires settingsFile');
  }

  _loadJson = loadJson;
  _saveJson = saveJson;
  _settingsFile = settingsFile;

  const raw = _loadJson(_settingsFile, createDefaultSettings());

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
 * Reads the current settings from disk and returns a normalized object.
 * This reflects external edits to the settings file.
 */
function getSettings() {
  if (!_loadJson || !_settingsFile) {
    throw new Error('[settings] getSettings called before init');
  }

  const raw = _loadJson(_settingsFile, createDefaultSettings());

  _currentSettings = normalizeSettings(raw);
  return _currentSettings;
}

/**
 * Normalizes and persists settings, updating the in-memory cache.
 * If nextSettings is falsy, it reloads from disk (getSettings()).
 */
function saveSettings(nextSettings) {
  if (!nextSettings) return getSettings();
  if (!_saveJson || !_settingsFile) {
    throw new Error('[settings] saveSettings called before init');
  }

  const normalized = normalizeSettings(nextSettings);
  _currentSettings = normalized;

  try {
    _saveJson(_settingsFile, normalized);
  } catch (err) {
    log.errorOnce(
      'settings.saveSettings.persist',
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
 * Sends 'settings-updated' to open windows (best-effort).
 * This may fail during shutdown/races; failures are logged once and ignored.
 */
function broadcastSettingsUpdated(settings, windows) {
  if (!windows) return;
  const targets = [
    { win: windows.mainWin, name: 'mainWin' },
    { win: windows.editorWin, name: 'editorWin' },
    { win: windows.editorFindWin, name: 'editorFindWin' },
    { win: windows.presetWin, name: 'presetWin' },
    { win: windows.flotanteWin, name: 'flotanteWin' },
    { win: windows.taskEditorWin, name: 'taskEditorWin' },
  ];

  targets.forEach(({ win, name }) => {
    if (!win || win.isDestroyed()) return;
    try {
      win.webContents.send('settings-updated', settings);
    } catch (err) {
      log.warnOnce(
        `settings.broadcastSettingsUpdated.${name}`,
        'settings-updated notify failed (ignored):',
        name,
        err
      );
    }
  });
}

// =============================================================================
// Fallback language
// =============================================================================
/**
 * If the language modal closes without selecting anything, apply a fallback language.
 * This is intentionally not silent: it modifies settings.language and persists it.
 */
function applyFallbackLanguageIfUnset(fallbackLang = DEFAULT_LANG) {
  try {
    let settings = getSettings();
    if (!settings.language) {
      const lang = normalizeLangTag(fallbackLang);
      const base = deriveLangKey(lang);
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
 * Registers IPC handlers related to settings:
 * - get-settings
 * - set-language
 * - set-mode-conteo
 * - set-selected-preset
 * - set-spellcheck-enabled
 * - set-editor-font-size-px
 */
function registerIpc(
  ipcMain,
  {
    getWindows, // () => ({ mainWin, editorWin, editorFindWin, presetWin, langWin, flotanteWin })
    buildAppMenu, // function(lang)
    onSettingsUpdated, // function(settings)
  } = {}
) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[settings] registerIpc requires ipcMain');
  }

  function publishSettingsUpdated(settings, windows) {
    if (typeof onSettingsUpdated !== 'function') {
      log.warnOnce(
        'settings.onSettingsUpdated.unavailable',
        'onSettingsUpdated callback unavailable; settings callback publish skipped.'
      );
    } else {
      try {
        onSettingsUpdated(settings);
      } catch (err) {
        log.warn('onSettingsUpdated callback failed (ignored):', err);
      }
    }
    broadcastSettingsUpdated(settings, windows);
  }

  function resolveWindows() {
    if (typeof getWindows !== 'function') {
      log.warnOnce(
        'settings.getWindows.unavailable',
        'getWindows unavailable; window-targeted updates skipped.'
      );
      return {};
    }

    try {
      const windows = getWindows();
      if (!windows || typeof windows !== 'object') {
        log.warnOnce(
          'settings.getWindows.invalid',
          'getWindows returned no windows object; window-targeted updates skipped.'
        );
        return {};
      }
      return windows;
    } catch (err) {
      log.warnOnce(
        'settings.getWindows.failed',
        'getWindows failed (window-targeted updates skipped):',
        err
      );
      return {};
    }
  }

  function hideWindowMenu(win, name) {
    if (!win || win.isDestroyed()) return;
    try {
      win.setMenu(null);
      win.setMenuBarVisibility(false);
    } catch (err) {
      log.warn('hide window menu failed (ignored):', name, err);
    }
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
      return normalizeSettings(createDefaultSettings(DEFAULT_LANG));
    }
  });

  // set-language: saves language, rebuilds menu, updates secondary windows, broadcasts
  ipcMain.handle('set-language', async (_event, lang) => {
    try {
      const chosenRaw = String(lang || '');
      const chosen = normalizeLangTag(chosenRaw);
      if (!chosen) {
        log.warnOnce(
          'settings.set-language.invalid',
          `set-language called with empty/invalid language; falling back to "${DEFAULT_LANG}" for menu.`
        );
      }

      let settings = getSettings();
      if (chosen) {
        settings.language = chosen;
        settings = saveSettings(settings);
      }

      const menuLang = settings.language || DEFAULT_LANG;

      const windows = resolveWindows();

      // Rebuild the app menu using the new language (best-effort).
      if (typeof buildAppMenu !== 'function') {
        log.warn(
          'buildAppMenu unavailable; menu rebuild skipped.',
          { type: typeof buildAppMenu }
        );
      } else {
        try {
          buildAppMenu(menuLang);
        } catch (err) {
          log.warn('menu rebuild failed (ignored):', menuLang, err);
        }
      }

      // Hide the toolbar/menu in secondary windows (best-effort).
      const { editorWin, editorFindWin, presetWin, langWin, taskEditorWin } = windows;
      hideWindowMenu(editorWin, 'editorWin');
      hideWindowMenu(editorFindWin, 'editorFindWin');
      hideWindowMenu(presetWin, 'presetWin');
      hideWindowMenu(langWin, 'langWin');
      hideWindowMenu(taskEditorWin, 'taskEditorWin');

      publishSettingsUpdated(settings, windows);

      return { ok: true, language: chosen };
    } catch (err) {
      log.error('IPC set-language failed:', err);
      return { ok: false, error: String(err) };
    }
  });

  // set-mode-conteo: updates modeConteo and broadcasts
  ipcMain.handle('set-mode-conteo', async (_event, mode) => {
    try {
      let settings = getSettings();
      settings.modeConteo = mode === 'simple' ? 'simple' : 'preciso';
      settings = saveSettings(settings);

      const windows = resolveWindows();
      publishSettingsUpdated(settings, windows);

      return { ok: true, mode: settings.modeConteo };
    } catch (err) {
      log.error('IPC set-mode-conteo failed:', err);
      return { ok: false, error: String(err) };
    }
  });

  // set-selected-preset: persists selection per language
  ipcMain.handle('set-selected-preset', async (_event, presetName) => {
    try {
      const name = typeof presetName === 'string' ? presetName.trim() : '';
      if (!name) {
        log.warnOnce(
          'settings.set-selected-preset.invalid',
          'set-selected-preset called with empty/invalid preset name (ignored).'
        );
        return { ok: false, error: 'invalid' };
      }

      let settings = getSettings();
      const langTag = settings && typeof settings.language === 'string' ? settings.language : '';
      if (!langTag) {
        log.warnOnce(
          'settings.set-selected-preset.emptyLanguage',
          `settings.language is empty; using fallback "${DEFAULT_LANG}" langKey for preset selection.`
        );
      }
      const langKey = deriveLangKey(langTag);
      settings.selected_preset_by_language = settings.selected_preset_by_language || {};
      if (settings.selected_preset_by_language[langKey] === name) {
        return { ok: true, langKey, name };
      }
      settings.selected_preset_by_language[langKey] = name;
      settings = saveSettings(settings);
      return { ok: true, langKey, name };
    } catch (err) {
      log.error('IPC set-selected-preset failed:', err);
      return { ok: false, error: String(err) };
    }
  });

  // set-spellcheck-enabled: persists spellcheck preference and broadcasts
  ipcMain.handle('set-spellcheck-enabled', async (_event, enabled) => {
    try {
      if (typeof enabled !== 'boolean') {
        log.warnOnce(
          'settings.set-spellcheck-enabled.invalid',
          'set-spellcheck-enabled called with non-boolean value (ignored).',
          { type: typeof enabled }
        );
        return { ok: false, error: 'invalid' };
      }

      let settings = getSettings();
      if (settings.spellcheckEnabled === enabled) {
        return { ok: true, enabled };
      }
      settings.spellcheckEnabled = enabled;
      settings = saveSettings(settings);

      const windows = resolveWindows();
      publishSettingsUpdated(settings, windows);

      return { ok: true, enabled: settings.spellcheckEnabled };
    } catch (err) {
      log.error('IPC set-spellcheck-enabled failed:', err);
      return { ok: false, error: String(err) };
    }
  });

  // set-editor-font-size-px: persists manual-editor textarea font size and broadcasts
  ipcMain.handle('set-editor-font-size-px', async (_event, fontSizePx) => {
    try {
      const parsed = Number(fontSizePx);
      if (!Number.isFinite(parsed)) {
        log.warnOnce(
          'settings.set-editor-font-size-px.invalid',
          'set-editor-font-size-px called with non-finite value (ignored).',
          { value: fontSizePx }
        );
        return { ok: false, error: 'invalid' };
      }

      let settings = getSettings();
      const nextEditorFontSizePx = normalizeEditorFontSizePx(parsed);
      if (settings.editorFontSizePx === nextEditorFontSizePx) {
        return { ok: true, editorFontSizePx: nextEditorFontSizePx };
      }
      settings.editorFontSizePx = nextEditorFontSizePx;
      settings = saveSettings(settings);

      const windows = resolveWindows();
      publishSettingsUpdated(settings, windows);

      return { ok: true, editorFontSizePx: settings.editorFontSizePx };
    } catch (err) {
      log.error('IPC set-editor-font-size-px failed:', err);
      return { ok: false, error: String(err) };
    }
  });

}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  normalizeLangTag,
  normalizeLangBase,
  getLangBase,
  deriveLangKey,
  init,
  registerIpc,
  getSettings,
  saveSettings,
  applyFallbackLanguageIfUnset,
  broadcastSettingsUpdated,
};

// =============================================================================
// End of electron/settings.js
// =============================================================================
