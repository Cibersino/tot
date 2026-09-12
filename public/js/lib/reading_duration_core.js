// public/js/lib/reading_duration_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared estimated-reading-duration core for main and renderer consumers.
// Responsibilities:
// - Represent words/WPM estimates as exact rational seconds.
// - Reject noncanonical estimate inputs.
// - Convert an estimate to safe whole seconds with nearest-second, half-up rules.
// - Apply a reading multiplier before that whole-second conversion.
// - Derive whole words or WPM from canonical whole-second durations.
// - Expose the shared browser utility and support CommonJS consumers.

(function initReadingDurationCore(root, factory) {
  const api = factory();
  const isCommonJs = typeof module === 'object' && module.exports;
  if (isCommonJs) {
    module.exports = api;
  }
  if (!isCommonJs && root && typeof root === 'object') {
    root.ReadingDurationUtils = api.createReadingDurationUtils();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const SECONDS_PER_MINUTE = 60n;
  const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

  function createReadingDurationUtils() {
    const durationDescriptors = new WeakSet();

    function createDurationDescriptor(numeratorSeconds, denominator) {
      const duration = Object.freeze({
        numeratorSeconds,
        denominator,
      });
      durationDescriptors.add(duration);
      return duration;
    }

    const zeroDuration = createDurationDescriptor(0n, 1n);

    function toNonNegativeSafeInteger(value) {
      return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
    }

    function toPositiveSafeInteger(value) {
      return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : null;
    }

    function getRoundedSafeInteger(numerator, denominator) {
      const roundedValue = (numerator + (denominator / 2n)) / denominator;
      return roundedValue <= MAX_SAFE_INTEGER_BIGINT ? Number(roundedValue) : null;
    }

    function createEstimatedReadingDuration(words, wpm) {
      const wordCount = toNonNegativeSafeInteger(words);
      const wordsPerMinute = toPositiveSafeInteger(wpm);
      if (wordCount === null || wordsPerMinute === null) return null;
      if (wordCount === 0n) return zeroDuration;
      return createDurationDescriptor(wordCount * SECONDS_PER_MINUTE, wordsPerMinute);
    }

    function isEstimatedReadingDuration(value) {
      return !!value && typeof value === 'object' && durationDescriptors.has(value);
    }

    function getRoundedReadingSeconds(duration, multiplier = 1) {
      if (!isEstimatedReadingDuration(duration)) return null;

      const normalizedMultiplier = toPositiveSafeInteger(multiplier);
      if (normalizedMultiplier === null) return null;

      const scaledNumerator = duration.numeratorSeconds * normalizedMultiplier;
      return getRoundedSafeInteger(scaledNumerator, duration.denominator);
    }

    function getEstimatedReadingSeconds(words, wpm, multiplier = 1) {
      return getRoundedReadingSeconds(createEstimatedReadingDuration(words, wpm), multiplier);
    }

    function getWordsForDurationSeconds(durationSeconds, wpm) {
      const seconds = toNonNegativeSafeInteger(durationSeconds);
      const wordsPerMinute = toPositiveSafeInteger(wpm);
      if (seconds === null || wordsPerMinute === null) return null;
      return getRoundedSafeInteger(seconds * wordsPerMinute, SECONDS_PER_MINUTE);
    }

    function getWpmForDurationSeconds(words, durationSeconds) {
      const wordCount = toNonNegativeSafeInteger(words);
      const seconds = toPositiveSafeInteger(durationSeconds);
      if (wordCount === null || seconds === null) return null;
      return getRoundedSafeInteger(wordCount * SECONDS_PER_MINUTE, seconds);
    }

    return {
      createEstimatedReadingDuration,
      getEstimatedReadingSeconds,
      getRoundedReadingSeconds,
      getWordsForDurationSeconds,
      getWpmForDurationSeconds,
      isEstimatedReadingDuration,
    };
  }

  return {
    createReadingDurationUtils,
  };
});

// =============================================================================
// End of public/js/lib/reading_duration_core.js
// =============================================================================
