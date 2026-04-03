// electron/import_extract_platform/import_extract_prepare_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process IPC wrapper for import/extract prepare requests.
// Responsibilities:
// - Register the 'import-extract-prepare-selected-file' IPC handler.
// - Authorize the sender against the current main window before preparing work.
// - Delegate prepare policy and route analysis to import_extract_prepare_execute_core.js.
// - Persist prepared-record fingerprints needed by the later execute step.
// - Keep prepare telemetry and failure shaping stable for renderer consumers.

// =============================================================================
// Imports / logger
// =============================================================================

const Log = require('../log');
const {
  createPreparedRecord,
  readSourceFileFingerprint,
  shortPrepareId,
} = require('./import_extract_prepared_store');
const {
  getFileInfo,
  isAuthorizedSender,
  prepareSelectedFile,
  resolvePreparePayload,
} = require('./import_extract_prepare_execute_core');

const log = Log.get('import-extract-prepare-ipc');

// =============================================================================
// Helpers
// =============================================================================

function getNativeProbeLogFields(routeMetadata) {
  const metadata = routeMetadata && routeMetadata.nativeProbeMetadata && typeof routeMetadata.nativeProbeMetadata === 'object'
    ? routeMetadata.nativeProbeMetadata
    : {};
  return {
    nativeProbeCode: routeMetadata ? routeMetadata.nativeProbeCode : '',
    nativeProbeErrorName: routeMetadata ? routeMetadata.nativeProbeErrorName : '',
    nativeProbeErrorCode: routeMetadata ? routeMetadata.nativeProbeErrorCode : '',
    nativeProbeSelectableText: routeMetadata ? routeMetadata.nativeProbeSelectableText : '',
    pagesScanned: Number.isFinite(metadata.pagesScanned) ? metadata.pagesScanned : 0,
    totalPages: Number.isFinite(metadata.totalPages) ? metadata.totalPages : 0,
    foundAtPage: Number.isFinite(metadata.foundAtPage) ? metadata.foundAtPage : null,
    elapsedMs: Number.isFinite(metadata.elapsedMs) ? metadata.elapsedMs : 0,
  };
}

function buildPrepareRouteLogFields(fileInfo, routeMetadata, { ocrSetupStateFallback = 'not_checked' } = {}) {
  return {
    sourceFileExt: fileInfo.sourceFileExt,
    sourceFileKind: fileInfo.sourceFileKind,
    executionKind: routeMetadata ? routeMetadata.executionKind : null,
    pdfTriage: routeMetadata ? routeMetadata.pdfTriage : 'not_pdf',
    triageReason: routeMetadata ? routeMetadata.triageReason : '',
    availableRoutes: routeMetadata ? routeMetadata.availableRoutes : [],
    chosenRoute: routeMetadata ? routeMetadata.chosenRoute : null,
    ocrSetupState: routeMetadata ? routeMetadata.ocrSetupState : ocrSetupStateFallback,
    ...getNativeProbeLogFields(routeMetadata),
  };
}

// =============================================================================
// IPC registration / handler
// =============================================================================

function registerIpc(ipcMain, { getWindows, resolvePaths } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_prepare_ipc] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[import_extract_prepare_ipc] registerIpc requires getWindows()');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[import_extract_prepare_ipc] registerIpc requires resolvePaths()');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('import-extract-prepare-selected-file', async (event, payload = {}) => {
    const request = resolvePreparePayload(payload);
    const fileInfo = getFileInfo(request.filePath);

    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin, log, 'import-extract-prepare-selected-file')) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      if (!request.filePath) {
        return { ok: false, code: 'INVALID_FILE_PATH' };
      }

      log.info('import/extract prepare started:', {
        sourceFileExt: fileInfo.sourceFileExt,
        sourceFileKind: fileInfo.sourceFileKind,
      });

      const preparation = await prepareSelectedFile({
        filePath: request.filePath,
        ocrLanguage: request.ocrLanguage,
        resolvePaths,
        log,
      });

      if (preparation && preparation.ok === true && preparation.prepareFailed === true) {
        const routeMetadata = preparation.routeMetadata || null;
        log.warn('import/extract prepare failed:', {
          ...buildPrepareRouteLogFields(fileInfo, routeMetadata, { ocrSetupStateFallback: 'failure' }),
          code: preparation.error && preparation.error.code ? preparation.error.code : '',
        });
        return preparation;
      }

      if (!preparation || preparation.ok !== true || preparation.prepareReady !== true || !preparation.preparedPayload) {
        log.error('import/extract prepare returned unexpected shape:', preparation);
        return {
          ok: false,
          code: 'PREPARE_SHAPE_INVALID',
        };
      }

      let sourceFileFingerprint = null;
      try {
        sourceFileFingerprint = readSourceFileFingerprint(request.filePath);
      } catch (err) {
        // Fingerprint loss invalidates execute-time freshness checks, so degrade
        // to a structured prepare failure instead of exposing a prepared ID.
        log.error('import/extract prepare fingerprint read failed:', err);
        return {
          ok: true,
          prepareFailed: true,
          executionKind: null,
          routeMetadata: preparation.routeMetadata || null,
          primaryAlertKey: 'renderer.alerts.import_extract_error',
          warningAlertKeys: [],
          error: {
            code: 'unreadable_or_corrupt',
            message: 'Selected file is missing or unreadable before execute.',
            detailsSafeForLogs: {
              stage: 'prepare_fingerprint',
              errorMessage: String(err && err.message ? err.message : err || ''),
            },
          },
        };
      }

      const preparedRecord = createPreparedRecord({
        ...preparation.preparedPayload,
        sourceFileFingerprint,
      });

      const routeMetadata = preparation.routeMetadata || null;
      const logPayload = {
        prepareId: shortPrepareId(preparedRecord.prepareId),
        ...buildPrepareRouteLogFields(fileInfo, routeMetadata),
      };

      if (preparation.requiresRouteChoice === true) {
        log.info('import/extract prepare choice-required:', logPayload);
      }

      log.info('import/extract prepare completed:', logPayload);

      return {
        ok: true,
        prepareId: preparedRecord.prepareId,
        expiresAtEpochMs: preparedRecord.expiresAtEpochMs,
        executionKind: preparation.executionKind || null,
        routeMetadata,
        requiresRouteChoice: preparation.requiresRouteChoice === true,
        routeChoiceOptions: Array.isArray(preparation.routeChoiceOptions)
          ? preparation.routeChoiceOptions
          : [],
      };
    } catch (err) {
      log.error('import-extract-prepare-selected-file failed unexpectedly:', err);
      return {
        ok: false,
        code: 'PREPARE_IPC_FAILED',
        error: String(err),
      };
    }
  });
}

// =============================================================================
// Module surface
// =============================================================================

module.exports = {
  registerIpc,
};

// =============================================================================
// End of electron/import_extract_platform/import_extract_prepare_ipc.js
// =============================================================================
