'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the shared main-window import/extract entry flow.
// - Let picker and drag/drop feed the same prepare/execute/apply pipeline.
// - Keep renderer.js limited to wiring and shared app-level helpers.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-entry] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-entry');
  log.debug('Import/extract shared entry starting...');

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
      importExtractStatusUi: null,
      isLatestImportExtractPrepareAttempt: null,
      maybeRecoverImportExtractOcrSetupAndRetry: null,
      notifyMain: null,
      promptImportExtractApplyChoice: null,
      promptImportExtractRouteChoice: null,
      requestPreparedImport: null,
      ...nextDeps,
    };
  }

  function requireConfiguredDeps() {
    if (!deps) {
      throw new Error('[import-extract-entry] configure() must run before using the shared entry flow');
    }
    return deps;
  }

  function normalizeFilePath(rawValue) {
    return typeof rawValue === 'string' ? rawValue.trim() : '';
  }

  function notifyMain(alertKey) {
    const { notifyMain: notify } = requireConfiguredDeps();
    if (typeof notify !== 'function') {
      log.warnOnce(
        'importExtractEntry.notifyMain.unavailable',
        'notifyMain dependency unavailable; alert notification skipped:',
        alertKey
      );
      return;
    }
    notify(alertKey);
  }

  function hasBlockingModalOpen() {
    const { hasBlockingModalOpen: predicate } = requireConfiguredDeps();
    return typeof predicate === 'function' && predicate() === true;
  }

  function getOptionalElectronMethod(methodName, options) {
    const { getOptionalElectronMethod: getter } = requireConfiguredDeps();
    if (typeof getter !== 'function') {
      throw new Error('[import-extract-entry] getOptionalElectronMethod dependency missing');
    }
    return getter(methodName, options);
  }

  function getStatusUi() {
    const { importExtractStatusUi } = requireConfiguredDeps();
    if (!importExtractStatusUi
      || typeof importExtractStatusUi.applyProcessingModeState !== 'function'
      || typeof importExtractStatusUi.clearPendingExecutionContext !== 'function'
      || typeof importExtractStatusUi.getFinalElapsedText !== 'function'
      || typeof importExtractStatusUi.setPendingExecutionContext !== 'function') {
      throw new Error('[import-extract-entry] importExtractStatusUi dependency incomplete');
    }
    return importExtractStatusUi;
  }

  function resolvePrimaryAlertKey(resultLike) {
    return (resultLike && typeof resultLike.primaryAlertKey === 'string' && resultLike.primaryAlertKey.trim())
      ? resultLike.primaryAlertKey
      : 'renderer.alerts.import_extract_error';
  }

  async function runSharedFlow({
    filePath,
    source = 'unknown',
    actionId = 'import-extract-entrypoint',
    skipGuard = false,
  } = {}) {
    const {
      applyTextViaCanonicalPath,
      getClipboardRepeatCount,
      getOcrLanguage,
      guardUserAction,
      hasCurrentTextSubscription,
      isLatestImportExtractPrepareAttempt,
      maybeRecoverImportExtractOcrSetupAndRetry,
      promptImportExtractApplyChoice,
      promptImportExtractRouteChoice,
      requestPreparedImport,
    } = requireConfiguredDeps();
    const importExtractStatusUi = getStatusUi();
    const normalizedFilePath = normalizeFilePath(filePath);

    if (!skipGuard && (typeof guardUserAction !== 'function' || !guardUserAction(actionId))) return;
    if (hasBlockingModalOpen()) {
      log.info('import/extract entry blocked because a main-window modal is open:', { source });
      return;
    }
    if (!normalizedFilePath) {
      log.warn('import/extract entry received an empty file path:', { source });
      notifyMain('renderer.alerts.import_extract_error');
      return;
    }

    try {
      const checkImportExtractPreconditions = getOptionalElectronMethod('checkImportExtractPreconditions', {
        dedupeKey: 'renderer.ipc.checkImportExtractPreconditions.unavailable',
        unavailableMessage: 'checkImportExtractPreconditions unavailable; import/extract precondition check skipped.'
      });
      if (!checkImportExtractPreconditions) {
        notifyMain('renderer.alerts.import_extract_precondition_error');
        return;
      }

      const preconditions = await checkImportExtractPreconditions();
      if (!preconditions || preconditions.ok === false) {
        log.error('import/extract precondition check failed:', preconditions);
        notifyMain('renderer.alerts.import_extract_precondition_error');
        return;
      }
      if (!preconditions.canStart) {
        notifyMain(preconditions.guidanceKey || 'renderer.alerts.import_extract_precondition_blocked');
        return;
      }

      const prepareImportExtractSelectedFile = getOptionalElectronMethod('prepareImportExtractSelectedFile', {
        dedupeKey: 'renderer.ipc.prepareImportExtractSelectedFile.unavailable',
        unavailableMessage: 'prepareImportExtractSelectedFile unavailable; import/extract prepare cannot continue.'
      });
      const executePreparedImportExtract = getOptionalElectronMethod('executePreparedImportExtract', {
        dedupeKey: 'renderer.ipc.executePreparedImportExtract.unavailable',
        unavailableMessage: 'executePreparedImportExtract unavailable; import/extract execution cannot continue.'
      });
      if (!prepareImportExtractSelectedFile || !executePreparedImportExtract) {
        notifyMain('renderer.alerts.import_extract_error');
        return;
      }

      const preparationRequest = {
        filePath: normalizedFilePath,
        ocrLanguage: typeof getOcrLanguage === 'function' ? (getOcrLanguage() || '') : '',
      };
      let preparationRun = await requestPreparedImport({
        prepareImportExtractSelectedFile,
        preparationRequest,
      });
      if (preparationRun && preparationRun.stale === true) {
        log.info('import/extract prepare result ignored because a newer prepare attempt exists.');
        return;
      }

      let preparation = preparationRun ? preparationRun.preparation : null;
      const recovery = await maybeRecoverImportExtractOcrSetupAndRetry({
        preparation,
        preparationRequest,
        prepareImportExtractSelectedFile,
      });
      if (recovery && recovery.handled) {
        return;
      }
      if (recovery && Object.prototype.hasOwnProperty.call(recovery, 'preparationRun')) {
        preparationRun = recovery.preparationRun;
        if (preparationRun && preparationRun.stale === true) {
          log.info('import/extract prepare retry ignored because a newer prepare attempt exists.');
          return;
        }
        preparation = preparationRun ? preparationRun.preparation : null;
      } else if (recovery && Object.prototype.hasOwnProperty.call(recovery, 'preparation')) {
        preparation = recovery.preparation;
      }

      if (!preparation || preparation.ok !== true) {
        log.error('import/extract prepare IPC failed:', preparation);
        notifyMain(resolvePrimaryAlertKey(preparation));
        return;
      }

      if (preparation.prepareFailed === true) {
        notifyMain(resolvePrimaryAlertKey(preparation));
        return;
      }

      const latestAttemptId = preparationRun ? preparationRun.attemptId : 0;
      if (typeof isLatestImportExtractPrepareAttempt === 'function'
        && !isLatestImportExtractPrepareAttempt(latestAttemptId)) {
        log.info('import/extract prepared result ignored because a newer prepare attempt exists.');
        return;
      }

      let routePreference = '';
      if (preparation.requiresRouteChoice === true) {
        routePreference = await promptImportExtractRouteChoice(preparation);
        if (typeof isLatestImportExtractPrepareAttempt === 'function'
          && !isLatestImportExtractPrepareAttempt(latestAttemptId)) {
          log.info('import/extract route-choice result ignored because a newer prepare attempt exists.');
          return;
        }
        if (routePreference !== 'native' && routePreference !== 'ocr') {
          log.info('import/extract route-choice cancelled by user.');
          return;
        }
      }

      importExtractStatusUi.setPendingExecutionContext({
        preparation,
        routePreference,
      });
      const execution = await executePreparedImportExtract({
        prepareId: preparation.prepareId,
        routePreference,
      });
      if (!execution || execution.ok !== true || !execution.result) {
        importExtractStatusUi.clearPendingExecutionContext();
        if (execution && execution.code === 'ALREADY_ACTIVE' && execution.state) {
          importExtractStatusUi.applyProcessingModeState(execution.state, { source: 'execute_already_active' });
        }
        log.error('import/extract execution IPC failed:', execution);
        notifyMain(resolvePrimaryAlertKey(execution));
        return;
      }

      const warningAlertKeys = Array.isArray(execution.warningAlertKeys)
        ? execution.warningAlertKeys
        : [];
      warningAlertKeys.forEach((alertKey) => {
        if (typeof alertKey === 'string' && alertKey.trim()) {
          notifyMain(alertKey);
        }
      });

      const resultState = execution.result && typeof execution.result.state === 'string'
        ? execution.result.state
        : 'failure';
      if (resultState === 'success') {
        const defaultRepeat = typeof getClipboardRepeatCount === 'function'
          ? getClipboardRepeatCount()
          : 1;
        const applyChoice = await promptImportExtractApplyChoice({
          defaultRepeat,
          elapsedText: importExtractStatusUi.getFinalElapsedText(),
        });
        if (!applyChoice) {
          log.info('import/extract apply choice cancelled by user.');
          return;
        }

        const applyResult = await applyTextViaCanonicalPath({
          mode: applyChoice.mode,
          textToApply: execution.result.text || '',
          repeatCount: applyChoice.repetitions,
        });
        if (!applyResult || applyResult.ok !== true) {
          if (applyResult && applyResult.code === 'PAYLOAD_TOO_LARGE') {
            notifyMain('renderer.alerts.import_extract_apply_too_large');
          } else if (applyResult && applyResult.code === 'TEXT_LIMIT') {
            notifyMain('renderer.alerts.import_extract_apply_text_limit');
          } else {
            notifyMain('renderer.alerts.import_extract_apply_error');
          }
          return;
        }
        if (typeof hasCurrentTextSubscription !== 'function' || !hasCurrentTextSubscription()) {
          throw new Error('current-text-updated subscription unavailable');
        }

        if (applyResult.truncated) {
          notifyMain('renderer.alerts.import_extract_apply_truncated');
        }
        return;
      }

      const primaryAlertKey = resolvePrimaryAlertKey(execution);
      if (primaryAlertKey === 'renderer.alerts.import_extract_native_cancelled'
        || primaryAlertKey === 'renderer.alerts.import_extract_ocr_cancelled') {
        return;
      }
      notifyMain(primaryAlertKey);
    } catch (err) {
      importExtractStatusUi.clearPendingExecutionContext();
      log.error(`Error handling import/extract ${source} entrypoint:`, err);
      notifyMain('renderer.alerts.import_extract_error');
    }
  }

  async function startFromPicker() {
    const { guardUserAction } = requireConfiguredDeps();

    if (typeof guardUserAction !== 'function' || !guardUserAction('import-extract-entrypoint')) return;
    if (hasBlockingModalOpen()) {
      log.info('import/extract picker entry blocked because a main-window modal is open.');
      return;
    }

    try {
      const openImportExtractPicker = getOptionalElectronMethod('openImportExtractPicker', {
        dedupeKey: 'renderer.ipc.openImportExtractPicker.unavailable',
        unavailableMessage: 'openImportExtractPicker unavailable; import/extract entrypoint skipped.'
      });
      if (!openImportExtractPicker) {
        notifyMain('renderer.alerts.import_extract_error');
        return;
      }

      const picker = await openImportExtractPicker();
      if (!picker || picker.ok === false) {
        log.error('import/extract picker failed:', picker && picker.error ? picker.error : picker);
        notifyMain('renderer.alerts.import_extract_error');
        return;
      }
      if (picker.canceled) return;

      await runSharedFlow({
        filePath: picker.filePath || '',
        source: 'picker',
        skipGuard: true,
      });
    } catch (err) {
      log.error('Error handling import/extract picker entrypoint:', err);
      notifyMain('renderer.alerts.import_extract_error');
    }
  }

  async function startFromFilePath({ filePath, source = 'drop' } = {}) {
    await runSharedFlow({
      filePath,
      source,
      actionId: `import-extract-${source}`,
    });
  }

  window.ImportExtractEntry = {
    configure,
    startFromFilePath,
    startFromPicker,
  };
})();

// =============================================================================
// End of public/js/import_extract_entry.js
// =============================================================================
