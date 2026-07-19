// public/js/results_time_multiplier.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the main-window time multiplier UI below the estimated-time result.
// - Apply the repeat-input validation and normalization rules with its own cap.
// - Render the multiplied time from canonical exact base seconds.
// =============================================================================

(() => {
  // =============================================================================
  // Logger / dependencies / DOM bindings
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[results-time-multiplier] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('results-time-multiplier');
  log.debug('Results time multiplier starting...');
  if (!window.FormatUtils || typeof window.FormatUtils.getDisplayTimeParts !== 'function') {
    throw new Error('[results-time-multiplier] FormatUtils.getDisplayTimeParts unavailable; cannot continue');
  }
  const { getDisplayTimeParts } = window.FormatUtils;

  const labelEl = document.getElementById('resultsTimeMultiplierLabel');
  const inputEl = document.getElementById('resultsTimeMultiplierInput');
  const outputEl = document.getElementById('resultsTimeMultiplierOutput');
  const MAX_MULTIPLIER = 9999;

  // =============================================================================
  // Shared state
  // =============================================================================
  let baseTotalSeconds = null;

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
    return {
      isValid: true,
      normalizedValue: Math.min(numericValue, MAX_MULTIPLIER),
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

  function hasValidBaseTotalSeconds(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue >= 0;
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

    if (baseTotalSeconds === null) {
      outputEl.textContent = '';
      return;
    }

    const multipliedSeconds = baseTotalSeconds * multiplierState.normalizedValue;
    const multipliedTimeParts = getDisplayTimeParts(multipliedSeconds);
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

  function bindEvents() {
    if (!ensureElements('bindEvents')) return;
    inputEl.min = '1';
    inputEl.max = String(MAX_MULTIPLIER);
    inputEl.step = '1';
    inputEl.value = normalizeMultiplierValue(inputEl.value);
    inputEl.setAttribute('aria-invalid', 'false');
    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('blur', handleBlur);
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  function setBaseTotalSeconds(nextBaseTotalSeconds) {
    if (!ensureElements('setBaseTotalSeconds')) return;
    if (!hasValidBaseTotalSeconds(nextBaseTotalSeconds)) {
      log.errorOnce(
        'results-time-multiplier.baseTotalSeconds.invalid',
        'Invalid base total seconds received for results time multiplier:',
        nextBaseTotalSeconds
      );
      return;
    }
    baseTotalSeconds = Number(nextBaseTotalSeconds);
    renderMultipliedTime();
  }

  function clearBaseTotalSeconds() {
    if (!ensureElements('clearBaseTotalSeconds')) return;
    baseTotalSeconds = null;
    renderMultipliedTime();
  }

  bindEvents();

  window.ResultsTimeMultiplier = {
    clearBaseTotalSeconds,
    setBaseTotalSeconds,
  };
})();

// =============================================================================
// End of public/js/results_time_multiplier.js
// =============================================================================
