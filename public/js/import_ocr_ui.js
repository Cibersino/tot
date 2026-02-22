'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own Import/OCR UI surfaces in main window:
//   - OCR progress panel + cancel button visibility text
//   - Import apply choice modal (Overwrite / Append)
//   - Shared OCR options modal (preset/language/custom controls)
// - Keep OCR UI behavior cohesive so renderer.js stays orchestration-focused.
// =============================================================================

(() => {
  const btnCancelOcr = document.getElementById('btnCancelOcr');
  const ocrProgressPanel = document.getElementById('ocrProgressPanel');
  const ocrProgressText = document.getElementById('ocrProgressText');
  const ocrProgressStageText = document.getElementById('ocrProgressStage');
  const ocrProgressPagesText = document.getElementById('ocrProgressPages');
  const ocrProgressElapsedText = document.getElementById('ocrProgressElapsed');
  const ocrProgressEtaText = document.getElementById('ocrProgressEta');

  const importApplyModal = document.getElementById('importApplyModal');
  const importApplyBackdrop = document.getElementById('importApplyBackdrop');
  const importApplyTitle = document.getElementById('importApplyTitle');
  const btnImportApplyOverwrite = document.getElementById('btnImportApplyOverwrite');
  const btnImportApplyAppend = document.getElementById('btnImportApplyAppend');

  const ocrOptionsModal = document.getElementById('ocrOptionsModal');
  const ocrOptionsBackdrop = document.getElementById('ocrOptionsBackdrop');
  const ocrOptionsTitle = document.getElementById('ocrOptionsTitle');
  const ocrOptionsContext = document.getElementById('ocrOptionsContext');
  const ocrPresetLabel = document.getElementById('ocrPresetLabel');
  const ocrPresetSelect = document.getElementById('ocrPresetSelect');
  const ocrLanguageLabel = document.getElementById('ocrLanguageLabel');
  const ocrLanguageSelect = document.getElementById('ocrLanguageSelect');
  const ocrDpiLabel = document.getElementById('ocrDpiLabel');
  const ocrDpiInput = document.getElementById('ocrDpiInput');
  const ocrTimeoutLabel = document.getElementById('ocrTimeoutLabel');
  const ocrTimeoutInput = document.getElementById('ocrTimeoutInput');
  const ocrPreprocessLabel = document.getElementById('ocrPreprocessLabel');
  const ocrPreprocessSelect = document.getElementById('ocrPreprocessSelect');
  const ocrPresetGuidance = document.getElementById('ocrPresetGuidance');
  const ocrTotalGuidance = document.getElementById('ocrTotalGuidance');
  const ocrTotalDisclaimer = document.getElementById('ocrTotalDisclaimer');
  const btnOcrOptionsStart = document.getElementById('btnOcrOptionsStart');
  const btnOcrOptionsAbort = document.getElementById('btnOcrOptionsAbort');

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

  let lockActive = false;
  let lockReason = '';

  let ocrProgressJobId = '';
  let ocrProgressStartedAt = 0;
  let ocrProgressPageDone = 0;
  let ocrProgressPageTotal = 0;
  let ocrProgressStage = '';
  const ocrQueuedJobMetaById = new Map();
  let ocrProgressMeta = {
    preset: 'balanced',
    dpi: OCR_PRESET_VALUES.balanced.dpi,
    timeoutPerPageSec: OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
    preprocessProfile: OCR_PRESET_VALUES.balanced.preprocess,
  };

  let importApplyResolve = null;
  let ocrOptionsResolve = null;
  let ocrOptionsPageCount = 1;
  let ocrOptionsFileKind = '';
  let ocrOptionsFilename = '';

  let currentUiLanguage = 'en';
  let defaultLanguage = 'en';
  let tRendererFn = (_key, fallback = '') => fallback;
  let msgRendererFn = null;
  let listenersBound = false;
  const log = (window.getLogger && typeof window.getLogger === 'function')
    ? window.getLogger('import-ocr-ui')
    : {
      warn: () => {},
      warnOnce: () => {},
    };

  function t(key, fallback = '') {
    try {
      return typeof tRendererFn === 'function' ? tRendererFn(key, fallback) : fallback;
    } catch {
      return fallback;
    }
  }

  function msg(key, params = {}, fallback = '') {
    if (typeof msgRendererFn === 'function') {
      try {
        return msgRendererFn(key, params, fallback);
      } catch {
        // fallback path below
      }
    }
    let text = t(key, fallback);
    Object.keys(params || {}).forEach((k) => {
      text = String(text).replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k]));
    });
    return text;
  }

  function normalizeLangBaseLocal(rawLang) {
    const normalized = String(rawLang || '').trim().toLowerCase().replace(/_/g, '-');
    if (!normalized) return '';
    const idx = normalized.indexOf('-');
    return idx > 0 ? normalized.slice(0, idx) : normalized;
  }

  function getDefaultOcrLanguageFromUi() {
    return normalizeLangBaseLocal(currentUiLanguage || defaultLanguage || '');
  }

  function normalizeAvailableUiLanguages(list) {
    const values = Array.isArray(list)
      ? list.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    return Array.from(new Set(values));
  }

  function getAvailableOcrLanguagesFromSelect() {
    if (!ocrLanguageSelect) return [];
    const values = [];
    const opts = ocrLanguageSelect.querySelectorAll('option');
    opts.forEach((opt) => {
      if (!opt) return;
      const value = String(opt.value || '').trim().toLowerCase();
      if (!value) return;
      values.push(value);
    });
    return Array.from(new Set(values));
  }

  function resolvePreferredOcrLanguage(availableUiLanguages) {
    const available = normalizeAvailableUiLanguages(availableUiLanguages);
    if (!available.length) return '';

    const activeBase = normalizeLangBaseLocal(currentUiLanguage || '');
    if (activeBase && available.includes(activeBase)) return activeBase;

    const fallbackBase = normalizeLangBaseLocal(defaultLanguage || '');
    if (fallbackBase && available.includes(fallbackBase)) {
      if (activeBase && activeBase !== fallbackBase) {
        log.warnOnce(
          `import-ocr-ui.ocr-lang-fallback.${activeBase}->${fallbackBase}`,
          `OCR language fallback applied (active unavailable). active='${activeBase}' fallback='${fallbackBase}'.`
        );
      }
      return fallbackBase;
    }

    const chosen = available[0];
    if (chosen && activeBase && activeBase !== chosen) {
      log.warnOnce(
        `import-ocr-ui.ocr-lang-fallback.${activeBase}->${chosen}`,
        `OCR language fallback applied (active/app-default unavailable). active='${activeBase}' chosen='${chosen}' available=${available.join(',')}.`
      );
    }
    return chosen;
  }

  function setOcrLanguageOptions(availableUiLanguages) {
    if (!ocrLanguageSelect) return [];
    const available = normalizeAvailableUiLanguages(availableUiLanguages);
    ocrLanguageSelect.innerHTML = '';
    available.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      ocrLanguageSelect.appendChild(option);
    });
    return available;
  }

  function formatElapsedLabel(ms) {
    const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
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

  function setOcrProgressStage(stage) {
    const normalized = normalizeStageKey(stage);
    if (!normalized) return;
    if (normalized !== ocrProgressStage) {
      ocrProgressStage = normalized;
    }
  }

  function getKnownOcrPageTotal(rawPageTotal) {
    return Number.isFinite(rawPageTotal) ? Math.max(0, Math.floor(rawPageTotal)) : 0;
  }

  function inferStageAwareEtaMs({ elapsedMs, pageDone, pageTotal }) {
    const knownTotal = getKnownOcrPageTotal(pageTotal);
    if (knownTotal <= 0) {
      return inferEtaMs(elapsedMs, pageDone, pageTotal);
    }
    const safeDone = Number.isFinite(pageDone) ? Math.max(0, Math.floor(pageDone)) : 0;
    const stage = normalizeStageKey(ocrProgressStage || lockReason || 'ocr');
    const dpi = normalizeDpiValue(ocrProgressMeta.dpi, OCR_PRESET_VALUES.balanced.dpi);
    const preprocess = normalizePreprocessProfile(
      ocrProgressMeta.preprocessProfile,
      OCR_PRESET_VALUES.balanced.preprocess
    );
    const rasterSecPerPage = estimateRasterSecPerPage(dpi, preprocess);
    const ocrSecPerPage = estimateOcrSecPerPage(dpi, preprocess);
    const remainingPages = Math.max(0, knownTotal - Math.min(safeDone, knownTotal));

    if (remainingPages <= 0 || stage === 'completed') return 0;
    if (stage === 'failed' || stage === 'canceled') return null;

    // v2 alternates rasterizing/ocr per page; completed-page throughput is the stable live ETA.
    if (safeDone > 0 && elapsedMs > 0) {
      return Math.max(0, Math.round((elapsedMs / safeDone) * remainingPages));
    }

    if (stage === 'rasterizing') {
      return Math.max(0, Math.round((rasterSecPerPage + ocrSecPerPage) * remainingPages * 1000));
    }

    if (stage === 'ocr') {
      const remainingRasterPages = Math.max(0, remainingPages - 1);
      const ocrRemainingMs = Math.round(ocrSecPerPage * remainingPages * 1000);
      const rasterRemainingMs = Math.round(rasterSecPerPage * remainingRasterPages * 1000);
      return Math.max(0, ocrRemainingMs + rasterRemainingMs);
    }

    if (stage === 'queued' || stage === 'running' || stage === 'extracting' || stage === 'preflight') {
      const totalEstimateMs = Math.round((rasterSecPerPage + ocrSecPerPage) * knownTotal * 1000);
      return Math.max(0, totalEstimateMs - elapsedMs);
    }

    return inferEtaMs(elapsedMs, safeDone, knownTotal);
  }

  function getStageLabel(stage) {
    const normalized = String(stage || '').toLowerCase();
    if (normalized === 'queued') return t('renderer.main.import_progress.stage_queued', 'Queued');
    if (normalized === 'running' || normalized === 'ocr_running') return t('renderer.main.import_progress.stage_running', 'Running');
    if (normalized === 'extracting') return t('renderer.main.import_progress.stage_extracting', 'Extracting...');
    if (normalized === 'preflight') return t('renderer.main.import_progress.stage_preflight', 'Preparing...');
    if (normalized === 'rasterizing') return t('renderer.main.import_progress.stage_rasterizing', 'Rasterizing...');
    if (normalized === 'ocr') return t('renderer.main.import_progress.stage_ocr', 'OCR...');
    if (normalized === 'finalizing') return t('renderer.main.import_progress.stage_finalizing', 'Finalizing...');
    if (normalized === 'completed') return t('renderer.main.import_progress.stage_completed', 'Completed');
    if (normalized === 'failed') return t('renderer.main.import_progress.stage_failed', 'Failed');
    if (normalized === 'canceled') return t('renderer.main.import_progress.stage_canceled', 'Canceled');
    return t('renderer.main.import_progress.stage_ocr', 'OCR');
  }

  function hasOcrProgressSegments() {
    return !!(ocrProgressStageText && ocrProgressPagesText && ocrProgressElapsedText && ocrProgressEtaText);
  }

  function setOcrProgressFallbackText(text) {
    const message = String(text || '');
    if (!ocrProgressText) return;
    if (hasOcrProgressSegments()) {
      ocrProgressStageText.textContent = message;
      ocrProgressPagesText.textContent = '';
      ocrProgressElapsedText.textContent = '';
      ocrProgressEtaText.textContent = '';
      return;
    }
    ocrProgressText.textContent = message;
  }

  function setOcrProgressSegmentsText(stageText, pagesText, elapsedText, etaText) {
    if (!ocrProgressText) return;
    if (hasOcrProgressSegments()) {
      ocrProgressStageText.textContent = String(stageText || '');
      ocrProgressPagesText.textContent = String(pagesText || '');
      ocrProgressElapsedText.textContent = String(elapsedText || '');
      ocrProgressEtaText.textContent = String(etaText || '');
      return;
    }
    ocrProgressText.textContent = `${stageText} · ${pagesText} · ${elapsedText} · ${etaText}`;
  }

  function resetOcrProgressState() {
    if (ocrProgressJobId) ocrQueuedJobMetaById.delete(ocrProgressJobId);
    ocrProgressJobId = '';
    ocrProgressStartedAt = 0;
    ocrProgressPageDone = 0;
    ocrProgressPageTotal = 0;
    ocrProgressStage = '';
    ocrProgressMeta = {
      preset: 'balanced',
      dpi: OCR_PRESET_VALUES.balanced.dpi,
      timeoutPerPageSec: OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
      preprocessProfile: OCR_PRESET_VALUES.balanced.preprocess,
    };
    setOcrProgressFallbackText(t('renderer.main.import_apply.ocr_running', 'OCR in progress...'));
  }

  function updateOcrProgressText() {
    if (!ocrProgressText) return;
    if (!lockActive) {
      setOcrProgressFallbackText(t('renderer.main.import_apply.ocr_running', 'OCR in progress...'));
      return;
    }

    const startedAt = ocrProgressStartedAt || Date.now();
    const nowTs = Date.now();
    const elapsedMs = Math.max(0, nowTs - startedAt);
    const stageLabel = getStageLabel(ocrProgressStage || lockReason || 'ocr');

    const safeDone = Number.isFinite(ocrProgressPageDone) ? Math.max(0, Math.floor(ocrProgressPageDone)) : 0;
    const safeTotal = Number.isFinite(ocrProgressPageTotal) ? Math.max(0, Math.floor(ocrProgressPageTotal)) : 0;
    const knownTotal = getKnownOcrPageTotal(safeTotal);
    const pageLabel = knownTotal > 0
      ? `${Math.min(safeDone, knownTotal)}/${knownTotal}`
      : '-/-';

    const etaMs = inferStageAwareEtaMs({
      elapsedMs,
      pageDone: safeDone,
      pageTotal: knownTotal,
    });
    const etaLabel = etaMs == null ? '--' : formatElapsedLabel(etaMs);
    const pagesWord = t('renderer.main.import_progress.pages', 'pages');
    const elapsedWord = t('renderer.main.import_progress.elapsed', 'elapsed');
    const etaWord = t('renderer.main.import_progress.eta', 'ETA');
    setOcrProgressSegmentsText(
      stageLabel,
      `${pagesWord} ${pageLabel}`,
      `${elapsedWord} ${formatElapsedLabel(elapsedMs)}`,
      `${etaWord} ${etaLabel}`
    );
  }

  function syncOcrControlVisibility() {
    if (btnCancelOcr) btnCancelOcr.hidden = !lockActive;
    if (ocrProgressPanel) ocrProgressPanel.hidden = !lockActive;

    if (lockActive) {
      if (!ocrProgressStartedAt) ocrProgressStartedAt = Date.now();
      updateOcrProgressText();
      return;
    }
    resetOcrProgressState();
  }

  function setLockState(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    lockActive = !!p.locked;
    lockReason = lockActive ? String(p.reason || 'OCR_RUNNING') : '';
    syncOcrControlVisibility();
  }

  function handleImportProgress(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    if (typeof p.jobId === 'string' && p.jobId) {
      const nextJobId = p.jobId.trim();
      if (nextJobId && nextJobId !== ocrProgressJobId) {
        ocrProgressJobId = nextJobId;
        const queuedMeta = ocrQueuedJobMetaById.get(nextJobId);
        if (queuedMeta) setActiveProgressMeta(queuedMeta);
      } else if (nextJobId) {
        ocrProgressJobId = nextJobId;
      }
    }

    if (!ocrProgressStartedAt) {
      const heartbeatTs = Number(p.heartbeatTs);
      ocrProgressStartedAt = Number.isFinite(heartbeatTs) && heartbeatTs > 0
        ? heartbeatTs
        : Date.now();
    }
    if (typeof p.stage === 'string' && p.stage.trim()) {
      setOcrProgressStage(p.stage.trim());
    }
    if (Number.isFinite(Number(p.pageDone))) ocrProgressPageDone = Number(p.pageDone);
    if (Number.isFinite(Number(p.pageTotal))) {
      ocrProgressPageTotal = Number(p.pageTotal);
    }

    updateOcrProgressText();
  }

  function noteJobQueued(payload) {
    const p = (payload && typeof payload === 'object')
      ? payload
      : { jobId: payload };
    const jobId = typeof p.jobId === 'string' ? p.jobId.trim() : '';
    if (!jobId) return;
    const queuedMeta = buildQueuedJobMeta(p);
    ocrQueuedJobMetaById.set(jobId, queuedMeta);
    setActiveProgressMeta(queuedMeta);
    ocrProgressJobId = jobId;
    ocrProgressStartedAt = Date.now();
    setOcrProgressStage('queued');
    ocrProgressPageDone = 0;
    ocrProgressPageTotal = 0;
    updateOcrProgressText();
  }

  function markImportFinished(payload) {
    const p = payload && typeof payload === 'object' ? payload : {};
    const jobId = typeof p.jobId === 'string' ? p.jobId : '';
    if (!jobId || !ocrProgressJobId || jobId !== ocrProgressJobId) return;

    if (p.ok) {
      setOcrProgressStage('completed');
      ocrProgressPageDone = Math.max(ocrProgressPageDone, ocrProgressPageTotal || 0);
    } else {
      const nextStage = String(p.code || '').toUpperCase() === 'OCR_CANCELED' ? 'canceled' : 'failed';
      setOcrProgressStage(nextStage);
    }
    ocrQueuedJobMetaById.delete(jobId);
    updateOcrProgressText();
  }

  function showImportApplyModal() {
    if (!importApplyModal) return;
    importApplyModal.setAttribute('aria-hidden', 'false');
    if (btnImportApplyOverwrite && typeof btnImportApplyOverwrite.focus === 'function') {
      btnImportApplyOverwrite.focus();
    }
  }

  function hideImportApplyModal() {
    if (!importApplyModal) return;
    importApplyModal.setAttribute('aria-hidden', 'true');
  }

  function settleImportApplyChoice(mode) {
    const resolve = importApplyResolve;
    importApplyResolve = null;
    hideImportApplyModal();
    if (typeof resolve === 'function') resolve(mode);
  }

  function getImportApplyTitle(options = {}) {
    const fallbackTitle = importApplyTitle
      ? (importApplyTitle.textContent || '')
      : 'Import finished. Choose apply mode:';
    const baseTitle = t('renderer.main.import_apply.title', fallbackTitle);
    const opts = options && typeof options === 'object' ? options : {};
    if (!opts.isOcrJob) return baseTitle;

    const summary = opts.summary && typeof opts.summary === 'object' ? opts.summary : {};
    const elapsedMs = Number(summary.elapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return baseTitle;

    const elapsed = formatElapsedLabel(elapsedMs);
    return msg(
      'renderer.main.import_apply.title_with_elapsed',
      { elapsed },
      `${baseTitle} OCR completed in ${elapsed}.`
    );
  }

  function chooseApplyMode(options = {}) {
    const applyTitle = getImportApplyTitle(options);
    if (importApplyTitle) importApplyTitle.textContent = applyTitle;

    if (
      !importApplyModal
      || !btnImportApplyOverwrite
      || !btnImportApplyAppend
    ) {
      const fallbackRaw = window.prompt(
        `${applyTitle} OVERWRITE or APPEND`,
        'OVERWRITE'
      );
      const fallbackMode = String(fallbackRaw || '').trim().toLowerCase();
      if (fallbackMode === 'overwrite' || fallbackMode === 'append') {
        return Promise.resolve(fallbackMode);
      }
      return Promise.resolve('');
    }

    if (importApplyResolve) settleImportApplyChoice('');
    return new Promise((resolve) => {
      importApplyResolve = resolve;
      showImportApplyModal();
    });
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

  function setActiveProgressMeta(meta) {
    const safeMeta = buildQueuedJobMeta(meta || {});
    ocrProgressMeta = safeMeta;
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

  function getSelectedOcrPresetKey() {
    const value = ocrPresetSelect && typeof ocrPresetSelect.value === 'string'
      ? ocrPresetSelect.value
      : '';
    return normalizePresetKey(value, 'balanced');
  }

  function getSelectedOcrPreprocess() {
    const value = ocrPreprocessSelect && typeof ocrPreprocessSelect.value === 'string'
      ? ocrPreprocessSelect.value
      : '';
    return normalizePreprocessProfile(value, 'standard');
  }

  function syncOcrCustomControlState() {
    const isCustom = getSelectedOcrPresetKey() === 'custom';
    if (ocrDpiInput) ocrDpiInput.disabled = !isCustom;
    if (ocrTimeoutInput) ocrTimeoutInput.disabled = !isCustom;
    if (ocrPreprocessSelect) ocrPreprocessSelect.disabled = !isCustom;
  }

  function applyPresetValuesToControls(presetKey) {
    const key = presetKey || 'balanced';
    if (key === 'custom') {
      syncOcrCustomControlState();
      return;
    }
    const cfg = getOcrPresetConfig(key);
    if (ocrDpiInput) ocrDpiInput.value = String(cfg.dpi);
    if (ocrTimeoutInput) ocrTimeoutInput.value = String(cfg.timeoutPerPageSec);
    if (ocrPreprocessSelect) ocrPreprocessSelect.value = cfg.preprocess;
    syncOcrCustomControlState();
  }

  function normalizeOcrControlValues() {
    const preset = getSelectedOcrPresetKey();
    if (preset === 'custom') {
      const normalizedDpi = normalizeDpiValue(
        ocrDpiInput ? ocrDpiInput.value : OCR_PRESET_VALUES.balanced.dpi,
        OCR_PRESET_VALUES.balanced.dpi
      );
      const normalizedTimeout = normalizeTimeoutPerPageSec(
        ocrTimeoutInput ? ocrTimeoutInput.value : OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
        OCR_PRESET_VALUES.balanced.timeoutPerPageSec
      );
      if (ocrDpiInput) ocrDpiInput.value = String(normalizedDpi);
      if (ocrTimeoutInput) ocrTimeoutInput.value = String(normalizedTimeout);
      if (ocrPreprocessSelect) ocrPreprocessSelect.value = getSelectedOcrPreprocess();
      return;
    }
    applyPresetValuesToControls(preset);
  }

  function updateOcrOptionsContextText() {
    if (!ocrOptionsContext) return;
    const filename = ocrOptionsFilename || '';
    if (ocrOptionsFileKind === 'image') {
      ocrOptionsContext.textContent = msg(
        'renderer.main.ocr_options.context_image',
        { filename },
        filename ? `File: ${filename} - image OCR` : 'Image OCR'
      );
      return;
    }
    if (ocrOptionsFileKind === 'pdf') {
      ocrOptionsContext.textContent = msg(
        'renderer.main.ocr_options.context_pdf_scanned',
        { filename },
        filename ? `File: ${filename} - scanned PDF OCR` : 'Scanned PDF OCR'
      );
      return;
    }
    ocrOptionsContext.textContent = msg(
      'renderer.main.ocr_options.context_generic',
      { filename },
      filename ? `File: ${filename}` : 'OCR'
    );
  }

  function updateOcrOptionsGuidanceText() {
    if (ocrPresetGuidance) {
      const fastEstimate = estimateTotalSecPerPage(OCR_PRESET_VALUES.fast.dpi, OCR_PRESET_VALUES.fast.preprocess);
      const balancedEstimate = estimateTotalSecPerPage(OCR_PRESET_VALUES.balanced.dpi, OCR_PRESET_VALUES.balanced.preprocess);
      const highEstimate = estimateTotalSecPerPage(
        OCR_PRESET_VALUES.high_accuracy.dpi,
        OCR_PRESET_VALUES.high_accuracy.preprocess
      );
      ocrPresetGuidance.textContent = msg(
        'renderer.main.ocr_options.guidance_presets',
        {
          fast: formatSecPerPageForGuidance(fastEstimate),
          balanced: formatSecPerPageForGuidance(balancedEstimate),
          high: formatSecPerPageForGuidance(highEstimate),
        },
        `Fast ~${formatSecPerPageForGuidance(fastEstimate)}s/page · Balanced ~${formatSecPerPageForGuidance(balancedEstimate)}s/page · High accuracy ~${formatSecPerPageForGuidance(highEstimate)}s/page`
      );
    }

    const preset = getSelectedOcrPresetKey();
    let estimateDpi = OCR_PRESET_VALUES.balanced.dpi;
    let estimatePreprocess = OCR_PRESET_VALUES.balanced.preprocess;
    if (preset === 'custom') {
      estimateDpi = normalizeDpiValue(
        ocrDpiInput ? ocrDpiInput.value : estimateDpi,
        estimateDpi
      );
      estimatePreprocess = getSelectedOcrPreprocess();
    } else {
      const cfg = getOcrPresetConfig(preset);
      estimateDpi = cfg.dpi;
      estimatePreprocess = cfg.preprocess;
    }

    const pages = getSafeOcrPageCount(ocrOptionsPageCount);
    const totalSec = estimateTotalSecForPages(pages, estimateDpi, estimatePreprocess);
    if (ocrTotalGuidance) {
      ocrTotalGuidance.textContent = msg(
        'renderer.main.ocr_options.guidance_total',
        {
          total: formatDurationFromSeconds(totalSec),
          pages,
        },
        `Estimated total: ~${formatDurationFromSeconds(totalSec)} for ${pages} page(s)`
      );
    }
    if (ocrTotalDisclaimer) {
      ocrTotalDisclaimer.textContent = t(
        'renderer.main.ocr_options.guidance_disclaimer',
        '(approximate, depends on document complexity and device performance)'
      );
    }
  }

  function collectNormalizedOcrOptions() {
    const preset = getSelectedOcrPresetKey();
    const availableUiLanguages = getAvailableOcrLanguagesFromSelect();
    const langRaw = ocrLanguageSelect && typeof ocrLanguageSelect.value === 'string'
      ? ocrLanguageSelect.value.trim().toLowerCase()
      : '';
    const language = availableUiLanguages.includes(langRaw)
      ? langRaw
      : resolvePreferredOcrLanguage(availableUiLanguages);

    let dpi = OCR_PRESET_VALUES.balanced.dpi;
    let timeoutPerPageSec = OCR_PRESET_VALUES.balanced.timeoutPerPageSec;
    let preprocessProfile = OCR_PRESET_VALUES.balanced.preprocess;

    if (preset === 'custom') {
      dpi = normalizeDpiValue(
        ocrDpiInput ? ocrDpiInput.value : dpi,
        dpi
      );
      timeoutPerPageSec = normalizeTimeoutPerPageSec(
        ocrTimeoutInput ? ocrTimeoutInput.value : timeoutPerPageSec,
        timeoutPerPageSec
      );
      preprocessProfile = getSelectedOcrPreprocess();
    } else {
      const cfg = getOcrPresetConfig(preset);
      dpi = cfg.dpi;
      timeoutPerPageSec = cfg.timeoutPerPageSec;
      preprocessProfile = cfg.preprocess;
    }

    return {
      qualityPreset: preset,
      preset,
      ocrLanguage: language,
      languageTag: language,
      dpi,
      timeoutPerPageSec,
      preprocessProfile,
    };
  }

  function showOcrOptionsModal() {
    if (!ocrOptionsModal) return;
    ocrOptionsModal.setAttribute('aria-hidden', 'false');
    if (ocrPresetSelect && typeof ocrPresetSelect.focus === 'function') {
      ocrPresetSelect.focus();
    }
  }

  function hideOcrOptionsModal() {
    if (!ocrOptionsModal) return;
    ocrOptionsModal.setAttribute('aria-hidden', 'true');
  }

  function settleOcrOptions(confirmed) {
    const resolve = ocrOptionsResolve;
    ocrOptionsResolve = null;
    hideOcrOptionsModal();
    if (typeof resolve !== 'function') return;
    if (!confirmed) {
      resolve({ confirmed: false, options: null });
      return;
    }
    normalizeOcrControlValues();
    resolve({
      confirmed: true,
      options: collectNormalizedOcrOptions(),
    });
  }

  function promptOcrOptionsDialog({ kind, filename, pageCountHint, availableUiLanguages }) {
    const availableLanguages = normalizeAvailableUiLanguages(availableUiLanguages);
    const preferredLanguage = resolvePreferredOcrLanguage(availableLanguages);
    if (
      !ocrOptionsModal
      || !ocrPresetSelect
      || !ocrLanguageSelect
      || !ocrDpiInput
      || !ocrTimeoutInput
      || !ocrPreprocessSelect
      || !btnOcrOptionsStart
      || !btnOcrOptionsAbort
    ) {
      if (!preferredLanguage) {
        return Promise.resolve({ confirmed: false, options: null });
      }
      return Promise.resolve({
        confirmed: true,
        options: {
          qualityPreset: 'balanced',
          preset: 'balanced',
          ocrLanguage: preferredLanguage,
          languageTag: preferredLanguage,
          dpi: OCR_PRESET_VALUES.balanced.dpi,
          timeoutPerPageSec: OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
          preprocessProfile: OCR_PRESET_VALUES.balanced.preprocess,
        },
      });
    }
    if (!preferredLanguage) {
      return Promise.resolve({ confirmed: false, options: null });
    }

    if (ocrOptionsResolve) settleOcrOptions(false);

    ocrOptionsPageCount = getSafeOcrPageCount(pageCountHint);
    ocrOptionsFileKind = String(kind || '').trim().toLowerCase();
    ocrOptionsFilename = String(filename || '').trim();

    ocrPresetSelect.value = 'balanced';
    setOcrLanguageOptions(availableLanguages);
    ocrLanguageSelect.value = preferredLanguage;
    ocrDpiInput.value = String(OCR_PRESET_VALUES.balanced.dpi);
    ocrTimeoutInput.value = String(OCR_PRESET_VALUES.balanced.timeoutPerPageSec);
    ocrPreprocessSelect.value = OCR_PRESET_VALUES.balanced.preprocess;

    syncOcrCustomControlState();
    updateOcrOptionsContextText();
    updateOcrOptionsGuidanceText();

    showOcrOptionsModal();
    return new Promise((resolve) => {
      ocrOptionsResolve = resolve;
    });
  }

  function isOcrRoute(route) {
    return String(route || '').trim().toLowerCase().startsWith('ocr_');
  }

  function getDefaultRunOptions() {
    const language = getDefaultOcrLanguageFromUi();
    return {
      languageTag: language,
      timeoutPerPageSec: OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
    };
  }

  function setI18n({ tRenderer, msgRenderer } = {}) {
    if (typeof tRenderer === 'function') tRendererFn = tRenderer;
    if (typeof msgRenderer === 'function') msgRendererFn = msgRenderer;
  }

  function setLanguage({ uiLanguage, fallbackLanguage } = {}) {
    if (typeof uiLanguage === 'string' && uiLanguage.trim()) currentUiLanguage = uiLanguage.trim();
    if (typeof fallbackLanguage === 'string' && fallbackLanguage.trim()) defaultLanguage = fallbackLanguage.trim();
  }

  function applyTranslations() {
    if (btnCancelOcr) {
      btnCancelOcr.textContent = t('renderer.main.buttons.cancel_ocr', btnCancelOcr.textContent || '');
      btnCancelOcr.title = t('renderer.main.tooltips.cancel_ocr', btnCancelOcr.title || '');
      const aria = t('renderer.main.aria.cancel_ocr', btnCancelOcr.title || btnCancelOcr.textContent || '');
      if (aria) btnCancelOcr.setAttribute('aria-label', aria);
    }
    if (importApplyTitle) importApplyTitle.textContent = t('renderer.main.import_apply.title', importApplyTitle.textContent || '');
    if (btnImportApplyOverwrite) btnImportApplyOverwrite.textContent = t('renderer.main.import_apply.overwrite', btnImportApplyOverwrite.textContent || '');
    if (btnImportApplyAppend) btnImportApplyAppend.textContent = t('renderer.main.import_apply.append', btnImportApplyAppend.textContent || '');

    if (ocrOptionsTitle) ocrOptionsTitle.textContent = t('renderer.main.ocr_options.title', ocrOptionsTitle.textContent || '');
    if (ocrPresetLabel) ocrPresetLabel.textContent = t('renderer.main.ocr_options.preset_label', ocrPresetLabel.textContent || '');
    if (ocrLanguageLabel) ocrLanguageLabel.textContent = t('renderer.main.ocr_options.language_label', ocrLanguageLabel.textContent || '');
    if (ocrDpiLabel) ocrDpiLabel.textContent = t('renderer.main.ocr_options.dpi_label', ocrDpiLabel.textContent || '');
    if (ocrTimeoutLabel) ocrTimeoutLabel.textContent = t('renderer.main.ocr_options.timeout_label', ocrTimeoutLabel.textContent || '');
    if (ocrPreprocessLabel) ocrPreprocessLabel.textContent = t('renderer.main.ocr_options.preprocess_label', ocrPreprocessLabel.textContent || '');
    if (btnOcrOptionsStart) btnOcrOptionsStart.textContent = t('renderer.main.ocr_options.start', btnOcrOptionsStart.textContent || '');
    if (btnOcrOptionsAbort) btnOcrOptionsAbort.textContent = t('renderer.main.ocr_options.abort', btnOcrOptionsAbort.textContent || '');

    if (ocrPresetSelect) {
      const optFast = ocrPresetSelect.querySelector('option[value="fast"]');
      const optBalanced = ocrPresetSelect.querySelector('option[value="balanced"]');
      const optHigh = ocrPresetSelect.querySelector('option[value="high_accuracy"]');
      const optCustom = ocrPresetSelect.querySelector('option[value="custom"]');
      if (optFast) optFast.textContent = t('renderer.main.ocr_options.preset_fast', optFast.textContent || 'Fast');
      if (optBalanced) optBalanced.textContent = t('renderer.main.ocr_options.preset_balanced', optBalanced.textContent || 'Balanced');
      if (optHigh) optHigh.textContent = t('renderer.main.ocr_options.preset_high_accuracy', optHigh.textContent || 'High accuracy');
      if (optCustom) optCustom.textContent = t('renderer.main.ocr_options.preset_custom', optCustom.textContent || 'Custom');
    }
    if (ocrPreprocessSelect) {
      const optBasic = ocrPreprocessSelect.querySelector('option[value="basic"]');
      const optStandard = ocrPreprocessSelect.querySelector('option[value="standard"]');
      const optAggressive = ocrPreprocessSelect.querySelector('option[value="aggressive"]');
      if (optBasic) optBasic.textContent = t('renderer.main.ocr_options.preprocess_basic', optBasic.textContent || 'Basic');
      if (optStandard) optStandard.textContent = t('renderer.main.ocr_options.preprocess_standard', optStandard.textContent || 'Standard');
      if (optAggressive) optAggressive.textContent = t('renderer.main.ocr_options.preprocess_aggressive', optAggressive.textContent || 'Aggressive');
    }

    if (!lockActive && ocrProgressText) {
      setOcrProgressFallbackText(t('renderer.main.import_apply.ocr_running', 'OCR in progress...'));
    }
    updateOcrOptionsContextText();
    updateOcrOptionsGuidanceText();
  }

  function bindUiListeners() {
    if (listenersBound) return;
    listenersBound = true;

    if (ocrPresetSelect) {
      ocrPresetSelect.addEventListener('change', () => {
        applyPresetValuesToControls(getSelectedOcrPresetKey());
        normalizeOcrControlValues();
        updateOcrOptionsGuidanceText();
      });
    }

    if (ocrDpiInput) {
      ocrDpiInput.addEventListener('change', () => {
        normalizeOcrControlValues();
        updateOcrOptionsGuidanceText();
      });
    }

    if (ocrTimeoutInput) {
      ocrTimeoutInput.addEventListener('change', () => {
        normalizeOcrControlValues();
        updateOcrOptionsGuidanceText();
      });
    }

    if (ocrPreprocessSelect) {
      ocrPreprocessSelect.addEventListener('change', () => {
        if (getSelectedOcrPresetKey() !== 'custom') {
          applyPresetValuesToControls(getSelectedOcrPresetKey());
        } else {
          ocrPreprocessSelect.value = getSelectedOcrPreprocess();
        }
        updateOcrOptionsGuidanceText();
      });
    }

    if (btnOcrOptionsStart) {
      btnOcrOptionsStart.addEventListener('click', () => settleOcrOptions(true));
    }
    if (btnOcrOptionsAbort) {
      btnOcrOptionsAbort.addEventListener('click', () => settleOcrOptions(false));
    }
    if (ocrOptionsBackdrop) {
      ocrOptionsBackdrop.addEventListener('click', () => settleOcrOptions(false));
    }

    if (btnImportApplyOverwrite) {
      btnImportApplyOverwrite.addEventListener('click', () => settleImportApplyChoice('overwrite'));
    }
    if (btnImportApplyAppend) {
      btnImportApplyAppend.addEventListener('click', () => settleImportApplyChoice('append'));
    }
    if (importApplyBackdrop) {
      importApplyBackdrop.addEventListener('click', () => settleImportApplyChoice(''));
    }

    document.addEventListener('keydown', (event) => {
      if (!event || event.key !== 'Escape') return;
      if (ocrOptionsModal && ocrOptionsModal.getAttribute('aria-hidden') === 'false') {
        event.preventDefault();
        settleOcrOptions(false);
        return;
      }
      if (importApplyModal && importApplyModal.getAttribute('aria-hidden') === 'false') {
        event.preventDefault();
        settleImportApplyChoice('');
      }
    });
  }

  bindUiListeners();
  syncOcrControlVisibility();

  window.ImportOcrUi = {
    setI18n,
    setLanguage,
    applyTranslations,
    setLockState,
    handleImportProgress,
    noteJobQueued,
    markImportFinished,
    chooseApplyMode,
    promptOcrOptionsDialog,
    isOcrRoute,
    getDefaultRunOptions,
    getCancelButton: () => btnCancelOcr,
    isLockActive: () => lockActive,
  };
})();
