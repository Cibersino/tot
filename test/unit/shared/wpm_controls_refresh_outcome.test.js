'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(tagName = 'div') {
  const listeners = {};
  return {
    tagName,
    value: '',
    textContent: '',
    innerHTML: '',
    selectedIndex: -1,
    min: '',
    max: '',
    step: '',
    disabled: false,
    attributes: {},
    childNodes: [],
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatch(type, event = {}) {
      const entries = listeners[type] || [];
      entries.forEach((listener) => listener(event));
    },
    appendChild(node) {
      this.childNodes.push(node);
      return node;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    blur() {
      this.dispatch('blur');
    },
  };
}

function resolveDirectionFromText(text, fallbackDirection) {
  const value = String(text || '');
  if (!value.trim()) return fallbackDirection;
  if (value.startsWith('rtl:')) return 'rtl';
  if (value.startsWith('Google OCR')) return 'ltr';
  return 'ltr';
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness({
  getDefaultPresets,
  languageDirection = 'rtl',
  onWpmChanged = null,
} = {}) {
  const document = {
    documentElement: {
      dataset: { languageDirection },
    },
    createElement(tagName) {
      return createElement(tagName);
    },
  };

  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          warn() {},
          warnOnce() {},
          error() {},
        };
      },
      AppConstants: {
        WPM_MIN: 10,
        WPM_MAX: 700,
        DEFAULT_LANG: 'en',
      },
      RendererI18n: {
        getLangBase(lang) {
          return String(lang || '').split('-')[0] || 'en';
        },
        resolveUserTextDirection(text) {
          return resolveDirectionFromText(
            text,
            document.documentElement.dataset.languageDirection === 'rtl' ? 'rtl' : 'ltr'
          );
        },
      },
    },
    document,
    console,
  };

  vm.createContext(sandbox);
  const presetsSource = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/presets.js'),
    'utf8'
  );
  vm.runInContext(presetsSource, sandbox, { filename: 'public/js/presets.js' });

  const wpmControlsSource = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/wpm_controls.js'),
    'utf8'
  );
  vm.runInContext(wpmControlsSource, sandbox, { filename: 'public/js/wpm_controls.js' });

  const dom = {
    wpmInput: createElement('input'),
    wpmSlider: createElement('input'),
    presetsSelect: createElement('select'),
    presetDescription: createElement('div'),
  };
  dom.wpmInput.value = '200';
  dom.wpmSlider.value = '200';

  const selectionPersists = [];
  const electronAPI = {
    async getDefaultPresets() {
      if (typeof getDefaultPresets === 'function') {
        return getDefaultPresets();
      }
      return {
        general: [
          { name: 'default', wpm: 200, description: 'rtl:default desc' },
          { name: 'latin', wpm: 250, description: 'Google OCR desc' },
        ],
        languagePresets: {},
      };
    },
    async setSelectedPreset(name) {
      selectionPersists.push(String(name));
    },
  };

  const controller = sandbox.window.WpmControls.createController({
    wpmInput: dom.wpmInput,
    wpmSlider: dom.wpmSlider,
    presetsSelect: dom.presetsSelect,
    presetDescription: dom.presetDescription,
    onPresetSelectionChanged() {},
  });
  controller.bind({ onWpmChanged });

  return {
    controller,
    dom,
    electronAPI,
    selectionPersists,
  };
}

test('loadPresets reports effective fallback outcome after the selected preset disappears', async () => {
  let presetsVersion = 0;
  const harness = createHarness({
    getDefaultPresets() {
      presetsVersion += 1;
      if (presetsVersion === 1) {
        return {
          general: [
            { name: 'default', wpm: 200, description: 'rtl:default desc' },
            { name: 'latin', wpm: 250, description: 'Google OCR desc' },
          ],
          languagePresets: {},
        };
      }
      return {
        general: [
          { name: 'default', wpm: 200, description: 'rtl:default desc' },
        ],
        languagePresets: {},
      };
    },
  });

  await harness.controller.loadPresets({
    settingsSnapshot: {
      language: 'en',
      selected_preset_by_language: { en: 'latin' },
      presets_by_language: {},
    },
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  const result = await harness.controller.loadPresets({
    settingsSnapshot: {
      language: 'en',
      selected_preset_by_language: {},
      presets_by_language: {},
    },
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  assert.deepEqual(toPlainObject(result.selectionOutcome), {
    previousWpm: 250,
    nextWpm: 200,
    wpmChanged: true,
    previousSelectedPresetName: 'latin',
    nextSelectedPresetName: 'default',
    selectedPresetChanged: true,
  });
});

test('handlePresetCreated reports effective post-resolution selection and WPM outcome', async () => {
  const harness = createHarness();

  await harness.controller.loadPresets({
    settingsSnapshot: {
      language: 'en',
      selected_preset_by_language: { en: 'default' },
      presets_by_language: {},
    },
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  const result = await harness.controller.handlePresetCreated({
    preset: { name: 'custom' },
    settingsSnapshot: {
      language: 'en',
      selected_preset_by_language: {},
      presets_by_language: {
        en: [
          { name: 'custom', wpm: 333, description: 'Google OCR custom' },
        ],
      },
    },
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  assert.deepEqual(toPlainObject(result.selectionOutcome), {
    previousWpm: 200,
    nextWpm: 333,
    wpmChanged: true,
    previousSelectedPresetName: 'default',
    nextSelectedPresetName: 'custom',
    selectedPresetChanged: true,
  });
  assert.equal(harness.dom.presetsSelect.value, 'custom');
});

test('preset selection preserves the existing onWpmChanged time-only callback path', async () => {
  const callbackCalls = [];
  const harness = createHarness({
    onWpmChanged(nextWpm, preset) {
      callbackCalls.push({
        nextWpm,
        presetName: preset && preset.name ? preset.name : null,
      });
    },
  });

  await harness.controller.loadPresets({
    settingsSnapshot: {
      language: 'en',
      selected_preset_by_language: { en: 'default' },
      presets_by_language: {},
    },
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  harness.dom.presetsSelect.value = 'latin';
  const selected = await harness.controller.handlePresetSelectionChange({
    settingsSnapshot: {
      language: 'en',
      selected_preset_by_language: {},
      presets_by_language: {},
    },
    language: 'en',
    electronAPI: harness.electronAPI,
    onWpmChanged(nextWpm, preset) {
      callbackCalls.push({
        nextWpm,
        presetName: preset && preset.name ? preset.name : null,
      });
    },
  });

  assert.equal(selected.name, 'latin');
  assert.deepEqual(callbackCalls, [
    { nextWpm: 250, presetName: 'latin' },
  ]);
});

test('applyExternalWpm preserves the existing WPM callback path used by reading-test apply', () => {
  const callbackCalls = [];
  const harness = createHarness();

  const nextWpm = harness.controller.applyExternalWpm(320, {
    onWpmChanged(value) {
      callbackCalls.push(value);
    },
  });

  assert.equal(nextWpm, 320);
  assert.deepEqual(callbackCalls, [320]);
});
