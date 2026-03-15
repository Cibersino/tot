'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');
const Log = require('../log');
const { validateGoogleDriveOcrSetup } = require('./ocr_google_drive_setup_validation');
const { runGoogleDriveOcrRoute } = require('./ocr_google_drive_route');
const { runNativeExtractionRoute } = require('./native_extraction_route');

const log = Log.get('import-extract-execution-ipc');

const OCR_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);
const OCR_PRIMARY_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'pdf']);

function resolvePayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    filePath: typeof raw.filePath === 'string' ? raw.filePath.trim() : '',
    ocrLanguage: typeof raw.ocrLanguage === 'string' ? raw.ocrLanguage.trim() : '',
  };
}

function getFileInfo(filePath) {
  const normalizedPath = typeof filePath === 'string' ? filePath.trim() : '';
  const resolvedPath = path.resolve(normalizedPath || '');
  const fileName = path.basename(resolvedPath);
  const extWithDot = path.extname(resolvedPath).toLowerCase();
  const sourceFileExt = extWithDot.startsWith('.') ? extWithDot.slice(1) : extWithDot;
  const sourceFileKind = sourceFileExt === 'pdf'
    ? 'pdf'
    : (OCR_IMAGE_EXTENSIONS.has(sourceFileExt) ? 'image' : 'text_document');

  return {
    filePath: normalizedPath,
    resolvedPath,
    fileName,
    sourceFileExt,
    sourceFileKind,
  };
}

function isAuthorizedSender(event, mainWin) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        'import_extract_execution_ipc.unauthorized',
        'import-extract-run-selected-file unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn('import-extract-run-selected-file sender validation failed:', err);
    return false;
  }
}

function resolveRouteKind(fileInfo) {
  if (OCR_PRIMARY_EXTENSIONS.has(fileInfo.sourceFileExt)) {
    return 'ocr';
  }
  return 'native';
}

function buildOcrGateFailureResult(fileInfo, validationResult) {
  const state = validationResult && typeof validationResult.state === 'string'
    ? validationResult.state
    : 'failure';
  const codeFromValidation = validationResult && validationResult.error && typeof validationResult.error.code === 'string'
    ? validationResult.error.code
    : 'platform_runtime_failed';

  const code = codeFromValidation === 'ocr_activation_required'
    ? 'ocr_activation_required'
    : codeFromValidation;

  const message = validationResult
    && validationResult.error
    && typeof validationResult.error.userMessageFallback === 'string'
    && validationResult.error.userMessageFallback.trim()
    ? validationResult.error.userMessageFallback.trim()
    : 'OCR route is unavailable due to setup/auth/runtime constraints.';

  const issueType = validationResult
    && validationResult.error
    && typeof validationResult.error.issueType === 'string'
    ? validationResult.error.issueType
    : 'unknown';

  return {
    state: 'failure',
    executedRoute: 'ocr',
    text: '',
    warnings: [],
    summary: 'OCR route blocked by setup/auth gate.',
    provenance: {
      sourceFileName: fileInfo.fileName,
      sourceFileExt: fileInfo.sourceFileExt,
      sourceFileKind: fileInfo.sourceFileKind,
      ocrProvider: 'google_drive_docs_conversion',
      metadataSafeForLogs: {
        ocrSetupState: state,
      },
    },
    error: {
      code,
      message,
      detailsSafeForLogs: {
        ocrSetupState: state,
        issueType,
      },
    },
  };
}

function resolvePrimaryAlertKey(routeKind, result) {
  const state = result && typeof result.state === 'string' ? result.state : 'failure';
  const code = result && result.error && typeof result.error.code === 'string'
    ? result.error.code
    : '';

  if (routeKind === 'native') {
    if (state === 'success') return 'renderer.alerts.import_extract_native_apply_pending';
    if (state === 'cancelled' || code === 'aborted_by_user') return 'renderer.alerts.import_extract_native_cancelled';
    if (code === 'unsupported_format') return 'renderer.alerts.import_extract_native_unsupported_format';
    return 'renderer.alerts.import_extract_native_runtime_error';
  }

  if (state === 'success') return 'renderer.alerts.import_extract_ocr_apply_pending';
  if (state === 'cancelled' || code === 'aborted_by_user') return 'renderer.alerts.import_extract_ocr_cancelled';
  if (code === 'ocr_activation_required') return 'renderer.alerts.import_extract_ocr_activation_required';
  if (code === 'quota_or_rate_limited') return 'renderer.alerts.import_extract_ocr_quota_or_rate_limited';
  if (code === 'setup_incomplete'
    || code === 'credentials_missing'
    || code === 'auth_failed'
    || code === 'connectivity_failed'
    || code === 'platform_runtime_failed'
    || code === 'ocr_unavailable') {
    return 'renderer.alerts.import_extract_ocr_unavailable';
  }
  return 'renderer.alerts.import_extract_ocr_runtime_error';
}

function resolveWarningAlertKeys(routeKind, result) {
  const warnings = Array.isArray(result && result.warnings) ? result.warnings : [];
  if (routeKind === 'ocr'
    && warnings.some((warning) => typeof warning === 'string' && warning.startsWith('cleanup:'))) {
    return ['renderer.alerts.import_extract_ocr_cleanup_warning'];
  }
  return [];
}

function resolveExitReason(routeKind, result) {
  if (!result || typeof result.state !== 'string') {
    return `import_extract_${routeKind}_finished`;
  }
  if (result.state === 'success') return `import_extract_${routeKind}_success`;
  if (result.state === 'cancelled') return `import_extract_${routeKind}_cancelled`;
  return `import_extract_${routeKind}_failed`;
}

async function executeSelectedFile({
  routeKind,
  fileInfo,
  ocrLanguage,
  resolvePaths,
  controller,
}) {
  if (routeKind === 'native') {
    const nativeResult = await runNativeExtractionRoute({
      filePath: fileInfo.filePath,
      isAborted: () => !controller.isActive(),
      logger: log,
    });
    return {
      routeKind,
      result: nativeResult,
    };
  }

  const paths = resolvePaths();
  const validation = await validateGoogleDriveOcrSetup({
    credentialsPath: paths.credentialsPath,
    tokenPath: paths.tokenPath,
    probeApiPath: true,
  });

  if (!validation || validation.ok !== true) {
    const blockedResult = buildOcrGateFailureResult(fileInfo, validation);
    return {
      routeKind,
      result: blockedResult,
    };
  }

  const ocrResult = await runGoogleDriveOcrRoute({
    filePath: fileInfo.filePath,
    credentialsPath: paths.credentialsPath,
    tokenPath: paths.tokenPath,
    ocrLanguage,
    logger: log,
    isAborted: () => !controller.isActive(),
  });

  return {
    routeKind,
    result: ocrResult,
  };
}

function registerIpc(ipcMain, { getWindows, resolvePaths, controller } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_execution_ipc] registerIpc requires ipcMain');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[import_extract_execution_ipc] registerIpc requires resolvePaths()');
  }
  if (!controller
    || typeof controller.enter !== 'function'
    || typeof controller.exit !== 'function'
    || typeof controller.getState !== 'function'
    || typeof controller.isActive !== 'function') {
    throw new Error('[import_extract_execution_ipc] registerIpc requires processing-mode controller');
  }

  const resolveMainWin = () => {
    if (typeof getWindows === 'function') {
      const windows = getWindows() || {};
      return windows.mainWin || null;
    }
    return null;
  };

  ipcMain.handle('import-extract-run-selected-file', async (event, payload = {}) => {
    const request = resolvePayload(payload);

    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      if (!request.filePath) {
        return { ok: false, code: 'INVALID_FILE_PATH' };
      }

      const fileInfo = getFileInfo(request.filePath);
      const routeKind = resolveRouteKind(fileInfo);

      const enterTransition = controller.enter({
        source: 'import_extract_execution',
        reason: `run_${routeKind}_route`,
      });
      if (!enterTransition.changed && controller.isActive()) {
        return {
          ok: false,
          code: 'ALREADY_ACTIVE',
          state: controller.getState(),
        };
      }

      let executionResult = null;
      try {
        executionResult = await executeSelectedFile({
          routeKind,
          fileInfo,
          ocrLanguage: request.ocrLanguage,
          resolvePaths,
          controller,
        });
      } catch (err) {
        log.error('import/extract execution failed unexpectedly:', err);
        executionResult = {
          routeKind,
          result: {
            state: 'failure',
            executedRoute: routeKind,
            text: '',
            warnings: [],
            summary: 'Import/extract route failed due to an unexpected runtime error.',
            provenance: {
              sourceFileName: fileInfo.fileName,
              sourceFileExt: fileInfo.sourceFileExt,
              sourceFileKind: fileInfo.sourceFileKind,
              ocrProvider: routeKind === 'ocr' ? 'google_drive_docs_conversion' : null,
              metadataSafeForLogs: {},
            },
            error: {
              code: 'platform_runtime_failed',
              message: 'Import/extract route failed due to a platform/runtime error.',
              detailsSafeForLogs: {
                errorMessage: String(err && err.message ? err.message : err || ''),
              },
            },
          },
        };
      } finally {
        if (controller.isActive()) {
          controller.exit({
            source: 'import_extract_execution',
            reason: resolveExitReason(routeKind, executionResult ? executionResult.result : null),
          });
        }
      }

      const primaryAlertKey = resolvePrimaryAlertKey(
        executionResult.routeKind,
        executionResult.result
      );
      const warningAlertKeys = resolveWarningAlertKeys(
        executionResult.routeKind,
        executionResult.result
      );

      log.info('import/extract execution completed:', {
        routeKind: executionResult.routeKind,
        state: executionResult.result && executionResult.result.state ? executionResult.result.state : '',
        code: executionResult.result && executionResult.result.error ? executionResult.result.error.code : '',
        sourceFileExt: executionResult.result && executionResult.result.provenance
          ? executionResult.result.provenance.sourceFileExt
          : '',
        sourceFileKind: executionResult.result && executionResult.result.provenance
          ? executionResult.result.provenance.sourceFileKind
          : '',
      });

      return {
        ok: true,
        routeKind: executionResult.routeKind,
        result: executionResult.result,
        primaryAlertKey,
        warningAlertKeys,
      };
    } catch (err) {
      log.error('import-extract-run-selected-file failed unexpectedly:', err);
      return {
        ok: false,
        code: 'EXECUTION_IPC_FAILED',
        error: String(err),
      };
    }
  });
}

module.exports = {
  registerIpc,
};
