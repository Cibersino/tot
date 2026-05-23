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
  // DOM references
  // =============================================================================

  const selectorControlsNormal = document.getElementById('selectorControlsNormal');
  const selectorControlsProcessing = document.getElementById('selectorControlsProcessing');
  const textExtractionProcessingLabel = document.getElementById('textExtractionProcessingLabel');
  const textExtractionProcessingFilenameSeparator = document.getElementById('textExtractionProcessingFilenameSeparator');
  const textExtractionProcessingFilename = document.getElementById('textExtractionProcessingFilename');
  const textExtractionProcessingElapsed = document.getElementById('textExtractionProcessingElapsed');
  const btnTextExtractionAbort = document.getElementById('btnTextExtractionAbort');

  // Missing elements degrade only the status UI surface, so keep the module alive
  // but make the drift visible during bootstrap instead of failing silently later.
  [
    {
      element: selectorControlsNormal,
      id: 'selectorControlsNormal',
      impact: 'normal selector controls visibility will not sync',
    },
    {
      element: selectorControlsProcessing,
      id: 'selectorControlsProcessing',
      impact: 'processing selector controls visibility will not sync',
    },
    {
      element: textExtractionProcessingLabel,
      id: 'textExtractionProcessingLabel',
      impact: 'processing status label will not sync',
    },
    {
      element: textExtractionProcessingFilenameSeparator,
      id: 'textExtractionProcessingFilenameSeparator',
      impact: 'processing filename separator will not sync',
    },
    {
      element: textExtractionProcessingFilename,
      id: 'textExtractionProcessingFilename',
      impact: 'processing filename display will not sync',
    },
    {
      element: textExtractionProcessingElapsed,
      id: 'textExtractionProcessingElapsed',
      impact: 'processing elapsed display will not sync',
    },
    {
      element: btnTextExtractionAbort,
      id: 'btnTextExtractionAbort',
      impact: 'abort button UI will not sync',
    },
  ].forEach(({ element, id, impact }) => {
    if (!element) {
      log.warn('Status UI element missing; related UI behavior degraded:', { id, impact });
    }
  });

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
    unitIndex: null,
    unitCount: null,
    inputIndex: null,
    inputCount: null,
    selectedRoute: '',
    processingInputFileName: '',
    processingInputSource: '',
  };
  let currentTextProcessingState = {
    active: false,
    requestId: 0,
    sinceEpochMs: null,
    source: '',
    action: '',
  };
  let standaloneFullRefreshPendingState = {
    active: false,
    ownerSequence: 0,
    sinceEpochMs: null,
    reason: '',
  };
  let prepareActiveCount = 0;
  let abortFinalizationState = {
    active: false,
    fileName: '',
    elapsedMs: null,
  };
  let pendingExecutionRoute = '';
  let pendingSourceFileName = '';
  let lastExecutionSourceFileName = '';
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

  function normalizePositiveIntegerOrNull(rawValue) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 1) return null;
    return Math.floor(value);
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

  function resolveSourceFileNameFromContext({ preparation, fileName, filePath, processingInputFileName } = {}) {
    const explicitFileName = constrainDisplayFileName(fileName);
    if (explicitFileName) return explicitFileName;

    const explicitProcessingInputFileName = constrainDisplayFileName(processingInputFileName);
    if (explicitProcessingInputFileName) return explicitProcessingInputFileName;

    const preparationProcessingInputFileName = preparation
      && typeof preparation.processingInputFileName === 'string'
      ? preparation.processingInputFileName
      : '';
    const preparationProcessingInputDisplayName = constrainDisplayFileName(preparationProcessingInputFileName);
    if (preparationProcessingInputDisplayName) return preparationProcessingInputDisplayName;

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
      unitIndex: normalizePositiveIntegerOrNull(state.unitIndex),
      unitCount: normalizePositiveIntegerOrNull(state.unitCount),
      inputIndex: normalizePositiveIntegerOrNull(state.inputIndex),
      inputCount: normalizePositiveIntegerOrNull(state.inputCount),
      selectedRoute: normalizeRouteKind(state.selectedRoute),
      processingInputFileName: constrainDisplayFileName(state.processingInputFileName),
      processingInputSource: normalizeNonEmptyString(state.processingInputSource),
    };
  }

  function normalizeCurrentTextProcessingState(rawState) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    const requestId = Number(state.requestId);
    const sinceEpochMs = Number(state.sinceEpochMs);
    return {
      active: state.active === true,
      requestId: Number.isFinite(requestId) && requestId > 0 ? Math.floor(requestId) : 0,
      sinceEpochMs: Number.isFinite(sinceEpochMs) && sinceEpochMs > 0 ? Math.floor(sinceEpochMs) : null,
      source: typeof state.source === 'string' ? state.source.trim() : '',
      action: typeof state.action === 'string' ? state.action.trim() : '',
    };
  }

  function normalizeStandaloneFullRefreshPendingState(rawState) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    const ownerSequence = Number(state.ownerSequence);
    const sinceEpochMs = Number(state.sinceEpochMs);
    if (state.active !== true || !Number.isFinite(ownerSequence) || ownerSequence < 1) {
      return {
        active: false,
        ownerSequence: 0,
        sinceEpochMs: null,
        reason: '',
      };
    }
    return {
      active: true,
      ownerSequence: Math.floor(ownerSequence),
      sinceEpochMs: Number.isFinite(sinceEpochMs) && sinceEpochMs > 0 ? Math.floor(sinceEpochMs) : null,
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

  function isAbortFinalizationActive() {
    return abortFinalizationState.active === true;
  }

  function isCurrentTextProcessingActive() {
    return currentTextProcessingState.active === true;
  }

  function isStandaloneFullRefreshPendingActive() {
    return standaloneFullRefreshPendingState.active === true;
  }

  function isCurrentTextAreaPendingActive() {
    return isCurrentTextProcessingActive() || isStandaloneFullRefreshPendingActive();
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

  function updatePendingSourceFileNameFromContext(context = {}) {
    const sourceFileName = resolveSourceFileNameFromContext(context);
    if (sourceFileName) {
      pendingSourceFileName = sourceFileName;
    }
  }

  function resetPendingExecutionContextState({ preserveSourceFileName = false } = {}) {
    pendingExecutionRoute = '';
    if (!preserveSourceFileName) {
      pendingSourceFileName = '';
    }
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
    if (isAbortFinalizationActive()) {
      return tRenderer('renderer.main.processing.text_extraction_cancellation_pending');
    }
    const progressLabelText = getProgressLabelText();
    if (progressLabelText) {
      return progressLabelText;
    }
    if (isPrepareActive()) {
      return tRenderer('renderer.main.processing.text_extraction_preparing');
    }
    if (isCurrentTextProcessingActive()) {
      if (currentTextProcessingState.action === 'initial_load') {
        return tRenderer('renderer.main.processing.current_text_waiting_startup');
      }
      if (currentTextProcessingState.source === 'editor') {
        return tRenderer('renderer.main.processing.current_text_waiting_editor');
      }
      return tRenderer('renderer.main.processing.current_text_waiting');
    }
    if (isStandaloneFullRefreshPendingActive()) {
      return tRenderer('renderer.main.processing.current_text_recount_waiting');
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

  function formatProgressText(key, index, count) {
    return tRenderer(key)
      .replace('{index}', String(index))
      .replace('{count}', String(count));
  }

  function getRouteLabel(routeKind) {
    if (routeKind === 'native') {
      return tRenderer('renderer.main.processing.text_extraction_route_native');
    }
    if (routeKind === 'ocr') {
      return tRenderer('renderer.main.processing.text_extraction_route_ocr');
    }
    return '';
  }

  function getProgressLabelText() {
    if (!isProcessingModeActive()) return '';

    const parts = [];
    if (processingModeState.unitIndex && processingModeState.unitCount) {
      parts.push(formatProgressText(
        'renderer.main.processing.text_extraction_unit_progress',
        processingModeState.unitIndex,
        processingModeState.unitCount
      ));
    }
    if (processingModeState.inputIndex && processingModeState.inputCount) {
      parts.push(formatProgressText(
        'renderer.main.processing.text_extraction_input_progress',
        processingModeState.inputIndex,
        processingModeState.inputCount
      ));
    }

    const routeLabel = getRouteLabel(processingModeState.selectedRoute);
    if (routeLabel) {
      parts.push(routeLabel);
    }

    return parts.join(' · ');
  }

  function getDisplayedSourceFileName() {
    if (isAbortFinalizationActive() && abortFinalizationState.fileName) {
      return abortFinalizationState.fileName;
    }
    if (isProcessingModeActive() && processingModeState.processingInputFileName) {
      return processingModeState.processingInputFileName;
    }
    if (isCurrentTextProcessingActive()) {
      return '';
    }
    if (isStandaloneFullRefreshPendingActive()) {
      return '';
    }
    return pendingSourceFileName;
  }

  function syncAbortButtonUi() {
    if (!btnTextExtractionAbort) return;
    btnTextExtractionAbort.title = tRenderer('renderer.main.tooltips.text_extraction_abort');
    const abortAria = tRenderer('renderer.main.aria.text_extraction_abort');
    if (abortAria) {
      btnTextExtractionAbort.setAttribute('aria-label', abortAria);
    }
  }

  function syncProcessingShellUi() {
    const processingActive = isProcessingModeActive();
    const currentTextActive = isCurrentTextProcessingActive();
    const standaloneFullRefreshActive = isStandaloneFullRefreshPendingActive();
    const abortFinalizationActive = isAbortFinalizationActive();
    const active = processingActive
      || currentTextActive
      || standaloneFullRefreshActive
      || abortFinalizationActive
      || isPrepareActive();

    if (selectorControlsNormal) {
      selectorControlsNormal.hidden = active;
      selectorControlsNormal.setAttribute('aria-hidden', active ? 'true' : 'false');
    }
    if (selectorControlsProcessing) {
      selectorControlsProcessing.hidden = !active;
      selectorControlsProcessing.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (btnTextExtractionAbort) {
      const abortButtonVisible = processingActive && !abortFinalizationActive;
      btnTextExtractionAbort.hidden = !abortButtonVisible;
      btnTextExtractionAbort.disabled = !abortButtonVisible;
      btnTextExtractionAbort.setAttribute('aria-hidden', abortButtonVisible ? 'false' : 'true');
      btnTextExtractionAbort.tabIndex = abortButtonVisible ? 0 : -1;
    }
  }

  function syncPrimaryRowUi({ elapsedMsOverride = null } = {}) {
    const busyLabelText = getBusyLabelText({ elapsedMsOverride });
    if (textExtractionProcessingLabel && textExtractionProcessingLabel.textContent !== busyLabelText) {
      textExtractionProcessingLabel.textContent = busyLabelText;
    }

    const displayedFileName = getDisplayedSourceFileName();
    const hasFileName = !!displayedFileName;
    if (textExtractionProcessingFilenameSeparator
      && textExtractionProcessingFilenameSeparator.hidden !== !hasFileName) {
      textExtractionProcessingFilenameSeparator.hidden = !hasFileName;
    }
    if (!textExtractionProcessingFilename) return;

    textExtractionProcessingFilename.hidden = !hasFileName;
    textExtractionProcessingFilename.setAttribute('aria-hidden', hasFileName ? 'false' : 'true');
    const nextFileNameText = hasFileName ? displayedFileName : '';
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
    const currentTextActive = isCurrentTextProcessingActive();
    const standaloneFullRefreshActive = isStandaloneFullRefreshPendingActive();
    const abortFinalizationActive = isAbortFinalizationActive();
    const elapsedMs = processingActive
      ? (elapsedMsOverride === null
        ? getElapsedMsSince(processingModeState.sinceEpochMs)
        : elapsedMsOverride)
      : ((currentTextActive || standaloneFullRefreshActive)
        ? (elapsedMsOverride === null
          ? getElapsedMsSince(
            currentTextActive
              ? currentTextProcessingState.sinceEpochMs
              : standaloneFullRefreshPendingState.sinceEpochMs
          )
          : elapsedMsOverride)
        : (abortFinalizationActive ? abortFinalizationState.elapsedMs : null));
    const elapsedValueText = (processingActive
      || currentTextActive
      || standaloneFullRefreshActive
      || abortFinalizationActive)
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
      (currentTextActive || standaloneFullRefreshActive)
        ? 'renderer.main.processing.current_text_elapsed'
        : 'renderer.main.processing.text_extraction_elapsed',
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

  // The timer exists only while processing is active so elapsed updates do not
  // keep running after the processing-mode lock has been released.
  function ensureElapsedTimer() {
    if (elapsedTimerId !== null) return;
    elapsedTimerId = window.setInterval(() => {
      if (!isProcessingModeActive() && !isCurrentTextAreaPendingActive()) {
        stopElapsedTimer();
        return;
      }
      const elapsedMs = isProcessingModeActive()
        ? getElapsedMsSince(processingModeState.sinceEpochMs)
        : getElapsedMsSince(
          isCurrentTextProcessingActive()
            ? currentTextProcessingState.sinceEpochMs
            : standaloneFullRefreshPendingState.sinceEpochMs
        );
      if (isProcessingModeActive()) {
        syncDelayedBusyCopyUi(elapsedMs);
      }
      syncElapsedUi({ elapsedMsOverride: elapsedMs });
    }, ELAPSED_TICK_MS);
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================

  function applyTranslations() {
    syncAbortButtonUi();
    syncProcessingUi();
  }

  function applyProcessingModeState(rawState, { source = 'unknown' } = {}) {
    const nextState = normalizeProcessingModeState(rawState);
    const prevState = cloneProcessingModeState();
    const prevActive = prevState.active === true;
    processingModeState = nextState;

    if (!prevActive && nextState.active) {
      lastExecutionElapsedMs = null;
      lastExecutionSourceFileName = '';
      if (nextState.processingInputFileName) {
        pendingSourceFileName = nextState.processingInputFileName;
      }
    } else if (prevActive && !nextState.active) {
      lastExecutionElapsedMs = getElapsedMsSince(prevState.sinceEpochMs);
      lastExecutionSourceFileName = prevState.processingInputFileName || pendingSourceFileName;
      resetPendingExecutionContextState({
        preserveSourceFileName: isAbortFinalizationActive(),
      });
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

  function applyCurrentTextProcessingState(rawState, { source = 'unknown' } = {}) {
    const prevState = { ...currentTextProcessingState };
    currentTextProcessingState = normalizeCurrentTextProcessingState(rawState);

    syncProcessingUi();
    if (currentTextProcessingState.active && currentTextProcessingState.sinceEpochMs) {
      ensureElapsedTimer();
    } else if (!isProcessingModeActive()) {
      stopElapsedTimer();
    }

    if (prevState.active !== currentTextProcessingState.active
      || (currentTextProcessingState.active && prevState.requestId !== currentTextProcessingState.requestId)) {
      log.info('current text processing changed:', {
        active: currentTextProcessingState.active,
        requestId: currentTextProcessingState.requestId,
        source,
        currentTextSource: currentTextProcessingState.source,
        action: currentTextProcessingState.action,
      });
    }
  }

  function applyStandaloneFullRefreshPendingState(rawState, { source = 'unknown' } = {}) {
    const prevState = { ...standaloneFullRefreshPendingState };
    standaloneFullRefreshPendingState = normalizeStandaloneFullRefreshPendingState(rawState);

    syncProcessingUi();
    if (standaloneFullRefreshPendingState.active && standaloneFullRefreshPendingState.sinceEpochMs) {
      ensureElapsedTimer();
    } else if (!isProcessingModeActive() && !isCurrentTextProcessingActive()) {
      stopElapsedTimer();
    }

    if (prevState.active !== standaloneFullRefreshPendingState.active
      || (standaloneFullRefreshPendingState.active
        && prevState.ownerSequence !== standaloneFullRefreshPendingState.ownerSequence)) {
      log.info('standalone current text recount pending changed:', {
        active: standaloneFullRefreshPendingState.active,
        ownerSequence: standaloneFullRefreshPendingState.ownerSequence,
        source,
        reason: standaloneFullRefreshPendingState.reason,
      });
    }
  }

  function beginPrepare(context = {}) {
    updatePendingSourceFileNameFromContext(context);
    prepareActiveCount += 1;
    syncProcessingUi();
  }

  function endPrepare() {
    prepareActiveCount = Math.max(0, prepareActiveCount - 1);
    syncProcessingUi();
  }

  function setPendingExecutionContext(context = {}) {
    pendingExecutionRoute = resolvePendingRouteFromContext(context);
    updatePendingSourceFileNameFromContext(context);
    syncProcessingUi();
  }

  function clearPendingExecutionContext() {
    resetPendingExecutionContextState({
      preserveSourceFileName: isAbortFinalizationActive(),
    });
    syncProcessingUi();
  }

  function beginAbortFinalization(context = {}) {
    const explicitFileName = constrainDisplayFileName(context.fileName);
    const fallbackFileName = getDisplayedSourceFileName()
      || lastExecutionSourceFileName
      || pendingSourceFileName;
    abortFinalizationState = {
      active: true,
      fileName: explicitFileName || fallbackFileName,
      elapsedMs: getFinalElapsedMs(),
    };
    syncProcessingUi();
  }

  function endAbortFinalization() {
    abortFinalizationState = {
      active: false,
      fileName: '',
      elapsedMs: null,
    };
    if (!isProcessingModeActive() && !isPrepareActive()) {
      lastExecutionSourceFileName = '';
      resetPendingExecutionContextState();
    }
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
    applyCurrentTextProcessingState,
    applyStandaloneFullRefreshPendingState,
    applyTranslations,
    beginAbortFinalization,
    beginPrepare,
    clearPendingExecutionContext,
    endAbortFinalization,
    endPrepare,
    getAbortButton,
    getFinalElapsedValueText,
    isAbortFinalizationActive,
    isCurrentTextAreaPendingActive,
    isCurrentTextProcessingActive,
    isProcessingModeActive,
    isStandaloneFullRefreshPendingActive,
    setPendingExecutionContext,
  };
})();

// =============================================================================
// End of public/js/text_extraction_status_ui.js
// =============================================================================
