// public/flotante.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer logic for the flotante window.
// Responsibilities:
// - Acquire DOM elements for timer + controls and report missing elements.
// - Render stopwatch state and format display with a fallback formatter.
// - Apply i18n labels and react to settings changes.
// - Wire flotanteAPI callbacks and send control commands.
// - Handle local input (buttons and keyboard) for toggle/reset.

// =============================================================================
// Logger / globals
// =============================================================================

function terminateFlotanteBootstrap(log, message, cause) {
  try {
    if (log) {
      if (typeof cause === 'undefined') {
        log.error(message);
      } else {
        log.error(message, cause);
      }
    }
  } finally {
    if (typeof window.close === 'function') window.close();
  }

  if (typeof cause === 'undefined') {
    throw new Error(message);
  }
  throw new Error(message, { cause });
}

if (typeof window.getLogger !== 'function') {
  terminateFlotanteBootstrap(null, '[flotante] window.getLogger unavailable; cannot continue');
}

let log;
try {
  log = window.getLogger('flotante');
} catch (err) {
  terminateFlotanteBootstrap(
    null,
    '[flotante] window.getLogger acquisition failed; cannot continue',
    err
  );
}

log.debug('Flotante starting...');
const rendererIcons = window.RendererIcons || null;
if (!rendererIcons || typeof rendererIcons.applyIconToElement !== 'function') {
  terminateFlotanteBootstrap(
    log,
    'BOOTSTRAP: RendererIcons.applyIconToElement unavailable; closing Floating Stopwatch before normal interaction.'
  );
}

// =============================================================================
// Constants / config
// =============================================================================

const { AppConstants } = window;
if (!AppConstants) {
  terminateFlotanteBootstrap(
    log,
    'BOOTSTRAP: AppConstants unavailable; closing Floating Stopwatch before normal interaction.'
  );
}
const { DEFAULT_LANG } = AppConstants;

// =============================================================================
// DOM wiring
// =============================================================================

const cronoEl = document.getElementById('crono');
const btnToggle = document.getElementById('toggle');
const btnReset = document.getElementById('reset');

// Missing elements are logged; execution continues (assumes flotante.html provides these IDs).
if (!cronoEl) {
  log.error('element #crono not found');
}
if (!btnToggle) {
  log.error('element #toggle not found');
}
if (!btnReset) {
  log.error('element #reset not found');
}

if (!btnToggle || !btnReset) {
  terminateFlotanteBootstrap(
    log,
    'BOOTSTRAP: required Floating Stopwatch controls unavailable; closing window before normal interaction.'
  );
}

if (!window.flotanteAPI) {
  terminateFlotanteBootstrap(
    log,
    'BOOTSTRAP: flotanteAPI unavailable; closing Floating Stopwatch before normal interaction.'
  );
}
if (typeof window.flotanteAPI.onState !== 'function') {
  terminateFlotanteBootstrap(
    log,
    'BOOTSTRAP: flotanteAPI.onState unavailable; closing Floating Stopwatch before normal interaction.'
  );
}
if (typeof window.flotanteAPI.sendCommand !== 'function') {
  terminateFlotanteBootstrap(
    log,
    'BOOTSTRAP: flotanteAPI.sendCommand unavailable; closing Floating Stopwatch before normal interaction.'
  );
}
if (typeof window.flotanteAPI.getSettings !== 'function') {
  log.warn('flotanteAPI.getSettings missing; using default language (ignored).');
}
// =============================================================================
// Shared state
// =============================================================================

let lastState = { elapsed: 0, running: false, display: '00:00:00' };
let playIconName = 'play';
let pauseIconName = 'pause';
let translationsLoadedFor = null;
let flotanteI18nTerminal = false;
let flotanteSemanticQueue = Promise.resolve();
const { transitionRendererTranslations, tRenderer } = window.RendererI18n || {};
if (!transitionRendererTranslations || !tRenderer) {
  reportTerminalFlotanteI18nFailure('startup-api');
  throw new Error('[flotante] RendererI18n unavailable; cannot continue');
}

setFlotanteControlsLocked(true);

// =============================================================================
// Helpers
// =============================================================================

function setFlotanteControlsLocked(locked) {
  [btnToggle, btnReset].forEach((element) => {
    if (element) element.disabled = locked === true;
  });
}

// Refresh view (expected to receive { elapsed, running, display })
function renderState(state) {
  if (flotanteI18nTerminal) return;
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
        log.warnOnce('flotante.formatCrono.missing', 'formatCrono unavailable; using simple formatter (ignored).');
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
  if (btnToggle) {
    rendererIcons.applyIconToElement(btnToggle, state.running ? pauseIconName : playIconName, {
      preserveContent: false,
    });
  }
}

// =============================================================================
// Bridge integration (flotanteAPI)
// =============================================================================

// onState now listens to 'crono-state' (main)
try {
  window.flotanteAPI.onState((state) => {
    if (flotanteI18nTerminal) return;
    try { renderState(state); } catch (err) { log.error(err); }
  });
} catch (err) {
  terminateFlotanteBootstrap(
    log,
    'BOOTSTRAP: flotanteAPI.onState registration failed; closing Floating Stopwatch before normal interaction.',
    err
  );
}

async function applyFlotanteTranslations(lang) {
  const target = (lang || '').toLowerCase() || DEFAULT_LANG;
  await transitionRendererTranslations(target, {
    applyTranslations: ({ language }) => {
      playIconName = 'play';
      pauseIconName = 'pause';
      document.title = tRenderer('renderer.main.names.floating_window');
      if (btnToggle) {
        const toggleLabel = tRenderer('renderer.main.names.crono_toggle');
        btnToggle.setAttribute('aria-label', toggleLabel);
        rendererIcons.applyIconToElement(btnToggle, lastState.running ? pauseIconName : playIconName, {
          preserveContent: false,
          ariaLabel: toggleLabel,
        });
      }
      if (btnReset) {
        const resetLabel = tRenderer('renderer.main.names.crono_reset');
        btnReset.setAttribute('aria-label', resetLabel);
        rendererIcons.applyIconToElement(btnReset, 'stop', {
          preserveContent: false,
          ariaLabel: resetLabel,
        });
      }
      translationsLoadedFor = language;
    },
  });
}

function reportFlotanteI18nFailure(err, { startup = false } = {}) {
  const transition = err && err.rendererI18nTransition;
  if (!transition) {
    return;
  }
  if (!startup && transition && transition.hadEstablishedState && !transition.restorationFailed) {
    log.error('Floating Stopwatch language transition failed; previous translation state remains authoritative:', err);
    return;
  }
  log.error('Floating Stopwatch i18n failure requires window closure:', err);
  reportTerminalFlotanteI18nFailure(startup ? 'startup' : 'transition-restoration');
}

function reportTerminalFlotanteI18nFailure(kind) {
  if (flotanteI18nTerminal) return;
  flotanteI18nTerminal = true;
  setFlotanteControlsLocked(true);
  if (typeof window.flotanteAPI.reportRendererI18nFailure !== 'function') {
    log.warn('flotanteAPI.reportRendererI18nFailure unavailable (ignored); closing failed renderer locally.');
    if (typeof window.close === 'function') window.close();
    return;
  }
  try {
    window.flotanteAPI.reportRendererI18nFailure({ kind });
  } catch (reportErr) {
    log.warn('flotanteAPI.reportRendererI18nFailure failed (ignored); closing failed renderer locally:', reportErr);
    if (typeof window.close === 'function') window.close();
  }
}

// =============================================================================
// Bootstrapping
// =============================================================================

function enqueueFlotanteSemanticWork(work) {
  const run = async () => {
    // Main-process closure is asynchronous. Do not admit queued semantic
    // work after this window has entered terminal i18n failure.
    if (flotanteI18nTerminal) return;
    return work();
  };
  flotanteSemanticQueue = flotanteSemanticQueue.then(run, run);
  return flotanteSemanticQueue;
}

function enqueueFlotanteSettingsApplication(settings) {
  const run = async () => {
    const nextLang = settings && settings.language ? settings.language : '';
    if (!nextLang || nextLang === translationsLoadedFor) return;
    try {
      await applyFlotanteTranslations(nextLang);
    } catch (err) {
      reportFlotanteI18nFailure(err);
    }
  };
  // Preload listeners do not await async callbacks. Admit full settings
  // snapshots after the preceding root semantic operation has settled.
  return enqueueFlotanteSemanticWork(run);
}

if (typeof window.flotanteAPI.onSettingsChanged !== 'function') {
  log.error('BOOTSTRAP: flotanteAPI.onSettingsChanged unavailable; closing window before normal interaction.');
  reportTerminalFlotanteI18nFailure('settings-listener');
} else {
  try {
    window.flotanteAPI.onSettingsChanged((settings) => enqueueFlotanteSettingsApplication(settings));
  } catch (err) {
    log.error('BOOTSTRAP: flotanteAPI.onSettingsChanged registration failed; closing window before normal interaction:', err);
    reportTerminalFlotanteI18nFailure('settings-listener');
  }
}

// Start state and settings delivery before the initial transition so the
// main-owned stopwatch state remains current. Bind commands only after the
// first required semantic presentation has completed successfully.
// Floating Stopwatch intentionally has no programmatic initial DOM focus.
enqueueFlotanteSemanticWork(async () => {
  let lang = DEFAULT_LANG;
  if (typeof window.flotanteAPI.getSettings === 'function') {
    try {
      const settings = await window.flotanteAPI.getSettings();
      if (settings && settings.language) lang = settings.language;
    } catch (err) {
      log.warn('BOOTSTRAP: flotanteAPI.getSettings failed; using default language:', err);
    }
  }

  try {
    await applyFlotanteTranslations(lang);
    bindFlotanteControls();
    setFlotanteControlsLocked(false);
  } catch (err) {
    reportFlotanteI18nFailure(err, { startup: true });
  }
});

// =============================================================================
// UI events
// =============================================================================

function bindFlotanteControls() {
  btnToggle.addEventListener('click', () => {
    if (flotanteI18nTerminal) return;
    window.flotanteAPI.sendCommand({ cmd: 'toggle' });
  });
  btnReset.addEventListener('click', () => {
    if (flotanteI18nTerminal) return;
    window.flotanteAPI.sendCommand({ cmd: 'reset' });
  });

  // Local keyboard: when the window has focus
  window.addEventListener('keydown', (ev) => {
    if (flotanteI18nTerminal) return;
    if (ev.code === 'Space' || ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault();
      window.flotanteAPI.sendCommand({ cmd: 'toggle' });
    } else if (ev.key === 'r' || ev.key === 'R' || ev.key === 'Escape') {
      // 'r' or Escape -> reset (Escape can close flotante; choose 'r')
      window.flotanteAPI.sendCommand({ cmd: 'reset' });
    }
  });
}

// =============================================================================
// End of public/flotante.js
// =============================================================================
