(() => {
  console.debug("[presets.js] modulo cargado");

  function combinePresets({ settings = {}, defaults = {} }) {
    const lang = settings.language || "es";
    const userPresets = Array.isArray(settings.presets) ? settings.presets.slice() : [];
    const generalDefaults = Array.isArray(defaults.general) ? defaults.general.slice() : [];
    const langPresets = (defaults.languagePresets && defaults.languagePresets[lang] && Array.isArray(defaults.languagePresets[lang]))
      ? defaults.languagePresets[lang]
      : [];

    // 1) Combinar defaults general + defaults idioma
    let combined = generalDefaults.concat(langPresets);

    // 1.b) Aplicar lista de defaults ignorados desde settings (si existe)
    const disabledByUser = (settings.disabled_default_presets && Array.isArray(settings.disabled_default_presets[lang]))
      ? settings.disabled_default_presets[lang]
      : [];
    if (disabledByUser.length > 0) {
      combined = combined.filter(p => !disabledByUser.includes(p.name));
    }

    // 2) Shadowing: presets de usuario reemplazan por nombre
    const map = new Map();
    combined.forEach(p => map.set(p.name, Object.assign({}, p)));
    userPresets.forEach(up => map.set(up.name, Object.assign({}, up)));

    // 3) Array ordenado
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  window.RendererPresets = {
    combinePresets
  };
})();
