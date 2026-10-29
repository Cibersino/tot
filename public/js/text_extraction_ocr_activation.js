// public/js/text_extraction_ocr_activation.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the main-window Google OCR activation action flow from Preferences.
// - Reuse the shared activation sequence without duplicating the IPC/disclosure logic.
// - Keep renderer.js limited to wiring and shared app-level helpers.

(() => {
  // =============================================================================
  // Logger bootstrap
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-ocr-activation] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-ocr-activation');
  log.debug('Text extraction OCR activation helper starting...');

  // =============================================================================
  // Shared state
  // =============================================================================
  let deps = null;

  function configure({
    ocrConnectionFlow = null,
  } = {}) {
    deps = {
      ocrConnectionFlow,
    };
  }

  // =============================================================================
  // Helpers
  // =============================================================================
  function requireConfiguredDeps() {
    if (!deps) {
      throw new Error('[text-extraction-ocr-activation] configure() must run before using the activation flow');
    }
    return deps;
  }

  function getActivationFlow() {
    const { ocrConnectionFlow } = requireConfiguredDeps();
    if (!ocrConnectionFlow || typeof ocrConnectionFlow.startActivationFlow !== 'function') {
      throw new Error('[text-extraction-ocr-activation] ocrConnectionFlow dependency incomplete');
    }
    return ocrConnectionFlow;
  }

  function mapMenuActivationAlertKey(activationResult) {
    const safeResult = activationResult && typeof activationResult === 'object'
      ? activationResult
      : {};
    const code = typeof safeResult.code === 'string' ? safeResult.code : '';

    if (code === 'ocr_operation_in_progress') {
      return 'renderer.text_extraction.alerts.ocr.operation_in_progress';
    }
    if (safeResult.ok === true) {
      return 'renderer.text_extraction.alerts.ocr.enable_success';
    }
    if (code === 'credentials_missing') {
      return 'renderer.text_extraction.alerts.ocr.setup_missing_credentials';
    }
    if (code === 'credentials_invalid') {
      return 'renderer.text_extraction.alerts.ocr.setup_invalid_credentials';
    }
    if (code === 'ocr_token_state_invalid') {
      return 'renderer.text_extraction.alerts.ocr.token_state_invalid';
    }
    if (code === 'connectivity_failed') {
      return 'renderer.text_extraction.alerts.ocr.connectivity_failed';
    }
    if (code === 'quota_or_rate_limited') {
      return 'renderer.text_extraction.alerts.ocr.quota_or_rate_limited';
    }
    if (code === 'ocr_activation_cancelled') {
      return 'renderer.text_extraction.alerts.ocr.enable_cancelled';
    }
    return 'renderer.text_extraction.alerts.ocr.enable_failed';
  }

  // =============================================================================
  // Public entrypoint
  // =============================================================================
  async function startFromPreferencesMenu() {
    let activationFlow = null;
    try {
      activationFlow = getActivationFlow();
    } catch (error) {
      log.error('OCR activation flow unavailable for Preferences menu:', error);
      window.Notify.notifyMain('renderer.text_extraction.alerts.ocr.activation_failed');
      return {
        ok: false,
        state: 'failure',
        code: 'flow_unavailable',
      };
    }

    let activationResult = null;
    try {
      activationResult = await activationFlow.startActivationFlow({
        source: 'preferences_menu',
      });
    } catch (error) {
      log.error('OCR activation flow failed for Preferences menu:', error);
      window.Notify.notifyMain('renderer.text_extraction.alerts.ocr.activation_failed');
      return {
        ok: false,
        state: 'failure',
        code: 'activation_failed',
      };
    }

    if (!activationResult || typeof activationResult !== 'object') {
      log.warn('OCR activation flow returned no result object; using generic failure fallback:', activationResult);
    }

    if (activationResult && activationResult.ok === true) {
      window.Notify.notifyMain(mapMenuActivationAlertKey(activationResult));
      return activationResult;
    }

    if (activationResult
      && activationResult.state === 'cancelled'
      && activationResult.code === 'ocr_activation_disclosure_declined') {
      return activationResult;
    }

    window.Notify.notifyMain(mapMenuActivationAlertKey(activationResult));
    return activationResult || {
      ok: false,
      state: 'failure',
      code: 'activation_failed',
    };
  }

  // =============================================================================
  // Module surface
  // =============================================================================
  window.TextExtractionOcrActivation = {
    configure,
    startFromPreferencesMenu,
  };
})();

// =============================================================================
// End of public/js/text_extraction_ocr_activation.js
// =============================================================================
