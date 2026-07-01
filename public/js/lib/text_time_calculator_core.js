// public/js/lib/text_time_calculator_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared calculator core for quick words/time/WPM derivation.
// Responsibilities:
// - Validate the two editable calculator inputs for the selected target.
// - Derive the third reading variable using the canonical math rules.
// - Keep calculation and formatting logic separate from window/DOM code.
// - Support both browser-script and CommonJS consumers.

// =============================================================================
// Exports / module surface
// =============================================================================
(function initTextTimeCalculatorCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.TextTimeCalculatorCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // =============================================================================
  // Constants / config
  // =============================================================================
  const VALID_TARGETS = new Set(['words', 'time', 'wpm']);

  // =============================================================================
  // Helpers (pure calculator validation + derivation)
  // =============================================================================
  function createTextTimeCalculatorUtils({
    parseStopwatchInput,
    formatRoundedSeconds,
    formatInteger,
  } = {}) {
    if (typeof parseStopwatchInput !== 'function') {
      throw new Error('[text_time_calculator_core] parseStopwatchInput is required');
    }
    if (typeof formatRoundedSeconds !== 'function') {
      throw new Error('[text_time_calculator_core] formatRoundedSeconds is required');
    }
    if (typeof formatInteger !== 'function') {
      throw new Error('[text_time_calculator_core] formatInteger is required');
    }

    function createNeutralState(target) {
      return {
        ok: false,
        target,
        normalized: {
          words: null,
          timeMs: null,
          wpm: null,
        },
        invalid: {
          words: false,
          time: false,
          wpm: false,
          formula: false,
        },
        derived: null,
      };
    }

    function parseNonNegativeIntegerText(rawValue) {
      const text = String(rawValue || '').trim();
      if (!text) return { state: 'empty', value: null };
      if (!/^\d+$/.test(text)) return { state: 'invalid', value: null };
      return { state: 'valid', value: Number(text) };
    }

    function parsePositiveIntegerText(rawValue) {
      const text = String(rawValue || '').trim();
      if (!text) return { state: 'empty', value: null };
      if (!/^[1-9]\d*$/.test(text)) return { state: 'invalid', value: null };
      return { state: 'valid', value: Number(text) };
    }

    function parseTimeText(rawValue) {
      const text = String(rawValue || '').trim();
      if (!text) return { state: 'empty', value: null };
      const parsedMs = parseStopwatchInput(text);
      if (parsedMs === null) return { state: 'invalid', value: null };
      return { state: 'valid', value: parsedMs };
    }

    function applyInputState(result, field, parsed) {
      if (parsed.state === 'invalid') {
        result.invalid[field] = true;
        return false;
      }
      if (parsed.state === 'empty') {
        return false;
      }
      if (field === 'time') {
        result.normalized.timeMs = parsed.value;
      } else {
        result.normalized[field] = parsed.value;
      }
      return true;
    }

    function finalizeDerivedInteger(result, field, rawNumber) {
      const roundedValue = Math.round(rawNumber);
      result.normalized[field] = roundedValue;
      result.derived = {
        kind: field,
        rawNumber,
        displayText: formatInteger(roundedValue),
      };
      result.ok = true;
      return result;
    }

    function evaluateCalculatorState({
      target,
      wordsText,
      timeText,
      wpmText,
    } = {}) {
      const normalizedTarget = VALID_TARGETS.has(target) ? target : 'wpm';
      const result = createNeutralState(normalizedTarget);

      const parsedWords = normalizedTarget === 'words'
        ? { state: 'skipped', value: null }
        : parseNonNegativeIntegerText(wordsText);
      const parsedTime = normalizedTarget === 'time'
        ? { state: 'skipped', value: null }
        : parseTimeText(timeText);
      const parsedWpm = normalizedTarget === 'wpm'
        ? { state: 'skipped', value: null }
        : parsePositiveIntegerText(wpmText);

      const readyWords = normalizedTarget === 'words' ? true : applyInputState(result, 'words', parsedWords);
      const readyTime = normalizedTarget === 'time' ? true : applyInputState(result, 'time', parsedTime);
      const readyWpm = normalizedTarget === 'wpm' ? true : applyInputState(result, 'wpm', parsedWpm);

      if (result.invalid.words || result.invalid.time || result.invalid.wpm) {
        return result;
      }

      if (!readyWords || !readyTime || !readyWpm) {
        return result;
      }

      if (normalizedTarget === 'time') {
        const exactSeconds = (result.normalized.words / result.normalized.wpm) * 60;
        const roundedSeconds = Number.isFinite(exactSeconds) && exactSeconds > 0
          ? Math.round(exactSeconds)
          : 0;
        result.normalized.timeMs = roundedSeconds * 1000;
        result.derived = {
          kind: 'time',
          rawNumber: exactSeconds,
          displayText: formatRoundedSeconds(exactSeconds),
        };
        result.ok = true;
        return result;
      }

      const timeSeconds = result.normalized.timeMs / 1000;

      if (normalizedTarget === 'words') {
        const exactWords = (result.normalized.wpm * timeSeconds) / 60;
        return finalizeDerivedInteger(result, 'words', exactWords);
      }

      if (timeSeconds === 0) {
        result.invalid.formula = true;
        return result;
      }

      const exactWpm = (result.normalized.words * 60) / timeSeconds;
      if (!Number.isFinite(exactWpm)) {
        result.invalid.formula = true;
        return result;
      }

      return finalizeDerivedInteger(result, 'wpm', exactWpm);
    }

    return {
      evaluateCalculatorState,
    };
  }

  // =============================================================================
  // Factory return
  // =============================================================================
  return {
    createTextTimeCalculatorUtils,
  };
});

// =============================================================================
// End of public/js/lib/text_time_calculator_core.js
// =============================================================================
