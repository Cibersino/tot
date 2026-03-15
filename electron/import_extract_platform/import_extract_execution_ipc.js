'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');
const Log = require('../log');
const { validateGoogleDriveOcrSetup } = require('./ocr_google_drive_setup_validation');
const { runGoogleDriveOcrRoute } = require('./ocr_google_drive_route');
const { runNativeExtractionRoute } = require('./native_extraction_route');

const log = Log.get('import-extract-execution-ipc');

const OCR_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);

function resolvePayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const routePreference = typeof raw.routePreference === 'string'
    ? raw.routePreference.trim().toLowerCase()
    : '';
  return {
    filePath: typeof raw.filePath === 'string' ? raw.filePath.trim() : '',
    ocrLanguage: typeof raw.ocrLanguage === 'string' ? raw.ocrLanguage.trim() : '',
    routePreference: (routePreference === 'native' || routePreference === 'ocr')
      ? routePreference
      : '',
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

function resolveSetupState(validationResult) {
  if (validationResult && validationResult.ok === true) return 'ready';
  const state = validationResult && typeof validationResult.state === 'string'
    ? validationResult.state
    : 'failure';
  if (state === 'setup_incomplete' || state === 'ocr_activation_required') return state;
  return 'failure';
}

function hasUsableExtractedText(result) {
  return !!(result
    && result.state === 'success'
    && typeof result.text === 'string'
    && result.text.trim().length > 0);
}

function buildRouteMetadata({
  fileInfo,
  availableRoutes,
  chosenRoute,
  executedRoute = null,
  pdfTriage = 'not_pdf',
  triageReason = '',
  ocrSetupState = 'not_checked',
}) {
  return {
    fileKind: fileInfo.sourceFileKind,
    availableRoutes: Array.isArray(availableRoutes) ? availableRoutes : [],
    chosenRoute,
    executedRoute,
    pdfTriage,
    triageReason,
    ocrSetupState,
  };
}

function resolveNonPdfRouteDecision(fileInfo) {
  const routeKind = OCR_IMAGE_EXTENSIONS.has(fileInfo.sourceFileExt) ? 'ocr' : 'native';
  return {
    routeKind,
    requiresRouteChoice: false,
    routeMetadata: buildRouteMetadata({
      fileInfo,
      availableRoutes: [routeKind],
      chosenRoute: routeKind,
      pdfTriage: 'not_pdf',
      triageReason: 'non_pdf',
      ocrSetupState: routeKind === 'ocr' ? 'not_checked' : 'not_checked',
    }),
    nativeProbeResult: null,
    ocrValidation: null,
  };
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

async function triagePdfRoutes({
  fileInfo,
  resolvePaths,
  routePreference,
}) {
  const nativeProbeResult = await runNativeExtractionRoute({
    filePath: fileInfo.filePath,
    isAborted: () => false,
    logger: log,
  });
  const nativeAvailable = hasUsableExtractedText(nativeProbeResult);

  const paths = resolvePaths();
  const ocrValidation = await validateGoogleDriveOcrSetup({
    credentialsPath: paths.credentialsPath,
    tokenPath: paths.tokenPath,
    probeApiPath: true,
  });
  const ocrReady = !!(ocrValidation && ocrValidation.ok === true);
  const ocrSetupState = resolveSetupState(ocrValidation);

  let pdfTriage = 'ocr_only';
  let triageReason = 'no_native_text_layer_detected';
  let availableRoutes = ['ocr'];
  let chosenRoute = 'ocr';
  let requiresRouteChoice = false;

  if (nativeAvailable && ocrReady) {
    pdfTriage = 'both';
    triageReason = 'native_text_detected_and_ocr_ready';
    availableRoutes = ['native', 'ocr'];
    if (routePreference === 'native' || routePreference === 'ocr') {
      chosenRoute = routePreference;
      triageReason = `native_text_detected_and_ocr_ready_preferred_${routePreference}`;
    } else {
      chosenRoute = null;
      requiresRouteChoice = true;
      triageReason = 'native_text_detected_and_ocr_ready_choice_required';
    }
  } else if (nativeAvailable && !ocrReady) {
    pdfTriage = 'native_only';
    triageReason = 'native_text_detected_ocr_unavailable';
    availableRoutes = ['native'];
    chosenRoute = 'native';
  } else if (!nativeAvailable && ocrReady) {
    pdfTriage = 'ocr_only';
    triageReason = 'no_native_text_layer_detected';
    availableRoutes = ['ocr'];
    chosenRoute = 'ocr';
  } else {
    pdfTriage = 'ocr_only';
    triageReason = 'no_native_text_layer_and_ocr_unavailable';
    availableRoutes = ['ocr'];
    chosenRoute = 'ocr';
  }

  if ((routePreference === 'native' || routePreference === 'ocr')
    && chosenRoute !== routePreference
    && (chosenRoute === 'native' || chosenRoute === 'ocr')) {
    log.warn('import/extract route fallback applied:', {
      fallbackType: 'requested_route_unavailable',
      requestedRoute: routePreference,
      chosenRoute,
      availableRoutes,
      sourceFileKind: fileInfo.sourceFileKind,
      sourceFileExt: fileInfo.sourceFileExt,
      pdfTriage,
      triageReason,
      ocrSetupState,
    });
  }

  return {
    routeKind: chosenRoute,
    requiresRouteChoice,
    routeMetadata: buildRouteMetadata({
      fileInfo,
      availableRoutes,
      chosenRoute,
      pdfTriage,
      triageReason,
      ocrSetupState,
    }),
    nativeProbeResult,
    ocrValidation,
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
  routeDecision,
  fileInfo,
  ocrLanguage,
  resolvePaths,
  controller,
}) {
  const routeKind = routeDecision.routeKind;

  if (routeKind === 'native') {
    const nativeResult = routeDecision.nativeProbeResult || await runNativeExtractionRoute({
      filePath: fileInfo.filePath,
      isAborted: () => !controller.isActive(),
      logger: log,
    });

    const routeMetadata = {
      ...routeDecision.routeMetadata,
      executedRoute: 'native',
    };
    return {
      routeKind,
      result: nativeResult,
      routeMetadata,
    };
  }

  let validation = routeDecision.ocrValidation || null;
  let ocrSetupState = resolveSetupState(validation);
  if (!validation) {
    const paths = resolvePaths();
    validation = await validateGoogleDriveOcrSetup({
      credentialsPath: paths.credentialsPath,
      tokenPath: paths.tokenPath,
      probeApiPath: true,
    });
    ocrSetupState = resolveSetupState(validation);
  }

  if (!validation || validation.ok !== true) {
    const blockedResult = buildOcrGateFailureResult(fileInfo, validation);
    const routeMetadata = {
      ...routeDecision.routeMetadata,
      executedRoute: 'ocr',
      ocrSetupState,
    };
    return {
      routeKind,
      result: blockedResult,
      routeMetadata,
    };
  }

  const paths = resolvePaths();
  const ocrResult = await runGoogleDriveOcrRoute({
    filePath: fileInfo.filePath,
    credentialsPath: paths.credentialsPath,
    tokenPath: paths.tokenPath,
    ocrLanguage,
    logger: log,
    isAborted: () => !controller.isActive(),
  });

  const routeMetadata = {
    ...routeDecision.routeMetadata,
    executedRoute: 'ocr',
    ocrSetupState: 'ready',
  };

  return {
    routeKind,
    result: ocrResult,
    routeMetadata,
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
      let routeDecision = fileInfo.sourceFileKind === 'pdf'
        ? await triagePdfRoutes({
          fileInfo,
          resolvePaths,
          routePreference: request.routePreference,
        })
        : resolveNonPdfRouteDecision(fileInfo);

      if (routeDecision.requiresRouteChoice) {
        return {
          ok: true,
          requiresRouteChoice: true,
          routeMetadata: routeDecision.routeMetadata,
          routeChoiceOptions: ['native', 'ocr'],
          primaryAlertKey: 'renderer.alerts.import_extract_route_choice_required',
          warningAlertKeys: [],
        };
      }

      const enterTransition = controller.enter({
        source: 'import_extract_execution',
        reason: fileInfo.sourceFileKind === 'pdf' ? 'run_pdf_route' : 'run_route',
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
          routeDecision,
          fileInfo,
          ocrLanguage: request.ocrLanguage,
          resolvePaths,
          controller,
        });
      } catch (err) {
        log.error('import/extract execution failed unexpectedly:', err);
        const routeKindFallback = routeDecision && routeDecision.routeKind ? routeDecision.routeKind : 'native';
        if (routeKindFallback === 'native'
          && (!routeDecision || (routeDecision.routeKind !== 'native' && routeDecision.routeKind !== 'ocr'))) {
          log.warn('import/extract route fallback applied:', {
            fallbackType: 'execution_error_default_route',
            requestedRoute: request.routePreference || null,
            chosenRoute: routeKindFallback,
            sourceFileKind: fileInfo.sourceFileKind,
            sourceFileExt: fileInfo.sourceFileExt,
          });
        }
        executionResult = {
          routeKind: routeKindFallback,
          result: {
            state: 'failure',
            executedRoute: routeKindFallback,
            text: '',
            warnings: [],
            summary: 'Import/extract route failed due to an unexpected runtime error.',
            provenance: {
              sourceFileName: fileInfo.fileName,
              sourceFileExt: fileInfo.sourceFileExt,
              sourceFileKind: fileInfo.sourceFileKind,
              ocrProvider: routeKindFallback === 'ocr'
                ? 'google_drive_docs_conversion'
                : null,
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
          routeMetadata: routeDecision
            ? {
              ...routeDecision.routeMetadata,
              executedRoute: routeDecision.routeKind,
            }
            : buildRouteMetadata({
              fileInfo,
              availableRoutes: [],
              chosenRoute: null,
              executedRoute: null,
              pdfTriage: fileInfo.sourceFileKind === 'pdf' ? 'ocr_only' : 'not_pdf',
              triageReason: 'route_resolution_failed',
              ocrSetupState: 'failure',
            }),
        };
      } finally {
        if (controller.isActive()) {
          controller.exit({
            source: 'import_extract_execution',
            reason: resolveExitReason(
              executionResult && executionResult.routeKind ? executionResult.routeKind : 'native',
              executionResult ? executionResult.result : null
            ),
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
        pdfTriage: executionResult.routeMetadata ? executionResult.routeMetadata.pdfTriage : 'not_pdf',
        triageReason: executionResult.routeMetadata ? executionResult.routeMetadata.triageReason : '',
        availableRoutes: executionResult.routeMetadata ? executionResult.routeMetadata.availableRoutes : [],
        chosenRoute: executionResult.routeMetadata ? executionResult.routeMetadata.chosenRoute : null,
        executedRoute: executionResult.routeMetadata ? executionResult.routeMetadata.executedRoute : null,
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
        routeMetadata: executionResult.routeMetadata || null,
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
