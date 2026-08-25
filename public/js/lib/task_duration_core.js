// public/js/lib/task_duration_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared Task Editor duration core for main and renderer consumers.
// Responsibilities:
// - Validate Task Editor whole-second durations and completion percentages.
// - Derive exact per-row remaining seconds from integer hundredths.
// - Derive exact total and remaining task summaries.
// - Support both browser-script and CommonJS consumers.

(function initTaskDurationCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.TaskDurationCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const PERCENT_SCALE = 100n;
  const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

  function createTaskDurationUtils() {
    function isWholeDurationSeconds(value) {
      return Number.isSafeInteger(value) && value >= 0;
    }

    function isPercentComplete(value) {
      return Number.isSafeInteger(value) && value >= 0 && value <= 100;
    }

    function getRemainingHundredths(tiempoSeconds, percentComplete) {
      if (!isWholeDurationSeconds(tiempoSeconds) || !isPercentComplete(percentComplete)) {
        return null;
      }
      return BigInt(tiempoSeconds) * BigInt(100 - percentComplete);
    }

    function getRowRemainingSeconds(tiempoSeconds, percentComplete) {
      const remainingHundredths = getRemainingHundredths(tiempoSeconds, percentComplete);
      if (remainingHundredths === null) return null;
      return Number(remainingHundredths / PERCENT_SCALE);
    }

    function deriveTaskSummary(rows) {
      if (!Array.isArray(rows)) return { ok: false, code: 'INVALID_ROWS' };

      let totalEstimatedSeconds = 0n;
      let remainingHundredths = 0n;
      for (const row of rows) {
        const remaining = getRemainingHundredths(
          row && row.tiempoSeconds,
          row && row.percentComplete
        );
        if (remaining === null) return { ok: false, code: 'INVALID_ROW_DURATION' };

        totalEstimatedSeconds += BigInt(row.tiempoSeconds);
        remainingHundredths += remaining;
      }

      const estimatedRemainingSeconds = remainingHundredths / PERCENT_SCALE;
      if (totalEstimatedSeconds > MAX_SAFE_INTEGER_BIGINT
        || estimatedRemainingSeconds > MAX_SAFE_INTEGER_BIGINT) {
        return { ok: false, code: 'INVALID_SUMMARY' };
      }

      const summary = {
        estimatedTotalSeconds: Number(totalEstimatedSeconds),
        estimatedRemainingSeconds: Number(estimatedRemainingSeconds),
      };
      return {
        ok: true,
        summary: summary.estimatedTotalSeconds > 0 ? summary : null,
      };
    }

    return {
      deriveTaskSummary,
      getRowRemainingSeconds,
      isPercentComplete,
      isWholeDurationSeconds,
    };
  }

  return {
    createTaskDurationUtils,
  };
});

// =============================================================================
// End of public/js/lib/task_duration_core.js
// =============================================================================
