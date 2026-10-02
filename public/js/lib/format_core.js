// public/js/lib/format_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared number-formatting core for renderer-facing FormatUtils.
// Responsibilities:
// - Resolve number-format separators from settings and language fallbacks.
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
    normalizeLangTag = (lang) => String(lang || '').trim().toLowerCase(),
    getLangBase = null,
    log,
  } = {}) {
    const defaultLang = typeof DEFAULT_LANG === 'string' ? DEFAULT_LANG.trim().toLowerCase() : '';
    if (!defaultLang) {
      throw new Error('[format_core] DEFAULT_LANG is required');
    }
    const resolveLangBase = typeof getLangBase === 'function'
      ? getLangBase
      : (lang) => String(lang || '').trim().toLowerCase().split(/[-_]/)[0] || defaultLang;

    async function obtenerSeparadoresDeNumeros(idioma, settingsCache) {
      if (settingsCache === null) {
        log.warnOnce(
          'format.numberFormatting.settingsCacheNull',
          'settingsCache null; using hardcoded defaults.'
        );
        return { separadorMiles: '.', separadorDecimal: ',' };
      }

      const tag = normalizeLangTag(idioma) || defaultLang;
      const langKey = resolveLangBase(tag) || defaultLang;
      const nf = settingsCache && settingsCache.numberFormatting ? settingsCache.numberFormatting : null;
      if (nf && nf[langKey]) return nf[langKey];

      const defaultKey = resolveLangBase(defaultLang) || defaultLang;
      if (nf && nf[defaultKey]) {
        log.warnOnce(
          `format.numberFormatting.fallback:${langKey}`,
          'Missing numberFormatting for langKey; using default:',
          { langKey, defaultKey }
        );
        return nf[defaultKey];
      }

      log.warnOnce(
        'format.numberFormatting.missing',
        'numberFormatting missing; using hardcoded defaults.'
      );
      return { separadorMiles: '.', separadorDecimal: ',' };
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
