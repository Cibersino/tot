// public/js/fomat.js
'use strict';

(() => {
  const log = window.getLogger('format');
  const { DEFAULT_LANG } = window.AppConstants;
  const { normalizeLangTag, getLangBase } = window.RendererI18n;

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

  const obtenerSeparadoresDeNumeros = async (idioma, settingsCache) => {
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

  window.FormatUtils = {
    getTimeParts,
    formatTimeFromWords,
    obtenerSeparadoresDeNumeros,
    formatearNumero
  };
})();
