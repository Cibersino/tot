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
  let currentTextProcessingState = {
    active: false,
    requestId: 0,
    sinceEpochMs: null,
    source: '',
    action: '',
  };
  const TRACE_LARGE_TEXT_CHARS = 1_000_000;

  // =============================================================================
  // Helpers
  // =============================================================================

  function configure(nextDeps = {}) {
    deps = {
      currentTextSelectorSection: null,
      resultsTimeMultiplier: null,
      getCountContext: null,
      getSettingsCache: null,
      getWpm: null,
      resolveCurrentTextProcessing: null,
      ...nextDeps,
    };

    const {
      currentTextSelectorSection,
      resultsTimeMultiplier,
      getCountContext,
      getSettingsCache,
      getWpm,
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

  function roundMs(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function shouldTraceCurrentTextWork(reason, textLength) {
    const normalizedReason = typeof reason === 'string' ? reason : '';
    return normalizedReason.includes('startup')
      || normalizedReason.includes('bootstrap')
      || currentTextProcessingState.action === 'initial_load'
      || Number(textLength) >= TRACE_LARGE_TEXT_CHARS;
  }

  function renderPreview() {
    const { currentTextSelectorSection } = requireDeps();
    currentTextSelectorSection.renderPreview(currentText, {
      emptyText: tRenderer('renderer.main.selector_empty'),
    });
  }

  function syncStatusClasses() {
    const pending = currentTextProcessingState.active === true;
    const degraded = !pending && degradedRequestId > 0;
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

  function formatInvariantEstimatedDuration(hours, minutes, seconds) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  function applySettledDerivedState(derivedState) {
    const { resultsTimeMultiplier } = requireDeps();
    const derived = derivedState && typeof derivedState === 'object' ? derivedState : {};
    const stats = derived.stats || {
      conEspacios: 0,
      sinEspacios: 0,
      palabras: 0,
    };
    currentTextStats = stats;
    degradedRequestId = 0;
    renderPreview();
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

  async function buildSettledDerivedState(reason = 'unknown') {
    const { getSettingsCache, getWpm } = requireDeps();
    const deriveStartMs = performance.now();
    const normalizedText = normalizeText(currentText);
    const countArgs = getCountArgs();
    const countStartMs = performance.now();
    const stats = contarTextoModulo(normalizedText, countArgs);
    const countElapsedMs = performance.now() - countStartMs;
    const settingsCache = getSettingsCache();
    const separatorsStartMs = performance.now();
    const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(
      countArgs.idioma,
      settingsCache
    );
    const separatorsElapsedMs = performance.now() - separatorsStartMs;
    const formatStartMs = performance.now();
    const charsText = formatearNumero(stats.conEspacios, separadorMiles, separadorDecimal);
    const charsNoSpaceText = formatearNumero(stats.sinEspacios, separadorMiles, separadorDecimal);
    const wordsText = formatearNumero(stats.palabras, separadorMiles, separadorDecimal);
    const totalSeconds = getExactTotalSeconds(stats.palabras, getWpm());
    const timeParts = getDisplayTimeParts(totalSeconds);
    const formatElapsedMs = performance.now() - formatStartMs;
    const deriveElapsedMs = performance.now() - deriveStartMs;
    if (shouldTraceCurrentTextWork(reason, normalizedText.length)) {
      log.info('Current-text derive trace:', {
        reason,
        textLength: normalizedText.length,
        modeConteo: countArgs.modoConteo,
        idioma: countArgs.idioma,
        countMs: roundMs(countElapsedMs),
        separatorsMs: roundMs(separatorsElapsedMs),
        formatMs: roundMs(formatElapsedMs),
        totalMs: roundMs(deriveElapsedMs),
      });
    }
    return {
      stats,
      charsText,
      charsNoSpaceText,
      wordsText,
      totalSeconds,
      timeText: formatInvariantEstimatedDuration(timeParts.hours, timeParts.minutes, timeParts.seconds),
    };
  }

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
        log.warn('Current-text processing resolve returned non-ok result (ignored):', result);
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
    const settleStartMs = performance.now();
    let settleOutcome = 'inactive_before_loop';
    try {
      while (isActivePendingRequest(requestId)) {
        settleOutcome = 'loop_active';
        const settleConfigVersion = derivedConfigVersion;
        pendingSettleRerunRequested = false;
        try {
          const derivedState = await buildSettledDerivedState(reason);
          if (!isActivePendingRequest(requestId)) {
            settleOutcome = 'superseded_before_apply';
            return;
          }
          if (settleConfigVersion !== derivedConfigVersion || pendingSettleRerunRequested) {
            settleOutcome = 'rerun_requested';
            continue;
          }
          applySettledDerivedState(derivedState);
          if (!isActivePendingRequest(requestId)) {
            settleOutcome = 'superseded_after_apply';
            return;
          }
          if (settleConfigVersion !== derivedConfigVersion || pendingSettleRerunRequested) {
            settleOutcome = 'rerun_requested_post_apply';
            continue;
          }
          settleOutcome = 'resolved_ok';
          await resolveCurrentTextProcessing(requestId, true);
          return;
        } catch (err) {
          if (!isActivePendingRequest(requestId)) {
            settleOutcome = 'superseded_after_error';
            return;
          }
          log.error('Current-text pending settle failed:', err);
          degradedRequestId = requestId;
          renderDegradedDerivedValues();
          settleOutcome = 'resolved_error';
          await resolveCurrentTextProcessing(requestId, false);
          return;
        }
      }
    } finally {
      pendingSettleInFlight = false;
      if (shouldTraceCurrentTextWork(reason, currentText.length)) {
        log.info('Current-text pending settle loop trace:', {
          requestId,
          reason,
          outcome: settleOutcome,
          textLength: currentText.length,
          totalMs: roundMs(performance.now() - settleStartMs),
        });
      }
      if (currentTextProcessingState.active && currentTextProcessingState.requestId !== requestId) {
        schedulePendingSettle(`followup:${reason}`);
      }
    }
  }

  function schedulePendingSettle(reason) {
    const requestId = currentTextProcessingState.requestId;
    if (!isActivePendingRequest(requestId)) return;
    renderPendingDerivedValues();
    if (currentTextAppliedRequestId !== requestId) {
      return;
    }
    if (pendingSettleInFlight) {
      pendingSettleRerunRequested = true;
      return;
    }
    void runPendingSettleLoop(requestId, reason);
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

  function runStandaloneDerivedRefresh(reason, refreshSequence = bumpRenderAuthoritySequence()) {
    void buildSettledDerivedState(reason)
      .then((derivedState) => {
        if (refreshSequence !== renderAuthoritySequence) {
          log.info('Stale standalone current-text derived refresh ignored:', {
            reason,
            refreshSequence,
            renderAuthoritySequence,
          });
          return;
        }
        if (currentTextProcessingState.active) {
          return;
        }
        applySettledDerivedState(derivedState);
      })
      .catch((err) => {
        if (refreshSequence !== renderAuthoritySequence || currentTextProcessingState.active) {
          return;
        }
        log.error(`Current-text standalone derived refresh failed after ${reason}:`, err);
      });
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
    const bootstrapStartMs = performance.now();
    const normalizedState = normalizeCurrentTextProcessingState(processingState);
    const setStateStartMs = performance.now();
    setCurrentTextInternal(initialText, {
      requestId: normalizedState.active ? normalizedState.requestId : 0,
    });
    const setStateElapsedMs = performance.now() - setStateStartMs;
    bumpRenderAuthoritySequence();
    currentTextProcessingState = normalizedState;
    let placeholderElapsedMs = 0;
    if (normalizedState.active) {
      degradedRequestId = 0;
      const placeholderStartMs = performance.now();
      renderPendingDerivedValues();
      placeholderElapsedMs = performance.now() - placeholderStartMs;
      schedulePendingSettle('bootstrap');
      log.info('Startup current-text bootstrap trace:', {
        textLength: currentText.length,
        requestId: normalizedState.requestId,
        pendingActive: true,
        setStateMs: roundMs(setStateElapsedMs),
        placeholderMs: roundMs(placeholderElapsedMs),
        totalMs: roundMs(performance.now() - bootstrapStartMs),
      });
      return;
    }
    syncStatusClasses();
    runStandaloneDerivedRefresh('bootstrap');
    log.info('Startup current-text bootstrap trace:', {
      textLength: currentText.length,
      requestId: normalizedState.requestId,
      pendingActive: false,
      setStateMs: roundMs(setStateElapsedMs),
      placeholderMs: roundMs(placeholderElapsedMs),
      totalMs: roundMs(performance.now() - bootstrapStartMs),
    });
  }

  function applyCurrentTextProcessingState(rawState, { source = 'unknown' } = {}) {
    const nextState = normalizeCurrentTextProcessingState(rawState);
    currentTextProcessingState = nextState;
    if (nextState.active) {
      bumpRenderAuthoritySequence();
      degradedRequestId = 0;
      renderPendingDerivedValues();
      schedulePendingSettle(`state:${source}`);
      return;
    }
    syncStatusClasses();
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
    renderPreview();
    if (typeof onAuthoritativeTextChanged === 'function' && previousText !== currentText) {
      onAuthoritativeTextChanged(previousText, currentText);
    }

    if (isActivePendingRequest(requestId)) {
      degradedRequestId = 0;
      renderPendingDerivedValues();
      schedulePendingSettle('current_text_updated');
      return;
    }

    runStandaloneDerivedRefresh('current-text update', refreshSequence);
  }

  function requestDerivedRefresh(reason) {
    derivedConfigVersion += 1;
    const refreshSequence = bumpRenderAuthoritySequence();
    if (currentTextProcessingState.active) {
      renderPendingDerivedValues();
      schedulePendingSettle(`merge:${reason}`);
      return;
    }
    runStandaloneDerivedRefresh(reason, refreshSequence);
  }

  function requestTimeOnlyRefresh(reason) {
    derivedConfigVersion += 1;
    bumpRenderAuthoritySequence();
    if (currentTextProcessingState.active) {
      renderPendingDerivedValues();
      schedulePendingSettle(`merge:${reason}`);
      return;
    }
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

  window.CurrentTextRuntime = {
    applyCurrentTextProcessingState,
    configure,
    getCurrentText,
    handleCurrentTextUpdated,
    installCurrentTextState,
    requestDerivedRefresh,
    requestTimeOnlyRefresh,
    syncBootstrapState,
  };
})();

// =============================================================================
// End of public/js/current_text_runtime.js
// =============================================================================
