// electron/import_extract_platform/import_extract_execute_prepared_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process IPC wrapper for executing a previously prepared import/extract run.
// Responsibilities:
// - Validate registration dependencies for the execute IPC path.
// - Authorize the sender against the main window before execution starts.
// - Re-check prepared-record freshness before consuming the prepared ID.
// - Log execute start/completion with route and probe metadata for diagnosis.
// - Delegate the actual route execution to import_extract_prepare_execute_core.

// =============================================================================
// Imports / logger
// =============================================================================

const Log = require('../log');
const {
  consumePreparedRecord,
  peekPreparedRecord,
  readSourceFileFingerprint,
  shortPrepareId,
} = require('./import_extract_prepared_store');
const {
  executePreparedImport,
  isAuthorizedSender,
  resolveExecutePayload,
  resolvePreparedRoute,
} = require('./import_extract_prepare_execute_core');

const log = Log.get('import-extract-execute-prepared-ipc');

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
    primaryAlertKey: 'renderer.alerts.import_extract_prepare_invalid',
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
// IPC registration / handler
// =============================================================================

function registerIpc(ipcMain, { getWindows, resolvePaths, controller } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_execute_prepared_ipc] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[import_extract_execute_prepared_ipc] registerIpc requires getWindows()');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[import_extract_execute_prepared_ipc] registerIpc requires resolvePaths()');
  }
  if (!controller
    || typeof controller.enter !== 'function'
    || typeof controller.exit !== 'function'
    || typeof controller.getState !== 'function'
    || typeof controller.isActive !== 'function') {
    throw new Error('[import_extract_execute_prepared_ipc] registerIpc requires processing-mode controller');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('import-extract-execute-prepared', async (event, payload = {}) => {
    const request = resolveExecutePayload(payload);

    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin, log, 'import-extract-execute-prepared')) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      if (!request.prepareId) {
        return buildInvalidPreparedIdResponse('invalid');
      }

      const preparedLookup = peekPreparedRecord(request.prepareId);
      if (!preparedLookup.ok || !preparedLookup.record) {
        const invalidReason = preparedLookup.reason || 'invalid_or_expired';
        log.warn('import/extract prepared id invalid/expired/reused:', {
          ...buildInvalidPreparedIdLogFields(request.prepareId, invalidReason),
        });
        return buildInvalidPreparedIdResponse(invalidReason);
      }

      const preparedRecord = preparedLookup.record;
      const routeResolution = resolvePreparedRoute(preparedRecord, request.routePreference);
      if (!routeResolution.ok) {
        return {
          ok: false,
          code: routeResolution.reason === 'route_choice_required'
            ? 'ROUTE_CHOICE_REQUIRED'
            : 'ROUTE_RESOLUTION_FAILED',
          primaryAlertKey: 'renderer.alerts.import_extract_route_choice_required',
        };
      }

      let currentFingerprint = null;
      try {
        currentFingerprint = readSourceFileFingerprint(preparedRecord.fileInfo.filePath);
      } catch (err) {
        log.warn('import/extract prepared id invalid/expired/reused:', {
          ...buildInvalidPreparedIdLogFields(request.prepareId, 'fingerprint_read_failed', {
            errorMessage: String(err && err.message ? err.message : err || ''),
          }),
        });
        return buildInvalidPreparedIdResponse('fingerprint_read_failed');
      }

      if (!fingerprintsMatch(preparedRecord.sourceFileFingerprint, currentFingerprint)) {
        log.warn('import/extract prepared id invalid/expired/reused:', {
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
        log.warn('import/extract prepared id invalid/expired/reused:', {
          ...buildInvalidPreparedIdLogFields(request.prepareId, invalidReason),
        });
        return buildInvalidPreparedIdResponse(invalidReason);
      }

      log.info('import/extract execute started:', {
        prepareId: shortPrepareId(request.prepareId),
        sourceFileExt: preparedRecord.fileInfo.sourceFileExt,
        sourceFileKind: preparedRecord.fileInfo.sourceFileKind,
        executionKind: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.executionKind : null,
        pdfTriage: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.pdfTriage : 'not_pdf',
        triageReason: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.triageReason : '',
        availableRoutes: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.availableRoutes : [],
        chosenRoute: routeResolution.productRoute,
        ocrSetupState: preparedRecord.routeMetadata ? preparedRecord.routeMetadata.ocrSetupState : 'not_checked',
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
        log.info('import/extract execute completed:', {
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
          ...getNativeProbeLogFields(execution.routeMetadata),
        });
      }

      return execution;
    } catch (err) {
      log.error('import-extract-execute-prepared failed unexpectedly:', err);
      return {
        ok: false,
        code: 'EXECUTE_PREPARED_IPC_FAILED',
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
// End of electron/import_extract_platform/import_extract_execute_prepared_ipc.js
// =============================================================================
