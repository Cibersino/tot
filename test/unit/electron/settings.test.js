'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const Log = require('../../../electron/log');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

function loadFreshSettingsModule() {
  const modulePath = path.resolve(__dirname, '../../../electron/settings.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createSettingsHarness(initialStoredValue, {
  saveJsonStrictImpl = null,
  initialLoadResult = null,
  createJsonStrictImpl = null,
  createSettingsStartupBackupImpl = null,
  initialSaveJsonStrictImpl = null,
} = {}) {
  let storedValue = initialStoredValue;
  let initialPersistencePending = true;
  const writes = [];
  const createOptions = [];
  const backupCalls = [];

  return {
    loadJson(_filePath, fallbackValue) {
      return typeof storedValue === 'undefined' ? fallbackValue : storedValue;
    },
    saveJson(filePath, nextValue) {
      storedValue = nextValue;
      writes.push({ filePath, value: nextValue });
    },
    saveJsonStrict(filePath, nextValue) {
      if (initialPersistencePending) {
        initialPersistencePending = false;
        if (typeof initialSaveJsonStrictImpl === 'function') {
          return initialSaveJsonStrictImpl(filePath, nextValue);
        }
        storedValue = nextValue;
        writes.push({ filePath, value: nextValue });
        return undefined;
      }
      if (typeof saveJsonStrictImpl === 'function') {
        return saveJsonStrictImpl(filePath, nextValue);
      }
      storedValue = nextValue;
      writes.push({ filePath, value: nextValue });
    },
    loadJsonWithStatus(filePath, fallbackValue) {
      const result = typeof initialLoadResult === 'function'
        ? initialLoadResult(filePath)
        : initialLoadResult
        || (typeof storedValue === 'undefined'
          ? { status: 'missing', value: fallbackValue }
          : { status: 'loaded', value: storedValue });
      if (result.status !== 'loaded' || Buffer.isBuffer(result.rawBytes)) return result;
      return {
        ...result,
        rawBytes: Buffer.from(JSON.stringify(result.value), 'utf8'),
      };
    },
    createJsonStrict(filePath, nextValue, options) {
      initialPersistencePending = false;
      createOptions.push(options);
      if (typeof createJsonStrictImpl === 'function') {
        return createJsonStrictImpl(filePath, nextValue, options);
      }
      if (typeof storedValue !== 'undefined') {
        const error = new Error('settings file appeared after the initial read');
        error.code = 'EEXIST';
        throw error;
      }
      storedValue = nextValue;
      writes.push({ filePath, value: nextValue, created: true });
    },
    createSettingsStartupBackup(filePath, originalBytes) {
      backupCalls.push({ filePath, originalBytes });
      if (typeof createSettingsStartupBackupImpl === 'function') {
        return createSettingsStartupBackupImpl(filePath, originalBytes);
      }
      return `${filePath}.backup.1`;
    },
    getStoredValue() {
      return storedValue;
    },
    setStoredValue(nextValue) {
      storedValue = nextValue;
    },
    getWrites() {
      return writes.slice();
    },
    getCreateOptions() {
      return createOptions.slice();
    },
    getBackupCalls() {
      return backupCalls.slice();
    },
  };
}

function initializeSettings(settings, harness, extraDependencies = {}) {
  return settings.init({
    loadJsonWithStatus: harness.loadJsonWithStatus,
    saveJsonStrict: harness.saveJsonStrict,
    createJsonStrict: harness.createJsonStrict,
    createSettingsStartupBackup: harness.createSettingsStartupBackup,
    settingsFile: 'C:\\fake\\settings.json',
    ...extraDependencies,
  });
}

function createIpcMainDouble() {
  const handlers = new Map();
  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    async invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (typeof handler !== 'function') {
        throw new Error(`Missing IPC handler: ${channel}`);
      }
      return handler({}, ...args);
    },
  };
}

function captureWarnings(action) {
  const previousLevel = Log.getLevel();
  const originalWarn = console.warn;
  const warnings = [];
  Log.setLevel('warn');
  console.warn = (...args) => warnings.push(args);
  try {
    return { result: action(), warnings };
  } finally {
    console.warn = originalWarn;
    Log.setLevel(previousLevel);
  }
}

test('language helpers accept exact declared IDs and expose independent scopes', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({});

  initializeSettings(settings, harness);
  assert.equal(settings.getValidLanguageId('zh-Hans'), 'zh-Hans');
  assert.equal(settings.getValidLanguageId('zh-hans'), '');
  assert.equal(settings.getValidLanguageId('zh-Hans-CN'), '');
  assert.equal(settings.getPreferenceScope('zh-Hans'), 'zh-Hans');
  assert.equal(settings.getPreferenceScope('zh-Hant'), 'zh-Hant');
});

test('init rejects an invalid stored root before caching or persistence', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness(null);

  assert.throws(
    () => initializeSettings(settings, harness),
    { code: 'SETTINGS_STARTUP_ADMISSION_FAILED' }
  );
  assert.equal(harness.getStoredValue(), null);
  assert.deepEqual(harness.getWrites(), []);
  assert.deepEqual(harness.getBackupCalls(), []);
  assert.throws(() => settings.getSettings(), /called before init/);
});

test('startup admission rejects unreadable, empty, malformed, and incompatible existing settings without writes', () => {
  const cases = [
    { name: 'read failure', result: { status: 'failed', value: {} } },
    { name: 'empty', result: { status: 'empty' } },
    { name: 'malformed JSON', result: { status: 'failed', value: {} } },
    { name: 'array root', result: { status: 'loaded', value: [] } },
    { name: 'invalid presets map', result: { status: 'loaded', value: { presetsByScope: [] } } },
    { name: 'invalid inactive scope collection', result: { status: 'loaded', value: { presetsByScope: { es: [], en: {} } } } },
  ];

  for (const scenario of cases) {
    const settings = loadFreshSettingsModule();
    const originalValue = { preserved: scenario.name };
    const harness = createSettingsHarness(originalValue, { initialLoadResult: scenario.result });

    assert.throws(
      () => initializeSettings(settings, harness),
      { code: 'SETTINGS_STARTUP_ADMISSION_FAILED' },
      scenario.name
    );
    assert.equal(harness.getStoredValue(), originalValue, scenario.name);
    assert.deepEqual(harness.getWrites(), [], scenario.name);
    assert.deepEqual(harness.getBackupCalls(), [], scenario.name);
  }
});

test('startup admission leaves an actual malformed settings file byte-for-byte intact', (t) => {
  const tempDir = createTestTempDir('settings-startup-admission');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const settingsFile = path.join(tempDir, 'user_settings.json');
  const originalBytes = Buffer.from('\uFEFF{"presetsByScope":', 'utf8');
  fs.writeFileSync(settingsFile, originalBytes);

  const fsStorage = require('../../../electron/fs_storage');
  const settings = loadFreshSettingsModule();
  assert.throws(
    () => settings.init({
      loadJson: fsStorage.loadJson,
      loadJsonWithStatus: fsStorage.loadJsonWithStatus,
      saveJson: fsStorage.saveJson,
      saveJsonStrict: fsStorage.saveJsonStrict,
      createJsonStrict: fsStorage.createJsonStrict,
      createSettingsStartupBackup: fsStorage.createSettingsStartupBackup,
      settingsFile,
    }),
    { code: 'SETTINGS_STARTUP_ADMISSION_FAILED' }
  );
  assert.deepEqual(fs.readFileSync(settingsFile), originalBytes);
});

test('startup admission accepts all existing array scope collections, including inactive scopes', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: 'es',
    presetsByScope: {
      es: [],
      en: [{ name: 'saved in inactive scope' }],
    },
  });

  const normalized = initializeSettings(settings, harness);

  assert.equal(normalized.presetsByScope.en[0].name, 'saved in inactive scope');
  assert.equal(harness.getWrites().length, 1);
  assert.equal(harness.getBackupCalls().length, 1);
});

test('startup backup receives the exact bytes returned by the admitted initial read', () => {
  const settings = loadFreshSettingsModule();
  const originalBytes = Buffer.from('\uFEFF{\r\n  "language": "es",\r\n  "presetsByScope": {}\r\n}\r\n', 'utf8');
  const harness = createSettingsHarness(undefined, {
    initialLoadResult: {
      status: 'loaded',
      value: {
        language: 'es',
        presetsByScope: {},
      },
      rawBytes: originalBytes,
    },
  });

  initializeSettings(settings, harness);

  assert.deepEqual(harness.getBackupCalls(), [{
    filePath: 'C:\\fake\\settings.json',
    originalBytes,
  }]);
});

test('missing settings are created exclusively and an appearing file fails initial persistence', () => {
  const missingSettings = loadFreshSettingsModule();
  const missingHarness = createSettingsHarness();

  initializeSettings(missingSettings, missingHarness);
  assert.equal(missingHarness.getWrites().length, 1);
  assert.equal(missingHarness.getWrites()[0].created, true);
  assert.deepEqual(missingHarness.getCreateOptions(), [{ ensureParent: true }]);
  assert.deepEqual(missingHarness.getBackupCalls(), []);

  const racingSettings = loadFreshSettingsModule();
  const racingHarness = createSettingsHarness(undefined, {
    createJsonStrictImpl() {
      const error = new Error('settings file appeared');
      error.code = 'EEXIST';
      throw error;
    },
  });

  assert.throws(
    () => initializeSettings(racingSettings, racingHarness),
    (error) => error.code === 'SETTINGS_STARTUP_INITIAL_WRITE_FAILED' && error.cause.code === 'EEXIST'
  );
  assert.deepEqual(racingHarness.getWrites(), []);
});

test('an admitted existing settings file stops initialization when its required backup fails', () => {
  const settings = loadFreshSettingsModule();
  const originalValue = { language: 'es', presetsByScope: {} };
  const backupFailure = new Error('backup disk full');
  backupFailure.code = 'ENOSPC';
  const harness = createSettingsHarness(originalValue, {
    createSettingsStartupBackupImpl() {
      throw backupFailure;
    },
  });

  assert.throws(
    () => initializeSettings(settings, harness),
    (error) => error.code === 'SETTINGS_STARTUP_BACKUP_FAILED' && error.cause === backupFailure
  );
  assert.equal(harness.getBackupCalls().length, 1);
  assert.deepEqual(harness.getWrites(), []);
});

test('an admitted existing settings file fails startup when its initial strict write fails', () => {
  const settings = loadFreshSettingsModule();
  const originalValue = { language: 'es', presetsByScope: {} };
  const harness = createSettingsHarness(originalValue, {
    initialSaveJsonStrictImpl() {
      const error = new Error('disk full');
      error.code = 'ENOSPC';
      throw error;
    },
  });

  assert.throws(
    () => initializeSettings(settings, harness),
    (error) => error.code === 'SETTINGS_STARTUP_INITIAL_WRITE_FAILED' && error.cause.code === 'ENOSPC'
  );
  assert.equal(harness.getStoredValue(), originalValue);
  assert.deepEqual(harness.getWrites(), []);
});

test('init normalizes an admissible settings object and persists safe defaults', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({});

  const normalized = initializeSettings(settings, harness);

  assert.equal(normalized.language, '');
  assert.equal(normalized.modeConteo, 'preciso');
  assert.equal(normalized.previewSpoilerEnabled, true);
  assert.deepEqual(normalized.presetsByScope.es, []);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'snapshotTags'), false);
  assert.deepEqual(normalized.numberFormattingByScope.es, {
    separadorMiles: '.',
    separadorDecimal: ',',
  });

  const writes = harness.getWrites();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].value, normalized);
});

test('normalization keeps absent language-scoped preferences quiet and diagnoses destructive repairs', () => {
  const settings = loadFreshSettingsModule();
  const missingHarness = createSettingsHarness({ language: 'en' });
  const missingResult = captureWarnings(() => initializeSettings(settings, missingHarness));

  assert.deepEqual(missingResult.warnings, []);
  assert.deepEqual(missingResult.result.presetsByScope.en, []);

  const invalidStartupHarness = createSettingsHarness({
    language: 'en',
    presetsByScope: [],
  });
  assert.throws(
    () => initializeSettings(settings, invalidStartupHarness),
    { code: 'SETTINGS_STARTUP_ADMISSION_FAILED' }
  );
  assert.deepEqual(invalidStartupHarness.getWrites(), []);

  const invalidHarness = createSettingsHarness({
    language: 'en',
    presetsByScope: { en: [] },
    selectedPresetByScope: null,
    disabledDefaultPresetsByScope: 'invalid',
    numberFormattingByScope: false,
  });
  const invalidResult = captureWarnings(() => {
    const normalized = initializeSettings(settings, invalidHarness);
    return settings.saveSettingsStrict({
      ...normalized,
      presetsByScope: { en: {} },
      selectedPresetByScope: { en: 42 },
      numberFormattingByScope: {
        en: { separadorMiles: '.', separadorDecimal: ',' },
      },
    });
  });

  const warningMessages = invalidResult.warnings.map(([, message]) => message);
  assert.deepEqual(warningMessages, [
    'Invalid language-scoped settings map; resetting to empty object:',
    'Invalid language-scoped settings map; resetting to empty object:',
    'Invalid language-scoped settings map; resetting to empty object:',
    'Invalid presetsByScope entry; resetting to empty array:',
    'Invalid selectedPresetByScope entry; removing:',
  ]);
  assert.deepEqual(invalidResult.result.presetsByScope.en, []);
  assert.equal(Object.prototype.hasOwnProperty.call(invalidResult.result.selectedPresetByScope, 'en'), false);
});

test('a missing non-default root number format persists the default resource through the graph chain', (t) => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: 'en',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
  });
  const selectedRootPath = path.resolve(__dirname, '../../../i18n/en/numberFormat.json');
  const defaultRootPath = path.resolve(__dirname, '../../../i18n/es/numberFormat.json');
  const defaultNumberFormat = {
    thousands: '_',
    decimal: ':',
  };
  const expectedNumberFormatting = {
    separadorMiles: defaultNumberFormat.thousands,
    separadorDecimal: defaultNumberFormat.decimal,
  };
  const originalReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (filePath, ...args) => {
    const resolvedPath = path.resolve(String(filePath));
    if (resolvedPath === selectedRootPath) {
      const error = new Error('selected root number format unavailable');
      error.code = 'ENOENT';
      throw error;
    }
    if (resolvedPath === defaultRootPath) return JSON.stringify(defaultNumberFormat);
    return originalReadFileSync.call(fs, filePath, ...args);
  });

  const normalized = initializeSettings(settings, harness);

  assert.deepEqual(normalized.numberFormattingByScope.en, expectedNumberFormatting);
  assert.deepEqual(harness.getStoredValue().numberFormattingByScope.en, expectedNumberFormatting);
});

test('fresh settings include an enabled preview Spoiler preference', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness();

  const normalized = initializeSettings(settings, harness);

  assert.equal(normalized.previewSpoilerEnabled, true);
  assert.equal(harness.getStoredValue().previewSpoilerEnabled, true);
});

test('saveSettingsStrict normalizes language-scoped buckets and trims selected preset names', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({});

  initializeSettings(settings, harness);

  const normalized = settings.saveSettingsStrict({
    language: 'zh-Hans-CN',
    presetsByScope: { en: 'bad-shape' },
    selectedPresetByScope: { es: '  my preset  ' },
    numberFormattingByScope: null,
    disabledDefaultPresetsByScope: null,
    modeConteo: 'invalid-mode',
    previewSpoilerEnabled: 'invalid-flag',
  });

  assert.equal(normalized.language, '');
  assert.equal(normalized.modeConteo, 'preciso');
  assert.equal(normalized.previewSpoilerEnabled, true);
  assert.deepEqual(normalized.presetsByScope.es, []);
  assert.equal(normalized.selectedPresetByScope.es, 'my preset');
  assert.deepEqual(normalized.numberFormattingByScope.es, {
    separadorMiles: '.',
    separadorDecimal: ',',
  });
  assert.deepEqual(normalized.disabledDefaultPresetsByScope, {});
});

test('getSettings retains the admitted cache despite external backing-store edits', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({ language: 'es' });

  initializeSettings(settings, harness);

  harness.setStoredValue({
    language: 'zh-Hans-CN',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
    modeConteo: 'simple',
    previewSpoilerEnabled: false,
  });

  const cached = settings.getSettings();
  assert.equal(cached.language, 'es');
  assert.equal(cached.modeConteo, 'preciso');
  assert.equal(cached.previewSpoilerEnabled, true);
  assert.deepEqual(cached.numberFormattingByScope.es, {
    separadorMiles: '.',
    separadorDecimal: ',',
  });
  assert.equal(harness.getStoredValue().language, 'zh-Hans-CN');
  assert.equal(typeof settings.saveSettings, 'undefined');
});

test('applyFallbackLanguageIfUnset strictly persists a normalized fallback language', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: '',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
  });

  initializeSettings(settings, harness);

  settings.applyFallbackLanguageIfUnset('en');

  assert.equal(settings.getSettings().language, 'en');

  const writes = harness.getWrites();
  assert.equal(writes.at(-1).value.language, 'en');
  assert.deepEqual(writes.at(-1).value.numberFormattingByScope.en, {
    separadorMiles: ',',
    separadorDecimal: '.',
  });
});

test('applyFallbackLanguageIfUnset leaves the cached language unset when strict persistence fails', () => {
  const settings = loadFreshSettingsModule();
  const persistenceError = new Error('forced fallback-language persistence failure');
  const harness = createSettingsHarness({
    language: '',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
  }, {
    saveJsonStrictImpl() {
      throw persistenceError;
    },
  });

  initializeSettings(settings, harness);

  assert.throws(
    () => settings.applyFallbackLanguageIfUnset('en'),
    persistenceError
  );
  assert.equal(settings.getSettings().language, '');
  assert.equal(harness.getStoredValue().language, '');
});

test('registerIpc decorates get-settings and published payloads without mutating persisted settings', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: 'ar',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
  });
  const ipcMain = createIpcMainDouble();
  const sentPayloads = [];
  const onSettingsUpdatedCalls = [];

  initializeSettings(settings, harness);

  settings.configurePublication({
    getWindows: () => ({
      mainWin: {
        isDestroyed() {
          return false;
        },
        webContents: {
          send(channel, payload) {
            sentPayloads.push({ channel, payload });
          },
        },
      },
    }),
    onSettingsUpdated(nextSettings) {
      onSettingsUpdatedCalls.push(nextSettings);
    },
    decorateSettings(nextSettings) {
      return {
        ...nextSettings,
        spellcheckAvailable: false,
      };
    },
  });
  settings.registerIpc(ipcMain);

  const initialSettings = await ipcMain.invoke('get-settings');
  assert.equal(initialSettings.language, 'ar');
  assert.equal(initialSettings.spellcheckAvailable, false);

  const currentLanguage = await ipcMain.invoke('get-current-language');
  assert.equal(currentLanguage, 'ar');

  settings.publishCurrentSettings();
  assert.equal(onSettingsUpdatedCalls.length, 1);
  assert.equal(onSettingsUpdatedCalls[0].language, 'ar');
  assert.equal(Object.hasOwn(onSettingsUpdatedCalls[0], 'spellcheckAvailable'), false);
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0].channel, 'settings-updated');
  assert.equal(sentPayloads[0].payload.spellcheckAvailable, false);
  assert.equal(settings.getSettings().language, 'ar');
  assert.equal(Object.hasOwn(settings.getSettings(), 'spellcheckAvailable'), false);
  assert.equal(typeof settings.publishCurrentSettings, 'function');

  settings.publishCurrentSettings();

  assert.equal(onSettingsUpdatedCalls.length, 2);
  assert.equal(sentPayloads.length, 2);
  assert.equal(sentPayloads[1].channel, 'settings-updated');
  assert.equal(sentPayloads[1].payload.spellcheckAvailable, false);

  const externallyProducedSettings = {
    language: 'ar',
  };
  settings.publishSettingsUpdated(externallyProducedSettings);

  assert.equal(onSettingsUpdatedCalls.length, 3);
  assert.equal(sentPayloads.length, 3);
  assert.equal(sentPayloads[2].payload.spellcheckAvailable, false);
  assert.equal(Object.hasOwn(externallyProducedSettings, 'spellcheckAvailable'), false);
});

test('set-language defers only first-run menu installation to startup and retains runtime rebuilding', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: '',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
  });
  const ipcMain = createIpcMainDouble();
  const menuBuilds = [];
  const publishedLanguages = [];
  let startupLanguageResolved = false;

  initializeSettings(settings, harness);
  settings.configurePublication({
    getWindows: () => ({}),
    onSettingsUpdated(nextSettings) {
      publishedLanguages.push(nextSettings.language);
    },
    decorateSettings(nextSettings) {
      return nextSettings;
    },
  });
  settings.registerIpc(ipcMain, {
    buildAppMenu(language) {
      menuBuilds.push(language);
    },
    shouldRebuildAppMenu() {
      return startupLanguageResolved;
    },
  });

  const firstRunResult = await ipcMain.invoke('set-language', 'en');

  assert.deepEqual(firstRunResult, { ok: true, language: 'en' });
  assert.equal(harness.getStoredValue().language, 'en');
  assert.deepEqual(menuBuilds, []);
  assert.deepEqual(publishedLanguages, ['en']);

  startupLanguageResolved = true;
  const runtimeResult = await ipcMain.invoke('set-language', 'es');

  assert.deepEqual(runtimeResult, { ok: true, language: 'es' });
  assert.equal(harness.getStoredValue().language, 'es');
  assert.deepEqual(menuBuilds, ['es']);
  assert.deepEqual(publishedLanguages, ['en', 'es']);
});

test('publishSettingsUpdated includes calculator and reading-test window roles in the fixed target list', () => {
  const settings = loadFreshSettingsModule();
  const sentPayloads = [];

  settings.configurePublication({
    getWindows: () => ({
      textTimeCalculatorWin: {
        isDestroyed() {
          return false;
        },
        webContents: {
          send(channel, payload) {
            sentPayloads.push({ channel, payload });
          },
        },
      },
      readingTestQuestionsWin: {
        isDestroyed() {
          return false;
        },
        webContents: {
          send(channel, payload) {
            sentPayloads.push({ channel, payload });
          },
        },
      },
      readingTestResultWin: {
        isDestroyed() {
          return false;
        },
        webContents: {
          send(channel, payload) {
            sentPayloads.push({ channel, payload });
          },
        },
      },
    }),
    onSettingsUpdated() {},
    decorateSettings(nextSettings) {
      return nextSettings;
    },
  });
  settings.publishSettingsUpdated({ language: 'en' });

  assert.deepEqual(sentPayloads, [
    {
      channel: 'settings-updated',
      payload: { language: 'en' },
    },
    {
      channel: 'settings-updated',
      payload: { language: 'en' },
    },
    {
      channel: 'settings-updated',
      payload: { language: 'en' },
    },
  ]);
});

test('configurePublication requires the renderer settings decorator', () => {
  const settings = loadFreshSettingsModule();

  assert.throws(
    () => settings.configurePublication({ getWindows: () => ({}) }),
    /configurePublication requires decorateSettings/
  );
});

test('invalid renderer decoration drops live updates and rejects get-settings', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({ language: 'en' });
  const ipcMain = createIpcMainDouble();
  const sentPayloads = [];

  initializeSettings(settings, harness);
  settings.configurePublication({
    getWindows: () => ({
      mainWin: {
        isDestroyed() {
          return false;
        },
        webContents: {
          send(channel, payload) {
            sentPayloads.push({ channel, payload });
          },
        },
      },
    }),
    decorateSettings() {
      return null;
    },
  });
  settings.registerIpc(ipcMain);

  settings.publishSettingsUpdated({ language: 'en' });

  assert.deepEqual(sentPayloads, []);
  await assert.rejects(
    ipcMain.invoke('get-settings'),
    /renderer settings payload unavailable/
  );
});

test('throwing renderer decoration drops live updates', () => {
  const settings = loadFreshSettingsModule();
  const sentPayloads = [];

  settings.configurePublication({
    getWindows: () => ({
      mainWin: {
        isDestroyed() {
          return false;
        },
        webContents: {
          send(channel, payload) {
            sentPayloads.push({ channel, payload });
          },
        },
      },
    }),
    decorateSettings() {
      throw new Error('decorator failed');
    },
  });

  settings.publishSettingsUpdated({ language: 'en' });

  assert.deepEqual(sentPayloads, []);
});

test('set-preview-spoiler-enabled strictly saves the main-window preference without broadcasting', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness();
  const ipcMain = createIpcMainDouble();
  const sentPayloads = [];

  initializeSettings(settings, harness);
  settings.configurePublication({
    getWindows: () => ({
      mainWin: {
        isDestroyed() {
          return false;
        },
        webContents: {
          send(channel, payload) {
            sentPayloads.push({ channel, payload });
          },
        },
      },
    }),
    decorateSettings(nextSettings) {
      return nextSettings;
    },
  });
  settings.registerIpc(ipcMain);

  const result = await ipcMain.invoke('set-preview-spoiler-enabled', false);

  assert.deepEqual(result, { ok: true, enabled: false });
  assert.equal(settings.getSettings().previewSpoilerEnabled, false);
  assert.equal(harness.getStoredValue().previewSpoilerEnabled, false);
  assert.deepEqual(sentPayloads, []);

  const invalidResult = await ipcMain.invoke('set-preview-spoiler-enabled', 'false');
  assert.deepEqual(invalidResult, { ok: false, error: 'invalid' });
  assert.equal(harness.getStoredValue().previewSpoilerEnabled, false);
});

test('registerIpc does not publish settings-updated or mutate persisted settings when strict save fails', async () => {
  const settings = loadFreshSettingsModule();
  const initialStoredValue = {
    language: 'en',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
    modeConteo: 'preciso',
  };
  const harness = createSettingsHarness(initialStoredValue, {
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  const ipcMain = createIpcMainDouble();
  const sentPayloads = [];
  const onSettingsUpdatedCalls = [];

  initializeSettings(settings, harness);

  settings.configurePublication({
    getWindows: () => ({
      mainWin: {
        isDestroyed() {
          return false;
        },
        webContents: {
          send(channel, payload) {
            sentPayloads.push({ channel, payload });
          },
        },
      },
    }),
    onSettingsUpdated(nextSettings) {
      onSettingsUpdatedCalls.push(nextSettings);
    },
    decorateSettings(nextSettings) {
      return nextSettings;
    },
  });
  settings.registerIpc(ipcMain);

  await assert.rejects(
    ipcMain.invoke('set-mode-conteo', 'simple'),
    /disk full/i
  );

  assert.equal(onSettingsUpdatedCalls.length, 0);
  assert.equal(sentPayloads.length, 0);
  assert.equal(harness.getStoredValue().modeConteo, 'preciso');
  assert.equal(settings.getSettings().modeConteo, 'preciso');
});

test('Precise-counting fallback strictly persists Simple once, then publishes and notifies the main window', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: 'en',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
    modeConteo: 'preciso',
  });
  const ipcMain = createIpcMainDouble();
  const sent = [];

  initializeSettings(settings, harness);
  settings.configurePublication({
    getWindows: () => ({
      mainWin: {
        isDestroyed: () => false,
        webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
      },
    }),
    decorateSettings: (nextSettings) => nextSettings,
  });
  settings.registerIpc(ipcMain);

  const first = await ipcMain.invoke('precise-counting-failed', {
    code: 'PRECISE_SEGMENTER_UNAVAILABLE',
    stage: 'availability',
  });
  const second = await ipcMain.invoke('precise-counting-failed', {
    code: 'PRECISE_SEGMENTER_UNAVAILABLE',
    stage: 'availability',
  });

  assert.deepEqual(first, { ok: true, changed: true, mode: 'simple', persistenceFailed: false });
  assert.deepEqual(second, { ok: true, changed: false, mode: 'simple', persistenceFailed: false });
  assert.equal(harness.getStoredValue().modeConteo, 'simple');
  assert.deepEqual(sent.map(({ channel }) => channel), [
    'settings-updated',
    'precise-counting-fallback',
  ]);

  const invalid = await ipcMain.invoke('precise-counting-failed', {
    code: 'not-a-precise-failure',
    stage: 'availability',
  });
  assert.deepEqual(invalid, { ok: false, code: 'INVALID_PRECISE_FAILURE_REPORT' });
  assert.equal(harness.getStoredValue().modeConteo, 'simple');
});

test('Precise-counting fallback accepts a Unicode-property capability failure report', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: 'en',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
    modeConteo: 'preciso',
  });
  const ipcMain = createIpcMainDouble();

  initializeSettings(settings, harness);
  settings.configurePublication({
    getWindows: () => ({ mainWin: null }),
    decorateSettings: (nextSettings) => nextSettings,
  });
  settings.registerIpc(ipcMain);

  const result = await ipcMain.invoke('precise-counting-failed', {
    code: 'PRECISE_UNICODE_PROPERTIES_UNAVAILABLE',
    stage: 'unicode-properties',
  });

  assert.deepEqual(result, { ok: true, changed: true, mode: 'simple', persistenceFailed: false });
  assert.equal(harness.getStoredValue().modeConteo, 'simple');
});

test('Precise-counting fallback retains and publishes Simple mode when strict persistence fails', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({ modeConteo: 'preciso' }, {
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  const sent = [];

  initializeSettings(settings, harness);
  settings.configurePublication({
    getWindows: () => ({
      mainWin: {
        isDestroyed: () => false,
        webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
      },
    }),
    decorateSettings: (nextSettings) => nextSettings,
  });

  const result = settings.fallbackPreciseCountingToSimple({
    source: 'test',
    code: 'PRECISE_SEGMENTER_UNAVAILABLE',
    stage: 'availability',
  });

  assert.deepEqual(result, { ok: true, changed: true, mode: 'simple', persistenceFailed: true });
  assert.equal(harness.getStoredValue().modeConteo, 'preciso');
  assert.equal(settings.getSettings().modeConteo, 'simple');
  assert.deepEqual(sent, [
    { channel: 'settings-updated', payload: settings.getSettings() },
    { channel: 'precise-counting-fallback', payload: { persistenceFailed: true } },
  ]);
});

test('Precise-counting fallback remains committed when settings or notice delivery fails', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({ modeConteo: 'preciso' });

  initializeSettings(settings, harness);
  settings.configurePublication({
    getWindows: () => ({
      mainWin: {
        isDestroyed: () => false,
        webContents: {
          send() {
            throw new Error('window closing');
          },
        },
      },
    }),
    decorateSettings: (nextSettings) => nextSettings,
  });

  const result = settings.fallbackPreciseCountingToSimple({
    source: 'test',
    code: 'PRECISE_SEGMENTER_UNAVAILABLE',
    stage: 'availability',
  });

  assert.deepEqual(result, { ok: true, changed: true, mode: 'simple', persistenceFailed: false });
  assert.equal(harness.getStoredValue().modeConteo, 'simple');
});

test('set-selected-preset rejects on strict save failure and keeps persisted selection unchanged', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: 'en',
    presetsByScope: {},
    selectedPresetByScope: { en: 'default' },
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
    modeConteo: 'preciso',
  }, {
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  const ipcMain = createIpcMainDouble();

  initializeSettings(settings, harness);
  settings.registerIpc(ipcMain);

  await assert.rejects(
    ipcMain.invoke('set-selected-preset', 'fast'),
    /disk full/i
  );

  assert.equal(harness.getStoredValue().selectedPresetByScope.en, 'default');
  assert.equal(settings.getSettings().selectedPresetByScope.en, 'default');
});
