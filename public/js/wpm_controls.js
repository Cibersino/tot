// public/js/wpm_controls.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-window WPM controls module.
// Responsibilities:
// - Own main-renderer WPM controls state (current WPM + preset selection).
// - Keep WPM input, slider, preset select, and description in sync.
// - Apply WPM changes from presets, manual edits, and external feature callbacks.
// - Delegate preset catalog/selection resolution to RendererPresets.

(() => {
  // =============================================================================
  // Logger and constants
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[wpm-controls] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('wpm-controls');

  const { AppConstants } = window;
  if (!AppConstants) {
    throw new Error('[wpm-controls] AppConstants unavailable; verify constants.js load order');
  }

  const {
    WPM_MIN,
    WPM_MAX,
  } = AppConstants;

  if (!Number.isFinite(WPM_MIN) || !Number.isFinite(WPM_MAX) || WPM_MIN > WPM_MAX) {
    throw new Error('[wpm-controls] AppConstants WPM_MIN/WPM_MAX invalid; cannot continue');
  }

  // =============================================================================
  // Helpers
  // =============================================================================
  function clampWpm(rawValue) {
    const numeric = Number(rawValue);
    const safe = Number.isFinite(numeric) ? Math.round(numeric) : WPM_MIN;
    return Math.min(Math.max(safe, WPM_MIN), WPM_MAX);
  }

  // =============================================================================
  // Controller factory
  // =============================================================================
  function createController({
    wpmInput,
    wpmSlider,
    presetsSelect,
    presetDescription,
    onPresetSelectionChanged,
  } = {}) {
    // Optional curve support should never block the control surface. If the
    // mapper is missing or breaks, the controller falls back to linear mapping.
    const { WpmCurve } = window;
    const hasWpmCurveFactory = !!(
      WpmCurve && typeof WpmCurve.createMapperFromConstants === 'function'
    );
    let wpmCurveMapper = null;
    let wpmCurveFactoryFailed = false;

    if (hasWpmCurveFactory) {
      try {
        wpmCurveMapper = WpmCurve.createMapperFromConstants(AppConstants);
      } catch (err) {
        wpmCurveFactoryFailed = true;
        log.warn(
          'BOOTSTRAP: WpmCurve.createMapperFromConstants failed; using linear slider mapping.',
          err
        );
      }
    }

    if (!wpmCurveMapper) {
      if (!hasWpmCurveFactory) {
        log.warn(
          'BOOTSTRAP: WpmCurve unavailable; using linear slider mapping.'
        );
      } else if (!wpmCurveFactoryFailed) {
        log.warn(
          'BOOTSTRAP: WpmCurve mapper invalid; using linear slider mapping.'
        );
      }
    }

    // Controller state is kept local so the main renderer owns only one source
    // of truth for the active WPM and selected preset name.
    let wpm = WPM_MIN;
    let currentPresetName = null;
    let allPresetsCache = [];
    let listenersBound = false;

    // =============================================================================
    // Bridge helpers
    // =============================================================================
    function hasRendererPresetsCatalogBridge() {
      const rendererPresets = window.RendererPresets || {};
      return typeof rendererPresets.loadPresetsIntoDom === 'function';
    }

    function hasRendererPresetsSelectionBridge() {
      const rendererPresets = window.RendererPresets || {};
      return typeof rendererPresets.resolvePresetSelection === 'function';
    }

    function getRendererPresetsBridge() {
      return window.RendererPresets || {};
    }

    // =============================================================================
    // WPM sync helpers
    // =============================================================================
    function wpmFromSliderControl(rawControl) {
      if (wpmCurveMapper) {
        if (typeof wpmCurveMapper.wpmFromControl !== 'function') {
          log.warn(
            'WpmCurve.wpmFromControl unavailable; using linear slider mapping.'
          );
          wpmCurveMapper = null;
          return clampWpm(rawControl);
        }
        try {
          return clampWpm(wpmCurveMapper.wpmFromControl(rawControl));
        } catch (err) {
          log.warn(
            'WpmCurve.wpmFromControl failed; using linear slider mapping.',
            err
          );
          wpmCurveMapper = null;
        }
      }
      return clampWpm(rawControl);
    }

    function sliderControlFromWpm(rawWpm) {
      if (wpmCurveMapper) {
        if (typeof wpmCurveMapper.controlFromWpm !== 'function') {
          log.warn(
            'WpmCurve.controlFromWpm unavailable; using linear slider mapping.'
          );
          wpmCurveMapper = null;
          return clampWpm(rawWpm);
        }
        try {
          return wpmCurveMapper.controlFromWpm(rawWpm);
        } catch (err) {
          log.warn(
            'WpmCurve.controlFromWpm failed; using linear slider mapping.',
            err
          );
          wpmCurveMapper = null;
        }
      }
      return clampWpm(rawWpm);
    }

    // Keep the text input and slider synchronized through one normalization path
    // so presets, manual edits, and external updates apply the same bounds.
    function syncWpmControls(rawWpm) {
      const normalizedWpm = clampWpm(rawWpm);
      if (wpmInput) wpmInput.value = String(normalizedWpm);
      if (wpmSlider) wpmSlider.value = String(sliderControlFromWpm(normalizedWpm));
      return normalizedWpm;
    }

    // =============================================================================
    // Preset state helpers
    // =============================================================================
    function applyPresetUiSelection(preset) {
      if (presetsSelect && preset && preset.name) {
        presetsSelect.value = preset.name;
      }
      if (presetDescription) {
        presetDescription.textContent = preset && preset.description ? preset.description : '';
      }
    }

    function notifyPresetSelectionChanged(preset) {
      if (typeof onPresetSelectionChanged === 'function') {
        onPresetSelectionChanged(preset || null);
      }
    }

    function applySelectedPreset(preset) {
      if (!preset) {
        currentPresetName = null;
        applyPresetUiSelection(null);
        notifyPresetSelectionChanged(null);
        return null;
      }
      currentPresetName = preset.name;
      applyPresetUiSelection(preset);
      wpm = syncWpmControls(preset.wpm);
      notifyPresetSelectionChanged(preset);
      return preset;
    }

    function resetPresetSelection() {
      currentPresetName = null;
      if (presetsSelect) presetsSelect.selectedIndex = -1;
      if (presetDescription) presetDescription.textContent = '';
      notifyPresetSelectionChanged(null);
    }

    function resetPresetsState() {
      if (presetsSelect) presetsSelect.innerHTML = '';
      if (presetDescription) presetDescription.textContent = '';
      allPresetsCache = [];
      currentPresetName = null;
      notifyPresetSelectionChanged(null);
      return allPresetsCache;
    }

    function notifyWpmChanged(previousWpm, onWpmChanged, preset) {
      if (typeof onWpmChanged !== 'function' || wpm === previousWpm) {
        return;
      }
      if (typeof preset === 'undefined') {
        onWpmChanged(wpm);
        return;
      }
      onWpmChanged(wpm, preset);
    }

    function createPresetSelectionSettings(settingsSnapshot) {
      return Object.assign({}, settingsSnapshot || {}, {
        selected_preset_by_language: {}
      });
    }

    // =============================================================================
    // Preset async flows
    // =============================================================================
    async function reloadPresetsList({ settingsSnapshot, language, electronAPI } = {}) {
      if (!hasRendererPresetsCatalogBridge()) {
        log.warn(
          'Preset list reload skipped because RendererPresets.loadPresetsIntoDom is unavailable.'
        );
        return resetPresetsState();
      }
      try {
        const { loadPresetsIntoDom } = getRendererPresetsBridge();
        const res = await loadPresetsIntoDom({
          electronAPI,
          settings: settingsSnapshot,
          language,
          selectEl: presetsSelect
        });
        allPresetsCache = res && res.list ? res.list.slice() : [];
        return allPresetsCache;
      } catch (err) {
        log.error('RendererPresets.loadPresetsIntoDom failed:', err);
        return resetPresetsState();
      }
    }

    async function loadPresets({
      settingsSnapshot,
      language,
      electronAPI,
      onWpmChanged,
    } = {}) {
      if (!hasRendererPresetsSelectionBridge()) {
        log.warn(
          'Preset selection skipped because RendererPresets.resolvePresetSelection is unavailable.'
        );
        return resetPresetsState();
      }
      try {
        const { resolvePresetSelection } = getRendererPresetsBridge();
        await reloadPresetsList({ settingsSnapshot, language, electronAPI });
        const previousWpm = wpm;
        const selected = await resolvePresetSelection({
          list: allPresetsCache,
          settings: settingsSnapshot,
          language,
          currentPresetName,
          selectEl: presetsSelect,
          presetDescription,
          electronAPI
        });
        if (selected) {
          applySelectedPreset(selected);
          notifyWpmChanged(previousWpm, onWpmChanged, selected);
        } else {
          currentPresetName = null;
          applyPresetUiSelection(null);
          notifyPresetSelectionChanged(null);
        }
        return allPresetsCache;
      } catch (err) {
        log.error('RendererPresets.resolvePresetSelection failed during loadPresets:', err);
        return resetPresetsState();
      }
    }

    async function handlePresetCreated({
      preset,
      settingsSnapshot,
      language,
      electronAPI,
      onWpmChanged,
    } = {}) {
      try {
        const updated = await reloadPresetsList({ settingsSnapshot, language, electronAPI });
        if (!hasRendererPresetsSelectionBridge()) {
          log.warn(
            'Preset-created selection sync skipped because RendererPresets.resolvePresetSelection is unavailable.'
          );
          return updated;
        }
        const { resolvePresetSelection } = getRendererPresetsBridge();
        if (!preset || !preset.name) return updated;
        const found = updated.find(item => item.name === preset.name);
        if (!found) return updated;
        const previousWpm = wpm;
        const neutralSettings = createPresetSelectionSettings(settingsSnapshot);
        const selected = await resolvePresetSelection({
          list: updated,
          settings: neutralSettings,
          language,
          currentPresetName: preset.name,
          selectEl: presetsSelect,
          presetDescription,
          electronAPI
        });
        if (selected) {
          applySelectedPreset(selected);
          notifyWpmChanged(previousWpm, onWpmChanged, selected);
        }
        return updated;
      } catch (err) {
        log.error('RendererPresets.resolvePresetSelection failed during handlePresetCreated:', err);
        return allPresetsCache;
      }
    }

    async function handlePresetSelectionChange({
      settingsSnapshot,
      language,
      electronAPI,
      onWpmChanged,
    } = {}) {
      if (!hasRendererPresetsSelectionBridge()) {
        log.warn(
          'Preset change ignored because RendererPresets.resolvePresetSelection is unavailable.'
        );
        return null;
      }
      const name = presetsSelect ? presetsSelect.value : '';
      if (!name) return null;

      const preset = allPresetsCache.find(item => item.name === name);
      if (!preset) return null;

      try {
        const { resolvePresetSelection } = getRendererPresetsBridge();
        const previousWpm = wpm;
        const settingsOverride = createPresetSelectionSettings(settingsSnapshot);
        const selected = await resolvePresetSelection({
          list: allPresetsCache,
          settings: settingsOverride,
          language,
          currentPresetName: preset.name,
          selectEl: presetsSelect,
          presetDescription,
          electronAPI
        });
        if (selected) {
          applySelectedPreset(selected);
          notifyWpmChanged(previousWpm, onWpmChanged, selected);
        }
        return selected;
      } catch (err) {
        log.error('RendererPresets.resolvePresetSelection failed during handlePresetSelectionChange:', err);
        return null;
      }
    }

    // =============================================================================
    // External updates and UI wiring
    // =============================================================================
    function applyExternalWpm(rawWpm, { onWpmChanged } = {}) {
      const previousWpm = wpm;
      wpm = syncWpmControls(rawWpm);
      resetPresetSelection();
      notifyWpmChanged(previousWpm, onWpmChanged);
      return wpm;
    }

    function bind({ guardUserAction, onWpmChanged } = {}) {
      if (listenersBound) return;
      listenersBound = true;

      const canProceed = (reason) => (
        typeof guardUserAction !== 'function' || guardUserAction(reason)
      );

      if (wpmSlider) {
        wpmSlider.addEventListener('input', () => {
          if (!canProceed('wpm-slider')) return;
          wpm = wpmFromSliderControl(wpmSlider.value);
          if (wpmInput) wpmInput.value = String(wpm);
          resetPresetSelection();
          notifyWpmChanged(null, onWpmChanged);
        });
      }

      if (wpmInput) {
        wpmInput.addEventListener('blur', () => {
          if (!canProceed('wpm-input-blur')) return;
          let requestedWpm = Number(wpmInput.value);
          if (Number.isNaN(requestedWpm)) {
            requestedWpm = wpmFromSliderControl(wpmSlider ? wpmSlider.value : WPM_MIN);
          }
          wpm = syncWpmControls(requestedWpm);
          resetPresetSelection();
          notifyWpmChanged(null, onWpmChanged);
        });

        wpmInput.addEventListener('keydown', (event) => {
          if (!canProceed('wpm-input-keydown')) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            wpmInput.blur();
          }
        });
      }
    }

    // Apply DOM limits before the initial sync so the controls start from a
    // valid visible state even before any preset load runs.
    if (wpmSlider) {
      wpmSlider.min = String(WPM_MIN);
      wpmSlider.max = String(WPM_MAX);
      if (wpmCurveMapper) {
        try {
          if (Number.isFinite(wpmCurveMapper.controlStep) && wpmCurveMapper.controlStep > 0) {
            wpmSlider.step = String(wpmCurveMapper.controlStep);
          } else {
            log.warn(
              'BOOTSTRAP: WpmCurve.controlStep invalid; using default slider step.'
            );
          }
        } catch (err) {
          log.warn(
            'BOOTSTRAP: WpmCurve.controlStep failed; using default slider step.',
            err
          );
          wpmCurveMapper = null;
        }
      }
    }
    if (wpmInput) {
      wpmInput.min = String(WPM_MIN);
      wpmInput.max = String(WPM_MAX);
    }
    wpm = syncWpmControls(wpmInput ? wpmInput.value : WPM_MIN);

    // =============================================================================
    // Exports / controller surface
    // =============================================================================
    return {
      bind,
      loadPresets,
      handlePresetSelectionChange,
      handlePresetCreated,
      applyExternalWpm,
      getWpm: () => wpm,
      getSelectedPresetName: () => currentPresetName,
      getAllPresets: () => allPresetsCache.slice(),
    };
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.WpmControls = {
    createController,
  };
})();

// =============================================================================
// End of public/js/wpm_controls.js
// =============================================================================
