// public/js/presets.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer presets utilities (browser context).
// Responsibilities:
// - Merge default presets with user presets per language.
// - Populate the presets select element.
// - Apply a preset to WPM inputs and description.
// - Load defaults from main via electronAPI and build the final list.
// - Resolve and persist the active preset selection.

(() => {
  // =============================================================================
  // Logger / renderer dependencies
  // =============================================================================
  const log = window.getLogger('presets');
  log.debug('Presets starting...');
  const { DEFAULT_LANG } = window.AppConstants;
  const { getLangBase } = window.RendererI18n;

  // =============================================================================
  // Helpers (merge + DOM utilities)
  // =============================================================================
  function normalizeSettings(settings, language) {
    return (settings && typeof settings === 'object')
      ? settings
      : { language, presets_by_language: {}, selected_preset_by_language: {} };
  }

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

  // =============================================================================
  // Async flows (load + selection resolution)
  // =============================================================================
  async function loadPresetsIntoDom({
    electronAPI,
    settings = null,
    language = DEFAULT_LANG,
    selectEl
  }) {
    if (!electronAPI) throw new Error('electronAPI requerido para cargar presets');

    const settingsSnapshot = normalizeSettings(settings, language);
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
    const settingsSnapshot = normalizeSettings(settings, language);
    const lang = getLangBase(settingsSnapshot.language || language) || DEFAULT_LANG;

    let selected = null;
    const persisted =
      settingsSnapshot &&
      settingsSnapshot.selected_preset_by_language &&
      typeof settingsSnapshot.selected_preset_by_language[lang] === 'string'
        ? settingsSnapshot.selected_preset_by_language[lang].trim()
        : '';
    const trimmedCurrent = typeof currentPresetName === 'string' ? currentPresetName.trim() : '';
    const hasCurrent = trimmedCurrent.length > 0;
    const selectedName = persisted || (hasCurrent ? trimmedCurrent : '');
    if (!selectedName && !persisted && !hasCurrent) {
      log.warnOnce(
        `presets.selectedPreset.none:${lang}`,
        'No persisted preset selection for langKey; selecting safe default and persisting (may be normal on first run).',
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

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.RendererPresets = {
    combinePresets,
    fillPresetsSelect,
    applyPresetSelection,
    loadPresetsIntoDom,
    resolvePresetSelection
  };
})();

// =============================================================================
// End of public/js/presets.js
// =============================================================================
