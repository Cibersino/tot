// public/flotante.js
const timerEl = document.getElementById('timer');
const btnToggle = document.getElementById('toggle');
const btnReset = document.getElementById('reset');

// defensive: if any element does not exist, we exit silently (avoids crashes)
if (!timerEl) {
  console.error('flotante: element #timer not found');
}
if (!btnToggle) {
  console.error('flotante: element #toggle not found');
}
if (!btnReset) {
  console.error('flotante: element #reset not found');
}

let lastState = { elapsed: 0, running: false, display: '00:00:00' };
let playLabel = '>';
let pauseLabel = '||';

// Refresh view (expected to receive { elapsed, running, display })
function renderState(state) {
  if (!state) return;
  lastState = Object.assign({}, lastState, state || {});
  // We prefer display if you send it
  if (timerEl) {
    if (state.display) {
      timerEl.textContent = state.display;
    } else if (typeof state.elapsed === 'number' && window.RendererTimer && typeof window.RendererTimer.formatTimer === 'function') {
      timerEl.textContent = window.RendererTimer.formatTimer(state.elapsed);
    } else if (typeof state.elapsed === 'number') {
      // simple fallback
      const totalSeconds = Math.floor(state.elapsed / 1000);
      const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const s = String(totalSeconds % 60).padStart(2, '0');
      timerEl.textContent = `${h}:${m}:${s}`;
    }
  }
  // Button status
  if (btnToggle) btnToggle.textContent = state.running ? pauseLabel : playLabel;
}

if (window.flotanteAPI && typeof window.flotanteAPI.onState === 'function') {
  // onState now listens to 'chrono-state' (main)
  window.flotanteAPI.onState((state) => {
    try { renderState(state); } catch (e) { console.error(e); }
  });
}

// Try to load translations for play/pause symbols (use renderer.i18n)
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
    playLabel = tRenderer('renderer.main.timer.play_symbol', playLabel);
    pauseLabel = tRenderer('renderer.main.timer.pause_symbol', pauseLabel);
    // Refresh button with the current translated label
    if (btnToggle) btnToggle.textContent = lastState.running ? pauseLabel : playLabel;
  } catch (e) {
    console.error('Error loading translations in flotante:', e);
  }
})();

// Buttons: send commands to main
btnToggle.addEventListener('click', () => {
  if (window.flotanteAPI) window.flotanteAPI.sendCommand({ cmd: 'toggle' });
});
btnReset.addEventListener('click', () => {
  if (window.flotanteAPI) window.flotanteAPI.sendCommand({ cmd: 'reset' });
});

// Local keyboard: when the window has focus
window.addEventListener('keydown', (ev) => {
  if (ev.code === 'Space' || ev.key === ' ' || ev.key === 'Enter') {
    ev.preventDefault();
    if (window.flotanteAPI) window.flotanteAPI.sendCommand({ cmd: 'toggle' });
  } else if (ev.key === 'r' || ev.key === 'R' || ev.key === 'Escape') {
    // 'r' or Escape -> reset (Escape can close floating; choose 'r')
    if (window.flotanteAPI) window.flotanteAPI.sendCommand({ cmd: 'reset' });
  }
});
