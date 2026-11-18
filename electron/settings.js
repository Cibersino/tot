// electron/settings.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// This module owns persisted user settings.
//
// Responsibilities:
// - Load and normalize settings, refreshing the in-memory cache on reads and saves.
// - Validate catalog-declared application IDs and maintain explicit preference scopes.
// - Hydrate numberFormattingByScope defaults when persisted data is missing or invalid.
// - Expose the state owner API consumed by main-process modules.
// - Register settings IPC handlers and publish settings-updated to open windows.
// - Attempt to persist a logged startup fallback language when the language picker closes without a selection.

// =============================================================================
// Imports / logger
// =============================================================================
const Log = require('./log');
const {
  DEFAULT_LANG,
} = require('./constants_main');

const log = Log.get('settings');

// =============================================================================
// Language helpers
// =============================================================================
let languageResources = null;

function getLanguageDescriptor(languageId) {
  if (!languageResources) throw new Error('[settings] language resources unavailable');
  return languageResources.getDescriptor(languageId);
}

function getValidLanguageId(value) {
  if (typeof value !== 'string') return '';
  const languageId = value.trim();
  if (!languageId) return '';
  const descriptor = getLanguageDescriptor(languageId);
  return descriptor ? descriptor.id : '';
}

function getPreferenceScope(languageId = DEFAULT_LANG) {
  const descriptor = getLanguageDescriptor(languageId);
  if (!descriptor) throw new Error(`[settings] unsupported application language: ${String(languageId)}`);
  return descriptor.preferenceScopeId;
}

// =============================================================================
// Defaults / validators
// =============================================================================
const createDefaultSettings = (language = '') => ({
  language,
  previewSpoilerEnabled: true,
  presetsByScope: {},
  selectedPresetByScope: {},
  disabledDefaultPresetsByScope: {},
  numberFormattingByScope: {},
});

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

const PRECISE_FAILURE_CODES = new Set([
  'PRECISE_SEGMENTER_UNAVAILABLE',
  'PRECISE_UNICODE_PROPERTIES_UNAVAILABLE',
  'PRECISE_SEGMENTER_EXECUTION_FAILED',
]);
const PRECISE_FAILURE_STAGES = new Set([
  'availability',
  'unicode-properties',
  'grapheme-construction',
  'grapheme-segmentation',
  'word-construction',
  'word-segmentation',
]);

// =============================================================================
// Shared state
// =============================================================================
// Dependencies injected from main.js (centralized file I/O).
let loadJsonDependency = null;
let saveJsonDependency = null;
let saveJsonStrictDependency = null;
let settingsFilePath = null;
let publicationConfig = null;

// Last normalized settings kept in memory.
let currentSettings = null;

// =============================================================================
// Number format defaults loader
// =============================================================================
/**
 * Resolves a complete number format through the explicit graph chain.
 */
function loadNumberFormatDefaults(lang) {
  const graphApi = require('../public/js/lib/language_resource_graph');
  const graph = languageResources.getGraph();
  const selectedId = getValidLanguageId(lang) || DEFAULT_LANG;
  const candidates = graphApi.getCompleteResourceCandidates(graph, selectedId);
  for (const descriptor of candidates) {
    const filePath = require('path').join(__dirname, '..', 'i18n', descriptor.resourceDirectory, 'numberFormat.json');
    try {
      const parsedNumberFormat = JSON.parse(require('fs').readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
      const thousands = typeof parsedNumberFormat.thousands === 'string' ? parsedNumberFormat.thousands : '';
      const decimal = typeof parsedNumberFormat.decimal === 'string' ? parsedNumberFormat.decimal : '';
      if (!thousands || !decimal) throw new Error('invalid number format schema');
      return { thousands, decimal };
    } catch (error) {
      const details = { languageId: descriptor.id, resourceDirectory: descriptor.resourceDirectory, filePath };
      if (descriptor.id === DEFAULT_LANG) {
        log.errorOnce(`settings.loadNumberFormatDefaults.required:${descriptor.id}`, 'Required default numberFormat.json unavailable:', details, error);
      } else {
        log.warnOnce(`settings.loadNumberFormatDefaults.failed:${descriptor.id}`, 'numberFormat.json unavailable; continuing through declared graph chain:', details, error);
      }
    }
  }
  throw new Error(`[settings] required default number format unavailable: ${DEFAULT_LANG}`);
}

// =============================================================================
// Number formatting normalization helper
// =============================================================================
/**
 * Ensures settings.numberFormattingByScope[preferenceScopeId] exists.
 * Missing or invalid entries load a complete format through the declared graph chain.
 */
function ensureNumberFormattingForScope(settings, languageId) {
  if (!settings || typeof settings !== 'object') return;
  const effectiveLanguageId = languageId || DEFAULT_LANG;
  const preferenceScopeId = getPreferenceScope(effectiveLanguageId);
  const currentEntry = settings.numberFormattingByScope[preferenceScopeId];

  if (typeof currentEntry !== 'undefined') {
    if (isValidNumberFormattingEntry(currentEntry)) return;

    log.warnOnce(
      `settings.ensureNumberFormattingForScope.invalidEntry:${preferenceScopeId}`,
      'Invalid numberFormattingByScope entry; rebuilding from defaults:',
      {
        preferenceScopeId,
        type: typeof currentEntry,
        isArray: Array.isArray(currentEntry),
        keys: isNonArrayObject(currentEntry) ? Object.keys(currentEntry) : [],
      }
    );
  }

  const numberFormatDefaults = loadNumberFormatDefaults(effectiveLanguageId);
  settings.numberFormattingByScope[preferenceScopeId] = {
    separadorMiles: numberFormatDefaults.thousands,
    separadorDecimal: numberFormatDefaults.decimal,
  };
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
 * - Ensure language-dependent buckets exist for the current preference scope.
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

  ['presetsByScope', 'selectedPresetByScope', 'disabledDefaultPresetsByScope', 'numberFormattingByScope'].forEach((field) => {
    if (typeof settings[field] === 'undefined') {
      settings[field] = {};
      return;
    }
    if (!isNonArrayObject(settings[field])) {
      log.warnOnce(
        `settings.normalizeSettings.invalidScopeMap:${field}`,
        'Invalid language-scoped settings map; resetting to empty object:',
        {
          field,
          type: typeof settings[field],
          isArray: Array.isArray(settings[field]),
          isNull: settings[field] === null,
        }
      );
      settings[field] = {};
    }
  });

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

  const languageId = getValidLanguageId(settings.language);
  if (settings.language && !languageId) {
    log.warnOnce('settings.normalizeSettings.undeclaredLanguage', 'Discarded undeclared application language ID:', settings.language);
  }
  settings.language = languageId;
  const effectiveLanguageId = languageId || DEFAULT_LANG;
  const preferenceScopeId = getPreferenceScope(effectiveLanguageId);
  if (typeof settings.presetsByScope[preferenceScopeId] === 'undefined') {
    settings.presetsByScope[preferenceScopeId] = [];
  } else if (!Array.isArray(settings.presetsByScope[preferenceScopeId])) {
    log.warnOnce(
      `settings.normalizeSettings.invalidPresetsByScopeEntry:${preferenceScopeId}`,
      'Invalid presetsByScope entry; resetting to empty array:',
      {
        preferenceScopeId,
        type: typeof settings.presetsByScope[preferenceScopeId],
        isArray: Array.isArray(settings.presetsByScope[preferenceScopeId]),
      }
    );
    settings.presetsByScope[preferenceScopeId] = [];
  }
  const selectedPreset = settings.selectedPresetByScope[preferenceScopeId];
  if (typeof selectedPreset !== 'undefined') {
    if (typeof selectedPreset !== 'string') {
      log.warnOnce(
        `settings.normalizeSettings.invalidSelectedPresetByScopeEntry:${preferenceScopeId}`,
        'Invalid selectedPresetByScope entry; removing:',
        { preferenceScopeId, type: typeof selectedPreset }
      );
      delete settings.selectedPresetByScope[preferenceScopeId];
    } else if (!selectedPreset.trim()) {
      delete settings.selectedPresetByScope[preferenceScopeId];
    } else {
      settings.selectedPresetByScope[preferenceScopeId] = selectedPreset.trim();
    }
  }
  ensureNumberFormattingForScope(settings, effectiveLanguageId);

  return settings;
}

// =============================================================================
// Mutation helper
// =============================================================================
function cloneSettingsForMutation(settings) {
  const source = isNonArrayObject(settings) ? settings : createDefaultSettings();
  return {
    ...source,
    presetsByScope: isNonArrayObject(source.presetsByScope)
      ? { ...source.presetsByScope }
      : {},
    selectedPresetByScope: isNonArrayObject(source.selectedPresetByScope)
      ? { ...source.selectedPresetByScope }
      : {},
    numberFormattingByScope: isNonArrayObject(source.numberFormattingByScope)
      ? { ...source.numberFormattingByScope }
      : {},
    disabledDefaultPresetsByScope: isNonArrayObject(source.disabledDefaultPresetsByScope)
      ? { ...source.disabledDefaultPresetsByScope }
      : {},
  };
}

function createStartupInitializationError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function getStartupAdmissionError(initialLoad) {
  if (initialLoad.status === 'missing') return null;

  if (initialLoad.status !== 'loaded') {
    return createStartupInitializationError(
      'SETTINGS_STARTUP_ADMISSION_FAILED',
      `[settings] startup settings file is ${initialLoad.status}`,
      initialLoad.error || null
    );
  }

  const settings = initialLoad.value;
  if (!isNonArrayObject(settings)) {
    return createStartupInitializationError(
      'SETTINGS_STARTUP_ADMISSION_FAILED',
      '[settings] startup settings root must be a non-array object'
    );
  }
  if (!Object.prototype.hasOwnProperty.call(settings, 'presetsByScope')) return null;
  if (!isNonArrayObject(settings.presetsByScope)) {
    return createStartupInitializationError(
      'SETTINGS_STARTUP_ADMISSION_FAILED',
      '[settings] startup presetsByScope must be a non-array object when present'
    );
  }
  for (const [preferenceScopeId, presets] of Object.entries(settings.presetsByScope)) {
    if (!Array.isArray(presets)) {
      return createStartupInitializationError(
        'SETTINGS_STARTUP_ADMISSION_FAILED',
        `[settings] startup presetsByScope entry must be an array: ${preferenceScopeId}`
      );
    }
  }
  return null;
}

// =============================================================================
// State API: init / getSettings / saveSettings / saveSettingsStrict
// =============================================================================
/**
 * Initializes the module (called from main.js).
 * - Stores injected dependencies and settings file path.
 * - Loads, normalizes, caches, and attempts to persist settings once on startup.
 */
function init({
  loadJson,
  loadJsonWithStatus,
  saveJson,
  saveJsonStrict,
  createJsonStrict,
  createSettingsStartupBackup,
  settingsFile,
  languageResources: injectedLanguageResources,
} = {}) {
  if (
    typeof loadJson !== 'function'
    || typeof loadJsonWithStatus !== 'function'
    || typeof saveJson !== 'function'
    || typeof saveJsonStrict !== 'function'
    || typeof createJsonStrict !== 'function'
    || typeof createSettingsStartupBackup !== 'function'
  ) {
    throw new Error('[settings] init requires startup admission and persistence dependencies');
  }
  if (!settingsFile) {
    throw new Error('[settings] init requires settingsFile');
  }
  const resolvedLanguageResources = injectedLanguageResources || require('./language_resources');
  if (!resolvedLanguageResources || typeof resolvedLanguageResources.getDescriptor !== 'function' || typeof resolvedLanguageResources.getGraph !== 'function') {
    throw new Error('[settings] init requires initialized languageResources');
  }

  const initialLoad = loadJsonWithStatus(
    settingsFile,
    createDefaultSettings(),
    { includeRawBytes: true }
  );
  const admissionError = getStartupAdmissionError(initialLoad);
  if (admissionError) throw admissionError;

  const rawSettings = initialLoad.value;

  if (initialLoad.status === 'loaded') {
    try {
      createSettingsStartupBackup(settingsFile, initialLoad.rawBytes);
    } catch (error) {
      throw createStartupInitializationError(
        'SETTINGS_STARTUP_BACKUP_FAILED',
        '[settings] startup settings backup failed',
        error
      );
    }
  }

  languageResources = resolvedLanguageResources;
  const normalizedSettings = normalizeSettings(rawSettings);
  try {
    if (initialLoad.status === 'missing') {
      createJsonStrict(settingsFile, normalizedSettings, { ensureParent: true });
    } else {
      saveJsonStrict(settingsFile, normalizedSettings);
    }
  } catch (error) {
    throw createStartupInitializationError(
      'SETTINGS_STARTUP_INITIAL_WRITE_FAILED',
      '[settings] startup settings persistence failed',
      error
    );
  }

  loadJsonDependency = loadJson;
  saveJsonDependency = saveJson;
  saveJsonStrictDependency = saveJsonStrict;
  settingsFilePath = settingsFile;
  currentSettings = normalizedSettings;
  return currentSettings;
}

/**
 * Reads the current settings from disk and returns a normalized object.
 * This reflects external edits to the settings file.
 */
function getSettings() {
  if (!loadJsonDependency || !settingsFilePath) {
    throw new Error('[settings] getSettings called before init');
  }

  const rawSettings = loadJsonDependency(settingsFilePath, createDefaultSettings());

  currentSettings = normalizeSettings(rawSettings);
  return currentSettings;
}

/**
 * Normalizes settings, updates the in-memory cache, and attempts best-effort persistence.
 * If nextSettings is falsy, it reloads from disk (getSettings()).
 */
function saveSettings(nextSettings) {
  if (!nextSettings) return getSettings();
  if (!saveJsonDependency || !settingsFilePath) {
    throw new Error('[settings] saveSettings called before init');
  }

  const normalizedSettings = normalizeSettings(cloneSettingsForMutation(nextSettings));
  currentSettings = normalizedSettings;

  try {
    saveJsonDependency(settingsFilePath, normalizedSettings);
  } catch (error) {
    log.error(
      'saveSettings failed (not persisted):',
      settingsFilePath,
      error
    );
  }

  return currentSettings;
}

/**
 * Normalizes settings and requires persistence before updating the in-memory cache.
 * If nextSettings is falsy, it reloads from disk (getSettings()).
 */
function saveSettingsStrict(nextSettings) {
  if (!nextSettings) return getSettings();
  if (!saveJsonStrictDependency || !settingsFilePath) {
    throw new Error('[settings] saveSettingsStrict called before init');
  }

  const normalizedSettings = normalizeSettings(cloneSettingsForMutation(nextSettings));
  saveJsonStrictDependency(settingsFilePath, normalizedSettings);
  currentSettings = normalizedSettings;
  return currentSettings;
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
  } catch (error) {
    log.errorOnce(
      'settings.decorateSettings.failed',
      'Renderer settings decorator failed; settings payload dropped:',
      error
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
  } catch (error) {
    log.warnOnce(
      'settings.getWindows.failed',
      'getWindows failed (window-targeted updates skipped):',
      error
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
  } catch (error) {
    log.warn('onSettingsUpdated callback failed (ignored):', error);
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
    } catch (error) {
      log.warnOnce(
        `settings.broadcastSettingsUpdated.${name}`,
        'settings-updated notify failed (ignored):',
        name,
        error
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
  } catch (error) {
    log.warn('Precise-counting fallback notice delivery failed (ignored):', error);
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
  } catch (error) {
    log.error('Precise-counting fallback persistence failed:', details, error);
    return { ok: false, code: 'PERSIST_FAILED' };
  }

  try {
    publishSettingsUpdated(savedSettings);
  } catch (error) {
    log.warn('Precise-counting fallback settings publication failed (ignored):', error);
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
 * The initial fallback must be persisted before startup can continue.
 */
function applyFallbackLanguageIfUnset(fallbackLang = DEFAULT_LANG) {
  const settings = getSettings();
  if (settings.language) return settings;

  const languageId = getValidLanguageId(fallbackLang);
  if (!languageId) throw new Error(`[settings] fallback language is not declared: ${String(fallbackLang)}`);

  const nextSettings = cloneSettingsForMutation(settings);
  nextSettings.language = languageId;
  log.warn(
    'BOOTSTRAP: language was unset; applying fallback language:',
    languageId
  );
  return saveSettingsStrict(nextSettings);
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
 */
function registerIpc(ipcMain, { buildAppMenu, shouldRebuildAppMenu } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[settings] registerIpc requires ipcMain');
  }

  function hideWindowMenu(win, name) {
    if (!win || win.isDestroyed()) return;
    try {
      win.setMenu(null);
      win.setMenuBarVisibility(false);
    } catch (error) {
      log.warn('hide window menu failed (ignored):', name, error);
    }
  }

  // get-settings: returns the decorated renderer payload; storage failures use safe defaults.
  ipcMain.handle('get-settings', async () => {
    let settings;
    try {
      settings = getSettings();
    } catch (error) {
      log.warn(
        'IPC get-settings failed (using safe fallback):',
        error
      );
      settings = normalizeSettings(createDefaultSettings(DEFAULT_LANG));
    }
    return requireDecoratedSettingsPayload(settings);
  });

  // get-current-language: returns only the persisted language needed by the language window
  ipcMain.handle('get-current-language', async () => {
    try {
      return getSettings().language;
    } catch (error) {
      log.error('IPC get-current-language failed:', error);
      throw error;
    }
  });

  // set-language: applies a nonempty selection, rebuilds the menu when runtime owns it, updates secondary windows, broadcasts
  ipcMain.handle('set-language', async (_event, lang) => {
    try {
      const chosenRaw = typeof lang === 'string' ? lang : '';
      const chosen = getValidLanguageId(chosenRaw);
      if (!chosen) {
        log.warn('set-language rejected undeclared application language:', { language: chosenRaw });
        return { ok: false, code: 'UNSUPPORTED_LANGUAGE' };
      }

      let settings = getSettings();
      const nextSettings = cloneSettingsForMutation(settings);
      nextSettings.language = chosen;
      settings = saveSettingsStrict(nextSettings);

      const windows = resolvePublicationWindows();

      // The first-run picker persists the selection before startup owns its one
      // initial menu installation. Later user-initiated changes rebuild here.
      const rebuildAppMenu = typeof shouldRebuildAppMenu !== 'function'
        || shouldRebuildAppMenu() !== false;
      if (rebuildAppMenu) {
        const menuLang = settings.language || DEFAULT_LANG;
        if (typeof buildAppMenu !== 'function') {
          log.warn(
            'buildAppMenu unavailable; menu rebuild skipped.',
            { type: typeof buildAppMenu }
          );
        } else {
          try {
            buildAppMenu(menuLang);
          } catch (error) {
            log.warn('menu rebuild failed (ignored):', menuLang, error);
          }
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

      return { ok: true, language: settings.language };
    } catch (error) {
      log.error('IPC set-language failed:', error);
      throw error;
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
    } catch (error) {
      log.error('IPC set-mode-conteo failed:', error);
      throw error;
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
      const preferenceScopeId = getPreferenceScope(settings.language || DEFAULT_LANG);
      if (settings.selectedPresetByScope[preferenceScopeId] === name) {
        return { ok: true, preferenceScopeId, name };
      }
      const nextSettings = cloneSettingsForMutation(settings);
      nextSettings.selectedPresetByScope[preferenceScopeId] = name;
      saveSettingsStrict(nextSettings);
      return { ok: true, preferenceScopeId, name };
    } catch (error) {
      log.error('IPC set-selected-preset failed:', error);
      throw error;
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
    } catch (error) {
      log.error('IPC set-preview-spoiler-enabled failed:', error);
      throw error;
    }
  });

}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  getLanguageDescriptor,
  getPreferenceScope,
  getValidLanguageId,
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
