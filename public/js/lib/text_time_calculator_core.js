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
    getEstimatedReadingSeconds,
    getWordsForDurationSeconds,
    getWpmForDurationSeconds,
    formatClockSeconds,
    parseClockSeconds,
    formatInteger,
  } = {}) {
    if (typeof getEstimatedReadingSeconds !== 'function') {
      throw new Error('[text_time_calculator_core] getEstimatedReadingSeconds is required');
    }
    if (typeof getWordsForDurationSeconds !== 'function') {
      throw new Error('[text_time_calculator_core] getWordsForDurationSeconds is required');
    }
    if (typeof getWpmForDurationSeconds !== 'function') {
      throw new Error('[text_time_calculator_core] getWpmForDurationSeconds is required');
    }
    if (typeof formatClockSeconds !== 'function') {
      throw new Error('[text_time_calculator_core] formatClockSeconds is required');
    }
    if (typeof parseClockSeconds !== 'function') {
      throw new Error('[text_time_calculator_core] parseClockSeconds is required');
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
          timeSeconds: null,
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
      if (typeof rawValue !== 'string') return { state: 'invalid', value: null };
      const text = rawValue.trim();
      if (!text) return { state: 'empty', value: null };
      if (!/^\d+$/.test(text)) return { state: 'invalid', value: null };
      const value = Number(text);
      return Number.isSafeInteger(value) ? { state: 'valid', value } : { state: 'invalid', value: null };
    }

    function parsePositiveIntegerText(rawValue) {
      if (typeof rawValue !== 'string') return { state: 'invalid', value: null };
      const text = rawValue.trim();
      if (!text) return { state: 'empty', value: null };
      if (!/^[1-9]\d*$/.test(text)) return { state: 'invalid', value: null };
      const value = Number(text);
      return Number.isSafeInteger(value) ? { state: 'valid', value } : { state: 'invalid', value: null };
    }

    function parseTimeText(rawValue) {
      if (typeof rawValue !== 'string') return { state: 'invalid', value: null };
      const text = rawValue.trim();
      if (!text) return { state: 'empty', value: null };
      const parsedSeconds = parseClockSeconds(text);
      if (parsedSeconds === null) return { state: 'invalid', value: null };
      return { state: 'valid', value: parsedSeconds };
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
        result.normalized.timeSeconds = parsed.value;
      } else {
        result.normalized[field] = parsed.value;
      }
      return true;
    }

    function finalizeDerivedWholeValue(result, field, value) {
      result.normalized[field] = value;
      result.derived = {
        kind: field,
        displayText: formatInteger(value),
      };
      result.ok = true;
      return result;
    }

    function evaluateCalculatorState({
      target,
      wordsText = '',
      timeText = '',
      wpmText = '',
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
        const roundedSeconds = getEstimatedReadingSeconds(
          result.normalized.words,
          result.normalized.wpm
        );
        if (!Number.isSafeInteger(roundedSeconds) || roundedSeconds < 0) {
          result.invalid.formula = true;
          return result;
        }
        const displayText = formatClockSeconds(roundedSeconds);
        if (displayText === null) {
          throw new Error('[text_time_calculator_core] formatClockSeconds rejected canonical duration');
        }
        result.normalized.timeSeconds = roundedSeconds;
        result.derived = {
          kind: 'time',
          displayText,
        };
        result.ok = true;
        return result;
      }

      if (normalizedTarget === 'words') {
        const words = getWordsForDurationSeconds(
          result.normalized.timeSeconds,
          result.normalized.wpm
        );
        if (!Number.isSafeInteger(words) || words < 0) {
          result.invalid.formula = true;
          return result;
        }
        return finalizeDerivedWholeValue(result, 'words', words);
      }

      const wpm = getWpmForDurationSeconds(
        result.normalized.words,
        result.normalized.timeSeconds
      );
      if (!Number.isSafeInteger(wpm) || wpm < 0) {
        result.invalid.formula = true;
        return result;
      }
      return finalizeDerivedWholeValue(result, 'wpm', wpm);
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
