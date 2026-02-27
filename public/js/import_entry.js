// public/js/import_entry.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own import entry wiring for main renderer UI.
// - Normalize and resolve dropped file paths from browser payload variants.
// - Share the same run path for button-based and drop-based imports.
// - Validate required controller dependencies before binding UI actions.
// - Keep renderer.js lean by isolating import orchestration glue.
// =============================================================================
(function initImportEntryModule(globalObj) {
  // =============================================================================
  // Module bootstrap / logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-entry] getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-entry');

  // =============================================================================
  // Helpers (normalization + dropped path extraction)
  // =============================================================================
  function asObject(raw) {
    return (raw && typeof raw === 'object') ? raw : {};
  }

  function normalizeDroppedPath(rawValue) {
    if (typeof rawValue !== 'string') return '';
    let normalized = rawValue.trim();
    if (!normalized) return '';
    if (
      (normalized.startsWith('"') && normalized.endsWith('"'))
      || (normalized.startsWith('\'') && normalized.endsWith('\''))
    ) {
      normalized = normalized.slice(1, -1).trim();
    }
    return normalized;
  }

  function decodeFileUrlToLocalPath(rawUrl) {
    const normalizedUrl = normalizeDroppedPath(rawUrl);
    if (!normalizedUrl || !/^file:\/\//i.test(normalizedUrl)) return '';
    try {
      const parsed = new URL(normalizedUrl);
      if (String(parsed.protocol || '').toLowerCase() !== 'file:') return '';
      const host = String(parsed.hostname || '').trim();
      let pathname = decodeURIComponent(String(parsed.pathname || ''));
      if (host) {
        return `\\\\${host}${pathname.replace(/\//g, '\\')}`;
      }
      if (/^\/[a-zA-Z]:\//.test(pathname)) pathname = pathname.slice(1);
      return pathname.replace(/\//g, '\\');
    } catch (err) {
      log.warnOnce(
        'import-entry.decodeFileUrl.invalid',
        'Failed to decode dropped file URL (falling back to other path extraction):',
        err
      );
      return '';
    }
  }

  function hasFileDragPayload(event) {
    const dt = event && event.dataTransfer;
    if (!dt) return false;
    if (dt.files && dt.files.length > 0) return true;
    const types = dt.types ? Array.from(dt.types).map((item) => String(item || '')) : [];
    return types.includes('Files') || types.includes('text/uri-list');
  }

  function resolveDroppedFilePathFromBridge(fileObj, electronAPI) {
    if (!electronAPI || typeof electronAPI.getPathForDroppedFile !== 'function') {
      log.warnOnce(
        'import-entry.resolvePath.bridge.unavailable',
        'getPathForDroppedFile unavailable; dropped file bridge path resolution skipped.'
      );
      return '';
    }
    try {
      return normalizeDroppedPath(electronAPI.getPathForDroppedFile(fileObj));
    } catch (err) {
      log.warnOnce(
        'import-entry.resolvePath.bridge.failed',
        'Failed to resolve dropped file path from preload bridge (falling back):',
        err
      );
      return '';
    }
  }

  function extractPathFromUriList(rawUriList) {
    const uriList = typeof rawUriList === 'string' ? rawUriList : '';
    if (!uriList.trim()) return '';
    const lines = uriList
      .split(/\r?\n/)
      .map((line) => normalizeDroppedPath(line))
      .filter((line) => line && !line.startsWith('#'));
    for (let i = 0; i < lines.length; i += 1) {
      const candidate = lines[i];
      const fromFileUrl = decodeFileUrlToLocalPath(candidate);
      if (fromFileUrl) return fromFileUrl;
      if (/^[a-zA-Z]:[\\/]/.test(candidate) || /^\\\\/.test(candidate)) return candidate;
    }
    return '';
  }

  function extractPathFromTextPayload(rawText) {
    const text = typeof rawText === 'string' ? rawText : '';
    if (!text.trim()) return '';
    const firstLine = normalizeDroppedPath(text.split(/\r?\n/)[0] || '');
    if (!firstLine) return '';
    const fromFileUrl = decodeFileUrlToLocalPath(firstLine);
    if (fromFileUrl) return fromFileUrl;
    if (/^[a-zA-Z]:[\\/]/.test(firstLine) || /^\\\\/.test(firstLine)) return firstLine;
    return '';
  }

  function resolvePathFromDroppedFileObject(fileObj, electronAPI) {
    const directPath = fileObj && typeof fileObj.path === 'string' ? fileObj.path.trim() : '';
    if (directPath) return directPath;
    const bridgePath = resolveDroppedFilePathFromBridge(fileObj, electronAPI);
    if (bridgePath) return bridgePath;
    return '';
  }

  function extractDroppedFilePath(event, { electronAPI } = {}) {
    const dt = event && event.dataTransfer;
    if (!dt) return '';

    if (dt.files && dt.files.length > 0) {
      const firstFile = dt.files[0];
      const firstPath = resolvePathFromDroppedFileObject(firstFile, electronAPI);
      if (firstPath) return firstPath;
    }

    if (dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i += 1) {
        const item = dt.items[i];
        if (!item || item.kind !== 'file' || typeof item.getAsFile !== 'function') continue;
        const file = item.getAsFile();
        const candidatePath = resolvePathFromDroppedFileObject(file, electronAPI);
        if (candidatePath) return candidatePath;
      }
    }

    const uriListPath = extractPathFromUriList(
      (dt.getData && typeof dt.getData === 'function')
        ? dt.getData('text/uri-list')
        : ''
    );
    if (uriListPath) return uriListPath;

    const textPath = extractPathFromTextPayload(
      (dt.getData && typeof dt.getData === 'function')
        ? dt.getData('text/plain')
        : ''
    );
    if (textPath) return textPath;

    return '';
  }

  // =============================================================================
  // UI wiring (drag and drop entry point)
  // =============================================================================
  function installFileDropHandler(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const target = opts.target && typeof opts.target.addEventListener === 'function'
      ? opts.target
      : globalObj;
    if (!target || typeof target.addEventListener !== 'function') {
      return () => {};
    }

    const guardUserAction = typeof opts.guardUserAction === 'function'
      ? opts.guardUserAction
      : (() => true);
    const onResolvedPath = typeof opts.onResolvedPath === 'function'
      ? opts.onResolvedPath
      : null;
    if (!onResolvedPath) {
      throw new Error('[import-entry] onResolvedPath callback is required');
    }
    const onInvalidPath = typeof opts.onInvalidPath === 'function'
      ? opts.onInvalidPath
      : (() => {});
    const onUnhandledError = typeof opts.onUnhandledError === 'function'
      ? opts.onUnhandledError
      : (() => {});
    const onDragStateChange = typeof opts.onDragStateChange === 'function'
      ? opts.onDragStateChange
      : (() => {});
    const electronAPI = opts.electronAPI && typeof opts.electronAPI === 'object'
      ? opts.electronAPI
      : globalObj.electronAPI;
    let dragDepth = 0;
    let dragActive = false;

    const setDragActive = (nextActive) => {
      const normalizedNext = !!nextActive;
      if (dragActive === normalizedNext) return;
      dragActive = normalizedNext;
      try {
        onDragStateChange(dragActive);
      } catch (err) {
        log.warnOnce(
          'import-entry.onDragStateChange.failed',
          'onDragStateChange callback failed (ignored):',
          err
        );
      }
    };

    const onDragEnter = (event) => {
      if (!hasFileDragPayload(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setDragActive(true);
    };

    const onDragOver = (event) => {
      if (!hasFileDragPayload(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setDragActive(true);
    };

    const resetDragState = () => {
      dragDepth = 0;
      setDragActive(false);
    };

    const onDragLeave = (event) => {
      if (!dragActive) return;
      event.preventDefault();
      if (!event.relatedTarget) {
        resetDragState();
        return;
      }
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        setDragActive(false);
      }
    };

    const onDrop = async (event) => {
      if (!hasFileDragPayload(event)) {
        resetDragState();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      resetDragState();
      if (!guardUserAction()) return;

      try {
        const droppedPath = extractDroppedFilePath(event, { electronAPI });
        if (!droppedPath) {
          onInvalidPath();
          return;
        }
        await onResolvedPath(droppedPath, event);
      } catch (err) {
        onUnhandledError(err);
      }
    };

    const onDragEnd = () => {
      resetDragState();
    };

    target.addEventListener('dragover', onDragOver);
    target.addEventListener('dragenter', onDragEnter);
    target.addEventListener('dragleave', onDragLeave);
    target.addEventListener('drop', onDrop);
    if (globalObj && typeof globalObj.addEventListener === 'function') {
      globalObj.addEventListener('dragend', onDragEnd);
    }

    return () => {
      try {
        target.removeEventListener('dragover', onDragOver);
        target.removeEventListener('dragenter', onDragEnter);
        target.removeEventListener('dragleave', onDragLeave);
        target.removeEventListener('drop', onDrop);
        if (globalObj && typeof globalObj.removeEventListener === 'function') {
          globalObj.removeEventListener('dragend', onDragEnd);
        }
        resetDragState();
      } catch (err) {
        log.warn('Failed to remove drag/drop handlers during cleanup (ignored):', err);
      }
    };
  }

  // =============================================================================
  // Controller factory (button/drop to import flow orchestration)
  // =============================================================================
  function createController(options = {}) {
    const opts = asObject(options);
    const btnImportExtract = opts.btnImportExtract || null;
    const importJobSessionMap = opts.importJobSessionMap;
    const importJobIsOcrMap = opts.importJobIsOcrMap;
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

    function requireControllerCallback(name, callbackFn) {
      if (typeof callbackFn !== 'function') {
        throw new Error(`[import-entry] ${name} callback is required`);
      }
    }

    requireControllerCallback('getOptionalElectronMethod', getOptionalElectronMethod);
    requireControllerCallback('showImportDialogMessage', showImportDialogMessage);
    requireControllerCallback('humanizeImportError', humanizeImportError);
    requireControllerCallback('discardImportSession', discardImportSession);
    requireControllerCallback('getDefaultImportRunOptions', getDefaultImportRunOptions);
    requireControllerCallback('isOcrRoute', isOcrRoute);
    requireControllerCallback('getAvailableOcrLanguages', getAvailableOcrLanguages);
    requireControllerCallback('promptOcrOptionsDialog', promptOcrOptionsDialog);
    requireControllerCallback('showOcrPreconditionWarning', showOcrPreconditionWarning);
    requireControllerCallback('noteQueuedOcrJob', noteQueuedOcrJob);
    if (!(importJobSessionMap instanceof Map) || !(importJobIsOcrMap instanceof Map)) {
      throw new Error('[import-entry] import job maps are required');
    }
    requireControllerCallback('guardUserAction', guardUserAction);

    function setDropHighlightState(active) {
      const doc = globalObj && globalObj.document ? globalObj.document : null;
      const body = doc && doc.body ? doc.body : null;
      if (!body || !body.classList) return;
      body.classList.toggle('file-drop-active', !!active);
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
        log.error('Error selecting dropped file for import:', err);
        return { ok: false, code: 'IMPORT_UNAVAILABLE' };
      }
    }

    function installMainWindowFileDropImport() {
      installFileDropHandler({
        target: globalObj,
        electronAPI,
        onDragStateChange: (active) => {
          setDropHighlightState(active);
        },
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
          log.error('Error in dropped-file import flow:', err);
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
          log.error('Error in import flow:', err);
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

  // =============================================================================
  // Module surface
  // =============================================================================
  globalObj.ImportEntry = Object.freeze({
    createController,
  });
})(window);

// =============================================================================
// End of public/js/import_entry.js
// =============================================================================
