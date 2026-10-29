'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(tagName = 'div') {
  const listeners = {};
  const classes = new Set();
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
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
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

function createCombobox() {
  return {
    value: '',
    options: [],
    update(config = {}) {
      if (Object.prototype.hasOwnProperty.call(config, 'value')) this.value = String(config.value || '');
      if (Object.prototype.hasOwnProperty.call(config, 'options')) this.options = config.options.slice();
    },
    getValue() {
      return this.value;
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

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness({
  getDefaultPresets,
  languageDirection = 'rtl',
  onWpmChanged = null,
  setSelectedPreset,
} = {}) {
  const warningCalls = [];
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
          warn(...args) {
            warningCalls.push(args);
          },
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
    presetsCombobox: createCombobox(),
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
      if (typeof setSelectedPreset === 'function') {
        return setSelectedPreset(name);
      }
    },
  };

  const controller = sandbox.window.WpmControls.createController({
    wpmInput: dom.wpmInput,
    wpmSlider: dom.wpmSlider,
    presetsCombobox: dom.presetsCombobox,
    presetDescription: dom.presetDescription,
    onPresetSelectionChanged() {},
  });
  controller.bind({ onWpmChanged });

  return {
    controller,
    dom,
    electronAPI,
    rendererPresets: sandbox.window.RendererPresets,
    selectionPersists,
    warningCalls,
  };
}

test('resolvePresetSelection keeps an intentional empty catalog quiet without a persisted selection', async () => {
  const harness = createHarness();
  harness.warningCalls.length = 0;

  const selected = await harness.rendererPresets.resolvePresetSelection({
    list: [],
    settings: {
      language: 'en',
      selected_preset_by_language: {},
    },
    language: 'en',
    combobox: harness.dom.presetsCombobox,
    presetDescription: harness.dom.presetDescription,
    electronAPI: harness.electronAPI,
  });

  assert.equal(selected, null);
  assert.equal(harness.dom.presetsCombobox.getValue(), '');
  assert.equal(harness.dom.presetDescription.textContent, '');
  assert.deepEqual(harness.warningCalls, []);
  assert.deepEqual(harness.selectionPersists, []);
});

test('resolvePresetSelection reports clearing a stale selection when no replacement exists', async () => {
  const harness = createHarness();
  harness.warningCalls.length = 0;

  const selected = await harness.rendererPresets.resolvePresetSelection({
    list: [],
    settings: {
      language: 'en',
      selected_preset_by_language: { en: 'missing' },
    },
    language: 'en',
    combobox: harness.dom.presetsCombobox,
    presetDescription: harness.dom.presetDescription,
    electronAPI: harness.electronAPI,
  });

  assert.equal(selected, null);
  assert.equal(harness.dom.presetsCombobox.getValue(), '');
  assert.equal(harness.dom.presetDescription.textContent, '');
  assert.deepEqual(toPlainObject(harness.warningCalls), [[
    'Selected preset was not found and no replacement is available; visible preset selection cleared (NOTE: may be normal; configured presets can change independently of a saved selection).',
    { requested: 'missing', lang: 'en' },
  ]]);
  assert.deepEqual(harness.selectionPersists, []);
});

test('resolvePresetSelection reports an applied replacement without claiming persistence', async () => {
  const harness = createHarness();
  harness.warningCalls.length = 0;

  const selected = await harness.rendererPresets.resolvePresetSelection({
    list: [{ name: 'replacement', wpm: 200, description: '' }],
    settings: {
      language: 'en',
      selected_preset_by_language: { en: 'missing' },
    },
    language: 'en',
    combobox: harness.dom.presetsCombobox,
    presetDescription: harness.dom.presetDescription,
    electronAPI: harness.electronAPI,
  });

  assert.equal(selected.name, 'replacement');
  assert.equal(harness.dom.presetsCombobox.getValue(), 'replacement');
  assert.deepEqual(toPlainObject(harness.warningCalls), [[
    'Selected preset was not found; selected an available replacement (NOTE: may be normal; configured presets can change independently of a saved selection).',
    { requested: 'missing', selected: 'replacement', lang: 'en' },
  ]]);
  assert.deepEqual(harness.selectionPersists, ['replacement']);
});

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

test('loadPresets reports the selection cleared by a catalog reload failure', async () => {
  const harness = createHarness();
  const latinSettings = {
    language: 'en',
    selected_preset_by_language: { en: 'latin' },
    presets_by_language: {},
  };

  await harness.controller.loadPresets({
    settingsSnapshot: latinSettings,
    language: 'en',
    electronAPI: harness.electronAPI,
  });
  harness.rendererPresets.loadPresetsIntoCombobox = async () => {
    throw new Error('catalog unavailable');
  };

  const result = await harness.controller.loadPresets({
    settingsSnapshot: latinSettings,
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  assert.deepEqual(toPlainObject(result.selectionOutcome), {
    previousWpm: 250,
    nextWpm: 250,
    wpmChanged: false,
    previousSelectedPresetName: 'latin',
    nextSelectedPresetName: null,
    selectedPresetChanged: true,
  });
  assert.equal(harness.controller.getSelectedPresetName(), null);
});

test('handlePresetCreated reports the selection cleared by a catalog reload failure', async () => {
  const harness = createHarness();
  const latinSettings = {
    language: 'en',
    selected_preset_by_language: { en: 'latin' },
    presets_by_language: {},
  };

  await harness.controller.loadPresets({
    settingsSnapshot: latinSettings,
    language: 'en',
    electronAPI: harness.electronAPI,
  });
  harness.rendererPresets.loadPresetsIntoCombobox = async () => {
    throw new Error('catalog unavailable');
  };

  const result = await harness.controller.handlePresetCreated({
    preset: { name: 'custom' },
    settingsSnapshot: latinSettings,
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  assert.deepEqual(toPlainObject(result.selectionOutcome), {
    previousWpm: 250,
    nextWpm: 250,
    wpmChanged: false,
    previousSelectedPresetName: 'latin',
    nextSelectedPresetName: null,
    selectedPresetChanged: true,
  });
  assert.equal(harness.controller.getSelectedPresetName(), null);
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
  assert.equal(harness.dom.presetsCombobox.getValue(), 'custom');
  assert.equal(harness.controller.getWpm(), 333);
  assert.equal(harness.controller.getSelectedPresetName(), 'custom');
  assert.deepEqual(harness.selectionPersists, ['custom']);
});

test('handlePresetCreated reports the WPM transition applied after a deferred reload', async () => {
  const deferredCatalog = createDeferred();
  let catalogLoads = 0;
  const harness = createHarness({
    getDefaultPresets() {
      catalogLoads += 1;
      return catalogLoads === 1
        ? {
          general: [{ name: 'default', wpm: 200, description: 'default desc' }],
          languagePresets: {},
        }
        : deferredCatalog.promise;
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

  const pending = harness.controller.handlePresetCreated({
    preset: { name: 'custom' },
    settingsSnapshot: {
      language: 'en',
      selected_preset_by_language: {},
      presets_by_language: {
        en: [{ name: 'custom', wpm: 200, description: 'custom desc' }],
      },
    },
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  harness.dom.wpmSlider.value = '300';
  harness.dom.wpmSlider.dispatch('input');
  deferredCatalog.resolve({
    general: [{ name: 'default', wpm: 200, description: 'default desc' }],
    languagePresets: {},
  });

  const result = await pending;

  assert.deepEqual(toPlainObject(result.selectionOutcome), {
    previousWpm: 300,
    nextWpm: 200,
    wpmChanged: true,
    previousSelectedPresetName: null,
    nextSelectedPresetName: 'custom',
    selectedPresetChanged: true,
  });
  assert.equal(harness.controller.getWpm(), 200);
});

test('loadPresets reports the WPM transition applied after a deferred reload', async () => {
  const deferredCatalog = createDeferred();
  let catalogLoads = 0;
  const harness = createHarness({
    getDefaultPresets() {
      catalogLoads += 1;
      return catalogLoads === 1
        ? {
          general: [{ name: 'default', wpm: 200, description: 'default desc' }],
          languagePresets: {},
        }
        : deferredCatalog.promise;
    },
  });

  const settingsSnapshot = {
    language: 'en',
    selected_preset_by_language: { en: 'default' },
    presets_by_language: {},
  };
  await harness.controller.loadPresets({
    settingsSnapshot,
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  const pending = harness.controller.loadPresets({
    settingsSnapshot,
    language: 'en',
    electronAPI: harness.electronAPI,
  });

  harness.dom.wpmSlider.value = '300';
  harness.dom.wpmSlider.dispatch('input');
  deferredCatalog.resolve({
    general: [{ name: 'default', wpm: 200, description: 'default desc' }],
    languagePresets: {},
  });

  const result = await pending;

  assert.deepEqual(toPlainObject(result.selectionOutcome), {
    previousWpm: 300,
    nextWpm: 200,
    wpmChanged: true,
    previousSelectedPresetName: null,
    nextSelectedPresetName: 'default',
    selectedPresetChanged: true,
  });
  assert.equal(harness.controller.getWpm(), 200);
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

  harness.dom.presetsCombobox.update({ value: 'latin' });
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

test('preset selection notifies a WPM change applied after selection persistence', async () => {
  const selectionPersistence = createDeferred();
  const callbackCalls = [];
  const harness = createHarness({
    getDefaultPresets() {
      return {
        general: [
          { name: 'default', wpm: 200, description: 'default desc' },
          { name: 'same-wpm', wpm: 200, description: 'same WPM desc' },
        ],
        languagePresets: {},
      };
    },
    setSelectedPreset() {
      return selectionPersistence.promise;
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

  harness.dom.presetsCombobox.update({ value: 'same-wpm' });
  const pending = harness.controller.handlePresetSelectionChange({
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

  harness.dom.wpmSlider.value = '300';
  harness.dom.wpmSlider.dispatch('input');
  selectionPersistence.resolve({ ok: true });

  const selected = await pending;

  assert.equal(selected.name, 'same-wpm');
  assert.deepEqual(callbackCalls, [{ nextWpm: 200, presetName: 'same-wpm' }]);
  assert.equal(harness.controller.getWpm(), 200);
});

test('manual WPM input shows invalid chrome until blur normalizes it', () => {
  const harness = createHarness();
  const { wpmInput, wpmSlider } = harness.dom;

  wpmInput.value = '1.5';
  wpmInput.dispatch('input');
  assert.equal(wpmInput.classList.contains('is-invalid'), true);
  assert.equal(wpmInput.getAttribute('aria-invalid'), 'true');

  wpmInput.dispatch('blur');
  assert.equal(wpmInput.value, '10');
  assert.equal(wpmSlider.value, '10');
  assert.equal(wpmInput.classList.contains('is-invalid'), false);
  assert.equal(wpmInput.getAttribute('aria-invalid'), 'false');
});
