// public/js/count.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer-side counting utilities exposed via window.CountUtils.
// Responsibilities:
// - Provide simple and precise counting strategies for characters and words.
// - Apply hyphen-join rules for word segmentation in precise mode.
// - Provide Intl.Segmenter feature detection and fallbacks.
// - Expose a stable module surface for the renderer.

(() => {
  // =============================================================================
  // Logger and constants / config
  // =============================================================================
  // DEFAULT_LANG is the app's fallback language tag (e.g., "en", "es", "pt-BR").
  // It is used when no explicit language is provided by the caller.
  if (typeof window.getLogger !== 'function') {
    throw new Error('[count] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('count');
  log.debug('Count utilities starting...');
  if (!window.AppConstants || typeof window.AppConstants.DEFAULT_LANG !== 'string' || window.AppConstants.DEFAULT_LANG.trim() === '') {
    throw new Error('[count] window.AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }
  const { DEFAULT_LANG } = window.AppConstants;
  if (!window.CountCore || typeof window.CountCore.createCountUtils !== 'function') {
    throw new Error('[count] window.CountCore.createCountUtils unavailable; cannot continue');
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  // Public API exposed to the renderer via window.CountUtils.
  window.CountUtils = window.CountCore.createCountUtils({
    DEFAULT_LANG,
    log,
    intlObject: typeof Intl !== 'undefined' ? Intl : null
  });
})();

// =============================================================================
// End of public/js/count.js
// =============================================================================
