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
    const wpmCurveMapper = (
      WpmCurve && typeof WpmCurve.createMapperFromConstants === 'function'
    )
      ? WpmCurve.createMapperFromConstants(AppConstants)
      : null;

    if (!wpmCurveMapper) {
      log.warnOnce(
        'renderer.wpmCurve.unavailable',
        '[renderer] WpmCurve unavailable; using linear slider mapping.'
      );
    }

    let wpm = WPM_MIN;
    let currentPresetName = null;
    let allPresetsCache = [];
    let listenersBound = false;

    function hasRendererPresetsBridge() {
      const rendererPresets = window.RendererPresets || {};
      return (
        typeof rendererPresets.loadPresetsIntoDom === 'function' &&
        typeof rendererPresets.resolvePresetSelection === 'function'
      );
    }

    function getRendererPresetsBridge() {
      return window.RendererPresets || {};
    }

    function wpmFromSliderControl(rawControl) {
      if (wpmCurveMapper && typeof wpmCurveMapper.wpmFromControl === 'function') {
        return clampWpm(wpmCurveMapper.wpmFromControl(rawControl));
      }
      return clampWpm(rawControl);
    }

    function sliderControlFromWpm(rawWpm) {
      if (wpmCurveMapper && typeof wpmCurveMapper.controlFromWpm === 'function') {
        return wpmCurveMapper.controlFromWpm(rawWpm);
      }
      return clampWpm(rawWpm);
    }

    function updateWpmSliderProgress() {
      if (!wpmSlider) return;
      const min = Number(wpmSlider.min);
      const max = Number(wpmSlider.max);
      const value = Number(wpmSlider.value);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(value)) {
        wpmSlider.style.setProperty('--wpm-slider-progress', '0%');
        return;
      }
      const normalizedProgress = Math.min(1, Math.max(0, (value - min) / (max - min)));
      wpmSlider.style.setProperty('--wpm-slider-progress', `${normalizedProgress * 100}%`);
    }

    function syncWpmControls(rawWpm) {
      const normalizedWpm = clampWpm(rawWpm);
      if (wpmInput) wpmInput.value = String(normalizedWpm);
      if (wpmSlider) wpmSlider.value = String(sliderControlFromWpm(normalizedWpm));
      updateWpmSliderProgress();
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

    async function reloadPresetsList({ settingsSnapshot, language, electronAPI } = {}) {
      if (!hasRendererPresetsBridge()) {
        log.warnOnce(
          'renderer.bridge.RendererPresets.reload.unavailable',
          'Preset list reload skipped because RendererPresets bridge is unavailable.'
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
      if (!hasRendererPresetsBridge()) {
        log.warnOnce(
          'renderer.bridge.RendererPresets.selection.unavailable',
          'Preset selection skipped because RendererPresets bridge is unavailable.'
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
          if (typeof onWpmChanged === 'function' && wpm !== previousWpm) {
            onWpmChanged(wpm, selected);
          }
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
      if (!hasRendererPresetsBridge()) {
        log.warnOnce(
          'renderer.bridge.RendererPresets.created.unavailable',
          'Preset-created sync skipped because RendererPresets bridge is unavailable.'
        );
        return allPresetsCache;
      }
      try {
        const { resolvePresetSelection } = getRendererPresetsBridge();
        const updated = await reloadPresetsList({ settingsSnapshot, language, electronAPI });
        if (!preset || !preset.name) return updated;
        const found = updated.find(item => item.name === preset.name);
        if (!found) return updated;
        const previousWpm = wpm;
        const neutralSettings = Object.assign({}, settingsSnapshot || {}, {
          selected_preset_by_language: {}
        });
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
          if (typeof onWpmChanged === 'function' && wpm !== previousWpm) {
            onWpmChanged(wpm, selected);
          }
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
      if (!hasRendererPresetsBridge()) {
        log.warnOnce(
          'renderer.bridge.RendererPresets.change.unavailable',
          'Preset change ignored because RendererPresets bridge is unavailable.'
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
        const settingsOverride = Object.assign({}, settingsSnapshot || {}, {
          selected_preset_by_language: {}
        });
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
          if (typeof onWpmChanged === 'function' && wpm !== previousWpm) {
            onWpmChanged(wpm, selected);
          }
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
      if (typeof onWpmChanged === 'function' && wpm !== previousWpm) {
        onWpmChanged(wpm);
      }
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
          updateWpmSliderProgress();
          wpm = wpmFromSliderControl(wpmSlider.value);
          if (wpmInput) wpmInput.value = String(wpm);
          resetPresetSelection();
          if (typeof onWpmChanged === 'function') onWpmChanged(wpm);
        });
      }

      if (wpmInput) {
        wpmInput.addEventListener('blur', () => {
          if (!canProceed('wpm-input-blur')) return;
          let requestedWpm = Number(wpmInput.value);
          if (isNaN(requestedWpm)) requestedWpm = wpmFromSliderControl(wpmSlider ? wpmSlider.value : WPM_MIN);
          wpm = syncWpmControls(requestedWpm);
          resetPresetSelection();
          if (typeof onWpmChanged === 'function') onWpmChanged(wpm);
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
      if (wpmCurveMapper && Number.isFinite(wpmCurveMapper.controlStep) && wpmCurveMapper.controlStep > 0) {
        wpmSlider.step = String(wpmCurveMapper.controlStep);
      }
      updateWpmSliderProgress();
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
