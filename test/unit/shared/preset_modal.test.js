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
    disabled: false,
    focusCount: 0,
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
    focus() {
      this.focusCount += 1;
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

function createHarness({
  initialLanguage = 'en',
  presetNameMax = 20,
  presetDescMax = 120,
  holdSettings = false,
  transitionFailureAt = 0,
  transitionFailureAfterApplyAt = 0,
  transitionFailure = null,
  settingsListenerMode = 'available',
} = {}) {
  const subscriptions = {};
  const transitionLanguages = [];
  let establishedLanguage = null;
  let reportRendererI18nFailureCalls = 0;
  let throwRendererCopy = false;
  let releaseSettings;
  let markSettingsRequested;
  const heldSettings = holdSettings
    ? new Promise((resolve) => { releaseSettings = resolve; })
    : null;
  const settingsRequested = holdSettings
    ? new Promise((resolve) => { markSettingsRequested = resolve; })
    : null;
  const elements = {
    presetHeading: createElement('presetHeading', 'h1'),
    presetNameLabel: createElement('presetNameLabel', 'label'),
    presetWpmLabel: createElement('presetWpmLabel', 'label'),
    presetDescriptionLabel: createElement('presetDescriptionLabel', 'label'),
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
  elements.presetHeading.textContent = 'Preset';
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
      if (selector === '.hint') return elements.hint;
      return null;
    },
    querySelectorAll() { return []; },
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
        PRESET_NAME_MAX: presetNameMax,
        WPM_MIN: 10,
        WPM_MAX: 700,
      },
      RendererI18n: {
        normalizeLangTag(language) {
          return String(language || '').trim().toLowerCase().replace(/_/g, '-');
        },
        async transitionRendererTranslations(language, { applyTranslations } = {}) {
          transitionLanguages.push(language);
          if (transitionLanguages.length === transitionFailureAt) {
            throw transitionFailure || new Error(`Cannot apply ${language} translations`);
          }
          const previousLanguage = establishedLanguage;
          document.documentElement.dataset.languageDirection = language === 'ar' ? 'rtl' : 'ltr';
          if (typeof applyTranslations === 'function') await applyTranslations({ language, restoring: false });
          if (transitionLanguages.length === transitionFailureAfterApplyAt) {
            if (previousLanguage && typeof applyTranslations === 'function') {
              document.documentElement.dataset.languageDirection = previousLanguage === 'ar' ? 'rtl' : 'ltr';
              await applyTranslations({ language: previousLanguage, restoring: true });
            }
            throw transitionFailure || new Error(`Cannot apply ${language} translations`);
          }
          establishedLanguage = language;
        },
        tRenderer(path) {
          if (throwRendererCopy) {
            throw new Error('Cannot apply preset renderer copy');
          }
          return path;
        },
        msgRenderer(path, params = {}) {
          if (path === 'renderer.presets.preset_modal.char_count') {
            return `${params.remaining} remaining`;
          }
          return path;
        },
        resolveUserTextDirection(text) {
          return resolveDirectionFromText(
            text,
            document.documentElement.dataset.languageDirection === 'rtl' ? 'rtl' : 'ltr'
          );
        },
      },
      presetAPI: {
        reportRendererI18nFailure() {
          reportRendererI18nFailureCalls += 1;
        },
        onInit(cb) {
          subscriptions.onInit = cb;
        },
        ...(settingsListenerMode === 'missing' ? {} : {
          onSettingsChanged(cb) {
            if (settingsListenerMode === 'throw') {
              throw new Error('settings listener registration failed');
            }
            subscriptions.onSettingsChanged = cb;
          },
        }),
        async getSettings() {
          if (heldSettings) {
            markSettingsRequested();
            await heldSettings;
          }
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
    document,
    elements,
    subscriptions,
    transitionLanguages,
    getReportRendererI18nFailureCalls() {
      return reportRendererI18nFailureCalls;
    },
    failRendererCopy() {
      throwRendererCopy = true;
    },
    releaseSettings() {
      if (releaseSettings) releaseSettings();
    },
    async settleSemanticWork() {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await Promise.resolve();
      }
    },
    async waitForTransitionCount(count) {
      for (let attempt = 0; attempt < 10 && transitionLanguages.length < count; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    waitForSettingsRequest() {
      return settingsRequested || Promise.resolve();
    },
  };
}

test('preset modal closes before normal interaction when live settings registration is unavailable or throws', () => {
  for (const settingsListenerMode of ['missing', 'throw']) {
    const harness = createHarness({ settingsListenerMode });

    assert.equal(harness.getReportRendererI18nFailureCalls(), 1, settingsListenerMode);
    assert.equal(harness.subscriptions.onSettingsChanged, undefined, settingsListenerMode);
    assert.equal(harness.subscriptions.onInit, undefined, settingsListenerMode);
    assert.equal(harness.elements.presetName.disabled, true, settingsListenerMode);
    assert.equal(harness.elements.btnSave.disabled, true, settingsListenerMode);
  }
});

test('preset modal applies shared direction policy on init, input, and language changes', async () => {
  const harness = createHarness({ initialLanguage: 'ar' });
  const { elements, subscriptions } = harness;

  assert.equal(elements.presetName.maxLength, 20);
  assert.equal(elements.presetDesc.maxLength, 120);

  await subscriptions.onInit({
    mode: 'edit',
    preset: {
      name: 'Arabic',
      wpm: 250,
      description: 'rtl:وصف',
    },
  });
  await harness.waitForTransitionCount(1);
  await harness.settleSemanticWork();
  assert.equal(elements.btnSave.focusCount, 1);
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
  await harness.settleSemanticWork();
  assert.equal(elements.presetDesc.getAttribute('dir'), 'ltr');
});

test('preset modal presents the mode-specific heading and title before unlocking its form', async () => {
  const harness = createHarness();
  const { document, elements, subscriptions } = harness;

  subscriptions.onInit({ mode: 'new', wpm: 250 });
  await harness.waitForTransitionCount(1);
  await harness.settleSemanticWork();

  assert.equal(document.title, 'renderer.presets.preset_modal.title_new');
  assert.equal(elements.presetHeading.textContent, 'renderer.presets.preset_modal.heading_new');
  assert.equal(elements.btnSave.disabled, false);

  subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Existing preset', wpm: 300, description: 'Description' },
  });
  await harness.settleSemanticWork();

  assert.equal(document.title, 'renderer.presets.preset_modal.title_edit');
  assert.equal(elements.presetHeading.textContent, 'renderer.presets.preset_modal.heading_edit');
});

test('preset modal keeps direction aligned with the final truncated description value', () => {
  const harness = createHarness({ initialLanguage: 'ar', presetDescMax: 5 });
  const { elements } = harness;

  elements.presetDesc.value = 'rtl:abcdef';
  elements.presetDesc.dispatch('input');

  assert.equal(elements.presetDesc.value, 'rtl:a');
  assert.equal(elements.presetDesc.getAttribute('dir'), 'rtl');
});

test('preset modal admits a live language update after its queued init settings snapshot', async () => {
  const harness = createHarness({ holdSettings: true });
  harness.subscriptions.onInit({
    mode: 'edit',
    preset: {
      name: 'Queued preset',
      wpm: 250,
      description: 'Description',
    },
  });
  await harness.waitForSettingsRequest();
  harness.subscriptions.onSettingsChanged({ language: 'es' });
  assert.deepEqual(harness.transitionLanguages, []);

  harness.releaseSettings();
  await harness.waitForTransitionCount(2);

  assert.deepEqual(harness.transitionLanguages, ['en', 'es']);
  assert.equal(harness.elements.presetName.value, 'Queued preset');
});

test('preset modal does not retransition an established language for a replayed init', async () => {
  const harness = createHarness();

  harness.subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Established preset', wpm: 250, description: 'First payload' },
  });
  await harness.settleSemanticWork();
  harness.subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Rejected replay', wpm: 300, description: 'Second payload' },
  });
  await harness.settleSemanticWork();

  assert.deepEqual(harness.transitionLanguages, ['en']);
  assert.equal(harness.getReportRendererI18nFailureCalls(), 0);
  assert.equal(harness.elements.presetName.value, 'Rejected replay');
  assert.equal(harness.elements.presetWpm.value, 300);
  assert.equal(harness.elements.presetDesc.value, 'Second payload');
  assert.equal(harness.elements.btnSave.focusCount, 2);
});

test('preset modal does not retransition an established effective language for its first init', async () => {
  const harness = createHarness({ initialLanguage: 'ES' });

  harness.subscriptions.onSettingsChanged({ language: 'ES' });
  await harness.settleSemanticWork();

  harness.subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Initial preset', wpm: 250, description: 'Initial description' },
  });
  await harness.settleSemanticWork();

  assert.deepEqual(harness.transitionLanguages, ['es']);
  assert.equal(harness.getReportRendererI18nFailureCalls(), 0);
  assert.equal(harness.elements.presetName.value, 'Initial preset');
  assert.equal(harness.elements.presetWpm.value, 250);
  assert.equal(harness.elements.presetDesc.value, 'Initial description');
  assert.equal(harness.elements.btnSave.focusCount, 1);
});

test('preset modal keeps form interaction locked after settings establish translations until the first init payload is presented', async () => {
  const harness = createHarness({ initialLanguage: 'es' });
  const { elements, subscriptions } = harness;

  assert.equal(elements.presetName.disabled, true);
  assert.equal(elements.presetWpm.disabled, true);
  assert.equal(elements.presetDesc.disabled, true);
  assert.equal(elements.btnSave.disabled, true);
  assert.equal(elements.btnCancel.disabled, false);

  subscriptions.onSettingsChanged({ language: 'es' });
  await harness.settleSemanticWork();

  assert.deepEqual(harness.transitionLanguages, ['es']);
  assert.equal(elements.presetName.disabled, true);
  assert.equal(elements.presetWpm.disabled, true);
  assert.equal(elements.presetDesc.disabled, true);
  assert.equal(elements.btnSave.disabled, true);

  subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Authoritative preset', wpm: 250, description: 'Initial description' },
  });
  await harness.settleSemanticWork();

  assert.equal(elements.presetName.value, 'Authoritative preset');
  assert.equal(elements.presetWpm.value, 250);
  assert.equal(elements.presetDesc.value, 'Initial description');
  assert.equal(elements.presetName.disabled, false);
  assert.equal(elements.presetWpm.disabled, false);
  assert.equal(elements.presetDesc.disabled, false);
  assert.equal(elements.btnSave.disabled, false);
  assert.equal(elements.btnCancel.disabled, false);
});

test('preset modal retains established interaction after a recoverable language-transition failure', async () => {
  const recoverableFailure = new Error('Cannot apply Spanish preset semantics');
  recoverableFailure.rendererI18nTransition = {
    hadEstablishedState: true,
    restorationFailed: false,
  };
  const harness = createHarness({
    transitionFailureAfterApplyAt: 2,
    transitionFailure: recoverableFailure,
  });
  const { elements, subscriptions } = harness;

  subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Established preset', wpm: 250, description: 'Authoritative description' },
  });
  await harness.settleSemanticWork();

  subscriptions.onSettingsChanged({ language: 'es' });
  await harness.settleSemanticWork();

  assert.deepEqual(harness.transitionLanguages, ['en', 'es']);
  assert.equal(harness.getReportRendererI18nFailureCalls(), 0);
  assert.equal(elements.presetName.value, 'Established preset');
  assert.equal(elements.presetWpm.value, 250);
  assert.equal(elements.presetDesc.value, 'Authoritative description');
  assert.equal(elements.presetName.disabled, false);
  assert.equal(elements.presetWpm.disabled, false);
  assert.equal(elements.presetDesc.disabled, false);
  assert.equal(elements.btnSave.disabled, false);
  assert.equal(elements.btnCancel.disabled, false);
});

test('preset modal fails closed when replayed presentation cannot be applied', async () => {
  const harness = createHarness();

  harness.subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Established preset', wpm: 250, description: 'First payload' },
  });
  await harness.settleSemanticWork();

  harness.failRendererCopy();
  harness.subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Failed replay', wpm: 300, description: 'Second payload' },
  });
  await harness.settleSemanticWork();

  harness.subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Ignored replay', wpm: 350, description: 'Third payload' },
  });
  await harness.settleSemanticWork();

  assert.deepEqual(harness.transitionLanguages, ['en']);
  assert.equal(harness.getReportRendererI18nFailureCalls(), 1);
  assert.equal(harness.elements.btnSave.disabled, true);
  assert.equal(harness.elements.presetName.value, 'Failed replay');
  assert.equal(harness.elements.presetWpm.value, 300);
  assert.equal(harness.elements.presetDesc.value, 'Second payload');
  assert.equal(harness.elements.btnSave.focusCount, 1);
});

test('preset modal stops queued semantic work after terminal i18n failure', async () => {
  const transitionFailure = new Error('Cannot establish renderer translation state');
  transitionFailure.rendererI18nTransition = {
    hadEstablishedState: false,
    restorationFailed: false,
  };
  const harness = createHarness({
    transitionFailureAt: 1,
    transitionFailure,
  });

  harness.subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'First payload', wpm: 250, description: 'First description' },
  });
  await harness.settleSemanticWork();

  harness.subscriptions.onSettingsChanged({ language: 'es' });
  harness.subscriptions.onInit({
    mode: 'edit',
    preset: { name: 'Later payload', wpm: 300, description: 'Later description' },
  });
  await harness.settleSemanticWork();

  assert.deepEqual(harness.transitionLanguages, ['en']);
  assert.equal(harness.getReportRendererI18nFailureCalls(), 1);
  assert.equal(harness.elements.presetName.value, 'First payload');
  assert.equal(harness.elements.btnSave.disabled, true);
});

test('preset name HTML fallback matches the shared character limit', () => {
  const markup = fs.readFileSync(
    path.resolve(__dirname, '../../../public/preset_modal.html'),
    'utf8'
  );

  assert.match(markup, /id="presetName"[^>]*maxlength="20"/);
  assert.match(markup, /<h1 id="presetHeading">/);
  assert.match(markup, /<label id="presetNameLabel">/);
  assert.match(markup, /<label id="presetWpmLabel">/);
  assert.match(markup, /<label id="presetDescriptionLabel">/);
});
