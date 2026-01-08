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

  function getSelectedPresetName(settings, langBase, currentPresetName) {
    const persisted =
      settings &&
      settings.selected_preset_by_language &&
      typeof settings.selected_preset_by_language[langBase] === 'string'
        ? settings.selected_preset_by_language[langBase].trim()
        : '';
    if (persisted) return persisted;
    if (typeof currentPresetName === 'string' && currentPresetName.trim()) {
      return currentPresetName.trim();
    }
    return '';
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
    const selectedName = getSelectedPresetName(settings, lang, currentPresetName);
    if (selectedName) {
      selected = finalList.find(p => p.name === selectedName) || null;
      if (!selected) {
        log.warnOnce(
          `presets.selectedPreset.missing:${lang}`,
          'Selected preset not found; falling back to safe preset:',
          { requested: selectedName, lang }
        );
      }
    }
    if (!selected) {
      selected = finalList.find(p => p.name === 'default') || finalList[0] || null;
    }

    if (selected) {
      applyPresetSelection(selected, { selectEl, wpmInput, wpmSlider, presetDescription });
      const persisted =
        settings &&
        settings.selected_preset_by_language &&
        typeof settings.selected_preset_by_language[lang] === 'string'
          ? settings.selected_preset_by_language[lang].trim()
          : '';
      if (selected.name && selected.name !== persisted) {
        try {
          if (electronAPI && typeof electronAPI.setSelectedPreset === 'function') {
            await electronAPI.setSelectedPreset(selected.name);
          }
        } catch (err) {
          log.error('Error persisting selected preset:', err);
        }
      }
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
