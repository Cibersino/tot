// public/js/wpm_controls.js
'use strict';

// =============================================================================
// WPM controls
// =============================================================================
// Responsibilities:
// - Own main-renderer WPM controls state (current WPM + preset selection).
// - Keep WPM input, slider, preset select, and description in sync.
// - Apply WPM changes from presets, manual edits, and external feature callbacks.
// - Delegate preset catalog/selection resolution to RendererPresets.

(() => {
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

  function clampWpm(rawValue) {
    const numeric = Number(rawValue);
    const safe = Number.isFinite(numeric) ? Math.round(numeric) : WPM_MIN;
    return Math.min(Math.max(safe, WPM_MIN), WPM_MAX);
  }

  function createController({
    wpmInput,
    wpmSlider,
    presetsSelect,
    presetDescription,
  } = {}) {
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
        log.warnOnce(
          'BOOTSTRAP:renderer.wpmCurve.createMapperFromConstants.failed',
          '[renderer] WpmCurve.createMapperFromConstants failed; using linear slider mapping.',
          err
        );
      }
    }

    if (!wpmCurveMapper) {
      if (!hasWpmCurveFactory) {
        log.warnOnce(
          'BOOTSTRAP:renderer.wpmCurve.unavailable',
          '[renderer] WpmCurve unavailable; using linear slider mapping.'
        );
      } else if (!wpmCurveFactoryFailed) {
        log.warnOnce(
          'BOOTSTRAP:renderer.wpmCurve.mapper.invalid',
          '[renderer] WpmCurve mapper invalid; using linear slider mapping.'
        );
      }
    }

    let wpm = WPM_MIN;
    let currentPresetName = null;
    let allPresetsCache = [];
    let listenersBound = false;

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

    function wpmFromSliderControl(rawControl) {
      if (wpmCurveMapper) {
        if (typeof wpmCurveMapper.wpmFromControl !== 'function') {
          log.warnOnce(
            'renderer.wpmCurve.wpmFromControl.unavailable',
            '[renderer] WpmCurve.wpmFromControl unavailable; using linear slider mapping.'
          );
          wpmCurveMapper = null;
          return clampWpm(rawControl);
        }
        try {
          return clampWpm(wpmCurveMapper.wpmFromControl(rawControl));
        } catch (err) {
          log.warnOnce(
            'renderer.wpmCurve.wpmFromControl.failed',
            '[renderer] WpmCurve.wpmFromControl failed; using linear slider mapping.',
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
          log.warnOnce(
            'renderer.wpmCurve.controlFromWpm.unavailable',
            '[renderer] WpmCurve.controlFromWpm unavailable; using linear slider mapping.'
          );
          wpmCurveMapper = null;
          return clampWpm(rawWpm);
        }
        try {
          return wpmCurveMapper.controlFromWpm(rawWpm);
        } catch (err) {
          log.warnOnce(
            'renderer.wpmCurve.controlFromWpm.failed',
            '[renderer] WpmCurve.controlFromWpm failed; using linear slider mapping.',
            err
          );
          wpmCurveMapper = null;
        }
      }
      return clampWpm(rawWpm);
    }

    function syncWpmControls(rawWpm) {
      const normalizedWpm = clampWpm(rawWpm);
      if (wpmInput) wpmInput.value = String(normalizedWpm);
      if (wpmSlider) wpmSlider.value = String(sliderControlFromWpm(normalizedWpm));
      return normalizedWpm;
    }

    function applyPresetUiSelection(preset) {
      if (presetsSelect && preset && preset.name) {
        presetsSelect.value = preset.name;
      }
      if (presetDescription) {
        presetDescription.textContent = preset && preset.description ? preset.description : '';
      }
    }

    function applySelectedPreset(preset) {
      if (!preset) {
        currentPresetName = null;
        applyPresetUiSelection(null);
        return null;
      }
      currentPresetName = preset.name;
      applyPresetUiSelection(preset);
      wpm = syncWpmControls(preset.wpm);
      return preset;
    }

    function resetPresetSelection() {
      currentPresetName = null;
      if (presetsSelect) presetsSelect.selectedIndex = -1;
      if (presetDescription) presetDescription.textContent = '';
    }

    function resetPresetsState() {
      if (presetsSelect) presetsSelect.innerHTML = '';
      if (presetDescription) presetDescription.textContent = '';
      allPresetsCache = [];
      currentPresetName = null;
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

    async function reloadPresetsList({ settingsSnapshot, language, electronAPI } = {}) {
      if (!hasRendererPresetsCatalogBridge()) {
        log.warnOnce(
          'renderer.bridge.RendererPresets.loadPresetsIntoDom.unavailable',
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
        log.error('Error loading presets list:', err);
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
        log.warnOnce(
          'renderer.bridge.RendererPresets.resolvePresetSelection.unavailable',
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
        }
        return allPresetsCache;
      } catch (err) {
        log.error('Error loading presets:', err);
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
          log.warnOnce(
            'renderer.bridge.RendererPresets.resolvePresetSelection.unavailable',
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
        log.error('Error handling preset-created event:', err);
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
        log.warnOnce(
          'renderer.bridge.RendererPresets.resolvePresetSelection.unavailable',
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
        log.error('Error resolving preset selection:', err);
        return null;
      }
    }

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

    if (wpmSlider) {
      wpmSlider.min = String(WPM_MIN);
      wpmSlider.max = String(WPM_MAX);
      if (wpmCurveMapper) {
        try {
          if (Number.isFinite(wpmCurveMapper.controlStep) && wpmCurveMapper.controlStep > 0) {
            wpmSlider.step = String(wpmCurveMapper.controlStep);
          } else {
            log.warnOnce(
              'BOOTSTRAP:renderer.wpmCurve.controlStep.invalid',
              '[renderer] WpmCurve.controlStep invalid; using default slider step.'
            );
          }
        } catch (err) {
          log.warnOnce(
            'BOOTSTRAP:renderer.wpmCurve.controlStep.failed',
            '[renderer] WpmCurve.controlStep failed; using default slider step.',
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

  window.WpmControls = {
    createController,
  };
})();

// =============================================================================
// End of public/js/wpm_controls.js
// =============================================================================
