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

function createHarness({ languageDirection = 'rtl' } = {}) {
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
      return {
        general: [
          { name: 'default', wpm: 200, description: 'rtl:الوصف الافتراضي' },
          { name: 'latin', wpm: 250, description: 'Google OCR وصف' },
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
  controller.bind();

  return {
    controller,
    dom,
    electronAPI,
    rendererPresets: sandbox.window.RendererPresets,
    selectionPersists,
  };
}

test('wpm controls apply and clear preset descriptions through the shared direction helper', async () => {
  const harness = createHarness({ languageDirection: 'rtl' });
  const { controller, dom, electronAPI } = harness;

  await controller.loadPresets({
    settingsSnapshot: {
      language: 'ar',
      selected_preset_by_language: { ar: 'default' },
      presets_by_language: {},
    },
    language: 'ar',
    electronAPI,
  });

  assert.equal(dom.presetDescription.textContent, 'rtl:الوصف الافتراضي');
  assert.equal(dom.presetDescription.getAttribute('dir'), 'rtl');

  dom.presetsSelect.value = 'latin';
  const selected = await controller.handlePresetSelectionChange({
    settingsSnapshot: {
      language: 'ar',
      selected_preset_by_language: {},
      presets_by_language: {},
    },
    language: 'ar',
    electronAPI,
  });

  assert.equal(selected.name, 'latin');
  assert.equal(dom.presetDescription.textContent, 'Google OCR وصف');
  assert.equal(dom.presetDescription.getAttribute('dir'), 'ltr');

  dom.wpmInput.value = '333';
  dom.wpmInput.blur();
  assert.equal(dom.presetDescription.textContent, '');
  assert.equal(dom.presetDescription.getAttribute('dir'), 'rtl');
});

test('wpm controls reset stale preset descriptions on preset reload failure', async () => {
  const harness = createHarness({ languageDirection: 'rtl' });
  const { controller, dom, electronAPI, rendererPresets } = harness;

  dom.presetDescription.textContent = 'stale';
  dom.presetDescription.setAttribute('dir', 'ltr');

  rendererPresets.loadPresetsIntoDom = async () => {
    throw new Error('boom');
  };

  await controller.loadPresets({
    settingsSnapshot: {
      language: 'ar',
      selected_preset_by_language: {},
      presets_by_language: {},
    },
    language: 'ar',
    electronAPI,
  });

  assert.equal(dom.presetDescription.textContent, '');
  assert.equal(dom.presetDescription.getAttribute('dir'), 'rtl');
});
