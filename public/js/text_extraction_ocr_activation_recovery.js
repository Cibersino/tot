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
  // Helpers
  // =============================================================================

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

  function resolveTextExtractionAlertKey(rawKey, fallbackKey) {
    const normalized = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (normalized) return normalized;
    return fallbackKey;
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

    const prepareTextExtractionOcrActivation = getOptionalElectronMethod('prepareTextExtractionOcrActivation', {
      dedupeKey: 'renderer.ipc.prepareTextExtractionOcrActivation.unavailable',
      unavailableMessage: 'prepareTextExtractionOcrActivation unavailable; OCR setup recovery cannot continue.'
    });
    const launchTextExtractionOcrActivation = getOptionalElectronMethod('launchTextExtractionOcrActivation', {
      dedupeKey: 'renderer.ipc.launchTextExtractionOcrActivation.unavailable',
      unavailableMessage: 'launchTextExtractionOcrActivation unavailable; OCR setup recovery cannot continue.'
    });
    if (!prepareTextExtractionOcrActivation || !launchTextExtractionOcrActivation) {
      return { preparation, handled: false };
    }

    let prepareResult = null;
    try {
      prepareResult = await prepareTextExtractionOcrActivation();
    } catch (err) {
      log.error('text extraction OCR activation prepare IPC failed:', err);
      window.Notify.notifyMain('renderer.alerts.text_extraction_ocr_activation_failed');
      return { preparation, handled: true };
    }

    if (!prepareResult || prepareResult.ok !== true || prepareResult.ready !== true) {
      const failureAlertKey = resolveTextExtractionAlertKey(
        prepareResult && prepareResult.alertKey,
        'renderer.alerts.text_extraction_ocr_activation_failed'
      );
      window.Notify.notifyMain(failureAlertKey);
      log.warn('text extraction OCR activation prepare step did not complete:', {
        ok: prepareResult ? prepareResult.ok : false,
        ready: prepareResult ? prepareResult.ready : false,
        code: prepareResult ? prepareResult.code : '',
      });
      return { preparation, handled: true };
    }

    let disclosureAccepted = false;
    try {
      disclosureAccepted = await window.Notify.promptTextExtractionOcrActivationDisclosure();
    } catch (err) {
      log.error('text extraction OCR activation disclosure modal failed:', err);
      window.Notify.notifyMain('renderer.alerts.text_extraction_ocr_activation_failed');
      return { preparation, handled: true };
    }

    if (!disclosureAccepted) {
      log.info('text extraction OCR activation disclosure declined by user:', {
        code: 'ocr_activation_disclosure_declined',
      });
      return {
        preparation,
        handled: true,
      };
    }

    let activationResult = null;
    try {
      activationResult = await launchTextExtractionOcrActivation();
    } catch (err) {
      log.error('text extraction OCR activation launch IPC failed:', err);
      window.Notify.notifyMain('renderer.alerts.text_extraction_ocr_activation_failed');
      return { preparation, handled: true };
    }

    if (!activationResult || activationResult.ok !== true) {
      const failureAlertKey = resolveTextExtractionAlertKey(
        activationResult && activationResult.alertKey,
        'renderer.alerts.text_extraction_ocr_activation_failed'
      );
      window.Notify.notifyMain(failureAlertKey);
      log.warn('text extraction OCR activation launch step did not complete:', {
        ok: activationResult ? activationResult.ok : false,
        state: activationResult ? activationResult.state : '',
        code: activationResult ? activationResult.code : '',
      });
      return { preparation, handled: true };
    }

    window.Notify.notifyMain(
      resolveTextExtractionAlertKey(
        activationResult.alertKey,
        'renderer.alerts.text_extraction_ocr_activation_success'
      )
    );

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
    recoverAfterSetupFailure,
  };
})();

// =============================================================================
// End of public/js/text_extraction_ocr_activation_recovery.js
// =============================================================================


