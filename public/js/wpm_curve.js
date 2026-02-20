'use strict';

// =============================================================================
// WPM slider curve mapping
// =============================================================================
// Responsibilities:
// - Provide a discrete, monotonic mapping between slider control values and WPM.
// - Support linear or mildly exponential distribution.
// - Guarantee that every integer WPM in [WPM_MIN, WPM_MAX] is reachable.

(() => {
  function clampInt(value, min, max) {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? Math.round(numeric) : min;
    return Math.min(Math.max(safe, min), max);
  }

  function clampNumber(value, min, max) {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? numeric : min;
    return Math.min(Math.max(safe, min), max);
  }

  function getStepPrecision(step) {
    const stepText = String(step);
    const dotIdx = stepText.indexOf('.');
    if (dotIdx < 0) return 0;
    return stepText.length - dotIdx - 1;
  }

  function roundToPrecision(value, precision) {
    return Number(value.toFixed(precision));
  }

  function buildDiscreteWpmMapper({
    wpmMin,
    wpmMax,
    controlMin,
    controlMax,
    controlStep = 1,
    curve = 'linear',
    expStrength = 1.15
  }) {
    const minWpm = Math.round(Number(wpmMin));
    const maxWpm = Math.round(Number(wpmMax));
    const minControl = Number(controlMin);
    const maxControl = Number(controlMax);
    const step = Number(controlStep);

    if (!Number.isFinite(minWpm) || !Number.isFinite(maxWpm) || minWpm > maxWpm) {
      throw new Error('[wpm_curve] Invalid WPM range.');
    }
    if (!Number.isFinite(minControl) || !Number.isFinite(maxControl) || minControl > maxControl) {
      throw new Error('[wpm_curve] Invalid control range.');
    }
    if (!Number.isFinite(step) || step <= 0) {
      throw new Error('[wpm_curve] Invalid control step.');
    }

    const wpmCount = (maxWpm - minWpm) + 1;
    const rawPosCount = Math.round((maxControl - minControl) / step);
    const posCount = rawPosCount + 1;
    const finalPosCount = Math.max(posCount, wpmCount);
    const stepPrecision = getStepPrecision(step);

    const runsByWpm = new Array(wpmCount).fill(1);
    const extraPositions = finalPosCount - wpmCount;

    if (extraPositions > 0) {
      const denom = Math.max(1, wpmCount - 1);
      const weightCurve = String(curve || '').toLowerCase();
      const safeStrength = Number.isFinite(Number(expStrength)) ? Number(expStrength) : 1.15;
      const rawExtras = new Array(wpmCount).fill(0);
      const flooredExtras = new Array(wpmCount).fill(0);
      let totalWeight = 0;

      for (let idx = 0; idx < wpmCount; idx++) {
        const normalized = idx / denom;
        const weight = weightCurve === 'exp'
          ? Math.exp(safeStrength * (1 - normalized))
          : 1;
        rawExtras[idx] = weight;
        totalWeight += weight;
      }

      let usedExtra = 0;
      for (let idx = 0; idx < wpmCount; idx++) {
        const proportional = (extraPositions * rawExtras[idx]) / totalWeight;
        const floored = Math.floor(proportional);
        rawExtras[idx] = proportional;
        flooredExtras[idx] = floored;
        runsByWpm[idx] += floored;
        usedExtra += floored;
      }

      let remaining = extraPositions - usedExtra;
      if (remaining > 0) {
        const order = Array.from({ length: wpmCount }, (_, idx) => idx).sort((a, b) => {
          const remA = rawExtras[a] - flooredExtras[a];
          const remB = rawExtras[b] - flooredExtras[b];
          return remB - remA;
        });
        let cursor = 0;
        while (remaining > 0) {
          runsByWpm[order[cursor]] += 1;
          remaining--;
          cursor = (cursor + 1) % order.length;
        }
      }
    }

    const wpmByPos = new Array(finalPosCount);
    const firstPosByWpm = new Array(wpmCount);
    let offset = 0;
    for (let idx = 0; idx < wpmCount; idx++) {
      firstPosByWpm[idx] = offset;
      const wpmValue = minWpm + idx;
      for (let run = 0; run < runsByWpm[idx]; run++) {
        wpmByPos[offset] = wpmValue;
        offset++;
      }
    }

    function controlToPosIndex(rawControl) {
      const clampedControl = clampNumber(rawControl, minControl, maxControl);
      const relative = (clampedControl - minControl) / step;
      const rounded = Math.round(relative);
      return Math.min(Math.max(rounded, 0), finalPosCount - 1);
    }

    function posIndexToControl(posIndex) {
      const clampedIndex = Math.min(Math.max(Math.round(posIndex), 0), finalPosCount - 1);
      const raw = minControl + (clampedIndex * step);
      return roundToPrecision(raw, stepPrecision);
    }

    function wpmFromControl(rawControl) {
      const posIndex = controlToPosIndex(rawControl);
      return wpmByPos[posIndex];
    }

    function controlFromWpm(rawWpm) {
      const clampedWpm = clampInt(rawWpm, minWpm, maxWpm);
      const wpmIndex = clampedWpm - minWpm;
      const posIndex = firstPosByWpm[wpmIndex];
      return posIndexToControl(posIndex);
    }

    return {
      controlMin: minControl,
      controlMax: maxControl,
      controlStep: step,
      wpmMin: minWpm,
      wpmMax: maxWpm,
      wpmFromControl,
      controlFromWpm
    };
  }

  function createMapperFromConstants(constants = {}) {
    const wpmMin = Number(constants.WPM_MIN);
    const wpmMax = Number(constants.WPM_MAX);
    const sliderStep = Number(constants.WPM_SLIDER_STEP);
    const sliderCurve = constants.WPM_SLIDER_CURVE || 'linear';
    const expStrength = Number(constants.WPM_SLIDER_EXP_STRENGTH);

    return buildDiscreteWpmMapper({
      wpmMin,
      wpmMax,
      controlMin: wpmMin,
      controlMax: wpmMax,
      controlStep: Number.isFinite(sliderStep) && sliderStep > 0 ? sliderStep : 1,
      curve: sliderCurve,
      expStrength: Number.isFinite(expStrength) ? expStrength : 1.15
    });
  }

  if (typeof window === 'undefined') {
    throw new Error('[wpm_curve] window unavailable; cannot install mapper.');
  }

  window.WpmCurve = {
    buildDiscreteWpmMapper,
    createMapperFromConstants
  };
})();

