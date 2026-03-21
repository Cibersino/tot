// public/js/import_extract_ocr_activation_recovery.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Recover import/extract OCR flow when setup/activation blocks prepare-stage routing.
// - Prepare credentials readiness, show disclosure consent, and then launch OCR activation.
// - Retry preparation after successful OCR activation without bloating renderer orchestration.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-ocr-activation-recovery] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-ocr-activation-recovery');
  log.debug('Import/extract OCR activation recovery helpers starting...');

  // =============================================================================
  // Helpers
  // =============================================================================

  function resolveImportExtractAlertKey(rawKey, fallbackKey) {
    const normalized = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (normalized) return normalized;
    return fallbackKey;
  }

  function isRecoverableImportExtractOcrSetupCode(code) {
    return code === 'setup_incomplete'
      || code === 'ocr_activation_required'
      || code === 'auth_failed';
  }

  function safeNotify(notifyMain, alertKey) {
    if (typeof notifyMain !== 'function') return;
    try {
      notifyMain(alertKey);
    } catch (err) {
      log.error('Failed to notify OCR recovery alert:', alertKey, err);
    }
  }

  function buildDisclosureDeclinedResult() {
    return {
      ok: false,
      cancelled: true,
      code: 'ocr_activation_disclosure_declined',
      alertKey: '',
    };
  }

  async function promptActivationDisclosure() {
    const modalApi = window.ImportExtractOcrActivationDisclosureModal;
    if (!modalApi || typeof modalApi.promptDisclosure !== 'function') {
      throw new Error('ImportExtractOcrActivationDisclosureModal.promptDisclosure unavailable.');
    }
    return await modalApi.promptDisclosure();
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================

  async function recoverAfterSetupFailure({
    preparation,
    retryPrepare,
    getOptionalElectronMethod,
    notifyMain,
  } = {}) {
    if (!preparation || preparation.ok !== true || preparation.prepareFailed !== true) {
      return { preparation, handled: false };
    }
    if (preparation.routeKind !== 'ocr') {
      return { preparation, handled: false };
    }
    if (typeof retryPrepare !== 'function') {
      return { preparation, handled: false };
    }
    if (typeof getOptionalElectronMethod !== 'function') {
      return { preparation, handled: false };
    }

    const failureCode = preparation.error
      && typeof preparation.error.code === 'string'
      ? preparation.error.code
      : '';
    if (!isRecoverableImportExtractOcrSetupCode(failureCode)) {
      return { preparation, handled: false };
    }

    const prepareImportExtractOcrActivation = getOptionalElectronMethod('prepareImportExtractOcrActivation', {
      dedupeKey: 'renderer.ipc.prepareImportExtractOcrActivation.unavailable',
      unavailableMessage: 'prepareImportExtractOcrActivation unavailable; OCR setup recovery cannot continue.'
    });
    const launchImportExtractOcrActivation = getOptionalElectronMethod('launchImportExtractOcrActivation', {
      dedupeKey: 'renderer.ipc.launchImportExtractOcrActivation.unavailable',
      unavailableMessage: 'launchImportExtractOcrActivation unavailable; OCR setup recovery cannot continue.'
    });
    if (!prepareImportExtractOcrActivation || !launchImportExtractOcrActivation) {
      return { preparation, handled: false };
    }

    let prepareResult = null;
    try {
      prepareResult = await prepareImportExtractOcrActivation();
    } catch (err) {
      log.error('import/extract OCR activation prepare IPC failed:', err);
      safeNotify(notifyMain, 'renderer.alerts.import_extract_ocr_activation_failed');
      return { preparation, handled: true };
    }

    if (!prepareResult || prepareResult.ok !== true || prepareResult.ready !== true) {
      const failureAlertKey = resolveImportExtractAlertKey(
        prepareResult && prepareResult.alertKey,
        'renderer.alerts.import_extract_ocr_activation_failed'
      );
      safeNotify(notifyMain, failureAlertKey);
      log.warn('import/extract OCR activation prepare step did not complete:', {
        ok: prepareResult ? prepareResult.ok : false,
        ready: prepareResult ? prepareResult.ready : false,
        code: prepareResult ? prepareResult.code : '',
      });
      return { preparation, handled: true };
    }

    let disclosureAccepted = false;
    try {
      disclosureAccepted = await promptActivationDisclosure();
    } catch (err) {
      log.error('import/extract OCR activation disclosure modal failed:', err);
      safeNotify(notifyMain, 'renderer.alerts.import_extract_ocr_activation_failed');
      return { preparation, handled: true };
    }

    if (!disclosureAccepted) {
      const declineResult = buildDisclosureDeclinedResult();
      log.info('import/extract OCR activation disclosure declined by user:', {
        code: declineResult.code,
      });
      return {
        preparation,
        handled: true,
      };
    }

    let activationResult = null;
    try {
      activationResult = await launchImportExtractOcrActivation();
    } catch (err) {
      log.error('import/extract OCR activation launch IPC failed:', err);
      safeNotify(notifyMain, 'renderer.alerts.import_extract_ocr_activation_failed');
      return { preparation, handled: true };
    }

    if (!activationResult || activationResult.ok !== true) {
      const failureAlertKey = resolveImportExtractAlertKey(
        activationResult && activationResult.alertKey,
        'renderer.alerts.import_extract_ocr_activation_failed'
      );
      safeNotify(notifyMain, failureAlertKey);
      log.warn('import/extract OCR activation launch step did not complete:', {
        ok: activationResult ? activationResult.ok : false,
        state: activationResult ? activationResult.state : '',
        code: activationResult ? activationResult.code : '',
      });
      return { preparation, handled: true };
    }

    safeNotify(
      notifyMain,
      resolveImportExtractAlertKey(
        activationResult.alertKey,
        'renderer.alerts.import_extract_ocr_activation_success'
      )
    );

    const retriedPreparationRun = await retryPrepare();
    if (retriedPreparationRun && retriedPreparationRun.stale === true) {
      log.info('import/extract prepare retry became stale after OCR activation.');
      return { preparationRun: retriedPreparationRun, handled: true };
    }

    return { preparationRun: retriedPreparationRun, handled: false };
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.ImportExtractOcrActivationRecovery = {
    recoverAfterSetupFailure,
  };
})();

// =============================================================================
// End of public/js/import_extract_ocr_activation_recovery.js
// =============================================================================
