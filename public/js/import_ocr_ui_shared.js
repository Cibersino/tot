// public/js/import_ocr_ui_shared.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared OCR UI helpers for renderer modules.
// Responsibilities:
// - Define OCR preset defaults and normalization limits.
// - Normalize user-controlled OCR options into safe bounded values.
// - Build normalized queued-job metadata from mixed payload shapes.
// - Provide OCR time-estimation helpers used by options/progress UI.
// - Expose a frozen shared API on window.ImportOcrUiShared.

(() => {
  // =============================================================================
  // Constants / config (presets, limits, estimate model)
  // =============================================================================

  const OCR_PRESET_VALUES = Object.freeze({
    fast: Object.freeze({ dpi: 220, timeoutPerPageSec: 45 }),
    balanced: Object.freeze({ dpi: 300, timeoutPerPageSec: 90 }),
    high_accuracy: Object.freeze({ dpi: 400, timeoutPerPageSec: 180 }),
  });
  const OCR_DPI_MIN = 150;
  const OCR_DPI_MAX = 600;
  const OCR_DPI_STEP = 25;
  const OCR_TIMEOUT_MIN = 30;
  const OCR_TIMEOUT_MAX = 600;
  const OCR_TIMEOUT_STEP = 15;
  const OCR_PSM_DEFAULT = 3;
  const OCR_PSM_ALLOWED_VALUES = Object.freeze([3, 4, 6, 11]);
  const OCR_ESTIMATE_BASE_DPI = 300;
  const OCR_ESTIMATE_BASE_RASTER_SEC_PER_PAGE = 3.0;
  const OCR_ESTIMATE_BASE_OCR_SEC_PER_PAGE = 3.6;
  const OCR_ESTIMATE_RASTER_EXPONENT = 2.6;
  const OCR_ESTIMATE_OCR_EXPONENT = 1.6;
  const OCR_ESTIMATE_MIN_RASTER_SEC_PER_PAGE = 1.8;
  const OCR_ESTIMATE_MIN_OCR_SEC_PER_PAGE = 2.3;
  const PREPROCESS_MODE_VALUES = Object.freeze(['off', 'auto', 'manual']);
  const PREPROCESS_OPERATION_ORDER = Object.freeze([
    'normalize_contrast',
    'local_illumination_correction',
    'adaptive_contrast',
    'binarize',
    'denoise',
    'text_sharpen',
    'deskew',
    'page_cleanup',
  ]);
  const PREPROCESS_OPERATION_MANUAL_RULES = Object.freeze({
    normalize_contrast: Object.freeze({
      blackClipPct: Object.freeze({
        type: 'number',
        min: 0,
        max: 20,
        step: 0.5,
      }),
      whiteClipPct: Object.freeze({
        type: 'number',
        min: 0,
        max: 20,
        step: 0.5,
      }),
    }),
    local_illumination_correction: Object.freeze({
      windowPx: Object.freeze({
        type: 'integer',
        min: 9,
        max: 101,
        step: 2,
      }),
      offsetPct: Object.freeze({
        type: 'number',
        min: 1,
        max: 30,
        step: 1,
      }),
    }),
    adaptive_contrast: Object.freeze({
      tilePct: Object.freeze({
        type: 'number',
        min: 5,
        max: 40,
        step: 1,
      }),
      clipLimit: Object.freeze({
        type: 'number',
        min: 1,
        max: 8,
        step: 0.5,
      }),
      bins: Object.freeze({
        type: 'integer',
        min: 64,
        max: 256,
        step: 1,
      }),
    }),
    binarize: Object.freeze({
      thresholdPct: Object.freeze({
        type: 'number',
        min: 0,
        max: 100,
        step: 1,
      }),
    }),
    denoise: Object.freeze({
      passes: Object.freeze({
        type: 'integer',
        min: 1,
        max: 4,
        step: 1,
      }),
    }),
    text_sharpen: Object.freeze({
      radiusPx: Object.freeze({
        type: 'number',
        min: 0,
        max: 2,
        step: 0.1,
      }),
      sigmaPx: Object.freeze({
        type: 'number',
        min: 0.3,
        max: 3,
        step: 0.1,
      }),
      amount: Object.freeze({
        type: 'number',
        min: 0.2,
        max: 2,
        step: 0.1,
      }),
      threshold: Object.freeze({
        type: 'number',
        min: 0,
        max: 0.2,
        step: 0.01,
      }),
    }),
    deskew: Object.freeze({
      scanRangeDeg: Object.freeze({
        type: 'number',
        min: 0.1,
        max: 15,
        step: 0.1,
      }),
      scanStepDeg: Object.freeze({
        type: 'number',
        min: 0.1,
        max: 5,
        step: 0.1,
      }),
    }),
    page_cleanup: Object.freeze({
      maskScanSize: Object.freeze({
        type: 'integer',
        min: 10,
        max: 80,
        step: 1,
      }),
      grayfilterSize: Object.freeze({
        type: 'integer',
        min: 0,
        max: 12,
        step: 1,
      }),
      noisefilterIntensity: Object.freeze({
        type: 'integer',
        min: 0,
        max: 12,
        step: 1,
      }),
      blackfilterIntensity: Object.freeze({
        type: 'integer',
        min: 0,
        max: 32,
        step: 1,
      }),
      blurfilterSize: Object.freeze({
        type: 'integer',
        min: 0,
        max: 12,
        step: 1,
      }),
    }),
  });
  const PREPROCESS_MANUAL_DEFAULTS = Object.freeze({
    normalize_contrast: Object.freeze({
      blackClipPct: 3,
      whiteClipPct: 3,
    }),
    local_illumination_correction: Object.freeze({
      windowPx: 25,
      offsetPct: 10,
    }),
    adaptive_contrast: Object.freeze({
      tilePct: 25,
      clipLimit: 3,
      bins: 128,
    }),
    binarize: Object.freeze({
      thresholdPct: 55,
    }),
    denoise: Object.freeze({
      passes: 2,
    }),
    text_sharpen: Object.freeze({
      radiusPx: 0.5,
      sigmaPx: 1,
      amount: 1,
      threshold: 0,
    }),
    deskew: Object.freeze({
      scanRangeDeg: 4,
      scanStepDeg: 0.5,
    }),
    page_cleanup: Object.freeze({
      maskScanSize: 50,
      grayfilterSize: 5,
      noisefilterIntensity: 4,
      blackfilterIntensity: 20,
      blurfilterSize: 5,
    }),
  });

  // =============================================================================
  // Helpers (normalization, shaping, estimates)
  // =============================================================================

  function normalizeLangBaseLocal(rawLang) {
    const normalized = String(rawLang || '').trim().toLowerCase().replace(/_/g, '-');
    if (!normalized) return '';
    const idx = normalized.indexOf('-');
    return idx > 0 ? normalized.slice(0, idx) : normalized;
  }

  function normalizeAvailableUiLanguages(list) {
    const values = Array.isArray(list)
      ? list.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    return Array.from(new Set(values));
  }

  function clampToStep(raw, { min, max, step, fallback }) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    const stepped = Math.round((n - min) / step) * step + min;
    return Math.min(max, Math.max(min, Math.floor(stepped)));
  }

  function resolveStepDecimals(step) {
    const text = String(step);
    const dotIdx = text.indexOf('.');
    if (dotIdx < 0) return 0;
    return Math.max(0, Math.min(6, text.length - dotIdx - 1));
  }

  function clampToSteppedNumber(raw, { min, max, step, fallback, integer = false }) {
    const n = Number(raw);
    const fallbackNum = Number(fallback);
    const inputValue = Number.isFinite(n)
      ? n
      : (Number.isFinite(fallbackNum) ? fallbackNum : min);
    const stepValue = Number.isFinite(Number(step)) && Number(step) > 0
      ? Number(step)
      : 1;
    const stepped = Math.round((inputValue - min) / stepValue) * stepValue + min;
    const clamped = Math.min(max, Math.max(min, stepped));
    if (integer) return Math.round(clamped);
    const decimals = resolveStepDecimals(stepValue);
    return Number(clamped.toFixed(decimals));
  }

  function getOcrPresetConfig(presetKey) {
    if (Object.prototype.hasOwnProperty.call(OCR_PRESET_VALUES, presetKey)) {
      return OCR_PRESET_VALUES[presetKey];
    }
    return OCR_PRESET_VALUES.balanced;
  }

  function formatDurationFromSeconds(rawSeconds) {
    const total = Math.max(0, Math.floor(Number(rawSeconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
  }

  function getSafeOcrPageCount(rawPages) {
    const n = Number(rawPages);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.floor(n);
  }

  function normalizePresetKey(rawValue, fallback = 'balanced') {
    const value = String(rawValue || '').trim().toLowerCase();
    if (value === 'fast' || value === 'balanced' || value === 'high_accuracy' || value === 'custom') {
      return value;
    }
    return fallback;
  }

  function normalizeDpiValue(rawDpi, fallbackDpi) {
    return clampToStep(rawDpi, {
      min: OCR_DPI_MIN,
      max: OCR_DPI_MAX,
      step: OCR_DPI_STEP,
      fallback: fallbackDpi,
    });
  }

  function normalizeTimeoutPerPageSec(rawTimeoutSec, fallbackSec) {
    return clampToStep(rawTimeoutSec, {
      min: OCR_TIMEOUT_MIN,
      max: OCR_TIMEOUT_MAX,
      step: OCR_TIMEOUT_STEP,
      fallback: fallbackSec,
    });
  }

  function normalizeOcrPsmValue(rawPsm, fallback = OCR_PSM_DEFAULT) {
    const fallbackNum = Number.isFinite(Number(fallback))
      ? Math.floor(Number(fallback))
      : OCR_PSM_DEFAULT;
    const normalizedFallback = OCR_PSM_ALLOWED_VALUES.includes(fallbackNum)
      ? fallbackNum
      : OCR_PSM_DEFAULT;
    const n = Number(rawPsm);
    if (!Number.isFinite(n)) return normalizedFallback;
    const candidate = Math.floor(n);
    if (!OCR_PSM_ALLOWED_VALUES.includes(candidate)) return normalizedFallback;
    return candidate;
  }

  function normalizePreprocessMode(rawMode, fallback = 'off') {
    const mode = String(rawMode || '').trim().toLowerCase();
    if (PREPROCESS_MODE_VALUES.includes(mode)) return mode;
    return fallback;
  }

  function normalizePreprocessManualField(rawValue, rule, fallbackValue) {
    if (!rule || typeof rule !== 'object') {
      return Number.isFinite(Number(fallbackValue)) ? Number(fallbackValue) : 0;
    }
    const integer = String(rule.type || '').trim().toLowerCase() === 'integer';
    return clampToSteppedNumber(rawValue, {
      min: Number(rule.min),
      max: Number(rule.max),
      step: Number(rule.step),
      fallback: fallbackValue,
      integer,
    });
  }

  function buildDefaultPreprocessConfig() {
    return {
      operations: {
        normalize_contrast: { mode: 'off' },
        local_illumination_correction: { mode: 'off' },
        adaptive_contrast: { mode: 'off' },
        binarize: { mode: 'off' },
        denoise: { mode: 'off' },
        text_sharpen: { mode: 'off' },
        deskew: { mode: 'off' },
        page_cleanup: { mode: 'off' },
      },
    };
  }

  function normalizePreprocessConfig(rawConfig) {
    const rawOperations = rawConfig
      && typeof rawConfig === 'object'
      && rawConfig.operations
      && typeof rawConfig.operations === 'object'
      ? rawConfig.operations
      : {};
    const normalizedOperations = {};

    PREPROCESS_OPERATION_ORDER.forEach((operationKey) => {
      const rawOperation = rawOperations
        && rawOperations[operationKey]
        && typeof rawOperations[operationKey] === 'object'
        ? rawOperations[operationKey]
        : {};
      const mode = normalizePreprocessMode(rawOperation.mode, 'off');
      if (mode !== 'manual') {
        normalizedOperations[operationKey] = { mode };
        return;
      }
      const rules = PREPROCESS_OPERATION_MANUAL_RULES[operationKey] || {};
      const defaults = PREPROCESS_MANUAL_DEFAULTS[operationKey] || {};
      const rawManual = rawOperation.manual && typeof rawOperation.manual === 'object'
        ? rawOperation.manual
        : {};
      const manual = {};
      Object.keys(rules).forEach((fieldKey) => {
        manual[fieldKey] = normalizePreprocessManualField(
          rawManual[fieldKey],
          rules[fieldKey],
          defaults[fieldKey]
        );
      });
      normalizedOperations[operationKey] = { mode, manual };
    });

    return {
      operations: normalizedOperations,
    };
  }

  function areAllPreprocessOperationsOff(preprocessConfig) {
    const normalized = normalizePreprocessConfig(preprocessConfig);
    return PREPROCESS_OPERATION_ORDER.every((operationKey) => {
      const op = normalized.operations[operationKey];
      return op && op.mode === 'off';
    });
  }

  function buildQueuedJobMeta(raw = {}) {
    const preset = normalizePresetKey(raw.preset || raw.qualityPreset, 'balanced');
    const presetCfg = getOcrPresetConfig(preset === 'custom' ? 'balanced' : preset);
    const fallbackDpi = presetCfg.dpi;
    const fallbackTimeout = presetCfg.timeoutPerPageSec;
    return {
      preset,
      dpi: normalizeDpiValue(raw.dpi, fallbackDpi),
      timeoutPerPageSec: normalizeTimeoutPerPageSec(raw.timeoutPerPageSec, fallbackTimeout),
      psm: normalizeOcrPsmValue(raw.psm, OCR_PSM_DEFAULT),
    };
  }

  function getDpiEstimateRatio(rawDpi) {
    const dpi = normalizeDpiValue(rawDpi, OCR_PRESET_VALUES.balanced.dpi);
    const ratio = dpi / OCR_ESTIMATE_BASE_DPI;
    return Math.max(0.25, Math.min(3, ratio));
  }

  function estimateRasterSecPerPage(dpi) {
    const ratio = getDpiEstimateRatio(dpi);
    const estimate = OCR_ESTIMATE_BASE_RASTER_SEC_PER_PAGE
      * Math.pow(ratio, OCR_ESTIMATE_RASTER_EXPONENT);
    return Math.max(OCR_ESTIMATE_MIN_RASTER_SEC_PER_PAGE, estimate);
  }

  function estimateOcrSecPerPage(dpi) {
    const ratio = getDpiEstimateRatio(dpi);
    const estimate = OCR_ESTIMATE_BASE_OCR_SEC_PER_PAGE
      * Math.pow(ratio, OCR_ESTIMATE_OCR_EXPONENT);
    return Math.max(OCR_ESTIMATE_MIN_OCR_SEC_PER_PAGE, estimate);
  }

  function estimateTotalSecPerPage(dpi) {
    return estimateRasterSecPerPage(dpi) + estimateOcrSecPerPage(dpi);
  }

  function estimateTotalSecForPages(pageCount, dpi) {
    const pages = getSafeOcrPageCount(pageCount);
    return estimateTotalSecPerPage(dpi) * pages;
  }

  function formatSecPerPageForGuidance(rawSec) {
    const n = Number(rawSec);
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n < 10) {
      const rounded = Math.round(n * 10) / 10;
      return String(rounded).replace(/\.0$/, '');
    }
    return String(Math.round(n));
  }

  function inferEtaMs(elapsedMs, pageDone, pageTotal) {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null;
    if (!Number.isFinite(pageDone) || !Number.isFinite(pageTotal)) return null;
    if (pageDone <= 0 || pageTotal <= 0 || pageDone >= pageTotal) return null;
    const remainingPages = pageTotal - pageDone;
    return Math.max(0, Math.round((elapsedMs / pageDone) * remainingPages));
  }

  function normalizeStageKey(rawStage) {
    return String(rawStage || '').trim().toLowerCase();
  }

  function getKnownOcrPageTotal(rawPageTotal) {
    return Number.isFinite(rawPageTotal) ? Math.max(0, Math.floor(rawPageTotal)) : 0;
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.ImportOcrUiShared = Object.freeze({
    OCR_PRESET_VALUES,
    OCR_PSM_DEFAULT,
    OCR_PSM_ALLOWED_VALUES,
    PREPROCESS_MODE_VALUES,
    PREPROCESS_OPERATION_ORDER,
    PREPROCESS_OPERATION_MANUAL_RULES,
    PREPROCESS_MANUAL_DEFAULTS,
    normalizeLangBaseLocal,
    normalizeAvailableUiLanguages,
    clampToStep,
    clampToSteppedNumber,
    getOcrPresetConfig,
    formatDurationFromSeconds,
    getSafeOcrPageCount,
    normalizePresetKey,
    normalizeDpiValue,
    normalizeTimeoutPerPageSec,
    normalizeOcrPsmValue,
    normalizePreprocessMode,
    normalizePreprocessManualField,
    buildDefaultPreprocessConfig,
    normalizePreprocessConfig,
    areAllPreprocessOperationsOff,
    buildQueuedJobMeta,
    estimateRasterSecPerPage,
    estimateOcrSecPerPage,
    estimateTotalSecPerPage,
    estimateTotalSecForPages,
    formatSecPerPageForGuidance,
    inferEtaMs,
    normalizeStageKey,
    getKnownOcrPageTotal,
  });
})();

// =============================================================================
// End of public/js/import_ocr_ui_shared.js
// =============================================================================
