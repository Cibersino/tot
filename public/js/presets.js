// public/js/presets.js
'use strict';

(() => {
  const log = window.getLogger('presets');

  const normalizeLangTag = (lang) => (lang || '').trim().toLowerCase().replace(/_/g, '-');
  const getLangBase = (lang) => {
    const tag = normalizeLangTag(lang);
    if (!tag) return '';
    const idx = tag.indexOf('-');
    return idx > 0 ? tag.slice(0, idx) : tag;
  };

  function combinePresets({ settings = {}, defaults = {} }) {
    const langBase = getLangBase(settings.language) || 'es';
    const userPresets = (settings.presets_by_language && Array.isArray(settings.presets_by_language[langBase]))
      ? settings.presets_by_language[langBase].slice()
      : [];
    const generalDefaults = Array.isArray(defaults.general) ? defaults.general.slice() : [];
    const langPresets = (defaults.languagePresets && defaults.languagePresets[langBase] && Array.isArray(defaults.languagePresets[langBase]))
      ? defaults.languagePresets[langBase]
      : [];

    let combined = generalDefaults.concat(langPresets);

    const disabledByUser = (settings.disabled_default_presets && Array.isArray(settings.disabled_default_presets[langBase]))
      ? settings.disabled_default_presets[langBase]
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

    const settings = (await electronAPI.getSettings()) || { language, presets_by_language: {} };
    const lang = getLangBase(settings.language || language) || 'es';

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
