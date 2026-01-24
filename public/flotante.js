// public/flotante.js
'use strict';

const log = window.getLogger('flotante');

log.debug('Flotante starting...');

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[flotante] AppConstants no disponible; verifica la carga de constants.js');
}
const { DEFAULT_LANG } = AppConstants;

const cronoEl = document.getElementById('crono');
const btnToggle = document.getElementById('toggle');
const btnReset = document.getElementById('reset');

// defensive: if any element does not exist, we exit silently (avoids crashes)
if (!cronoEl) {
  log.error('flotante: element #crono not found');
}
if (!btnToggle) {
  log.error('flotante: element #toggle not found');
}
if (!btnReset) {
  log.error('flotante: element #reset not found');
}

if (!window.flotanteAPI) {
  log.warnOnce('flotante.api.missing', '[flotante] flotanteAPI missing; IPC bridge unavailable (ignored).');
} else {
  if (typeof window.flotanteAPI.onState !== 'function') {
    log.warnOnce('flotante.api.onState.missing', '[flotante] flotanteAPI.onState missing; state updates disabled (ignored).');
  }
  if (typeof window.flotanteAPI.getSettings !== 'function') {
    log.warnOnce('flotante.api.getSettings.missing', '[flotante] flotanteAPI.getSettings missing; using default language (ignored).');
  }
  if (typeof window.flotanteAPI.onSettingsChanged !== 'function') {
    log.warnOnce('flotante.api.onSettingsChanged.missing', '[flotante] flotanteAPI.onSettingsChanged missing; live updates disabled (ignored).');
  }
  if (typeof window.flotanteAPI.sendCommand !== 'function') {
    log.error('[flotante] flotanteAPI.sendCommand missing; controls may fail.');
  }
}

let lastState = { elapsed: 0, running: false, display: '00:00:00' };
let playLabel = '>';
let pauseLabel = '||';
let translationsLoadedFor = null;

// Refresh view (expected to receive { elapsed, running, display })
function renderState(state) {
  if (!state) return;
  lastState = Object.assign({}, lastState, state || {});
  // We prefer display if you send it
  if (cronoEl) {
    if (state.display) {
      cronoEl.textContent = state.display;
    } else if (typeof state.elapsed === 'number') {
      if (window.RendererCrono && typeof window.RendererCrono.formatCrono === 'function') {
        cronoEl.textContent = window.RendererCrono.formatCrono(state.elapsed);
      } else {
        log.warnOnce('flotante.formatCrono.missing', '[flotante] formatCrono unavailable; using simple formatter (ignored).');
        // simple fallback
        const totalSeconds = Math.floor(state.elapsed / 1000);
        const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const s = String(totalSeconds % 60).padStart(2, '0');
        cronoEl.textContent = `${h}:${m}:${s}`;
      }
    }
  }
  // Button status
  if (btnToggle) btnToggle.textContent = state.running ? pauseLabel : playLabel;
}

if (window.flotanteAPI && typeof window.flotanteAPI.onState === 'function') {
  // onState now listens to 'crono-state' (main)
  window.flotanteAPI.onState((state) => {
    try { renderState(state); } catch (err) { log.error(err); }
  });
}

async function applyFlotanteTranslations(lang) {
  const { loadRendererTranslations, tRenderer } = window.RendererI18n || {};
  if (!loadRendererTranslations || !tRenderer) {
    log.warnOnce('flotante.i18n.missing', '[flotante] RendererI18n unavailable; skipping translations (ignored).');
    return;
  }

  const target = (lang || '').toLowerCase() || DEFAULT_LANG;
  if (translationsLoadedFor !== target) {
    try {
      await loadRendererTranslations(target);
      translationsLoadedFor = target;
    } catch (err) {
      log.warnOnce(
        'flotante.loadRendererTranslations',
        `[flotante] loadRendererTranslations(${target}) failed (ignored):`,
        err
      );
      return;
    }
  }

  playLabel = tRenderer('renderer.main.crono.play_symbol', playLabel);
  pauseLabel = tRenderer('renderer.main.crono.pause_symbol', pauseLabel);
  if (btnToggle) btnToggle.textContent = lastState.running ? pauseLabel : playLabel;
}

// Try to load translations for play/pause symbols (use renderer.i18n)
(async () => {
  try {
    let lang = DEFAULT_LANG;
    if (window.flotanteAPI && typeof window.flotanteAPI.getSettings === 'function') {
      try {
        const settings = await window.flotanteAPI.getSettings();
        if (settings && settings.language) lang = settings.language;
      } catch (err) {
        log.warnOnce('flotante.getSettings', '[flotante] getSettings failed (ignored):', err);
      }
    }

    await applyFlotanteTranslations(lang);
  } catch (err) {
    log.error('Error loading translations in flotante:', err);
  }
})();

if (window.flotanteAPI && typeof window.flotanteAPI.onSettingsChanged === 'function') {
  window.flotanteAPI.onSettingsChanged((settings) => {
    const nextLang = settings && settings.language ? settings.language : '';
    if (!nextLang || nextLang === translationsLoadedFor) return;
    applyFlotanteTranslations(nextLang).catch((err) => {
      log.warn('flotante: failed to apply settings update:', err);
    });
  });
}

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
