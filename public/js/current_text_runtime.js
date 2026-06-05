// public/js/current_text_runtime.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-window current-text runtime owner.
// Responsibilities:
// - Own authoritative current-text preview/result rendering in the main window.
// - Merge derived-only recalculations into the latest in-flight text settle.
// - Report latest-settle success/failure back to the main-owned pending lifecycle.
// - Keep degraded derived UI explicit when settle fails after current text changed.

(() => {
  // =============================================================================
  // Logger / dependencies / DOM
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[current-text-runtime] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('current-text-runtime');
  log.debug('Current text runtime starting...');

  const { contarTexto: contarTextoModulo } = window.CountUtils || {};
  if (typeof contarTextoModulo !== 'function') {
    throw new Error('[current-text-runtime] CountUtils unavailable; cannot continue');
  }

  const {
    getExactTotalSeconds,
    getDisplayTimeParts,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
  } = window.FormatUtils || {};
  if (!getExactTotalSeconds || !getDisplayTimeParts || !obtenerSeparadoresDeNumeros || !formatearNumero) {
    throw new Error('[current-text-runtime] FormatUtils unavailable; cannot continue');
  }

  const {
    tRenderer,
    msgRenderer,
    renderLocalizedLabelWithInvariantValue,
  } = window.RendererI18n || {};
  if (!tRenderer || !msgRenderer || !renderLocalizedLabelWithInvariantValue) {
    throw new Error('[current-text-runtime] RendererI18n unavailable; cannot continue');
  }

  const resChars = document.getElementById('resChars');
  const resCharsNoSpace = document.getElementById('resCharsNoSpace');
  const resWords = document.getElementById('resWords');
  const resTime = document.getElementById('resTime');
  const selectorSection = document.querySelector('.selector-text');
  const resultsSection = document.querySelector('.results');

  // =============================================================================
  // Shared state
  // =============================================================================

  const REFRESH_KIND_NONE = 'none';
  const REFRESH_KIND_TIME_ONLY = 'time_only';
  const REFRESH_KIND_STATS_DISPLAY = 'stats_display';
  const REFRESH_KIND_FULL = 'full';

  let deps = null;
  let currentText = '';
  let currentTextStats = null;
  let derivedConfigVersion = 0;
  let renderAuthoritySequence = 0;
  let pendingSettleInFlight = false;
  let pendingSettleRerunRequested = false;
  let currentTextAppliedRequestId = 0;
  let latestAuthoritativeRequestIdSeen = 0;
  let degradedRequestId = 0;
  let standaloneDerivedDegraded = false;
  let standaloneDerivedRefreshInFlight = false;
  let standaloneDerivedRefreshSequence = 0;
  let standaloneFullRefreshPendingState = {
    active: false,
    ownerSequence: 0,
    sinceEpochMs: null,
    reason: '',
  };
  let queuedStandaloneFollowupKind = 'none';
  let queuedStandaloneFollowupReason = '';
  let queuedStandaloneFollowupOwnerSequence = 0;
  let currentTextProcessingState = {
    active: false,
    requestId: 0,
    sinceEpochMs: null,
    source: '',
    action: '',
  };
  let deferredBootstrapSettleRequestId = 0;

  // =============================================================================
  // Helpers
  // =============================================================================

  // Dependency / normalization helpers

  function configure(nextDeps = {}) {
    deps = {
      currentTextSelectorSection: null,
      resultsTimeMultiplier: null,
      getCountContext: null,
      getSettingsCache: null,
      getWpm: null,
      applyStandaloneFullRefreshPendingState: null,
      resolveCurrentTextProcessing: null,
      ...nextDeps,
    };

    const {
      currentTextSelectorSection,
      resultsTimeMultiplier,
      getCountContext,
      getSettingsCache,
      getWpm,
      applyStandaloneFullRefreshPendingState,
      resolveCurrentTextProcessing,
    } = deps;

    if (!currentTextSelectorSection
      || typeof currentTextSelectorSection.renderPreview !== 'function') {
      throw new Error('[current-text-runtime] currentTextSelectorSection dependency incomplete');
    }
    if (!resultsTimeMultiplier
      || typeof resultsTimeMultiplier.clearBaseTotalSeconds !== 'function'
      || typeof resultsTimeMultiplier.setBaseTotalSeconds !== 'function') {
      throw new Error('[current-text-runtime] resultsTimeMultiplier dependency incomplete');
    }
    if (typeof getCountContext !== 'function') {
      throw new Error('[current-text-runtime] getCountContext dependency missing');
    }
    if (typeof getSettingsCache !== 'function') {
      throw new Error('[current-text-runtime] getSettingsCache dependency missing');
    }
    if (typeof getWpm !== 'function') {
      throw new Error('[current-text-runtime] getWpm dependency missing');
    }
    if (typeof applyStandaloneFullRefreshPendingState !== 'function') {
      throw new Error('[current-text-runtime] applyStandaloneFullRefreshPendingState dependency missing');
    }
    if (typeof resolveCurrentTextProcessing !== 'function') {
      throw new Error('[current-text-runtime] resolveCurrentTextProcessing dependency missing');
    }
  }

  function requireDeps() {
    if (!deps) {
      throw new Error('[current-text-runtime] configure() must run before usage');
    }
    return deps;
  }

  function normalizeText(value) {
    if (typeof value === 'string') return value;
    if (value === null || typeof value === 'undefined') return '';
    return String(value);
  }

  function normalizePositiveInteger(rawValue) {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 1) return 0;
    return value;
  }

  function createEmptyStats() {
    return {
      conEspacios: 0,
      sinEspacios: 0,
      palabras: 0,
    };
  }

  function normalizeCurrentTextProcessingState(rawState) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    return {
      active: state.active === true,
      requestId: normalizePositiveInteger(state.requestId),
      sinceEpochMs: Number.isFinite(Number(state.sinceEpochMs)) && Number(state.sinceEpochMs) > 0
        ? Math.floor(Number(state.sinceEpochMs))
        : null,
      source: typeof state.source === 'string' ? state.source.trim() : '',
      action: typeof state.action === 'string' ? state.action.trim() : '',
    };
  }

  function setCurrentTextInternal(nextText, { requestId = 0 } = {}) {
    currentText = normalizeText(nextText);
    if (requestId > 0) {
      currentTextAppliedRequestId = requestId;
      latestAuthoritativeRequestIdSeen = Math.max(latestAuthoritativeRequestIdSeen, requestId);
    } else {
      currentTextAppliedRequestId = 0;
    }
  }

  function armDeferredBootstrapSettle(requestId) {
    deferredBootstrapSettleRequestId = normalizePositiveInteger(requestId);
  }

  function clearDeferredBootstrapSettle({ requestId = 0, force = false } = {}) {
    if (deferredBootstrapSettleRequestId < 1) return false;
    const normalizedRequestId = normalizePositiveInteger(requestId);
    if (!force && normalizedRequestId > 0 && deferredBootstrapSettleRequestId !== normalizedRequestId) {
      return false;
    }
    deferredBootstrapSettleRequestId = 0;
    return true;
  }

  function isDeferredBootstrapSettleRequest(requestId) {
    return deferredBootstrapSettleRequestId > 0
      && deferredBootstrapSettleRequestId === normalizePositiveInteger(requestId);
  }

  function normalizeStandaloneFullRefreshPendingState(rawState) {
    const state = rawState && typeof rawState === 'object' ? rawState : {};
    const ownerSequence = normalizePositiveInteger(state.ownerSequence);
    if (state.active !== true || ownerSequence < 1) {
      return {
        active: false,
        ownerSequence: 0,
        sinceEpochMs: null,
        reason: '',
      };
    }
    return {
      active: true,
      ownerSequence,
      sinceEpochMs: Number.isFinite(Number(state.sinceEpochMs)) && Number(state.sinceEpochMs) > 0
        ? Math.floor(Number(state.sinceEpochMs))
        : Date.now(),
      reason: typeof state.reason === 'string' ? state.reason.trim() : '',
    };
  }

  function getCountArgs() {
    const { getCountContext } = requireDeps();
    const context = getCountContext() || {};
    return {
      modoConteo: context.modoConteo === 'simple' ? 'simple' : 'preciso',
      idioma: typeof context.idioma === 'string' && context.idioma.trim()
        ? context.idioma
        : 'es',
    };
  }

  function bumpRenderAuthoritySequence() {
    renderAuthoritySequence += 1;
    return renderAuthoritySequence;
  }

  function getRefreshKindPriority(kind) {
    if (kind === REFRESH_KIND_FULL) return 3;
    if (kind === REFRESH_KIND_STATS_DISPLAY) return 2;
    if (kind === REFRESH_KIND_TIME_ONLY) return 1;
    return 0;
  }

  // Pending / follow-up state helpers

  function mergeRefreshKind(currentKind, nextKind) {
    return getRefreshKindPriority(nextKind) > getRefreshKindPriority(currentKind)
      ? nextKind
      : currentKind;
  }

  function clearQueuedStandaloneFollowup() {
    queuedStandaloneFollowupKind = REFRESH_KIND_NONE;
    queuedStandaloneFollowupReason = '';
    queuedStandaloneFollowupOwnerSequence = 0;
  }

  function clearQueuedStandaloneFollowupForOwner(ownerSequence) {
    const normalizedOwnerSequence = normalizePositiveInteger(ownerSequence);
    if (normalizedOwnerSequence < 1) return;
    if (queuedStandaloneFollowupOwnerSequence !== normalizedOwnerSequence) return;
    clearQueuedStandaloneFollowup();
  }

  function queueStandaloneFollowup(kind, reason, ownerSequence) {
    const normalizedOwnerSequence = normalizePositiveInteger(ownerSequence);
    if (normalizedOwnerSequence < 1) {
      log.error('Standalone follow-up queue requested without an active owner sequence.');
      return;
    }
    if (queuedStandaloneFollowupOwnerSequence !== normalizedOwnerSequence) {
      queuedStandaloneFollowupKind = kind;
      queuedStandaloneFollowupReason = typeof reason === 'string' ? reason : '';
      queuedStandaloneFollowupOwnerSequence = normalizedOwnerSequence;
      return;
    }
    const mergedKind = mergeRefreshKind(queuedStandaloneFollowupKind, kind);
    if (mergedKind !== queuedStandaloneFollowupKind) {
      queuedStandaloneFollowupKind = mergedKind;
      queuedStandaloneFollowupReason = reason;
      return;
    }
    if (mergedKind === kind && typeof reason === 'string' && reason) {
      queuedStandaloneFollowupReason = reason;
    }
  }

  // Rendering helpers

  function renderPreview() {
    const { currentTextSelectorSection } = requireDeps();
    currentTextSelectorSection.renderPreview(currentText, {
      emptyText: tRenderer('renderer.main.selector_empty'),
    });
  }

  function syncStatusClasses() {
    const pending = currentTextProcessingState.active === true
      || standaloneFullRefreshPendingState.active === true;
    const degraded = !pending && (degradedRequestId > 0 || standaloneDerivedDegraded);
    [selectorSection, resultsSection].forEach((element) => {
      if (!element) return;
      element.classList.toggle('current-text-status--pending', pending);
      element.classList.toggle('current-text-status--degraded', degraded);
      element.setAttribute('aria-busy', pending ? 'true' : 'false');
    });
  }

  function renderTimeValue(valueText) {
    if (!resTime) return;
    renderLocalizedLabelWithInvariantValue(resTime, {
      labelText: tRenderer('renderer.main.results.time_label'),
      valueText,
      valueDirection: 'ltr',
    });
  }

  function renderDerivedValuePlaceholders(valueKey) {
    const { resultsTimeMultiplier } = requireDeps();
    const valueText = tRenderer(valueKey);
    renderPreview();
    currentTextStats = null;
    resultsTimeMultiplier.clearBaseTotalSeconds();
    if (resWords) {
      resWords.textContent = msgRenderer('renderer.main.results.words', { n: valueText });
    }
    if (resChars) {
      resChars.textContent = msgRenderer('renderer.main.results.chars', { n: valueText });
    }
    if (resCharsNoSpace) {
      resCharsNoSpace.textContent = msgRenderer('renderer.main.results.chars_no_space', { n: valueText });
    }
    renderTimeValue(valueText);
    syncStatusClasses();
  }

  function renderPendingDerivedValues() {
    renderDerivedValuePlaceholders('renderer.main.results.value_pending');
  }

  function renderDegradedDerivedValues() {
    renderDerivedValuePlaceholders('renderer.main.results.value_unavailable');
  }

  function applyStandaloneFullRefreshPendingState(rawState, { source = 'unknown' } = {}) {
    const { applyStandaloneFullRefreshPendingState: applyPendingState } = requireDeps();
    standaloneFullRefreshPendingState = normalizeStandaloneFullRefreshPendingState(rawState);
    syncStatusClasses();
    applyPendingState(standaloneFullRefreshPendingState, { source });
  }

  function beginStandaloneFullRefreshPending(ownerSequence, reason) {
    standaloneDerivedDegraded = false;
    applyStandaloneFullRefreshPendingState({
      active: true,
      ownerSequence,
      sinceEpochMs: Date.now(),
      reason,
    }, {
      source: 'standalone_full_refresh_begin',
    });
  }

  function clearStandaloneFullRefreshPending({
    ownerSequence = 0,
    source = 'unknown',
    force = false,
  } = {}) {
    if (!standaloneFullRefreshPendingState.active) return false;
    if (!force && standaloneFullRefreshPendingState.ownerSequence !== normalizePositiveInteger(ownerSequence)) {
      return false;
    }
    applyStandaloneFullRefreshPendingState({
      active: false,
      ownerSequence: 0,
      sinceEpochMs: null,
      reason: '',
    }, { source });
    return true;
  }

  function releaseStandaloneRefreshOwner(ownerSequence, source) {
    clearStandaloneFullRefreshPending({
      ownerSequence,
      source,
    });
    clearQueuedStandaloneFollowupForOwner(ownerSequence);
  }

  function formatInvariantEstimatedDuration(hours, minutes, seconds) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  function applyDisplayDerivedState(derivedState, {
    previewMode = 'always',
    persistStats = false,
  } = {}) {
    const { resultsTimeMultiplier } = requireDeps();
    const derived = derivedState && typeof derivedState === 'object' ? derivedState : {};
    const stats = derived.stats || createEmptyStats();
    if (persistStats) {
      currentTextStats = stats;
    }
    if (previewMode === 'always' || (previewMode === 'empty-only' && currentText.length === 0)) {
      renderPreview();
    }
    if (resChars) {
      resChars.textContent = msgRenderer('renderer.main.results.chars', { n: derived.charsText });
    }
    if (resCharsNoSpace) {
      resCharsNoSpace.textContent = msgRenderer(
        'renderer.main.results.chars_no_space',
        { n: derived.charsNoSpaceText }
      );
    }
    if (resWords) {
      resWords.textContent = msgRenderer('renderer.main.results.words', { n: derived.wordsText });
    }
    renderTimeValue(derived.timeText);
    resultsTimeMultiplier.setBaseTotalSeconds(derived.totalSeconds);
    syncStatusClasses();
  }

  function applySettledDerivedState(derivedState) {
    degradedRequestId = 0;
    standaloneDerivedDegraded = false;
    applyDisplayDerivedState(derivedState, {
      previewMode: 'always',
      persistStats: true,
    });
  }

  function applyStatsDisplayDerivedState(derivedState) {
    applyDisplayDerivedState(derivedState, {
      previewMode: 'empty-only',
      persistStats: false,
    });
  }

  // Derived-state builders

  async function buildDisplayDerivedStateFromNormalizedStats(stats, countArgs = getCountArgs()) {
    const { getSettingsCache, getWpm } = requireDeps();
    const settingsCache = getSettingsCache();
    const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(
      countArgs.idioma,
      settingsCache
    );
    const charsText = formatearNumero(stats.conEspacios, separadorMiles, separadorDecimal);
    const charsNoSpaceText = formatearNumero(stats.sinEspacios, separadorMiles, separadorDecimal);
    const wordsText = formatearNumero(stats.palabras, separadorMiles, separadorDecimal);
    const totalSeconds = getExactTotalSeconds(stats.palabras, getWpm());
    const timeParts = getDisplayTimeParts(totalSeconds);
    return {
      stats,
      charsText,
      charsNoSpaceText,
      wordsText,
      totalSeconds,
      timeText: formatInvariantEstimatedDuration(timeParts.hours, timeParts.minutes, timeParts.seconds),
    };
  }

  async function buildSettledDerivedState() {
    const normalizedText = normalizeText(currentText);
    const countArgs = getCountArgs();
    const stats = contarTextoModulo(normalizedText, countArgs);
    return buildDisplayDerivedStateFromNormalizedStats(stats, countArgs);
  }

  async function buildDisplayDerivedStateFromStats(stats) {
    const normalizedStats = stats && typeof stats === 'object' ? stats : createEmptyStats();
    return buildDisplayDerivedStateFromNormalizedStats(normalizedStats);
  }

  // Pending authoritative-settle lifecycle

  function isActivePendingRequest(requestId) {
    return currentTextProcessingState.active === true
      && requestId > 0
      && requestId === currentTextProcessingState.requestId;
  }

  function applyLocalResolvedProcessingState(requestId) {
    if (!isActivePendingRequest(requestId)) return;
    currentTextProcessingState = {
      active: false,
      requestId: currentTextProcessingState.requestId,
      sinceEpochMs: null,
      source: '',
      action: '',
    };
    syncStatusClasses();
  }

  async function resolveCurrentTextProcessing(requestId, ok) {
    const { resolveCurrentTextProcessing: resolver } = requireDeps();
    try {
      const result = await resolver({
        requestId,
        ok,
      });
      if (!result || result.ok !== true) {
        log.error('Current-text processing resolve returned non-ok result:', result);
        return false;
      }
      applyLocalResolvedProcessingState(requestId);
      return true;
    } catch (err) {
      log.error('Current-text processing resolve failed:', err);
      return false;
    }
  }

  async function runPendingSettleLoop(requestId, reason) {
    pendingSettleInFlight = true;
    log.debug('Current-text pending settle loop started:', { requestId, reason });
    try {
      while (isActivePendingRequest(requestId)) {
        const settleConfigVersion = derivedConfigVersion;
        pendingSettleRerunRequested = false;
        try {
          const derivedState = await buildSettledDerivedState();
          if (!isActivePendingRequest(requestId)) {
            return;
          }
          if (settleConfigVersion !== derivedConfigVersion || pendingSettleRerunRequested) {
            continue;
          }
          applySettledDerivedState(derivedState);
          if (!isActivePendingRequest(requestId)) {
            return;
          }
          if (settleConfigVersion !== derivedConfigVersion || pendingSettleRerunRequested) {
            continue;
          }
          await resolveCurrentTextProcessing(requestId, true);
          return;
        } catch (err) {
          if (!isActivePendingRequest(requestId)) {
            return;
          }
          log.error('Current-text pending settle failed:', err);
          degradedRequestId = requestId;
          renderDegradedDerivedValues();
          await resolveCurrentTextProcessing(requestId, false);
          return;
        }
      }
    } finally {
      pendingSettleInFlight = false;
      if (currentTextProcessingState.active && currentTextProcessingState.requestId !== requestId) {
        schedulePendingSettle(`followup:${reason}`);
      }
    }
  }

  function schedulePendingSettle(reason) {
    const requestId = currentTextProcessingState.requestId;
    if (!isActivePendingRequest(requestId)) return;
    if (isDeferredBootstrapSettleRequest(requestId)) {
      return;
    }
    if (currentTextAppliedRequestId !== requestId) {
      return;
    }
    if (pendingSettleInFlight) {
      pendingSettleRerunRequested = true;
      return;
    }
    void runPendingSettleLoop(requestId, reason);
  }

  function mergeDerivedRefreshIntoPendingSettle(reason) {
    derivedConfigVersion += 1;
    schedulePendingSettle(`merge:${reason}`);
  }

  function deferDerivedRefreshWhenBusy(kind, reason) {
    if (currentTextProcessingState.active) {
      mergeDerivedRefreshIntoPendingSettle(reason);
      return true;
    }
    if (standaloneFullRefreshPendingState.active) {
      queueStandaloneFollowup(
        kind,
        reason,
        standaloneFullRefreshPendingState.ownerSequence
      );
      return true;
    }
    if (standaloneDerivedRefreshInFlight) {
      queueStandaloneFollowup(kind, reason, standaloneDerivedRefreshSequence);
      return true;
    }
    return false;
  }

  function renderTimeOnlyFromCurrentStats() {
    if (!currentTextStats) {
      log.warnOnce(
        'current_text_runtime.timeOnly.noStats',
        'WPM-only update requested without current text stats; time not updated.'
      );
      return;
    }
    const { getWpm, resultsTimeMultiplier } = requireDeps();
    const totalSeconds = getExactTotalSeconds(currentTextStats.palabras, getWpm());
    const timeParts = getDisplayTimeParts(totalSeconds);
    renderTimeValue(formatInvariantEstimatedDuration(timeParts.hours, timeParts.minutes, timeParts.seconds));
    resultsTimeMultiplier.setBaseTotalSeconds(totalSeconds);
  }

  function runStandaloneStatsDisplayRefresh(reason, refreshSequence = bumpRenderAuthoritySequence()) {
    if (!currentTextStats) {
      log.warnOnce(
        'current_text_runtime.statsDisplay.noStats',
        'Display-only refresh requested without current text stats; results not updated.'
      );
      return;
    }
    void buildDisplayDerivedStateFromStats(currentTextStats)
      .then((derivedState) => {
        if (refreshSequence !== renderAuthoritySequence || currentTextProcessingState.active) {
          return;
        }
        applyStatsDisplayDerivedState(derivedState);
      })
      .catch((err) => {
        if (refreshSequence !== renderAuthoritySequence || currentTextProcessingState.active) {
          return;
        }
        log.error(`Current-text display-only refresh failed after ${reason}:`, err);
      });
  }

  // Standalone derived-refresh lifecycle

  function runQueuedStandaloneFollowup(refreshSequence) {
    if (refreshSequence !== renderAuthoritySequence || currentTextProcessingState.active) {
      clearQueuedStandaloneFollowupForOwner(refreshSequence);
      return;
    }
    if (queuedStandaloneFollowupOwnerSequence !== refreshSequence) {
      clearQueuedStandaloneFollowup();
      return;
    }
    const followupKind = queuedStandaloneFollowupKind;
    const followupReason = queuedStandaloneFollowupReason;
    clearQueuedStandaloneFollowup();
    if (followupKind === REFRESH_KIND_TIME_ONLY) {
      renderTimeOnlyFromCurrentStats();
      return;
    }
    if (followupKind === REFRESH_KIND_STATS_DISPLAY) {
      runStandaloneStatsDisplayRefresh(followupReason || 'standalone followup');
    }
  }

  function runStandaloneDerivedRefresh(
    reason,
    refreshSequence = bumpRenderAuthoritySequence(),
    { ownsStandalonePending = false } = {}
  ) {
    standaloneDerivedRefreshInFlight = true;
    standaloneDerivedRefreshSequence = refreshSequence;
    void buildSettledDerivedState()
      .then((derivedState) => {
        if (refreshSequence !== renderAuthoritySequence) {
          releaseStandaloneRefreshOwner(refreshSequence, 'standalone_full_refresh_superseded');
          log.info('Stale standalone current-text derived refresh ignored:', {
            reason,
            refreshSequence,
            renderAuthoritySequence,
          });
          return;
        }
        if (currentTextProcessingState.active) {
          releaseStandaloneRefreshOwner(refreshSequence, 'standalone_full_refresh_taken_over');
          return;
        }
        applySettledDerivedState(derivedState);
        if (ownsStandalonePending) {
          clearStandaloneFullRefreshPending({
            ownerSequence: refreshSequence,
            source: 'standalone_full_refresh_settled',
          });
        }
        runQueuedStandaloneFollowup(refreshSequence);
      })
      .catch((err) => {
        if (refreshSequence !== renderAuthoritySequence || currentTextProcessingState.active) {
          releaseStandaloneRefreshOwner(refreshSequence, 'standalone_full_refresh_abandoned');
          return;
        }
        clearQueuedStandaloneFollowupForOwner(refreshSequence);
        standaloneDerivedDegraded = ownsStandalonePending;
        renderDegradedDerivedValues();
        if (ownsStandalonePending) {
          clearStandaloneFullRefreshPending({
            ownerSequence: refreshSequence,
            source: 'standalone_full_refresh_failed',
          });
        }
        log.error(`Current-text standalone derived refresh failed after ${reason}:`, err);
      })
      .finally(() => {
        if (standaloneDerivedRefreshSequence === refreshSequence) {
          standaloneDerivedRefreshSequence = 0;
          standaloneDerivedRefreshInFlight = false;
        }
      });
  }

  function scheduleStandaloneFullRefresh(reason, refreshSequence) {
    beginStandaloneFullRefreshPending(refreshSequence, reason);
    renderPendingDerivedValues();
    setTimeout(() => {
      if (refreshSequence !== renderAuthoritySequence) {
        releaseStandaloneRefreshOwner(refreshSequence, 'standalone_full_refresh_stale_before_start');
        return;
      }
      if (currentTextProcessingState.active) {
        releaseStandaloneRefreshOwner(refreshSequence, 'standalone_full_refresh_merged_before_start');
        return;
      }
      if (standaloneFullRefreshPendingState.ownerSequence !== refreshSequence) {
        clearQueuedStandaloneFollowupForOwner(refreshSequence);
        return;
      }
      runStandaloneDerivedRefresh(reason, refreshSequence, { ownsStandalonePending: true });
    }, 0);
  }

  // =============================================================================
  // Public API
  // =============================================================================

  function getCurrentText() {
    return currentText;
  }

  function installCurrentTextState(text) {
    setCurrentTextInternal(text);
    renderPreview();
  }

  function syncBootstrapState({ initialText, processingState } = {}) {
    const normalizedState = normalizeCurrentTextProcessingState(processingState);
    setCurrentTextInternal(initialText, {
      requestId: normalizedState.active ? normalizedState.requestId : 0,
    });
    bumpRenderAuthoritySequence();
    currentTextProcessingState = normalizedState;
    if (normalizedState.active) {
      degradedRequestId = 0;
      standaloneDerivedDegraded = false;
      clearQueuedStandaloneFollowup();
      armDeferredBootstrapSettle(normalizedState.requestId);
      renderPendingDerivedValues();
      return;
    }
    clearDeferredBootstrapSettle({ force: true });
    syncStatusClasses();
    runStandaloneDerivedRefresh('bootstrap');
  }

  function applyCurrentTextProcessingState(rawState, { source = 'unknown' } = {}) {
    const nextState = normalizeCurrentTextProcessingState(rawState);
    currentTextProcessingState = nextState;
    if (!nextState.active) {
      clearDeferredBootstrapSettle({ force: true });
    } else if (
      deferredBootstrapSettleRequestId > 0
      && deferredBootstrapSettleRequestId !== nextState.requestId
    ) {
      clearDeferredBootstrapSettle({ force: true });
    }
    if (nextState.active) {
      bumpRenderAuthoritySequence();
      degradedRequestId = 0;
      standaloneDerivedDegraded = false;
      clearStandaloneFullRefreshPending({
        force: true,
        source: `standalone_full_refresh_taken_over:${source}`,
      });
      clearQueuedStandaloneFollowup();
      renderPendingDerivedValues();
      schedulePendingSettle(`state:${source}`);
      return;
    }
    syncStatusClasses();
  }

  function startDeferredBootstrapSettle() {
    const requestId = deferredBootstrapSettleRequestId;
    if (requestId < 1) return;
    if (!isActivePendingRequest(requestId) || currentTextAppliedRequestId !== requestId) {
      clearDeferredBootstrapSettle({ force: true });
      log.info('Startup current-text deferred bootstrap settle cancelled before kickoff.', {
        deferredRequestId: requestId,
        activeRequestId: currentTextProcessingState.requestId,
        currentTextAppliedRequestId,
      });
      return;
    }
    clearDeferredBootstrapSettle({ requestId });
    log.info('Startup current-text deferred bootstrap settle starting.', {
      requestId,
      textLength: currentText.length,
    });
    schedulePendingSettle('bootstrap');
  }

  function handleCurrentTextUpdated(payload, { onAuthoritativeTextChanged = null } = {}) {
    const normalizedPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : { text: payload };
    const requestId = normalizePositiveInteger(normalizedPayload.requestId);
    if (requestId > 0 && requestId < latestAuthoritativeRequestIdSeen) {
      log.info('Stale current-text-updated payload ignored:', {
        requestId,
        latestAuthoritativeRequestIdSeen,
      });
      return;
    }

    const previousText = currentText;
    setCurrentTextInternal(normalizedPayload.text, { requestId });
    const refreshSequence = bumpRenderAuthoritySequence();
    if (typeof onAuthoritativeTextChanged === 'function' && previousText !== currentText) {
      onAuthoritativeTextChanged(previousText, currentText);
    }

    if (isActivePendingRequest(requestId)) {
      degradedRequestId = 0;
      standaloneDerivedDegraded = false;
      clearStandaloneFullRefreshPending({
        force: true,
        source: 'standalone_full_refresh_taken_over:current_text_updated',
      });
      clearQueuedStandaloneFollowup();
      renderPendingDerivedValues();
      schedulePendingSettle('current_text_updated');
      return;
    }

    renderPreview();
    runStandaloneDerivedRefresh('current-text update', refreshSequence);
  }

  function requestDerivedRefresh(reason) {
    derivedConfigVersion += 1;
    const refreshSequence = bumpRenderAuthoritySequence();
    if (currentTextProcessingState.active) {
      schedulePendingSettle(`merge:${reason}`);
      return;
    }
    scheduleStandaloneFullRefresh(reason, refreshSequence);
  }

  function requestStatsDisplayRefresh(reason) {
    if (deferDerivedRefreshWhenBusy(REFRESH_KIND_STATS_DISPLAY, reason)) {
      return;
    }
    runStandaloneStatsDisplayRefresh(reason);
  }

  function requestTimeOnlyRefresh(reason) {
    if (deferDerivedRefreshWhenBusy(REFRESH_KIND_TIME_ONLY, reason)) {
      return;
    }
    bumpRenderAuthoritySequence();
    renderTimeOnlyFromCurrentStats();
  }

  window.CurrentTextRuntime = {
    applyCurrentTextProcessingState,
    configure,
    getCurrentText,
    handleCurrentTextUpdated,
    installCurrentTextState,
    requestDerivedRefresh,
    requestStatsDisplayRefresh,
    requestTimeOnlyRefresh,
    startDeferredBootstrapSettle,
    syncBootstrapState,
  };
})();

// =============================================================================
// End of public/js/current_text_runtime.js
// =============================================================================
