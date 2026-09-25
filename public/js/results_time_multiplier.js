// public/js/results_time_multiplier.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the main-window time multiplier UI below the estimated-time result.
// - Apply the repeat-input validation and normalization rules with its configured cap.
// - Render the multiplied time from a canonical exact reading-duration descriptor.

(() => {
  // =============================================================================
  // Logger / dependencies / DOM bindings
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[results-time-multiplier] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('results-time-multiplier');
  log.debug('Results time multiplier starting...');
  const {
    getRoundedReadingSeconds,
    isEstimatedReadingDuration,
  } = window.ReadingDurationUtils || {};
  if (!getRoundedReadingSeconds || !isEstimatedReadingDuration) {
    throw new Error('[results-time-multiplier] ReadingDurationUtils unavailable; cannot continue');
  }
  const stopwatchTimeCore = window.StopwatchTimeCore || null;
  if (!stopwatchTimeCore || typeof stopwatchTimeCore.createStopwatchTimeUtils !== 'function') {
    throw new Error('[results-time-multiplier] StopwatchTimeCore.createStopwatchTimeUtils unavailable; cannot continue');
  }
  const { getClockTimeParts } = stopwatchTimeCore.createStopwatchTimeUtils();
  const { AppConstants } = window;
  if (!AppConstants || !Number.isInteger(AppConstants.MAX_RESULTS_TIME_MULTIPLIER)
    || AppConstants.MAX_RESULTS_TIME_MULTIPLIER < 1) {
    throw new Error('[results-time-multiplier] AppConstants.MAX_RESULTS_TIME_MULTIPLIER unavailable; cannot continue');
  }
  const { MAX_RESULTS_TIME_MULTIPLIER } = AppConstants;

  const labelEl = document.getElementById('resultsTimeMultiplierLabel');
  const inputEl = document.getElementById('resultsTimeMultiplierInput');
  const outputEl = document.getElementById('resultsTimeMultiplierOutput');

  // =============================================================================
  // Shared state
  // =============================================================================
  let baseReadingDuration = null;

  // =============================================================================
  // Helpers
  // =============================================================================
  function hasRequiredElements() {
    return !!(labelEl && inputEl && outputEl);
  }

  function ensureElements(action) {
    if (hasRequiredElements()) return true;
    log.errorOnce(
      'results-time-multiplier.dom.missing',
      'Results time multiplier DOM elements missing:',
      { action }
    );
    return false;
  }

  function getMultiplierInputState(rawValue) {
    const numericValue = Number(rawValue);
    if (!Number.isInteger(numericValue) || numericValue < 1) {
      return { isValid: false, normalizedValue: 1 };
    }
    if (numericValue > MAX_RESULTS_TIME_MULTIPLIER) {
      return { isValid: false, normalizedValue: MAX_RESULTS_TIME_MULTIPLIER };
    }
    return {
      isValid: true,
      normalizedValue: numericValue,
    };
  }

  function normalizeMultiplierValue(rawValue) {
    return String(getMultiplierInputState(rawValue).normalizedValue);
  }

  function setInputInvalidState(isInvalid) {
    if (!ensureElements('setInputInvalidState')) return;
    inputEl.classList.toggle('is-invalid', isInvalid);
    inputEl.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
  }

  function getMultipliedTimeText(timeParts) {
    return `: ${timeParts.hours}h ${timeParts.minutes}m ${timeParts.seconds}s`;
  }

  // =============================================================================
  // Rendering / UI state
  // =============================================================================
  function renderMultipliedTime() {
    if (!ensureElements('renderMultipliedTime')) return;

    const multiplierState = getMultiplierInputState(inputEl.value);
    if (!multiplierState.isValid) {
      setInputInvalidState(true);
      outputEl.textContent = '';
      return;
    }

    setInputInvalidState(false);

    if (baseReadingDuration === null) {
      outputEl.textContent = '';
      return;
    }

    const multipliedSeconds = getRoundedReadingSeconds(
      baseReadingDuration,
      multiplierState.normalizedValue
    );
    if (multipliedSeconds === null) {
      throw new Error('[results-time-multiplier] multiplied reading duration unavailable');
    }
    const multipliedTimeParts = getClockTimeParts(multipliedSeconds);
    if (multipliedTimeParts === null) {
      throw new Error('[results-time-multiplier] multiplied reading duration clock conversion failed');
    }
    outputEl.textContent = getMultipliedTimeText(multipliedTimeParts);
  }

  // =============================================================================
  // Event wiring
  // =============================================================================
  function handleInput() {
    renderMultipliedTime();
  }

  function handleBlur() {
    if (!ensureElements('handleBlur')) return;
    inputEl.value = normalizeMultiplierValue(inputEl.value);
    renderMultipliedTime();
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    inputEl.blur();
  }

  function bindEvents() {
    if (!ensureElements('bindEvents')) return;
    inputEl.min = '1';
    inputEl.max = String(MAX_RESULTS_TIME_MULTIPLIER);
    inputEl.step = '1';
    inputEl.value = normalizeMultiplierValue(inputEl.value);
    inputEl.setAttribute('aria-invalid', 'false');
    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('blur', handleBlur);
    inputEl.addEventListener('keydown', handleKeyDown);
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  function setBaseReadingDuration(nextBaseReadingDuration) {
    if (!isEstimatedReadingDuration(nextBaseReadingDuration)) {
      throw new Error('[results-time-multiplier] setBaseReadingDuration requires an estimated reading duration');
    }
    if (!ensureElements('setBaseReadingDuration')) return;
    baseReadingDuration = nextBaseReadingDuration;
    renderMultipliedTime();
  }

  function clearBaseReadingDuration() {
    if (!ensureElements('clearBaseReadingDuration')) return;
    baseReadingDuration = null;
    renderMultipliedTime();
  }

  bindEvents();

  window.ResultsTimeMultiplier = {
    clearBaseReadingDuration,
    setBaseReadingDuration,
  };
})();

// =============================================================================
// End of public/js/results_time_multiplier.js
// =============================================================================
