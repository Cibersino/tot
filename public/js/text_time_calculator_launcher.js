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
  // Helpers
  // =============================================================================
  function getTranslator() {
    const rendererI18n = window.RendererI18n || null;
    return rendererI18n && typeof rendererI18n.tRenderer === 'function'
      ? rendererI18n.tRenderer
      : null;
  }

  // =============================================================================
  // Public API
  // =============================================================================
  function applyTranslations() {
    const tRenderer = getTranslator();
    if (typeof tRenderer !== 'function') {
      log.warn('RendererI18n.tRenderer unavailable; calculator launcher translations skipped.');
      return;
    }

    button.setAttribute('title', tRenderer('renderer.main.tooltips.text_time_calculator'));
    button.setAttribute('aria-label', tRenderer('renderer.main.aria.text_time_calculator'));
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
