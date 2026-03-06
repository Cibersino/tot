// public/js/import_ocr_ui.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own OCR/import UI mutable state and startup guards.
// - Bind listeners once at facade level.
// - Compose focused OCR UI submodules.
// - Expose a single window.ImportOcrUi API for renderer orchestration.
// =============================================================================

(() => {
  // =============================================================================
  // DOM references
  // =============================================================================
  const btnCancelOcr = document.getElementById('btnCancelOcr');
  const ocrProgressPanel = document.getElementById('ocrProgressPanel');
  const ocrProgressText = document.getElementById('ocrProgressText');
  const ocrProgressStageText = document.getElementById('ocrProgressStage');
  const ocrProgressPagesText = document.getElementById('ocrProgressPages');
  const ocrProgressElapsedText = document.getElementById('ocrProgressElapsed');
  const ocrProgressEtaText = document.getElementById('ocrProgressEta');

  const importApplyModal = document.getElementById('importApplyModal');
  const importApplyBackdrop = document.getElementById('importApplyBackdrop');
  const importApplyTitle = document.getElementById('importApplyTitle');
  const importApplyContext = document.getElementById('importApplyContext');
  const importApplyRepeatRow = document.getElementById('importApplyRepeatRow');
  const importApplyRepeatLabel = document.getElementById('importApplyRepeatLabel');
  const importApplyRepeatInput = document.getElementById('importApplyRepeatInput');
  const btnImportApplyOverwrite = document.getElementById('btnImportApplyOverwrite');
  const btnImportApplyAppend = document.getElementById('btnImportApplyAppend');

  const ocrOptionsModal = document.getElementById('ocrOptionsModal');
  const ocrOptionsBackdrop = document.getElementById('ocrOptionsBackdrop');
  const ocrOptionsTitle = document.getElementById('ocrOptionsTitle');
  const ocrOptionsContext = document.getElementById('ocrOptionsContext');
  const ocrPresetLabel = document.getElementById('ocrPresetLabel');
  const ocrPresetSelect = document.getElementById('ocrPresetSelect');
  const ocrLanguageLabel = document.getElementById('ocrLanguageLabel');
  const ocrLanguageSelect = document.getElementById('ocrLanguageSelect');
  const ocrDpiLabel = document.getElementById('ocrDpiLabel');
  const ocrDpiInput = document.getElementById('ocrDpiInput');
  const ocrTimeoutLabel = document.getElementById('ocrTimeoutLabel');
  const ocrTimeoutInput = document.getElementById('ocrTimeoutInput');
  const ocrPresetGuidance = document.getElementById('ocrPresetGuidance');
  const ocrTotalGuidance = document.getElementById('ocrTotalGuidance');
  const ocrTotalDisclaimer = document.getElementById('ocrTotalDisclaimer');
  const ocrEtaNote = document.getElementById('ocrEtaNote');
  const btnOcrOptionsStart = document.getElementById('btnOcrOptionsStart');
  const btnOcrOptionsAbort = document.getElementById('btnOcrOptionsAbort');
  const ocrPreprocessTitle = document.getElementById('ocrPreprocessTitle');
  const ocrPreprocessHint = document.getElementById('ocrPreprocessHint');
  const btnOcrPreprocessAllOff = document.getElementById('btnOcrPreprocessAllOff');
  const ocrPreprocessLabelNormalizeContrast = document.getElementById('ocrPreprocessLabelNormalizeContrast');
  const ocrPreprocessModeNormalizeContrast = document.getElementById('ocrPreprocessModeNormalizeContrast');
  const ocrPreprocessManualNormalizeContrast = document.getElementById('ocrPreprocessManualNormalizeContrast');
  const ocrPreprocessNormalizeContrastBlackClipLabel = document.getElementById('ocrPreprocessNormalizeContrastBlackClipLabel');
  const ocrPreprocessNormalizeContrastBlackClipInput = document.getElementById('ocrPreprocessNormalizeContrastBlackClipInput');
  const ocrPreprocessNormalizeContrastWhiteClipLabel = document.getElementById('ocrPreprocessNormalizeContrastWhiteClipLabel');
  const ocrPreprocessNormalizeContrastWhiteClipInput = document.getElementById('ocrPreprocessNormalizeContrastWhiteClipInput');
  const ocrPreprocessLabelBinarize = document.getElementById('ocrPreprocessLabelBinarize');
  const ocrPreprocessModeBinarize = document.getElementById('ocrPreprocessModeBinarize');
  const ocrPreprocessManualBinarize = document.getElementById('ocrPreprocessManualBinarize');
  const ocrPreprocessBinarizeThresholdLabel = document.getElementById('ocrPreprocessBinarizeThresholdLabel');
  const ocrPreprocessBinarizeThresholdInput = document.getElementById('ocrPreprocessBinarizeThresholdInput');
  const ocrPreprocessLabelDenoise = document.getElementById('ocrPreprocessLabelDenoise');
  const ocrPreprocessModeDenoise = document.getElementById('ocrPreprocessModeDenoise');
  const ocrPreprocessManualDenoise = document.getElementById('ocrPreprocessManualDenoise');
  const ocrPreprocessDenoisePassesLabel = document.getElementById('ocrPreprocessDenoisePassesLabel');
  const ocrPreprocessDenoisePassesInput = document.getElementById('ocrPreprocessDenoisePassesInput');
  const ocrPreprocessLabelDeskew = document.getElementById('ocrPreprocessLabelDeskew');
  const ocrPreprocessModeDeskew = document.getElementById('ocrPreprocessModeDeskew');
  const ocrPreprocessManualDeskew = document.getElementById('ocrPreprocessManualDeskew');
  const ocrPreprocessDeskewRangeLabel = document.getElementById('ocrPreprocessDeskewRangeLabel');
  const ocrPreprocessDeskewRangeInput = document.getElementById('ocrPreprocessDeskewRangeInput');
  const ocrPreprocessDeskewStepLabel = document.getElementById('ocrPreprocessDeskewStepLabel');
  const ocrPreprocessDeskewStepInput = document.getElementById('ocrPreprocessDeskewStepInput');
  const ocrPreprocessLabelPageCleanup = document.getElementById('ocrPreprocessLabelPageCleanup');
  const ocrPreprocessModePageCleanup = document.getElementById('ocrPreprocessModePageCleanup');
  const ocrPreprocessManualPageCleanup = document.getElementById('ocrPreprocessManualPageCleanup');
  const ocrPreprocessPageCleanupLevelLabel = document.getElementById('ocrPreprocessPageCleanupLevelLabel');
  const ocrPreprocessPageCleanupLevelSelect = document.getElementById('ocrPreprocessPageCleanupLevelSelect');
  const ocrPreprocessPageCleanupLevelOption1 = document.getElementById('ocrPreprocessPageCleanupLevelOption1');
  const ocrPreprocessPageCleanupLevelOption2 = document.getElementById('ocrPreprocessPageCleanupLevelOption2');
  const ocrPreprocessPageCleanupLevelOption3 = document.getElementById('ocrPreprocessPageCleanupLevelOption3');

  // =============================================================================
  // Startup guards
  // =============================================================================
  const shared = window.ImportOcrUiShared;
  if (!shared) {
    throw new Error('[import-ocr-ui] ImportOcrUiShared unavailable; cannot continue');
  }
  const sharedBalancedPreset = shared.OCR_PRESET_VALUES && shared.OCR_PRESET_VALUES.balanced;
  if (!sharedBalancedPreset) {
    throw new Error('[import-ocr-ui] ImportOcrUiShared.OCR_PRESET_VALUES.balanced unavailable; cannot continue');
  }
  if (!Number.isFinite(Number(sharedBalancedPreset.dpi))) {
    throw new Error('[import-ocr-ui] ImportOcrUiShared.OCR_PRESET_VALUES.balanced.dpi invalid; cannot continue');
  }
  if (!Number.isFinite(Number(sharedBalancedPreset.timeoutPerPageSec))) {
    throw new Error('[import-ocr-ui] ImportOcrUiShared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec invalid; cannot continue');
  }
  if (typeof shared.normalizeLangBaseLocal !== 'function') {
    throw new Error('[import-ocr-ui] ImportOcrUiShared.normalizeLangBaseLocal unavailable; cannot continue');
  }
  if (typeof shared.normalizeAvailableUiLanguages !== 'function') {
    throw new Error('[import-ocr-ui] ImportOcrUiShared.normalizeAvailableUiLanguages unavailable; cannot continue');
  }
  if (typeof window.createImportOcrUiProgress !== 'function') {
    throw new Error('[import-ocr-ui] createImportOcrUiProgress unavailable; cannot continue');
  }
  if (typeof window.createImportOcrUiChoiceModal !== 'function') {
    throw new Error('[import-ocr-ui] createImportOcrUiChoiceModal unavailable; cannot continue');
  }
  if (typeof window.createImportOcrUiOptionsModal !== 'function') {
    throw new Error('[import-ocr-ui] createImportOcrUiOptionsModal unavailable; cannot continue');
  }

  const appMaxPasteRepeatRaw = Number(window.AppConstants && window.AppConstants.MAX_PASTE_REPEAT);
  if (!Number.isFinite(appMaxPasteRepeatRaw) || appMaxPasteRepeatRaw < 1) {
    throw new Error('[import-ocr-ui] AppConstants.MAX_PASTE_REPEAT unavailable; cannot continue');
  }
  const APP_MAX_PASTE_REPEAT = Math.floor(appMaxPasteRepeatRaw);

  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-ocr-ui] getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-ocr-ui');
  if (!log || typeof log.warn !== 'function' || typeof log.warnOnce !== 'function') {
    throw new Error('[import-ocr-ui] logger instance invalid; cannot continue');
  }

  // =============================================================================
  // Shared mutable state (single owner: facade)
  // =============================================================================
  const state = {
    lockActive: false,
    lockReason: '',

    ocrProgressJobId: '',
    ocrProgressStartedAt: 0,
    ocrProgressPageDone: 0,
    ocrProgressPageTotal: 0,
    ocrProgressStage: '',
    ocrQueuedJobMetaById: new Map(),
    ocrProgressMeta: {
      preset: 'balanced',
      dpi: shared.OCR_PRESET_VALUES.balanced.dpi,
      timeoutPerPageSec: shared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
    },
    ocrProgressEtaLabel: '--',

    choiceResolve: null,
    choiceDismissValue: '',
    choiceRepeatEnabled: false,
    choiceRepeatMin: 1,
    choiceRepeatMax: APP_MAX_PASTE_REPEAT,
    choiceRepeatStep: 1,
    choiceRepeatChangeHandler: null,

    ocrOptionsResolve: null,
    ocrOptionsPageCount: 1,
    ocrOptionsFileKind: '',
    ocrOptionsFilename: '',

    currentUiLanguage: 'en',
    defaultLanguage: 'en',
    tRendererFn: (_key, fallback = '') => fallback,
    msgRendererFn: null,
    listenersBound: false,
  };

  // =============================================================================
  // Initial DOM control defaults
  // =============================================================================
  if (importApplyRepeatInput) {
    importApplyRepeatInput.min = '1';
    importApplyRepeatInput.max = String(APP_MAX_PASTE_REPEAT);
    importApplyRepeatInput.step = '1';
  }

  // =============================================================================
  // i18n helpers and language resolution
  // =============================================================================
  function t(key, fallback = '') {
    try {
      if (typeof state.tRendererFn === 'function') return state.tRendererFn(key, fallback);
      log.warnOnce(
        'import-ocr-ui.i18n.tRenderer.non-function',
        'tRenderer unavailable; using fallback text.'
      );
      return fallback;
    } catch (err) {
      log.warnOnce(
        'import-ocr-ui.i18n.tRenderer.failed',
        'tRenderer failed; using fallback text.',
        err
      );
      return fallback;
    }
  }

  function msg(key, params = {}, fallback = '') {
    if (typeof state.msgRendererFn === 'function') {
      try {
        return state.msgRendererFn(key, params, fallback);
      } catch (err) {
        log.warnOnce(
          'import-ocr-ui.i18n.msgRenderer.failed',
          'msgRenderer failed; using fallback text.',
          err
        );
      }
    }
    let text = t(key, fallback);
    Object.keys(params || {}).forEach((k) => {
      text = String(text).replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k]));
    });
    return text;
  }

  function getDefaultOcrLanguageFromUi() {
    return shared.normalizeLangBaseLocal(state.currentUiLanguage || state.defaultLanguage || '');
  }

  function resolvePreferredOcrLanguage(availableUiLanguages) {
    const available = shared.normalizeAvailableUiLanguages(availableUiLanguages);
    if (!available.length) return '';

    const activeBase = shared.normalizeLangBaseLocal(state.currentUiLanguage || '');
    if (activeBase && available.includes(activeBase)) return activeBase;

    const fallbackBase = shared.normalizeLangBaseLocal(state.defaultLanguage || '');
    if (fallbackBase && available.includes(fallbackBase)) {
      if (activeBase && activeBase !== fallbackBase) {
        log.warn(
          'OCR language fallback applied (active unavailable):',
          { activeBase, fallbackBase }
        );
      }
      return fallbackBase;
    }

    const chosen = available[0];
    if (chosen && activeBase && activeBase !== chosen) {
      log.warn(
        'OCR language fallback applied (active/app-default unavailable):',
        { activeBase, chosen, available }
      );
    }
    return chosen;
  }

  const refs = {
    btnCancelOcr,
    ocrProgressPanel,
    ocrProgressText,
    ocrProgressStageText,
    ocrProgressPagesText,
    ocrProgressElapsedText,
    ocrProgressEtaText,
    importApplyModal,
    importApplyBackdrop,
    importApplyTitle,
    importApplyContext,
    importApplyRepeatRow,
    importApplyRepeatLabel,
    importApplyRepeatInput,
    btnImportApplyOverwrite,
    btnImportApplyAppend,
    ocrOptionsModal,
    ocrOptionsBackdrop,
    ocrOptionsTitle,
    ocrOptionsContext,
    ocrPresetLabel,
    ocrPresetSelect,
    ocrLanguageLabel,
    ocrLanguageSelect,
    ocrDpiLabel,
    ocrDpiInput,
    ocrTimeoutLabel,
    ocrTimeoutInput,
    ocrPresetGuidance,
    ocrTotalGuidance,
    ocrTotalDisclaimer,
    ocrEtaNote,
    btnOcrOptionsStart,
    btnOcrOptionsAbort,
    ocrPreprocessTitle,
    ocrPreprocessHint,
    btnOcrPreprocessAllOff,
    ocrPreprocessLabelNormalizeContrast,
    ocrPreprocessModeNormalizeContrast,
    ocrPreprocessManualNormalizeContrast,
    ocrPreprocessNormalizeContrastBlackClipLabel,
    ocrPreprocessNormalizeContrastBlackClipInput,
    ocrPreprocessNormalizeContrastWhiteClipLabel,
    ocrPreprocessNormalizeContrastWhiteClipInput,
    ocrPreprocessLabelBinarize,
    ocrPreprocessModeBinarize,
    ocrPreprocessManualBinarize,
    ocrPreprocessBinarizeThresholdLabel,
    ocrPreprocessBinarizeThresholdInput,
    ocrPreprocessLabelDenoise,
    ocrPreprocessModeDenoise,
    ocrPreprocessManualDenoise,
    ocrPreprocessDenoisePassesLabel,
    ocrPreprocessDenoisePassesInput,
    ocrPreprocessLabelDeskew,
    ocrPreprocessModeDeskew,
    ocrPreprocessManualDeskew,
    ocrPreprocessDeskewRangeLabel,
    ocrPreprocessDeskewRangeInput,
    ocrPreprocessDeskewStepLabel,
    ocrPreprocessDeskewStepInput,
    ocrPreprocessLabelPageCleanup,
    ocrPreprocessModePageCleanup,
    ocrPreprocessManualPageCleanup,
    ocrPreprocessPageCleanupLevelLabel,
    ocrPreprocessPageCleanupLevelSelect,
    ocrPreprocessPageCleanupLevelOption1,
    ocrPreprocessPageCleanupLevelOption2,
    ocrPreprocessPageCleanupLevelOption3,
  };

  // =============================================================================
  // Submodule composition
  // =============================================================================
  const progressUi = window.createImportOcrUiProgress({
    refs,
    state,
    t,
    shared,
  });

  const choiceModalUi = window.createImportOcrUiChoiceModal({
    refs,
    state,
    appMaxPasteRepeat: APP_MAX_PASTE_REPEAT,
  });

  const optionsModalUi = window.createImportOcrUiOptionsModal({
    refs,
    state,
    t,
    msg,
    shared,
    resolvePreferredOcrLanguage,
  });

  // =============================================================================
  // Public API methods consumed by renderer.js
  // =============================================================================
  function isOcrRoute(route) {
    return String(route || '').trim().toLowerCase().startsWith('ocr_');
  }

  function getDefaultRunOptions() {
    const language = getDefaultOcrLanguageFromUi();
    return {
      languageTag: language,
      timeoutPerPageSec: shared.OCR_PRESET_VALUES.balanced.timeoutPerPageSec,
    };
  }

  function setI18n({ tRenderer, msgRenderer } = {}) {
    if (typeof tRenderer === 'function') state.tRendererFn = tRenderer;
    if (typeof msgRenderer === 'function') state.msgRendererFn = msgRenderer;
  }

  function setLanguage({ uiLanguage, fallbackLanguage } = {}) {
    if (typeof uiLanguage === 'string' && uiLanguage.trim()) state.currentUiLanguage = uiLanguage.trim();
    if (typeof fallbackLanguage === 'string' && fallbackLanguage.trim()) state.defaultLanguage = fallbackLanguage.trim();
  }

  // =============================================================================
  // UI translation and listener wiring
  // =============================================================================
  function applyTranslations() {
    if (btnCancelOcr) {
      btnCancelOcr.textContent = t('renderer.main.buttons.cancel_ocr', btnCancelOcr.textContent || '');
      btnCancelOcr.title = t('renderer.main.tooltips.cancel_ocr', btnCancelOcr.title || '');
      const aria = t('renderer.main.aria.cancel_ocr', btnCancelOcr.title || btnCancelOcr.textContent || '');
      if (aria) btnCancelOcr.setAttribute('aria-label', aria);
    }
    if (ocrOptionsTitle) ocrOptionsTitle.textContent = t('renderer.main.ocr_options.title', ocrOptionsTitle.textContent || '');
    if (ocrPresetLabel) ocrPresetLabel.textContent = t('renderer.main.ocr_options.preset_label', ocrPresetLabel.textContent || '');
    if (ocrLanguageLabel) ocrLanguageLabel.textContent = t('renderer.main.ocr_options.language_label', ocrLanguageLabel.textContent || '');
    if (ocrDpiLabel) ocrDpiLabel.textContent = t('renderer.main.ocr_options.dpi_label', ocrDpiLabel.textContent || '');
    if (ocrTimeoutLabel) ocrTimeoutLabel.textContent = t('renderer.main.ocr_options.timeout_label', ocrTimeoutLabel.textContent || '');
    if (btnOcrOptionsStart) btnOcrOptionsStart.textContent = t('renderer.main.ocr_options.start', btnOcrOptionsStart.textContent || '');
    if (btnOcrOptionsAbort) btnOcrOptionsAbort.textContent = t('renderer.main.ocr_options.abort', btnOcrOptionsAbort.textContent || '');
    if (ocrPreprocessTitle) ocrPreprocessTitle.textContent = t('renderer.main.ocr_options.preprocess_title', ocrPreprocessTitle.textContent || '');
    if (ocrPreprocessHint) ocrPreprocessHint.textContent = t('renderer.main.ocr_options.preprocess_hint', ocrPreprocessHint.textContent || '');
    if (btnOcrPreprocessAllOff) btnOcrPreprocessAllOff.textContent = t('renderer.main.ocr_options.preprocess_set_all_off', btnOcrPreprocessAllOff.textContent || '');
    if (ocrPreprocessLabelNormalizeContrast) ocrPreprocessLabelNormalizeContrast.textContent = t('renderer.main.ocr_options.preprocess_normalize_contrast', ocrPreprocessLabelNormalizeContrast.textContent || '');
    if (ocrPreprocessLabelBinarize) ocrPreprocessLabelBinarize.textContent = t('renderer.main.ocr_options.preprocess_binarize', ocrPreprocessLabelBinarize.textContent || '');
    if (ocrPreprocessLabelDenoise) ocrPreprocessLabelDenoise.textContent = t('renderer.main.ocr_options.preprocess_denoise', ocrPreprocessLabelDenoise.textContent || '');
    if (ocrPreprocessLabelDeskew) ocrPreprocessLabelDeskew.textContent = t('renderer.main.ocr_options.preprocess_deskew', ocrPreprocessLabelDeskew.textContent || '');
    if (ocrPreprocessLabelPageCleanup) ocrPreprocessLabelPageCleanup.textContent = t('renderer.main.ocr_options.preprocess_page_cleanup', ocrPreprocessLabelPageCleanup.textContent || '');
    if (ocrPreprocessNormalizeContrastBlackClipLabel) ocrPreprocessNormalizeContrastBlackClipLabel.textContent = t('renderer.main.ocr_options.preprocess_black_clip_pct', ocrPreprocessNormalizeContrastBlackClipLabel.textContent || '');
    if (ocrPreprocessNormalizeContrastWhiteClipLabel) ocrPreprocessNormalizeContrastWhiteClipLabel.textContent = t('renderer.main.ocr_options.preprocess_white_clip_pct', ocrPreprocessNormalizeContrastWhiteClipLabel.textContent || '');
    if (ocrPreprocessBinarizeThresholdLabel) ocrPreprocessBinarizeThresholdLabel.textContent = t('renderer.main.ocr_options.preprocess_threshold_pct', ocrPreprocessBinarizeThresholdLabel.textContent || '');
    if (ocrPreprocessDenoisePassesLabel) ocrPreprocessDenoisePassesLabel.textContent = t('renderer.main.ocr_options.preprocess_passes', ocrPreprocessDenoisePassesLabel.textContent || '');
    if (ocrPreprocessDeskewRangeLabel) ocrPreprocessDeskewRangeLabel.textContent = t('renderer.main.ocr_options.preprocess_scan_range_deg', ocrPreprocessDeskewRangeLabel.textContent || '');
    if (ocrPreprocessDeskewStepLabel) ocrPreprocessDeskewStepLabel.textContent = t('renderer.main.ocr_options.preprocess_scan_step_deg', ocrPreprocessDeskewStepLabel.textContent || '');
    if (ocrPreprocessPageCleanupLevelLabel) ocrPreprocessPageCleanupLevelLabel.textContent = t('renderer.main.ocr_options.preprocess_clean_level', ocrPreprocessPageCleanupLevelLabel.textContent || '');
    if (ocrPreprocessPageCleanupLevelOption1) ocrPreprocessPageCleanupLevelOption1.textContent = t('renderer.main.ocr_options.preprocess_clean_level_1', ocrPreprocessPageCleanupLevelOption1.textContent || '');
    if (ocrPreprocessPageCleanupLevelOption2) ocrPreprocessPageCleanupLevelOption2.textContent = t('renderer.main.ocr_options.preprocess_clean_level_2', ocrPreprocessPageCleanupLevelOption2.textContent || '');
    if (ocrPreprocessPageCleanupLevelOption3) ocrPreprocessPageCleanupLevelOption3.textContent = t('renderer.main.ocr_options.preprocess_clean_level_3', ocrPreprocessPageCleanupLevelOption3.textContent || '');

    const preprocessModeSelects = [
      ocrPreprocessModeNormalizeContrast,
      ocrPreprocessModeBinarize,
      ocrPreprocessModeDenoise,
      ocrPreprocessModeDeskew,
      ocrPreprocessModePageCleanup,
    ];
    preprocessModeSelects.forEach((modeSelect) => {
      if (!modeSelect) return;
      const optOff = modeSelect.querySelector('option[value="off"]');
      const optAuto = modeSelect.querySelector('option[value="auto"]');
      const optManual = modeSelect.querySelector('option[value="manual"]');
      if (optOff) optOff.textContent = t('renderer.main.ocr_options.preprocess_mode_off', optOff.textContent || 'Off');
      if (optAuto) optAuto.textContent = t('renderer.main.ocr_options.preprocess_mode_auto', optAuto.textContent || 'Auto');
      if (optManual) optManual.textContent = t('renderer.main.ocr_options.preprocess_mode_manual', optManual.textContent || 'Manual');
    });

    if (ocrPresetSelect) {
      const optFast = ocrPresetSelect.querySelector('option[value="fast"]');
      const optBalanced = ocrPresetSelect.querySelector('option[value="balanced"]');
      const optHigh = ocrPresetSelect.querySelector('option[value="high_accuracy"]');
      const optCustom = ocrPresetSelect.querySelector('option[value="custom"]');
      if (optFast) optFast.textContent = t('renderer.main.ocr_options.preset_fast', optFast.textContent || 'Fast');
      if (optBalanced) optBalanced.textContent = t('renderer.main.ocr_options.preset_balanced', optBalanced.textContent || 'Balanced');
      if (optHigh) optHigh.textContent = t('renderer.main.ocr_options.preset_high_accuracy', optHigh.textContent || 'High accuracy');
      if (optCustom) optCustom.textContent = t('renderer.main.ocr_options.preset_custom', optCustom.textContent || 'Custom');
    }
    if (!state.lockActive && ocrProgressText) {
      progressUi.setOcrProgressFallbackText(t('renderer.main.import_apply.ocr_running', 'OCR in progress...'));
    }
    optionsModalUi.updateOcrOptionsContextText();
    optionsModalUi.updateOcrOptionsGuidanceText();
    optionsModalUi.syncPreprocessControlState();
  }

  function bindUiListeners() {
    if (state.listenersBound) return;
    state.listenersBound = true;

    if (ocrPresetSelect) {
      ocrPresetSelect.addEventListener('change', () => {
        optionsModalUi.applyPresetValuesToControls(optionsModalUi.getSelectedOcrPresetKey());
        optionsModalUi.normalizeOcrControlValues();
        optionsModalUi.updateOcrOptionsGuidanceText();
      });
    }

    if (ocrDpiInput) {
      ocrDpiInput.addEventListener('change', () => {
        optionsModalUi.normalizeOcrControlValues();
        optionsModalUi.updateOcrOptionsGuidanceText();
      });
    }

    if (ocrTimeoutInput) {
      ocrTimeoutInput.addEventListener('change', () => {
        optionsModalUi.normalizeOcrControlValues();
        optionsModalUi.updateOcrOptionsGuidanceText();
      });
    }

    const preprocessModeControls = [
      ocrPreprocessModeNormalizeContrast,
      ocrPreprocessModeBinarize,
      ocrPreprocessModeDenoise,
      ocrPreprocessModeDeskew,
      ocrPreprocessModePageCleanup,
    ];
    preprocessModeControls.forEach((modeControl) => {
      if (!modeControl) return;
      modeControl.addEventListener('change', () => {
        optionsModalUi.normalizePreprocessControlValues();
      });
    });

    const preprocessManualControls = [
      ocrPreprocessNormalizeContrastBlackClipInput,
      ocrPreprocessNormalizeContrastWhiteClipInput,
      ocrPreprocessBinarizeThresholdInput,
      ocrPreprocessDenoisePassesInput,
      ocrPreprocessDeskewRangeInput,
      ocrPreprocessDeskewStepInput,
      ocrPreprocessPageCleanupLevelSelect,
    ];
    preprocessManualControls.forEach((manualControl) => {
      if (!manualControl) return;
      manualControl.addEventListener('change', () => {
        optionsModalUi.normalizePreprocessControlValues();
      });
    });

    if (btnOcrPreprocessAllOff) {
      btnOcrPreprocessAllOff.addEventListener('click', () => {
        optionsModalUi.setAllPreprocessOperationsOff();
      });
    }

    if (btnOcrOptionsStart) {
      btnOcrOptionsStart.addEventListener('click', () => optionsModalUi.settleOcrOptions(true));
    }
    if (btnOcrOptionsAbort) {
      btnOcrOptionsAbort.addEventListener('click', () => optionsModalUi.settleOcrOptions(false));
    }
    if (ocrOptionsBackdrop) {
      ocrOptionsBackdrop.addEventListener('click', () => optionsModalUi.settleOcrOptions(false));
    }

    if (btnImportApplyOverwrite) {
      btnImportApplyOverwrite.addEventListener('click', () => {
        choiceModalUi.settleChoice(btnImportApplyOverwrite.dataset.returnValue || '');
      });
    }
    if (btnImportApplyAppend) {
      btnImportApplyAppend.addEventListener('click', () => {
        choiceModalUi.settleChoice(btnImportApplyAppend.dataset.returnValue || '');
      });
    }
    if (importApplyRepeatInput) {
      importApplyRepeatInput.addEventListener('input', () => {
        if (!state.choiceRepeatEnabled) return;
        const raw = String(importApplyRepeatInput.value || '').trim();
        if (!raw) return;
        const repeatCount = choiceModalUi.normalizeChoiceRepeatValue(raw);
        choiceModalUi.notifyChoiceRepeatChange(repeatCount);
      });
      importApplyRepeatInput.addEventListener('change', () => {
        if (!state.choiceRepeatEnabled) return;
        const repeatCount = choiceModalUi.normalizeChoiceRepeatValue(importApplyRepeatInput.value);
        importApplyRepeatInput.value = String(repeatCount);
        choiceModalUi.notifyChoiceRepeatChange(repeatCount);
      });
    }
    if (importApplyBackdrop) {
      importApplyBackdrop.addEventListener('click', () => choiceModalUi.settleChoice(state.choiceDismissValue));
    }

    document.addEventListener('keydown', (event) => {
      if (!event || event.key !== 'Escape') return;
      if (ocrOptionsModal && ocrOptionsModal.getAttribute('aria-hidden') === 'false') {
        event.preventDefault();
        optionsModalUi.settleOcrOptions(false);
        return;
      }
      if (importApplyModal && importApplyModal.getAttribute('aria-hidden') === 'false') {
        event.preventDefault();
        choiceModalUi.settleChoice(state.choiceDismissValue);
      }
    });
  }

  // =============================================================================
  // Bootstrapping and module surface
  // =============================================================================
  bindUiListeners();
  progressUi.syncOcrControlVisibility();

  window.ImportOcrUi = {
    setI18n,
    setLanguage,
    applyTranslations,
    setLockState: progressUi.setLockState,
    handleImportProgress: progressUi.handleImportProgress,
    noteJobQueued: progressUi.noteJobQueued,
    markImportFinished: progressUi.markImportFinished,
    promptChoice: choiceModalUi.promptChoice,
    promptOcrOptionsDialog: optionsModalUi.promptOcrOptionsDialog,
    isOcrRoute,
    getDefaultRunOptions,
    getCancelButton: () => btnCancelOcr,
    isLockActive: () => state.lockActive,
  };
})();

// =============================================================================
// End of public/js/import_ocr_ui.js
// =============================================================================
