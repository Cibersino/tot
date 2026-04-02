// public/js/results_time_multiplier.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the main-window time multiplier UI below the estimated-time result.
// - Validate multiplier input as a natural number.
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
  const MAX_MULTIPLIER = 9999n;

  // =============================================================================
  // Shared state
  // =============================================================================
  let baseTotalSeconds = null;
  let interactionLocked = false;

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

  function parseNaturalNumber(rawValue) {
    const text = String(rawValue || '').trim();
    if (!/^\d+$/.test(text)) return null;
    try {
      const value = BigInt(text);
      return (value > 0n && value <= MAX_MULTIPLIER) ? value : null;
    } catch {
      return null;
    }
  }

  function normalizeMultiplierValue(rawValue) {
    const parsed = parseNaturalNumber(rawValue);
    return parsed ? parsed.toString() : '1';
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

  function syncInteractionLockUi() {
    if (!ensureElements('syncInteractionLockUi')) return;
    inputEl.disabled = interactionLocked;
    inputEl.setAttribute('aria-disabled', interactionLocked ? 'true' : 'false');
  }

  // =============================================================================
  // Rendering / UI state
  // =============================================================================
  function renderMultipliedTime() {
    if (!ensureElements('renderMultipliedTime')) return;

    const multiplierValue = parseNaturalNumber(inputEl.value);
    if (!multiplierValue) {
      setInputInvalidState(true);
      outputEl.textContent = '';
      return;
    }

    setInputInvalidState(false);

    if (baseTotalSeconds === null) {
      outputEl.textContent = '';
      return;
    }

    const multipliedSeconds = baseTotalSeconds * Number(multiplierValue);
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
    inputEl.max = MAX_MULTIPLIER.toString();
    inputEl.step = '1';
    inputEl.value = normalizeMultiplierValue(inputEl.value);
    inputEl.setAttribute('aria-invalid', 'false');
    syncInteractionLockUi();
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

  function setInteractionLocked(nextLocked) {
    if (!ensureElements('setInteractionLocked')) return;
    interactionLocked = nextLocked === true;
    syncInteractionLockUi();
  }

  bindEvents();

  window.ResultsTimeMultiplier = {
    setBaseTotalSeconds,
    setInteractionLocked,
  };
})();

// =============================================================================
// End of public/js/results_time_multiplier.js
// =============================================================================
