// public/js/import_ocr_ui_options_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Build the OCR options modal controller for import_ocr_ui.js.
// - Normalize OCR option inputs (preset, language, dpi, timeout).
// - Render OCR context and guidance text for the current file and page count.
// - Resolve dialog outcomes as { confirmed, options } for upstream orchestration.
// - Expose window.createImportOcrUiOptionsModal for facade composition.

// =============================================================================
// Factory and dependency contract
// =============================================================================

(() => {
  function createImportOcrUiOptionsModal({ refs, state, t, msg, shared, resolvePreferredOcrLanguage }) {
    if (!refs || !state || typeof t !== 'function' || typeof msg !== 'function' || !shared || typeof resolvePreferredOcrLanguage !== 'function') {
      throw new Error('[import-ocr-ui.options] missing dependencies');
    }

    // =============================================================================
    // Logger and shared refs
    // =============================================================================
    const log = window.getLogger('import-ocr-ui.options');

    const {
      ocrOptionsModal,
      ocrPresetSelect,
      ocrLanguageSelect,
      ocrDpiInput,
      ocrTimeoutInput,
      ocrOptionsContext,
      ocrPresetGuidance,
      ocrTotalGuidance,
      ocrTotalDisclaimer,
      ocrEtaNote,
      ocrPreprocessModeNormalizeContrast,
      ocrPreprocessManualNormalizeContrast,
      ocrPreprocessNormalizeContrastBlackClipInput,
      ocrPreprocessNormalizeContrastWhiteClipInput,
      ocrPreprocessModeBinarize,
      ocrPreprocessManualBinarize,
      ocrPreprocessBinarizeThresholdInput,
      ocrPreprocessModeDenoise,
      ocrPreprocessManualDenoise,
      ocrPreprocessDenoisePassesInput,
      ocrPreprocessModeDeskew,
      ocrPreprocessManualDeskew,
      ocrPreprocessDeskewRangeInput,
      ocrPreprocessDeskewStepInput,
      ocrPreprocessModePageCleanup,
      ocrPreprocessManualPageCleanup,
      ocrPreprocessPageCleanupLevelSelect,
    } = refs;

    // =============================================================================
    // Helpers: language and preset controls
    // =============================================================================

    function getAvailableOcrLanguagesFromSelect() {
      if (!ocrLanguageSelect) return [];
      const values = [];
      const opts = ocrLanguageSelect.querySelectorAll('option');
      opts.forEach((opt) => {
        if (!opt) return;
        const value = String(opt.value || '').trim().toLowerCase();
        if (!value) return;
        values.push(value);
      });
      return Array.from(new Set(values));
    }

    function setOcrLanguageOptions(availableUiLanguages) {
      if (!ocrLanguageSelect) return [];
      const available = shared.normalizeAvailableUiLanguages(availableUiLanguages);
      ocrLanguageSelect.innerHTML = '';
      available.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        ocrLanguageSelect.appendChild(option);
      });
      return available;
    }

    function getSelectedOcrPresetKey() {
      const value = ocrPresetSelect && typeof ocrPresetSelect.value === 'string'
        ? ocrPresetSelect.value
        : '';
      return shared.normalizePresetKey(value, 'balanced');
    }

    function syncOcrCustomControlState() {
      const isCustom = getSelectedOcrPresetKey() === 'custom';
      if (ocrDpiInput) ocrDpiInput.disabled = !isCustom;
      if (ocrTimeoutInput) ocrTimeoutInput.disabled = !isCustom;
    }

    function applyPresetValuesToControls(presetKey) {
      const key = presetKey || 'balanced';
      if (key === 'custom') {
        syncOcrCustomControlState();
        return;
      }
      const cfg = shared.getOcrPresetConfig(key);
      if (ocrDpiInput) ocrDpiInput.value = String(cfg.dpi);
      if (ocrTimeoutInput) ocrTimeoutInput.value = String(cfg.timeoutPerPageSec);
      syncOcrCustomControlState();
    }

    function normalizeOcrControlValues() {
      const preset = getSelectedOcrPresetKey();
      if (preset === 'custom') {
        const normalizedDpi = shared.normalizeDpiValue(
          ocrDpiInput ? ocrDpiInput.value : shared.OCR_PRESET_VALUES.balanced.dpi,
          shared.OCR_PRESET_VALUES.balanced.dpi
        );
        const normalizedTimeout = shared.normalizeTimeoutPerPageSec(
          ocrTimeoutInput ? ocrTimeoutInput.value : shared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
          shared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec
        );
        if (ocrDpiInput) ocrDpiInput.value = String(normalizedDpi);
        if (ocrTimeoutInput) ocrTimeoutInput.value = String(normalizedTimeout);
        return;
      }
      applyPresetValuesToControls(preset);
    }

    const PREPROCESS_OPERATION_UI = Object.freeze({
      normalize_contrast: Object.freeze({
        modeSelect: ocrPreprocessModeNormalizeContrast,
        manualContainer: ocrPreprocessManualNormalizeContrast,
        manualFields: Object.freeze({
          blackClipPct: ocrPreprocessNormalizeContrastBlackClipInput,
          whiteClipPct: ocrPreprocessNormalizeContrastWhiteClipInput,
        }),
      }),
      binarize: Object.freeze({
        modeSelect: ocrPreprocessModeBinarize,
        manualContainer: ocrPreprocessManualBinarize,
        manualFields: Object.freeze({
          thresholdPct: ocrPreprocessBinarizeThresholdInput,
        }),
      }),
      denoise: Object.freeze({
        modeSelect: ocrPreprocessModeDenoise,
        manualContainer: ocrPreprocessManualDenoise,
        manualFields: Object.freeze({
          passes: ocrPreprocessDenoisePassesInput,
        }),
      }),
      deskew: Object.freeze({
        modeSelect: ocrPreprocessModeDeskew,
        manualContainer: ocrPreprocessManualDeskew,
        manualFields: Object.freeze({
          scanRangeDeg: ocrPreprocessDeskewRangeInput,
          scanStepDeg: ocrPreprocessDeskewStepInput,
        }),
      }),
      page_cleanup: Object.freeze({
        modeSelect: ocrPreprocessModePageCleanup,
        manualContainer: ocrPreprocessManualPageCleanup,
        manualFields: Object.freeze({
          cleanLevel: ocrPreprocessPageCleanupLevelSelect,
        }),
      }),
    });

    function resetPreprocessControlsForNewRun() {
      const defaults = shared.PREPROCESS_MANUAL_DEFAULTS || {};
      (shared.PREPROCESS_OPERATION_ORDER || []).forEach((operationKey) => {
        const operationUi = PREPROCESS_OPERATION_UI[operationKey];
        if (!operationUi) return;
        const modeSelect = operationUi.modeSelect;
        if (modeSelect) modeSelect.value = 'off';
        const manualDefaults = defaults[operationKey] || {};
        const manualFields = operationUi.manualFields || {};
        Object.keys(manualFields).forEach((fieldKey) => {
          const fieldControl = manualFields[fieldKey];
          if (!fieldControl) return;
          const fallbackValue = manualDefaults[fieldKey];
          if (fallbackValue === undefined || fallbackValue === null) return;
          fieldControl.value = String(fallbackValue);
        });
      });
      syncPreprocessControlState();
    }

    function setAllPreprocessOperationsOff() {
      (shared.PREPROCESS_OPERATION_ORDER || []).forEach((operationKey) => {
        const operationUi = PREPROCESS_OPERATION_UI[operationKey];
        if (!operationUi || !operationUi.modeSelect) return;
        operationUi.modeSelect.value = 'off';
      });
      syncPreprocessControlState();
    }

    function syncPreprocessControlState() {
      (shared.PREPROCESS_OPERATION_ORDER || []).forEach((operationKey) => {
        const operationUi = PREPROCESS_OPERATION_UI[operationKey];
        if (!operationUi) return;
        const modeSelect = operationUi.modeSelect;
        const mode = shared.normalizePreprocessMode(modeSelect ? modeSelect.value : '', 'off');
        const manualVisible = mode === 'manual';
        const manualContainer = operationUi.manualContainer;
        if (manualContainer) {
          manualContainer.hidden = !manualVisible;
        }
        const manualFields = operationUi.manualFields || {};
        Object.keys(manualFields).forEach((fieldKey) => {
          const fieldControl = manualFields[fieldKey];
          if (!fieldControl) return;
          fieldControl.disabled = !manualVisible;
        });
      });
    }

    function normalizePreprocessControlValues() {
      const manualRules = shared.PREPROCESS_OPERATION_MANUAL_RULES || {};
      const manualDefaults = shared.PREPROCESS_MANUAL_DEFAULTS || {};
      (shared.PREPROCESS_OPERATION_ORDER || []).forEach((operationKey) => {
        const operationUi = PREPROCESS_OPERATION_UI[operationKey];
        if (!operationUi) return;
        const modeSelect = operationUi.modeSelect;
        const mode = shared.normalizePreprocessMode(modeSelect ? modeSelect.value : '', 'off');
        if (modeSelect) modeSelect.value = mode;
        if (mode !== 'manual') return;

        const operationRules = manualRules[operationKey] || {};
        const operationDefaults = manualDefaults[operationKey] || {};
        const manualFields = operationUi.manualFields || {};
        Object.keys(operationRules).forEach((fieldKey) => {
          const fieldControl = manualFields[fieldKey];
          if (!fieldControl) return;
          const normalizedValue = shared.normalizePreprocessManualField(
            fieldControl.value,
            operationRules[fieldKey],
            operationDefaults[fieldKey]
          );
          fieldControl.value = String(normalizedValue);
        });
      });
      syncPreprocessControlState();
    }

    function collectNormalizedPreprocessConfig() {
      const rawOperations = {};
      const manualRules = shared.PREPROCESS_OPERATION_MANUAL_RULES || {};
      (shared.PREPROCESS_OPERATION_ORDER || []).forEach((operationKey) => {
        const operationUi = PREPROCESS_OPERATION_UI[operationKey];
        const mode = shared.normalizePreprocessMode(
          operationUi && operationUi.modeSelect ? operationUi.modeSelect.value : '',
          'off'
        );
        const opPayload = { mode };
        if (mode === 'manual') {
          const operationRules = manualRules[operationKey] || {};
          const manualFields = operationUi && operationUi.manualFields ? operationUi.manualFields : {};
          const manualPayload = {};
          Object.keys(operationRules).forEach((fieldKey) => {
            const fieldControl = manualFields[fieldKey];
            manualPayload[fieldKey] = fieldControl ? fieldControl.value : undefined;
          });
          opPayload.manual = manualPayload;
        }
        rawOperations[operationKey] = opPayload;
      });
      return shared.normalizePreprocessConfig({
        operations: rawOperations,
      });
    }

    // =============================================================================
    // Helpers: context, guidance, and option payload shaping
    // =============================================================================

    function updateOcrOptionsContextText() {
      if (!ocrOptionsContext) return;
      const filename = state.ocrOptionsFilename || '';
      if (state.ocrOptionsFileKind === 'image') {
        ocrOptionsContext.textContent = msg(
          'renderer.main.ocr_options.context_image',
          { filename },
          filename ? `File: ${filename} - image OCR` : 'Image OCR'
        );
        return;
      }
      if (state.ocrOptionsFileKind === 'pdf') {
        ocrOptionsContext.textContent = msg(
          'renderer.main.ocr_options.context_pdf_scanned',
          { filename },
          filename ? `File: ${filename} - scanned PDF OCR` : 'Scanned PDF OCR'
        );
        return;
      }
      ocrOptionsContext.textContent = msg(
        'renderer.main.ocr_options.context_generic',
        { filename },
        filename ? `File: ${filename}` : 'OCR'
      );
    }

    function updateOcrOptionsGuidanceText() {
      if (ocrPresetGuidance) {
        const fastEstimate = shared.estimateTotalSecPerPage(shared.OCR_PRESET_VALUES.fast.dpi);
        const balancedEstimate = shared.estimateTotalSecPerPage(shared.OCR_PRESET_VALUES.balanced.dpi);
        const highEstimate = shared.estimateTotalSecPerPage(shared.OCR_PRESET_VALUES.high_accuracy.dpi);
        ocrPresetGuidance.textContent = msg(
          'renderer.main.ocr_options.guidance_presets',
          {
            fast: shared.formatSecPerPageForGuidance(fastEstimate),
            balanced: shared.formatSecPerPageForGuidance(balancedEstimate),
            high: shared.formatSecPerPageForGuidance(highEstimate),
          },
          `Fast ~${shared.formatSecPerPageForGuidance(fastEstimate)}s/page · Balanced ~${shared.formatSecPerPageForGuidance(balancedEstimate)}s/page · High accuracy ~${shared.formatSecPerPageForGuidance(highEstimate)}s/page`
        );
      }

      const preset = getSelectedOcrPresetKey();
      let estimateDpi = shared.OCR_PRESET_VALUES.balanced.dpi;
      if (preset === 'custom') {
        estimateDpi = shared.normalizeDpiValue(
          ocrDpiInput ? ocrDpiInput.value : estimateDpi,
          estimateDpi
        );
      } else {
        const cfg = shared.getOcrPresetConfig(preset);
        estimateDpi = cfg.dpi;
      }

      const pages = shared.getSafeOcrPageCount(state.ocrOptionsPageCount);
      const totalSec = shared.estimateTotalSecForPages(pages, estimateDpi);
      if (ocrTotalGuidance) {
        ocrTotalGuidance.textContent = msg(
          'renderer.main.ocr_options.guidance_total',
          {
            total: shared.formatDurationFromSeconds(totalSec),
            pages,
          },
          `Estimated total: ~${shared.formatDurationFromSeconds(totalSec)} for ${pages} page(s)`
        );
      }
      if (ocrTotalDisclaimer) {
        ocrTotalDisclaimer.textContent = t(
          'renderer.main.ocr_options.guidance_disclaimer',
          '(approximate, depends on document complexity and device performance)'
        );
      }
      if (ocrEtaNote) {
        ocrEtaNote.textContent = t(
          'renderer.main.ocr_options.guidance_eta_note',
          'ETA may rise during the first pages while per-page speed stabilizes.'
        );
      }
    }

    function collectNormalizedOcrOptions() {
      const preset = getSelectedOcrPresetKey();
      const availableUiLanguages = getAvailableOcrLanguagesFromSelect();
      const langRaw = ocrLanguageSelect && typeof ocrLanguageSelect.value === 'string'
        ? ocrLanguageSelect.value.trim().toLowerCase()
        : '';
      const language = availableUiLanguages.includes(langRaw)
        ? langRaw
        : resolvePreferredOcrLanguage(availableUiLanguages);

      let dpi = shared.OCR_PRESET_VALUES.balanced.dpi;
      let timeoutPerPageSec = shared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec;

      if (preset === 'custom') {
        dpi = shared.normalizeDpiValue(
          ocrDpiInput ? ocrDpiInput.value : dpi,
          dpi
        );
        timeoutPerPageSec = shared.normalizeTimeoutPerPageSec(
          ocrTimeoutInput ? ocrTimeoutInput.value : timeoutPerPageSec,
          timeoutPerPageSec
        );
      } else {
        const cfg = shared.getOcrPresetConfig(preset);
        dpi = cfg.dpi;
        timeoutPerPageSec = cfg.timeoutPerPageSec;
      }

      return {
        qualityPreset: preset,
        preset,
        ocrLanguage: language,
        languageTag: language,
        dpi,
        timeoutPerPageSec,
        preprocessConfig: collectNormalizedPreprocessConfig(),
      };
    }

    // =============================================================================
    // Modal visibility and settle flow
    // =============================================================================

    function showOcrOptionsModal() {
      if (!ocrOptionsModal) return;
      ocrOptionsModal.setAttribute('aria-hidden', 'false');
      if (ocrPresetSelect && typeof ocrPresetSelect.focus === 'function') {
        ocrPresetSelect.focus();
      }
    }

    function hideOcrOptionsModal() {
      if (!ocrOptionsModal) return;
      ocrOptionsModal.setAttribute('aria-hidden', 'true');
    }

    function settleOcrOptions(confirmed) {
      const resolve = state.ocrOptionsResolve;
      state.ocrOptionsResolve = null;
      hideOcrOptionsModal();
      if (typeof resolve !== 'function') return;
      if (!confirmed) {
        resolve({ confirmed: false, options: null });
        return;
      }
      normalizeOcrControlValues();
      normalizePreprocessControlValues();
      resolve({
        confirmed: true,
        options: collectNormalizedOcrOptions(),
      });
    }

    // =============================================================================
    // Public entrypoint: prompt flow with fallback outcomes
    // =============================================================================

    function promptOcrOptionsDialog({ kind, filename, pageCountHint, availableUiLanguages }) {
      const availableLanguages = shared.normalizeAvailableUiLanguages(availableUiLanguages);
      const preferredLanguage = resolvePreferredOcrLanguage(availableLanguages);
      if (
        !ocrOptionsModal
        || !ocrPresetSelect
        || !ocrLanguageSelect
        || !ocrDpiInput
        || !ocrTimeoutInput
        || !refs.btnOcrOptionsStart
        || !refs.btnOcrOptionsAbort
      ) {
        if (!preferredLanguage) {
          log.warnOnce(
            'import-ocr-ui.options.modal-unavailable.cancel-no-language',
            'OCR options modal unavailable; dialog canceled because preferred OCR language is unavailable.'
          );
          return Promise.resolve({ confirmed: false, options: null });
        }
        log.warnOnce(
          'import-ocr-ui.options.modal-unavailable.fallback-defaults',
          'OCR options modal unavailable; using balanced OCR defaults.'
        );
        return Promise.resolve({
          confirmed: true,
          options: {
            qualityPreset: 'balanced',
            preset: 'balanced',
            ocrLanguage: preferredLanguage,
            languageTag: preferredLanguage,
            dpi: shared.OCR_PRESET_VALUES.balanced.dpi,
            timeoutPerPageSec: shared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
            preprocessConfig: shared.buildDefaultPreprocessConfig(),
          },
        });
      }
      if (!preferredLanguage) {
        log.warnOnce(
          'import-ocr-ui.options.language-unavailable.cancel',
          'OCR options dialog canceled because preferred OCR language is unavailable.'
        );
        return Promise.resolve({ confirmed: false, options: null });
      }

      if (state.ocrOptionsResolve) settleOcrOptions(false);

      state.ocrOptionsPageCount = shared.getSafeOcrPageCount(pageCountHint);
      state.ocrOptionsFileKind = String(kind || '').trim().toLowerCase();
      state.ocrOptionsFilename = String(filename || '').trim();

      ocrPresetSelect.value = 'balanced';
      setOcrLanguageOptions(availableLanguages);
      ocrLanguageSelect.value = preferredLanguage;
      ocrDpiInput.value = String(shared.OCR_PRESET_VALUES.balanced.dpi);
      ocrTimeoutInput.value = String(shared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec);

      syncOcrCustomControlState();
      resetPreprocessControlsForNewRun();
      updateOcrOptionsContextText();
      updateOcrOptionsGuidanceText();

      showOcrOptionsModal();
      return new Promise((resolve) => {
        state.ocrOptionsResolve = resolve;
      });
    }

    // =============================================================================
    // Module surface
    // =============================================================================

    return {
      promptOcrOptionsDialog,
      settleOcrOptions,
      getSelectedOcrPresetKey,
      syncOcrCustomControlState,
      applyPresetValuesToControls,
      normalizeOcrControlValues,
      updateOcrOptionsContextText,
      updateOcrOptionsGuidanceText,
      resetPreprocessControlsForNewRun,
      setAllPreprocessOperationsOff,
      syncPreprocessControlState,
      normalizePreprocessControlValues,
      collectNormalizedPreprocessConfig,
    };
  }

  // =============================================================================
  // Export
  // =============================================================================
  window.createImportOcrUiOptionsModal = createImportOcrUiOptionsModal;
})();

// =============================================================================
// End of public/js/import_ocr_ui_options_modal.js
// =============================================================================
