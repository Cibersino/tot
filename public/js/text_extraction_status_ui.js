// public/js/text_extraction_status_ui.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the main-window text extraction status surface.
// - Keep prepare UI state separate from processing-mode UI state.
// - Render route-aware waiting copy and live elapsed time during execution.
// - Capture final elapsed time for the post-success apply modal.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-status-ui] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-status-ui');
  log.debug('Text extraction status UI starting...');
  if (!window.RendererI18n
    || typeof window.RendererI18n.tRenderer !== 'function'
    || typeof window.RendererI18n.renderLocalizedLabelWithInvariantValue !== 'function') {
    throw new Error('[text-extraction-status-ui] RendererI18n dependencies unavailable; cannot continue');
  }
  const { tRenderer, renderLocalizedLabelWithInvariantValue } = window.RendererI18n;

  // =============================================================================
  // UI elements
  // =============================================================================

  const selectorControlsNormal = document.getElementById('selectorControlsNormal');
  const selectorControlsProcessing = document.getElementById('selectorControlsProcessing');
  const textExtractionProcessingLabel = document.getElementById('textExtractionProcessingLabel');
  const textExtractionProcessingFilenameSeparator = document.getElementById('textExtractionProcessingFilenameSeparator');
  const textExtractionProcessingFilename = document.getElementById('textExtractionProcessingFilename');
  const textExtractionProcessingElapsed = document.getElementById('textExtractionProcessingElapsed');
  const btnTextExtractionAbort = document.getElementById('btnTextExtractionAbort');

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
  let pendingSourceFileName = '';
  let lastExecutionElapsedMs = null;
  let elapsedTimerId = null;

  // =============================================================================
  // Helpers
  // =============================================================================

  function normalizeRouteKind(rawRoute) {
    const routeKind = typeof rawRoute === 'string' ? rawRoute.trim() : '';
    return routeKind === 'native' || routeKind === 'ocr' ? routeKind : '';
  }

  function normalizeNonEmptyString(rawValue) {
    return typeof rawValue === 'string' ? rawValue.trim() : '';
  }

  function constrainDisplayFileName(rawValue) {
    const normalizedValue = normalizeNonEmptyString(rawValue);
    if (!normalizedValue) return '';

    const pathSegments = normalizedValue.split(/[\\/]+/).filter(Boolean);
    if (pathSegments.length > 0) {
      const basename = pathSegments[pathSegments.length - 1];
      const safeBasename = basename.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim();
      if (safeBasename && safeBasename !== '.' && safeBasename !== '..') {
        return safeBasename;
      }
    }
    return '';
  }

  function resolveSourceFileNameFromPath(rawFilePath) {
    return constrainDisplayFileName(rawFilePath);
  }

  function resolveSourceFileNameFromContext({ preparation, fileName, filePath } = {}) {
    const explicitFileName = constrainDisplayFileName(fileName);
    if (explicitFileName) return explicitFileName;

    const preparedFileNameRaw = preparation
      && preparation.preparedPayload
      && preparation.preparedPayload.fileInfo
      && typeof preparation.preparedPayload.fileInfo.fileName === 'string'
      ? preparation.preparedPayload.fileInfo.fileName
      : '';
    const preparedFileName = constrainDisplayFileName(preparedFileNameRaw);
    if (preparedFileName) return preparedFileName;

    return resolveSourceFileNameFromPath(filePath);
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

  function getProcessingElapsedValueText(rawElapsedMs) {
    if (rawElapsedMs === null) return '';
    return formatElapsedTime(rawElapsedMs);
  }

  function renderElapsedLabelWithValue(container, labelKey, valueText) {
    if (!container) return;
    renderLocalizedLabelWithInvariantValue(container, {
      labelText: tRenderer(labelKey),
      valueText,
      valueDirection: 'ltr',
    });
  }

  function getBusyLabelText({ elapsedMsOverride = null } = {}) {
    if (isPrepareActive()) {
      return tRenderer('renderer.main.processing.text_extraction_preparing');
    }
    if (pendingExecutionRoute === 'native') {
      return tRenderer('renderer.main.processing.text_extraction_waiting_native');
    }
    if (pendingExecutionRoute === 'ocr') {
      const elapsedMs = elapsedMsOverride === null
        ? getElapsedMsSince(processingModeState.sinceEpochMs)
        : elapsedMsOverride;
      if (elapsedMs !== null && elapsedMs >= OCR_WAITING_COPY_DELAY_MS) {
        return tRenderer('renderer.main.processing.text_extraction_waiting_ocr_delayed');
      }
      return tRenderer('renderer.main.processing.text_extraction_waiting_ocr');
    }
    return tRenderer('renderer.main.processing.text_extraction_placeholder');
  }

  function syncAbortButtonUi() {
    if (!btnTextExtractionAbort) return;
    btnTextExtractionAbort.title = tRenderer('renderer.main.tooltips.text_extraction_abort');
    const abortAria = tRenderer('renderer.main.aria.text_extraction_abort');
    if (abortAria) {
      btnTextExtractionAbort.setAttribute('aria-label', abortAria);
    }
  }

  function syncPrepareStatusUi() {
    syncProcessingUi();
  }

  function syncProcessingShellUi() {
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
    if (btnTextExtractionAbort) {
      btnTextExtractionAbort.hidden = !processingActive;
      btnTextExtractionAbort.disabled = !processingActive;
      btnTextExtractionAbort.setAttribute('aria-hidden', processingActive ? 'false' : 'true');
      btnTextExtractionAbort.tabIndex = processingActive ? 0 : -1;
    }
  }

  function syncPrimaryRowUi({ elapsedMsOverride = null } = {}) {
    const busyLabelText = getBusyLabelText({ elapsedMsOverride });
    if (textExtractionProcessingLabel && textExtractionProcessingLabel.textContent !== busyLabelText) {
      textExtractionProcessingLabel.textContent = busyLabelText;
    }

    const hasFileName = !!pendingSourceFileName;
    if (textExtractionProcessingFilenameSeparator
      && textExtractionProcessingFilenameSeparator.hidden !== !hasFileName) {
      textExtractionProcessingFilenameSeparator.hidden = !hasFileName;
    }
    if (!textExtractionProcessingFilename) return;

    textExtractionProcessingFilename.hidden = !hasFileName;
    textExtractionProcessingFilename.setAttribute('aria-hidden', hasFileName ? 'false' : 'true');
    const nextFileNameText = hasFileName ? pendingSourceFileName : '';
    if (textExtractionProcessingFilename.textContent !== nextFileNameText) {
      textExtractionProcessingFilename.textContent = nextFileNameText;
    }
    if (textExtractionProcessingFilename.title !== nextFileNameText) {
      textExtractionProcessingFilename.title = nextFileNameText;
    }
  }

  function syncElapsedUi({ elapsedMsOverride = null } = {}) {
    if (!textExtractionProcessingElapsed) return;

    const processingActive = isProcessingModeActive();
    const elapsedMs = elapsedMsOverride === null
      ? getElapsedMsSince(processingModeState.sinceEpochMs)
      : elapsedMsOverride;
    const elapsedValueText = processingActive
      ? getProcessingElapsedValueText(elapsedMs)
      : '';
    const showElapsed = !!elapsedValueText;
    textExtractionProcessingElapsed.hidden = !showElapsed;
    textExtractionProcessingElapsed.setAttribute('aria-hidden', showElapsed ? 'false' : 'true');
    if (!showElapsed) {
      textExtractionProcessingElapsed.textContent = '';
      return;
    }
    renderElapsedLabelWithValue(
      textExtractionProcessingElapsed,
      'renderer.main.processing.text_extraction_elapsed',
      elapsedValueText
    );
  }

  function syncDelayedBusyCopyUi(elapsedMs) {
    if (pendingExecutionRoute !== 'ocr' || isPrepareActive()) return;
    const nextBusyLabelText = getBusyLabelText({ elapsedMsOverride: elapsedMs });
    if (textExtractionProcessingLabel && textExtractionProcessingLabel.textContent === nextBusyLabelText) {
      return;
    }
    syncPrimaryRowUi({ elapsedMsOverride: elapsedMs });
  }

  function syncProcessingUi() {
    syncProcessingShellUi();
    syncPrimaryRowUi();
    syncElapsedUi();
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
      const elapsedMs = getElapsedMsSince(processingModeState.sinceEpochMs);
      syncDelayedBusyCopyUi(elapsedMs);
      syncElapsedUi({ elapsedMsOverride: elapsedMs });
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
      pendingSourceFileName = '';
    }

    syncProcessingUi();
    if (nextState.active && nextState.sinceEpochMs) {
      ensureElapsedTimer();
    } else {
      stopElapsedTimer();
    }

    if (prevActive !== nextState.active) {
      log.info('text extraction processing-mode changed:', {
        active: nextState.active,
        lockId: nextState.lockId,
        source,
        reason: nextState.reason,
      });
    }
  }

  function beginPrepare(context = {}) {
    const sourceFileName = resolveSourceFileNameFromContext(context);
    if (sourceFileName) {
      pendingSourceFileName = sourceFileName;
    }
    prepareActiveCount += 1;
    syncPrepareStatusUi();
  }

  function endPrepare() {
    prepareActiveCount = Math.max(0, prepareActiveCount - 1);
    syncPrepareStatusUi();
  }

  function setPendingExecutionContext(context = {}) {
    pendingExecutionRoute = resolvePendingRouteFromContext(context);
    const sourceFileName = resolveSourceFileNameFromContext(context);
    if (sourceFileName) {
      pendingSourceFileName = sourceFileName;
    }
    syncProcessingUi();
  }

  function clearPendingExecutionContext() {
    pendingExecutionRoute = '';
    pendingSourceFileName = '';
    syncProcessingUi();
  }

  function getFinalElapsedMs() {
    if (lastExecutionElapsedMs !== null) return lastExecutionElapsedMs;
    return getElapsedMsSince(processingModeState.sinceEpochMs);
  }

  function getFinalElapsedValueText() {
    const elapsedMs = getFinalElapsedMs();
    if (elapsedMs === null) return '';
    return formatElapsedTime(elapsedMs);
  }

  function getAbortButton() {
    return btnTextExtractionAbort;
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.TextExtractionStatusUi = {
    applyProcessingModeState,
    applyTranslations,
    beginPrepare,
    clearPendingExecutionContext,
    endPrepare,
    getAbortButton,
    getFinalElapsedValueText,
    isProcessingModeActive,
    setPendingExecutionContext,
  };
})();

// =============================================================================
// End of public/js/text_extraction_status_ui.js
// =============================================================================
