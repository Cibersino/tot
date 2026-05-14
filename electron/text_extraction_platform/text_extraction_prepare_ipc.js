// electron/text_extraction_platform/text_extraction_prepare_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process IPC wrapper for text extraction prepare requests.
// Responsibilities:
// - Register the 'text-extraction-prepare-selected-file' IPC handler.
// - Authorize the sender against the current main window before preparing work.
// - Delegate prepare policy and route analysis to text_extraction_prepare_execute_core.js.
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
} = require('./text_extraction_prepared_store');
const {
  getFileInfo,
  isAuthorizedSender,
  prepareSelectedFile,
  resolvePreparePayload,
} = require('./text_extraction_prepare_execute_core');

const log = Log.get('text-extraction-prepare-ipc');

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
    nativeProbeTotalPages: Number.isFinite(metadata.totalPages) ? metadata.totalPages : 0,
    foundAtPage: Number.isFinite(metadata.foundAtPage) ? metadata.foundAtPage : null,
    probedFromPage: Number.isFinite(metadata.probedFromPage) ? metadata.probedFromPage : null,
    probedToPage: Number.isFinite(metadata.probedToPage) ? metadata.probedToPage : null,
    selectedPageCount: Number.isFinite(metadata.selectedPageCount) ? metadata.selectedPageCount : null,
    elapsedMs: Number.isFinite(metadata.elapsedMs) ? metadata.elapsedMs : 0,
  };
}

function buildPrepareRouteLogFields(fileInfo, routeMetadata, { ocrSetupStateFallback = 'not_checked' } = {}) {
  const pdfPageSelection = routeMetadata && routeMetadata.pdfPageSelection && typeof routeMetadata.pdfPageSelection === 'object'
    ? routeMetadata.pdfPageSelection
    : null;
  return {
    sourceFileExt: fileInfo.sourceFileExt,
    sourceFileKind: fileInfo.sourceFileKind,
    executionKind: routeMetadata ? routeMetadata.executionKind : null,
    pdfTriage: routeMetadata ? routeMetadata.pdfTriage : 'not_pdf',
    triageReason: routeMetadata ? routeMetadata.triageReason : '',
    availableRoutes: routeMetadata ? routeMetadata.availableRoutes : [],
    chosenRoute: routeMetadata ? routeMetadata.chosenRoute : null,
    ocrSetupState: routeMetadata ? routeMetadata.ocrSetupState : ocrSetupStateFallback,
    pdfPageSelectionMode: pdfPageSelection ? pdfPageSelection.mode : '',
    selectedRangeFromPage: pdfPageSelection ? pdfPageSelection.fromPage : null,
    selectedRangeToPage: pdfPageSelection ? pdfPageSelection.toPage : null,
    selectedPageCount: pdfPageSelection ? pdfPageSelection.selectedPageCount : null,
    pdfTotalPages: pdfPageSelection ? pdfPageSelection.totalPages : null,
    generatedPdfArtifactPolicyMode:
      routeMetadata && typeof routeMetadata.generatedPdfArtifactPolicyMode === 'string'
        ? routeMetadata.generatedPdfArtifactPolicyMode
        : '',
    ...getNativeProbeLogFields(routeMetadata),
  };
}

function resolveMainWindow(getWindows) {
  const windows = getWindows() || {};
  return windows.mainWin || null;
}

// =============================================================================
// IPC registration / handler
// =============================================================================

function registerIpc(ipcMain, { getWindows, resolvePaths } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[text_extraction_prepare_ipc] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[text_extraction_prepare_ipc] registerIpc requires getWindows()');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[text_extraction_prepare_ipc] registerIpc requires resolvePaths()');
  }

  ipcMain.handle('text-extraction-prepare-selected-file', async (event, payload = {}) => {
    const request = resolvePreparePayload(payload);
    const fileInfo = getFileInfo(request.filePath);

    try {
      const mainWin = resolveMainWindow(getWindows);
      if (!isAuthorizedSender(event, mainWin, log, 'text-extraction-prepare-selected-file')) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      if (!request.filePath) {
        return { ok: false, code: 'INVALID_FILE_PATH' };
      }

      log.info('text extraction prepare started:', {
        sourceFileExt: fileInfo.sourceFileExt,
        sourceFileKind: fileInfo.sourceFileKind,
      });

      const preparation = await prepareSelectedFile({
        filePath: request.filePath,
        ocrLanguage: request.ocrLanguage,
        planningMode: request.planningMode,
        forceHeavySplitFullSource: request.forceHeavySplitFullSource,
        pdfPageSelection: request.pdfPageSelection,
        generatedPdfArtifactPolicy: request.generatedPdfArtifactPolicy,
        resolvePaths,
        log,
      });
      const routeMetadata = preparation ? (preparation.routeMetadata || null) : null;

      if (preparation && preparation.ok === true && preparation.prepareFailed === true) {
        log.warn('text extraction prepare failed:', {
          ...buildPrepareRouteLogFields(fileInfo, routeMetadata, { ocrSetupStateFallback: 'failure' }),
          code: preparation.error && preparation.error.code ? preparation.error.code : '',
        });
        return preparation;
      }

      if (!preparation || preparation.ok !== true || preparation.prepareReady !== true || !preparation.preparedPayload) {
        log.error('text extraction prepare returned unexpected shape:', preparation);
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
        log.error('text extraction prepare fingerprint read failed:', err);
        return {
          ok: true,
          prepareFailed: true,
          executionKind: null,
          routeMetadata,
          primaryAlertKey: 'renderer.alerts.text_extraction_error',
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

      const logPayload = {
        prepareId: shortPrepareId(preparedRecord.prepareId),
        forceHeavySplitFullSource: preparation.forceHeavySplitFullSource === true,
        ...buildPrepareRouteLogFields(fileInfo, routeMetadata),
      };

      if (preparation.requiresRouteChoice === true) {
        log.info('text extraction prepare choice-required:', logPayload);
      }

      log.info('text extraction prepare completed:', logPayload);

      return {
        ok: true,
        prepareReady: true,
        prepareFailed: false,
        prepareId: preparedRecord.prepareId,
        expiresAtEpochMs: preparedRecord.expiresAtEpochMs,
        fileInfo: preparation.fileInfo && typeof preparation.fileInfo === 'object'
          ? { ...preparation.fileInfo }
          : null,
        planningMode: typeof preparation.planningMode === 'string'
          ? preparation.planningMode
          : request.planningMode,
        forceHeavySplitFullSource: preparation.forceHeavySplitFullSource === true,
        executionKind: preparation.executionKind || null,
        pdfPageSelection: preparation.pdfPageSelection && typeof preparation.pdfPageSelection === 'object'
          ? { ...preparation.pdfPageSelection }
          : null,
        generatedPdfArtifactPolicy:
          preparation.generatedPdfArtifactPolicy
          && typeof preparation.generatedPdfArtifactPolicy === 'object'
            ? { ...preparation.generatedPdfArtifactPolicy }
            : null,
        processingInputFileName:
          typeof preparation.processingInputFileName === 'string'
            ? preparation.processingInputFileName
            : '',
        routeMetadata,
        requiresRouteChoice: preparation.requiresRouteChoice === true,
        routeChoiceOptions: Array.isArray(preparation.routeChoiceOptions)
          ? preparation.routeChoiceOptions
          : [],
      };
    } catch (err) {
      log.error('text-extraction-prepare-selected-file failed unexpectedly:', err);
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
// End of electron/text_extraction_platform/text_extraction_prepare_ipc.js
// =============================================================================
