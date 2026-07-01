'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList() {
  const values = new Set();
  return {
    toggle(name, force) {
      if (force === true) {
        values.add(name);
        return true;
      }
      if (force === false) {
        values.delete(name);
        return false;
      }
      if (values.has(name)) {
        values.delete(name);
        return false;
      }
      values.add(name);
      return true;
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createElement(id, tagName = 'div') {
  const listeners = {};
  const attributes = {};

  return {
    id,
    tagName,
    value: '',
    textContent: '',
    hidden: false,
    options: [],
    classList: createClassList(),
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name)
        ? attributes[name]
        : null;
    },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatch(type) {
      const entries = listeners[type] || [];
      entries.forEach((listener) => listener({ target: this }));
    },
  };
}

function createOption(value) {
  return {
    value,
    textContent: value,
  };
}

function getTranslationMap() {
  return {
    es: {
      renderer: {
        text_time_calculator: {
          title: 'toT — Calculadora rápida',
          calculate_label: 'Calcular',
          targets: {
            words: 'Palabras',
            time: 'Tiempo',
            wpm: 'WPM',
          },
          labels: {
            words: 'Palabras',
            time: 'Tiempo',
            wpm: 'WPM',
          },
          validation: {
            words: 'Ingresa un número entero no negativo.',
            time: 'Ingresa el tiempo con formato H+:MM:SS.',
            wpm: 'Ingresa un número entero positivo.',
            formula: 'No se puede calcular el WPM desde 00:00:00.',
          },
        },
      },
    },
    en: {
      renderer: {
        text_time_calculator: {
          title: 'toT — Quick calculator',
          calculate_label: 'Calculate',
          targets: {
            words: 'Words',
            time: 'Time',
            wpm: 'WPM',
          },
          labels: {
            words: 'Words',
            time: 'Time',
            wpm: 'WPM',
          },
          validation: {
            words: 'Enter a non-negative whole number.',
            time: 'Enter time in H+:MM:SS format.',
            wpm: 'Enter a positive whole number.',
            formula: 'WPM cannot be calculated from 00:00:00.',
          },
        },
      },
    },
  };
}

function getPath(obj, pathName) {
  return String(pathName || '')
    .split('.')
    .reduce((acc, part) => (acc && Object.prototype.hasOwnProperty.call(acc, part) ? acc[part] : undefined), obj);
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function createHarness({
  initialLanguage = 'es',
} = {}) {
  const translations = getTranslationMap();
  let activeLanguage = initialLanguage;
  const subscriptions = {};
  const elements = {
    textTimeCalculatorTargetLabel: createElement('textTimeCalculatorTargetLabel', 'label'),
    textTimeCalculatorTarget: createElement('textTimeCalculatorTarget', 'select'),
    textTimeCalculatorFormulaValidation: createElement('textTimeCalculatorFormulaValidation'),
    textTimeCalculatorWordsLabel: createElement('textTimeCalculatorWordsLabel', 'label'),
    textTimeCalculatorWordsInput: createElement('textTimeCalculatorWordsInput', 'input'),
    textTimeCalculatorWordsOutput: createElement('textTimeCalculatorWordsOutput', 'output'),
    textTimeCalculatorWordsValidation: createElement('textTimeCalculatorWordsValidation'),
    textTimeCalculatorTimeLabel: createElement('textTimeCalculatorTimeLabel', 'label'),
    textTimeCalculatorTimeInput: createElement('textTimeCalculatorTimeInput', 'input'),
    textTimeCalculatorTimeOutput: createElement('textTimeCalculatorTimeOutput', 'output'),
    textTimeCalculatorTimeValidation: createElement('textTimeCalculatorTimeValidation'),
    textTimeCalculatorWpmLabel: createElement('textTimeCalculatorWpmLabel', 'label'),
    textTimeCalculatorWpmInput: createElement('textTimeCalculatorWpmInput', 'input'),
    textTimeCalculatorWpmOutput: createElement('textTimeCalculatorWpmOutput', 'output'),
    textTimeCalculatorWpmValidation: createElement('textTimeCalculatorWpmValidation'),
  };

  elements.textTimeCalculatorTarget.options = [
    createOption('words'),
    createOption('time'),
    createOption('wpm'),
  ];

  const sandbox = {
    window: {
      getLogger() {
        return {
          warn() {},
          warnOnce() {},
          error() {},
        };
      },
      textTimeCalculatorAPI: {
        async getSettings() {
          return {
            language: initialLanguage,
            numberFormatting: {
              es: { separadorMiles: '.', separadorDecimal: ',' },
              en: { separadorMiles: ',', separadorDecimal: '.' },
            },
          };
        },
        onSettingsChanged(cb) {
          subscriptions.onSettingsChanged = cb;
          return () => {
            subscriptions.unsubscribed = true;
          };
        },
      },
      RendererI18n: {
        normalizeLangTag(lang) {
          return String(lang || '').trim().toLowerCase().replace(/_/g, '-');
        },
        getLangBase(lang) {
          return String(lang || '').trim().toLowerCase().split(/[-_]/)[0] || 'es';
        },
        async loadRendererTranslations(lang) {
          activeLanguage = String(lang || '').trim().toLowerCase() || 'es';
        },
        tRenderer(pathName) {
          return getPath(translations[activeLanguage], pathName) || pathName;
        },
        applyWindowLanguageAttributes(lang) {
          const normalized = String(lang || '').trim().toLowerCase() || 'es';
          sandbox.document.documentElement.lang = normalized;
          sandbox.document.documentElement.dir = 'ltr';
          sandbox.document.documentElement.dataset.languageDirection = normalized === 'ar' ? 'rtl' : 'ltr';
          return {
            lang: normalized,
            dir: 'ltr',
            languageDirection: sandbox.document.documentElement.dataset.languageDirection,
          };
        },
      },
      FormatCore: require('../../../public/js/lib/format_core'),
      StopwatchTimeCore: require('../../../public/js/lib/stopwatch_time_core'),
      TextTimeCalculatorCore: require('../../../public/js/lib/text_time_calculator_core'),
      AppConstants: {
        DEFAULT_LANG: 'es',
      },
    },
    document: {
      title: '',
      documentElement: {
        dataset: { languageDirection: 'ltr' },
        lang: initialLanguage,
        dir: 'ltr',
      },
      getElementById(id) {
        return elements[id] || null;
      },
    },
    console,
    setTimeout,
    clearTimeout,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/text_time_calculator.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/text_time_calculator.js' });
  await flushAsyncWork();

  return {
    elements,
    document: sandbox.document,
    subscriptions,
  };
}

test('text_time_calculator defaults to WPM and keeps two editable rows plus one derived row', async () => {
  const harness = await createHarness();
  const { elements } = harness;

  assert.equal(elements.textTimeCalculatorTarget.value, 'wpm');
  assert.equal(elements.textTimeCalculatorWordsInput.hidden, false);
  assert.equal(elements.textTimeCalculatorTimeInput.hidden, false);
  assert.equal(elements.textTimeCalculatorWpmInput.hidden, true);
  assert.equal(elements.textTimeCalculatorWpmOutput.hidden, false);
  assert.equal(elements.textTimeCalculatorWordsValidation.hidden, true);
  assert.equal(elements.textTimeCalculatorTimeValidation.hidden, true);
  assert.equal(elements.textTimeCalculatorWpmValidation.hidden, true);
  assert.equal(elements.textTimeCalculatorFormulaValidation.hidden, true);
  assert.equal(elements.textTimeCalculatorFormulaValidation.textContent, '');
});

test('text_time_calculator preserves raw values across target switching and re-evaluates immediately', async () => {
  const harness = await createHarness();
  const { elements } = harness;

  elements.textTimeCalculatorTarget.value = 'time';
  elements.textTimeCalculatorTarget.dispatch('change');
  elements.textTimeCalculatorWordsInput.value = '600';
  elements.textTimeCalculatorWordsInput.dispatch('input');
  elements.textTimeCalculatorWpmInput.value = '200';
  elements.textTimeCalculatorWpmInput.dispatch('input');
  assert.equal(elements.textTimeCalculatorTimeOutput.textContent, '00:03:00');

  elements.textTimeCalculatorTarget.value = 'words';
  elements.textTimeCalculatorTarget.dispatch('change');
  assert.equal(elements.textTimeCalculatorWordsOutput.hidden, false);
  assert.equal(elements.textTimeCalculatorTimeInput.hidden, false);

  elements.textTimeCalculatorTimeInput.value = '00:03:00';
  elements.textTimeCalculatorTimeInput.dispatch('input');
  assert.equal(elements.textTimeCalculatorWordsOutput.textContent, '600');

  elements.textTimeCalculatorTarget.value = 'time';
  elements.textTimeCalculatorTarget.dispatch('change');
  assert.equal(elements.textTimeCalculatorWordsInput.value, '600');
  assert.equal(elements.textTimeCalculatorWpmInput.value, '200');
  assert.equal(elements.textTimeCalculatorTimeOutput.textContent, '00:03:00');
});

test('text_time_calculator shows field-level invalid UI for malformed editable input', async () => {
  const harness = await createHarness();
  const { elements } = harness;

  elements.textTimeCalculatorWordsInput.value = '-5';
  elements.textTimeCalculatorWordsInput.dispatch('input');

  assert.equal(elements.textTimeCalculatorWordsInput.getAttribute('aria-invalid'), 'true');
  assert.equal(elements.textTimeCalculatorWordsValidation.hidden, false);
  assert.equal(elements.textTimeCalculatorWordsValidation.textContent, 'Ingresa un número entero no negativo.');
  assert.equal(elements.textTimeCalculatorTimeOutput.textContent, '');
});

test('text_time_calculator shows shared formula validation without field errors', async () => {
  const harness = await createHarness();
  const { elements } = harness;

  elements.textTimeCalculatorTarget.value = 'wpm';
  elements.textTimeCalculatorTarget.dispatch('change');
  elements.textTimeCalculatorWordsInput.value = '1000';
  elements.textTimeCalculatorWordsInput.dispatch('input');
  elements.textTimeCalculatorTimeInput.value = '00:00:00';
  elements.textTimeCalculatorTimeInput.dispatch('input');

  assert.equal(elements.textTimeCalculatorFormulaValidation.hidden, false);
  assert.equal(elements.textTimeCalculatorFormulaValidation.textContent, 'No se puede calcular el WPM desde 00:00:00.');
  assert.equal(elements.textTimeCalculatorWordsValidation.textContent, '');
  assert.equal(elements.textTimeCalculatorTimeValidation.textContent, '');
  assert.equal(elements.textTimeCalculatorTimeInput.getAttribute('aria-invalid'), 'false');
  assert.equal(elements.textTimeCalculatorWpmOutput.textContent, '');
});

test('text_time_calculator updates translations and localized integer formatting on settings-updated', async () => {
  const harness = await createHarness();
  const { document, elements, subscriptions } = harness;

  elements.textTimeCalculatorTarget.value = 'words';
  elements.textTimeCalculatorTarget.dispatch('change');
  elements.textTimeCalculatorTimeInput.value = '00:10:00';
  elements.textTimeCalculatorTimeInput.dispatch('input');
  elements.textTimeCalculatorWpmInput.value = '2500';
  elements.textTimeCalculatorWpmInput.dispatch('input');

  assert.equal(elements.textTimeCalculatorWordsOutput.textContent, '25.000');

  await subscriptions.onSettingsChanged({
    language: 'en',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  await flushAsyncWork();

  assert.equal(document.title, 'toT — Quick calculator');
  assert.equal(elements.textTimeCalculatorTargetLabel.textContent, 'Calculate');
  assert.equal(elements.textTimeCalculatorTarget.options[0].textContent, 'Words');
  assert.equal(elements.textTimeCalculatorTarget.options[1].textContent, 'Time');
  assert.equal(elements.textTimeCalculatorTarget.options[2].textContent, 'WPM');
  assert.equal(elements.textTimeCalculatorWordsOutput.textContent, '25,000');
});
