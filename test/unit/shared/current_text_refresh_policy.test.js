'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createControllerHarness() {
  const calls = [];
  const sandbox = {
    window: {
      RendererI18n: {
        getLangBase(language) {
          return String(language || '').split(/[-_]/)[0] || 'es';
        },
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/current_text_refresh_policy.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/current_text_refresh_policy.js' });

  const controller = sandbox.window.CurrentTextRefreshPolicy.createController({
    requestFullRefresh(reason) {
      calls.push({ kind: 'full', reason });
    },
    requestStatsDisplayRefresh(reason) {
      calls.push({ kind: 'stats_display', reason });
    },
    requestTimeOnlyRefresh(reason) {
      calls.push({ kind: 'time_only', reason });
    },
  });

  return {
    calls,
    controller,
  };
}

function createSettings({ language = 'es', thousands = '.', decimal = ',' } = {}) {
  return {
    language,
    numberFormatting: {
      es: { separadorMiles: thousands, separadorDecimal: decimal },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
    spellcheckEnabled: true,
    editorFontSizePx: 20,
    presets_by_language: {},
    selected_preset_by_language: {},
  };
}

test('settings change classifier routes simple-language refreshes to stats_display', () => {
  const harness = createControllerHarness();

  const kind = harness.controller.dispatchSettingsChange({
    previousSettings: createSettings({ language: 'es' }),
    nextSettings: createSettings({ language: 'en' }),
    previousCountContext: { modoConteo: 'simple', idioma: 'es' },
    nextCountContext: { modoConteo: 'simple', idioma: 'en' },
    reason: 'settings change',
  });

  assert.equal(kind, 'stats_display');
  assert.deepEqual(harness.calls, [{ kind: 'stats_display', reason: 'settings change' }]);
});

test('settings change classifier routes precise-language or mode changes to full refresh', () => {
  const harness = createControllerHarness();

  const preciseKind = harness.controller.dispatchSettingsChange({
    previousSettings: createSettings({ language: 'es' }),
    nextSettings: createSettings({ language: 'en' }),
    previousCountContext: { modoConteo: 'preciso', idioma: 'es' },
    nextCountContext: { modoConteo: 'preciso', idioma: 'en' },
    reason: 'precise language change',
  });

  const modeKind = harness.controller.dispatchSettingsChange({
    previousSettings: createSettings({ language: 'es' }),
    nextSettings: createSettings({ language: 'es' }),
    previousCountContext: { modoConteo: 'simple', idioma: 'es' },
    nextCountContext: { modoConteo: 'preciso', idioma: 'es' },
    reason: 'mode change',
  });

  assert.equal(preciseKind, 'full');
  assert.equal(modeKind, 'full');
  assert.deepEqual(harness.calls, [
    { kind: 'full', reason: 'precise language change' },
    { kind: 'full', reason: 'mode change' },
  ]);
});

test('settings change classifier routes active-language number-format changes to stats_display', () => {
  const harness = createControllerHarness();

  const kind = harness.controller.dispatchSettingsChange({
    previousSettings: createSettings({ language: 'es', thousands: '.', decimal: ',' }),
    nextSettings: createSettings({ language: 'es', thousands: ' ', decimal: ';' }),
    previousCountContext: { modoConteo: 'simple', idioma: 'es' },
    nextCountContext: { modoConteo: 'simple', idioma: 'es' },
    reason: 'number formatting change',
  });

  assert.equal(kind, 'stats_display');
  assert.deepEqual(harness.calls, [{ kind: 'stats_display', reason: 'number formatting change' }]);
});

test('settings change classifier ignores unrelated settings and keeps preset WPM precedence lower than display refreshes', () => {
  const harness = createControllerHarness();

  const noneKind = harness.controller.dispatchSettingsChange({
    previousSettings: createSettings({ language: 'es' }),
    nextSettings: {
      ...createSettings({ language: 'es' }),
      spellcheckEnabled: false,
      editorFontSizePx: 24,
    },
    previousCountContext: { modoConteo: 'simple', idioma: 'es' },
    nextCountContext: { modoConteo: 'simple', idioma: 'es' },
    reason: 'unrelated settings',
  });

  const mergedKind = harness.controller.dispatchSettingsChange({
    previousSettings: createSettings({ language: 'es' }),
    nextSettings: createSettings({ language: 'en' }),
    previousCountContext: { modoConteo: 'simple', idioma: 'es' },
    nextCountContext: { modoConteo: 'simple', idioma: 'en' },
    presetOutcome: {
      previousWpm: 200,
      nextWpm: 250,
      wpmChanged: true,
      previousSelectedPresetName: 'slow',
      nextSelectedPresetName: 'fast',
      selectedPresetChanged: true,
    },
    reason: 'language plus preset outcome',
  });

  assert.equal(noneKind, 'none');
  assert.equal(mergedKind, 'stats_display');
  assert.deepEqual(harness.calls, [{ kind: 'stats_display', reason: 'language plus preset outcome' }]);
});

test('preset outcomes route WPM-only changes to time_only', () => {
  const harness = createControllerHarness();

  const changedKind = harness.controller.dispatchPresetOutcome({
    previousWpm: 200,
    nextWpm: 260,
    wpmChanged: true,
    previousSelectedPresetName: 'default',
    nextSelectedPresetName: 'latin',
    selectedPresetChanged: true,
  }, 'preset outcome');

  const unchangedKind = harness.controller.dispatchPresetOutcome({
    previousWpm: 200,
    nextWpm: 200,
    wpmChanged: false,
    previousSelectedPresetName: 'default',
    nextSelectedPresetName: 'default',
    selectedPresetChanged: false,
  }, 'preset outcome unchanged');

  assert.equal(changedKind, 'time_only');
  assert.equal(unchangedKind, 'none');
  assert.deepEqual(harness.calls, [{ kind: 'time_only', reason: 'preset outcome' }]);
});
