'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(tagName = 'div') {
  return {
    tagName,
    value: '',
    textContent: '',
    innerHTML: '',
    selectedIndex: -1,
    childNodes: [],
    attributes: {},
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
  };
}

function resolveDirectionFromText(text, fallbackDirection) {
  const value = String(text || '');
  if (!value.trim()) return fallbackDirection;
  if (value.startsWith('rtl:')) return 'rtl';
  if (value.startsWith('ltr:')) return 'ltr';
  if (value.startsWith('Google OCR')) return 'ltr';
  return fallbackDirection;
}

function createHarness({ languageDirection = 'rtl' } = {}) {
  const persistedSelections = [];
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
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/presets.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/presets.js' });

  return {
    api: sandbox.window.RendererPresets,
    persistedSelections,
    createElectronApi() {
      return {
        async setSelectedPreset(name) {
          persistedSelections.push(String(name));
        },
      };
    },
  };
}

test('shared preset description helper writes both text and direction', () => {
  const harness = createHarness({ languageDirection: 'rtl' });
  const descriptionEl = createElement();

  harness.api.applyPresetDescriptionText(descriptionEl, 'rtl:وصف');
  assert.equal(descriptionEl.textContent, 'rtl:وصف');
  assert.equal(descriptionEl.getAttribute('dir'), 'rtl');

  harness.api.applyPresetDescriptionText(descriptionEl, 'Google OCR وصف');
  assert.equal(descriptionEl.getAttribute('dir'), 'ltr');

  harness.api.applyPresetDescriptionText(descriptionEl, '');
  assert.equal(descriptionEl.textContent, '');
  assert.equal(descriptionEl.getAttribute('dir'), 'rtl');
});

test('preset selection flows use the shared description helper for selected and clear states', async () => {
  const harness = createHarness({ languageDirection: 'rtl' });
  const selectEl = createElement('select');
  const descriptionEl = createElement();

  harness.api.applyPresetSelection(
    { name: 'Arabic', description: 'rtl:وصف' },
    { selectEl, presetDescription: descriptionEl }
  );
  assert.equal(selectEl.value, 'Arabic');
  assert.equal(descriptionEl.getAttribute('dir'), 'rtl');

  const selected = await harness.api.resolvePresetSelection({
    list: [
      { name: 'default', description: 'rtl:default' },
      { name: 'latin', description: 'Google OCR وصف' },
    ],
    settings: {
      language: 'ar',
      selected_preset_by_language: { ar: 'latin' },
      presets_by_language: {},
    },
    language: 'ar',
    currentPresetName: null,
    selectEl,
    presetDescription: descriptionEl,
    electronAPI: harness.createElectronApi(),
  });

  assert.equal(selected.name, 'latin');
  assert.equal(descriptionEl.textContent, 'Google OCR وصف');
  assert.equal(descriptionEl.getAttribute('dir'), 'ltr');

  await harness.api.resolvePresetSelection({
    list: [],
    settings: {
      language: 'ar',
      selected_preset_by_language: {},
      presets_by_language: {},
    },
    language: 'ar',
    currentPresetName: null,
    selectEl,
    presetDescription: descriptionEl,
    electronAPI: harness.createElectronApi(),
  });

  assert.equal(selectEl.selectedIndex, -1);
  assert.equal(descriptionEl.textContent, '');
  assert.equal(descriptionEl.getAttribute('dir'), 'rtl');
});
