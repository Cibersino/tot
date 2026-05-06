// public/js/text_extraction_entry.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the shared main-window text extraction entry flow.
// - Let picker and drag/drop feed the same prepare/execute/apply pipeline.
// - Keep renderer.js limited to wiring and shared app-level helpers.
// =============================================================================

(() => {
  // =============================================================================
  // Logger bootstrap
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-entry] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-entry');
  log.debug('Text extraction shared entry starting...');
  const { AppConstants } = window;
  if (!AppConstants) {
    throw new Error('[text-extraction-entry] AppConstants unavailable; cannot continue');
  }
  const { MAX_CLIPBOARD_REPEAT } = AppConstants;

  // =============================================================================
  // Shared state + configuration
  // =============================================================================
  let deps = null;

  function configure(nextDeps = {}) {
    deps = {
      applyTextViaCanonicalPath: null,
      getClipboardRepeatCount: null,
      getOcrLanguage: null,
      getOptionalElectronMethod: null,
      guardUserAction: null,
      hasBlockingModalOpen: null,
      hasCurrentTextSubscription: null,
      textExtractionStatusUi: null,
      isLatestTextExtractionPrepareAttempt: null,
      maybeRecoverTextExtractionOcrSetupAndRetry: null,
      requestPreparedImport: null,
      ...nextDeps,
    };
  }

  // =============================================================================
  // Local helpers
  // =============================================================================
  function requireConfiguredDeps() {
    if (!deps) {
      throw new Error('[text-extraction-entry] configure() must run before using the shared entry flow');
    }
    return deps;
  }

  function normalizeFilePath(rawValue) {
    return typeof rawValue === 'string' ? rawValue.trim() : '';
  }

  function hasBlockingModalOpen() {
    const { hasBlockingModalOpen: predicate } = requireConfiguredDeps();
    if (typeof predicate !== 'function') {
      log.warn('hasBlockingModalOpen dependency unavailable; proceeding without modal-open guard.');
      return false;
    }
    return predicate() === true;
  }

  function getOptionalElectronMethod(methodName, options) {
    const { getOptionalElectronMethod: getter } = requireConfiguredDeps();
    if (typeof getter !== 'function') {
      throw new Error('[text-extraction-entry] getOptionalElectronMethod dependency missing');
    }
    return getter(methodName, options);
  }

  function getStatusUi() {
    const { textExtractionStatusUi } = requireConfiguredDeps();
    if (!textExtractionStatusUi
      || typeof textExtractionStatusUi.applyProcessingModeState !== 'function'
      || typeof textExtractionStatusUi.clearPendingExecutionContext !== 'function'
      || typeof textExtractionStatusUi.getFinalElapsedValueText !== 'function'
      || typeof textExtractionStatusUi.setPendingExecutionContext !== 'function') {
      throw new Error('[text-extraction-entry] textExtractionStatusUi dependency incomplete');
    }
    return textExtractionStatusUi;
  }

  function resolvePrimaryAlertKey(resultLike) {
    return (resultLike && typeof resultLike.primaryAlertKey === 'string' && resultLike.primaryAlertKey.trim())
      ? resultLike.primaryAlertKey
      : 'renderer.alerts.text_extraction_error';
  }

  function hasOwn(resultLike, key) {
    return !!resultLike && Object.prototype.hasOwnProperty.call(resultLike, key);
  }

  function consumeRecoveryPreparationState({
    recovery,
    preparationRun,
    textExtractionStatusUi,
    staleMessage,
  }) {
    if (recovery && recovery.handled) {
      if (!recovery.preparationRun) {
        textExtractionStatusUi.clearPendingExecutionContext();
      }
      return {
        handled: true,
        preparationRun,
        preparation: preparationRun ? preparationRun.preparation : null,
      };
    }

    if (hasOwn(recovery, 'preparationRun')) {
      const nextPreparationRun = recovery.preparationRun;
      if (nextPreparationRun && nextPreparationRun.stale === true) {
        log.info(staleMessage);
        return {
          handled: false,
          stale: true,
          preparationRun: nextPreparationRun,
          preparation: null,
        };
      }
      return {
        handled: false,
        stale: false,
        preparationRun: nextPreparationRun,
        preparation: nextPreparationRun ? nextPreparationRun.preparation : null,
      };
    }

    if (hasOwn(recovery, 'preparation')) {
      return {
        handled: false,
        stale: false,
        preparationRun,
        preparation: recovery.preparation,
      };
    }

    return {
      handled: false,
      stale: false,
      preparationRun,
      preparation: preparationRun ? preparationRun.preparation : null,
    };
  }

  function failPreparation(textExtractionStatusUi, preparation, logMessage) {
    textExtractionStatusUi.clearPendingExecutionContext();
    if (logMessage) {
      log.error(logMessage, preparation);
    }
    window.Notify.notifyMain(resolvePrimaryAlertKey(preparation));
  }

  // =============================================================================
  // Shared text extraction flow
  // =============================================================================
  async function runSharedFlow({
    filePath,
    source = 'unknown',
    actionId = 'text-extraction-entrypoint',
    skipGuard = false,
  } = {}) {
    const {
      applyTextViaCanonicalPath,
      getClipboardRepeatCount,
      getOcrLanguage,
      guardUserAction,
      hasCurrentTextSubscription,
      isLatestTextExtractionPrepareAttempt,
      maybeRecoverTextExtractionOcrSetupAndRetry,
      requestPreparedImport,
    } = requireConfiguredDeps();
    const textExtractionStatusUi = getStatusUi();
    const normalizedFilePath = normalizeFilePath(filePath);

    if (!skipGuard) {
      if (typeof guardUserAction !== 'function') {
        log.error('guardUserAction dependency missing; text extraction action blocked:', actionId);
        return;
      }
      if (!guardUserAction(actionId)) return;
    }
    if (hasBlockingModalOpen()) {
      log.info('text extraction entry blocked because a main-window modal is open:', { source });
      return;
    }
    if (!normalizedFilePath) {
      log.warn('text extraction entry received an empty file path:', { source });
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
      return;
    }
    if (typeof requestPreparedImport !== 'function') {
      log.error('requestPreparedImport dependency missing; text extraction action blocked:', actionId);
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
      return;
    }
    if (typeof maybeRecoverTextExtractionOcrSetupAndRetry !== 'function') {
      log.error('maybeRecoverTextExtractionOcrSetupAndRetry dependency missing; text extraction action blocked:', actionId);
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
      return;
    }

    try {
      const checkTextExtractionPreconditions = getOptionalElectronMethod('checkTextExtractionPreconditions', {
        dedupeKey: 'renderer.ipc.checkTextExtractionPreconditions.unavailable',
        unavailableMessage: 'checkTextExtractionPreconditions unavailable; text extraction precondition check skipped.'
      });
      if (!checkTextExtractionPreconditions) {
        window.Notify.notifyMain('renderer.alerts.text_extraction_precondition_error');
        return;
      }

      const preconditions = await checkTextExtractionPreconditions();
      if (!preconditions || preconditions.ok === false) {
        log.error('text extraction precondition check failed:', preconditions);
        window.Notify.notifyMain('renderer.alerts.text_extraction_precondition_error');
        return;
      }
      if (!preconditions.canStart) {
        window.Notify.notifyMain(preconditions.guidanceKey || 'renderer.alerts.text_extraction_precondition_blocked');
        return;
      }

      const prepareTextExtractionSelectedFile = getOptionalElectronMethod('prepareTextExtractionSelectedFile', {
        dedupeKey: 'renderer.ipc.prepareTextExtractionSelectedFile.unavailable',
        unavailableMessage: 'prepareTextExtractionSelectedFile unavailable; text extraction prepare cannot continue.'
      });
      const executePreparedTextExtraction = getOptionalElectronMethod('executePreparedTextExtraction', {
        dedupeKey: 'renderer.ipc.executePreparedTextExtraction.unavailable',
        unavailableMessage: 'executePreparedTextExtraction unavailable; text extraction execution cannot continue.'
      });
      if (!prepareTextExtractionSelectedFile || !executePreparedTextExtraction) {
        window.Notify.notifyMain('renderer.alerts.text_extraction_error');
        return;
      }

      if (typeof getOcrLanguage !== 'function') {
        log.warn('getOcrLanguage dependency unavailable; using empty OCR language fallback.');
      }
      const preparationRequest = {
        filePath: normalizedFilePath,
        ocrLanguage: typeof getOcrLanguage === 'function' ? (getOcrLanguage() || '') : '',
      };
      let preparationRun = await requestPreparedImport({
        prepareTextExtractionSelectedFile,
        preparationRequest,
      });
      if (preparationRun && preparationRun.stale === true) {
        log.info('text extraction prepare result ignored because a newer prepare attempt exists.');
        return;
      }

      let preparation = preparationRun ? preparationRun.preparation : null;
      const recovery = await maybeRecoverTextExtractionOcrSetupAndRetry({
        preparation,
        preparationRequest,
        prepareTextExtractionSelectedFile,
      });
      const recoveryResult = consumeRecoveryPreparationState({
        recovery,
        preparationRun,
        textExtractionStatusUi,
        staleMessage: 'text extraction prepare retry ignored because a newer prepare attempt exists.',
      });
      if (recoveryResult.handled) {
        return;
      }
      if (recoveryResult.stale === true) {
        return;
      }
      preparationRun = recoveryResult.preparationRun;
      preparation = recoveryResult.preparation;

      if (!preparation || preparation.ok !== true) {
        failPreparation(textExtractionStatusUi, preparation, 'text extraction prepare IPC failed:');
        return;
      }

      if (preparation.prepareFailed === true) {
        failPreparation(textExtractionStatusUi, preparation);
        return;
      }

      let latestAttemptId = preparationRun ? preparationRun.attemptId : 0;
      const hasAttemptFreshnessGuard = typeof isLatestTextExtractionPrepareAttempt === 'function';
      if (!hasAttemptFreshnessGuard) {
        log.warn('isLatestTextExtractionPrepareAttempt dependency unavailable; stale prepare protection disabled.');
      }
      if (hasAttemptFreshnessGuard && !isLatestTextExtractionPrepareAttempt(latestAttemptId)) {
        log.info('text extraction prepared result ignored because a newer prepare attempt exists.');
        return;
      }

      let routePreference = '';
      if (preparation.requiresRouteChoice === true) {
        try {
          routePreference = await window.Notify.promptTextExtractionRouteChoice({ preparation });
        } catch (err) {
          textExtractionStatusUi.clearPendingExecutionContext();
          log.error('text extraction route-choice modal failed:', err);
          window.Notify.notifyMain('renderer.alerts.text_extraction_route_choice_required');
          return;
        }
        if (hasAttemptFreshnessGuard && !isLatestTextExtractionPrepareAttempt(latestAttemptId)) {
          log.info('text extraction route-choice result ignored because a newer prepare attempt exists.');
          return;
        }
        if (routePreference !== 'native' && routePreference !== 'ocr') {
          textExtractionStatusUi.clearPendingExecutionContext();
          log.info('text extraction route-choice cancelled by user.');
          return;
        }
      }

      if (routePreference === 'ocr') {
        const ocrRouteRecovery = await maybeRecoverTextExtractionOcrSetupAndRetry({
          preparation,
          preparationRequest,
          prepareTextExtractionSelectedFile,
          routePreference,
        });
        const ocrRouteRecoveryResult = consumeRecoveryPreparationState({
          recovery: ocrRouteRecovery,
          preparationRun,
          textExtractionStatusUi,
          staleMessage: 'text extraction OCR route prepare retry ignored because a newer prepare attempt exists.',
        });
        if (ocrRouteRecoveryResult.handled) {
          return;
        }
        if (ocrRouteRecoveryResult.stale === true) {
          return;
        }
        preparationRun = ocrRouteRecoveryResult.preparationRun;
        preparation = ocrRouteRecoveryResult.preparation;

        if (!preparation || preparation.ok !== true) {
          failPreparation(textExtractionStatusUi, preparation, 'text extraction OCR route recovery prepare IPC failed:');
          return;
        }

        if (preparation.prepareFailed === true) {
          failPreparation(textExtractionStatusUi, preparation);
          return;
        }

        latestAttemptId = preparationRun ? preparationRun.attemptId : latestAttemptId;
        if (hasAttemptFreshnessGuard && !isLatestTextExtractionPrepareAttempt(latestAttemptId)) {
          log.info('text extraction OCR route preparation ignored because a newer prepare attempt exists.');
          return;
        }
      }

      textExtractionStatusUi.setPendingExecutionContext({
        preparation,
        routePreference,
      });
      const execution = await executePreparedTextExtraction({
        prepareId: preparation.prepareId,
        routePreference,
      });
      if (!execution || execution.ok !== true || !execution.result) {
        textExtractionStatusUi.clearPendingExecutionContext();
        if (execution && execution.code === 'ALREADY_ACTIVE' && execution.state) {
          textExtractionStatusUi.applyProcessingModeState(execution.state, { source: 'execute_already_active' });
        }
        log.error('text extraction execution IPC failed:', execution);
        window.Notify.notifyMain(resolvePrimaryAlertKey(execution));
        return;
      }

      const warningAlertKeys = Array.isArray(execution.warningAlertKeys)
        ? execution.warningAlertKeys
        : [];
      warningAlertKeys.forEach((alertKey) => {
        if (typeof alertKey === 'string' && alertKey.trim()) {
          window.Notify.notifyMain(alertKey);
        }
      });

      const resultState = execution.result && typeof execution.result.state === 'string'
        ? execution.result.state
        : 'failure';
      if (resultState === 'success') {
        if (typeof getClipboardRepeatCount !== 'function') {
          log.warn('getClipboardRepeatCount dependency unavailable; using default repeat count fallback.');
        }
        const defaultRepeat = typeof getClipboardRepeatCount === 'function'
          ? getClipboardRepeatCount()
          : 1;
        let applyChoice = null;
        try {
          applyChoice = await window.Notify.promptTextExtractionApplyChoice({
            defaultRepeat,
            elapsedValueText: textExtractionStatusUi.getFinalElapsedValueText(),
            maxRepeat: MAX_CLIPBOARD_REPEAT,
          });
        } catch (err) {
          log.error('text extraction apply modal failed:', err);
          window.Notify.notifyMain('renderer.alerts.text_extraction_apply_error');
          return;
        }
        if (!applyChoice) {
          log.info('text extraction apply choice cancelled by user.');
          return;
        }

        if (typeof applyTextViaCanonicalPath !== 'function') {
          textExtractionStatusUi.clearPendingExecutionContext();
          log.error('applyTextViaCanonicalPath dependency unavailable; apply flow blocked.');
          window.Notify.notifyMain('renderer.alerts.text_extraction_apply_error');
          return;
        }
        if (typeof hasCurrentTextSubscription !== 'function' || !hasCurrentTextSubscription()) {
          textExtractionStatusUi.clearPendingExecutionContext();
          log.error('current-text-updated subscription unavailable; apply flow blocked.');
          window.Notify.notifyMain('renderer.alerts.text_extraction_apply_error');
          return;
        }

        const applyResult = await applyTextViaCanonicalPath({
          mode: applyChoice.mode,
          textToApply: execution.result.text || '',
          repeatCount: applyChoice.repetitions,
        });
        if (!applyResult || applyResult.ok !== true) {
          if (applyResult && applyResult.code === 'PAYLOAD_TOO_LARGE') {
            window.Notify.notifyMain('renderer.alerts.text_extraction_apply_too_large');
          } else if (applyResult && applyResult.code === 'TEXT_LIMIT') {
            window.Notify.notifyMain('renderer.alerts.text_extraction_apply_text_limit');
          } else {
            window.Notify.notifyMain('renderer.alerts.text_extraction_apply_error');
          }
          return;
        }

        if (applyResult.truncated) {
          window.Notify.notifyMain('renderer.alerts.text_extraction_apply_truncated');
        }
        return;
      }

      const primaryAlertKey = resolvePrimaryAlertKey(execution);
      if (primaryAlertKey === 'renderer.alerts.text_extraction_native_cancelled'
        || primaryAlertKey === 'renderer.alerts.text_extraction_ocr_cancelled') {
        return;
      }
      window.Notify.notifyMain(primaryAlertKey);
    } catch (err) {
      textExtractionStatusUi.clearPendingExecutionContext();
      log.error(`Error handling text extraction ${source} entrypoint:`, err);
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
    }
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================
  async function startFromPicker() {
    const { guardUserAction } = requireConfiguredDeps();

    if (typeof guardUserAction !== 'function') {
      log.error('guardUserAction dependency missing; picker entrypoint blocked.');
      return;
    }
    if (!guardUserAction('text-extraction-entrypoint')) return;
    if (hasBlockingModalOpen()) {
      log.info('text extraction picker entry blocked because a main-window modal is open.');
      return;
    }

    try {
      const openTextExtractionPicker = getOptionalElectronMethod('openTextExtractionPicker', {
        dedupeKey: 'renderer.ipc.openTextExtractionPicker.unavailable',
        unavailableMessage: 'openTextExtractionPicker unavailable; text extraction entrypoint skipped.'
      });
      if (!openTextExtractionPicker) {
        window.Notify.notifyMain('renderer.alerts.text_extraction_error');
        return;
      }

      const picker = await openTextExtractionPicker();
      if (!picker || picker.ok === false) {
        log.error('text extraction picker failed:', picker && picker.error ? picker.error : picker);
        window.Notify.notifyMain('renderer.alerts.text_extraction_error');
        return;
      }
      if (picker.canceled) return;

      await runSharedFlow({
        filePath: picker.filePath || '',
        source: 'picker',
        skipGuard: true,
      });
    } catch (err) {
      log.error('Error handling text extraction picker entrypoint:', err);
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
    }
  }

  async function startFromFilePath({ filePath, source = 'drop' } = {}) {
    await runSharedFlow({
      filePath,
      source,
      actionId: `text-extraction-${source}`,
    });
  }

  // =============================================================================
  // Module surface
  // =============================================================================
  window.TextExtractionEntry = {
    configure,
    startFromFilePath,
    startFromPicker,
  };
})();

// =============================================================================
// End of public/js/text_extraction_entry.js
// =============================================================================
