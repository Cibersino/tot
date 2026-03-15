// public/js/import_extract_ocr_activation_recovery.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Recover import/extract OCR flow when setup/activation blocks OCR execution.
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
    return code === 'setup_incomplete' || code === 'ocr_activation_required';
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
    execution,
    executionRequest,
    runImportExtractSelectedFile,
    promptRouteChoice,
    getOptionalElectronMethod,
    notifyMain,
  } = {}) {
    if (!execution || execution.ok !== true || !execution.result) {
      return { execution, handled: false };
    }
    if (execution.routeKind !== 'ocr') {
      return { execution, handled: false };
    }
    if (typeof runImportExtractSelectedFile !== 'function') {
      return { execution, handled: false };
    }
    if (typeof getOptionalElectronMethod !== 'function') {
      return { execution, handled: false };
    }

    const failureCode = execution.result
      && execution.result.error
      && typeof execution.result.error.code === 'string'
      ? execution.result.error.code
      : '';
    if (!isRecoverableImportExtractOcrSetupCode(failureCode)) {
      return { execution, handled: false };
    }

    const activateImportExtractOcr = getOptionalElectronMethod('activateImportExtractOcr', {
      dedupeKey: 'renderer.ipc.activateImportExtractOcr.unavailable',
      unavailableMessage: 'activateImportExtractOcr unavailable; OCR setup recovery cannot continue.'
    });
    if (!activateImportExtractOcr) {
      return { execution, handled: false };
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
      return { execution, handled: true };
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
      return { execution, handled: true };
    }

    safeNotify(
      notifyMain,
      resolveImportExtractAlertKey(
        activationResult.alertKey,
        'renderer.alerts.import_extract_ocr_activation_success'
      )
    );

    let retriedExecution = await runImportExtractSelectedFile(executionRequest);
    if (retriedExecution && retriedExecution.ok === true && retriedExecution.requiresRouteChoice === true) {
      if (typeof promptRouteChoice !== 'function') {
        log.error('import/extract route-choice callback unavailable after OCR activation retry.');
        safeNotify(notifyMain, 'renderer.alerts.import_extract_route_choice_required');
        return { execution: retriedExecution, handled: true };
      }

      const routePreference = await promptRouteChoice(retriedExecution);
      if (routePreference !== 'native' && routePreference !== 'ocr') {
        log.info('import/extract route-choice cancelled by user after OCR activation retry.');
        return { execution: retriedExecution, handled: true };
      }
      retriedExecution = await runImportExtractSelectedFile({
        ...executionRequest,
        routePreference,
      });
    }

    if (retriedExecution && retriedExecution.ok === true && retriedExecution.requiresRouteChoice === true) {
      log.error('import/extract route choice remained unresolved after OCR activation retry:', retriedExecution);
      safeNotify(notifyMain, 'renderer.alerts.import_extract_route_choice_required');
      return { execution: retriedExecution, handled: true };
    }

    return { execution: retriedExecution, handled: false };
  }

  window.ImportExtractOcrActivationRecovery = {
    recoverAfterSetupFailure,
  };
})();

// =============================================================================
// End of public/js/import_extract_ocr_activation_recovery.js
// =============================================================================

