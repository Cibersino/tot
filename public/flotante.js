// flotante.js
const timerEl = document.getElementById('timer');
const btnToggle = document.getElementById('toggle');
const btnReset = document.getElementById('reset');

// defensivo: si algun elemento no existe, salimos silenciosamente (evita crashes)
if (!timerEl) {
  console.error("flotante: element #timer no encontrado");
}
if (!btnToggle) {
  console.error("flotante: element #toggle no encontrado");
}
if (!btnReset) {
  console.error("flotante: element #reset no encontrado");
}

let lastState = { elapsed: 0, running: false, display: "00:00:00" };
let playLabel = ">";
let pauseLabel = "||";

// Actualizar vista (se espera recibir { elapsed, running, display })
function renderState(state) {
  if (!state) return;
  lastState = Object.assign({}, lastState, state || {});
  // Preferimos display si lo envian
  if (timerEl) {
    if (state.display) {
      timerEl.textContent = state.display;
    } else if (typeof state.elapsed === 'number' && window.RendererTimer && typeof window.RendererTimer.formatTimer === 'function') {
      timerEl.textContent = window.RendererTimer.formatTimer(state.elapsed);
    } else if (typeof state.elapsed === 'number') {
      // fallback simple
      const totalSeconds = Math.floor(state.elapsed / 1000);
      const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const s = String(totalSeconds % 60).padStart(2, '0');
      timerEl.textContent = `${h}:${m}:${s}`;
    }
  }
  // Estado del boton
  if (btnToggle) btnToggle.textContent = state.running ? pauseLabel : playLabel;
}

if (window.flotanteAPI && typeof window.flotanteAPI.onState === 'function') {
  // onState ahora escucha 'crono-state' (main)
  window.flotanteAPI.onState((state) => {
    try { renderState(state); } catch (e) { console.error(e); }
  });
}

// Intentar cargar traducciones para los simbolos play/pause (usa renderer.i18n)
(async () => {
  try {
    const { loadRendererTranslations, tRenderer } = window.RendererI18n || {};
    if (!loadRendererTranslations || !tRenderer) return;

    let lang = 'es';
    if (window.flotanteAPI && typeof window.flotanteAPI.getSettings === 'function') {
      try {
        const settings = await window.flotanteAPI.getSettings();
        if (settings && settings.language) lang = settings.language;
      } catch (e) { /* noop */ }
    }

    try { await loadRendererTranslations(lang); } catch (_) { /* noop */ }
    playLabel = tRenderer("renderer.main.timer.play_symbol", playLabel);
    pauseLabel = tRenderer("renderer.main.timer.pause_symbol", pauseLabel);
    // Refrescar boton con la etiqueta traducida actual
    if (btnToggle) btnToggle.textContent = lastState.running ? pauseLabel : playLabel;
  } catch (e) {
    console.error("Error cargando traducciones en flotante:", e);
  }
})();

// Botones: envian comandos al main
btnToggle.addEventListener('click', () => {
  if (window.flotanteAPI) window.flotanteAPI.sendCommand({ cmd: 'toggle' });
});
btnReset.addEventListener('click', () => {
  if (window.flotanteAPI) window.flotanteAPI.sendCommand({ cmd: 'reset' });
});

// Teclado local: cuando la ventana tiene foco
window.addEventListener('keydown', (ev) => {
  if (ev.code === 'Space' || ev.key === ' ' || ev.key === 'Enter') {
    ev.preventDefault();
    if (window.flotanteAPI) window.flotanteAPI.sendCommand({ cmd: 'toggle' });
  } else if (ev.key === 'r' || ev.key === 'R' || ev.key === 'Escape') {
    // 'r' o Escape -> reset (Escape puede cerrar flotante; choose 'r')
    if (window.flotanteAPI) window.flotanteAPI.sendCommand({ cmd: 'reset' });
  }
});
