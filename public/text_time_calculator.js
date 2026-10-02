// public/text_time_calculator.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer for the quick text/time calculator window.
// Responsibilities:
// - Load translations and number-format settings for the current language.
// - Keep the selected target plus raw editable values synchronized with the UI.
// - Delegate reading math and whole-second clock parsing/formatting to shared pure helpers.
// - Keep startup strict for required owners while degrading cleanly for optional settings sync.
// - Render inline validation without toasts or developer noise for normal input mistakes.

(() => {
  // =============================================================================
  // Runtime dependencies and owner surfaces
  // =============================================================================
  // This window depends on stable renderer-owned globals for logging, i18n,
  // formatting, reading duration, clock parsing, calculator math, and default language.
  if (typeof window.getLogger !== 'function') {
    throw new Error('[text_time_calculator] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-time-calculator');

  const textTimeCalculatorApi = window.textTimeCalculatorAPI || null;
  const canGetSettings = !!textTimeCalculatorApi
    && typeof textTimeCalculatorApi.getSettings === 'function';
  const canWatchSettings = !!textTimeCalculatorApi
    && typeof textTimeCalculatorApi.onSettingsChanged === 'function';
  let calculatorI18nTerminal = false;
  // The earliest required-dependency failure occurs before the field constants
  // exist. Static markup already keeps those fields disabled at that point;
  // defer the dynamic lock until the normal-control surface has been created.
  let calculatorInteractionControlsInitialized = false;

  const rendererI18n = window.RendererI18n || null;
  if (!rendererI18n
    || typeof rendererI18n.getLangBase !== 'function'
    || typeof rendererI18n.normalizeLangTag !== 'function'
    || typeof rendererI18n.transitionRendererTranslations !== 'function'
    || typeof rendererI18n.tRenderer !== 'function') {
    reportTerminalCalculatorI18nFailure('startup-api');
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

  const readingDurationUtils = window.ReadingDurationUtils || null;
  if (!readingDurationUtils
    || typeof readingDurationUtils.getEstimatedReadingSeconds !== 'function'
    || typeof readingDurationUtils.getWordsForDurationSeconds !== 'function'
    || typeof readingDurationUtils.getWpmForDurationSeconds !== 'function') {
    throw new Error('[text_time_calculator] ReadingDurationUtils unavailable; cannot continue');
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
  const rendererCombobox = window.RendererCombobox || null;
  if (!rendererCombobox || typeof rendererCombobox.create !== 'function') {
    throw new Error('[text_time_calculator] RendererCombobox unavailable; cannot continue');
  }
  const {
    getLangBase,
    normalizeLangTag,
    tRenderer,
    transitionRendererTranslations,
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
      return String(value);
    },
  };
  const calculatorUtils = calculatorCore.createTextTimeCalculatorUtils({
    getEstimatedReadingSeconds: readingDurationUtils.getEstimatedReadingSeconds,
    getWordsForDurationSeconds: readingDurationUtils.getWordsForDurationSeconds,
    getWpmForDurationSeconds: readingDurationUtils.getWpmForDurationSeconds,
    formatClockSeconds: stopwatchUtils.formatClockSeconds,
    parseClockSeconds: stopwatchUtils.parseClockSeconds,
    formatInteger: (value) => integerFormatState.format(value),
  });

  // =============================================================================
  // DOM references and field schema
  // =============================================================================
  const targetLabel = document.getElementById('textTimeCalculatorTargetLabel');
  const targetHost = document.getElementById('textTimeCalculatorTarget');
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

  if (!targetLabel || !targetHost || !formulaValidation) {
    throw new Error('[text_time_calculator] Required DOM unavailable; cannot continue');
  }
  fieldNames.forEach((field) => {
    const entry = fields[field];
    if (!entry.label || !entry.input || !entry.output || !entry.validation) {
      throw new Error(`[text_time_calculator] Missing DOM for field: ${field}`);
    }
  });
  calculatorInteractionControlsInitialized = true;

  // =============================================================================
  // Shared state and translation keys
  // =============================================================================
  let currentLanguage = DEFAULT_LANG;
  let settingsCache = null;
  let settingsApplicationQueue = Promise.resolve();
  let targetCombobox = null;
  const rawValues = {
    words: '',
    time: '',
    wpm: '',
  };

  // =============================================================================
  // Helpers
  // =============================================================================
  function getSelectedTarget() {
    if (!targetCombobox) return 'wpm';
    const selected = targetCombobox.getValue();
    return selected === 'words' || selected === 'time' ? selected : 'wpm';
  }

  function getTargetOptions() {
    return Object.entries(TARGET_LABEL_KEYS).map(([value, key]) => ({
      value,
      label: tRenderer(key),
    }));
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

  async function refreshIntegerFormatter() {
    const { separadorMiles: thousandsSeparator, separadorDecimal: decimalSeparator } = await formatUtils.obtenerSeparadoresDeNumeros(
      currentLanguage,
      settingsCache
    );
    integerFormatState.format = (value) => formatUtils.formatearNumero(
      value,
      thousandsSeparator,
      decimalSeparator
    );
  }

  async function applyTranslations() {
    document.title = tRenderer('renderer.text_time_calculator.title');
    targetLabel.textContent = tRenderer('renderer.text_time_calculator.calculate_label');
    const targetOptions = getTargetOptions();
    if (!targetCombobox) {
      targetCombobox = rendererCombobox.create({
        host: targetHost,
        mode: 'select',
        options: targetOptions,
        value: 'wpm',
        ariaLabelledBy: 'textTimeCalculatorTargetLabel',
        onChange: () => {
          if (!calculatorI18nTerminal) renderCalculator();
        },
      });
    } else {
      targetCombobox.update({
        ariaLabelledBy: 'textTimeCalculatorTargetLabel',
        options: targetOptions,
      });
    }

    fieldNames.forEach((field) => {
      const entry = fields[field];
      const labelText = tRenderer(FIELD_LABEL_KEYS[field]);
      entry.label.textContent = labelText;
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
      if (calculatorI18nTerminal) return;
      rawValues[field] = entry.input.value;
      renderCalculator();
    });
  }

  function setCalculatorFieldsInteractive(interactive) {
    fieldNames.forEach((field) => {
      fields[field].input.disabled = !interactive;
    });
  }

  function setCalculatorNormalInteractionAvailable(available) {
    const interactive = available === true && !calculatorI18nTerminal;
    setCalculatorFieldsInteractive(interactive);
    if (targetHost) {
      targetHost.inert = !interactive;
      targetHost.setAttribute('aria-busy', interactive ? 'false' : 'true');
    }
    if (targetCombobox) {
      targetCombobox.update({ disabled: !interactive });
    }
  }

  function focusInitialWordsInput() {
    if (document.activeElement && document.activeElement !== document.body) return;
    fields.words.input.focus({ preventScroll: true });
  }

  async function applySettings(settings) {
    const nextSettings = settings && typeof settings === 'object' ? settings : {};
    const previousSettings = settingsCache;
    await transitionRendererTranslations(nextSettings.language || DEFAULT_LANG, {
      applyTranslations: async ({ language, restoring }) => {
        currentLanguage = language;
        settingsCache = restoring ? previousSettings : nextSettings;
        await refreshIntegerFormatter();
        await applyTranslations();
        renderCalculator();
      },
    });
  }

  function enqueueCalculatorSemanticWork(work) {
    const run = async () => {
      // Main-process closure is asynchronous. Do not admit queued semantic
      // work after this window has entered terminal i18n failure.
      if (calculatorI18nTerminal) return;
      return work();
    };
    settingsApplicationQueue = settingsApplicationQueue.then(run, run);
    return settingsApplicationQueue;
  }

  function enqueueSettingsApplication(settings) {
    const run = async () => {
      try {
        await applySettings(settings);
      } catch (err) {
        reportCalculatorI18nFailure(err);
      }
    };
    // Preload listeners intentionally do not await async callbacks. Serialize
    // every settings source so rollback snapshots are taken when its work begins.
    return enqueueCalculatorSemanticWork(run);
  }

  function reportCalculatorI18nFailure(err, { startup = false } = {}) {
    const transition = err && err.rendererI18nTransition;
    if (!transition) {
      return;
    }
    if (!startup && transition && transition.hadEstablishedState && !transition.restorationFailed) {
      log.error('Text-time calculator language transition failed; previous translation state remains authoritative:', err);
      return;
    }
    log.error('Text-time calculator i18n failure requires window closure:', err);
    reportTerminalCalculatorI18nFailure(startup ? 'startup' : 'transition-restoration');
  }

  function reportTerminalCalculatorI18nFailure(kind) {
    if (calculatorI18nTerminal) return;
    calculatorI18nTerminal = true;
    if (calculatorInteractionControlsInitialized) {
      setCalculatorNormalInteractionAvailable(false);
    }
    if (textTimeCalculatorApi && typeof textTimeCalculatorApi.reportRendererI18nFailure === 'function') {
      try {
        textTimeCalculatorApi.reportRendererI18nFailure({ kind });
      } catch (reportErr) {
        log.warn('textTimeCalculatorAPI.reportRendererI18nFailure failed (ignored); closing failed renderer locally:', reportErr);
        if (typeof window.close === 'function') window.close();
      }
      return;
    }
    log.warn('textTimeCalculatorAPI.reportRendererI18nFailure unavailable (ignored); closing failed renderer locally.');
    if (typeof window.close === 'function') window.close();
  }

  // =============================================================================
  // App lifecycle and bootstrapping
  // =============================================================================
  async function bootstrap() {
    // The window is shown once its document is paintable, before the required
    // settings-backed translation transition finishes. Keep native fields from
    // admitting input until that first semantic presentation succeeds.
    setCalculatorNormalInteractionAvailable(false);
    fieldNames.forEach(bindFieldInput);

    if (!textTimeCalculatorApi || !canWatchSettings) {
      log.error('BOOTSTRAP: textTimeCalculatorAPI.onSettingsChanged unavailable; closing calculator before normal interaction.');
      reportTerminalCalculatorI18nFailure('settings-listener');
      return;
    }
    try {
      textTimeCalculatorApi.onSettingsChanged((settings) => enqueueSettingsApplication(settings));
    } catch (err) {
      log.error('BOOTSTRAP: textTimeCalculatorAPI.onSettingsChanged registration failed; closing calculator before normal interaction:', err);
      reportTerminalCalculatorI18nFailure('settings-listener');
      return;
    }

    await enqueueCalculatorSemanticWork(async () => {
      let initialSettings = null;
      if (canGetSettings) {
        try {
          initialSettings = await textTimeCalculatorApi.getSettings();
        } catch (err) {
          log.warn('BOOTSTRAP: textTimeCalculatorAPI.getSettings failed; using default language and number formatting:', err);
        }
      } else if (textTimeCalculatorApi) {
        log.warn('BOOTSTRAP: textTimeCalculatorAPI.getSettings missing; using default language and number formatting.');
      }

      try {
        await applySettings(initialSettings);
        setCalculatorNormalInteractionAvailable(true);
        focusInitialWordsInput();
      } catch (err) {
        reportCalculatorI18nFailure(err, { startup: true });
      }
    });
  }

  bootstrap().catch((err) => {
    log.error('BOOTSTRAP: text-time calculator initialization failed:', err);
    reportCalculatorI18nFailure(err, { startup: true });
  });
})();

// =============================================================================
// End of public/text_time_calculator.js
// =============================================================================
