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

function createSettingsHarness(initialStoredValue) {
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
    settingsFile: 'C:\\fake\\settings.json',
  });

  assert.equal(normalized.language, '');
  assert.equal(normalized.modeConteo, 'preciso');
  assert.deepEqual(normalized.presets_by_language.es, []);
  assert.deepEqual(normalized.numberFormatting.es, {
    separadorMiles: '.',
    separadorDecimal: ',',
  });

  const writes = harness.getWrites();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].value, normalized);
});

test('saveSettings normalizes language-scoped buckets and trims selected preset names', () => {
  const settings = loadFreshSettingsModule();
  const harness = createSettingsHarness({});

  settings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    settingsFile: 'C:\\fake\\settings.json',
  });

  const normalized = settings.saveSettings({
    language: ' EN_us ',
    presets_by_language: { en: 'bad-shape' },
    selected_preset_by_language: { en: '  my preset  ' },
    numberFormatting: null,
    disabled_default_presets: null,
    modeConteo: 'invalid-mode',
  });

  assert.equal(normalized.language, 'en-us');
  assert.equal(normalized.modeConteo, 'preciso');
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
    settingsFile: 'C:\\fake\\settings.json',
  });

  harness.setStoredValue({
    language: ' EN_us ',
    presets_by_language: {},
    selected_preset_by_language: {},
    disabled_default_presets: {},
    numberFormatting: {},
    modeConteo: 'simple',
  });

  const reloaded = settings.getSettings();
  assert.equal(reloaded.language, 'en-us');
  assert.equal(reloaded.modeConteo, 'simple');
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
