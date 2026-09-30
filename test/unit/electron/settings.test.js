'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function loadFreshSettingsModule() {
  const modulePath = path.resolve(__dirname, '../../../electron/settings.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createSettingsHarness(initialStoredValue, { saveJsonStrictImpl = null } = {}) {
  let storedValue = initialStoredValue;
  const writes = [];

  return {
    loadJson(_filePath, fallbackValue) {
      return typeof storedValue === 'undefined' ? fallbackValue : storedValue;
    },
    saveJson(filePath, nextValue) {
      storedValue = nextValue;
      writes.push({ filePath, value: nextValue });
    },
    saveJsonStrict(filePath, nextValue) {
      if (typeof saveJsonStrictImpl === 'function') {
        return saveJsonStrictImpl(filePath, nextValue);
      }
      storedValue = nextValue;
      writes.push({ filePath, value: nextValue });
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
  };
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

test('language helpers normalize tags and derive safe bases', () => {
  const settings = loadFreshSettingsModule();

  assert.equal(settings.normalizeLangTag(' EN_us '), 'en-us');
  assert.equal(settings.normalizeLangBase('pt-BR'), 'pt');
  assert.equal(settings.normalizeLangBase({}), 'es');
  assert.equal(settings.getLangBase('es-CL'), 'es');
  assert.equal(settings.deriveLangKey('arn_CL'), 'arn');
});

test('init normalizes invalid stored settings and persists safe defaults', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness(null);

  const normalized = settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });

  assert.equal(normalized.language, '');
  assert.equal(normalized.modeConteo, 'preciso');
  assert.equal(normalized.spellcheckEnabled, true);
  assert.equal(normalized.previewSpoilerEnabled, true);
  assert.equal(normalized.editorFontSizePx, 20);
  assert.deepEqual(normalized.presets_by_language.es, []);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, 'snapshotTags'), false);
  assert.deepEqual(normalized.numberFormatting.es, {
    separadorMiles: '.',
    separadorDecimal: ',',
  });

  const writes = harness.getWrites();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].value, normalized);
});

test('fresh settings include an enabled preview Spoiler preference', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness();

  const normalized = settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });

  assert.equal(normalized.previewSpoilerEnabled, true);
  assert.equal(harness.getStoredValue().previewSpoilerEnabled, true);
});

test('saveSettings normalizes language-scoped buckets and trims selected preset names', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({});

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });

  const normalized = settings.saveSettings({
    language: ' EN_us ',
    presets_by_language: { en: 'bad-shape' },
    selected_preset_by_language: { en: '  my preset  ' },
    numberFormatting: null,
    disabled_default_presets: null,
    modeConteo: 'invalid-mode',
    spellcheckEnabled: 'invalid-flag',
    previewSpoilerEnabled: 'invalid-flag',
    editorFontSizePx: 200,
  });

  assert.equal(normalized.language, 'en-us');
  assert.equal(normalized.modeConteo, 'preciso');
  assert.equal(normalized.spellcheckEnabled, true);
  assert.equal(normalized.previewSpoilerEnabled, true);
  assert.equal(normalized.editorFontSizePx, 36);
  assert.deepEqual(normalized.presets_by_language.en, []);
  assert.equal(normalized.selected_preset_by_language.en, 'my preset');
  assert.deepEqual(normalized.numberFormatting.en, {
    separadorMiles: ',',
    separadorDecimal: '.',
  });
  assert.deepEqual(normalized.disabled_default_presets, {});
});

test('getSettings reloads from the backing store and re-normalizes external edits', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({ language: 'es' });

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });

  harness.setStoredValue({
    language: ' EN_us ',
    presets_by_language: {},
    selected_preset_by_language: {},
    disabled_default_presets: {},
    numberFormatting: {},
    modeConteo: 'simple',
    spellcheckEnabled: false,
    previewSpoilerEnabled: false,
    editorFontSizePx: 11,
  });

  const reloaded = settings.getSettings();
  assert.equal(reloaded.language, 'en-us');
  assert.equal(reloaded.modeConteo, 'simple');
  assert.equal(reloaded.spellcheckEnabled, false);
  assert.equal(reloaded.previewSpoilerEnabled, false);
  assert.equal(reloaded.editorFontSizePx, 12);
  assert.deepEqual(reloaded.numberFormatting.en, {
    separadorMiles: ',',
    separadorDecimal: '.',
  });
});

test('applyFallbackLanguageIfUnset persists a normalized fallback language', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: '',
    presets_by_language: {},
    selected_preset_by_language: {},
    disabled_default_presets: {},
    numberFormatting: {},
  });

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });

  settings.applyFallbackLanguageIfUnset('EN_us');

  assert.equal(settings.getSettings().language, 'en-us');

  const writes = harness.getWrites();
  assert.equal(writes.at(-1).value.language, 'en-us');
  assert.deepEqual(writes.at(-1).value.numberFormatting.en, {
    separadorMiles: ',',
    separadorDecimal: '.',
  });
});

test('registerIpc decorates get-settings and published payloads without mutating persisted settings', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: 'ar',
    presets_by_language: {},
    selected_preset_by_language: {},
    disabled_default_presets: {},
    numberFormatting: {},
    spellcheckEnabled: true,
  });
  const ipcMain = createIpcMainDouble();
  const sentPayloads = [];
  const onSettingsUpdatedCalls = [];

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });

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
  assert.equal(initialSettings.spellcheckEnabled, true);
  assert.equal(initialSettings.spellcheckAvailable, false);

  const currentLanguage = await ipcMain.invoke('get-current-language');
  assert.equal(currentLanguage, 'ar');

  const result = await ipcMain.invoke('set-spellcheck-enabled', false);
  assert.deepEqual(result, { ok: true, enabled: false });
  assert.equal(onSettingsUpdatedCalls.length, 1);
  assert.equal(onSettingsUpdatedCalls[0].spellcheckEnabled, false);
  assert.equal(Object.hasOwn(onSettingsUpdatedCalls[0], 'spellcheckAvailable'), false);
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0].channel, 'settings-updated');
  assert.equal(sentPayloads[0].payload.spellcheckEnabled, false);
  assert.equal(sentPayloads[0].payload.spellcheckAvailable, false);
  assert.equal(settings.getSettings().spellcheckEnabled, false);
  assert.equal(Object.hasOwn(settings.getSettings(), 'spellcheckAvailable'), false);
  assert.equal(typeof settings.publishCurrentSettings, 'function');

  settings.publishCurrentSettings();

  assert.equal(onSettingsUpdatedCalls.length, 2);
  assert.equal(sentPayloads.length, 2);
  assert.equal(sentPayloads[1].channel, 'settings-updated');
  assert.equal(sentPayloads[1].payload.spellcheckEnabled, false);
  assert.equal(sentPayloads[1].payload.spellcheckAvailable, false);

  const externallyProducedSettings = {
    language: 'ar',
    spellcheckEnabled: true,
  };
  settings.publishSettingsUpdated(externallyProducedSettings);

  assert.equal(onSettingsUpdatedCalls.length, 3);
  assert.equal(sentPayloads.length, 3);
  assert.equal(sentPayloads[2].payload.spellcheckAvailable, false);
  assert.equal(Object.hasOwn(externallyProducedSettings, 'spellcheckAvailable'), false);
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

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });
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

  settings.publishSettingsUpdated({ language: 'en', spellcheckEnabled: true });

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

  settings.publishSettingsUpdated({ language: 'en', spellcheckEnabled: true });

  assert.deepEqual(sentPayloads, []);
});

test('set-preview-spoiler-enabled strictly saves the main-window preference without broadcasting', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness();
  const ipcMain = createIpcMainDouble();
  const sentPayloads = [];

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });
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
    presets_by_language: {},
    selected_preset_by_language: {},
    disabled_default_presets: {},
    numberFormatting: {},
    spellcheckEnabled: true,
    editorFontSizePx: 20,
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

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });

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
    ipcMain.invoke('set-spellcheck-enabled', false),
    /disk full/i
  );

  assert.equal(onSettingsUpdatedCalls.length, 0);
  assert.equal(sentPayloads.length, 0);
  assert.equal(harness.getStoredValue().spellcheckEnabled, true);
  assert.equal(settings.getSettings().spellcheckEnabled, true);
});

test('Precise-counting fallback strictly persists Simple once, then publishes and notifies the main window', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: 'en',
    presets_by_language: {},
    selected_preset_by_language: {},
    disabled_default_presets: {},
    numberFormatting: {},
    modeConteo: 'preciso',
  });
  const ipcMain = createIpcMainDouble();
  const sent = [];

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });
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

  assert.deepEqual(first, { ok: true, changed: true, mode: 'simple' });
  assert.deepEqual(second, { ok: true, changed: false, mode: 'simple' });
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
    presets_by_language: {},
    selected_preset_by_language: {},
    disabled_default_presets: {},
    numberFormatting: {},
    modeConteo: 'preciso',
  });
  const ipcMain = createIpcMainDouble();

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });
  settings.configurePublication({
    getWindows: () => ({ mainWin: null }),
    decorateSettings: (nextSettings) => nextSettings,
  });
  settings.registerIpc(ipcMain);

  const result = await ipcMain.invoke('precise-counting-failed', {
    code: 'PRECISE_UNICODE_PROPERTIES_UNAVAILABLE',
    stage: 'unicode-properties',
  });

  assert.deepEqual(result, { ok: true, changed: true, mode: 'simple' });
  assert.equal(harness.getStoredValue().modeConteo, 'simple');
});

test('Precise-counting fallback does not publish or notify when strict persistence fails', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({ modeConteo: 'preciso' }, {
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  const sent = [];

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });
  settings.configurePublication({
    getWindows: () => ({
      mainWin: {
        isDestroyed: () => false,
        webContents: { send: (channel) => sent.push(channel) },
      },
    }),
    decorateSettings: (nextSettings) => nextSettings,
  });

  const result = settings.fallbackPreciseCountingToSimple({
    source: 'test',
    code: 'PRECISE_SEGMENTER_UNAVAILABLE',
    stage: 'availability',
  });

  assert.deepEqual(result, { ok: false, code: 'PERSIST_FAILED' });
  assert.equal(harness.getStoredValue().modeConteo, 'preciso');
  assert.deepEqual(sent, []);
});

test('Precise-counting fallback remains committed when settings or notice delivery fails', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({ modeConteo: 'preciso' });

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });
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

  assert.deepEqual(result, { ok: true, changed: true, mode: 'simple' });
  assert.equal(harness.getStoredValue().modeConteo, 'simple');
});

test('set-selected-preset rejects on strict save failure and keeps persisted selection unchanged', async () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({
    language: 'en',
    presets_by_language: {},
    selected_preset_by_language: { en: 'default' },
    disabled_default_presets: {},
    numberFormatting: {},
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    modeConteo: 'preciso',
  }, {
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  const ipcMain = createIpcMainDouble();

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    saveJsonStrict: harness.saveJsonStrict,
    settingsFile: 'C:\\fake\\settings.json',
  });
  settings.registerIpc(ipcMain);

  await assert.rejects(
    ipcMain.invoke('set-selected-preset', 'fast'),
    /disk full/i
  );

  assert.equal(harness.getStoredValue().selected_preset_by_language.en, 'default');
  assert.equal(settings.getSettings().selected_preset_by_language.en, 'default');
});
