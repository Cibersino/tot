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
    disabled: false,
    textContent: '',
    hidden: false,
    options: [],
    focusCalls: [],
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
    focus(...args) {
      this.focusCalls.push(args);
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
  failTranslationApplicationLanguage = '',
  terminalTransitionLanguage = '',
  liveSettingsDuringInitialLoad = null,
  initialSettingsGate = null,
  includeRendererI18n = true,
  expectStartupThrow = false,
  waitForBootstrap = true,
} = {}) {
  const translations = getTranslationMap();
  let activeLanguage = initialLanguage;
  let failingTranslationApplicationLanguage = failTranslationApplicationLanguage;
  const terminalLanguage = String(terminalTransitionLanguage || '').trim().toLowerCase();
  let rendererTransitionQueue = Promise.resolve();
  const transitionLanguages = [];
  let initialLiveSettingsDelivered = false;
  let reporterCalls = 0;
  const subscriptions = {};
  const comboboxCreateConfigs = [];
  const comboboxUpdateCalls = [];
  const elements = {
    textTimeCalculatorTargetLabel: createElement('textTimeCalculatorTargetLabel', 'label'),
    textTimeCalculatorTarget: createElement('textTimeCalculatorTarget'),
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

  const body = createElement('body', 'body');
  const document = {
    body,
    activeElement: body,
    title: '',
    documentElement: {
      dataset: { languageDirection: 'ltr' },
      lang: initialLanguage,
      dir: 'ltr',
    },
    getElementById(id) {
      return elements[id] || null;
    },
  };

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
        reportRendererI18nFailure() {
          reporterCalls += 1;
        },
        async getSettings() {
          if (liveSettingsDuringInitialLoad) {
            assert.equal(typeof subscriptions.onSettingsChanged, 'function');
            initialLiveSettingsDelivered = true;
            subscriptions.onSettingsChanged(liveSettingsDuringInitialLoad);
          }
          if (initialSettingsGate) {
            await initialSettingsGate;
          }
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
      RendererI18n: includeRendererI18n ? {
        normalizeLangTag(lang) {
          return String(lang || '').trim().toLowerCase().replace(/_/g, '-');
        },
        getLangBase(lang) {
          return String(lang || '').trim().toLowerCase().split(/[-_]/)[0] || 'es';
        },
        transitionRendererTranslations(lang, { applyTranslations } = {}) {
          const run = async () => {
            const previousLanguage = activeLanguage;
            activeLanguage = String(lang || '').trim().toLowerCase() || 'es';
            transitionLanguages.push(activeLanguage);
            if (activeLanguage === terminalLanguage) {
              const err = new Error(`Cannot restore ${activeLanguage} translations`);
              err.rendererI18nTransition = {
                hadEstablishedState: true,
                restorationFailed: true,
              };
              throw err;
            }
            try {
              if (typeof applyTranslations === 'function') {
                await applyTranslations({ language: activeLanguage, restoring: false });
              }
            } catch (err) {
              activeLanguage = previousLanguage;
              if (typeof applyTranslations === 'function') {
                await applyTranslations({ language: previousLanguage, restoring: true });
              }
              err.rendererI18nTransition = {
                hadEstablishedState: true,
                restorationFailed: false,
              };
              throw err;
            }
          };
          const scheduled = rendererTransitionQueue.then(run, run);
          rendererTransitionQueue = scheduled.catch(() => {});
          return scheduled;
        },
        tRenderer(pathName) {
          if (activeLanguage === failingTranslationApplicationLanguage) {
            throw new Error(`Cannot apply ${activeLanguage} translations`);
          }
          return getPath(translations[activeLanguage], pathName) || pathName;
        },
      } : undefined,
      FormatCore: require('../../../public/js/lib/format_core'),
      ReadingDurationUtils: require('../../../public/js/lib/reading_duration_core')
        .createReadingDurationUtils(),
      StopwatchTimeCore: require('../../../public/js/lib/stopwatch_time_core'),
      TextTimeCalculatorCore: require('../../../public/js/lib/text_time_calculator_core'),
      AppConstants: {
        DEFAULT_LANG: 'es',
      },
      RendererCombobox: {
        create(config) {
          comboboxCreateConfigs.push({
            options: Array.isArray(config.options) ? config.options.map((option) => ({ ...option })) : [],
            value: config.value,
          });
          const host = config.host;
          let onChange = typeof config.onChange === 'function' ? config.onChange : null;
          const controller = {
            update(nextConfig = {}) {
              comboboxUpdateCalls.push({ ...nextConfig });
              if (Object.prototype.hasOwnProperty.call(nextConfig, 'options')) {
                host.options = nextConfig.options.map((option) => ({ ...option, textContent: option.label }));
              }
              if (Object.prototype.hasOwnProperty.call(nextConfig, 'value')) {
                host.value = String(nextConfig.value || '');
              }
              if (Object.prototype.hasOwnProperty.call(nextConfig, 'onChange')) {
                onChange = nextConfig.onChange;
              }
            },
            getValue() {
              return host.value;
            },
            open() {},
            close() {},
            focus() {},
            destroy() {},
          };
          controller.update(config);
          host.addEventListener('change', () => {
            if (onChange) onChange(host.value, host.options.find((option) => option.value === host.value));
          });
          return controller;
        },
      },
    },
    document,
    console,
    setTimeout,
    clearTimeout,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/text_time_calculator.js'),
    'utf8'
  );
  let startupError = null;
  try {
    vm.runInContext(source, sandbox, { filename: 'public/text_time_calculator.js' });
  } catch (err) {
    startupError = err;
    if (!expectStartupThrow) throw err;
  }
  if (waitForBootstrap && !startupError) {
    await flushAsyncWork();
  }

  return {
    elements,
    document,
    subscriptions,
    comboboxCreateConfigs,
    comboboxUpdateCalls,
    getInitialLiveSettingsDelivered() {
      return initialLiveSettingsDelivered;
    },
    transitionLanguages,
    getReporterCalls() {
      return reporterCalls;
    },
    startupError,
    setFailTranslationApplicationLanguage(language) {
      failingTranslationApplicationLanguage = String(language || '').trim().toLowerCase();
    },
  };
}

test('text_time_calculator focuses Words after successful initial presentation', async () => {
  const harness = await createHarness();
  const wordsInput = harness.elements.textTimeCalculatorWordsInput;

  assert.equal(wordsInput.hidden, false);
  assert.equal(wordsInput.disabled, false);
  assert.equal(wordsInput.focusCalls.length, 1);
  assert.equal(wordsInput.focusCalls[0][0].preventScroll, true);
  Object.entries(harness.elements)
    .filter(([id]) => id !== 'textTimeCalculatorWordsInput')
    .forEach(([, element]) => assert.equal(element.focusCalls.length, 0));
});

test('text_time_calculator preserves focus established before initial presentation completes', async () => {
  let resolveInitialSettings;
  const initialSettingsGate = new Promise((resolve) => {
    resolveInitialSettings = resolve;
  });
  const harness = await createHarness({
    initialSettingsGate,
    waitForBootstrap: false,
  });
  const existingFocus = harness.elements.textTimeCalculatorTimeInput;

  harness.document.activeElement = existingFocus;
  resolveInitialSettings();
  await flushAsyncWork();

  assert.equal(harness.elements.textTimeCalculatorWordsInput.focusCalls.length, 0);
  assert.equal(harness.document.activeElement, existingFocus);
});

test('text_time_calculator reports earliest required i18n failure before DOM control setup', async () => {
  const harness = await createHarness({
    includeRendererI18n: false,
    expectStartupThrow: true,
  });

  assert.match(harness.startupError && harness.startupError.message, /RendererI18n unavailable/);
  assert.equal(harness.getReporterCalls(), 1);
});

test('text_time_calculator creates target options from the active translations', async () => {
  const { comboboxCreateConfigs } = await createHarness({ initialLanguage: 'en' });

  assert.deepEqual(JSON.parse(JSON.stringify(comboboxCreateConfigs)), [{
    options: [
      { value: 'words', label: 'Words' },
      { value: 'time', label: 'Time' },
      { value: 'wpm', label: 'WPM' },
    ],
    value: 'wpm',
  }]);
});

test('text_time_calculator keeps native fields unavailable until initial presentation succeeds', async () => {
  let resolveInitialSettings;
  const initialSettingsGate = new Promise((resolve) => {
    resolveInitialSettings = resolve;
  });
  const harness = await createHarness({
    initialSettingsGate,
    waitForBootstrap: false,
  });
  const { elements } = harness;

  [
    elements.textTimeCalculatorWordsInput,
    elements.textTimeCalculatorTimeInput,
    elements.textTimeCalculatorWpmInput,
  ].forEach((input) => {
    assert.equal(input.disabled, true);
  });
  assert.deepEqual(harness.comboboxCreateConfigs, []);

  resolveInitialSettings();
  await flushAsyncWork();

  [
    elements.textTimeCalculatorWordsInput,
    elements.textTimeCalculatorTimeInput,
    elements.textTimeCalculatorWpmInput,
  ].forEach((input) => {
    assert.equal(input.disabled, false);
  });
  assert.equal(harness.comboboxCreateConfigs.length, 1);
});

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
  ['Words', 'Time', 'Wpm'].forEach((elementStem) => {
    const input = elements[`textTimeCalculator${elementStem}Input`];
    const output = elements[`textTimeCalculator${elementStem}Output`];
    const label = elements[`textTimeCalculator${elementStem}Label`];
    assert.equal(input.getAttribute('aria-label'), null);
    assert.equal(output.getAttribute('aria-label'), label.textContent);
  });
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

test('text_time_calculator admits a live settings delivery while its initial settings load is pending', async () => {
  const harness = await createHarness({
    initialLanguage: 'es',
    liveSettingsDuringInitialLoad: {
      language: 'en',
      numberFormatting: {
        es: { separadorMiles: '.', separadorDecimal: ',' },
        en: { separadorMiles: ',', separadorDecimal: '.' },
      },
    },
  });

  assert.equal(harness.getInitialLiveSettingsDelivered(), true);
  assert.deepEqual(harness.transitionLanguages, ['es', 'en']);
  assert.equal(harness.document.title, 'toT — Quick calculator');
});

test('text_time_calculator restores prior settings after a translation application failure', async () => {
  const harness = await createHarness({
    initialLanguage: 'en',
    failTranslationApplicationLanguage: 'es',
  });
  const { document, elements, subscriptions } = harness;

  elements.textTimeCalculatorTarget.value = 'words';
  elements.textTimeCalculatorTarget.dispatch('change');
  elements.textTimeCalculatorTimeInput.value = '00:10:00';
  elements.textTimeCalculatorTimeInput.dispatch('input');
  elements.textTimeCalculatorWpmInput.value = '2500';
  elements.textTimeCalculatorWpmInput.dispatch('input');
  assert.equal(elements.textTimeCalculatorWordsOutput.textContent, '25,000');

  await subscriptions.onSettingsChanged({
    language: 'es',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
    },
  });
  await flushAsyncWork();

  assert.equal(document.title, 'toT — Quick calculator');
  assert.equal(elements.textTimeCalculatorWordsOutput.textContent, '25,000');
});

test('text_time_calculator restores the settings state current when an overlapping transition begins', async () => {
  const harness = await createHarness({ initialLanguage: 'en' });
  const { document, elements, subscriptions } = harness;

  elements.textTimeCalculatorTarget.value = 'words';
  elements.textTimeCalculatorTarget.dispatch('change');
  elements.textTimeCalculatorTimeInput.value = '00:10:00';
  elements.textTimeCalculatorTimeInput.dispatch('input');
  elements.textTimeCalculatorWpmInput.value = '2500';
  elements.textTimeCalculatorWpmInput.dispatch('input');

  const spanishUpdate = subscriptions.onSettingsChanged({
    language: 'es',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  harness.setFailTranslationApplicationLanguage('en');
  const failingEnglishUpdate = subscriptions.onSettingsChanged({
    language: 'en',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });

  await Promise.all([spanishUpdate, failingEnglishUpdate]);
  await flushAsyncWork();

  assert.equal(document.title, 'toT — Calculadora rápida');
  assert.equal(elements.textTimeCalculatorWordsOutput.textContent, '25.000');
});

test('text_time_calculator stops later settings work after terminal i18n failure', async () => {
  const harness = await createHarness({
    initialLanguage: 'en',
    terminalTransitionLanguage: 'es',
  });

  await harness.subscriptions.onSettingsChanged({
    language: 'es',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  await flushAsyncWork();

  await harness.subscriptions.onSettingsChanged({
    language: 'en',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  await flushAsyncWork();

  assert.deepEqual(harness.transitionLanguages, ['en', 'es']);
  assert.equal(harness.getReporterCalls(), 1);
});

test('text_time_calculator terminal failure disables fields and the target action without later re-enabling them', async () => {
  const harness = await createHarness({
    initialLanguage: 'en',
    terminalTransitionLanguage: 'es',
  });

  await harness.subscriptions.onSettingsChanged({ language: 'es' });
  await flushAsyncWork();
  await harness.subscriptions.onSettingsChanged({ language: 'en' });
  await flushAsyncWork();

  [
    harness.elements.textTimeCalculatorWordsInput,
    harness.elements.textTimeCalculatorTimeInput,
    harness.elements.textTimeCalculatorWpmInput,
  ].forEach((input) => {
    assert.equal(input.disabled, true);
  });
  assert.equal(harness.comboboxUpdateCalls.at(-1).disabled, true);
  assert.deepEqual(harness.transitionLanguages, ['en', 'es']);
  assert.equal(harness.getReporterCalls(), 1);
});
