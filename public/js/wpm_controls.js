// public/js/wpm_controls.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-window WPM controls module.
// Responsibilities:
// - Own main-renderer WPM controls state (current WPM + preset selection).
// - Keep WPM input, slider, preset combobox, and description in sync.
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

  function isWpmInputInvalid(rawValue) {
    const numericValue = Number(rawValue);
    return !Number.isInteger(numericValue)
      || numericValue < WPM_MIN
      || numericValue > WPM_MAX;
  }

  // =============================================================================
  // Controller factory
  // =============================================================================
  function createController({
    wpmInput,
    wpmSlider,
    presetsCombobox,
    presetDescription,
    onPresetSelectionChanged,
  } = {}) {
    // Optional curve support should never block the control surface. If the mapper is missing or breaks, the controller falls back to linear mapping.
    const { WpmCurve } = window;
    const hasWpmCurveFactory = !!(
      WpmCurve && typeof WpmCurve.createMapperFromConstants === 'function'
    );
    let wpmCurveMapper = null;
    let wpmCurveFactoryFailed = false;

    if (hasWpmCurveFactory) {
      try {
        wpmCurveMapper = WpmCurve.createMapperFromConstants(AppConstants);
      } catch (error) {
        wpmCurveFactoryFailed = true;
        log.warn(
          'BOOTSTRAP: WpmCurve.createMapperFromConstants failed; using linear slider mapping.',
          error
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

    // Controller state is kept local so the main renderer owns only one source of truth for the active WPM and selected preset name.
    let wpm = WPM_MIN;
    let currentPresetName = null;
    let allPresetsCache = [];
    let listenersBound = false;

    function setWpmInputInvalidState(isInvalid) {
      if (!wpmInput) return;
      wpmInput.classList.toggle('is-invalid', isInvalid);
      wpmInput.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
    }

    // =============================================================================
    // RendererPresets helpers
    // =============================================================================
    function hasRendererPresetsCatalogBridge() {
      const rendererPresets = window.RendererPresets || {};
      return typeof rendererPresets.loadPresetsIntoCombobox === 'function';
    }

    function hasRendererPresetsSelectionBridge() {
      const rendererPresets = window.RendererPresets || {};
      return typeof rendererPresets.resolvePresetSelection === 'function';
    }

    function getRendererPresetsBridge() {
      return window.RendererPresets || {};
    }

    function applyPresetDescriptionText(descriptionText = '') {
      const rendererPresets = getRendererPresetsBridge();
      if (!presetDescription) return;
      if (typeof rendererPresets.applyPresetDescriptionText === 'function') {
        rendererPresets.applyPresetDescriptionText(presetDescription, descriptionText);
        return;
      }
      const fallbackText = typeof descriptionText === 'string'
        ? descriptionText
        : String(descriptionText || '');
      log.warnOnce(
        'wpm-controls.applyPresetDescriptionText.missing',
        '[wpm-controls] RendererPresets.applyPresetDescriptionText unavailable; using plain text fallback.'
      );
      presetDescription.textContent = fallbackText;
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
        } catch (error) {
          log.warn(
            'WpmCurve.wpmFromControl failed; using linear slider mapping.',
            error
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
        } catch (error) {
          log.warn(
            'WpmCurve.controlFromWpm failed; using linear slider mapping.',
            error
          );
          wpmCurveMapper = null;
        }
      }
      return clampWpm(rawWpm);
    }

    // Keep the text input and slider synchronized through one normalization path so presets and manual edits apply the same bounds.
    function syncWpmControls(rawWpm) {
      const normalizedWpm = clampWpm(rawWpm);
      if (wpmInput) {
        wpmInput.value = String(normalizedWpm);
        setWpmInputInvalidState(false);
      }
      if (wpmSlider) wpmSlider.value = String(sliderControlFromWpm(normalizedWpm));
      return normalizedWpm;
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

    // =============================================================================
    // Preset state helpers
    // =============================================================================
    function applyPresetUiSelection(preset) {
      if (presetsCombobox && preset && preset.name) {
        presetsCombobox.update({ value: preset.name });
      }
      applyPresetDescriptionText(preset && preset.description ? preset.description : '');
    }

    function notifyPresetSelectionChanged(preset) {
      if (typeof onPresetSelectionChanged === 'function') {
        onPresetSelectionChanged(preset || null);
      }
    }

    function applyPresetSelection(preset) {
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
      if (presetsCombobox) presetsCombobox.update({ value: '' });
      applyPresetDescriptionText('');
      notifyPresetSelectionChanged(null);
    }

    function resetPresetsState() {
      if (presetsCombobox) presetsCombobox.update({ options: [], value: '' });
      applyPresetDescriptionText('');
      allPresetsCache = [];
      currentPresetName = null;
      notifyPresetSelectionChanged(null);
      return allPresetsCache;
    }

    function normalizePresetName(name) {
      return typeof name === 'string' && name.trim()
        ? name.trim()
        : null;
    }

    // Preset outcomes describe the synchronous state transition applied after asynchronous resolution.
    function capturePresetState() {
      return {
        wpm,
        selectedPresetName: currentPresetName,
      };
    }

    function buildPresetResolutionOutcome(previousState) {
      const previousWpm = previousState.wpm;
      const normalizedPreviousSelectedPresetName = normalizePresetName(
        previousState.selectedPresetName
      );
      const nextSelectedPresetName = normalizePresetName(currentPresetName);
      return {
        previousWpm,
        nextWpm: wpm,
        wpmChanged: wpm !== previousWpm,
        previousSelectedPresetName: normalizedPreviousSelectedPresetName,
        nextSelectedPresetName,
        selectedPresetChanged: normalizedPreviousSelectedPresetName !== nextSelectedPresetName,
      };
    }

    function buildPresetFlowResult(previousState, presets) {
      return {
        presets,
        selectionOutcome: buildPresetResolutionOutcome(previousState),
      };
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
          'Preset list reload skipped because RendererPresets.loadPresetsIntoCombobox is unavailable.'
        );
        const stateBeforeReset = capturePresetState();
        return {
          presets: resetPresetsState(),
          stateBeforeReset,
        };
      }
      try {
        const { loadPresetsIntoCombobox } = getRendererPresetsBridge();
        const loadResult = await loadPresetsIntoCombobox({
          electronAPI,
          settings: settingsSnapshot,
          language,
          combobox: presetsCombobox
        });
        allPresetsCache = loadResult && loadResult.list ? loadResult.list.slice() : [];
        return {
          presets: allPresetsCache,
          stateBeforeReset: null,
        };
      } catch (error) {
        log.error('RendererPresets.loadPresetsIntoCombobox failed:', error);
        const stateBeforeReset = capturePresetState();
        return {
          presets: resetPresetsState(),
          stateBeforeReset,
        };
      }
    }

    async function loadPresets({
      settingsSnapshot,
      language,
      electronAPI,
    } = {}) {
      const previousPresetName = currentPresetName;
      let stateBeforeReloadReset = null;
      if (!hasRendererPresetsSelectionBridge()) {
        log.warn(
          'Preset selection skipped because RendererPresets.resolvePresetSelection is unavailable.'
        );
        const previousState = capturePresetState();
        const presets = resetPresetsState();
        return buildPresetFlowResult(previousState, presets);
      }
      try {
        const { resolvePresetSelection } = getRendererPresetsBridge();
        const reloadResult = await reloadPresetsList({ settingsSnapshot, language, electronAPI });
        stateBeforeReloadReset = reloadResult.stateBeforeReset;
        const selected = await resolvePresetSelection({
          list: allPresetsCache,
          settings: settingsSnapshot,
          language,
          currentPresetName,
          previousPresetName,
          combobox: presetsCombobox,
          presetDescription,
          electronAPI
        });
        const previousState = stateBeforeReloadReset || capturePresetState();
        applyPresetSelection(selected);
        return buildPresetFlowResult(previousState, allPresetsCache);
      } catch (error) {
        log.error('Preset loading failed:', error);
        const previousState = stateBeforeReloadReset || capturePresetState();
        const presets = resetPresetsState();
        return buildPresetFlowResult(previousState, presets);
      }
    }

    async function handlePresetCreated({
      preset,
      settingsSnapshot,
      language,
      electronAPI,
    } = {}) {
      const previousPresetName = currentPresetName;
      let stateBeforeReloadReset = null;
      try {
        const reloadResult = await reloadPresetsList({ settingsSnapshot, language, electronAPI });
        const { presets: updated } = reloadResult;
        stateBeforeReloadReset = reloadResult.stateBeforeReset;
        if (!hasRendererPresetsSelectionBridge()) {
          log.warn(
            'Preset-created selection sync skipped because RendererPresets.resolvePresetSelection is unavailable.'
          );
          return buildPresetFlowResult(stateBeforeReloadReset || capturePresetState(), updated);
        }
        const { resolvePresetSelection } = getRendererPresetsBridge();
        if (!preset || !preset.name) {
          return buildPresetFlowResult(stateBeforeReloadReset || capturePresetState(), updated);
        }
        const found = updated.find(item => item.name === preset.name);
        if (!found) {
          return buildPresetFlowResult(stateBeforeReloadReset || capturePresetState(), updated);
        }
        const neutralSettings = createPresetSelectionSettings(settingsSnapshot);
        const selected = await resolvePresetSelection({
          list: updated,
          settings: neutralSettings,
          language,
          currentPresetName: preset.name,
          previousPresetName,
          combobox: presetsCombobox,
          presetDescription,
          electronAPI
        });
        const previousState = stateBeforeReloadReset || capturePresetState();
        applyPresetSelection(selected);
        return buildPresetFlowResult(previousState, updated);
      } catch (error) {
        log.error('Preset-created reconciliation failed:', error);
        return buildPresetFlowResult(
          stateBeforeReloadReset || capturePresetState(),
          allPresetsCache
        );
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
      const name = presetsCombobox ? presetsCombobox.getValue() : '';
      if (!name) return null;

      const preset = allPresetsCache.find(item => item.name === name);
      if (!preset) return null;

      try {
        const { resolvePresetSelection } = getRendererPresetsBridge();
        const previousPresetName = currentPresetName;
        const settingsOverride = createPresetSelectionSettings(settingsSnapshot);
        const selected = await resolvePresetSelection({
          list: allPresetsCache,
          settings: settingsOverride,
          language,
          currentPresetName: preset.name,
          previousPresetName,
          combobox: presetsCombobox,
          presetDescription,
          electronAPI
        });
        if (selected) {
          const previousWpm = wpm;
          applyPresetSelection(selected);
          notifyWpmChanged(previousWpm, onWpmChanged, selected);
        }
        return selected;
      } catch (error) {
        log.error('Preset selection change failed:', error);
        return null;
      }
    }

    // =============================================================================
    // UI wiring
    // =============================================================================
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
        wpmInput.addEventListener('input', () => {
          setWpmInputInvalidState(isWpmInputInvalid(wpmInput.value));
        });
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

    // Apply DOM limits before the initial sync so the controls start from a valid visible state even before any preset load runs.
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
        } catch (error) {
          log.warn(
            'BOOTSTRAP: WpmCurve.controlStep failed; using default slider step.',
            error
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
      getWpm: () => wpm,
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
