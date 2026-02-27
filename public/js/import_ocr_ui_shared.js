'use strict';

(() => {
  const OCR_PRESET_VALUES = Object.freeze({
    fast: Object.freeze({ dpi: 220, timeoutPerPageSec: 45, preprocess: 'basic' }),
    balanced: Object.freeze({ dpi: 300, timeoutPerPageSec: 90, preprocess: 'standard' }),
    high_accuracy: Object.freeze({ dpi: 400, timeoutPerPageSec: 180, preprocess: 'aggressive' }),
  });
  const OCR_DPI_MIN = 150;
  const OCR_DPI_MAX = 600;
  const OCR_DPI_STEP = 25;
  const OCR_TIMEOUT_MIN = 30;
  const OCR_TIMEOUT_MAX = 600;
  const OCR_TIMEOUT_STEP = 15;
  const OCR_PREPROCESS_LIST = Object.freeze(['basic', 'standard', 'aggressive']);
  const OCR_ESTIMATE_BASE_DPI = 300;
  const OCR_ESTIMATE_BASE_RASTER_SEC_PER_PAGE = 3.0;
  const OCR_ESTIMATE_BASE_OCR_SEC_PER_PAGE = 3.6;
  const OCR_ESTIMATE_RASTER_EXPONENT = 2.6;
  const OCR_ESTIMATE_OCR_EXPONENT = 1.6;
  const OCR_ESTIMATE_MIN_RASTER_SEC_PER_PAGE = 1.8;
  const OCR_ESTIMATE_MIN_OCR_SEC_PER_PAGE = 2.3;
  const OCR_PREPROCESS_ESTIMATE_FACTOR = Object.freeze({
    basic: 1.0,
    standard: 1.0,
    aggressive: 1.0,
  });

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

  function normalizePreprocessProfile(rawValue, fallback = 'standard') {
    const value = String(rawValue || '').trim().toLowerCase();
    if (OCR_PREPROCESS_LIST.includes(value)) return value;
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

  function buildQueuedJobMeta(raw = {}) {
    const preset = normalizePresetKey(raw.preset || raw.qualityPreset, 'balanced');
    const presetCfg = getOcrPresetConfig(preset === 'custom' ? 'balanced' : preset);
    const fallbackDpi = presetCfg.dpi;
    const fallbackTimeout = presetCfg.timeoutPerPageSec;
    const fallbackPreprocess = presetCfg.preprocess;
    return {
      preset,
      dpi: normalizeDpiValue(raw.dpi, fallbackDpi),
      timeoutPerPageSec: normalizeTimeoutPerPageSec(raw.timeoutPerPageSec, fallbackTimeout),
      preprocessProfile: normalizePreprocessProfile(raw.preprocessProfile || raw.preprocess, fallbackPreprocess),
    };
  }

  function getEstimatePreprocessFactor(preprocessProfile) {
    const normalized = normalizePreprocessProfile(preprocessProfile, 'standard');
    const factor = OCR_PREPROCESS_ESTIMATE_FACTOR[normalized];
    return Number.isFinite(factor) && factor > 0 ? factor : 1.0;
  }

  function getDpiEstimateRatio(rawDpi) {
    const dpi = normalizeDpiValue(rawDpi, OCR_PRESET_VALUES.balanced.dpi);
    const ratio = dpi / OCR_ESTIMATE_BASE_DPI;
    return Math.max(0.25, Math.min(3, ratio));
  }

  function estimateRasterSecPerPage(dpi, preprocessProfile) {
    const ratio = getDpiEstimateRatio(dpi);
    const profileFactor = getEstimatePreprocessFactor(preprocessProfile);
    const estimate = OCR_ESTIMATE_BASE_RASTER_SEC_PER_PAGE
      * Math.pow(ratio, OCR_ESTIMATE_RASTER_EXPONENT)
      * profileFactor;
    return Math.max(OCR_ESTIMATE_MIN_RASTER_SEC_PER_PAGE, estimate);
  }

  function estimateOcrSecPerPage(dpi, preprocessProfile) {
    const ratio = getDpiEstimateRatio(dpi);
    const profileFactor = getEstimatePreprocessFactor(preprocessProfile);
    const estimate = OCR_ESTIMATE_BASE_OCR_SEC_PER_PAGE
      * Math.pow(ratio, OCR_ESTIMATE_OCR_EXPONENT)
      * profileFactor;
    return Math.max(OCR_ESTIMATE_MIN_OCR_SEC_PER_PAGE, estimate);
  }

  function estimateTotalSecPerPage(dpi, preprocessProfile) {
    return estimateRasterSecPerPage(dpi, preprocessProfile) + estimateOcrSecPerPage(dpi, preprocessProfile);
  }

  function estimateTotalSecForPages(pageCount, dpi, preprocessProfile) {
    const pages = getSafeOcrPageCount(pageCount);
    return estimateTotalSecPerPage(dpi, preprocessProfile) * pages;
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

  window.ImportOcrUiShared = Object.freeze({
    OCR_PRESET_VALUES,
    OCR_PREPROCESS_LIST,
    normalizeLangBaseLocal,
    normalizeAvailableUiLanguages,
    clampToStep,
    getOcrPresetConfig,
    formatDurationFromSeconds,
    getSafeOcrPageCount,
    normalizePresetKey,
    normalizePreprocessProfile,
    normalizeDpiValue,
    normalizeTimeoutPerPageSec,
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
