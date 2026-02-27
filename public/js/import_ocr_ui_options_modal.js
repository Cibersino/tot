'use strict';

(() => {
  function createImportOcrUiOptionsModal({ refs, state, t, msg, shared, resolvePreferredOcrLanguage }) {
    if (!refs || !state || typeof t !== 'function' || typeof msg !== 'function' || !shared || typeof resolvePreferredOcrLanguage !== 'function') {
      throw new Error('[import-ocr-ui.options] missing dependencies');
    }

    const {
      ocrOptionsModal,
      ocrPresetSelect,
      ocrLanguageSelect,
      ocrDpiInput,
      ocrTimeoutInput,
      ocrPreprocessSelect,
      ocrOptionsContext,
      ocrPresetGuidance,
      ocrTotalGuidance,
      ocrTotalDisclaimer,
    } = refs;

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

    function getSelectedOcrPreprocess() {
      const value = ocrPreprocessSelect && typeof ocrPreprocessSelect.value === 'string'
        ? ocrPreprocessSelect.value
        : '';
      return shared.normalizePreprocessProfile(value, 'standard');
    }

    function syncOcrCustomControlState() {
      const isCustom = getSelectedOcrPresetKey() === 'custom';
      if (ocrDpiInput) ocrDpiInput.disabled = !isCustom;
      if (ocrTimeoutInput) ocrTimeoutInput.disabled = !isCustom;
      if (ocrPreprocessSelect) ocrPreprocessSelect.disabled = !isCustom;
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
      if (ocrPreprocessSelect) ocrPreprocessSelect.value = cfg.preprocess;
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
        if (ocrPreprocessSelect) ocrPreprocessSelect.value = getSelectedOcrPreprocess();
        return;
      }
      applyPresetValuesToControls(preset);
    }

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
        const fastEstimate = shared.estimateTotalSecPerPage(shared.OCR_PRESET_VALUES.fast.dpi, shared.OCR_PRESET_VALUES.fast.preprocess);
        const balancedEstimate = shared.estimateTotalSecPerPage(shared.OCR_PRESET_VALUES.balanced.dpi, shared.OCR_PRESET_VALUES.balanced.preprocess);
        const highEstimate = shared.estimateTotalSecPerPage(
          shared.OCR_PRESET_VALUES.high_accuracy.dpi,
          shared.OCR_PRESET_VALUES.high_accuracy.preprocess
        );
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
      let estimatePreprocess = shared.OCR_PRESET_VALUES.balanced.preprocess;
      if (preset === 'custom') {
        estimateDpi = shared.normalizeDpiValue(
          ocrDpiInput ? ocrDpiInput.value : estimateDpi,
          estimateDpi
        );
        estimatePreprocess = getSelectedOcrPreprocess();
      } else {
        const cfg = shared.getOcrPresetConfig(preset);
        estimateDpi = cfg.dpi;
        estimatePreprocess = cfg.preprocess;
      }

      const pages = shared.getSafeOcrPageCount(state.ocrOptionsPageCount);
      const totalSec = shared.estimateTotalSecForPages(pages, estimateDpi, estimatePreprocess);
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
      let preprocessProfile = shared.OCR_PRESET_VALUES.balanced.preprocess;

      if (preset === 'custom') {
        dpi = shared.normalizeDpiValue(
          ocrDpiInput ? ocrDpiInput.value : dpi,
          dpi
        );
        timeoutPerPageSec = shared.normalizeTimeoutPerPageSec(
          ocrTimeoutInput ? ocrTimeoutInput.value : timeoutPerPageSec,
          timeoutPerPageSec
        );
        preprocessProfile = getSelectedOcrPreprocess();
      } else {
        const cfg = shared.getOcrPresetConfig(preset);
        dpi = cfg.dpi;
        timeoutPerPageSec = cfg.timeoutPerPageSec;
        preprocessProfile = cfg.preprocess;
      }

      return {
        qualityPreset: preset,
        preset,
        ocrLanguage: language,
        languageTag: language,
        dpi,
        timeoutPerPageSec,
        preprocessProfile,
      };
    }

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
      resolve({
        confirmed: true,
        options: collectNormalizedOcrOptions(),
      });
    }

    function promptOcrOptionsDialog({ kind, filename, pageCountHint, availableUiLanguages }) {
      const availableLanguages = shared.normalizeAvailableUiLanguages(availableUiLanguages);
      const preferredLanguage = resolvePreferredOcrLanguage(availableLanguages);
      if (
        !ocrOptionsModal
        || !ocrPresetSelect
        || !ocrLanguageSelect
        || !ocrDpiInput
        || !ocrTimeoutInput
        || !ocrPreprocessSelect
        || !refs.btnOcrOptionsStart
        || !refs.btnOcrOptionsAbort
      ) {
        if (!preferredLanguage) {
          return Promise.resolve({ confirmed: false, options: null });
        }
        return Promise.resolve({
          confirmed: true,
          options: {
            qualityPreset: 'balanced',
            preset: 'balanced',
            ocrLanguage: preferredLanguage,
            languageTag: preferredLanguage,
            dpi: shared.OCR_PRESET_VALUES.balanced.dpi,
            timeoutPerPageSec: shared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
            preprocessProfile: shared.OCR_PRESET_VALUES.balanced.preprocess,
          },
        });
      }
      if (!preferredLanguage) {
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
      ocrPreprocessSelect.value = shared.OCR_PRESET_VALUES.balanced.preprocess;

      syncOcrCustomControlState();
      updateOcrOptionsContextText();
      updateOcrOptionsGuidanceText();

      showOcrOptionsModal();
      return new Promise((resolve) => {
        state.ocrOptionsResolve = resolve;
      });
    }

    return {
      promptOcrOptionsDialog,
      settleOcrOptions,
      getSelectedOcrPresetKey,
      getSelectedOcrPreprocess,
      syncOcrCustomControlState,
      applyPresetValuesToControls,
      normalizeOcrControlValues,
      updateOcrOptionsContextText,
      updateOcrOptionsGuidanceText,
    };
  }

  window.createImportOcrUiOptionsModal = createImportOcrUiOptionsModal;
})();
