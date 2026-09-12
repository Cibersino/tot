// public/js/text_time_calculator_launcher.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-window launcher owner for the quick text/time calculator.
// Responsibilities:
// - Own the main-window calculator button DOM lookup and translation updates.
// - Bind the calculator open action exactly once.
// - Keep disabled and aria-disabled state synchronized with renderer locks.
// - Expose the stable window.TextTimeCalculatorLauncher surface consumed by renderer.js.

(() => {
  // =============================================================================
  // Logger + DOM dependencies
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[text_time_calculator_launcher] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-time-calculator-launcher');
  const button = document.getElementById('btnTextTimeCalculator');
  if (!button) {
    throw new Error('[text_time_calculator_launcher] btnTextTimeCalculator missing; cannot continue');
  }

  // =============================================================================
  // Shared state
  // =============================================================================
  let actionsBound = false;

  // =============================================================================
  // Public API
  // =============================================================================
  function applyTranslations({ tRenderer } = {}) {
    if (typeof tRenderer !== 'function') {
      throw new Error('[text_time_calculator_launcher] tRenderer unavailable; cannot apply launcher semantics');
    }

    const name = tRenderer('renderer.main.names.text_time_calculator');
    button.setAttribute('aria-label', name);
    button.setAttribute('data-tot-tooltip', name);
  }

  function bindActions({ onOpenCalculator } = {}) {
    if (actionsBound) return;
    if (typeof onOpenCalculator !== 'function') {
      log.warn('Calculator launcher bind skipped: onOpenCalculator missing.');
      return;
    }

    button.addEventListener('click', () => {
      onOpenCalculator();
    });
    actionsBound = true;
  }

  function setInteractionLocked(locked) {
    const nextLocked = !!locked;
    button.disabled = nextLocked;
    button.setAttribute('aria-disabled', nextLocked ? 'true' : 'false');
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.TextTimeCalculatorLauncher = {
    applyTranslations,
    bindActions,
    setInteractionLocked,
  };
})();

// =============================================================================
// End of public/js/text_time_calculator_launcher.js
// =============================================================================
