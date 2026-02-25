// public/js/import_entry.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own import entry wiring for main renderer UI.
// - Share the same run path for button-based and drop-based imports.
// - Keep renderer.js lean by isolating orchestration glue.
// =============================================================================
(function initImportEntryModule(globalObj) {
  function asObject(raw) {
    return (raw && typeof raw === 'object') ? raw : {};
  }

  function createController(options = {}) {
    const opts = asObject(options);
    const log = opts.log || console;
    const btnImportExtract = opts.btnImportExtract || null;
    const importJobSessionMap = opts.importJobSessionMap;
    const importJobIsOcrMap = opts.importJobIsOcrMap;
    const importDrop = opts.importDrop || globalObj.ImportDrop || null;
    const electronAPI = opts.electronAPI || globalObj.electronAPI || null;

    const getOptionalElectronMethod = opts.getOptionalElectronMethod;
    const showImportDialogMessage = opts.showImportDialogMessage;
    const humanizeImportError = opts.humanizeImportError;
    const discardImportSession = opts.discardImportSession;
    const getDefaultImportRunOptions = opts.getDefaultImportRunOptions;
    const isOcrRoute = opts.isOcrRoute;
    const getAvailableOcrLanguages = opts.getAvailableOcrLanguages;
    const promptOcrOptionsDialog = opts.promptOcrOptionsDialog;
    const showOcrPreconditionWarning = opts.showOcrPreconditionWarning;
    const noteQueuedOcrJob = opts.noteQueuedOcrJob;
    const guardUserAction = opts.guardUserAction;

    if (typeof getOptionalElectronMethod !== 'function') {
      throw new Error('[import-entry] getOptionalElectronMethod callback is required');
    }
    if (typeof showImportDialogMessage !== 'function') {
      throw new Error('[import-entry] showImportDialogMessage callback is required');
    }
    if (typeof humanizeImportError !== 'function') {
      throw new Error('[import-entry] humanizeImportError callback is required');
    }
    if (typeof discardImportSession !== 'function') {
      throw new Error('[import-entry] discardImportSession callback is required');
    }
    if (typeof getDefaultImportRunOptions !== 'function') {
      throw new Error('[import-entry] getDefaultImportRunOptions callback is required');
    }
    if (typeof isOcrRoute !== 'function') {
      throw new Error('[import-entry] isOcrRoute callback is required');
    }
    if (typeof getAvailableOcrLanguages !== 'function') {
      throw new Error('[import-entry] getAvailableOcrLanguages callback is required');
    }
    if (typeof promptOcrOptionsDialog !== 'function') {
      throw new Error('[import-entry] promptOcrOptionsDialog callback is required');
    }
    if (typeof showOcrPreconditionWarning !== 'function') {
      throw new Error('[import-entry] showOcrPreconditionWarning callback is required');
    }
    if (typeof noteQueuedOcrJob !== 'function') {
      throw new Error('[import-entry] noteQueuedOcrJob callback is required');
    }
    if (!(importJobSessionMap instanceof Map) || !(importJobIsOcrMap instanceof Map)) {
      throw new Error('[import-entry] import job maps are required');
    }
    if (typeof guardUserAction !== 'function') {
      throw new Error('[import-entry] guardUserAction callback is required');
    }

    async function runImportFlowFromSelection(selectRes) {
      if (!selectRes || selectRes.ok !== true || !selectRes.sessionId) {
        const message = humanizeImportError(selectRes);
        if (message) showImportDialogMessage(message);
        return;
      }

      const importRun = getOptionalElectronMethod('importRun', {
        dedupeKey: 'renderer.ipc.importRun.unavailable',
        unavailableMessage: 'importRun unavailable; import execution skipped.'
      });
      if (!importRun) {
        await discardImportSession(selectRes.sessionId);
        return;
      }

      let runOptions = getDefaultImportRunOptions();
      if (isOcrRoute(selectRes.route)) {
        const ocrLangRes = await getAvailableOcrLanguages();
        if (!ocrLangRes || ocrLangRes.ok !== true) {
          const message = humanizeImportError(ocrLangRes);
          if (message) showImportDialogMessage(message);
          await discardImportSession(selectRes.sessionId);
          return;
        }
        const ocrOptsRes = await promptOcrOptionsDialog({
          kind: selectRes.kind,
          filename: selectRes.filename,
          pageCountHint: selectRes.pageCountHint,
          availableUiLanguages: ocrLangRes.availableUiLanguages,
        });
        if (!ocrOptsRes || ocrOptsRes.confirmed !== true) {
          await discardImportSession(selectRes.sessionId);
          return;
        }
        runOptions = Object.assign({}, runOptions, ocrOptsRes.options || {});
      }

      const runRes = await importRun({
        sessionId: selectRes.sessionId,
        options: runOptions,
      });
      if (!runRes || runRes.ok !== true) {
        if (String(runRes && runRes.code || '') === 'OCR_PRECONDITION_FAILED') {
          showOcrPreconditionWarning(runRes);
        } else {
          const message = humanizeImportError(runRes);
          if (message) showImportDialogMessage(message);
        }
        await discardImportSession(selectRes.sessionId);
        return;
      }

      if (runRes.jobId && selectRes.sessionId) {
        const isOcrJob = isOcrRoute(selectRes.route);
        importJobSessionMap.set(String(runRes.jobId), String(selectRes.sessionId));
        importJobIsOcrMap.set(String(runRes.jobId), isOcrJob);
        if (isOcrJob) {
          noteQueuedOcrJob({
            jobId: String(runRes.jobId),
            pageCountHint: Number.isFinite(Number(selectRes.pageCountHint))
              ? Math.max(1, Math.floor(Number(selectRes.pageCountHint)))
              : 0,
            preset: runOptions.preset || runOptions.qualityPreset || 'balanced',
            timeoutPerPageSec: runOptions.timeoutPerPageSec,
            dpi: runOptions.dpi,
            preprocessProfile: runOptions.preprocessProfile,
          });
        }
      }
    }

    async function selectImportSessionFromDroppedFile(filePath) {
      const importSelectFilePath = getOptionalElectronMethod('importSelectFilePath', {
        dedupeKey: 'renderer.ipc.importSelectFilePath.unavailable',
        unavailableMessage: 'importSelectFilePath unavailable; drop import action skipped.'
      });
      if (!importSelectFilePath) {
        return { ok: false, code: 'IMPORT_UNAVAILABLE' };
      }
      try {
        return await importSelectFilePath(filePath);
      } catch (err) {
        if (log && typeof log.error === 'function') {
          log.error('Error selecting dropped file for import:', err);
        }
        return { ok: false, code: 'IMPORT_UNAVAILABLE' };
      }
    }

    function installMainWindowFileDropImport() {
      if (!importDrop || typeof importDrop.installFileDropHandler !== 'function') {
        if (log && typeof log.warnOnce === 'function') {
          log.warnOnce(
            'renderer.importDrop.unavailable',
            'ImportDrop module unavailable; file-drop import disabled.'
          );
        } else if (log && typeof log.warn === 'function') {
          log.warn('ImportDrop module unavailable; file-drop import disabled.');
        }
        return;
      }

      importDrop.installFileDropHandler({
        target: globalObj,
        electronAPI,
        logger: log,
        guardUserAction: () => guardUserAction('import-drop-file'),
        onResolvedPath: async (droppedPath) => {
          const selectRes = await selectImportSessionFromDroppedFile(droppedPath);
          if (!selectRes || selectRes.ok !== true) {
            const message = humanizeImportError(selectRes);
            if (message) showImportDialogMessage(message);
            return;
          }
          await runImportFlowFromSelection(selectRes);
        },
        onInvalidPath: () => {
          showImportDialogMessage('renderer.alerts.import_invalid_path');
        },
        onUnhandledError: (err) => {
          if (log && typeof log.error === 'function') {
            log.error('Error in dropped-file import flow:', err);
          }
          showImportDialogMessage('renderer.alerts.import_unexpected');
        },
      });
    }

    function bindImportButton() {
      if (!btnImportExtract || typeof btnImportExtract.addEventListener !== 'function') return;
      btnImportExtract.addEventListener('click', async () => {
        if (!guardUserAction('import-select-file')) return;
        try {
          const importSelectFile = getOptionalElectronMethod('importSelectFile', {
            dedupeKey: 'renderer.ipc.importSelectFile.unavailable',
            unavailableMessage: 'importSelectFile unavailable; import action skipped.'
          });
          if (!importSelectFile) {
            showImportDialogMessage('renderer.alerts.import_unavailable');
            return;
          }

          const selectRes = await importSelectFile();
          if (!selectRes || selectRes.ok !== true) {
            const message = humanizeImportError(selectRes);
            if (message) showImportDialogMessage(message);
            return;
          }
          await runImportFlowFromSelection(selectRes);
        } catch (err) {
          if (log && typeof log.error === 'function') {
            log.error('Error in import flow:', err);
          }
          showImportDialogMessage('renderer.alerts.import_unexpected');
        }
      });
    }

    function bind() {
      bindImportButton();
      installMainWindowFileDropImport();
    }

    return Object.freeze({
      bind,
    });
  }

  globalObj.ImportEntry = Object.freeze({
    createController,
  });
})(window);
