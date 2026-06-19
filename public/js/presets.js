// public/js/presets.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer presets utilities (browser context).
// Responsibilities:
// - Merge default presets with user presets per language.
// - Populate the presets select element.
// - Apply a resolved preset selection to preset UI elements.
// - Load defaults from main via electronAPI and build the final list.
// - Resolve and persist the active preset selection.

(() => {
  // =============================================================================
  // Logger / renderer dependencies
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[presets] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('presets');
  log.debug('Presets starting...');
  const { AppConstants } = window;
  if (!AppConstants) {
    throw new Error('[presets] AppConstants unavailable; verify constants.js load order');
  }
  const { DEFAULT_LANG } = AppConstants;
  const { RendererI18n } = window;
  if (
    !RendererI18n
    || typeof RendererI18n.getLangBase !== 'function'
    || typeof RendererI18n.resolveUserTextDirection !== 'function'
  ) {
    throw new Error('[presets] RendererI18n direction helpers unavailable; cannot continue');
  }
  const { getLangBase, resolveUserTextDirection } = RendererI18n;

  // =============================================================================
  // Helpers (merge + DOM utilities)
  // =============================================================================
  function normalizeSettings(settings, language) {
    return (settings && typeof settings === 'object')
      ? settings
      : {
        language,
        presets_by_language: {},
        disabled_default_presets: {},
        selected_preset_by_language: {}
      };
  }

  function combinePresets({ settings = {}, defaults = {} }) {
    const langBase = getLangBase(settings.language) || DEFAULT_LANG;
    const presetsByLanguage = settings.presets_by_language || {};
    const disabledPresetsByLanguage = settings.disabled_default_presets || {};
    const defaultPresetsByLanguage = defaults.languagePresets || {};

    const userPresets = Array.isArray(presetsByLanguage[langBase])
      ? presetsByLanguage[langBase].slice()
      : [];
    const generalDefaults = Array.isArray(defaults.general) ? defaults.general.slice() : [];
    const langPresets = Array.isArray(defaultPresetsByLanguage[langBase])
      ? defaultPresetsByLanguage[langBase]
      : [];

    let combined = generalDefaults.concat(langPresets);

    const disabledByUser = Array.isArray(disabledPresetsByLanguage[langBase])
      ? disabledPresetsByLanguage[langBase]
      : [];
    if (disabledByUser.length) {
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

  function applyPresetDescriptionText(presetDescription, descriptionText = '') {
    if (!presetDescription) return;
    const normalizedText = typeof descriptionText === 'string'
      ? descriptionText
      : descriptionText === null || typeof descriptionText === 'undefined'
        ? ''
        : String(descriptionText);
    presetDescription.textContent = normalizedText;
    presetDescription.setAttribute('dir', resolveUserTextDirection(normalizedText));
  }

  function applyPresetSelection(preset, domRefs = {}) {
    if (!preset) return;
    const { selectEl, presetDescription } = domRefs;
    if (selectEl) selectEl.value = preset.name;
    applyPresetDescriptionText(presetDescription, preset.description || '');
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
    if (!electronAPI) throw new Error('electronAPI is required to load presets');

    const settingsSnapshot = normalizeSettings(settings, language);
    let defaults = { general: [], languagePresets: {} };
    if (typeof electronAPI.getDefaultPresets !== 'function') {
      log.warn(
        '[presets] electronAPI.getDefaultPresets unavailable; using settings-only presets'
      );
    } else {
      try {
        defaults = await electronAPI.getDefaultPresets();
      } catch (err) {
        log.warn('Default presets fetch failed; using settings-only presets.', err);
      }
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
    previousPresetName = null,
    selectEl,
    presetDescription,
    electronAPI
  }) {
    const settingsSnapshot = normalizeSettings(settings, language);
    const langBase = getLangBase(settingsSnapshot.language || language) || DEFAULT_LANG;
    const selectedByLanguage = settingsSnapshot.selected_preset_by_language || {};

    const persisted =
      typeof selectedByLanguage[langBase] === 'string'
        ? selectedByLanguage[langBase].trim()
        : '';
    const persistedSelection = persisted
      ? list.find(p => p.name === persisted) || null
      : null;
    const rollbackSelection =
      (typeof previousPresetName === 'string' && previousPresetName.trim()
        ? list.find(p => p.name === previousPresetName.trim()) || null
        : null)
      || persistedSelection;
    const trimmedCurrent = typeof currentPresetName === 'string' ? currentPresetName.trim() : '';
    const selectedName = persisted || trimmedCurrent;
    if (!selectedName) {
      log.warn(
        'No persisted preset selection for langKey; selecting safe default and persisting (may be normal on first run).',
        { lang: langBase }
      );
    }
    const namedSelection = selectedName
      ? list.find(p => p.name === selectedName) || null
      : null;
    if (selectedName && !namedSelection) {
      log.warn(
        'Selected preset not found; falling back to safe preset:',
        { requested: selectedName, lang: langBase }
      );
    }
    const selected = namedSelection || list.find(p => p.name === 'default') || list[0] || null;

    if (!selected) {
      if (selectEl) selectEl.selectedIndex = -1;
      applyPresetDescriptionText(presetDescription, '');
      return selected;
    }

    applyPresetSelection(selected, { selectEl, presetDescription });
    if (!selected.name || selected.name === persisted) {
      return selected;
    }

    try {
      if (electronAPI && typeof electronAPI.setSelectedPreset === 'function') {
        const persistResult = await electronAPI.setSelectedPreset(selected.name);
        if (
          persistResult
          && typeof persistResult.ok === 'boolean'
          && persistResult.ok !== true
        ) {
          throw new Error(
            persistResult.error
              ? String(persistResult.error)
              : 'Selection persistence returned non-ok result.'
          );
        }
      } else {
        throw new Error('electronAPI.setSelectedPreset unavailable.');
      }
    } catch (err) {
      log.warn('Selection persistence failed:', err);
      if (rollbackSelection && rollbackSelection.name !== selected.name) {
        applyPresetSelection(rollbackSelection, { selectEl, presetDescription });
        return rollbackSelection;
      }
    }

    return selected;
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.RendererPresets = {
    combinePresets,
    fillPresetsSelect,
    applyPresetDescriptionText,
    applyPresetSelection,
    loadPresetsIntoDom,
    resolvePresetSelection
  };
})();

// =============================================================================
// End of public/js/presets.js
// =============================================================================
