// public/js/import_extract_status_ui.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the main-window import/extract status surface.
// - Keep prepare UI state separate from processing-mode UI state.
// - Render route-aware waiting copy and live elapsed time during execution.
// - Capture final elapsed time for the post-success apply modal.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-status-ui] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-status-ui');
  log.debug('Import/extract status UI starting...');
  if (!window.RendererI18n
    || typeof window.RendererI18n.tRenderer !== 'function'
    || typeof window.RendererI18n.msgRenderer !== 'function') {
    throw new Error('[import-extract-status-ui] RendererI18n.tRenderer/msgRenderer unavailable; cannot continue');
  }
  const { tRenderer, msgRenderer } = window.RendererI18n;

  // =============================================================================
  // UI elements
  // =============================================================================

  const selectorControlsNormal = document.getElementById('selectorControlsNormal');
  const selectorControlsProcessing = document.getElementById('selectorControlsProcessing');
  const importExtractProcessingLabel = document.getElementById('importExtractProcessingLabel');
  const importExtractProcessingElapsed = document.getElementById('importExtractProcessingElapsed');
  const btnImportExtractAbort = document.getElementById('btnImportExtractAbort');

  // =============================================================================
  // Constants / config
  // =============================================================================

  const ELAPSED_TICK_MS = 250;
  const OCR_WAITING_COPY_DELAY_MS = 60000;

  // =============================================================================
  // Shared state
  // =============================================================================

  let processingModeState = {
    active: false,
    lockId: 0,
    sinceEpochMs: null,
    source: '',
    reason: '',
  };
  let prepareActiveCount = 0;
  let pendingExecutionRoute = '';
  let lastExecutionElapsedMs = null;
  let elapsedTimerId = null;

  // =============================================================================
  // Helpers
  // =============================================================================

  function normalizeRouteKind(rawRoute) {
    const routeKind = typeof rawRoute === 'string' ? rawRoute.trim() : '';
    return routeKind === 'native' || routeKind === 'ocr' ? routeKind : '';
  }

  function resolvePendingRouteFromContext({ preparation, routePreference } = {}) {
    const preferredRoute = normalizeRouteKind(routePreference);
    if (preferredRoute) return preferredRoute;

    const chosenRoute = preparation
      && preparation.routeMetadata
      && typeof preparation.routeMetadata.chosenRoute === 'string'
      ? preparation.routeMetadata.chosenRoute
      : '';
    return normalizeRouteKind(chosenRoute);
  }

  function normalizeProcessingModeState(rawState) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    const lockId = Number(state.lockId);
    const sinceEpochMs = Number(state.sinceEpochMs);
    return {
      active: state.active === true,
      lockId: Number.isFinite(lockId) && lockId >= 0 ? Math.floor(lockId) : 0,
      sinceEpochMs: Number.isFinite(sinceEpochMs) && sinceEpochMs > 0 ? Math.floor(sinceEpochMs) : null,
      source: typeof state.source === 'string' ? state.source.trim() : '',
      reason: typeof state.reason === 'string' ? state.reason.trim() : '',
    };
  }

  function cloneProcessingModeState() {
    return { ...processingModeState };
  }

  function isProcessingModeActive() {
    return processingModeState.active === true;
  }

  function isPrepareActive() {
    return prepareActiveCount > 0;
  }

  function getElapsedMsSince(rawSinceEpochMs) {
    const sinceEpochMs = Number(rawSinceEpochMs);
    if (!Number.isFinite(sinceEpochMs) || sinceEpochMs <= 0) return null;
    return Math.max(0, Date.now() - Math.floor(sinceEpochMs));
  }

  function formatElapsedTime(rawElapsedMs) {
    const elapsedMs = Number(rawElapsedMs);
    const totalSeconds = Number.isFinite(elapsedMs) && elapsedMs >= 0
      ? Math.floor(elapsedMs / 1000)
      : 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function buildProcessingElapsedText(rawElapsedMs) {
    if (rawElapsedMs === null) return '';
    const formattedElapsed = formatElapsedTime(rawElapsedMs);
    return msgRenderer(
      'renderer.main.processing.import_extract_elapsed',
      { time: formattedElapsed }
    );
  }

  function getBusyLabelText() {
    if (isPrepareActive()) {
      return tRenderer('renderer.main.processing.import_extract_preparing');
    }
    if (pendingExecutionRoute === 'native') {
      return tRenderer('renderer.main.processing.import_extract_waiting_native');
    }
    if (pendingExecutionRoute === 'ocr') {
      const elapsedMs = getElapsedMsSince(processingModeState.sinceEpochMs);
      if (elapsedMs !== null && elapsedMs >= OCR_WAITING_COPY_DELAY_MS) {
        return tRenderer('renderer.main.processing.import_extract_waiting_ocr_delayed');
      }
      return tRenderer('renderer.main.processing.import_extract_waiting_ocr');
    }
    return tRenderer('renderer.main.processing.import_extract_placeholder');
  }

  function syncAbortButtonUi() {
    if (!btnImportExtractAbort) return;
    btnImportExtractAbort.textContent = tRenderer('renderer.main.buttons.import_extract_abort');
    btnImportExtractAbort.title = tRenderer('renderer.main.tooltips.import_extract_abort');
    const abortAria = tRenderer('renderer.main.aria.import_extract_abort');
    if (abortAria) {
      btnImportExtractAbort.setAttribute('aria-label', abortAria);
    }
  }

  function syncPrepareStatusUi() {
    syncProcessingUi();
  }

  function syncProcessingUi() {
    const processingActive = isProcessingModeActive();
    const active = processingActive || isPrepareActive();

    if (selectorControlsNormal) {
      selectorControlsNormal.hidden = active;
      selectorControlsNormal.setAttribute('aria-hidden', active ? 'true' : 'false');
    }
    if (selectorControlsProcessing) {
      selectorControlsProcessing.hidden = !active;
      selectorControlsProcessing.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (btnImportExtractAbort) {
      btnImportExtractAbort.hidden = !processingActive;
      btnImportExtractAbort.disabled = !processingActive;
      btnImportExtractAbort.setAttribute('aria-hidden', processingActive ? 'false' : 'true');
      btnImportExtractAbort.tabIndex = processingActive ? 0 : -1;
    }
    if (importExtractProcessingLabel) {
      importExtractProcessingLabel.textContent = getBusyLabelText();
    }
    if (!importExtractProcessingElapsed) return;

    const elapsedText = processingActive
      ? buildProcessingElapsedText(getElapsedMsSince(processingModeState.sinceEpochMs))
      : '';
    const showElapsed = !!elapsedText;
    importExtractProcessingElapsed.hidden = !showElapsed;
    importExtractProcessingElapsed.setAttribute('aria-hidden', showElapsed ? 'false' : 'true');
    importExtractProcessingElapsed.textContent = showElapsed ? elapsedText : '';
  }

  function stopElapsedTimer() {
    if (elapsedTimerId === null) return;
    window.clearInterval(elapsedTimerId);
    elapsedTimerId = null;
  }

  function ensureElapsedTimer() {
    if (elapsedTimerId !== null) return;
    elapsedTimerId = window.setInterval(() => {
      if (!isProcessingModeActive()) {
        stopElapsedTimer();
        return;
      }
      syncProcessingUi();
    }, ELAPSED_TICK_MS);
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================

  function applyTranslations() {
    syncAbortButtonUi();
    syncPrepareStatusUi();
    syncProcessingUi();
  }

  function applyProcessingModeState(rawState, { source = 'unknown' } = {}) {
    const nextState = normalizeProcessingModeState(rawState);
    const prevState = cloneProcessingModeState();
    const prevActive = prevState.active === true;
    processingModeState = nextState;

    if (!prevActive && nextState.active) {
      lastExecutionElapsedMs = null;
    } else if (prevActive && !nextState.active) {
      lastExecutionElapsedMs = getElapsedMsSince(prevState.sinceEpochMs);
      pendingExecutionRoute = '';
    }

    syncProcessingUi();
    if (nextState.active && nextState.sinceEpochMs) {
      ensureElapsedTimer();
    } else {
      stopElapsedTimer();
    }

    if (prevActive !== nextState.active) {
      log.info('import/extract processing-mode changed:', {
        active: nextState.active,
        lockId: nextState.lockId,
        source,
        reason: nextState.reason,
      });
    }
  }

  function beginPrepare() {
    prepareActiveCount += 1;
    syncPrepareStatusUi();
  }

  function endPrepare() {
    prepareActiveCount = Math.max(0, prepareActiveCount - 1);
    syncPrepareStatusUi();
  }

  function setPendingExecutionContext(context = {}) {
    pendingExecutionRoute = resolvePendingRouteFromContext(context);
    syncProcessingUi();
  }

  function clearPendingExecutionContext() {
    pendingExecutionRoute = '';
    syncProcessingUi();
  }

  function getFinalElapsedMs() {
    if (lastExecutionElapsedMs !== null) return lastExecutionElapsedMs;
    return getElapsedMsSince(processingModeState.sinceEpochMs);
  }

  function getFinalElapsedText() {
    const elapsedMs = getFinalElapsedMs();
    if (elapsedMs === null) return '';
    const formattedElapsed = formatElapsedTime(elapsedMs);
    return msgRenderer(
      'renderer.alerts.import_extract_apply_modal_elapsed',
      { time: formattedElapsed }
    );
  }

  function getAbortButton() {
    return btnImportExtractAbort;
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.ImportExtractStatusUi = {
    applyProcessingModeState,
    applyTranslations,
    beginPrepare,
    clearPendingExecutionContext,
    endPrepare,
    getAbortButton,
    getFinalElapsedText,
    isProcessingModeActive,
    setPendingExecutionContext,
  };
})();

// =============================================================================
// End of public/js/import_extract_status_ui.js
// =============================================================================
