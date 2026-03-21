// public/js/import_extract_status_ui.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the main-window import/extract status surface.
// - Keep prepare UI separate from processing-mode UI.
// - Render honest waiting copy + live elapsed time during execution.
// - Capture final elapsed time for the post-success apply modal.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-status-ui] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-status-ui');
  log.debug('Import/extract status UI starting...');

  const selectorControlsNormal = document.getElementById('selectorControlsNormal');
  const selectorControlsProcessing = document.getElementById('selectorControlsProcessing');
  const importExtractPrepareStatus = document.getElementById('importExtractPrepareStatus');
  const importExtractProcessingLabel = document.getElementById('importExtractProcessingLabel');
  const importExtractProcessingElapsed = document.getElementById('importExtractProcessingElapsed');
  const btnImportExtractAbort = document.getElementById('btnImportExtractAbort');

  const ELAPSED_TICK_MS = 250;
  const OCR_WAITING_COPY_DELAY_MS = 12000;

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
  let tRendererRef = null;
  let msgRendererRef = null;

  function translate(key, fallback) {
    if (typeof tRendererRef === 'function') {
      return tRendererRef(key, fallback);
    }
    return fallback;
  }

  function translateMessage(key, params, fallback) {
    if (typeof msgRendererRef === 'function') {
      return msgRendererRef(key, params, fallback);
    }
    return fallback;
  }

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
    return translateMessage(
      'renderer.main.processing.import_extract_elapsed',
      { time: formattedElapsed },
      `Elapsed: ${formattedElapsed}`
    );
  }

  function getProcessingLabelText() {
    if (pendingExecutionRoute === 'native') {
      return translate(
        'renderer.main.processing.import_extract_waiting_native',
        'Extracting text from file...'
      );
    }
    if (pendingExecutionRoute === 'ocr') {
      const elapsedMs = getElapsedMsSince(processingModeState.sinceEpochMs);
      if (elapsedMs !== null && elapsedMs >= OCR_WAITING_COPY_DELAY_MS) {
        return translate(
          'renderer.main.processing.import_extract_waiting_ocr_delayed',
          'Running OCR. Some files take longer.'
        );
      }
      return translate(
        'renderer.main.processing.import_extract_waiting_ocr',
        'Running OCR extraction...'
      );
    }
    return translate(
      'renderer.main.processing.import_extract_placeholder',
      importExtractProcessingLabel ? importExtractProcessingLabel.textContent || 'Extracting text...' : 'Extracting text...'
    );
  }

  function syncAbortButtonUi() {
    if (!btnImportExtractAbort) return;
    btnImportExtractAbort.textContent = translate(
      'renderer.main.buttons.import_extract_abort',
      btnImportExtractAbort.textContent || ''
    );
    btnImportExtractAbort.title = translate(
      'renderer.main.tooltips.import_extract_abort',
      btnImportExtractAbort.title || ''
    );
    const abortAria = translate(
      'renderer.main.aria.import_extract_abort',
      btnImportExtractAbort.getAttribute('aria-label') || ''
    );
    if (abortAria) {
      btnImportExtractAbort.setAttribute('aria-label', abortAria);
    }
  }

  function syncPrepareStatusUi() {
    if (!importExtractPrepareStatus) return;
    const active = prepareActiveCount > 0;
    importExtractPrepareStatus.hidden = !active;
    importExtractPrepareStatus.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (active) {
      importExtractPrepareStatus.textContent = translate(
        'renderer.main.processing.import_extract_preparing',
        importExtractPrepareStatus.textContent || 'Preparing import/extract route...'
      );
      return;
    }
    importExtractPrepareStatus.textContent = '';
  }

  function syncProcessingUi() {
    const active = isProcessingModeActive();

    if (selectorControlsNormal) {
      selectorControlsNormal.hidden = active;
      selectorControlsNormal.setAttribute('aria-hidden', active ? 'true' : 'false');
    }
    if (selectorControlsProcessing) {
      selectorControlsProcessing.hidden = !active;
      selectorControlsProcessing.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (btnImportExtractAbort) {
      btnImportExtractAbort.hidden = !active;
      btnImportExtractAbort.disabled = !active;
      btnImportExtractAbort.setAttribute('aria-hidden', active ? 'false' : 'true');
      btnImportExtractAbort.tabIndex = active ? 0 : -1;
    }
    if (importExtractProcessingLabel) {
      importExtractProcessingLabel.textContent = getProcessingLabelText();
    }
    if (!importExtractProcessingElapsed) return;

    const elapsedText = active
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

  function applyTranslations({ tRenderer, msgRenderer } = {}) {
    tRendererRef = typeof tRenderer === 'function' ? tRenderer : null;
    msgRendererRef = typeof msgRenderer === 'function' ? msgRenderer : null;
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
    return translateMessage(
      'renderer.alerts.import_extract_apply_modal_elapsed',
      { time: formattedElapsed },
      `Execution time: ${formattedElapsed}`
    );
  }

  function getAbortButton() {
    return btnImportExtractAbort;
  }

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
