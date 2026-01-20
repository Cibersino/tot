// public/js/crono.js
'use strict';

(() => {
  const log = window.getLogger('crono');

  function formatCrono(ms) {
    const totalSeconds = Math.floor((ms || 0) / 1000);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function parseCronoInput(input) {
    const match = String(input || '').match(/^(\d+):([0-5]\d):([0-5]\d)$/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  async function actualizarVelocidadRealFromElapsed({
    ms,
    currentText,
    contarTexto,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
    idiomaActual,
    realWpmDisplay
  }) {
    const secondsTotal = (ms || 0) / 1000;
    const stats = contarTexto(currentText);
    const words = stats?.palabras || 0;
    if (words > 0 && secondsTotal > 0) {
      const realWpm = (words / secondsTotal) * 60;
      const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(idiomaActual);
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

  function uiResetCrono({ cronoDisplay, realWpmDisplay, tToggle, playLabel = '>' }) {
    if (cronoDisplay) cronoDisplay.value = '00:00:00';
    if (realWpmDisplay) realWpmDisplay.innerHTML = '&nbsp;';
    if (tToggle) tToggle.textContent = playLabel;
  }

  async function openFlotante({
    electronAPI,
    toggleVF,
    cronoDisplay,
    cronoEditing,
    tToggle,
    setElapsedRunning,
    playLabel = '>',
    pauseLabel = '||'
  }) {
    if (!electronAPI || typeof electronAPI.openFlotanteWindow !== 'function') {
      log.warn('openFlotanteWindow unavailable in electronAPI');
      if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
      return null;
    }
    try {
      await electronAPI.openFlotanteWindow();
      if (toggleVF) {
        toggleVF.checked = true;
        toggleVF.setAttribute('aria-checked', 'true');
      }

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
            if (tToggle) tToggle.textContent = running ? pauseLabel : playLabel;
            return { elapsed, running, display: cronoDisplay ? cronoDisplay.value : state.display };
          }
        } catch (err) {
          log.warnOnce('crono.getCronoState', '[crono] getCronoState failed:', err);
        }
      }
      return null;
    } catch (err) {
      log.error('Error loading  flotante:', err);
      if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
      return null;
    }
  }

  async function closeFlotante({ electronAPI, toggleVF }) {
    if (!electronAPI || typeof electronAPI.closeFlotanteWindow !== 'function') {
      log.warn('closeFlotanteWindow unavailable in electronAPI');
      if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
      return;
    }
    try {
      await electronAPI.closeFlotanteWindow();
    } catch (err) {
      log.error('Error closing flotante:', err);
    } finally {
      if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
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
      if (cronoDisplay) {
        cronoDisplay.value = effectiveBaselineDisplay;
      }
      return null;
    }

    // No change: keep baseline (including fractional ms) untouched
    if (inputValue === effectiveBaselineDisplay) {
      if (cronoDisplay) cronoDisplay.value = effectiveBaselineDisplay;
      if (typeof setElapsed === 'function' && typeof effectiveBaselineElapsed === 'number') {
        setElapsed(effectiveBaselineElapsed);
      }
      return effectiveBaselineElapsed;
    }

    const parsed = (cronoModule && cronoModule.parseCronoInput)
      ? cronoModule.parseCronoInput(value)
      : parseCronoInput(value);

    if (parsed === null) {
      if (cronoDisplay) {
        cronoDisplay.value = effectiveBaselineDisplay;
      }
      return null;
    }

    const msRounded = Math.floor(parsed / 1000) * 1000;
    if (msRounded < 0) {
      if (cronoDisplay) {
        cronoDisplay.value = effectiveBaselineDisplay;
      }
      return null;
    }

    const fallbackLocal = async () => {
      if (typeof setElapsed === 'function') setElapsed(msRounded);
      if (cronoDisplay) cronoDisplay.value = formatCrono(msRounded);
      await safeRecomputeRealWpm({
        ms: msRounded,
        currentText,
        contarTexto,
        obtenerSeparadoresDeNumeros,
        formatearNumero,
        idiomaActual,
        realWpmDisplay
      });
      if (typeof setLastComputedElapsed === 'function') setLastComputedElapsed(msRounded);
    };

    if (electronAPI && typeof electronAPI.setCronoElapsed === 'function') {
      try {
        await electronAPI.setCronoElapsed(msRounded);
        if (cronoDisplay) cronoDisplay.value = formatCrono(msRounded);
        await safeRecomputeRealWpm({
          ms: msRounded,
          currentText,
          contarTexto,
          obtenerSeparadoresDeNumeros,
          formatearNumero,
          idiomaActual,
          realWpmDisplay
        });
        if (typeof setLastComputedElapsed === 'function') setLastComputedElapsed(msRounded);
        return msRounded;
      } catch (err) {
        log.error('Error sending setCronoElapsed:', err);
        await fallbackLocal();
        return msRounded;
      }
    }

    await fallbackLocal();
    return msRounded;
  }

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
    prevRunning = false,
    lastComputedElapsedForWpm = null,
    playLabel = '>',
    pauseLabel = '||'
  }) {
    const newElapsed = typeof state?.elapsed === 'number' ? state.elapsed : 0;
    const newRunning = !!state?.running;

    if (cronoDisplay) {
      cronoDisplay.disabled = newRunning;
    }

    if (cronoDisplay && !cronoEditing) {
      cronoDisplay.value = state?.display || formatCrono(newElapsed);
    }

    if (tToggle) tToggle.textContent = newRunning ? pauseLabel : playLabel;

    let updatedLast = lastComputedElapsedForWpm;
    const becamePaused = prevRunning === true && newRunning === false;
    if (becamePaused) {
      void safeRecomputeRealWpm({
        ms: newElapsed,
        currentText,
        contarTexto,
        obtenerSeparadoresDeNumeros,
        formatearNumero,
        idiomaActual,
        realWpmDisplay
      });
      updatedLast = newElapsed;
    } else if (!newRunning) {
      if (updatedLast === null || updatedLast !== newElapsed) {
        void safeRecomputeRealWpm({
          ms: newElapsed,
          currentText,
          contarTexto,
          obtenerSeparadoresDeNumeros,
          formatearNumero,
          idiomaActual,
          realWpmDisplay
        });
        updatedLast = newElapsed;
      }
    }

    if (!newRunning && newElapsed === 0 && !cronoEditing) {
      uiResetCrono({ cronoDisplay, realWpmDisplay, tToggle, playLabel });
      updatedLast = 0;
    }

    return {
      elapsed: newElapsed,
      running: newRunning,
      prevRunning: newRunning,
      lastComputedElapsedForWpm: updatedLast
    };
  }

  function createController(options = {}) {
    const elements = options.elements || {};
    const electronAPI = options.electronAPI || null;

    const deps = {
      contarTexto: options.contarTexto,
      obtenerSeparadoresDeNumeros: options.obtenerSeparadoresDeNumeros,
      formatearNumero: options.formatearNumero,
      getIdiomaActual: typeof options.getIdiomaActual === 'function' ? options.getIdiomaActual : () => null,
      getCurrentText: typeof options.getCurrentText === 'function' ? options.getCurrentText : () => '',
    };

    let playLabel = (typeof options.playLabel === 'string') ? options.playLabel : '>';
    let pauseLabel = (typeof options.pauseLabel === 'string') ? options.pauseLabel : '||';

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

    const resetLocalState = () => {
      elapsed = 0;
      running = false;
      prevRunning = false;
      lastComputedElapsedForWpm = 0;
      uiResetCrono({
        cronoDisplay: elements.cronoDisplay,
        realWpmDisplay: elements.realWpmDisplay,
        tToggle: elements.tToggle,
        playLabel
      });
    };

    const updateLabels = (labels = {}) => {
      if (typeof labels.playLabel === 'string') playLabel = labels.playLabel;
      if (typeof labels.pauseLabel === 'string') pauseLabel = labels.pauseLabel;
      if (elements.tToggle) elements.tToggle.textContent = running ? pauseLabel : playLabel;
    };

    const updateDeps = (next = {}) => {
      if (next.contarTexto) deps.contarTexto = next.contarTexto;
      if (next.obtenerSeparadoresDeNumeros) deps.obtenerSeparadoresDeNumeros = next.obtenerSeparadoresDeNumeros;
      if (next.formatearNumero) deps.formatearNumero = next.formatearNumero;
      if (typeof next.getIdiomaActual === 'function') deps.getIdiomaActual = next.getIdiomaActual;
      if (typeof next.getCurrentText === 'function') deps.getCurrentText = next.getCurrentText;
    };

    const handleState = (state) => {
      const res = handleCronoState({
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
        prevRunning,
        lastComputedElapsedForWpm,
        playLabel,
        pauseLabel
      });
      if (res) {
        elapsed = res.elapsed;
        running = res.running;
        prevRunning = res.prevRunning;
        lastComputedElapsedForWpm = res.lastComputedElapsedForWpm;
      }
    };

    const handleTextChange = async (previousText, nextText) => {
      try {
        if (previousText === nextText) return;

        if (!nextText) {
          try {
            if (electronAPI && typeof electronAPI.sendCronoReset === 'function') {
              electronAPI.sendCronoReset();
            }
          } catch (err) {
            log.error('Error requesting stopwatch reset after empty text:', err);
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
          realWpmDisplay: elements.realWpmDisplay
        });
        lastComputedElapsedForWpm = elapsed;
      } catch (err) {
        log.error('Error applying text-change stopwatch rules:', err);
      }
    };

    const openFlotanteWindow = async () => {
      const res = await openFlotante({
        electronAPI,
        toggleVF: elements.toggleVF,
        cronoDisplay: elements.cronoDisplay,
        cronoEditing,
        tToggle: elements.tToggle,
        setElapsedRunning: (elapsedVal, runningVal) => {
          elapsed = elapsedVal;
          running = runningVal;
        },
        playLabel,
        pauseLabel
      });
      if (res && typeof res.elapsed === 'number') {
        lastComputedElapsedForWpm = res.elapsed;
        prevRunning = running;
      }
      return res;
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
            electronAPI.sendCronoToggle();
          }
        });
      }

      if (elements.tReset) {
        elements.tReset.addEventListener('click', () => {
          if (electronAPI && typeof electronAPI.sendCronoReset === 'function') {
            electronAPI.sendCronoReset();
          }
        });
      }

      if (elements.toggleVF) {
        elements.toggleVF.addEventListener('change', async () => {
          const wantOpen = !!elements.toggleVF.checked;
          elements.toggleVF.setAttribute('aria-checked', wantOpen ? 'true' : 'false');

          if (wantOpen) {
            await openFlotanteWindow();
          } else {
            await closeFlotanteWindow();
          }
        });
      }

      if (electronAPI && typeof electronAPI.onFlotanteClosed === 'function') {
        electronAPI.onFlotanteClosed(() => {
          if (elements.toggleVF) {
            elements.toggleVF.checked = false;
            elements.toggleVF.setAttribute('aria-checked', 'false');
          }
        });
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

    updateLabels({ playLabel, pauseLabel });

    return {
      bind,
      handleState,
      handleTextChange,
      updateLabels,
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
