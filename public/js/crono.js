// public/js/crono.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer-side stopwatch helpers and controller.
// Responsibilities:
// - Format and parse stopwatch time values.
// - Compute real WPM from elapsed time and current text.
// - Orchestrate DOM updates for the main stopwatch UI.
// - Bridge optional Electron APIs for flotante window control and state sync.
// - Expose a small controller API for renderer wiring.

(() => {
  // =============================================================================
  // Logger / scope
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
  // Helpers (format/parse + WPM)
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

  async function safeRecomputeRealWpm(payload) {
    try {
      return await actualizarVelocidadRealFromElapsed(payload);
    } catch (err) {
      log.error('Error updating real WPM:', err);
      return 0;
    }
  }

  // =============================================================================
  // UI helpers and Electron bridge (flotante)
  // =============================================================================
  function applyToggleIcon(toggleButton, iconName = 'play') {
    if (!toggleButton) return;
    const configuredSize = toggleButton.getAttribute('data-tot-icon-size') || 'md';
    rendererIcons.applyIconToElement(toggleButton, iconName, {
      size: configuredSize,
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
    if (realWpmDisplay) realWpmDisplay.innerHTML = '&nbsp;';
    applyToggleIcon(tToggle, playIconName);
  }

  function restoreDisplayValue(cronoDisplay, displayValue) {
    if (cronoDisplay) {
      cronoDisplay.value = displayValue;
    }
  }

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
      log.warn('openFlotanteWindow unavailable in electronAPI');
      setToggleChecked(toggleVF, false);
      return null;
    }
    try {
      await electronAPI.openFlotanteWindow();
      setToggleChecked(toggleVF, true);

      if (typeof electronAPI.getCronoState === 'function') {
        try {
          const state = await electronAPI.getCronoState();
          if (state) {
            const elapsed = typeof state.elapsed === 'number' ? state.elapsed : 0;
            const running = !!state.running;
            if (setElapsedRunning) setElapsedRunning(elapsed, running);
            if (cronoDisplay && !cronoEditing) {
              cronoDisplay.value = state.display || formatCrono(elapsed);
            }
            applyToggleIcon(tToggle, running ? pauseIconName : playIconName);
            return { elapsed, running, display: cronoDisplay ? cronoDisplay.value : state.display };
          }
        } catch (err) {
          log.warnOnce('crono.getCronoState', '[crono] getCronoState failed:', err);
        }
      } else {
        log.warnOnce('crono.getCronoState.missing', '[crono] getCronoState unavailable; using local stopwatch state');
      }
      return null;
    } catch (err) {
      log.error('Error loading  flotante:', err);
      setToggleChecked(toggleVF, false);
      return null;
    }
  }

  async function closeFlotante({ electronAPI, toggleVF }) {
    if (!electronAPI || typeof electronAPI.closeFlotanteWindow !== 'function') {
      log.warn('closeFlotanteWindow unavailable in electronAPI');
      setToggleChecked(toggleVF, false);
      return;
    }
    try {
      await electronAPI.closeFlotanteWindow();
    } catch (err) {
      log.error('Error closing flotante:', err);
    } finally {
      setToggleChecked(toggleVF, false);
    }
  }

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

    const fallbackLocal = async () => {
      if (typeof setElapsed === 'function') setElapsed(msRounded);
      await syncRoundedElapsedUi();
    };

    if (electronAPI && typeof electronAPI.setCronoElapsed === 'function') {
      try {
        await electronAPI.setCronoElapsed(msRounded);
        await syncRoundedElapsedUi();
        return msRounded;
      } catch (err) {
        log.warn('setCronoElapsed failed; using local stopwatch state:', err);
        await fallbackLocal();
        return msRounded;
      }
    }

    log.warnOnce('crono.setCronoElapsed.missing', '[crono] setCronoElapsed unavailable; using local stopwatch state');
    await fallbackLocal();
    return msRounded;
  }

  // =============================================================================
  // State application (renderer view of crono)
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
  // Controller factory (wires DOM, state, and Electron API)
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

    const getIdiomaActual = () => deps.getIdiomaActual();
    const getCurrentText = () => deps.getCurrentText();
    const getSettingsCache = () => deps.getSettingsCache();

    const resetLocalState = () => {
      elapsed = 0;
      running = false;
      prevRunning = false;
      lastComputedElapsedForWpm = 0;
      uiResetCrono({
        cronoDisplay: elements.cronoDisplay,
        realWpmDisplay: elements.realWpmDisplay,
        tToggle: elements.tToggle,
        playIconName
      });
    };

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

    const handleState = (state) => {
      const nextState = handleCronoState({
        state,
        cronoDisplay: elements.cronoDisplay,
        cronoEditing,
        tToggle: elements.tToggle,
        realWpmDisplay: elements.realWpmDisplay,
        currentText: getCurrentText(),
        contarTexto: deps.contarTexto,
        obtenerSeparadoresDeNumeros: deps.obtenerSeparadoresDeNumeros,
        formatearNumero: deps.formatearNumero,
        idiomaActual: getIdiomaActual(),
        settingsCache: getSettingsCache(),
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
          try {
            if (electronAPI && typeof electronAPI.sendCronoReset === 'function') {
              electronAPI.sendCronoReset();
            } else {
              log.warnOnce('crono.sendCronoReset.missing.textChange', '[crono] sendCronoReset unavailable; applying local reset only');
            }
          } catch (err) {
            log.warn('sendCronoReset failed (ignored):', err);
          } finally {
            resetLocalState();
          }
          return;
        }

        if (running) return;

        if (!(typeof elapsed === 'number' && elapsed > 0)) return;
        if (!deps.contarTexto || !deps.obtenerSeparadoresDeNumeros || !deps.formatearNumero) return;

        await safeRecomputeRealWpm({
          ms: elapsed,
          currentText: nextText,
          contarTexto: deps.contarTexto,
          obtenerSeparadoresDeNumeros: deps.obtenerSeparadoresDeNumeros,
          formatearNumero: deps.formatearNumero,
          idiomaActual: getIdiomaActual(),
          settingsCache: getSettingsCache(),
          realWpmDisplay: elements.realWpmDisplay
        });
        lastComputedElapsedForWpm = elapsed;
      } catch (err) {
        log.error('Error applying text-change stopwatch rules:', err);
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
            } catch (err) {
              log.error('sendCronoToggle failed:', err);
            }
          } else {
            log.warnOnce('crono.sendCronoToggle.missing', '[crono] sendCronoToggle unavailable; toggle action ignored');
          }
        });
      }

      if (elements.tReset) {
        elements.tReset.addEventListener('click', () => {
          if (electronAPI && typeof electronAPI.sendCronoReset === 'function') {
            try {
              electronAPI.sendCronoReset();
            } catch (err) {
              log.error('sendCronoReset failed:', err);
            }
          } else {
            log.warnOnce('crono.sendCronoReset.missing.button', '[crono] sendCronoReset unavailable; reset action ignored');
          }
        });
      }

      if (elements.toggleVF) {
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
        } catch (err) {
          log.warn('onFlotanteClosed registration failed; flotante toggle may desync:', err);
        }
      } else if (electronAPI) {
        log.warnOnce('crono.onFlotanteClosed.missing', '[crono] onFlotanteClosed unavailable; flotante toggle may desync');
      }

      if (elements.cronoDisplay) {
        elements.cronoDisplay.addEventListener('focus', () => {
          cronoEditing = true;
          baselineElapsed = elapsed;
          baselineDisplay = elements.cronoDisplay.value;
        });

        elements.cronoDisplay.addEventListener('blur', () => {
          cronoEditing = false;
          void applyManualTime({
            value: elements.cronoDisplay.value,
            cronoDisplay: elements.cronoDisplay,
            cronoModule: window.RendererCrono,
            electronAPI,
            currentText: getCurrentText(),
            contarTexto: deps.contarTexto,
            obtenerSeparadoresDeNumeros: deps.obtenerSeparadoresDeNumeros,
            formatearNumero: deps.formatearNumero,
            idiomaActual: getIdiomaActual(),
            settingsCache: getSettingsCache(),
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
  // Exports / module surface
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
