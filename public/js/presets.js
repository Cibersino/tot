// public/js/presets.js
'use strict';

(() => {
  const log = window.getLogger('presets');
  const { DEFAULT_LANG } = window.AppConstants;
  const { getLangBase } = window.RendererI18n;

  function combinePresets({ settings = {}, defaults = {} }) {
    const langBase = getLangBase(settings.language) || DEFAULT_LANG;
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
    settings = null,
    language = DEFAULT_LANG,
    selectEl
  }) {
    if (!electronAPI) throw new Error('electronAPI requerido para cargar presets');

    const settingsSnapshot =
      (settings && typeof settings === 'object')
        ? settings
        : { language, presets_by_language: {} };
    let defaults = { general: [], languagePresets: {} };
    try {
      defaults = await electronAPI.getDefaultPresets();
    } catch (err) {
      log.error('Error getting default presets from main:', err);
    }

    const finalList = combinePresets({ settings: settingsSnapshot, defaults });
    fillPresetsSelect(finalList, selectEl);
    return { list: finalList };
  }

  async function resolvePresetSelection({
    list = [],
    settings = {},
    language = DEFAULT_LANG,
    currentPresetName = null,
    selectEl,
    wpmInput,
    wpmSlider,
    presetDescription,
    electronAPI
  }) {
    const settingsSnapshot = (settings && typeof settings === 'object') ? settings : {};
    const lang = getLangBase(settingsSnapshot.language || language) || DEFAULT_LANG;

    let selected = null;
    const persisted =
      settingsSnapshot &&
      settingsSnapshot.selected_preset_by_language &&
      typeof settingsSnapshot.selected_preset_by_language[lang] === 'string'
        ? settingsSnapshot.selected_preset_by_language[lang].trim()
        : '';
    const hasCurrent = typeof currentPresetName === 'string' && currentPresetName.trim();
    const selectedName = persisted || (hasCurrent ? currentPresetName.trim() : '');
    if (!selectedName && !persisted && !hasCurrent) {
      log.warnOnce(
        `presets.selectedPreset.none:${lang}`,
        'No persisted preset selection for langKey; selecting safe default and persisting.',
        { lang }
      );
    }
    if (selectedName) {
      selected = list.find(p => p.name === selectedName) || null;
      if (!selected) {
        log.warnOnce(
          `presets.selectedPreset.missing:${lang}`,
          'Selected preset not found; falling back to safe preset:',
          { requested: selectedName, lang }
        );
      }
    }
    if (!selected) {
      selected = list.find(p => p.name === 'default') || list[0] || null;
    }

    if (selected) {
      applyPresetSelection(selected, { selectEl, wpmInput, wpmSlider, presetDescription });
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

    return selected;
  }

  window.RendererPresets = {
    combinePresets,
    fillPresetsSelect,
    applyPresetSelection,
    loadPresetsIntoDom,
    resolvePresetSelection
  };
})();
