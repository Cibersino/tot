// public/js/import_extract_ocr_activation_recovery.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Recover import/extract OCR flow when setup/activation blocks prepare-stage routing.
// - Keep OCR activation retry logic out of renderer orchestration file.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-ocr-activation-recovery] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-ocr-activation-recovery');
  log.debug('Import/extract OCR activation recovery helpers starting...');

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

    const activateImportExtractOcr = getOptionalElectronMethod('activateImportExtractOcr', {
      dedupeKey: 'renderer.ipc.activateImportExtractOcr.unavailable',
      unavailableMessage: 'activateImportExtractOcr unavailable; OCR setup recovery cannot continue.'
    });
    if (!activateImportExtractOcr) {
      return { preparation, handled: false };
    }

    safeNotify(notifyMain, 'renderer.alerts.import_extract_ocr_activation_starting');

    let activationResult = null;
    try {
      activationResult = await activateImportExtractOcr({
        source: 'import_extract_entrypoint',
        reason: `ocr_blocked_${failureCode}`,
      });
    } catch (err) {
      log.error('import/extract OCR activation IPC failed:', err);
      safeNotify(notifyMain, 'renderer.alerts.import_extract_ocr_activation_failed');
      return { preparation, handled: true };
    }

    if (!activationResult || activationResult.ok !== true) {
      const failureAlertKey = resolveImportExtractAlertKey(
        activationResult && activationResult.alertKey,
        'renderer.alerts.import_extract_ocr_activation_failed'
      );
      safeNotify(notifyMain, failureAlertKey);
      log.warn('import/extract OCR activation attempt did not complete:', {
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

  window.ImportExtractOcrActivationRecovery = {
    recoverAfterSetupFailure,
  };
})();

// =============================================================================
// End of public/js/import_extract_ocr_activation_recovery.js
// =============================================================================
