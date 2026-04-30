// public/js/lib/format_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared formatting core for renderer-facing FormatUtils.
// Responsibilities:
// - Convert word counts to exact duration values.
// - Convert exact duration values to rounded display time parts.
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
  function createNoopLog() {
    return {
      warnOnce() {},
    };
  }

  function createFormatUtils({
    DEFAULT_LANG,
    normalizeLangTag = (lang) => String(lang || '').trim().toLowerCase(),
    getLangBase = null,
    log = null,
  } = {}) {
    const safeLog = log && typeof log === 'object' ? log : createNoopLog();
    const defaultLang = typeof DEFAULT_LANG === 'string' ? DEFAULT_LANG.trim().toLowerCase() : '';
    if (!defaultLang) {
      throw new Error('[format_core] DEFAULT_LANG is required');
    }
    const resolveLangBase = typeof getLangBase === 'function'
      ? getLangBase
      : (lang) => String(lang || '').trim().toLowerCase().split(/[-_]/)[0] || defaultLang;

    function getExactTotalSeconds(words, wpm) {
      const numericWords = Number(words);
      const numericWpm = Number(wpm);
      if (!Number.isFinite(numericWords) || numericWords <= 0) return 0;
      if (!Number.isFinite(numericWpm) || numericWpm <= 0) return 0;
      return (numericWords / numericWpm) * 60;
    }

    function getDisplayTimeParts(totalSeconds) {
      const numericTotalSeconds = Number(totalSeconds);
      const roundedTotalSeconds = Number.isFinite(numericTotalSeconds) && numericTotalSeconds > 0
        ? Math.round(numericTotalSeconds)
        : 0;
      return {
        hours: Math.floor(roundedTotalSeconds / 3600),
        minutes: Math.floor((roundedTotalSeconds % 3600) / 60),
        seconds: roundedTotalSeconds % 60,
      };
    }

    async function obtenerSeparadoresDeNumeros(idioma, settingsCache) {
      if (settingsCache === null) {
        if (typeof safeLog.warnOnce === 'function') {
          safeLog.warnOnce(
            'format.numberFormatting.settingsCacheNull',
            'settingsCache null; using hardcoded defaults.'
          );
        }
        return { separadorMiles: '.', separadorDecimal: ',' };
      }

      const tag = normalizeLangTag(idioma) || defaultLang;
      const langKey = resolveLangBase(tag) || defaultLang;
      const nf = settingsCache && settingsCache.numberFormatting ? settingsCache.numberFormatting : null;
      if (nf && nf[langKey]) return nf[langKey];

      const defaultKey = resolveLangBase(defaultLang) || defaultLang;
      if (nf && nf[defaultKey]) {
        if (typeof safeLog.warnOnce === 'function') {
          safeLog.warnOnce(
            `format.numberFormatting.fallback:${langKey}`,
            'Missing numberFormatting for langKey; using default:',
            { langKey, defaultKey }
          );
        }
        return nf[defaultKey];
      }

      if (typeof safeLog.warnOnce === 'function') {
        safeLog.warnOnce(
          'format.numberFormatting.missing',
          'numberFormatting missing; using hardcoded defaults.'
        );
      }
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
      getExactTotalSeconds,
      getDisplayTimeParts,
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
