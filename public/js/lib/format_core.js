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
    DEFAULT_LANG = 'es',
    normalizeLangTag = (lang) => String(lang || '').trim().toLowerCase(),
    getLangBase = (lang) => String(lang || '').trim().toLowerCase().split(/[-_]/)[0] || DEFAULT_LANG,
    log = null,
  } = {}) {
    const safeLog = log && typeof log === 'object' ? log : createNoopLog();

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

      const tag = normalizeLangTag(idioma) || DEFAULT_LANG;
      const langKey = getLangBase(tag) || DEFAULT_LANG;
      const nf = settingsCache && settingsCache.numberFormatting ? settingsCache.numberFormatting : null;
      if (nf && nf[langKey]) return nf[langKey];

      const defaultKey = getLangBase(DEFAULT_LANG) || DEFAULT_LANG;
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

    function formatearNumero(numero, separadorMiles, separadorDecimal) {
      let [entero, decimal] = numero.toFixed(0).split('.');
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
