// public/js/lib/format_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared number-formatting core for renderer-facing FormatUtils.
// Responsibilities:
// - Resolve number-format separators from explicit preference scopes.
// - Support both browser-script and CommonJS consumers.

(function initFormatCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.FormatCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
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
      const normalizedFractionDigits = Number.isInteger(Number(fractionDigits)) && Number(fractionDigits) >= 0
        ? Number(fractionDigits)
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

  return {
    createFormatUtils,
  };
});

// =============================================================================
// End of public/js/lib/format_core.js
// =============================================================================
