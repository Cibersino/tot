// public/js/lib/format_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared number-formatting core for renderer-facing FormatUtils.
// Responsibilities:
// - Publish the same API to browser-script and CommonJS consumers.
// - Require DEFAULT_LANG and getPreferenceScope before creating a formatter.
// - Resolve required number-format separators using declared preference scopes and caller-supplied settings.
// - Format supplied numbers with explicit grouping and decimal separators.

// =============================================================================
// Module registration
// =============================================================================

(function initFormatCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.FormatCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // =============================================================================
  // Formatter factory and utilities
  // =============================================================================

  function createFormatUtils({
    DEFAULT_LANG,
    getPreferenceScope,
  } = {}) {
    const defaultLang = typeof DEFAULT_LANG === 'string' ? DEFAULT_LANG.trim() : '';
    if (!defaultLang) {
      throw new Error('[format_core] DEFAULT_LANG is required');
    }
    if (typeof getPreferenceScope !== 'function') {
      throw new Error('[format_core] getPreferenceScope is required');
    }

    async function obtenerSeparadoresDeNumeros(idioma, settingsCache) {
      if (!settingsCache || typeof settingsCache !== 'object') throw new Error('[format_core] number formatting settings are unavailable');
      const preferenceScopeId = getPreferenceScope(idioma || defaultLang);
      const numberFormattingByScope = settingsCache.numberFormattingByScope;
      const entry = numberFormattingByScope && numberFormattingByScope[preferenceScopeId];
      if (!entry || typeof entry.separadorMiles !== 'string' || !entry.separadorMiles || typeof entry.separadorDecimal !== 'string' || !entry.separadorDecimal) {
        throw new Error(`[format_core] required number formatting is unavailable for scope ${preferenceScopeId}`);
      }
      return entry;
    }

    function formatearNumero(numero, separadorMiles, separadorDecimal, fractionDigits = 0) {
      const numericFractionDigits = Number(fractionDigits);
      const normalizedFractionDigits = Number.isInteger(numericFractionDigits) && numericFractionDigits >= 0
        ? numericFractionDigits
        : 0;
      let [entero, decimal] = numero.toFixed(normalizedFractionDigits).split('.');
      entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, separadorMiles);
      return decimal ? `${entero}${separadorDecimal}${decimal}` : entero;
    }

    return {
      obtenerSeparadoresDeNumeros,
      formatearNumero,
    };
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  return {
    createFormatUtils,
  };
});

// =============================================================================
// End of public/js/lib/format_core.js
// =============================================================================
