'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id = '', tagName = 'div') {
  const listeners = {};
  return {
    id,
    tagName,
    value: '',
    placeholder: '',
    textContent: '',
    title: '',
    min: '',
    max: '',
    maxLength: 0,
    childNodes: [{ textContent: '' }],
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatch(type, event = {}) {
      const entries = listeners[type] || [];
      entries.forEach((listener) => listener(event));
    },
  };
}

function resolveDirectionFromText(text, fallbackDirection) {
  const value = String(text || '');
  if (!value.trim()) return fallbackDirection;
  if (value.startsWith('rtl:')) return 'rtl';
  if (value.startsWith('ltr:')) return 'ltr';
  if (value.startsWith('Google OCR')) return 'ltr';
  if (value.startsWith('250 WPM')) return 'ltr';
  return fallbackDirection;
}

function createHarness({ initialLanguage = 'en', presetDescMax = 120 } = {}) {
  const subscriptions = {};
  const elements = {
    h3: createElement('', 'h3'),
    presetName: createElement('presetName', 'input'),
    presetWpm: createElement('presetWpm', 'input'),
    presetDesc: createElement('presetDesc', 'textarea'),
    btnSave: createElement('btnSave', 'button'),
    btnCancel: createElement('btnCancel', 'button'),
    charCount: createElement('charCount'),
    hint: createElement('', 'div'),
  };

  elements.presetName.placeholder = 'name';
  elements.presetDesc.placeholder = 'desc';
  elements.h3.textContent = 'Preset';
  elements.btnSave.textContent = 'Save';
  elements.btnCancel.textContent = 'Cancel';
  elements.charCount.textContent = '';
  elements.hint.textContent = 'hint';

  const document = {
    title: '',
    documentElement: {
      dataset: { languageDirection: initialLanguage === 'ar' ? 'rtl' : 'ltr' },
    },
    addEventListener(type, listener) {
      if (type === 'DOMContentLoaded') {
        subscriptions.domContentLoaded = listener;
      }
    },
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      if (selector === 'h3') return elements.h3;
      if (selector === '.hint') return elements.hint;
      return null;
    },
    querySelectorAll(selector) {
      if (selector !== 'label') return [];
      return [
        { childNodes: [{ textContent: 'Name' }], textContent: 'Name' },
        { childNodes: [{ textContent: 'WPM' }], textContent: 'WPM' },
        { childNodes: [{ textContent: 'Description' }], textContent: 'Description' },
      ];
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
          errorOnce() {},
        };
      },
      AppConstants: {
        DEFAULT_LANG: 'en',
        PRESET_DESC_MAX: presetDescMax,
        PRESET_NAME_MAX: 60,
        WPM_MIN: 10,
        WPM_MAX: 700,
      },
      RendererI18n: {
        async loadRendererTranslations() {},
        tRenderer(path) { return path; },
        msgRenderer(path, params = {}) {
          if (path === 'renderer.presets.preset_modal.char_count') {
            return `${params.remaining} remaining`;
          }
          return path;
        },
        applyWindowLanguageAttributes(lang) {
          document.documentElement.dataset.languageDirection = lang === 'ar' ? 'rtl' : 'ltr';
          return {
            lang,
            dir: 'ltr',
            languageDirection: document.documentElement.dataset.languageDirection,
          };
        },
        resolveUserTextDirection(text) {
          return resolveDirectionFromText(
            text,
            document.documentElement.dataset.languageDirection === 'rtl' ? 'rtl' : 'ltr'
          );
        },
      },
      presetAPI: {
        onInit(cb) {
          subscriptions.onInit = cb;
        },
        onSettingsChanged(cb) {
          subscriptions.onSettingsChanged = cb;
        },
        async getSettings() {
          return { language: initialLanguage };
        },
      },
      Notify: {
        notifyMain() {},
      },
      close() {},
    },
    document,
    console,
    setTimeout,
    clearTimeout,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/preset_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/preset_modal.js' });
  subscriptions.domContentLoaded();

  return {
    elements,
    subscriptions,
  };
}

test('preset modal applies shared direction policy on init, input, and language changes', async () => {
  const harness = createHarness({ initialLanguage: 'ar' });
  const { elements, subscriptions } = harness;

  assert.equal(elements.presetDesc.getAttribute('dir'), 'rtl');

  await subscriptions.onInit({
    mode: 'edit',
    preset: {
      name: 'Arabic',
      wpm: 250,
      description: 'rtl:وصف',
    },
  });
  assert.equal(elements.presetDesc.value, 'rtl:وصف');
  assert.equal(elements.presetDesc.getAttribute('dir'), 'rtl');

  elements.presetDesc.value = 'ltr:English';
  elements.presetDesc.dispatch('input');
  assert.equal(elements.presetDesc.getAttribute('dir'), 'ltr');

  elements.presetDesc.value = 'Google OCR وصف';
  elements.presetDesc.dispatch('input');
  assert.equal(elements.presetDesc.getAttribute('dir'), 'ltr');

  elements.presetDesc.value = 'rtl:وصف Google OCR';
  elements.presetDesc.dispatch('input');
  assert.equal(elements.presetDesc.getAttribute('dir'), 'rtl');

  elements.presetDesc.value = '250 WPM وصف';
  elements.presetDesc.dispatch('input');
  assert.equal(elements.presetDesc.getAttribute('dir'), 'ltr');

  elements.presetDesc.value = '   250   ';
  await subscriptions.onSettingsChanged({ language: 'en' });
  assert.equal(elements.presetDesc.getAttribute('dir'), 'ltr');
});

test('preset modal keeps direction aligned with the final truncated description value', () => {
  const harness = createHarness({ initialLanguage: 'ar', presetDescMax: 5 });
  const { elements } = harness;

  elements.presetDesc.value = 'rtl:abcdef';
  elements.presetDesc.dispatch('input');

  assert.equal(elements.presetDesc.value, 'rtl:a');
  assert.equal(elements.presetDesc.getAttribute('dir'), 'rtl');
});
