// electron/text_extraction_platform/text_extraction_execute_prepared_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process IPC wrapper for executing a previously prepared text extraction run.
// Responsibilities:
// - Validate registration dependencies for the execute IPC path.
// - Authorize the sender against the main window before execution starts.
// - Re-check prepared-record freshness before consuming the prepared ID.
// - Log execute start/completion with route and probe metadata for diagnosis.
// - Delegate the actual route execution to text_extraction_prepare_execute_core.

// =============================================================================
// Imports / logger
// =============================================================================

const Log = require('../log');
const {
  consumePreparedRecord,
  peekPreparedRecord,
  readSourceFileFingerprint,
  shortPrepareId,
} = require('./text_extraction_prepared_store');
const {
  executePreparedImport,
  isAuthorizedSender,
  resolveExecutePayload,
  resolvePreparedRoute,
} = require('./text_extraction_prepare_execute_core');

const log = Log.get('text-extraction-execute-prepared-ipc');

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

function getPdfSelectionLogFields(preparedRecord) {
  const pdfPageSelection = preparedRecord
    && preparedRecord.pdfPageSelection
    && typeof preparedRecord.pdfPageSelection === 'object'
      ? preparedRecord.pdfPageSelection
      : null;
  return {
    pdfPageSelectionMode: pdfPageSelection ? pdfPageSelection.mode : '',
    selectedRangeFromPage: pdfPageSelection ? pdfPageSelection.fromPage : null,
    selectedRangeToPage: pdfPageSelection ? pdfPageSelection.toPage : null,
    selectedPageCount: pdfPageSelection ? pdfPageSelection.selectedPageCount : null,
    pdfTotalPages: pdfPageSelection ? pdfPageSelection.totalPages : null,
    generatedPdfArtifactPolicyMode:
      preparedRecord
      && preparedRecord.generatedPdfArtifactPolicy
      && typeof preparedRecord.generatedPdfArtifactPolicy.mode === 'string'
        ? preparedRecord.generatedPdfArtifactPolicy.mode
        : '',
  };
}

function fingerprintsMatch(expected, actual) {
  if (!expected || !actual) return false;
  return expected.path === actual.path
    && expected.size === actual.size
    && expected.mtimeMs === actual.mtimeMs;
}

function buildInvalidPreparedIdResponse(reason) {
  return {
    ok: false,
    code: 'PREPARED_ID_INVALID',
    invalidReason: reason,
    primaryAlertKey: 'renderer.alerts.text_extraction_prepare_invalid',
  };
}

function buildInvalidPreparedIdLogFields(prepareId, reason, extraFields = {}) {
  return {
    prepareId: shortPrepareId(prepareId),
    reason,
    ...extraFields,
  };
}

// =============================================================================
// IPC handler
// =============================================================================

async function handleExecutePrepared(event, payload = {}, {
  resolveMainWin,
  resolvePaths,
  controller,
} = {}) {
  const request = resolveExecutePayload(payload);

  try {
    const mainWin = resolveMainWin();
    if (!isAuthorizedSender(event, mainWin, log, 'text-extraction-execute-prepared')) {
      return { ok: false, code: 'UNAUTHORIZED' };
    }
    if (!request.prepareId) {
      log.warn('text-extraction-execute-prepared invalid payload (ignored): missing prepareId.');
      return buildInvalidPreparedIdResponse('invalid');
    }

    const preparedLookup = peekPreparedRecord(request.prepareId);
    if (!preparedLookup.ok || !preparedLookup.record) {
      const invalidReason = preparedLookup.reason || 'invalid_or_expired';
      log.warn('text extraction prepared id invalid/expired/reused:', {
        ...buildInvalidPreparedIdLogFields(request.prepareId, invalidReason),
      });
      return buildInvalidPreparedIdResponse(invalidReason);
    }

    const preparedRecord = preparedLookup.record;
    const routeResolution = resolvePreparedRoute(preparedRecord, request.routePreference);
    if (!routeResolution.ok) {
      if (routeResolution.reason !== 'route_choice_required') {
        log.warn('text-extraction-execute-prepared route resolution failed:', {
          prepareId: shortPrepareId(request.prepareId),
          reason: routeResolution.reason || 'route_resolution_failed',
          routePreference: request.routePreference || null,
          chosenRoute:
            preparedRecord.routeMetadata && typeof preparedRecord.routeMetadata.chosenRoute === 'string'
              ? preparedRecord.routeMetadata.chosenRoute
              : null,
          availableRoutes:
            preparedRecord.routeMetadata && Array.isArray(preparedRecord.routeMetadata.availableRoutes)
              ? preparedRecord.routeMetadata.availableRoutes
              : [],
        });
      }
      return {
        ok: false,
        code: routeResolution.reason === 'route_choice_required'
          ? 'ROUTE_CHOICE_REQUIRED'
          : 'ROUTE_RESOLUTION_FAILED',
        primaryAlertKey: 'renderer.alerts.text_extraction_route_choice_required',
      };
    }

    let currentFingerprint = null;
    try {
      currentFingerprint = readSourceFileFingerprint(preparedRecord.fileInfo.filePath);
    } catch (err) {
      log.warn('text extraction prepared id invalid/expired/reused:', {
        errorMessage: String(err && err.message ? err.message : err || ''),
        ...buildInvalidPreparedIdLogFields(request.prepareId, 'fingerprint_read_failed'),
      });
      return buildInvalidPreparedIdResponse('fingerprint_read_failed');
    }

    if (!fingerprintsMatch(preparedRecord.sourceFileFingerprint, currentFingerprint)) {
      log.warn('text extraction prepared id invalid/expired/reused:', {
        ...buildInvalidPreparedIdLogFields(request.prepareId, 'fingerprint_mismatch'),
      });
      return buildInvalidPreparedIdResponse('fingerprint_mismatch');
    }

    if (controller.isActive()) {
      return {
        ok: false,
        code: 'ALREADY_ACTIVE',
        state: controller.getState(),
      };
    }

    const consumeResult = consumePreparedRecord(request.prepareId);
    if (!consumeResult.ok || !consumeResult.record) {
      const invalidReason = consumeResult.reason || 'invalid_or_expired';
      log.warn('text extraction prepared id invalid/expired/reused:', {
        ...buildInvalidPreparedIdLogFields(request.prepareId, invalidReason),
      });
      return buildInvalidPreparedIdResponse(invalidReason);
    }

    log.info('text extraction execute started:', {
      prepareId: shortPrepareId(request.prepareId),
      sourceFileExt: preparedRecord.fileInfo.sourceFileExt,
      sourceFileKind: preparedRecord.fileInfo.sourceFileKind,
      executionKind: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.executionKind : null,
      pdfTriage: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.pdfTriage : 'not_pdf',
      triageReason: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.triageReason : '',
      availableRoutes: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.availableRoutes : [],
      chosenRoute: routeResolution.productRoute,
      ocrSetupState: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.ocrSetupState : 'not_checked',
      ...getPdfSelectionLogFields(preparedRecord),
      ...getNativeProbeLogFields(preparedRecord.routeMetadata),
    });

    const execution = await executePreparedImport({
      preparedRecord,
      routePreference: request.routePreference,
      resolvePaths,
      controller,
      log,
    });

    if (execution && execution.ok === true) {
      log.info('text extraction execute completed:', {
        prepareId: shortPrepareId(request.prepareId),
        executionKind: execution.executionKind,
        state: execution.result && execution.result.state ? execution.result.state : '',
        code: execution.result && execution.result.error ? execution.result.error.code : '',
        warnings: Array.isArray(execution.result && execution.result.warnings)
          ? execution.result.warnings
          : [],
        pdfTriage: execution.routeMetadata ? execution.routeMetadata.pdfTriage : 'not_pdf',
        triageReason: execution.routeMetadata ? execution.routeMetadata.triageReason : '',
        availableRoutes: execution.routeMetadata ? execution.routeMetadata.availableRoutes : [],
        chosenRoute: execution.routeMetadata ? execution.routeMetadata.chosenRoute : null,
        executedRoute: execution.routeMetadata ? execution.routeMetadata.executedRoute : null,
        sourceFileExt: execution.result && execution.result.provenance
          ? execution.result.provenance.sourceFileExt
          : '',
        sourceFileKind: execution.result && execution.result.provenance
          ? execution.result.provenance.sourceFileKind
          : '',
        ...getPdfSelectionLogFields(preparedRecord),
        ...getNativeProbeLogFields(execution.routeMetadata),
      });
    }

    return execution;
  } catch (err) {
    log.error('text-extraction-execute-prepared failed unexpectedly:', err);
    return {
      ok: false,
      code: 'EXECUTE_PREPARED_IPC_FAILED',
      error: String(err),
    };
  }
}

// =============================================================================
// IPC registration
// =============================================================================

function registerIpc(ipcMain, { getWindows, resolvePaths, controller } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    log.error('[text_extraction_execute_prepared_ipc] registerIpc requires ipcMain');
    throw new Error('[text_extraction_execute_prepared_ipc] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    log.error('[text_extraction_execute_prepared_ipc] registerIpc requires getWindows()');
    throw new Error('[text_extraction_execute_prepared_ipc] registerIpc requires getWindows()');
  }
  if (typeof resolvePaths !== 'function') {
    log.error('[text_extraction_execute_prepared_ipc] registerIpc requires resolvePaths()');
    throw new Error('[text_extraction_execute_prepared_ipc] registerIpc requires resolvePaths()');
  }
  if (!controller
    || typeof controller.enter !== 'function'
    || typeof controller.exit !== 'function'
    || typeof controller.getState !== 'function'
    || typeof controller.isActive !== 'function') {
    log.error('[text_extraction_execute_prepared_ipc] registerIpc requires processing-mode controller');
    throw new Error('[text_extraction_execute_prepared_ipc] registerIpc requires processing-mode controller');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  try {
    ipcMain.handle('text-extraction-execute-prepared', (event, payload = {}) => handleExecutePrepared(
      event,
      payload,
      {
        resolveMainWin,
        resolvePaths,
        controller,
      }
    ));
  } catch (err) {
    log.error('text-extraction-execute-prepared IPC registration failed:', err);
    throw err;
  }
}

// =============================================================================
// Module surface
// =============================================================================

module.exports = {
  registerIpc,
};

// =============================================================================
// End of electron/text_extraction_platform/text_extraction_execute_prepared_ipc.js
// =============================================================================
