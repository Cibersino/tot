// public/js/presets.js
(() => {
  const log = window.getLogger('presets');

  log.debug('[presets.js] module loaded');

  function combinePresets({ settings = {}, defaults = {} }) {
    const lang = settings.language || 'es';
    const userPresets = Array.isArray(settings.presets) ? settings.presets.slice() : [];
    const generalDefaults = Array.isArray(defaults.general) ? defaults.general.slice() : [];
    const langPresets = (defaults.languagePresets && defaults.languagePresets[lang] && Array.isArray(defaults.languagePresets[lang]))
      ? defaults.languagePresets[lang]
      : [];

    let combined = generalDefaults.concat(langPresets);

    const disabledByUser = (settings.disabled_default_presets && Array.isArray(settings.disabled_default_presets[lang]))
      ? settings.disabled_default_presets[lang]
      : [];
    if (disabledByUser.length > 0) {
      combined = combined.filter(p => !disabledByUser.includes(p.name));
    }

    const map = new Map();
    combined.forEach(p => map.set(p.name, Object.assign({}, p)));
    userPresets.forEach(up => map.set(up.name, Object.assign({}, up)));

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function fillPresetsSelect(list = [], selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    list.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    });
  }

  function applyPresetSelection(preset, domRefs = {}) {
    if (!preset) return;
    const { selectEl, wpmInput, wpmSlider, presetDescription } = domRefs;
    if (selectEl) selectEl.value = preset.name;
    if (wpmInput) wpmInput.value = preset.wpm;
    if (wpmSlider) wpmSlider.value = preset.wpm;
    if (presetDescription) presetDescription.textContent = preset.description || '';
  }

  async function loadPresetsIntoDom({
    electronAPI,
    language = 'es',
    currentPresetName = null,
    selectEl,
    wpmInput,
    wpmSlider,
    presetDescription
  }) {
    if (!electronAPI) throw new Error('electronAPI requerido para cargar presets');

    const settings = (await electronAPI.getSettings()) || { language, presets: [] };
    const lang = settings.language || language || 'es';

    let defaults = { general: [], languagePresets: {} };
    try {
      defaults = await electronAPI.getDefaultPresets();
    } catch (err) {
      log.error('Error getting default presets from main:', err);
    }

    const finalList = combinePresets({ settings, defaults });
    fillPresetsSelect(finalList, selectEl);

    let selected = null;
    if (currentPresetName) {
      selected = finalList.find(p => p.name === currentPresetName) || null;
    }
    if (!selected) {
      selected = finalList.find(p => p.name === 'default') || finalList[0] || null;
    }

    if (selected) {
      applyPresetSelection(selected, { selectEl, wpmInput, wpmSlider, presetDescription });
    } else {
      if (selectEl) selectEl.selectedIndex = -1;
      if (presetDescription) presetDescription.textContent = '';
    }

    return { list: finalList, selected, language: lang };
  }

  window.RendererPresets = {
    combinePresets,
    fillPresetsSelect,
    applyPresetSelection,
    loadPresetsIntoDom
  };
})();
