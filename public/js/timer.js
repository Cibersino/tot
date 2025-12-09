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

  window.RendererTimer = {
    formatTimer,
    parseTimerInput,
    actualizarVelocidadRealFromElapsed,
    uiResetTimer
  };
})();
