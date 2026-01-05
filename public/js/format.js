// public/js/fomat.js
'use strict';

(() => {
  const log = window.getLogger('format');

  const normalizeLangTag = (lang) => (lang || '').trim().toLowerCase().replace(/_/g, '-');
  const getLangBase = (lang) => {
    const tag = normalizeLangTag(lang);
    if (!tag) return '';
    const idx = tag.indexOf('-');
    return idx > 0 ? tag.slice(0, idx) : tag;
  };

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
    const tag = normalizeLangTag(idioma) || 'es';
    const lang = getLangBase(tag) || 'es';
    const nf = settingsCache && settingsCache.numberFormatting ? settingsCache.numberFormatting : null;
    if (nf && nf[lang]) return nf[lang];

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
