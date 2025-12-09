(() => {
  console.debug("[timer.js] modulo cargado");

  function formatTimer(ms) {
    const totalSeconds = Math.floor((ms || 0) / 1000);
    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function parseTimerInput(input) {
    const match = String(input || "").match(/^(\d+):([0-5]\d):([0-5]\d)$/);
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
    if (realWpmDisplay) realWpmDisplay.innerHTML = "&nbsp;";
    return 0;
  }

  function uiResetTimer({ timerDisplay, realWpmDisplay, tToggle }) {
    if (timerDisplay) timerDisplay.value = "00:00:00";
    if (realWpmDisplay) realWpmDisplay.innerHTML = "&nbsp;";
    if (tToggle) tToggle.textContent = '>';
  }

  async function openFloating({ electronAPI, toggleVF, timerDisplay, timerEditing, tToggle, setElapsedRunning }) {
    if (!electronAPI || typeof electronAPI.openFloatingWindow !== 'function') {
      console.warn("openFloatingWindow no disponible en electronAPI");
      if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
      return null;
    }
    try {
      await electronAPI.openFloatingWindow();
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
            if (timerDisplay && !timerEditing) {
              timerDisplay.value = state.display || formatTimer(elapsed);
            }
            if (tToggle) tToggle.textContent = running ? '||' : '>';
            return { elapsed, running, display: timerDisplay ? timerDisplay.value : state.display };
          }
        } catch (e) {
          /* noop */
        }
      }
      return null;
    } catch (e) {
      console.error("Error abriendo flotante:", e);
      if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
      return null;
    }
  }

  async function closeFloating({ electronAPI, toggleVF }) {
    if (!electronAPI || typeof electronAPI.closeFloatingWindow !== 'function') {
      console.warn("closeFloatingWindow no disponible en electronAPI");
      if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
      return;
    }
    try {
      await electronAPI.closeFloatingWindow();
    } catch (e) {
      console.error("Error cerrando flotante:", e);
    } finally {
      if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
    }
  }

  async function applyManualTime({
    value,
    timerDisplay,
    timerModule = null,
    electronAPI = null,
    currentText,
    contarTexto,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
    idiomaActual,
    realWpmDisplay,
    setElapsed,
    setLastComputedElapsed
  }) {
    const parsed = (timerModule && timerModule.parseTimerInput)
      ? timerModule.parseTimerInput(value)
      : parseTimerInput(value);

    if (parsed === null) {
      if (timerDisplay && typeof setElapsed === "function") {
        timerDisplay.value = formatTimer(setElapsed());
      }
      return null;
    }

    const msRounded = Math.floor(parsed / 1000) * 1000;
    const fallbackLocal = async () => {
      if (typeof setElapsed === "function") setElapsed(msRounded);
      if (timerDisplay) timerDisplay.value = formatTimer(msRounded);
      await actualizarVelocidadRealFromElapsed({
        ms: msRounded,
        currentText,
        contarTexto,
        obtenerSeparadoresDeNumeros,
        formatearNumero,
        idiomaActual,
        realWpmDisplay
      });
      if (typeof setLastComputedElapsed === "function") setLastComputedElapsed(msRounded);
    };

    if (electronAPI && typeof electronAPI.setCronoElapsed === 'function') {
      try {
        await electronAPI.setCronoElapsed(msRounded);
        if (timerDisplay) timerDisplay.value = formatTimer(msRounded);
        await actualizarVelocidadRealFromElapsed({
          ms: msRounded,
          currentText,
          contarTexto,
          obtenerSeparadoresDeNumeros,
          formatearNumero,
          idiomaActual,
          realWpmDisplay
        });
        if (typeof setLastComputedElapsed === "function") setLastComputedElapsed(msRounded);
        return msRounded;
      } catch (e) {
        console.error("Error enviando setCronoElapsed:", e);
        await fallbackLocal();
        return msRounded;
      }
    }

    await fallbackLocal();
    return msRounded;
  }

  window.RendererTimer = {
    formatTimer,
    parseTimerInput,
    actualizarVelocidadRealFromElapsed,
    uiResetTimer,
    openFloating,
    closeFloating,
    applyManualTime
  };
})();
