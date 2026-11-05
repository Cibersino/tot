// public/js/presets.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer presets utilities (browser context).
// Responsibilities:
// - Merge default presets with user presets per language.
// - Populate the presets combobox.
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
    || typeof RendererI18n.getPreferenceScope !== 'function'
    || typeof RendererI18n.resolveUserTextDirection !== 'function'
  ) {
    throw new Error('[presets] RendererI18n direction helpers unavailable; cannot continue');
  }
  const { getPreferenceScope, resolveUserTextDirection } = RendererI18n;

  // =============================================================================
  // Helpers (merge + DOM utilities)
  // =============================================================================
  function normalizeSettings(settings, language) {
    return (settings && typeof settings === 'object' && !Array.isArray(settings))
      ? settings
      : {
        language,
        presetsByScope: {},
        disabledDefaultPresetsByScope: {},
        selectedPresetByScope: {}
      };
  }

  function findPresetByName(list, presetName) {
    const normalizedName = typeof presetName === 'string' ? presetName.trim() : '';
    return normalizedName
      ? list.find((preset) => preset.name === normalizedName) || null
      : null;
  }

  function combinePresets({ settings = {}, defaults = {} }) {
    const preferenceScopeId = getPreferenceScope(settings.language || DEFAULT_LANG);
    const presetsByScope = settings.presetsByScope || {};
    const disabledPresetsByScope = settings.disabledDefaultPresetsByScope || {};
    const defaultPresetsByScope = defaults.defaultPresetsByScope || {};

    const userPresets = Array.isArray(presetsByScope[preferenceScopeId])
      ? presetsByScope[preferenceScopeId].slice()
      : [];
    const generalDefaults = Array.isArray(defaults.general) ? defaults.general.slice() : [];
    const scopePresets = Array.isArray(defaultPresetsByScope[preferenceScopeId])
      ? defaultPresetsByScope[preferenceScopeId]
      : [];

    let combined = generalDefaults.concat(scopePresets);

    const disabledByUser = Array.isArray(disabledPresetsByScope[preferenceScopeId])
      ? disabledPresetsByScope[preferenceScopeId]
      : [];
    if (disabledByUser.length) {
      combined = combined.filter(p => !disabledByUser.includes(p.name));
    }

    const map = new Map();
    combined.forEach(p => map.set(p.name, Object.assign({}, p)));
    userPresets.forEach(up => map.set(up.name, Object.assign({}, up)));

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function setPresetOptions(list = [], combobox) {
    if (!combobox) return;
    combobox.update({
      options: list.map((preset) => ({
        value: preset.name,
        label: preset.name,
      })),
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
    const { combobox, presetDescription } = domRefs;
    if (combobox) combobox.update({ value: preset.name });
    applyPresetDescriptionText(presetDescription, preset.description || '');
  }

  // =============================================================================
  // Async flows (load + selection resolution)
  // =============================================================================
  async function loadPresetsIntoCombobox({
    electronAPI,
    settings = null,
    language = DEFAULT_LANG,
    combobox
  }) {
    const settingsSnapshot = normalizeSettings(settings, language);
    let defaults = { general: [], defaultPresetsByScope: {} };
    if (!electronAPI || typeof electronAPI.getDefaultPresets !== 'function') {
      log.warn(
        '[presets] electronAPI.getDefaultPresets unavailable; using settings-only presets'
      );
    } else {
      try {
        defaults = await electronAPI.getDefaultPresets();
      } catch (error) {
        log.warn('Default presets fetch failed; using settings-only presets.', error);
      }
    }

    const finalList = combinePresets({ settings: settingsSnapshot, defaults });
    setPresetOptions(finalList, combobox);
    return { list: finalList };
  }

  async function resolvePresetSelection({
    list = [],
    settings = {},
    language = DEFAULT_LANG,
    currentPresetName = null,
    previousPresetName = null,
    combobox,
    presetDescription,
    electronAPI
  }) {
    const settingsSnapshot = normalizeSettings(settings, language);
    const preferenceScopeId = getPreferenceScope(settingsSnapshot.language || language || DEFAULT_LANG);
    const selectedByScope = settingsSnapshot.selectedPresetByScope || {};

    const persisted =
      typeof selectedByScope[preferenceScopeId] === 'string'
        ? selectedByScope[preferenceScopeId].trim()
        : '';
    const persistedSelection = findPresetByName(list, persisted);
    const rollbackSelection =
      findPresetByName(list, previousPresetName)
      || persistedSelection;
    const selectedName = persisted || (typeof currentPresetName === 'string' ? currentPresetName.trim() : '');
    const namedSelection = findPresetByName(list, selectedName);
    const selected = namedSelection || list.find(p => p.name === 'default') || list[0] || null;

    if (!selected) {
      if (combobox) combobox.update({ value: '' });
      applyPresetDescriptionText(presetDescription, '');
      if (selectedName && !namedSelection) {
        log.warn(
          'Selected preset was not found and no replacement is available; visible preset selection cleared (NOTE: may be normal; configured presets can change independently of a saved selection).',
          { requested: selectedName, preferenceScopeId }
        );
      }
      return selected;
    }

    applyPresetSelection(selected, { combobox, presetDescription });
    if (!selectedName) {
      log.warn(
        'No persisted preset selection for langKey; selected an available preset (NOTE: may be normal; no preset has been selected for this language).',
        { preferenceScopeId, selected: selected.name }
      );
    } else if (!namedSelection) {
      log.warn(
        'Selected preset was not found; selected an available replacement (NOTE: may be normal; configured presets can change independently of a saved selection).',
        { requested: selectedName, selected: selected.name, preferenceScopeId }
      );
    }
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
    } catch (error) {
      log.warn('Selection persistence failed:', error);
      if (rollbackSelection && rollbackSelection.name !== selected.name) {
        applyPresetSelection(rollbackSelection, { combobox, presetDescription });
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
    setPresetOptions,
    applyPresetDescriptionText,
    applyPresetSelection,
    loadPresetsIntoCombobox,
    resolvePresetSelection
  };
})();

// =============================================================================
// End of public/js/presets.js
// =============================================================================
