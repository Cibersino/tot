// public/js/format.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer-side formatting helpers.
// Responsibilities:
// - Convert word counts to exact duration values.
// - Convert exact duration values to rounded display time parts.
// - Resolve number-format separators from settings and language fallbacks.
// - Format numeric values for display using provided separators.

(() => {
  // =============================================================================
  // Logger and dependencies
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[format] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('format');
  log.debug('Format utilities starting...');
  if (!window.AppConstants || typeof window.AppConstants.DEFAULT_LANG !== 'string' || window.AppConstants.DEFAULT_LANG.trim() === '') {
    throw new Error('[format] window.AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }
  if (!window.RendererI18n
    || typeof window.RendererI18n.normalizeLangTag !== 'function'
    || typeof window.RendererI18n.getLangBase !== 'function') {
    throw new Error('[format] window.RendererI18n.normalizeLangTag/getLangBase unavailable; cannot continue');
  }
  const { DEFAULT_LANG } = window.AppConstants;
  const { normalizeLangTag, getLangBase } = window.RendererI18n;
  if (!window.FormatCore || typeof window.FormatCore.createFormatUtils !== 'function') {
    throw new Error('[format] window.FormatCore.createFormatUtils unavailable; cannot continue');
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.FormatUtils = window.FormatCore.createFormatUtils({
    DEFAULT_LANG,
    normalizeLangTag,
    getLangBase,
    log
  });
})();

// =============================================================================
// End of public/js/format.js
// =============================================================================
