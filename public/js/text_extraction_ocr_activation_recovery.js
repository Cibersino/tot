// public/js/text_extraction_ocr_activation_recovery.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Recover text extraction OCR flow when setup/activation blocks prepare-stage OCR routing
//   or a user-selected OCR route.
// - Prepare credentials readiness, show disclosure consent, and then launch OCR activation.
// - Retry preparation after successful OCR activation without bloating renderer orchestration.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-ocr-activation-recovery] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-ocr-activation-recovery');
  log.debug('Text extraction OCR activation recovery helpers starting...');

  // =============================================================================
  // Shared state
  // =============================================================================

  let deps = null;

  function configure({
    ocrActivationFlow = null,
  } = {}) {
    deps = {
      ocrActivationFlow,
    };
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  function requireConfiguredDeps() {
    if (!deps) {
      throw new Error('[text-extraction-ocr-activation-recovery] configure() must run before using the recovery flow');
    }
    return deps;
  }

  function getActivationFlow() {
    const { ocrActivationFlow } = requireConfiguredDeps();
    if (!ocrActivationFlow || typeof ocrActivationFlow.startActivationFlow !== 'function') {
      throw new Error('[text-extraction-ocr-activation-recovery] ocrActivationFlow dependency incomplete');
    }
    return ocrActivationFlow;
  }

  function resolveRecoveryCode({ preparation, routePreference } = {}) {
    if (!preparation || preparation.ok !== true) return '';

    const routeMetadata = preparation.routeMetadata && typeof preparation.routeMetadata === 'object'
      ? preparation.routeMetadata
      : null;
    const availableRoutes = Array.isArray(routeMetadata && routeMetadata.availableRoutes)
      ? routeMetadata.availableRoutes
      : [];

    if (preparation.prepareFailed === true) {
      if (!availableRoutes.includes('ocr')) return '';
      return preparation.error && typeof preparation.error.code === 'string'
        ? preparation.error.code
        : '';
    }

    if (routePreference !== 'ocr') return '';
    if (!routeMetadata) return '';
    if (!availableRoutes.includes('ocr')) return '';

    const setupState = typeof routeMetadata.ocrSetupState === 'string'
      ? routeMetadata.ocrSetupState
      : '';
    if (setupState === 'ready') return '';

    const setupCode = typeof routeMetadata.ocrSetupCode === 'string'
      ? routeMetadata.ocrSetupCode.trim()
      : '';
    if (setupCode) return setupCode;
    if (setupState === 'ocr_activation_required') return 'ocr_activation_required';
    return '';
  }

  function isRecoverableTextExtractionOcrSetupCode(code) {
    return code === 'ocr_activation_required'
      || code === 'ocr_token_state_invalid'
      || code === 'auth_failed';
  }

  function mapRecoveryActivationAlertKey(activationResult) {
    const safeResult = activationResult && typeof activationResult === 'object'
      ? activationResult
      : {};
    const code = typeof safeResult.code === 'string' ? safeResult.code : '';

    if (safeResult.ok === true) {
      return 'renderer.alerts.text_extraction_ocr_activation_success';
    }
    if (code === 'credentials_missing') {
      return 'renderer.alerts.text_extraction_ocr_setup_missing_credentials';
    }
    if (code === 'credentials_invalid') {
      return 'renderer.alerts.text_extraction_ocr_setup_invalid_credentials';
    }
    if (code === 'ocr_token_state_invalid') {
      return 'renderer.alerts.text_extraction_ocr_token_state_invalid';
    }
    if (code === 'connectivity_failed') {
      return 'renderer.alerts.text_extraction_ocr_connectivity_failed';
    }
    if (code === 'quota_or_rate_limited') {
      return 'renderer.alerts.text_extraction_ocr_quota_or_rate_limited';
    }
    if (code === 'ocr_activation_cancelled') {
      return 'renderer.alerts.text_extraction_ocr_activation_cancelled';
    }
    return 'renderer.alerts.text_extraction_ocr_activation_failed';
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================

  async function recoverAfterSetupFailure({
    preparation,
    retryPrepare,
    getOptionalElectronMethod,
    routePreference = '',
  } = {}) {
    if (!preparation || preparation.ok !== true) {
      return { preparation, handled: false };
    }
    if (typeof retryPrepare !== 'function') {
      return { preparation, handled: false };
    }
    if (typeof getOptionalElectronMethod !== 'function') {
      return { preparation, handled: false };
    }

    const failureCode = resolveRecoveryCode({ preparation, routePreference });
    if (!isRecoverableTextExtractionOcrSetupCode(failureCode)) {
      return { preparation, handled: false };
    }

    let activationFlow = null;
    try {
      activationFlow = getActivationFlow();
    } catch (err) {
      log.warn('text extraction OCR activation flow unavailable for setup recovery:', err);
      return { preparation, handled: false };
    }

    const activationResult = await activationFlow.startActivationFlow({
      source: 'text_extraction_recovery',
    });
    if (!activationResult || activationResult.ok !== true) {
      if (activationResult
        && activationResult.state === 'unavailable'
        && activationResult.stage === 'bridge') {
        return { preparation, handled: false };
      }
      if (activationResult
        && activationResult.state === 'cancelled'
        && activationResult.code === 'ocr_activation_disclosure_declined') {
        return {
          preparation,
          handled: true,
        };
      }
      window.Notify.notifyMain(mapRecoveryActivationAlertKey(activationResult));
      return { preparation, handled: true };
    }

    window.Notify.notifyMain(mapRecoveryActivationAlertKey(activationResult));

    const retriedPreparationRun = await retryPrepare();
    if (retriedPreparationRun && retriedPreparationRun.stale === true) {
      log.info('text extraction prepare retry became stale after OCR activation.');
      return { preparationRun: retriedPreparationRun, handled: true };
    }

    return { preparationRun: retriedPreparationRun, handled: false };
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.TextExtractionOcrActivationRecovery = {
    configure,
    recoverAfterSetupFailure,
  };
})();

// =============================================================================
// End of public/js/text_extraction_ocr_activation_recovery.js
// =============================================================================
