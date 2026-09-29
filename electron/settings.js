// electron/settings.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// This module owns persisted user settings.
//
// Responsibilities:
// - Load and normalize settings, refreshing the in-memory cache on reads and saves.
// - Canonicalize language tags and maintain language-scoped settings buckets.
// - Hydrate numberFormatting defaults when persisted data is missing or invalid.
// - Expose the state owner API consumed by main-process modules.
// - Register settings IPC handlers and publish settings-updated to open windows.
// - Attempt to persist a logged startup fallback language when the language picker closes without a selection.

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
// Defaults / validators
// =============================================================================
const createDefaultSettings = (language = '') => ({
  language,
  spellcheckEnabled: true,
  previewSpoilerEnabled: true,
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

function isNonArrayObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidNumberFormattingEntry(value) {
  return isNonArrayObject(value)
    && typeof value.separadorMiles === 'string'
    && !!value.separadorMiles
    && typeof value.separadorDecimal === 'string'
    && !!value.separadorDecimal;
}

// =============================================================================
// Shared state
// =============================================================================
// Dependencies injected from main.js (centralized file I/O).
let _loadJson = null;
let _saveJson = null;
let _saveJsonStrict = null;
let _settingsFile = null;
let publicationConfig = null;

// Last normalized settings kept in memory.
let _currentSettings = null;

const PRECISE_FAILURE_CODES = new Set([
  'PRECISE_SEGMENTER_UNAVAILABLE',
  'PRECISE_SEGMENTER_EXECUTION_FAILED',
]);
const PRECISE_FAILURE_STAGES = new Set([
  'availability',
  'grapheme-construction',
  'grapheme-segmentation',
  'word-construction',
  'word-segmentation',
]);

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

    const parsedNumberFormat = JSON.parse(raw);

    const thousands = typeof parsedNumberFormat.thousands === 'string'
      ? parsedNumberFormat.thousands
      : '';
    const decimal = typeof parsedNumberFormat.decimal === 'string'
      ? parsedNumberFormat.decimal
      : '';

    if (!thousands || !decimal) {
      log.warnOnce(
        `settings.loadNumberFormatDefaults.invalidSchema:${langCode}`,
        'numberFormat.json schema invalid (expected non-empty thousands/decimal strings):',
        {
          langCode,
          filePath,
          keys: parsedNumberFormat && typeof parsedNumberFormat === 'object'
            ? Object.keys(parsedNumberFormat)
            : [],
        }
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
 * Missing or invalid entries load separators from i18n, with safe defaults as the fallback.
 */
function ensureNumberFormattingForBase(settings, base) {
  if (!settings || typeof settings !== 'object') return;

  const langKey = deriveLangKey(base);
  const currentEntry = settings.numberFormatting[langKey];

  if (typeof currentEntry !== 'undefined') {
    if (isValidNumberFormattingEntry(currentEntry)) return;

    log.warnOnce(
      `settings.ensureNumberFormattingForBase.invalidEntry:${langKey}`,
      'Invalid numberFormatting entry; rebuilding from defaults:',
      {
        langKey,
        type: typeof currentEntry,
        isArray: Array.isArray(currentEntry),
        keys: isNonArrayObject(currentEntry) ? Object.keys(currentEntry) : [],
      }
    );
  }

  const numberFormatDefaults = loadNumberFormatDefaults(langKey);
  if (numberFormatDefaults && numberFormatDefaults.thousands && numberFormatDefaults.decimal) {
    settings.numberFormatting[langKey] = {
      separadorMiles: numberFormatDefaults.thousands,
      separadorDecimal: numberFormatDefaults.decimal,
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
 * - Rebuild a safe in-memory shape when the persisted file is missing or edited externally.
 * - Convert invalid shapes to safe defaults (and log once).
 * - Ensure language-dependent buckets exist for the current language base.
 */
function normalizeSettings(settings) {
  if (!isNonArrayObject(settings)) {
    log.warnOnce(
      'settings.normalizeSettings.invalidRoot',
      'Settings root is invalid; using empty object:',
      {
        type: typeof settings,
        isArray: Array.isArray(settings),
        isNull: settings === null,
      }
    );
    settings = {};
  }

  // language must be a string; empty string means "unset".
  if (typeof settings.language !== 'string') {
    log.warnOnce(
      'settings.normalizeSettings.invalidLanguage',
      'Invalid settings.language; forcing empty string:',
      { type: typeof settings.language }
    );
    settings.language = '';
  }

  // presets_by_language:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof settings.presets_by_language === 'undefined') {
    settings.presets_by_language = {};
  } else if (!isNonArrayObject(settings.presets_by_language)) {
    log.warnOnce(
      'settings.normalizeSettings.invalidPresetsByLanguage',
      'Invalid presets_by_language; resetting to empty object:',
      {
        type: typeof settings.presets_by_language,
        isArray: Array.isArray(settings.presets_by_language),
      }
    );
    settings.presets_by_language = {};
  }

  // selected_preset_by_language:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof settings.selected_preset_by_language === 'undefined') {
    settings.selected_preset_by_language = {};
  } else if (!isNonArrayObject(settings.selected_preset_by_language)) {
    log.warnOnce(
      'settings.normalizeSettings.invalidSelectedPresetByLanguage',
      'Invalid selected_preset_by_language; resetting to empty object:',
      {
        type: typeof settings.selected_preset_by_language,
        isArray: Array.isArray(settings.selected_preset_by_language),
      }
    );
    settings.selected_preset_by_language = {};
  }

  // numberFormatting must be a non-array object (may be missing/null/array/invalid types).
  if (typeof settings.numberFormatting === 'undefined') {
    settings.numberFormatting = {};
  } else if (!isNonArrayObject(settings.numberFormatting)) {
    log.warnOnce(
      'settings.normalizeSettings.invalidNumberFormatting',
      'Invalid numberFormatting; resetting to empty object:',
      {
        type: typeof settings.numberFormatting,
        isArray: Array.isArray(settings.numberFormatting),
      }
    );
    settings.numberFormatting = {};
  }

  // disabled_default_presets must be a non-array object (may be missing/null/array/invalid types).
  if (typeof settings.disabled_default_presets === 'undefined') {
    settings.disabled_default_presets = {};
  } else if (!isNonArrayObject(settings.disabled_default_presets)) {
    log.warnOnce(
      'settings.normalizeSettings.invalidDisabledDefaultPresets',
      'Invalid disabled_default_presets; resetting to empty object:',
      {
        type: typeof settings.disabled_default_presets,
        isArray: Array.isArray(settings.disabled_default_presets),
      }
    );
    settings.disabled_default_presets = {};
  }

  // modeConteo:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof settings.modeConteo === 'undefined') {
    settings.modeConteo = 'preciso';
  } else if (settings.modeConteo !== 'preciso' && settings.modeConteo !== 'simple') {
    log.warnOnce(
      'settings.normalizeSettings.invalidModeConteo',
      'Invalid modeConteo; forcing default:',
      { value: settings.modeConteo }
    );
    settings.modeConteo = 'preciso';
  }

  // spellcheckEnabled:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof settings.spellcheckEnabled === 'undefined') {
    settings.spellcheckEnabled = true;
  } else if (typeof settings.spellcheckEnabled !== 'boolean') {
    log.warnOnce(
      'settings.normalizeSettings.invalidSpellcheckEnabled',
      'Invalid spellcheckEnabled; forcing default:',
      { type: typeof settings.spellcheckEnabled }
    );
    settings.spellcheckEnabled = true;
  }

  // previewSpoilerEnabled:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof settings.previewSpoilerEnabled === 'undefined') {
    settings.previewSpoilerEnabled = true;
  } else if (typeof settings.previewSpoilerEnabled !== 'boolean') {
    log.warnOnce(
      'settings.normalizeSettings.invalidPreviewSpoilerEnabled',
      'Invalid previewSpoilerEnabled; forcing default:',
      { type: typeof settings.previewSpoilerEnabled }
    );
    settings.previewSpoilerEnabled = true;
  }

  // editorFontSizePx:
  // - missing -> default (silent)
  // - invalid/out of range -> warnOnce + normalized value
  if (typeof settings.editorFontSizePx === 'undefined') {
    settings.editorFontSizePx = EDITOR_FONT_SIZE_DEFAULT_PX;
  } else {
    const nextEditorFontSizePx = normalizeEditorFontSizePx(settings.editorFontSizePx);
    if (!Number.isFinite(Number(settings.editorFontSizePx))) {
      log.warnOnce(
        'settings.normalizeSettings.invalidEditorFontSizePx',
        'Invalid editorFontSizePx; forcing default:',
        { value: settings.editorFontSizePx }
      );
    } else if (nextEditorFontSizePx !== Math.round(Number(settings.editorFontSizePx))) {
      log.warnOnce(
        'settings.normalizeSettings.outOfRangeEditorFontSizePx',
        'Out-of-range editorFontSizePx; clamping:',
        {
          value: settings.editorFontSizePx,
          min: EDITOR_FONT_SIZE_MIN_PX,
          max: EDITOR_FONT_SIZE_MAX_PX,
        }
      );
    }
    settings.editorFontSizePx = nextEditorFontSizePx;
  }

  // Normalize language tag and compute its base (e.g., "en-US" -> "en").
  const langTag =
    settings.language && typeof settings.language === 'string' && settings.language.trim()
      ? normalizeLangTag(settings.language)
      : '';

  if (!langTag) {
    log.warnOnce(
      'settings.normalizeSettings.emptyLanguage',
      `settings.language is empty; language-dependent buckets will use fallback "${DEFAULT_LANG}" (NOTE: may be normal; a new profile has no language selection until the Language Window is completed).`
    );
  }

  const langBase = deriveLangKey(langTag);
  if (langTag) settings.language = langTag;

  // presets_by_language[langBase]:
  // - missing -> default (silent)
  // - present but invalid -> warnOnce + default
  if (typeof settings.presets_by_language[langBase] === 'undefined') {
    settings.presets_by_language[langBase] = [];
  } else if (!Array.isArray(settings.presets_by_language[langBase])) {
    log.warnOnce(
      'settings.normalizeSettings.invalidPresetsByLanguageEntry',
      'Invalid presets_by_language entry; forcing empty array:',
      {
        langBase,
        type: typeof settings.presets_by_language[langBase],
        isArray: Array.isArray(settings.presets_by_language[langBase]),
      }
    );
    settings.presets_by_language[langBase] = [];
  }

  const selectedPreset = settings.selected_preset_by_language[langBase];
  if (typeof selectedPreset !== 'undefined') {
    if (typeof selectedPreset !== 'string') {
      log.warnOnce(
        'settings.normalizeSettings.invalidSelectedPresetEntry',
        'Invalid selected_preset_by_language entry; removing:',
        { langBase, type: typeof selectedPreset }
      );
      delete settings.selected_preset_by_language[langBase];
    } else if (!selectedPreset.trim()) {
      delete settings.selected_preset_by_language[langBase];
    } else {
      settings.selected_preset_by_language[langBase] = selectedPreset.trim();
    }
  }

  // Ensure number formatting exists for the current base language.
  ensureNumberFormattingForBase(settings, langBase);

  return settings;
}

// =============================================================================
// Mutation helper
// =============================================================================
function cloneSettingsForMutation(settings) {
  const source = isNonArrayObject(settings) ? settings : createDefaultSettings();
  return {
    ...source,
    presets_by_language: isNonArrayObject(source.presets_by_language)
      ? { ...source.presets_by_language }
      : {},
    selected_preset_by_language: isNonArrayObject(source.selected_preset_by_language)
      ? { ...source.selected_preset_by_language }
      : {},
    numberFormatting: isNonArrayObject(source.numberFormatting)
      ? { ...source.numberFormatting }
      : {},
    disabled_default_presets: isNonArrayObject(source.disabled_default_presets)
      ? { ...source.disabled_default_presets }
      : {},
  };
}

// =============================================================================
// State API: init / getSettings / saveSettings / saveSettingsStrict
// =============================================================================
/**
 * Initializes the module (called from main.js).
 * - Stores injected dependencies and settings file path.
 * - Loads, normalizes, caches, and attempts to persist settings once on startup.
 */
function init({ loadJson, saveJson, saveJsonStrict, settingsFile }) {
  if (
    typeof loadJson !== 'function'
    || typeof saveJson !== 'function'
    || typeof saveJsonStrict !== 'function'
  ) {
    throw new Error('[settings] init requires loadJson, saveJson, and saveJsonStrict');
  }
  if (!settingsFile) {
    throw new Error('[settings] init requires settingsFile');
  }

  _loadJson = loadJson;
  _saveJson = saveJson;
  _saveJsonStrict = saveJsonStrict;
  _settingsFile = settingsFile;

  const rawSettings = _loadJson(_settingsFile, createDefaultSettings());

  const normalizedSettings = normalizeSettings(rawSettings);
  _currentSettings = normalizedSettings;

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

  const rawSettings = _loadJson(_settingsFile, createDefaultSettings());

  _currentSettings = normalizeSettings(rawSettings);
  return _currentSettings;
}

/**
 * Normalizes settings, updates the in-memory cache, and attempts best-effort persistence.
 * If nextSettings is falsy, it reloads from disk (getSettings()).
 */
function saveSettings(nextSettings) {
  if (!nextSettings) return getSettings();
  if (!_saveJson || !_settingsFile) {
    throw new Error('[settings] saveSettings called before init');
  }

  const normalizedSettings = normalizeSettings(cloneSettingsForMutation(nextSettings));
  _currentSettings = normalizedSettings;

  try {
    _saveJson(_settingsFile, normalizedSettings);
  } catch (err) {
    log.error(
      'saveSettings failed (not persisted):',
      _settingsFile,
      err
    );
  }

  return _currentSettings;
}

/**
 * Normalizes settings and requires persistence before updating the in-memory cache.
 * If nextSettings is falsy, it reloads from disk (getSettings()).
 */
function saveSettingsStrict(nextSettings) {
  if (!nextSettings) return getSettings();
  if (!_saveJsonStrict || !_settingsFile) {
    throw new Error('[settings] saveSettingsStrict called before init');
  }

  const normalizedSettings = normalizeSettings(cloneSettingsForMutation(nextSettings));
  _saveJsonStrict(_settingsFile, normalizedSettings);
  _currentSettings = normalizedSettings;
  return _currentSettings;
}

// =============================================================================
// Renderer settings publication
// =============================================================================
/**
 * Installs dependencies for the canonical settings publication path.
 * getWindows and decorateSettings are required; onSettingsUpdated is a best-effort main-process side effect.
 */
function configurePublication({ getWindows, onSettingsUpdated, decorateSettings } = {}) {
  if (typeof getWindows !== 'function') {
    throw new Error('[settings] configurePublication requires getWindows');
  }
  if (typeof decorateSettings !== 'function') {
    throw new Error('[settings] configurePublication requires decorateSettings');
  }

  publicationConfig = {
    getWindows,
    onSettingsUpdated,
    decorateSettings,
  };
}

function decorateSettingsPayload(settings) {
  const decorateSettings = publicationConfig && publicationConfig.decorateSettings;
  if (typeof decorateSettings !== 'function') {
    log.errorOnce(
      'settings.decorateSettings.unavailable',
      'Renderer settings decorator unavailable; settings payload dropped.'
    );
    return null;
  }

  try {
    const decoratedSettings = decorateSettings(settings);
    if (
      !decoratedSettings
      || typeof decoratedSettings !== 'object'
      || Array.isArray(decoratedSettings)
    ) {
      log.errorOnce(
        'settings.decorateSettings.invalid',
        'Renderer settings decorator returned an invalid payload; settings payload dropped.'
      );
      return null;
    }
    return decoratedSettings;
  } catch (err) {
    log.errorOnce(
      'settings.decorateSettings.failed',
      'Renderer settings decorator failed; settings payload dropped:',
      err
    );
    return null;
  }
}

function requireDecoratedSettingsPayload(settings) {
  const settingsPayload = decorateSettingsPayload(settings);
  if (!settingsPayload) {
    throw new Error('[settings] renderer settings payload unavailable');
  }
  return settingsPayload;
}

function resolvePublicationWindows() {
  const getWindows = publicationConfig && publicationConfig.getWindows;
  if (typeof getWindows !== 'function') {
    log.warnOnce(
      'settings.getWindows.unavailable',
      'getWindows unavailable; window-targeted updates skipped.'
    );
    return {};
  }

  try {
    const windows = getWindows();
    if (!windows || typeof windows !== 'object' || Array.isArray(windows)) {
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

function notifySettingsUpdated(settings) {
  const onSettingsUpdated = publicationConfig && publicationConfig.onSettingsUpdated;
  if (typeof onSettingsUpdated !== 'function') {
    log.warnOnce(
      'settings.onSettingsUpdated.unavailable',
      'onSettingsUpdated callback unavailable; settings callback publish skipped.'
    );
    return;
  }

  try {
    onSettingsUpdated(settings);
  } catch (err) {
    log.warn('onSettingsUpdated callback failed (ignored):', err);
  }
}

/**
 * Sends a prepared 'settings-updated' payload to open windows (best-effort).
 * This may fail during shutdown/races; failures are logged once and ignored.
 */
function sendSettingsUpdated(settingsPayload, windows) {
  if (!windows || typeof windows !== 'object' || Array.isArray(windows)) {
    log.warnOnce(
      'settings.broadcastSettingsUpdated.windows.invalid',
      'settings-updated broadcast failed (ignored): windows object unavailable.'
    );
    return;
  }
  const targets = [
    { win: windows.mainWin, name: 'mainWin' },
    { win: windows.editorWin, name: 'editorWin' },
    { win: windows.editorFindWin, name: 'editorFindWin' },
    { win: windows.presetWin, name: 'presetWin' },
    { win: windows.flotanteWin, name: 'flotanteWin' },
    { win: windows.taskEditorWin, name: 'taskEditorWin' },
    { win: windows.textTimeCalculatorWin, name: 'textTimeCalculatorWin' },
    { win: windows.readingTestQuestionsWin, name: 'readingTestQuestionsWin' },
    { win: windows.readingTestResultWin, name: 'readingTestResultWin' },
  ];

  targets.forEach(({ win, name }) => {
    try {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('settings-updated', settingsPayload);
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

/**
 * Runs the main-process update, then decorates and sends the renderer payload.
 * A decoration failure drops the window send.
 */
function publishSettingsUpdated(settings) {
  notifySettingsUpdated(settings);
  const settingsPayload = decorateSettingsPayload(settings);
  if (!settingsPayload) return;
  sendSettingsUpdated(settingsPayload, resolvePublicationWindows());
}

function publishCurrentSettings() {
  const settings = getSettings();
  publishSettingsUpdated(settings);
  return settings;
}

function saveAndPublishSettingsStrict(nextSettings) {
  const savedSettings = saveSettingsStrict(nextSettings);
  publishSettingsUpdated(savedSettings);
  return savedSettings;
}

function sendPreciseCountingFallbackNotice() {
  try {
    const windows = resolvePublicationWindows();
    const mainWin = windows && windows.mainWin;
    if (!mainWin || mainWin.isDestroyed()) {
      log.warn('Precise-counting fallback notice could not be delivered (ignored): main window unavailable.');
      return;
    }
    mainWin.webContents.send('precise-counting-fallback');
  } catch (err) {
    log.warn('Precise-counting fallback notice delivery failed (ignored):', err);
  }
}

function isValidPreciseCountingFailureReport(payload) {
  return !!payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && PRECISE_FAILURE_CODES.has(payload.code)
    && PRECISE_FAILURE_STAGES.has(payload.stage);
}

/**
 * Canonical, idempotent transition after genuine Precise counting fails.
 * Strict persistence is the commit boundary. Publication and notice delivery
 * happen only after that commit and are deliberately best effort.
 */
function fallbackPreciseCountingToSimple({ source, code, stage } = {}) {
  const details = { source, code, stage };
  let savedSettings;
  try {
    const settings = getSettings();
    if (settings.modeConteo === 'simple') {
      return { ok: true, changed: false, mode: 'simple' };
    }

    const nextSettings = cloneSettingsForMutation(settings);
    nextSettings.modeConteo = 'simple';
    savedSettings = saveSettingsStrict(nextSettings);
  } catch (err) {
    log.error('Precise-counting fallback persistence failed:', details, err);
    return { ok: false, code: 'PERSIST_FAILED' };
  }

  try {
    publishSettingsUpdated(savedSettings);
  } catch (err) {
    log.warn('Precise-counting fallback settings publication failed (ignored):', err);
  }
  try {
    log.warn('Precise counting failed; switched modeConteo to simple:', details);
  } catch {
    // Logging must not change the established fallback state.
  }
  sendPreciseCountingFallbackNotice();
  return { ok: true, changed: true, mode: savedSettings.modeConteo };
}

// =============================================================================
// Fallback language
// =============================================================================
/**
 * If the language modal closes without selecting anything, apply a fallback language.
 * Used by main.js startup flow when language resolution must continue.
 * This is intentionally not silent: it updates settings.language and attempts a best-effort save.
 */
function applyFallbackLanguageIfUnset(fallbackLang = DEFAULT_LANG) {
  try {
    let settings = getSettings();
    if (!settings.language) {
      const lang = normalizeLangTag(fallbackLang);
      settings.language = lang;

      log.warn(
        'BOOTSTRAP: language was unset; applying fallback language:',
        lang
      );
      saveSettings(settings);
    }
  } catch (err) {
    log.error('applyFallbackLanguageIfUnset failed:', err);
  }
}

// =============================================================================
// IPC registration / handlers
// =============================================================================
/**
 * Registers IPC handlers related to settings:
 * - get-settings
 * - get-current-language
 * - set-language
 * - set-mode-conteo
 * - set-selected-preset
 * - set-preview-spoiler-enabled
 * - set-spellcheck-enabled
 */
function registerIpc(ipcMain, { buildAppMenu } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[settings] registerIpc requires ipcMain');
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

  // get-settings: returns the decorated renderer payload; storage failures use safe defaults.
  ipcMain.handle('get-settings', async () => {
    let settings;
    try {
      settings = getSettings();
    } catch (err) {
      log.warn(
        'IPC get-settings failed (using safe fallback):',
        err
      );
      settings = normalizeSettings(createDefaultSettings(DEFAULT_LANG));
    }
    return requireDecoratedSettingsPayload(settings);
  });

  // get-current-language: returns only the persisted language needed by the language window
  ipcMain.handle('get-current-language', async () => {
    try {
      return getSettings().language;
    } catch (err) {
      log.error('IPC get-current-language failed:', err);
      throw err;
    }
  });

  // set-language: applies a nonempty selection, rebuilds the menu, updates secondary windows, broadcasts
  ipcMain.handle('set-language', async (_event, lang) => {
    try {
      const chosenRaw = String(lang || '');
      const chosen = normalizeLangTag(chosenRaw);
      if (!chosen) {
        log.warn(
          'set-language called with empty language; leaving persisted language unchanged.'
        );
      }

      let settings = getSettings();
      if (chosen) {
        const nextSettings = cloneSettingsForMutation(settings);
        nextSettings.language = chosen;
        settings = saveSettingsStrict(nextSettings);
      }

      const menuLang = settings.language || DEFAULT_LANG;

      const windows = resolvePublicationWindows();

      // Rebuild the app menu using the effective language (best-effort).
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
      const { editorWin, editorFindWin, presetWin, langWin, taskEditorWin, textTimeCalculatorWin } = windows;
      hideWindowMenu(editorWin, 'editorWin');
      hideWindowMenu(editorFindWin, 'editorFindWin');
      hideWindowMenu(presetWin, 'presetWin');
      hideWindowMenu(langWin, 'langWin');
      hideWindowMenu(taskEditorWin, 'taskEditorWin');
      hideWindowMenu(textTimeCalculatorWin, 'textTimeCalculatorWin');

      publishSettingsUpdated(settings);

      return { ok: true, language: chosen };
    } catch (err) {
      log.error('IPC set-language failed:', err);
      throw err;
    }
  });

  // set-mode-conteo: updates modeConteo and broadcasts
  ipcMain.handle('set-mode-conteo', async (_event, mode) => {
    try {
      const settings = getSettings();
      if (mode !== 'simple' && mode !== 'preciso') {
        log.warn(
          'set-mode-conteo called with invalid value; defaulting to "preciso":',
          { value: mode }
        );
      }
      const nextSettings = cloneSettingsForMutation(settings);
      nextSettings.modeConteo = mode === 'simple' ? 'simple' : 'preciso';
      const savedSettings = saveAndPublishSettingsStrict(nextSettings);

      return { ok: true, mode: savedSettings.modeConteo };
    } catch (err) {
      log.error('IPC set-mode-conteo failed:', err);
      throw err;
    }
  });

  ipcMain.handle('precise-counting-failed', async (_event, payload) => {
    if (!isValidPreciseCountingFailureReport(payload)) {
      log.warn('precise-counting-failed received invalid payload:', payload);
      return { ok: false, code: 'INVALID_PRECISE_FAILURE_REPORT' };
    }
    return fallbackPreciseCountingToSimple({
      source: 'renderer',
      code: payload.code,
      stage: payload.stage,
    });
  });

  // set-selected-preset: persists selection per language
  ipcMain.handle('set-selected-preset', async (_event, presetName) => {
    try {
      const name = typeof presetName === 'string' ? presetName.trim() : '';
      if (!name) {
        log.warn(
          'set-selected-preset called with empty/invalid preset name (ignored).'
        );
        return { ok: false, error: 'invalid' };
      }

      const settings = getSettings();
      const langTag = settings.language;
      if (!langTag) {
        log.warn(
          `settings.language is empty; using fallback "${DEFAULT_LANG}" langKey for preset selection.`
        );
      }
      const langKey = deriveLangKey(langTag);
      if (settings.selected_preset_by_language[langKey] === name) {
        return { ok: true, langKey, name };
      }
      const nextSettings = cloneSettingsForMutation(settings);
      nextSettings.selected_preset_by_language[langKey] = name;
      saveSettingsStrict(nextSettings);
      return { ok: true, langKey, name };
    } catch (err) {
      log.error('IPC set-selected-preset failed:', err);
      throw err;
    }
  });

  // set-preview-spoiler-enabled: persists the main-window preview preference
  ipcMain.handle('set-preview-spoiler-enabled', async (_event, enabled) => {
    try {
      if (typeof enabled !== 'boolean') {
        log.warn(
          'set-preview-spoiler-enabled called with non-boolean value (ignored).',
          { type: typeof enabled }
        );
        return { ok: false, error: 'invalid' };
      }

      const settings = getSettings();
      if (settings.previewSpoilerEnabled === enabled) {
        return { ok: true, enabled };
      }
      const nextSettings = cloneSettingsForMutation(settings);
      nextSettings.previewSpoilerEnabled = enabled;
      saveSettingsStrict(nextSettings);
      return { ok: true, enabled };
    } catch (err) {
      log.error('IPC set-preview-spoiler-enabled failed:', err);
      throw err;
    }
  });

  // set-spellcheck-enabled: persists spellcheck preference and broadcasts
  ipcMain.handle('set-spellcheck-enabled', async (_event, enabled) => {
    try {
      if (typeof enabled !== 'boolean') {
        log.warn(
          'set-spellcheck-enabled called with non-boolean value (ignored).',
          { type: typeof enabled }
        );
        return { ok: false, error: 'invalid' };
      }

      const settings = getSettings();
      if (settings.spellcheckEnabled === enabled) {
        return { ok: true, enabled };
      }
      const nextSettings = cloneSettingsForMutation(settings);
      nextSettings.spellcheckEnabled = enabled;
      const savedSettings = saveAndPublishSettingsStrict(nextSettings);

      return { ok: true, enabled: savedSettings.spellcheckEnabled };
    } catch (err) {
      log.error('IPC set-spellcheck-enabled failed:', err);
      throw err;
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
  normalizeEditorFontSizePx,
  init,
  registerIpc,
  getSettings,
  saveSettings,
  saveSettingsStrict,
  configurePublication,
  publishSettingsUpdated,
  publishCurrentSettings,
  fallbackPreciseCountingToSimple,
  applyFallbackLanguageIfUnset,
};

// =============================================================================
// End of electron/settings.js
// =============================================================================
