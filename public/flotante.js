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

// Actualizar vista (se espera recibir { elapsed, running, display })
function renderState(state) {
  if (!state) return;
  lastState = Object.assign({}, lastState, state || {});
  // Preferimos display si lo envian
  if (timerEl) {
    if (state.display) {
      timerEl.textContent = state.display;
    } else if (typeof state.elapsed === 'number') {
    // fallback: formateo simple de segundos
      const totalSeconds = Math.floor(state.elapsed / 1000);
      const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const s = String(totalSeconds % 60).padStart(2, '0');
      timerEl.textContent = `${h}:${m}:${s}`;
    }
  }
  // Estado del boton
  if (btnToggle) btnToggle.textContent = state.running ? '||' : '>';
}

if (window.flotanteAPI && typeof window.flotanteAPI.onState === 'function') {
  // onState ahora escucha 'crono-state' (main)
  window.flotanteAPI.onState((state) => {
    try { renderState(state); } catch (e) { console.error(e); }
  });
}

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
