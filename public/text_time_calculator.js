// public/text_time_calculator.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer for the quick text/time calculator window.
// Responsibilities:
// - Load translations and number-format settings for the current language.
// - Keep the selected target plus raw editable values synchronized with the UI.
// - Delegate math and stopwatch parsing/formatting to shared pure helpers.
// - Render inline validation without toasts or developer noise for normal input mistakes.

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[text_time_calculator] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-time-calculator');

  const textTimeCalculatorApi = window.textTimeCalculatorAPI || null;
  const canGetSettings = !!textTimeCalculatorApi
    && typeof textTimeCalculatorApi.getSettings === 'function';
  const canWatchSettings = !!textTimeCalculatorApi
    && typeof textTimeCalculatorApi.onSettingsChanged === 'function';

  const rendererI18n = window.RendererI18n || null;
  if (!rendererI18n
    || typeof rendererI18n.applyWindowLanguageAttributes !== 'function'
    || typeof rendererI18n.getLangBase !== 'function'
    || typeof rendererI18n.loadRendererTranslations !== 'function'
    || typeof rendererI18n.normalizeLangTag !== 'function'
    || typeof rendererI18n.tRenderer !== 'function') {
    throw new Error('[text_time_calculator] RendererI18n unavailable; cannot continue');
  }

  const formatCore = window.FormatCore || null;
  if (!formatCore || typeof formatCore.createFormatUtils !== 'function') {
    throw new Error('[text_time_calculator] FormatCore.createFormatUtils unavailable; cannot continue');
  }

  const stopwatchTimeCore = window.StopwatchTimeCore || null;
  if (!stopwatchTimeCore || typeof stopwatchTimeCore.createStopwatchTimeUtils !== 'function') {
    throw new Error('[text_time_calculator] StopwatchTimeCore.createStopwatchTimeUtils unavailable; cannot continue');
  }

  const calculatorCore = window.TextTimeCalculatorCore || null;
  if (!calculatorCore || typeof calculatorCore.createTextTimeCalculatorUtils !== 'function') {
    throw new Error('[text_time_calculator] TextTimeCalculatorCore.createTextTimeCalculatorUtils unavailable; cannot continue');
  }

  const { AppConstants } = window;
  if (!AppConstants || typeof AppConstants.DEFAULT_LANG !== 'string' || !AppConstants.DEFAULT_LANG.trim()) {
    throw new Error('[text_time_calculator] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }

  const DEFAULT_LANG = AppConstants.DEFAULT_LANG;
  const {
    applyWindowLanguageAttributes,
    getLangBase,
    loadRendererTranslations,
    normalizeLangTag,
    tRenderer,
  } = rendererI18n;

  const formatUtils = formatCore.createFormatUtils({
    DEFAULT_LANG,
    normalizeLangTag,
    getLangBase,
    log,
  });
  const stopwatchUtils = stopwatchTimeCore.createStopwatchTimeUtils();
  const integerFormatState = {
    format(value) {
      return String(Math.round(Number(value) || 0));
    },
  };
  const calculatorUtils = calculatorCore.createTextTimeCalculatorUtils({
    parseStopwatchInput: stopwatchUtils.parseStopwatchInput,
    formatRoundedSeconds: stopwatchUtils.formatRoundedSeconds,
    formatInteger: (value) => integerFormatState.format(value),
  });

  const targetLabel = document.getElementById('textTimeCalculatorTargetLabel');
  const targetSelect = document.getElementById('textTimeCalculatorTarget');
  const formulaValidation = document.getElementById('textTimeCalculatorFormulaValidation');

  const fields = {
    words: {
      label: document.getElementById('textTimeCalculatorWordsLabel'),
      input: document.getElementById('textTimeCalculatorWordsInput'),
      output: document.getElementById('textTimeCalculatorWordsOutput'),
      validation: document.getElementById('textTimeCalculatorWordsValidation'),
    },
    time: {
      label: document.getElementById('textTimeCalculatorTimeLabel'),
      input: document.getElementById('textTimeCalculatorTimeInput'),
      output: document.getElementById('textTimeCalculatorTimeOutput'),
      validation: document.getElementById('textTimeCalculatorTimeValidation'),
    },
    wpm: {
      label: document.getElementById('textTimeCalculatorWpmLabel'),
      input: document.getElementById('textTimeCalculatorWpmInput'),
      output: document.getElementById('textTimeCalculatorWpmOutput'),
      validation: document.getElementById('textTimeCalculatorWpmValidation'),
    },
  };
  const fieldNames = Object.keys(fields);

  const FIELD_LABEL_KEYS = {
    words: 'renderer.text_time_calculator.labels.words',
    time: 'renderer.text_time_calculator.labels.time',
    wpm: 'renderer.text_time_calculator.labels.wpm',
  };
  const TARGET_LABEL_KEYS = {
    words: 'renderer.text_time_calculator.targets.words',
    time: 'renderer.text_time_calculator.targets.time',
    wpm: 'renderer.text_time_calculator.targets.wpm',
  };
  const FIELD_VALIDATION_KEYS = {
    words: 'renderer.text_time_calculator.validation.words',
    time: 'renderer.text_time_calculator.validation.time',
    wpm: 'renderer.text_time_calculator.validation.wpm',
  };

  if (!targetLabel || !targetSelect || !formulaValidation) {
    throw new Error('[text_time_calculator] Required DOM unavailable; cannot continue');
  }
  fieldNames.forEach((field) => {
    const entry = fields[field];
    if (!entry.label || !entry.input || !entry.output || !entry.validation) {
      throw new Error(`[text_time_calculator] Missing DOM for field: ${field}`);
    }
  });

  let currentLanguage = DEFAULT_LANG;
  let settingsCache = null;
  let translationsLoadedFor = null;
  const rawValues = {
    words: '',
    time: '',
    wpm: '',
  };

  function getSelectedTarget() {
    const selected = String(targetSelect.value || '').trim();
    return selected === 'words' || selected === 'time' ? selected : 'wpm';
  }

  function setFieldInvalidState(input, isInvalid) {
    input.classList.toggle('is-invalid', isInvalid);
    input.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
  }

  function applyRawValuesToInputs() {
    fieldNames.forEach((field) => {
      fields[field].input.value = rawValues[field];
    });
  }

  async function ensureTranslations(lang) {
    const targetLang = normalizeLangTag(lang) || DEFAULT_LANG;
    if (translationsLoadedFor === targetLang) {
      applyWindowLanguageAttributes(targetLang);
      return;
    }

    applyWindowLanguageAttributes(targetLang);
    await loadRendererTranslations(targetLang);
    translationsLoadedFor = targetLang;
  }

  async function refreshIntegerFormatter() {
    const { separadorMiles: thousandsSeparator, separadorDecimal: decimalSeparator } = await formatUtils.obtenerSeparadoresDeNumeros(
      currentLanguage,
      settingsCache
    );
    integerFormatState.format = (value) => formatUtils.formatearNumero(
      Math.round(Number(value) || 0),
      thousandsSeparator,
      decimalSeparator
    );
  }

  async function applyTranslations() {
    await ensureTranslations(currentLanguage);

    document.title = tRenderer('renderer.text_time_calculator.title');
    targetLabel.textContent = tRenderer('renderer.text_time_calculator.calculate_label');
    targetSelect.setAttribute('aria-label', tRenderer('renderer.text_time_calculator.calculate_label'));

    Array.from(targetSelect.options).forEach((option) => {
      const value = String(option.value || '').trim();
      const key = TARGET_LABEL_KEYS[value];
      if (key) option.textContent = tRenderer(key);
    });

    fieldNames.forEach((field) => {
      const entry = fields[field];
      const labelText = tRenderer(FIELD_LABEL_KEYS[field]);
      entry.label.textContent = labelText;
      entry.input.setAttribute('aria-label', labelText);
      entry.output.setAttribute('aria-label', labelText);
    });
  }

  function renderCalculator() {
    applyRawValuesToInputs();

    const target = getSelectedTarget();
    const result = calculatorUtils.evaluateCalculatorState({
      target,
      wordsText: rawValues.words,
      timeText: rawValues.time,
      wpmText: rawValues.wpm,
    });

    fieldNames.forEach((field) => {
      const entry = fields[field];
      const derived = field === target;
      entry.input.hidden = derived;
      entry.output.hidden = !derived;
      entry.output.textContent = derived && result.ok && result.derived && result.derived.kind === field
        ? result.derived.displayText
        : '';

      const isFieldInvalid = !derived && result.invalid[field] === true;
      setFieldInvalidState(entry.input, isFieldInvalid);
      entry.validation.hidden = !isFieldInvalid;
      entry.validation.textContent = isFieldInvalid
        ? tRenderer(FIELD_VALIDATION_KEYS[field])
        : '';
    });

    formulaValidation.hidden = !result.invalid.formula;
    formulaValidation.textContent = result.invalid.formula
      ? tRenderer('renderer.text_time_calculator.validation.formula')
      : '';
  }

  function bindFieldInput(field) {
    const entry = fields[field];
    entry.input.setAttribute('aria-invalid', 'false');
    entry.input.addEventListener('input', () => {
      rawValues[field] = entry.input.value;
      renderCalculator();
    });
  }

  async function applySettings(settings) {
    settingsCache = settings && typeof settings === 'object' ? settings : {};
    currentLanguage = settingsCache.language || DEFAULT_LANG;
    await refreshIntegerFormatter();
    await applyTranslations();
    renderCalculator();
  }

  async function bootstrap() {
    targetSelect.value = 'wpm';
    fieldNames.forEach(bindFieldInput);
    targetSelect.addEventListener('change', () => {
      renderCalculator();
    });

    let initialSettings = null;
    if (canGetSettings) {
      try {
        initialSettings = await textTimeCalculatorApi.getSettings();
      } catch (err) {
        log.warn('BOOTSTRAP: textTimeCalculatorAPI.getSettings failed; using default language and number formatting:', err);
      }
    } else if (!textTimeCalculatorApi) {
      log.warn('BOOTSTRAP: textTimeCalculatorAPI unavailable; using default language and disabling live settings updates.');
    } else {
      log.warn('BOOTSTRAP: textTimeCalculatorAPI.getSettings missing; using default language and number formatting.');
    }

    await applySettings(initialSettings);

    if (!textTimeCalculatorApi) {
      return;
    }

    if (!canWatchSettings) {
      log.warn('BOOTSTRAP: textTimeCalculatorAPI.onSettingsChanged missing; live settings updates disabled.');
      return;
    }

    try {
      textTimeCalculatorApi.onSettingsChanged(async (settings) => {
        try {
          await applySettings(settings);
        } catch (err) {
          log.warn('text-time calculator settings update failed (ignored):', err);
        }
      });
    } catch (err) {
      log.warn('BOOTSTRAP: textTimeCalculatorAPI.onSettingsChanged listener setup failed; live settings updates disabled:', err);
    }
  }

  bootstrap().catch((err) => {
    log.error('BOOTSTRAP: text-time calculator initialization failed:', err);
    throw err;
  });
})();

// =============================================================================
// End of public/text_time_calculator.js
// =============================================================================
