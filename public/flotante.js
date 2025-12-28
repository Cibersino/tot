// public/flotante.js
const cronoEl = document.getElementById('crono');
const btnToggle = document.getElementById('toggle');
const btnReset = document.getElementById('reset');

// defensive: if any element does not exist, we exit silently (avoids crashes)
if (!cronoEl) {
  console.error('flotante: element #crono not found');
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

// Visibility helper: warn only once per key (renderer scope)
const __WARN_ONCE = new Set();
function warnOnce(key, ...args) {
  if (__WARN_ONCE.has(key)) return;
  __WARN_ONCE.add(key);
  console.warn(...args);
}

// Refresh view (expected to receive { elapsed, running, display })
function renderState(state) {
  if (!state) return;
  lastState = Object.assign({}, lastState, state || {});
  // We prefer display if you send it
  if (cronoEl) {
    if (state.display) {
      cronoEl.textContent = state.display;
    } else if (typeof state.elapsed === 'number' && window.RendererCrono && typeof window.RendererCrono.formatCrono === 'function') {
      cronoEl.textContent = window.RendererCrono.formatCrono(state.elapsed);
    } else if (typeof state.elapsed === 'number') {
      // simple fallback
      const totalSeconds = Math.floor(state.elapsed / 1000);
      const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const s = String(totalSeconds % 60).padStart(2, '0');
      cronoEl.textContent = `${h}:${m}:${s}`;
    }
  }
  // Button status
  if (btnToggle) btnToggle.textContent = state.running ? pauseLabel : playLabel;
}

if (window.flotanteAPI && typeof window.flotanteAPI.onState === 'function') {
  // onState now listens to 'crono-state' (main)
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
      } catch (e) {
        warnOnce('flotante.getSettings', '[flotante] getSettings failed (ignored):', e);
      }
    }

    try { await loadRendererTranslations(lang); } catch (e) {
      warnOnce(
        'flotante.loadRendererTranslations',
        `[flotante] loadRendererTranslations(${lang}) failed (ignored):`,
        e
      );
    }

    playLabel = tRenderer('renderer.main.crono.play_symbol', playLabel);
    pauseLabel = tRenderer('renderer.main.crono.pause_symbol', pauseLabel);
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
    // 'r' or Escape -> reset (Escape can close flotante; choose 'r')
    if (window.flotanteAPI) window.flotanteAPI.sendCommand({ cmd: 'reset' });
  }
});
