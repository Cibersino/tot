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
      await actualizarVelocidadRealFromElapsed({
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
        await actualizarVelocidadRealFromElapsed({
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
      actualizarVelocidadRealFromElapsed({
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
        actualizarVelocidadRealFromElapsed({
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

  window.RendererCrono = {
    formatCrono,
    parseCronoInput,
    actualizarVelocidadRealFromElapsed,
    uiResetCrono,
    openFlotante,
    closeFlotante,
    applyManualTime,
    handleCronoState
  };
})();
