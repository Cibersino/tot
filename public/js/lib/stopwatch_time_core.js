// public/js/lib/stopwatch_time_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared stopwatch time core for renderer and main-process consumers.
// Responsibilities:
// - Parse stopwatch-style input using the canonical H+:MM:SS grammar.
// - Parse and format canonical whole-second clock durations directly.
// - Format stopwatch milliseconds using floor-to-seconds semantics.
// - Support both browser-script and CommonJS consumers.

// =============================================================================
// Exports / module surface
// =============================================================================
(function initStopwatchTimeCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.StopwatchTimeCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // =============================================================================
  // Helpers (pure stopwatch parsing + formatting)
  // =============================================================================
  function createStopwatchTimeUtils() {
    function isWholeClockSeconds(value) {
      return Number.isSafeInteger(value) && value >= 0;
    }

    function getClockInputMatch(input) {
      if (typeof input !== 'string') return null;
      const match = input.match(/^(\d+):([0-5]\d):([0-5]\d)$/);
      return match || null;
    }

    function parseClockSeconds(input) {
      const match = getClockInputMatch(input);
      if (match === null) return null;
      const hours = BigInt(match[1]);
      const minutes = BigInt(match[2]);
      const seconds = BigInt(match[3]);
      const totalSeconds = (hours * 3600n) + (minutes * 60n) + seconds;
      return totalSeconds <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(totalSeconds) : null;
    }

    function parseStopwatchInput(input) {
      const match = getClockInputMatch(input);
      if (match === null) return null;

      const hours = BigInt(match[1]);
      const minutes = BigInt(match[2]);
      const seconds = BigInt(match[3]);
      const totalSeconds = (hours * 3600n) + (minutes * 60n) + seconds;
      const milliseconds = Number(totalSeconds * 1000n);
      if (!Number.isFinite(milliseconds)) return null;

      const roundedMilliseconds = Math.floor(milliseconds / 1000) * 1000;
      return Number.isFinite(roundedMilliseconds)
        && BigInt(Math.floor(roundedMilliseconds / 1000)) === totalSeconds
        ? milliseconds
        : null;
    }

    function decomposeClockSeconds(totalSeconds) {
      return {
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
      };
    }

    function formatClockFromSeconds(totalSeconds) {
      const safeTotalSeconds = Number.isFinite(totalSeconds)
        ? Math.max(0, totalSeconds)
        : 0;
      const timeParts = decomposeClockSeconds(safeTotalSeconds);
      const hours = timeParts.hours.toString().padStart(2, '0');
      const minutes = timeParts.minutes.toString().padStart(2, '0');
      const seconds = timeParts.seconds.toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }

    function formatClockSeconds(totalSeconds) {
      if (!isWholeClockSeconds(totalSeconds)) return null;
      return formatClockFromSeconds(totalSeconds);
    }

    function getClockTimeParts(totalSeconds) {
      if (!isWholeClockSeconds(totalSeconds)) return null;
      return decomposeClockSeconds(totalSeconds);
    }

    function formatStopwatchMs(ms) {
      const totalSeconds = Math.floor((Number(ms) || 0) / 1000);
      return formatClockFromSeconds(totalSeconds);
    }

    return {
      formatClockSeconds,
      parseStopwatchInput,
      parseClockSeconds,
      formatStopwatchMs,
      getClockTimeParts,
    };
  }

  // =============================================================================
  // Factory return
  // =============================================================================
  return {
    createStopwatchTimeUtils,
  };
});

// =============================================================================
// End of public/js/lib/stopwatch_time_core.js
// =============================================================================
