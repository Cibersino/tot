// public/js/crono.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer-side stopwatch helpers and controller.
// Responsibilities:
// - Adapt shared stopwatch time utilities for renderer formatting and manual input.
// - Compute real WPM from elapsed time and current text.
// - Apply received stopwatch state to the main renderer UI.
// - Coordinate Floating Stopwatch bridge calls and post-open state refresh.
// - Expose controller wiring and stopwatch helpers to renderer consumers.

(() => {
  // =============================================================================
  // Dependencies and logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[crono] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('crono');
  log.debug('Crono starting...');
  const rendererIcons = window.RendererIcons || null;
  if (!rendererIcons || typeof rendererIcons.applyIconToElement !== 'function') {
    throw new Error('[crono] RendererIcons.applyIconToElement unavailable; cannot continue');
  }
  const stopwatchTimeCore = window.StopwatchTimeCore || null;
  if (!stopwatchTimeCore || typeof stopwatchTimeCore.createStopwatchTimeUtils !== 'function') {
    throw new Error('[crono] StopwatchTimeCore.createStopwatchTimeUtils unavailable; cannot continue');
  }
  const stopwatchTimeUtils = stopwatchTimeCore.createStopwatchTimeUtils();
  const {
    formatStopwatchMs,
    parseStopwatchInput,
  } = stopwatchTimeUtils;

  // =============================================================================
  // Stopwatch formatting and WPM helpers
  // =============================================================================
  function formatCrono(ms) {
    return formatStopwatchMs(ms);
  }

  function parseCronoInput(input) {
    return parseStopwatchInput(input);
  }

  async function actualizarVelocidadRealFromElapsed({
    ms,
    currentText,
    contarTexto,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
    idiomaActual,
    settingsCache,
    realWpmDisplay
  }) {
    const secondsTotal = (ms || 0) / 1000;
    const stats = contarTexto(currentText);
    const words = stats?.palabras || 0;
    if (words > 0 && secondsTotal > 0) {
      const realWpm = (words / secondsTotal) * 60;
      const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(
        idiomaActual,
        settingsCache
      );
      const velocidadFormateada = formatearNumero(realWpm, separadorMiles, separadorDecimal);
      if (realWpmDisplay) realWpmDisplay.textContent = `${velocidadFormateada} WPM`;
      return realWpm;
    }
    if (realWpmDisplay) realWpmDisplay.innerHTML = '&nbsp;';
    return 0;
  }

  function clearRealWpmDisplay(realWpmDisplay) {
    if (realWpmDisplay) realWpmDisplay.innerHTML = '&nbsp;';
  }

  async function safeRecomputeRealWpm(payload) {
    try {
      return await actualizarVelocidadRealFromElapsed(payload);
    } catch (error) {
      log.error('Real WPM update failed (ignored):', error);
      return 0;
    }
  }

  // =============================================================================
  // UI helpers
  // =============================================================================
  function applyToggleIcon(toggleButton, iconName = 'play') {
    if (!toggleButton) return;
    rendererIcons.applyIconToElement(toggleButton, iconName, {
      preserveContent: false,
    });
  }

  function setToggleChecked(toggleVF, isChecked) {
    if (!toggleVF) return;
    toggleVF.checked = !!isChecked;
    toggleVF.setAttribute('aria-checked', isChecked ? 'true' : 'false');
  }

  function uiResetCrono({ cronoDisplay, realWpmDisplay, tToggle, playIconName = 'play' }) {
    if (cronoDisplay) cronoDisplay.value = '00:00:00';
    clearRealWpmDisplay(realWpmDisplay);
    applyToggleIcon(tToggle, playIconName);
  }

  function restoreDisplayValue(cronoDisplay, displayValue) {
    if (cronoDisplay) {
      cronoDisplay.value = displayValue;
    }
  }

  function setCronoDisplayInvalidState(cronoDisplay, isInvalid) {
    if (!cronoDisplay) return;
    cronoDisplay.classList.toggle('is-invalid', isInvalid);
    cronoDisplay.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
  }

  // =============================================================================
  // Floating Stopwatch bridge
  // =============================================================================

  async function openFlotante({
    electronAPI,
    toggleVF,
    cronoDisplay,
    cronoEditing,
    tToggle,
    setElapsedRunning,
    playIconName = 'play',
    pauseIconName = 'pause'
  }) {
    if (!electronAPI || typeof electronAPI.openFlotanteWindow !== 'function') {
      log.warn('openFlotanteWindow unavailable; Floating Stopwatch request ignored');
      setToggleChecked(toggleVF, false);
      return null;
    }
    try {
      const openResult = await electronAPI.openFlotanteWindow();
      if (!openResult || openResult.ok !== true) {
        const failureCode = openResult && typeof openResult.error === 'string'
          ? openResult.error
          : 'UNKNOWN_FAILURE';
        throw new Error(`[crono] Floating Stopwatch open failed: ${failureCode}`);
      }
      setToggleChecked(toggleVF, true);

      if (typeof electronAPI.getCronoState !== 'function') {
        log.warn('getCronoState unavailable; direct stopwatch refresh skipped after Floating Stopwatch open');
        return null;
      }

      try {
        const state = await electronAPI.getCronoState();
        if (!state) {
          log.warn('getCronoState returned no state; direct stopwatch refresh skipped after Floating Stopwatch open');
          return null;
        }

        const elapsed = typeof state.elapsed === 'number' ? state.elapsed : 0;
        const running = !!state.running;
        if (setElapsedRunning) setElapsedRunning(elapsed, running);
        if (cronoDisplay && !cronoEditing) {
          cronoDisplay.value = state.display || formatCrono(elapsed);
        }
        applyToggleIcon(tToggle, running ? pauseIconName : playIconName);
        return { elapsed, running, display: cronoDisplay ? cronoDisplay.value : state.display };
      } catch (error) {
        log.warn('Floating Stopwatch post-open state refresh failed (ignored):', error);
        return null;
      }
    } catch (error) {
      log.error('Floating Stopwatch open failed:', error);
      setToggleChecked(toggleVF, false);
      return null;
    }
  }

  async function closeFlotante({ electronAPI, toggleVF }) {
    if (!electronAPI || typeof electronAPI.closeFlotanteWindow !== 'function') {
      log.warn('closeFlotanteWindow unavailable; Floating Stopwatch close request ignored');
      setToggleChecked(toggleVF, false);
      return;
    }
    try {
      const closeResult = await electronAPI.closeFlotanteWindow();
      if (!closeResult || closeResult.ok !== true) {
        const failureCode = closeResult && typeof closeResult.error === 'string'
          ? closeResult.error
          : 'UNKNOWN_FAILURE';
        log.warn('Floating Stopwatch close request was not accepted (ignored):', failureCode);
      }
    } catch (error) {
      log.error('Floating Stopwatch close request failed (ignored):', error);
    } finally {
      setToggleChecked(toggleVF, false);
    }
  }

  // =============================================================================
  // Manual elapsed-time editing
  // =============================================================================

  async function applyManualTime({
    value,
    cronoDisplay,
    cronoModule = null,
    electronAPI = null,
    currentText,
    contarTexto,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
    idiomaActual,
    settingsCache,
    realWpmDisplay,
    setElapsed,
    setLastComputedElapsed,
    running = false,
    baselineElapsed = null,
    baselineDisplay = null
  }) {
    const effectiveBaselineElapsed = (typeof baselineElapsed === 'number')
      ? baselineElapsed
      : (typeof setElapsed === 'function' ? setElapsed() : 0);
    const effectiveBaselineDisplay = baselineDisplay || formatCrono(effectiveBaselineElapsed || 0);
    const inputValue = String(value || '').trim();

    // If the stopwatch is running, ignore manual edits and restore the current display
    if (running) {
      restoreDisplayValue(cronoDisplay, effectiveBaselineDisplay);
      return null;
    }

    // No change: keep baseline (including fractional ms) untouched
    if (inputValue === effectiveBaselineDisplay) {
      restoreDisplayValue(cronoDisplay, effectiveBaselineDisplay);
      if (typeof setElapsed === 'function' && typeof effectiveBaselineElapsed === 'number') {
        setElapsed(effectiveBaselineElapsed);
      }
      return effectiveBaselineElapsed;
    }

    const parsed = (cronoModule && cronoModule.parseCronoInput)
      ? cronoModule.parseCronoInput(value)
      : parseCronoInput(value);

    if (parsed === null) {
      restoreDisplayValue(cronoDisplay, effectiveBaselineDisplay);
      return null;
    }

    const msRounded = Math.floor(parsed / 1000) * 1000;
    if (msRounded < 0) {
      restoreDisplayValue(cronoDisplay, effectiveBaselineDisplay);
      return null;
    }

    const syncRoundedElapsedUi = async () => {
      restoreDisplayValue(cronoDisplay, formatCrono(msRounded));
      await safeRecomputeRealWpm({
        ms: msRounded,
        currentText,
        contarTexto,
        obtenerSeparadoresDeNumeros,
        formatearNumero,
        idiomaActual,
        settingsCache,
        realWpmDisplay
      });
      if (typeof setLastComputedElapsed === 'function') setLastComputedElapsed(msRounded);
    };

    if (electronAPI && typeof electronAPI.setCronoElapsed === 'function') {
      try {
        // This IPC send does not acknowledge whether main accepted the elapsed value.
        // The following UI update is optimistic; main remains the stopwatch state owner.
        await electronAPI.setCronoElapsed(msRounded);
      } catch (error) {
        log.warn('setCronoElapsed failed; manual elapsed edit ignored:', error);
        restoreDisplayValue(cronoDisplay, effectiveBaselineDisplay);
        return null;
      }

      try {
        await syncRoundedElapsedUi();
      } catch (error) {
        log.error('Manual elapsed UI synchronization failed after setCronoElapsed dispatch (ignored):', error);
      }
      return msRounded;
    }

    log.warn('[crono] setCronoElapsed unavailable; manual elapsed edit ignored');
    restoreDisplayValue(cronoDisplay, effectiveBaselineDisplay);
    return null;
  }

  // =============================================================================
  // Stopwatch state application
  // =============================================================================
  function handleCronoState({
    state,
    cronoDisplay,
    cronoEditing,
    tToggle,
    realWpmDisplay,
    currentText,
    contarTexto,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
    idiomaActual,
    settingsCache,
    prevRunning = false,
    lastComputedElapsedForWpm = null,
    playIconName = 'play',
    pauseIconName = 'pause'
  }) {
    const newElapsed = typeof state?.elapsed === 'number' ? state.elapsed : 0;
    const newRunning = !!state?.running;

    if (cronoDisplay) {
      cronoDisplay.disabled = newRunning;
      if (newRunning) setCronoDisplayInvalidState(cronoDisplay, false);
    }

    if (cronoDisplay && !cronoEditing) {
      cronoDisplay.value = state?.display || formatCrono(newElapsed);
    }

    applyToggleIcon(tToggle, newRunning ? pauseIconName : playIconName);

    let updatedLast = lastComputedElapsedForWpm;
    const becamePaused = prevRunning === true && newRunning === false;
    const shouldRefreshStoppedWpm = !newRunning
      && (becamePaused || updatedLast === null || updatedLast !== newElapsed);
    if (shouldRefreshStoppedWpm) {
      void safeRecomputeRealWpm({
        ms: newElapsed,
        currentText,
        contarTexto,
        obtenerSeparadoresDeNumeros,
        formatearNumero,
        idiomaActual,
        settingsCache,
        realWpmDisplay
      });
      updatedLast = newElapsed;
    }

    if (!newRunning && newElapsed === 0 && !cronoEditing) {
      uiResetCrono({ cronoDisplay, realWpmDisplay, tToggle, playIconName });
      updatedLast = 0;
    }

    return {
      elapsed: newElapsed,
      running: newRunning,
      prevRunning: newRunning,
      lastComputedElapsedForWpm: updatedLast
    };
  }

  // =============================================================================
  // Controller factory
  // =============================================================================
  function createController(options = {}) {
    const elements = options.elements || {};
    const electronAPI = options.electronAPI || null;

    const deps = {
      contarTexto: options.contarTexto,
      obtenerSeparadoresDeNumeros: options.obtenerSeparadoresDeNumeros,
      formatearNumero: options.formatearNumero,
      getIdiomaActual: typeof options.getIdiomaActual === 'function' ? options.getIdiomaActual : () => null,
      getCurrentText: typeof options.getCurrentText === 'function' ? options.getCurrentText : () => '',
      getSettingsCache: typeof options.getSettingsCache === 'function' ? options.getSettingsCache : () => null,
    };

    let playIconName = (typeof options.playIconName === 'string') ? options.playIconName : 'play';
    let pauseIconName = (typeof options.pauseIconName === 'string') ? options.pauseIconName : 'pause';

    let elapsed = 0;
    let running = false;
    let prevRunning = false;
    let lastComputedElapsedForWpm = null;
    let cronoEditing = false;
    let baselineElapsed = null;
    let baselineDisplay = null;
    let bound = false;

    const updateIcons = (icons = {}) => {
      if (typeof icons.playIconName === 'string') playIconName = icons.playIconName;
      if (typeof icons.pauseIconName === 'string') pauseIconName = icons.pauseIconName;
      applyToggleIcon(elements.tToggle, running ? pauseIconName : playIconName);
    };

    const updateDeps = (next = {}) => {
      if (next.contarTexto) deps.contarTexto = next.contarTexto;
      if (next.obtenerSeparadoresDeNumeros) deps.obtenerSeparadoresDeNumeros = next.obtenerSeparadoresDeNumeros;
      if (next.formatearNumero) deps.formatearNumero = next.formatearNumero;
      if (typeof next.getIdiomaActual === 'function') deps.getIdiomaActual = next.getIdiomaActual;
      if (typeof next.getCurrentText === 'function') deps.getCurrentText = next.getCurrentText;
      if (typeof next.getSettingsCache === 'function') deps.getSettingsCache = next.getSettingsCache;
    };

    const getWpmDependencies = () => ({
      contarTexto: deps.contarTexto,
      obtenerSeparadoresDeNumeros: deps.obtenerSeparadoresDeNumeros,
      formatearNumero: deps.formatearNumero,
      idiomaActual: deps.getIdiomaActual(),
      settingsCache: deps.getSettingsCache()
    });

    const handleState = (state) => {
      const nextState = handleCronoState({
        state,
        cronoDisplay: elements.cronoDisplay,
        cronoEditing,
        tToggle: elements.tToggle,
        realWpmDisplay: elements.realWpmDisplay,
        currentText: deps.getCurrentText(),
        ...getWpmDependencies(),
        prevRunning,
        lastComputedElapsedForWpm,
        playIconName,
        pauseIconName
      });
      if (nextState) {
        elapsed = nextState.elapsed;
        running = nextState.running;
        prevRunning = nextState.prevRunning;
        lastComputedElapsedForWpm = nextState.lastComputedElapsedForWpm;
      }
    };

    const handleTextChange = async (previousText, nextText) => {
      try {
        // NOTE: previousText is currently only used for the strict equality guard below.
        if (previousText === nextText) return;

        if (!nextText) {
          // Real WPM is text-derived; clearing its source leaves stopwatch state intact.
          clearRealWpmDisplay(elements.realWpmDisplay);
          lastComputedElapsedForWpm = null;
          return;
        }

        if (running) return;

        if (!(typeof elapsed === 'number' && elapsed > 0)) return;
        if (!deps.contarTexto || !deps.obtenerSeparadoresDeNumeros || !deps.formatearNumero) return;

        await safeRecomputeRealWpm({
          ms: elapsed,
          currentText: nextText,
          ...getWpmDependencies(),
          realWpmDisplay: elements.realWpmDisplay
        });
        lastComputedElapsedForWpm = elapsed;
      } catch (error) {
        log.error('Text-change stopwatch update failed (ignored):', error);
      }
    };

    const openFlotanteWindow = async () => {
      const openResult = await openFlotante({
        electronAPI,
        toggleVF: elements.toggleVF,
        cronoDisplay: elements.cronoDisplay,
        cronoEditing,
        tToggle: elements.tToggle,
        setElapsedRunning: (elapsedVal, runningVal) => {
          elapsed = elapsedVal;
          running = runningVal;
        },
        playIconName,
        pauseIconName
      });
      if (openResult && typeof openResult.elapsed === 'number') {
        lastComputedElapsedForWpm = openResult.elapsed;
        prevRunning = running;
      }
      return openResult;
    };

    const closeFlotanteWindow = async () => {
      await closeFlotante({ electronAPI, toggleVF: elements.toggleVF });
    };

    const bind = () => {
      if (bound) return;
      bound = true;

      if (elements.tToggle) {
        elements.tToggle.addEventListener('click', () => {
          if (electronAPI && typeof electronAPI.sendCronoToggle === 'function') {
            try {
              electronAPI.sendCronoToggle();
            } catch (error) {
              log.error('Stopwatch toggle request failed (ignored):', error);
            }
          } else {
            log.warn('[crono] sendCronoToggle unavailable; toggle action ignored');
          }
        });
      }

      if (elements.tReset) {
        elements.tReset.addEventListener('click', () => {
          if (electronAPI && typeof electronAPI.sendCronoReset === 'function') {
            try {
              electronAPI.sendCronoReset();
            } catch (error) {
              log.error('Stopwatch reset request failed (ignored):', error);
            }
          } else {
            log.warn('[crono] sendCronoReset unavailable; reset action ignored');
          }
        });
      }

      if (elements.toggleVF) {
        // This switch is a best-effort control, not an authoritative view of the floating window's lifecycle.
        // Rapid open/close reversals may leave the switch out of sync or a new open request unfulfilled.
        // Main retains ownership of the window and stopwatch state; these cases are recoverable.
        elements.toggleVF.addEventListener('change', async () => {
          const wantOpen = !!elements.toggleVF.checked;
          setToggleChecked(elements.toggleVF, wantOpen);

          if (wantOpen) {
            await openFlotanteWindow();
          } else {
            await closeFlotanteWindow();
          }
        });
      }

      if (electronAPI && typeof electronAPI.onFlotanteClosed === 'function') {
        try {
          electronAPI.onFlotanteClosed(() => {
            setToggleChecked(elements.toggleVF, false);
          });
        } catch (error) {
          log.warn('onFlotanteClosed registration failed; flotante toggle may desync:', error);
        }
      } else if (electronAPI) {
        log.warn('[crono] onFlotanteClosed unavailable; flotante toggle may desync');
      }

      if (elements.cronoDisplay) {
        elements.cronoDisplay.addEventListener('focus', () => {
          cronoEditing = true;
          baselineElapsed = elapsed;
          baselineDisplay = elements.cronoDisplay.value;
        });

        elements.cronoDisplay.addEventListener('input', () => {
          setCronoDisplayInvalidState(
            elements.cronoDisplay,
            parseCronoInput(elements.cronoDisplay.value) === null
          );
        });

        elements.cronoDisplay.addEventListener('blur', () => {
          cronoEditing = false;
          void applyManualTime({
            value: elements.cronoDisplay.value,
            cronoDisplay: elements.cronoDisplay,
            cronoModule: window.RendererCrono,
            electronAPI,
            currentText: deps.getCurrentText(),
            ...getWpmDependencies(),
            realWpmDisplay: elements.realWpmDisplay,
            setElapsed: (msVal) => {
              if (typeof msVal === 'number') {
                elapsed = msVal;
              }
              return elapsed;
            },
            setLastComputedElapsed: (msVal) => { lastComputedElapsedForWpm = msVal; },
            running,
            baselineElapsed,
            baselineDisplay
          });
          setCronoDisplayInvalidState(elements.cronoDisplay, false);
          baselineElapsed = null;
          baselineDisplay = null;
        });

        elements.cronoDisplay.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            elements.cronoDisplay.blur();
          }
        });
      }
    };

    updateIcons({ playIconName, pauseIconName });

    return {
      bind,
      handleState,
      handleTextChange,
      updateIcons,
      updateDeps,
      getState: () => ({
        elapsed,
        running,
        prevRunning,
        lastComputedElapsedForWpm,
        cronoEditing
      })
    };
  }

  // =============================================================================
  // Module surface
  // =============================================================================
  window.RendererCrono = {
    formatCrono,
    parseCronoInput,
    actualizarVelocidadRealFromElapsed,
    uiResetCrono,
    openFlotante,
    closeFlotante,
    applyManualTime,
    handleCronoState,
    createController
  };
})();

// =============================================================================
// End of public/js/crono.js
// =============================================================================
