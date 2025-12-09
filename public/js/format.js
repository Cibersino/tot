(() => {
  console.debug("[format.js] modulo cargado");

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

  const numberFormatDefaults = {};
  const loadNumberFormatDefaults = async (idioma) => {
    const lang = (idioma || "").toLowerCase() || "es";
    if (numberFormatDefaults[lang]) return numberFormatDefaults[lang];
    try {
      const resp = await fetch(`../i18n/${lang}/numberFormat.json`);
      if (resp && resp.ok) {
        const data = await resp.json();
        if (data && data.numberFormat) {
          numberFormatDefaults[lang] = data.numberFormat;
          return data.numberFormat;
        }
      }
    } catch (e) {
      // noop
    }
    if (lang.startsWith("en")) return { thousands: ",", decimal: "." };
    return { thousands: ".", decimal: "," };
  };

  const obtenerSeparadoresDeNumeros = async (idioma, settingsCache) => {
    const nf = settingsCache && settingsCache.numberFormatting ? settingsCache.numberFormatting : null;
    if (nf && nf[idioma]) return nf[idioma];

    try {
      const def = await loadNumberFormatDefaults(idioma || "es");
      if (def && def.thousands && def.decimal) {
        return { separadorMiles: def.thousands, separadorDecimal: def.decimal };
      }
    } catch (e) {
      // noop
    }

    if (idioma && idioma.toLowerCase().startsWith('en')) {
      return { separadorMiles: ',', separadorDecimal: '.' };
    }
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
    loadNumberFormatDefaults,
    obtenerSeparadoresDeNumeros,
    formatearNumero
  };
})();
