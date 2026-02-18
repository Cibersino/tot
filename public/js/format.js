// public/js/format.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer-side formatting helpers.
// Responsibilities:
// - Convert word counts to time parts and formatted duration strings.
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

  // =============================================================================
  // Helpers (time formatting)
  // =============================================================================
  function getTimeParts(words, wpm) {
    if (!wpm || wpm <= 0) return { hours: 0, minutes: 0, seconds: 0 };
    const totalSeconds = Math.round((words / wpm) * 60);
    return {
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60
    };
  }

  function formatTimeFromWords(words, wpm) {
    const { hours, minutes, seconds } = getTimeParts(words, wpm);
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  // =============================================================================
  // Helpers (number formatting)
  // =============================================================================
  const obtenerSeparadoresDeNumeros = async (idioma, settingsCache) => {
    if (settingsCache === null) {
      log.warnOnce(
        'format.numberFormatting.settingsCacheNull',
        'settingsCache null; using hardcoded defaults.'
      );
      return { separadorMiles: '.', separadorDecimal: ',' };
    }
    const tag = normalizeLangTag(idioma) || DEFAULT_LANG;
    const langKey = getLangBase(tag) || DEFAULT_LANG;
    const nf = settingsCache && settingsCache.numberFormatting ? settingsCache.numberFormatting : null;
    if (nf && nf[langKey]) return nf[langKey];

    const defaultKey = getLangBase(DEFAULT_LANG) || DEFAULT_LANG;
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
  };

  const formatearNumero = (numero, separadorMiles, separadorDecimal) => {
    let [entero, decimal] = numero.toFixed(0).split('.');
    entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, separadorMiles);
    return decimal ? `${entero}${separadorDecimal}${decimal}` : entero;
  };

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.FormatUtils = {
    getTimeParts,
    formatTimeFromWords,
    obtenerSeparadoresDeNumeros,
    formatearNumero
  };
})();

// =============================================================================
// End of public/js/format.js
// =============================================================================
