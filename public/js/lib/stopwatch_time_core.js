// public/js/lib/stopwatch_time_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared stopwatch time core for renderer and main-process consumers.
// Responsibilities:
// - Parse stopwatch-style input using the canonical H+:MM:SS grammar.
// - Format stopwatch milliseconds using floor-to-seconds semantics.
// - Format derived second totals using nearest-second rounding.
// - Support both browser-script and CommonJS consumers.

(function initStopwatchTimeCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.StopwatchTimeCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function createStopwatchTimeUtils() {
    function parseStopwatchInput(input) {
      const match = String(input || '').match(/^(\d+):([0-5]\d):([0-5]\d)$/);
      if (!match) return null;

      const hours = Number.parseInt(match[1], 10);
      const minutes = Number.parseInt(match[2], 10);
      const seconds = Number.parseInt(match[3], 10);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return null;
      }

      return (hours * 3600 + minutes * 60 + seconds) * 1000;
    }

    function formatClockFromSeconds(totalSeconds) {
      const safeTotalSeconds = Number.isFinite(totalSeconds)
        ? Math.max(0, totalSeconds)
        : 0;
      const hours = Math.floor(safeTotalSeconds / 3600).toString().padStart(2, '0');
      const minutes = Math.floor((safeTotalSeconds % 3600) / 60).toString().padStart(2, '0');
      const seconds = (safeTotalSeconds % 60).toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }

    function formatStopwatchMs(ms) {
      const totalSeconds = Math.floor((Number(ms) || 0) / 1000);
      return formatClockFromSeconds(totalSeconds);
    }

    function formatRoundedSeconds(totalSeconds) {
      const roundedTotalSeconds = Number.isFinite(Number(totalSeconds)) && Number(totalSeconds) > 0
        ? Math.round(Number(totalSeconds))
        : 0;
      return formatClockFromSeconds(roundedTotalSeconds);
    }

    return {
      parseStopwatchInput,
      formatStopwatchMs,
      formatRoundedSeconds,
    };
  }

  return {
    createStopwatchTimeUtils,
  };
});

// =============================================================================
// End of public/js/lib/stopwatch_time_core.js
// =============================================================================
