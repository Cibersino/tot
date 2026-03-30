// public/js/results_time_multiplier.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the main-window time multiplier UI below the estimated-time result.
// - Validate multiplier input as a natural number.
// - Render the multiplied time from canonical rounded base time parts.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[results-time-multiplier] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('results-time-multiplier');
  log.debug('Results time multiplier starting...');

  const labelEl = document.getElementById('resultsTimeMultiplierLabel');
  const inputEl = document.getElementById('resultsTimeMultiplierInput');
  const outputEl = document.getElementById('resultsTimeMultiplierOutput');

  let translate = null;
  let translateMsg = null;
  let baseTimeParts = null;

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
      return value > 0n ? value : null;
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

  function hasValidBaseTimeParts(parts) {
    if (!parts || typeof parts !== 'object') return false;
    const { hours, minutes, seconds } = parts;
    return Number.isInteger(hours)
      && Number.isInteger(minutes)
      && Number.isInteger(seconds)
      && hours >= 0
      && minutes >= 0
      && seconds >= 0;
  }

  function getBaseTotalSeconds(parts) {
    return (BigInt(parts.hours) * 3600n)
      + (BigInt(parts.minutes) * 60n)
      + BigInt(parts.seconds);
  }

  function getTimePartsFromSeconds(totalSeconds) {
    return {
      hours: (totalSeconds / 3600n).toString(),
      minutes: ((totalSeconds % 3600n) / 60n).toString(),
      seconds: (totalSeconds % 60n).toString(),
    };
  }

  function getMultipliedTimeText(multiplierValue, timeParts) {
    const fallback = `x${multiplierValue}: ${timeParts.hours}h ${timeParts.minutes}m ${timeParts.seconds}s`;
    if (typeof translateMsg !== 'function') return fallback;
    return translateMsg(
      'renderer.main.results.multiplied_time',
      {
        n: multiplierValue,
        h: timeParts.hours,
        m: timeParts.minutes,
        s: timeParts.seconds,
      },
      fallback
    );
  }

  function renderMultipliedTime() {
    if (!ensureElements('renderMultipliedTime')) return;

    const multiplierValue = parseNaturalNumber(inputEl.value);
    if (!multiplierValue) {
      setInputInvalidState(true);
      outputEl.textContent = '';
      return;
    }

    setInputInvalidState(false);

    if (!baseTimeParts) {
      outputEl.textContent = '';
      return;
    }

    const multipliedSeconds = getBaseTotalSeconds(baseTimeParts) * multiplierValue;
    const multipliedTimeParts = getTimePartsFromSeconds(multipliedSeconds);
    outputEl.textContent = getMultipliedTimeText(
      multiplierValue.toString(),
      multipliedTimeParts
    );
  }

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
    inputEl.step = '1';
    inputEl.value = normalizeMultiplierValue(inputEl.value);
    inputEl.setAttribute('aria-invalid', 'false');
    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('blur', handleBlur);
  }

  function applyTranslations({ tRenderer, msgRenderer } = {}) {
    if (!ensureElements('applyTranslations')) return;
    translate = typeof tRenderer === 'function' ? tRenderer : translate;
    translateMsg = typeof msgRenderer === 'function' ? msgRenderer : translateMsg;
    if (typeof translate === 'function') {
      labelEl.textContent = translate(
        'renderer.main.results.multiplier',
        labelEl.textContent || 'Multiplier'
      );
    }
    if (baseTimeParts) {
      renderMultipliedTime();
    }
  }

  function setBaseTimeParts(nextBaseTimeParts) {
    if (!ensureElements('setBaseTimeParts')) return;
    if (!hasValidBaseTimeParts(nextBaseTimeParts)) {
      log.errorOnce(
        'results-time-multiplier.baseTime.invalid',
        'Invalid base time parts received for results time multiplier:',
        nextBaseTimeParts
      );
      return;
    }
    baseTimeParts = {
      hours: nextBaseTimeParts.hours,
      minutes: nextBaseTimeParts.minutes,
      seconds: nextBaseTimeParts.seconds,
    };
    renderMultipliedTime();
  }

  bindEvents();

  window.ResultsTimeMultiplier = {
    applyTranslations,
    setBaseTimeParts,
  };
})();

// =============================================================================
// End of public/js/results_time_multiplier.js
// =============================================================================
