// public/js/import_ocr_ui_progress.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Build progress UI handlers for OCR import state updates.
// - Track OCR progress stage, page counters, elapsed time, and ETA label state.
// - Render progress status into segmented UI fields or text fallback.
// - Keep lock-driven visibility in sync for progress panel and cancel button.
// - Expose a factory consumed by import_ocr_ui.js.

// =============================================================================
// Factory and module export
// =============================================================================

(() => {
  function createImportOcrUiProgress({ refs, state, t, shared }) {
    // =============================================================================
    // Dependencies and shared references
    // =============================================================================
    if (!refs || !state || typeof t !== 'function' || !shared) {
      throw new Error('[import-ocr-ui.progress] missing dependencies');
    }
    const log = window.getLogger('import-ocr-ui.progress');

    const {
      btnCancelOcr,
      ocrProgressPanel,
      ocrProgressText,
      ocrProgressStageText,
      ocrProgressPagesText,
      ocrProgressElapsedText,
      ocrProgressEtaText,
    } = refs;

    // =============================================================================
    // Helpers: formatting, stage normalization, and ETA inference
    // =============================================================================

    function formatElapsedLabel(ms) {
      const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
      return `${minutes}m ${seconds}s`;
    }

    function setActiveProgressMeta(meta) {
      const safeMeta = shared.buildQueuedJobMeta(meta || {});
      state.ocrProgressMeta = safeMeta;
    }

    function setOcrProgressStage(stage) {
      const normalized = shared.normalizeStageKey(stage);
      if (!normalized) return;
      if (normalized !== state.ocrProgressStage) {
        state.ocrProgressStage = normalized;
      }
    }

    function isEtaRecomputeStage(stageKey) {
      return stageKey === 'queued'
        || stageKey === 'running'
        || stageKey === 'ocr_running'
        || stageKey === 'extracting'
        || stageKey === 'preflight'
        || stageKey === 'finalizing'
        || stageKey === 'completed'
        || stageKey === 'failed'
        || stageKey === 'canceled';
    }

    function inferStageAwareEtaMs({ elapsedMs, pageDone, pageTotal }) {
      const knownTotal = shared.getKnownOcrPageTotal(pageTotal);
      if (knownTotal <= 0) {
        return shared.inferEtaMs(elapsedMs, pageDone, pageTotal);
      }
      const safeDone = Number.isFinite(pageDone) ? Math.max(0, Math.floor(pageDone)) : 0;
      const stage = shared.normalizeStageKey(state.ocrProgressStage || state.lockReason || 'ocr');
      const dpi = shared.normalizeDpiValue(state.ocrProgressMeta.dpi, shared.OCR_PRESET_VALUES.balanced.dpi);
      const preprocess = shared.normalizePreprocessProfile(
        state.ocrProgressMeta.preprocessProfile,
        shared.OCR_PRESET_VALUES.balanced.preprocess
      );
      const rasterSecPerPage = shared.estimateRasterSecPerPage(dpi, preprocess);
      const ocrSecPerPage = shared.estimateOcrSecPerPage(dpi, preprocess);
      const remainingPages = Math.max(0, knownTotal - Math.min(safeDone, knownTotal));

      if (remainingPages <= 0 || stage === 'completed') return 0;
      if (stage === 'failed' || stage === 'canceled') return null;

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

      return shared.inferEtaMs(elapsedMs, safeDone, knownTotal);
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

    // =============================================================================
    // Helpers: progress text rendering and fallback behavior
    // =============================================================================

    function hasOcrProgressSegments() {
      return !!(ocrProgressStageText && ocrProgressPagesText && ocrProgressElapsedText && ocrProgressEtaText);
    }

    function setOcrProgressFallbackText(text) {
      const message = String(text || '');
      if (!ocrProgressText) {
        log.warnOnce(
          'import-ocr-ui.progress.ocrProgressText.unavailable',
          'OCR progress update failed (ignored): ocrProgressText element unavailable.'
        );
        return;
      }
      if (hasOcrProgressSegments()) {
        ocrProgressStageText.textContent = message;
        ocrProgressPagesText.textContent = '';
        ocrProgressElapsedText.textContent = '';
        ocrProgressEtaText.textContent = '';
        return;
      }
      log.warnOnce(
        'import-ocr-ui.progress.segments.unavailable',
        'OCR progress segmented render failed (ignored): segment elements unavailable; using text fallback.'
      );
      ocrProgressText.textContent = message;
    }

    function setOcrProgressSegmentsText(stageText, pagesText, elapsedText, etaText) {
      if (!ocrProgressText) {
        log.warnOnce(
          'import-ocr-ui.progress.ocrProgressText.unavailable',
          'OCR progress update failed (ignored): ocrProgressText element unavailable.'
        );
        return;
      }
      if (hasOcrProgressSegments()) {
        ocrProgressStageText.textContent = String(stageText || '');
        ocrProgressPagesText.textContent = String(pagesText || '');
        ocrProgressElapsedText.textContent = String(elapsedText || '');
        ocrProgressEtaText.textContent = String(etaText || '');
        return;
      }
      log.warnOnce(
        'import-ocr-ui.progress.segments.unavailable',
        'OCR progress segmented render failed (ignored): segment elements unavailable; using text fallback.'
      );
      ocrProgressText.textContent = `${stageText} · ${pagesText} · ${elapsedText} · ${etaText}`;
    }

    // =============================================================================
    // Progress state transitions and refresh path
    // =============================================================================

    function resetOcrProgressState() {
      if (state.ocrProgressJobId) state.ocrQueuedJobMetaById.delete(state.ocrProgressJobId);
      state.ocrProgressJobId = '';
      state.ocrProgressStartedAt = 0;
      state.ocrProgressPageDone = 0;
      state.ocrProgressPageTotal = 0;
      state.ocrProgressStage = '';
      state.ocrProgressEtaLabel = '--';
      state.ocrProgressMeta = {
        preset: 'balanced',
        dpi: shared.OCR_PRESET_VALUES.balanced.dpi,
        timeoutPerPageSec: shared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
        preprocessProfile: shared.OCR_PRESET_VALUES.balanced.preprocess,
      };
      setOcrProgressFallbackText(t('renderer.main.import_apply.ocr_running', 'OCR in progress...'));
    }

    function updateOcrProgressText(options = {}) {
      const opts = options && typeof options === 'object' ? options : {};
      const recomputeEta = opts.recomputeEta !== false;
      if (!ocrProgressText) {
        log.warnOnce(
          'import-ocr-ui.progress.ocrProgressText.unavailable',
          'OCR progress update failed (ignored): ocrProgressText element unavailable.'
        );
        return;
      }
      if (!state.lockActive) {
        setOcrProgressFallbackText(t('renderer.main.import_apply.ocr_running', 'OCR in progress...'));
        return;
      }

      const startedAt = state.ocrProgressStartedAt || Date.now();
      const nowTs = Date.now();
      const elapsedMs = Math.max(0, nowTs - startedAt);
      const stageLabel = getStageLabel(state.ocrProgressStage || state.lockReason || 'ocr');

      const safeDone = Number.isFinite(state.ocrProgressPageDone) ? Math.max(0, Math.floor(state.ocrProgressPageDone)) : 0;
      const safeTotal = Number.isFinite(state.ocrProgressPageTotal) ? Math.max(0, Math.floor(state.ocrProgressPageTotal)) : 0;
      const knownTotal = shared.getKnownOcrPageTotal(safeTotal);
      const pageLabel = knownTotal > 0
        ? `${Math.min(safeDone, knownTotal)}/${knownTotal}`
        : '-/-';

      if (recomputeEta) {
        const etaMs = inferStageAwareEtaMs({
          elapsedMs,
          pageDone: safeDone,
          pageTotal: knownTotal,
        });
        state.ocrProgressEtaLabel = etaMs == null ? '--' : formatElapsedLabel(etaMs);
      }
      const pagesWord = t('renderer.main.import_progress.pages', 'pages');
      const elapsedWord = t('renderer.main.import_progress.elapsed', 'elapsed');
      const etaWord = t('renderer.main.import_progress.eta', 'ETA');
      setOcrProgressSegmentsText(
        stageLabel,
        `${pagesWord} ${pageLabel}`,
        `${elapsedWord} ${formatElapsedLabel(elapsedMs)}`,
        `${etaWord} ${state.ocrProgressEtaLabel || '--'}`
      );
    }

    function syncOcrControlVisibility() {
      if (btnCancelOcr) btnCancelOcr.hidden = !state.lockActive;
      if (ocrProgressPanel) ocrProgressPanel.hidden = !state.lockActive;

      if (state.lockActive) {
        if (!state.ocrProgressStartedAt) state.ocrProgressStartedAt = Date.now();
        updateOcrProgressText();
        return;
      }
      resetOcrProgressState();
    }

    function setLockState(payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      state.lockActive = !!p.locked;
      state.lockReason = state.lockActive ? String(p.reason || 'OCR_RUNNING') : '';
      syncOcrControlVisibility();
    }

    function handleImportProgress(payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      const isTick = String(p.kind || '').trim().toLowerCase() === 'tick';
      const prevPageDone = state.ocrProgressPageDone;
      const prevPageTotal = state.ocrProgressPageTotal;
      let incomingStage = '';
      let stageChanged = false;
      if (typeof p.jobId === 'string' && p.jobId) {
        const nextJobId = p.jobId.trim();
        if (nextJobId && nextJobId !== state.ocrProgressJobId) {
          state.ocrProgressJobId = nextJobId;
          const queuedMeta = state.ocrQueuedJobMetaById.get(nextJobId);
          if (queuedMeta) setActiveProgressMeta(queuedMeta);
        } else if (nextJobId) {
          state.ocrProgressJobId = nextJobId;
        }
      }

      if (!state.ocrProgressStartedAt) {
        const heartbeatTs = Number(p.heartbeatTs);
        state.ocrProgressStartedAt = Number.isFinite(heartbeatTs) && heartbeatTs > 0
          ? heartbeatTs
          : Date.now();
      }
      if (typeof p.stage === 'string' && p.stage.trim()) {
        incomingStage = shared.normalizeStageKey(p.stage.trim());
        stageChanged = incomingStage && incomingStage !== shared.normalizeStageKey(state.ocrProgressStage);
        setOcrProgressStage(p.stage.trim());
      }
      if (Number.isFinite(Number(p.pageDone))) state.ocrProgressPageDone = Number(p.pageDone);
      if (Number.isFinite(Number(p.pageTotal))) {
        state.ocrProgressPageTotal = Number(p.pageTotal);
      }

      const pageChanged = state.ocrProgressPageDone !== prevPageDone || state.ocrProgressPageTotal !== prevPageTotal;
      const shouldRecomputeEta = !isTick && (
        pageChanged
        || (stageChanged && isEtaRecomputeStage(incomingStage))
        || state.ocrProgressEtaLabel === '--'
      );
      updateOcrProgressText({ recomputeEta: shouldRecomputeEta });
    }

    // =============================================================================
    // Public handlers exposed to the OCR UI facade
    // =============================================================================

    function noteJobQueued(payload) {
      const p = (payload && typeof payload === 'object')
        ? payload
        : { jobId: payload };
      const jobId = typeof p.jobId === 'string' ? p.jobId.trim() : '';
      if (!jobId) return;
      const queuedMeta = shared.buildQueuedJobMeta(p);
      state.ocrQueuedJobMetaById.set(jobId, queuedMeta);
      setActiveProgressMeta(queuedMeta);
      state.ocrProgressJobId = jobId;
      state.ocrProgressStartedAt = Date.now();
      setOcrProgressStage('queued');
      state.ocrProgressPageDone = 0;
      state.ocrProgressPageTotal = 0;
      updateOcrProgressText();
    }

    function markImportFinished(payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      const jobId = typeof p.jobId === 'string' ? p.jobId.trim() : '';
      if (!jobId || !state.ocrProgressJobId || jobId !== state.ocrProgressJobId) return;

      if (p.ok) {
        setOcrProgressStage('completed');
        state.ocrProgressPageDone = Math.max(state.ocrProgressPageDone, state.ocrProgressPageTotal || 0);
      } else {
        const nextStage = String(p.code || '').toUpperCase() === 'OCR_CANCELED' ? 'canceled' : 'failed';
        setOcrProgressStage(nextStage);
      }
      state.ocrQueuedJobMetaById.delete(jobId);
      updateOcrProgressText();
    }

    // =============================================================================
    // Module surface
    // =============================================================================

    return {
      setLockState,
      handleImportProgress,
      noteJobQueued,
      markImportFinished,
      syncOcrControlVisibility,
      setOcrProgressFallbackText,
    };
  }

  // =============================================================================
  // Export
  // =============================================================================

  window.createImportOcrUiProgress = createImportOcrUiProgress;
})();

// =============================================================================
// End of public/js/import_ocr_ui_progress.js
// =============================================================================
